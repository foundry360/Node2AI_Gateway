import { randomBytes } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { AuditService } from '../audit/service.js';
import type { IdentityStore } from '../identity/store.js';
import type { Application } from '../identity/types.js';
import {
  persistModel,
  persistModelStatus,
  type MutableModelRegistry,
} from '../models/registry.js';
import type { ModelProvider, RegisteredModel } from '../models/types.js';
import type { PolicyStore } from '../policy/store.js';
import type { GatewayConfig } from '../shared/config.js';
import type { PgQueryable } from '../shared/pg.js';

export interface AdminContext {
  config: GatewayConfig;
  identityStore: IdentityStore;
  registry: MutableModelRegistry;
  providers: ModelProvider[];
  audit: AuditService;
  persistence: 'memory' | 'postgres';
  policyStore: PolicyStore;
  db?: PgQueryable;
  checkDatabase?: () => Promise<{ ok: boolean; detail: string }>;
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

  app.patch('/v1/admin/policies/:policyId', async (request, reply) => {
    if (!(await requireAdmin(request.headers.authorization))) {
      return reply.status(401).send({ status: 'blocked', reason_code: 'UNAUTHENTICATED' });
    }
    const { policyId } = request.params as { policyId: string };
    const body = (request.body ?? {}) as Record<string, unknown>;
    try {
      if (body.status === 'active' || body.status === 'disabled') {
        const updated = await ctx.policyStore.setStatus(policyId, body.status);
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
        })),
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
      note: 'AI execution remains solely via POST /v1/ai/completions',
    };
  });
}
