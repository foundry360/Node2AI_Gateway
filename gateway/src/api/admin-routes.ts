import { randomBytes } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { AuditService } from '../audit/service.js';
import type { IntegrityAuditService } from '../audit/integrity-service.js';
import type { IdentityStore } from '../identity/store.js';
import type { Application } from '../identity/types.js';
import {
  persistModel,
  persistModelStatus,
  type MutableModelRegistry,
} from '../models/registry.js';
import type { ModelProvider, RegisteredModel } from '../models/types.js';
import type { PolicyStore } from '../policy/store.js';
import type { PolicyRepository } from '../policy/enterprise/pg-repository.js';
import type { PackBackedEnterprisePdp } from '../policy/enterprise/pack-pdp.js';
import {
  BASELINE_POLICY_TESTS,
  runPolicyTests,
  simulatePolicy,
  validatePolicyVersion,
  type PolicyTestFixture,
} from '../policy/enterprise/lifecycle.js';
import { getPolicyDefinition } from '../policy/enterprise/packs/definitions.js';
import type { GatewayConfig } from '../shared/config.js';
import type { DatabaseHealth } from '../shared/db-health.js';
import type { PgQueryable } from '../shared/pg.js';

function enrichPolicyMeta<T extends { policy_id: string; interpreter: string }>(meta: T) {
  const def = getPolicyDefinition(meta.policy_id, meta.interpreter);
  if (!def) return meta;
  return {
    ...meta,
    description: def.description,
    owner: def.owner,
    priority: def.priority,
    scope_tier: def.scope_tier,
    domain: def.domain,
  };
}

export interface AdminContext {
  config: GatewayConfig;
  identityStore: IdentityStore;
  registry: MutableModelRegistry;
  providers: ModelProvider[];
  audit: AuditService;
  persistence: 'memory' | 'postgres';
  policyStore: PolicyStore;
  /** Enigma EPA repository (M3+). */
  policyRepository?: PolicyRepository;
  /** Pack-backed PDP for simulate/validate (M3+). */
  packPdp?: PackBackedEnterprisePdp;
  db?: PgQueryable;
  checkDatabase?: () => Promise<DatabaseHealth>;
  checkLocalRuntime?: () => Promise<{
    mode: string;
    active_runtime: string;
    available: boolean;
    airgap: boolean;
  }>;
}

function extractBearer(header: string | undefined): string | undefined {
  if (!header) return undefined;
  const [scheme, token] = header.split(/\s+/);
  if (!scheme || !token) return undefined;
  if (scheme.toLowerCase() !== 'bearer') return undefined;
  return token;
}

function parseCsv(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String).map((s) => s.trim()).filter(Boolean);
  if (typeof value === 'string') {
    return value
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [];
}

export function registerAdminRoutes(
  app: FastifyInstance,
  ctx: AdminContext,
): void {
  const requireAdmin = async (authorization: string | undefined) => {
    const key = extractBearer(authorization);
    if (!key || key !== ctx.config.adminApiKey) {
      return false;
    }
    return true;
  };

  const requireApprover = async (authorization: string | undefined) => {
    const key = extractBearer(authorization);
    return !!key && key === ctx.config.policyApproverKey;
  };

  const requireActivator = async (authorization: string | undefined) => {
    const key = extractBearer(authorization);
    return !!key && key === ctx.config.policyActivatorKey;
  };

  app.get('/v1/admin/overview', async (request, reply) => {
    if (!(await requireAdmin(request.headers.authorization))) {
      return reply.status(401).send({ status: 'blocked', reason_code: 'UNAUTHENTICATED' });
    }

    const [events, applications, users, policies] = await Promise.all([
      ctx.audit.list(),
      ctx.identityStore.listApplications(),
      ctx.identityStore.listUsers(),
      ctx.policyStore.listLatest(),
    ]);
    const recent = [...events].reverse().slice(0, 25);
    const blocked = recent.filter(
      (e) => e.response_decision === 'BLOCK' || e.policy_decision === 'BLOCK',
    );
    const db = ctx.checkDatabase
      ? await ctx.checkDatabase()
      : {
          ok: ctx.persistence === 'memory',
          detail: ctx.persistence === 'postgres' ? 'unchecked' : 'not_configured',
        };
    const localRuntime = ctx.checkLocalRuntime
      ? await ctx.checkLocalRuntime()
      : { mode: 'stub', active_runtime: 'stub-local', available: true, airgap: false };

    return {
      gateway: { status: 'ok', mode: ctx.config.deploymentMode },
      policy: {
        status: 'ready',
        active_policies: policies.filter((p) => p.status === 'active').length,
      },
      models: {
        status: localRuntime.available ? 'ready' : 'degraded',
        active: ctx.registry.listActive().length,
        providers: ctx.providers.map((p) => ({ id: p.providerId, kind: p.kind })),
        local_runtime: localRuntime,
      },
      database: db,
      persistence: ctx.persistence,
      security_events: blocked.length,
      recent_blocked: blocked.slice(0, 10).map((e) => ({
        request_id: e.request_id,
        timestamp: e.timestamp,
        reason_codes: e.reason_codes,
        application_id: e.application_id,
        response_decision: e.response_decision,
        policy_decision: e.policy_decision,
      })),
      totals: {
        audit_events: events.length,
        applications: applications.length,
        users: users.length,
      },
    };
  });

  app.get('/v1/admin/applications', async (request, reply) => {
    if (!(await requireAdmin(request.headers.authorization))) {
      return reply.status(401).send({ status: 'blocked', reason_code: 'UNAUTHENTICATED' });
    }
    const applications = await ctx.identityStore.listApplications();
    return {
      applications: applications.map((a) => ({
        application_id: a.application_id,
        organization_id: a.organization_id,
        name: a.name,
        type: a.type,
        environment: a.environment,
        status: a.status,
        trust_level: a.trust_level,
        allowed_models: a.allowed_models,
        allowed_datasets: a.allowed_datasets,
        allowed_operations: a.allowed_operations,
      })),
    };
  });

  app.post('/v1/admin/applications', async (request, reply) => {
    if (!(await requireAdmin(request.headers.authorization))) {
      return reply.status(401).send({ status: 'blocked', reason_code: 'UNAUTHENTICATED' });
    }
    const body = (request.body ?? {}) as Record<string, unknown>;
    const orgs = await ctx.identityStore.listOrganizations();
    const organization_id =
      String(body.organization_id ?? '') || orgs[0]?.organization_id || 'org_demo';
    const application_id =
      String(body.application_id ?? '') || `app_${randomBytes(4).toString('hex')}`;
    const appRecord: Application = {
      application_id,
      organization_id,
      name: String(body.name ?? 'New Application'),
      type: String(body.type ?? 'custom'),
      environment: (String(body.environment ?? 'prod') as Application['environment']) || 'prod',
      status: 'active',
      trust_level: (String(body.trust_level ?? 'standard') as Application['trust_level']) || 'standard',
      allowed_models: parseCsv(body.allowed_models).length
        ? parseCsv(body.allowed_models)
        : ['local-general-v1'],
      allowed_datasets: parseCsv(body.allowed_datasets),
      allowed_operations: parseCsv(body.allowed_operations).length
        ? parseCsv(body.allowed_operations)
        : ['summarize', 'generate'],
    };
    try {
      const created = await ctx.identityStore.createApplication(appRecord);
      return reply.status(201).send({ application: created });
    } catch (err) {
      return reply.status(400).send({
        status: 'error',
        message: err instanceof Error ? err.message : 'create failed',
      });
    }
  });

  app.patch('/v1/admin/applications/:applicationId', async (request, reply) => {
    if (!(await requireAdmin(request.headers.authorization))) {
      return reply.status(401).send({ status: 'blocked', reason_code: 'UNAUTHENTICATED' });
    }
    const { applicationId } = request.params as { applicationId: string };
    const body = (request.body ?? {}) as Record<string, unknown>;
    const patch: Record<string, unknown> = {};
    for (const key of [
      'name',
      'type',
      'environment',
      'status',
      'trust_level',
    ] as const) {
      if (body[key] !== undefined) patch[key] = body[key];
    }
    if (body.allowed_models !== undefined) patch.allowed_models = parseCsv(body.allowed_models);
    if (body.allowed_datasets !== undefined) {
      patch.allowed_datasets = parseCsv(body.allowed_datasets);
    }
    if (body.allowed_operations !== undefined) {
      patch.allowed_operations = parseCsv(body.allowed_operations);
    }
    try {
      const updated = await ctx.identityStore.updateApplication(
        applicationId,
        patch as Parameters<IdentityStore['updateApplication']>[1],
      );
      return { application: updated };
    } catch (err) {
      return reply.status(404).send({
        status: 'error',
        message: err instanceof Error ? err.message : 'update failed',
      });
    }
  });

  app.get('/v1/admin/api-keys', async (request, reply) => {
    if (!(await requireAdmin(request.headers.authorization))) {
      return reply.status(401).send({ status: 'blocked', reason_code: 'UNAUTHENTICATED' });
    }
    const q = request.query as { application_id?: string };
    const keys = await ctx.identityStore.listApiKeys(q.application_id);
    return {
      api_keys: keys.map((k) => ({
        api_key_id: k.api_key_id,
        organization_id: k.organization_id,
        application_id: k.application_id,
        key_prefix: k.key_prefix,
        status: k.status,
      })),
    };
  });

  app.post('/v1/admin/api-keys', async (request, reply) => {
    if (!(await requireAdmin(request.headers.authorization))) {
      return reply.status(401).send({ status: 'blocked', reason_code: 'UNAUTHENTICATED' });
    }
    const body = (request.body ?? {}) as Record<string, unknown>;
    const application_id = String(body.application_id ?? '');
    if (!application_id) {
      return reply.status(400).send({ status: 'error', message: 'application_id required' });
    }
    const appRecord = await ctx.identityStore.getApplication(application_id);
    if (!appRecord) {
      return reply.status(404).send({ status: 'error', message: 'application not found' });
    }
    const issued = await ctx.identityStore.issueApiKey({
      organization_id: appRecord.organization_id,
      application_id,
    });
    return reply.status(201).send({
      api_key: {
        api_key_id: issued.record.api_key_id,
        application_id: issued.record.application_id,
        key_prefix: issued.record.key_prefix,
        status: issued.record.status,
      },
      secret: issued.secret,
      note: 'Store this secret now — it will not be shown again.',
    });
  });

  app.post('/v1/admin/api-keys/:apiKeyId/revoke', async (request, reply) => {
    if (!(await requireAdmin(request.headers.authorization))) {
      return reply.status(401).send({ status: 'blocked', reason_code: 'UNAUTHENTICATED' });
    }
    const { apiKeyId } = request.params as { apiKeyId: string };
    try {
      const revoked = await ctx.identityStore.revokeApiKey(apiKeyId);
      return {
        api_key: {
          api_key_id: revoked.api_key_id,
          status: revoked.status,
        },
      };
    } catch (err) {
      return reply.status(404).send({
        status: 'error',
        message: err instanceof Error ? err.message : 'revoke failed',
      });
    }
  });

  app.get('/v1/admin/policies', async (request, reply) => {
    if (!(await requireAdmin(request.headers.authorization))) {
      return reply.status(401).send({ status: 'blocked', reason_code: 'UNAUTHENTICATED' });
    }
    const policies = await ctx.policyStore.listLatest();
    return {
      policies: policies.map((p) => ({
        policy_id: p.policy_id,
        organization_id: p.organization_id,
        name: p.name,
        status: p.status,
        version: p.version,
        summary: typeof p.rules.summary === 'string' ? p.rules.summary : '',
        rules: p.rules,
      })),
    };
  });

  app.get('/v1/admin/policies/:policyId/evaluations', async (request, reply) => {
    if (!(await requireAdmin(request.headers.authorization))) {
      return reply.status(401).send({ status: 'blocked', reason_code: 'UNAUTHENTICATED' });
    }
    const { policyId } = request.params as { policyId: string };
    const events = await ctx.audit.list();
    const evaluations = events
      .filter((e) => (e.policy_ids ?? []).includes(policyId))
      .reverse()
      .slice(0, 50)
      .map((e) => ({
        audit_id: e.audit_id,
        timestamp: e.timestamp,
        request_id: e.request_id,
        application_id: e.application_id,
        operation: e.operation,
        policy_decision: e.policy_decision,
        response_decision: e.response_decision,
        reason_codes: e.reason_codes,
        data_classification: e.data_classification,
      }));
    return { policy_id: policyId, evaluations };
  });

  app.get('/v1/admin/policies/:policyId', async (request, reply) => {
    if (!(await requireAdmin(request.headers.authorization))) {
      return reply.status(401).send({ status: 'blocked', reason_code: 'UNAUTHENTICATED' });
    }
    if (!ctx.policyRepository) {
      return reply.status(503).send({
        status: 'error',
        message: 'EPA policy repository unavailable',
      });
    }
    const { policyId } = request.params as { policyId: string };
    const meta = ctx.policyRepository.getPolicy(policyId);
    if (!meta) {
      return reply.status(404).send({ status: 'error', message: 'policy not found in EPA' });
    }
    const snap = ctx.policyRepository.getSnapshot();
    const pack = snap.packs.find((p) => p.pack_id === meta.pack_id) ?? null;
    const definition = getPolicyDefinition(meta.policy_id, meta.interpreter);
    const store = await ctx.policyStore.get(policyId);
    const allStore = await ctx.policyStore.list();
    const versions: Array<{
      policy_id: string;
      version: number;
      status: string;
      created_at: string | null;
      created_by: string | null;
      source: 'legacy_store' | 'epa';
    }> = allStore
      .filter((p) => p.policy_id === policyId || p.name === meta.name)
      .map((p) => ({
        policy_id: p.policy_id,
        version: p.version,
        status: p.status as string,
        created_at: p.created_at ?? null,
        created_by: p.created_by ?? null,
        source: 'legacy_store' as const,
      }));
    if (!versions.some((v) => v.version === meta.version)) {
      versions.unshift({
        policy_id: meta.policy_id,
        version: meta.version,
        status: meta.status,
        created_at: null,
        created_by: null,
        source: 'epa',
      });
    }
    return {
      policy: enrichPolicyMeta(meta),
      pack,
      definition,
      store: store
        ? {
            policy_id: store.policy_id,
            organization_id: store.organization_id,
            name: store.name,
            status: store.status,
            version: store.version,
            summary: typeof store.rules.summary === 'string' ? store.rules.summary : '',
            rules: store.rules,
          }
        : null,
      versions: versions.sort((a, b) => b.version - a.version),
      engine_mode: ctx.config.policyEngineMode,
    };
  });

  app.patch('/v1/admin/policies/:policyId', async (request, reply) => {
    if (!(await requireAdmin(request.headers.authorization))) {
      return reply.status(401).send({ status: 'blocked', reason_code: 'UNAUTHENTICATED' });
    }
    const { policyId } = request.params as { policyId: string };
    const body = (request.body ?? {}) as Record<string, unknown>;
    try {
      if (body.status === 'active' || body.status === 'disabled') {
        const updated = await ctx.policyStore.setStatus(policyId, body.status);
        if (ctx.policyRepository) {
          ctx.policyRepository.setPolicyStatus(
            policyId,
            body.status === 'disabled' ? 'suspended' : 'active',
          );
        }
        return { policy: updated };
      }
      if (body.rules && typeof body.rules === 'object') {
        const current = await ctx.policyStore.get(policyId);
        if (!current) {
          return reply.status(404).send({ status: 'error', message: 'policy not found' });
        }
        const created = await ctx.policyStore.createVersion({
          policy_id: `pol_${randomBytes(4).toString('hex')}`,
          organization_id: current.organization_id,
          name: current.name,
          rules: body.rules as Record<string, unknown>,
          status: current.status,
          created_by: 'admin',
        });
        return reply.status(201).send({ policy: created });
      }
      return reply.status(400).send({ status: 'error', message: 'status or rules required' });
    } catch (err) {
      return reply.status(400).send({
        status: 'error',
        message: err instanceof Error ? err.message : 'update failed',
      });
    }
  });

  app.get('/v1/admin/policy-packs', async (request, reply) => {
    if (!(await requireAdmin(request.headers.authorization))) {
      return reply.status(401).send({ status: 'blocked', reason_code: 'UNAUTHENTICATED' });
    }
    if (!ctx.policyRepository) {
      return reply.status(503).send({
        status: 'error',
        message: 'EPA policy repository unavailable',
      });
    }
    const snap = ctx.policyRepository.getSnapshot();
    return {
      packs: snap.packs,
      policies: snap.policies.map((p) => ({
        ...enrichPolicyMeta(p),
        definition: getPolicyDefinition(p.policy_id, p.interpreter),
      })),
      engine_mode: ctx.config.policyEngineMode,
    };
  });

  app.post('/v1/admin/policies/:policyId/validate', async (request, reply) => {
    if (!(await requireAdmin(request.headers.authorization))) {
      return reply.status(401).send({ status: 'blocked', reason_code: 'UNAUTHENTICATED' });
    }
    if (!ctx.policyRepository) {
      return reply.status(503).send({ status: 'error', message: 'EPA repository unavailable' });
    }
    const { policyId } = request.params as { policyId: string };
    const meta = ctx.policyRepository.getPolicy(policyId);
    const validation = validatePolicyVersion(meta);
    return {
      policy_id: policyId,
      ...validation,
      meta: meta ?? null,
    };
  });

  app.post('/v1/admin/policies/:policyId/simulate', async (request, reply) => {
    if (!(await requireAdmin(request.headers.authorization))) {
      return reply.status(401).send({ status: 'blocked', reason_code: 'UNAUTHENTICATED' });
    }
    if (!ctx.packPdp) {
      return reply.status(503).send({ status: 'error', message: 'EPA PDP unavailable' });
    }
    const body = (request.body ?? {}) as PolicyTestFixture;
    const decision = await simulatePolicy(ctx.packPdp, body);
    return {
      simulation: true,
      model_executed: false,
      decision,
    };
  });

  app.post('/v1/admin/policy/simulate', async (request, reply) => {
    if (!(await requireAdmin(request.headers.authorization))) {
      return reply.status(401).send({ status: 'blocked', reason_code: 'UNAUTHENTICATED' });
    }
    if (!ctx.packPdp) {
      return reply.status(503).send({ status: 'error', message: 'EPA PDP unavailable' });
    }
    const body = (request.body ?? {}) as PolicyTestFixture;
    const decision = await simulatePolicy(ctx.packPdp, body);
    return {
      simulation: true,
      model_executed: false,
      decision,
    };
  });

  app.post('/v1/admin/policies/:policyId/approve', async (request, reply) => {
    if (!(await requireApprover(request.headers.authorization))) {
      return reply.status(401).send({ status: 'blocked', reason_code: 'UNAUTHENTICATED' });
    }
    if (!ctx.policyRepository) {
      return reply.status(503).send({ status: 'error', message: 'EPA repository unavailable' });
    }
    const { policyId } = request.params as { policyId: string };
    const meta = ctx.policyRepository.getPolicy(policyId);
    if (!meta) {
      return reply.status(404).send({ status: 'error', message: 'policy not found in EPA' });
    }
    const validation = validatePolicyVersion(meta);
    if (!validation.ok) {
      return reply.status(400).send({
        status: 'error',
        message: 'Validation failed',
        errors: validation.errors,
      });
    }
    const updated = await ctx.policyRepository.setPolicyStatus(policyId, 'approved');
    await ctx.audit.record({
      audit_id: `aud_pol_appr_${randomBytes(6).toString('hex')}`,
      timestamp: new Date().toISOString(),
      user_id: 'approver',
      request_id: `req_pol_appr_${randomBytes(4).toString('hex')}`,
      correlation_id: `cor_pol_appr_${randomBytes(4).toString('hex')}`,
      operation: 'policy_approve',
      data_classification: 'Internal',
      policy_decision: 'ALLOW',
      policy_ids: [policyId],
      response_decision: 'RELEASE',
      reason_codes: ['POLICY_APPROVED'],
      metadata: { version: meta.version, pack_id: meta.pack_id },
    });
    return { status: 'approved', policy: updated };
  });

  app.post('/v1/admin/policies/:policyId/activate', async (request, reply) => {
    if (!(await requireActivator(request.headers.authorization))) {
      return reply.status(401).send({ status: 'blocked', reason_code: 'UNAUTHENTICATED' });
    }
    if (!ctx.policyRepository || !ctx.packPdp) {
      return reply.status(503).send({ status: 'error', message: 'EPA unavailable' });
    }
    const { policyId } = request.params as { policyId: string };
    const meta = ctx.policyRepository.getPolicy(policyId);
    const validation = validatePolicyVersion(meta);
    if (!validation.ok) {
      return reply.status(400).send({
        status: 'error',
        message: 'Validation failed',
        errors: validation.errors,
      });
    }

    if (meta && meta.status !== 'approved' && meta.status !== 'active') {
      return reply.status(400).send({
        status: 'error',
        message: 'Policy must be approved before activation',
        current_status: meta.status,
      });
    }

    // Align stores before tests so evaluation sees an active policy.
    try {
      await ctx.policyStore.setStatus(policyId, 'active');
    } catch {
      // EPA-only policies may not exist in legacy store.
    }
    await ctx.policyRepository.setPolicyStatus(policyId, 'active');

    // Required tests must pass before activation (Baseline input pack).
    if (meta?.interpreter === 'baseline_input_v2') {
      const tests = await runPolicyTests(ctx.packPdp, BASELINE_POLICY_TESTS);
      if (!tests.ok) {
        // Roll back EPA status if tests fail and we were only approved.
        if (meta.status === 'approved') {
          await ctx.policyRepository.setPolicyStatus(policyId, 'approved');
        }
        return reply.status(400).send({
          status: 'error',
          message: 'Required policy tests failed; activation blocked',
          tests,
        });
      }
    }

    const storePolicy = await ctx.policyStore.get(policyId);

    await ctx.audit.record({
      audit_id: `aud_pol_act_${randomBytes(6).toString('hex')}`,
      timestamp: new Date().toISOString(),
      organization_id: storePolicy?.organization_id ?? undefined,
      user_id: 'admin',
      request_id: `req_pol_act_${randomBytes(4).toString('hex')}`,
      correlation_id: `cor_pol_act_${randomBytes(4).toString('hex')}`,
      operation: 'policy_activate',
      data_classification: 'Internal',
      policy_decision: 'ALLOW',
      policy_ids: [policyId],
      response_decision: 'RELEASE',
      reason_codes: ['POLICY_ACTIVATED'],
      metadata: {
        pack_id: meta?.pack_id,
        version: meta?.version,
        engine_mode: ctx.config.policyEngineMode,
      },
    });

    return {
      status: 'activated',
      policy_id: policyId,
      version: meta?.version,
      pack_id: meta?.pack_id,
      store: storePolicy,
    };
  });

  app.post('/v1/admin/policies/:policyId/suspend', async (request, reply) => {
    if (!(await requireAdmin(request.headers.authorization))) {
      return reply.status(401).send({ status: 'blocked', reason_code: 'UNAUTHENTICATED' });
    }
    if (!ctx.policyRepository) {
      return reply.status(503).send({ status: 'error', message: 'EPA repository unavailable' });
    }
    const { policyId } = request.params as { policyId: string };
    const meta = await ctx.policyRepository.setPolicyStatus(policyId, 'suspended');
    if (!meta) {
      return reply.status(404).send({ status: 'error', message: 'policy not found in EPA' });
    }
    try {
      await ctx.policyStore.setStatus(policyId, 'disabled');
    } catch {
      // ignore missing legacy row
    }
    await ctx.audit.record({
      audit_id: `aud_pol_sus_${randomBytes(6).toString('hex')}`,
      timestamp: new Date().toISOString(),
      user_id: 'admin',
      request_id: `req_pol_sus_${randomBytes(4).toString('hex')}`,
      correlation_id: `cor_pol_sus_${randomBytes(4).toString('hex')}`,
      operation: 'policy_suspend',
      data_classification: 'Internal',
      policy_decision: 'ALLOW',
      policy_ids: [policyId],
      response_decision: 'RELEASE',
      reason_codes: ['POLICY_SUSPENDED'],
      metadata: { version: meta.version, pack_id: meta.pack_id },
    });
    return { status: 'suspended', policy: enrichPolicyMeta(meta) };
  });

  app.post('/v1/admin/policies/:policyId/retire', async (request, reply) => {
    if (!(await requireAdmin(request.headers.authorization))) {
      return reply.status(401).send({ status: 'blocked', reason_code: 'UNAUTHENTICATED' });
    }
    if (!ctx.policyRepository) {
      return reply.status(503).send({ status: 'error', message: 'EPA repository unavailable' });
    }
    const { policyId } = request.params as { policyId: string };
    const current = ctx.policyRepository.getPolicy(policyId);
    if (!current) {
      return reply.status(404).send({ status: 'error', message: 'policy not found in EPA' });
    }
    if (current.status === 'active') {
      return reply.status(400).send({
        status: 'error',
        message: 'Suspend the policy before retiring it',
        current_status: current.status,
      });
    }
    const meta = await ctx.policyRepository.setPolicyStatus(policyId, 'retired');
    if (!meta) {
      return reply.status(404).send({ status: 'error', message: 'policy not found in EPA' });
    }
    try {
      await ctx.policyStore.setStatus(policyId, 'disabled');
    } catch {
      // ignore missing legacy row
    }
    await ctx.audit.record({
      audit_id: `aud_pol_ret_${randomBytes(6).toString('hex')}`,
      timestamp: new Date().toISOString(),
      user_id: 'admin',
      request_id: `req_pol_ret_${randomBytes(4).toString('hex')}`,
      correlation_id: `cor_pol_ret_${randomBytes(4).toString('hex')}`,
      operation: 'policy_retire',
      data_classification: 'Internal',
      policy_decision: 'ALLOW',
      policy_ids: [policyId],
      response_decision: 'RELEASE',
      reason_codes: ['POLICY_RETIRED'],
      metadata: { version: meta.version, pack_id: meta.pack_id },
    });
    return { status: 'retired', policy: enrichPolicyMeta(meta) };
  });

  app.get('/v1/admin/models', async (request, reply) => {
    if (!(await requireAdmin(request.headers.authorization))) {
      return reply.status(401).send({ status: 'blocked', reason_code: 'UNAUTHENTICATED' });
    }
    return {
      models: ctx.registry.listAll(),
      providers: ctx.providers.map((p) => ({
        provider_id: p.providerId,
        kind: p.kind,
      })),
    };
  });

  app.post('/v1/admin/models', async (request, reply) => {
    if (!(await requireAdmin(request.headers.authorization))) {
      return reply.status(401).send({ status: 'blocked', reason_code: 'UNAUTHENTICATED' });
    }
    const body = (request.body ?? {}) as Record<string, unknown>;
    const model: RegisteredModel = {
      model_id: String(body.model_id ?? `model_${randomBytes(4).toString('hex')}`),
      provider_id: String(body.provider_id ?? 'local-runtime'),
      name: String(body.name ?? 'Custom model'),
      kind: (String(body.kind ?? 'local') as RegisteredModel['kind']) || 'local',
      status: body.status === 'disabled' ? 'disabled' : 'active',
    };
    if (ctx.config.deploymentMode === 'airgap' && model.kind !== 'local') {
      return reply.status(400).send({
        status: 'error',
        message: 'Air-gap mode only allows local models',
      });
    }
    ctx.registry.upsert(model);
    if (ctx.db) {
      await persistModel(ctx.db, model);
    }
    return reply.status(201).send({ model });
  });

  app.patch('/v1/admin/models/:modelId', async (request, reply) => {
    if (!(await requireAdmin(request.headers.authorization))) {
      return reply.status(401).send({ status: 'blocked', reason_code: 'UNAUTHENTICATED' });
    }
    const { modelId } = request.params as { modelId: string };
    const body = (request.body ?? {}) as Record<string, unknown>;
    try {
      if (body.status === 'active' || body.status === 'disabled') {
        ctx.registry.setStatus(modelId, body.status);
        if (ctx.db) await persistModelStatus(ctx.db, modelId, body.status);
      }
      const model = ctx.registry.get(modelId);
      if (!model) {
        return reply.status(404).send({ status: 'error', message: 'model not found' });
      }
      if (body.name || body.provider_id || body.kind) {
        const next: RegisteredModel = {
          ...model,
          name: body.name ? String(body.name) : model.name,
          provider_id: body.provider_id ? String(body.provider_id) : model.provider_id,
          kind: body.kind ? (String(body.kind) as RegisteredModel['kind']) : model.kind,
        };
        ctx.registry.upsert(next);
        if (ctx.db) await persistModel(ctx.db, next);
        return { model: next };
      }
      return { model };
    } catch (err) {
      return reply.status(404).send({
        status: 'error',
        message: err instanceof Error ? err.message : 'update failed',
      });
    }
  });

  app.get('/v1/admin/audit', async (request, reply) => {
    if (!(await requireAdmin(request.headers.authorization))) {
      return reply.status(401).send({ status: 'blocked', reason_code: 'UNAUTHENTICATED' });
    }
    const events = await ctx.audit.list();
    const limit = Number((request.query as { limit?: string }).limit ?? 100);
    return {
      events: [...events]
        .reverse()
        .slice(0, Math.min(limit, 500))
        .map((e) => ({
          audit_id: e.audit_id,
          timestamp: e.timestamp,
          request_id: e.request_id,
          correlation_id: e.correlation_id,
          organization_id: e.organization_id,
          application_id: e.application_id,
          user_id: e.user_id,
          operation: e.operation,
          data_classification: e.data_classification,
          policy_decision: e.policy_decision,
          response_decision: e.response_decision,
          model_selected: e.model_selected,
          provider: e.provider,
          input_transformation: e.input_transformation,
          response_transformation: e.response_transformation,
          reason_codes: e.reason_codes,
          latency_ms: e.latency_ms,
          response_hash: e.response_hash,
          event_hash: e.event_hash,
          prev_event_hash: e.prev_event_hash,
          integrity_signature: e.integrity_signature
            ? `${e.integrity_signature.slice(0, 12)}…`
            : undefined,
        })),
    };
  });

  app.get('/v1/admin/audit/integrity', async (request, reply) => {
    if (!(await requireAdmin(request.headers.authorization))) {
      return reply.status(401).send({ status: 'blocked', reason_code: 'UNAUTHENTICATED' });
    }
    const audit = ctx.audit as IntegrityAuditService;
    if (typeof audit.verifyIntegrity !== 'function') {
      return reply.status(503).send({
        status: 'error',
        message: 'Integrity audit service not configured',
      });
    }
    const result = await audit.verifyIntegrity();
    return {
      integrity: result,
      note: 'Hash-chained HMAC-signed audit. Response bodies are not stored — only response_hash.',
    };
  });

  app.get('/v1/admin/system', async (request, reply) => {
    if (!(await requireAdmin(request.headers.authorization))) {
      return reply.status(401).send({ status: 'blocked', reason_code: 'UNAUTHENTICATED' });
    }
    const db = ctx.checkDatabase
      ? await ctx.checkDatabase()
      : { ok: false, detail: 'not_configured' };
    const organizations = await ctx.identityStore.listOrganizations();
    const localRuntime = ctx.checkLocalRuntime
      ? await ctx.checkLocalRuntime()
      : undefined;

    return {
      deployment_mode: ctx.config.deploymentMode,
      host: ctx.config.host,
      port: ctx.config.port,
      persistence: ctx.persistence,
      ollama_base_url: ctx.config.ollamaBaseUrl,
      ollama_model: ctx.config.ollamaModelName,
      local_runtime: localRuntime,
      external_provider_base_url:
        ctx.config.deploymentMode === 'airgap'
          ? 'disabled'
          : ctx.config.externalProviderBaseUrl,
      airgap: {
        enabled: ctx.config.deploymentMode === 'airgap',
        external_providers:
          ctx.config.deploymentMode === 'airgap' ? 'omitted' : 'allowed',
        local_models_only: ctx.config.deploymentMode === 'airgap',
        require_ollama: ctx.config.deploymentMode === 'airgap',
      },
      database: db,
      cors_origins: ctx.config.corsOrigins,
      organizations: organizations.map((o) => ({
        organization_id: o.organization_id,
        name: o.name,
        status: o.status,
      })),
    };
  });
}
