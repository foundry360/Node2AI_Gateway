import { randomBytes, randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { AuditService } from '../audit/service.js';
import type { IntegrityAuditService } from '../audit/integrity-service.js';
import type { IdentityStore } from '../identity/store.js';
import type { Application } from '../identity/types.js';
import { isApplicationType, parseApplicationType } from '../identity/types.js';
import {
  persistModel,
  persistModelStatus,
  type MutableModelRegistry,
} from '../models/registry.js';
import type { LocalModelRuntime, ModelProvider, RegisteredModel } from '../models/types.js';
import type { ProviderCredentialStore } from '../models/provider-credentials.js';
import {
  parseModelMapField,
  parseProviderKind,
} from '../models/provider-credentials.js';
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
import {
  buildHeuristicActionItems,
  parseActionItemsJson,
  type ActionItemFacts,
} from '../admin/action-items.js';
import {
  aggregateRiskCounts,
  classifyApplicationHeuristic,
  parseRiskClassificationJson,
  type AppRiskInput,
} from '../admin/risk-classification.js';
import {
  PRIORITY_FRAMEWORKS,
  overallComplianceScore,
  parseComplianceJson,
  scoreFrameworkHeuristic,
} from '../admin/compliance-score.js';
import { filterEventsByDays, parseDaysQuery } from '../admin/time-window.js';
import type { GatewayConfig } from '../shared/config.js';
import type { DatabaseHealth } from '../shared/db-health.js';
import type { PgQueryable } from '../shared/pg.js';

/** Insights: keep LLM responses short and abandon slow CPU inference. */
const INSIGHT_LLM_TIMEOUT_MS = 20_000;
const INSIGHT_NUM_PREDICT = 220;

function wantsInsightLlm(query: unknown): boolean {
  const llm = (query as { llm?: string } | undefined)?.llm;
  return !(llm === '0' || llm === 'false');
}

function insightLlmSignal(): AbortSignal {
  return AbortSignal.timeout(INSIGHT_LLM_TIMEOUT_MS);
}

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
  /** Live Gateway orchestrator — post-AUTHORIZE resume only. */
  orchestrator?: import('./orchestrator.js').GatewayOrchestrator;
  db?: PgQueryable;
  checkDatabase?: () => Promise<DatabaseHealth>;
  checkLocalRuntime?: () => Promise<{
    mode: string;
    active_runtime: string;
    available: boolean;
    airgap: boolean;
  }>;
  /** On-appliance inference used for console insights (not the public completions path). */
  localRuntime?: LocalModelRuntime;
  /** Customer BYOK model provider credentials (per application). */
  providerCredentials?: ProviderCredentialStore;
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

type ActivityAuditEvent = {
  timestamp: string;
  policy_decision?: string;
  response_decision?: string;
  input_transformation?: string;
  reason_codes?: string[];
};

/** Hourly buckets for Requests / Allowed / Blocked / Tokenize over a rolling window. */
function buildRollingActivitySeries(
  events: ActivityAuditEvent[],
  nowMs: number,
  hours: number,
) {
  const endHour = new Date(nowMs);
  endHour.setMinutes(0, 0, 0);
  const bucketStarts: number[] = [];
  for (let i = hours - 1; i >= 0; i -= 1) {
    bucketStarts.push(endHour.getTime() - i * 60 * 60 * 1000);
  }

  const isBlocked = (e: ActivityAuditEvent) =>
    e.response_decision === 'BLOCK' || e.policy_decision === 'BLOCK';
  const isTokenize = (e: ActivityAuditEvent) => {
    const decision = (e.policy_decision ?? '').toUpperCase();
    const transform = (e.input_transformation ?? '').toLowerCase();
    const reasons = (e.reason_codes ?? []).map((c) => c.toUpperCase());
    return (
      decision === 'TOKENIZE' ||
      transform.includes('token') ||
      reasons.some((c) => c.includes('TOKENIZE'))
    );
  };
  const isAllowed = (e: ActivityAuditEvent) =>
    !isBlocked(e) &&
    ((e.policy_decision ?? '').toUpperCase() === 'ALLOW' ||
      e.response_decision === 'RELEASE' ||
      e.response_decision === 'ALLOW');

  const bucketize = (predicate: (e: ActivityAuditEvent) => boolean) =>
    bucketStarts.map((startMs, idx) => {
      const endMs =
        idx === bucketStarts.length - 1 ? nowMs : bucketStarts[idx + 1]!;
      const count = events.filter((e) => {
        const t = Date.parse(e.timestamp);
        return t >= startMs && t < endMs && predicate(e);
      }).length;
      return {
        start: new Date(startMs).toISOString(),
        end: new Date(endMs).toISOString(),
        label: new Date(startMs).toLocaleTimeString([], {
          hour: 'numeric',
          minute: '2-digit',
        }),
        value: count,
      };
    });

  const seriesOf = (predicate: (e: ActivityAuditEvent) => boolean) => {
    const buckets = bucketize(predicate);
    return {
      total: buckets.reduce((sum, b) => sum + b.value, 0),
      buckets,
    };
  };

  return {
    requests: seriesOf(() => true),
    allowed: seriesOf(isAllowed),
    blocked: seriesOf(isBlocked),
    tokenize: seriesOf(isTokenize),
  };
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

    const days = parseDaysQuery(request.query);
    const [events, applications, users, policies] = await Promise.all([
      ctx.audit.list(),
      ctx.identityStore.listApplications(),
      ctx.identityStore.listUsers(),
      ctx.policyStore.listLatest(),
    ]);
    const inWindow = filterEventsByDays(events, days);
    const blocked = [...inWindow]
      .reverse()
      .filter((e) => e.response_decision === 'BLOCK' || e.policy_decision === 'BLOCK');
    const appNameById = new Map(
      applications.map((a) => [a.application_id, a.name] as const),
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

    const activePolicies = ctx.policyRepository
      ? ctx.policyRepository.getSnapshot().policies.filter((p) => p.status === 'active')
          .length
      : policies.filter((p) => p.status === 'active').length;

    return {
      gateway: { status: 'ok', mode: ctx.config.deploymentMode },
      policy: {
        status: 'ready',
        active_policies: activePolicies,
      },
      models: {
        status: localRuntime.available ? 'ready' : 'degraded',
        active: ctx.registry.listActive().length,
        providers: ctx.providers.map((p) => ({ id: p.providerId, kind: p.kind })),
        local_runtime: localRuntime,
      },
      database: db,
      persistence: ctx.persistence,
      days,
      security_events: blocked.length,
      recent_blocked: blocked.slice(0, 50).map((e) => ({
        request_id: e.request_id,
        timestamp: e.timestamp,
        reason_codes: e.reason_codes,
        application_id: e.application_id,
        application_name: e.application_id
          ? appNameById.get(e.application_id)
          : undefined,
        response_decision: e.response_decision,
        policy_decision: e.policy_decision,
      })),
      totals: {
        audit_events: inWindow.length,
        applications: applications.length,
        users: users.length,
      },
    };
  });

  app.get('/v1/admin/applications', async (request, reply) => {
    if (!(await requireAdmin(request.headers.authorization))) {
      return reply.status(401).send({ status: 'blocked', reason_code: 'UNAUTHENTICATED' });
    }
    try {
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
    } catch (err) {
      const code =
        err && typeof err === 'object' && 'code' in err
          ? String((err as { code: unknown }).code)
          : '';
      if (code === 'ECONNREFUSED' || code === 'ENOTFOUND' || code === '57P01') {
        return reply.status(503).send({
          status: 'error',
          reason_code: 'DATABASE_UNAVAILABLE',
          message:
            'Identity store database is unreachable. Start Postgres (docker compose up -d postgres) or run the gateway without DATABASE_URL for memory mode.',
        });
      }
      throw err;
    }
  });

  app.get('/v1/admin/applications/:applicationId/activity', async (request, reply) => {
    if (!(await requireAdmin(request.headers.authorization))) {
      return reply.status(401).send({ status: 'blocked', reason_code: 'UNAUTHENTICATED' });
    }
    const { applicationId } = request.params as { applicationId: string };
    const appRecord = await ctx.identityStore.getApplication(applicationId);
    if (!appRecord) {
      return reply.status(404).send({ status: 'error', message: 'application not found' });
    }

    const hours = 24;
    const now = Date.now();
    const windowStart = now - hours * 60 * 60 * 1000;
    const events = (await ctx.audit.list()).filter((e) => {
      if (e.application_id !== applicationId) return false;
      const t = Date.parse(e.timestamp);
      return Number.isFinite(t) && t >= windowStart;
    });

    return {
      application_id: applicationId,
      window_hours: hours,
      generated_at: new Date(now).toISOString(),
      series: buildRollingActivitySeries(events, now, hours),
    };
  });

  /** Org-wide rolling activity (all applications) for Authority Console sparklines. */
  app.get('/v1/admin/activity', async (request, reply) => {
    if (!(await requireAdmin(request.headers.authorization))) {
      return reply.status(401).send({ status: 'blocked', reason_code: 'UNAUTHENTICATED' });
    }
    const hours = 24;
    const now = Date.now();
    const windowStart = now - hours * 60 * 60 * 1000;
    const events = (await ctx.audit.list()).filter((e) => {
      const t = Date.parse(e.timestamp);
      return Number.isFinite(t) && t >= windowStart;
    });

    return {
      window_hours: hours,
      generated_at: new Date(now).toISOString(),
      series: buildRollingActivitySeries(events, now, hours),
    };
  });

  app.post('/v1/admin/applications', async (request, reply) => {
    if (!(await requireAdmin(request.headers.authorization))) {
      return reply.status(401).send({ status: 'blocked', reason_code: 'UNAUTHENTICATED' });
    }
    const body = (request.body ?? {}) as Record<string, unknown>;
    if (body.type !== undefined && !isApplicationType(body.type)) {
      return reply.status(400).send({
        status: 'error',
        message: 'type must be one of: clinical, financial, customer, internal, custom',
      });
    }
    const orgs = await ctx.identityStore.listOrganizations();
    const organization_id =
      String(body.organization_id ?? '') || orgs[0]?.organization_id || 'org_demo';
    const application_id =
      String(body.application_id ?? '') || `app_${randomBytes(4).toString('hex')}`;
    const appRecord: Application = {
      application_id,
      organization_id,
      name: String(body.name ?? 'New Application'),
      type: parseApplicationType(body.type, 'custom'),
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
      let provider_credential = null;
      const providerApiKey = String(body.provider_api_key ?? '').trim();
      if (providerApiKey && ctx.providerCredentials) {
        const endpoint =
          String(body.provider_endpoint_url ?? '').trim() ||
          ctx.config.externalProviderBaseUrl;
        provider_credential = await ctx.providerCredentials.upsert({
          application_id: created.application_id,
          organization_id: created.organization_id,
          provider_kind: parseProviderKind(body.provider_kind),
          endpoint_url: endpoint,
          api_key: providerApiKey,
          model_map: parseModelMapField(body.provider_model_map),
        });
      }
      return reply.status(201).send({ application: created, provider_credential });
    } catch (err) {
      return reply.status(400).send({
        status: 'error',
        message: err instanceof Error ? err.message : 'create failed',
      });
    }
  });

  app.get('/v1/admin/applications/:applicationId/provider-credential', async (request, reply) => {
    if (!(await requireAdmin(request.headers.authorization))) {
      return reply.status(401).send({ status: 'blocked', reason_code: 'UNAUTHENTICATED' });
    }
    if (!ctx.providerCredentials) {
      return reply.status(503).send({
        status: 'error',
        message: 'Provider credential store unavailable',
      });
    }
    const { applicationId } = request.params as { applicationId: string };
    const credential = await ctx.providerCredentials.getPublic(applicationId);
    if (!credential) {
      return { configured: false, provider_credential: null };
    }
    const revealed = await ctx.providerCredentials.revealSecret(applicationId);
    return {
      configured: true,
      provider_credential: {
        ...credential,
        ...(revealed ? { api_key: revealed.api_key } : {}),
      },
    };
  });

  app.put('/v1/admin/applications/:applicationId/provider-credential', async (request, reply) => {
    if (!(await requireAdmin(request.headers.authorization))) {
      return reply.status(401).send({ status: 'blocked', reason_code: 'UNAUTHENTICATED' });
    }
    if (!ctx.providerCredentials) {
      return reply.status(503).send({
        status: 'error',
        message: 'Provider credential store unavailable',
      });
    }
    const { applicationId } = request.params as { applicationId: string };
    const appRow = await ctx.identityStore.getApplication(applicationId);
    if (!appRow) {
      return reply.status(404).send({ status: 'error', message: 'Application not found' });
    }
    const body = (request.body ?? {}) as Record<string, unknown>;
    const apiKey = String(body.api_key ?? body.provider_api_key ?? '').trim();
    if (!apiKey) {
      return reply.status(400).send({ status: 'error', message: 'api_key is required' });
    }
    const endpoint =
      String(body.endpoint_url ?? body.provider_endpoint_url ?? '').trim() ||
      ctx.config.externalProviderBaseUrl;
    try {
      const provider_credential = await ctx.providerCredentials.upsert({
        application_id: applicationId,
        organization_id: appRow.organization_id,
        provider_kind: parseProviderKind(body.provider_kind ?? body.kind),
        endpoint_url: endpoint,
        api_key: apiKey,
        model_map: parseModelMapField(body.model_map ?? body.provider_model_map),
        status:
          String(body.status ?? 'active') === 'disabled' ? 'disabled' : 'active',
      });
      return { configured: true, provider_credential };
    } catch (err) {
      return reply.status(400).send({
        status: 'error',
        message: err instanceof Error ? err.message : 'upsert failed',
      });
    }
  });

  app.delete(
    '/v1/admin/applications/:applicationId/provider-credential',
    async (request, reply) => {
      if (!(await requireAdmin(request.headers.authorization))) {
        return reply.status(401).send({ status: 'blocked', reason_code: 'UNAUTHENTICATED' });
      }
      if (!ctx.providerCredentials) {
        return reply.status(503).send({
          status: 'error',
          message: 'Provider credential store unavailable',
        });
      }
      const { applicationId } = request.params as { applicationId: string };
      await ctx.providerCredentials.delete(applicationId);
      return { configured: false };
    },
  );

  app.patch('/v1/admin/applications/:applicationId', async (request, reply) => {
    if (!(await requireAdmin(request.headers.authorization))) {
      return reply.status(401).send({ status: 'blocked', reason_code: 'UNAUTHENTICATED' });
    }
    const { applicationId } = request.params as { applicationId: string };
    const body = (request.body ?? {}) as Record<string, unknown>;
    if (body.type !== undefined && !isApplicationType(body.type)) {
      return reply.status(400).send({
        status: 'error',
        message: 'type must be one of: clinical, financial, customer, internal, custom',
      });
    }
    const patch: Record<string, unknown> = {};
    for (const key of [
      'name',
      'environment',
      'status',
      'trust_level',
    ] as const) {
      if (body[key] !== undefined) patch[key] = body[key];
    }
    if (body.type !== undefined) {
      patch.type = parseApplicationType(body.type);
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
    if (!ctx.policyRepository?.listEvaluations) {
      return reply.status(503).send({
        status: 'error',
        message: 'EPA evaluation store unavailable',
      });
    }
    const { toEvaluationListItem } = await import(
      '../policy/enterprise/evaluation-query.js'
    );
    const { findAuditForEvaluation } = await import(
      '../policy/enterprise/enforcement-projection.js'
    );
    const records = await Promise.resolve(
      ctx.policyRepository.listEvaluations({ policyId, limit: 50 }),
    );
    const events = await ctx.audit.list();
    return {
      policy_id: policyId,
      source: 'policy_evaluations',
      evaluations: records.map((r) =>
        toEvaluationListItem(r, findAuditForEvaluation(r, events)),
      ),
    };
  });

  app.get('/v1/admin/evaluations', async (request, reply) => {
    if (!(await requireAdmin(request.headers.authorization))) {
      return reply.status(401).send({ status: 'blocked', reason_code: 'UNAUTHENTICATED' });
    }
    if (!ctx.policyRepository?.listEvaluations) {
      return reply.status(503).send({
        status: 'error',
        message: 'EPA evaluation store unavailable',
      });
    }
    const query = request.query as {
      limit?: string;
      filter?: string;
    };
    const limit = Math.min(Number(query.limit ?? 50) || 50, 200);
    const filter = String(query.filter ?? 'all').toLowerCase();
    const { toEvaluationListItem } = await import(
      '../policy/enterprise/evaluation-query.js'
    );
    const { findAuditForEvaluation } = await import(
      '../policy/enterprise/enforcement-projection.js'
    );
    const records = await Promise.resolve(
      ctx.policyRepository.listEvaluations({ limit: Math.max(limit, 100) }),
    );
    const events = await ctx.audit.list();
    const allItems = records.map((r) =>
      toEvaluationListItem(r, findAuditForEvaluation(r, events)),
    );
    let items = allItems;
    if (filter === 'review' || filter === 'pending_review') {
      items = items.filter((e) => e.review_state === 'pending' || e.requires_review);
    } else if (filter === 'resolved') {
      items = items.filter((e) => e.review_state === 'resolved');
    } else if (filter === 'allowed') {
      items = items.filter((e) => {
        const d = (e.final_decision ?? e.decision).toUpperCase();
        return d === 'ALLOW' || d === 'TOKENIZE' || d === 'REDACT' || d === 'TRANSFORM';
      });
    } else if (filter === 'denied') {
      items = items.filter((e) => {
        const d = (e.final_decision ?? e.decision).toUpperCase();
        return d === 'DENY' || d === 'BLOCK' || d === 'BLOCK_OUTPUT';
      });
    } else if (filter === 'conflicts') {
      items = items.filter(
        (e) =>
          e.resolution_category === 'CONFLICT' ||
          e.resolution_category === 'UNRESOLVED',
      );
    } else if (filter === 'controls') {
      items = items.filter((e) => e.controls_applied);
    }
    items = items.slice(0, limit);
    return {
      source: 'policy_evaluations',
      filter,
      evaluations: items,
      attention: {
        review: allItems.filter((e) => e.review_state === 'pending').length,
        pending_review: allItems.filter((e) => e.review_state === 'pending').length,
        resolved: allItems.filter((e) => e.review_state === 'resolved').length,
        denied: allItems.filter((e) => {
          const d = e.decision.toUpperCase();
          return d === 'DENY' || d === 'BLOCK' || d === 'BLOCK_OUTPUT';
        }).length,
        conflicts: allItems.filter(
          (e) =>
            (e.resolution_category === 'CONFLICT' ||
              e.resolution_category === 'UNRESOLVED') &&
            e.review_state === 'pending',
        ).length,
        controls_applied: allItems.filter((e) => e.controls_applied).length,
      },
    };
  });

  app.get('/v1/admin/evaluations/:evaluationId', async (request, reply) => {
    if (!(await requireAdmin(request.headers.authorization))) {
      return reply.status(401).send({ status: 'blocked', reason_code: 'UNAUTHENTICATED' });
    }
    if (!ctx.policyRepository?.getEvaluation) {
      return reply.status(503).send({
        status: 'error',
        message: 'EPA evaluation store unavailable',
      });
    }
    const { evaluationId } = request.params as { evaluationId: string };
    const record = await Promise.resolve(
      ctx.policyRepository.getEvaluation(evaluationId),
    );
    if (!record) {
      return reply.status(404).send({ status: 'error', message: 'evaluation not found' });
    }
    const { evaluationRecordToDecisionPayload, deriveDecisionConsequence, projectRequestContext } =
      await import('../policy/enterprise/evaluation-query.js');
    const { projectEnforcementResult, findAuditForEvaluation } = await import(
      '../policy/enterprise/enforcement-projection.js'
    );
    const { reviewStateForRecord, isEligibleForHumanReview } = await import(
      '../policy/enterprise/decision-resolution.js'
    );
    const decision = evaluationRecordToDecisionPayload(record);
    const review_state = reviewStateForRecord(record);
    const effectiveDecision =
      record.human_resolution?.final_decision ?? record.decision;
    const consequence = deriveDecisionConsequence(
      review_state === 'pending' ? 'REVIEW' : effectiveDecision,
      record.explanation,
      record.obligations,
    );
    if (review_state === 'pending') {
      consequence.requires_review = true;
      consequence.expected_action = 'HOLD';
      consequence.action_summary = 'Hold for human review';
    }
    if (review_state === 'resolved') {
      consequence.requires_review = false;
    }
    const audit = findAuditForEvaluation(record, await ctx.audit.list());
    const enforcement = projectEnforcementResult(record, audit);
    const request_context = projectRequestContext(record);
    return {
      source: 'policy_evaluations',
      evaluation: record,
      decision,
      consequence,
      enforcement,
      request_context,
      execution: {
        mode: request_context.execution_mode,
        phase: record.phase,
        gateway_executed: request_context.execution_mode === 'live',
        summary:
          request_context.execution_mode === 'simulation'
            ? 'Decision evaluated - Gateway action not executed'
            : enforcement.status === 'FAILED'
              ? 'Decision evaluated - Gateway enforcement failed'
              : enforcement.verified &&
                  (enforcement.status === 'ALLOWED' ||
                    enforcement.status === 'CONTROLS_APPLIED' ||
                    enforcement.status === 'BLOCKED')
                ? 'Decision evaluated - Gateway enforcement correlated and verified'
                : enforcement.attempted
                  ? 'Decision evaluated - Gateway enforcement attempted'
                  : 'Decision evaluated - Gateway enforcement not yet correlated',
        resume: record.execution ?? null,
        held_request_present: Boolean(record.held_request),
      },
      review: {
        eligible: isEligibleForHumanReview(record) || review_state === 'resolved',
        review_state,
        original_decision: record.decision,
        human_resolution: record.human_resolution ?? null,
        final_decision: record.human_resolution?.final_decision ?? null,
      },
    };
  });

  app.post('/v1/admin/evaluations/:evaluationId/resolve', async (request, reply) => {
    if (!(await requireApprover(request.headers.authorization))) {
      return reply.status(401).send({ status: 'blocked', reason_code: 'UNAUTHENTICATED' });
    }
    if (!ctx.policyRepository?.getEvaluation || !ctx.policyRepository.saveHumanResolution) {
      return reply.status(503).send({
        status: 'error',
        message: 'EPA evaluation store unavailable',
      });
    }
    const { evaluationId } = request.params as { evaluationId: string };
    const body = (request.body ?? {}) as {
      disposition?: string;
      reason?: string;
      actor?: string;
    };
    const record = await Promise.resolve(
      ctx.policyRepository.getEvaluation(evaluationId),
    );
    if (!record) {
      return reply.status(404).send({ status: 'error', message: 'evaluation not found' });
    }

    const {
      buildHumanResolution,
    } = await import('../policy/enterprise/decision-resolution.js');
    const { deriveDecisionConsequence } = await import(
      '../policy/enterprise/evaluation-query.js'
    );
    const { projectEnforcementResult, findAuditForEvaluation } = await import(
      '../policy/enterprise/enforcement-projection.js'
    );

    let resolution;
    try {
      resolution = buildHumanResolution(record, {
        disposition: String(body.disposition ?? '').toUpperCase() as 'AUTHORIZE' | 'DENY',
        reason: String(body.reason ?? ''),
        resolved_by: String(body.actor ?? 'approver'),
      });
    } catch (err) {
      const code =
        err && typeof err === 'object' && 'code' in err
          ? String((err as { code: unknown }).code)
          : null;
      if (code) {
        const status = code === 'ALREADY_RESOLVED' ? 409 : 400;
        return reply.status(status).send({
          status: 'error',
          reason_code: code,
          message: err instanceof Error ? err.message : 'Resolution failed',
        });
      }
      throw err;
    }

    const machineDecision = record.decision;
    const updated = await Promise.resolve(
      ctx.policyRepository.saveHumanResolution(evaluationId, resolution),
    );
    if (!updated || updated.decision !== machineDecision) {
      return reply.status(500).send({
        status: 'error',
        message: 'Failed to persist resolution without altering machine decision',
      });
    }

    const { executionAfterAuthorize } = await import(
      '../policy/enterprise/decision-resume.js'
    );
    let withExecution = updated;
    const exec = executionAfterAuthorize(updated);
    if (exec && ctx.policyRepository.saveExecution) {
      withExecution =
        (await Promise.resolve(
          ctx.policyRepository.saveExecution(evaluationId, exec),
        )) ?? updated;
    }

    const requestId =
      withExecution.request_id ?? `req_resolve_${evaluationId.slice(-12)}`;
    const authorized = resolution.human_disposition === 'AUTHORIZE';
    const { decisionBindingFromRecord } = await import(
      '../audit/decision-binding.js'
    );
    const binding = decisionBindingFromRecord(withExecution);
    await ctx.audit.record({
      audit_id: `aud_eval_res_${randomBytes(6).toString('hex')}`,
      timestamp: resolution.resolved_at,
      user_id: resolution.resolved_by,
      request_id: requestId,
      correlation_id: `cor_eval_res_${randomBytes(4).toString('hex')}`,
      operation: 'evaluation_resolve',
      data_classification: 'Internal',
      policy_decision: authorized ? 'ALLOW' : 'BLOCK',
      response_decision: authorized ? 'RELEASE' : 'BLOCK',
      reason_codes: [
        authorized ? 'HUMAN_AUTHORIZE' : 'HUMAN_DENY',
        'EVALUATION_RESOLVED',
      ],
      evaluation_id: binding.evaluation_id,
      decision_hash: binding.decision_hash,
      metadata: {
        resolution: true,
        evaluation_id: evaluationId,
        original_decision: resolution.original_decision,
        human_disposition: resolution.human_disposition,
        final_decision: resolution.final_decision,
        resolution_reason: resolution.resolution_reason,
        resolved_by: resolution.resolved_by,
        resume_eligible: Boolean(exec),
      },
    });

    const audit = findAuditForEvaluation(withExecution, await ctx.audit.list());
    const consequence = deriveDecisionConsequence(
      resolution.final_decision,
      withExecution.explanation,
      withExecution.obligations,
    );
    consequence.requires_review = false;
    const enforcement = projectEnforcementResult(withExecution, audit);

    return {
      status: 'resolved',
      evaluation_id: evaluationId,
      original_decision: machineDecision,
      human_resolution: resolution,
      final_decision: resolution.final_decision,
      execution: withExecution.execution ?? null,
      consequence,
      enforcement,
      request_id: requestId,
    };
  });

  app.post('/v1/admin/evaluations/:evaluationId/resume', async (request, reply) => {
    if (!(await requireApprover(request.headers.authorization))) {
      return reply.status(401).send({ status: 'blocked', reason_code: 'UNAUTHENTICATED' });
    }
    if (
      !ctx.policyRepository?.getEvaluation ||
      !ctx.policyRepository.saveExecution ||
      !ctx.orchestrator
    ) {
      return reply.status(503).send({
        status: 'error',
        message: 'Resume unavailable',
      });
    }
    const { evaluationId } = request.params as { evaluationId: string };
    const record = await Promise.resolve(
      ctx.policyRepository.getEvaluation(evaluationId),
    );
    if (!record) {
      return reply.status(404).send({
        status: 'error',
        reason_code: 'NOT_FOUND',
        message: 'evaluation not found',
      });
    }

    const {
      assertResumeEligible,
      ResumeEvaluationError,
      markResumeInProgress,
      markResumed,
      markResumeFailed,
    } = await import('../policy/enterprise/decision-resume.js');
    const { projectEnforcementResult, findAuditForEvaluation } = await import(
      '../policy/enterprise/enforcement-projection.js'
    );

    try {
      assertResumeEligible(record);
    } catch (err) {
      if (err instanceof ResumeEvaluationError) {
        if (err.code === 'ALREADY_RESUMED') {
          const audit = findAuditForEvaluation(record, await ctx.audit.list());
          return {
            status: 'already_resumed',
            evaluation_id: evaluationId,
            original_decision: record.decision,
            final_decision: record.human_resolution?.final_decision,
            execution: record.execution,
            enforcement: projectEnforcementResult(record, audit),
            request_id: record.request_id,
          };
        }
        const status =
          err.code === 'RESUME_IN_PROGRESS'
            ? 409
            : err.code === 'MISSING_HELD_REQUEST'
              ? 409
              : 400;
        return reply.status(status).send({
          status: 'error',
          reason_code: err.code,
          message: err.message,
          execution: record.execution ?? null,
        });
      }
      throw err;
    }

    const machineDecision = record.decision;
    const inProgress = markResumeInProgress(record.execution);
    let working =
      (await Promise.resolve(
        ctx.policyRepository.saveExecution(evaluationId, inProgress),
      )) ?? record;
    if (working.decision !== machineDecision) {
      return reply.status(500).send({
        status: 'error',
        message: 'Failed to persist resume state without altering machine decision',
      });
    }

    const result = await ctx.orchestrator.resumeAuthorizedEvaluation(working);
    if (result.httpStatus === 200) {
      const done = markResumed(working.execution, result.audit_id ?? '');
      working =
        (await Promise.resolve(
          ctx.policyRepository.saveExecution(evaluationId, done),
        )) ?? working;
      const audit = findAuditForEvaluation(working, await ctx.audit.list());
      return {
        status: 'resumed',
        evaluation_id: evaluationId,
        original_decision: machineDecision,
        final_decision: working.human_resolution?.final_decision,
        execution: working.execution,
        enforcement: projectEnforcementResult(working, audit),
        request_id: working.request_id,
        gateway: result.body,
      };
    }

    const failed = markResumeFailed(
      working.execution,
      'reason_code' in result.body ? result.body.reason_code : 'RESUME_FAILED',
    );
    working =
      (await Promise.resolve(
        ctx.policyRepository.saveExecution(evaluationId, failed),
      )) ?? working;
    const audit = findAuditForEvaluation(working, await ctx.audit.list());
    return reply.status(409).send({
      status: 'resume_failed',
      evaluation_id: evaluationId,
      original_decision: machineDecision,
      final_decision: working.human_resolution?.final_decision,
      execution: working.execution,
      enforcement: projectEnforcementResult(working, audit),
      request_id: working.request_id,
      gateway: result.body,
    });
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
    const days = parseDaysQuery(request.query);
    const events = filterEventsByDays(await ctx.audit.list(), days);
    const limit = Number((request.query as { limit?: string }).limit ?? 100);
    return {
      days,
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
          evaluation_id: e.evaluation_id ?? null,
          decision_hash: e.decision_hash ?? null,
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
      note: 'Hash-chained HMAC-signed audit. Response bodies are not stored, only response_hash.',
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

  app.get('/v1/admin/insights/action-items', async (request, reply) => {
    if (!(await requireAdmin(request.headers.authorization))) {
      return reply.status(401).send({ status: 'blocked', reason_code: 'UNAUTHENTICATED' });
    }

    const days = parseDaysQuery(request.query);
    const [events, applications, policies] = await Promise.all([
      ctx.audit.list(),
      ctx.identityStore.listApplications(),
      ctx.policyStore.listLatest(),
    ]);
    const inWindow = filterEventsByDays(events, days);
    const blocked = [...inWindow]
      .reverse()
      .filter((e) => e.response_decision === 'BLOCK' || e.policy_decision === 'BLOCK');
    const db = ctx.checkDatabase
      ? await ctx.checkDatabase()
      : {
          ok: ctx.persistence === 'memory',
          detail: ctx.persistence === 'postgres' ? 'unchecked' : 'not_configured',
        };
    const localRuntimeStatus = ctx.checkLocalRuntime
      ? await ctx.checkLocalRuntime()
      : { mode: 'stub', active_runtime: 'stub-local', available: false, airgap: false };

    const reasonCounts = new Map<string, number>();
    for (const e of blocked) {
      for (const code of e.reason_codes ?? []) {
        reasonCounts.set(code, (reasonCounts.get(code) ?? 0) + 1);
      }
    }
    const blocked_reasons = [...reasonCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([code]) => code);

    const activePolicies = ctx.policyRepository
      ? ctx.policyRepository.getSnapshot().policies.filter((p) => p.status === 'active')
          .length
      : policies.filter((p) => p.status === 'active').length;

    const facts: ActionItemFacts = {
      gateway_ok: true,
      database_ok: !!db.ok && db.detail !== 'not_configured',
      database_detail: db.detail,
      runtime_available: localRuntimeStatus.available,
      runtime_id: localRuntimeStatus.active_runtime,
      active_policies: activePolicies,
      active_models: ctx.registry.listActive().length,
      applications: applications.length,
      audit_events: inWindow.length,
      recent_blocked: blocked.length,
      blocked_reasons,
      persistence: ctx.persistence,
    };

    const heuristicItems = buildHeuristicActionItems(facts);
    let items = heuristicItems;
    let summary =
      'Assessed gateway activity and performance from live console signals.';
    let source: 'local_model' | 'heuristic' = 'heuristic';
    let model_id: string | undefined;

    const runtime = ctx.localRuntime;
    if (runtime && localRuntimeStatus.available && wantsInsightLlm(request.query)) {
      const preferred =
        ctx.config.ollamaModelName ||
        ctx.registry.listActive().find((m) => m.kind === 'local')?.model_id ||
        'local-general-v1';
      model_id = preferred;
      try {
        const generated = await runtime.generate({
          model: preferred,
          request_id: `insight-${randomUUID()}`,
          num_predict: INSIGHT_NUM_PREDICT,
          signal: insightLlmSignal(),
          messages: [
            {
              role: 'system',
              content:
                'You are the Enigma gateway console analyst. Assess activity and performance. Return JSON only with shape {"summary":string,"items":[{"priority":"high"|"medium"|"low","title":string,"detail":string,"href"?:string}]}. Max 6 items. Prefer href values among /audit /policies /applications /models /system.',
            },
            {
              role: 'user',
              content: `Analyze these live facts and report top action items:\n${JSON.stringify(facts, null, 2)}`,
            },
          ],
        });
        const parsed = parseActionItemsJson(generated.content);
        if (parsed?.items && parsed.items.length > 0) {
          items = parsed.items.slice(0, 6);
          source = 'local_model';
        }
        if (parsed?.summary) {
          summary = parsed.summary;
          if (parsed.items && parsed.items.length > 0) source = 'local_model';
        } else if (generated.content && !generated.content.startsWith('[local-runtime:')) {
          summary = generated.content.slice(0, 240);
          source = 'local_model';
        }
      } catch {
        // Keep heuristic items — console must stay usable when inference fails/times out.
      }
    }

    return {
      summary,
      items,
      source,
      model_id,
      days,
      runtime: localRuntimeStatus,
      generated_at: new Date().toISOString(),
    };
  });

  app.get('/v1/admin/insights/risk-classification', async (request, reply) => {
    if (!(await requireAdmin(request.headers.authorization))) {
      return reply.status(401).send({ status: 'blocked', reason_code: 'UNAUTHENTICATED' });
    }

    const days = parseDaysQuery(request.query);
    const [applications, events] = await Promise.all([
      ctx.identityStore.listApplications(),
      ctx.audit.list(),
    ]);
    const inWindow = filterEventsByDays(events, days);
    const blocksByApp = new Map<string, number>();
    for (const e of inWindow) {
      if (
        (e.response_decision === 'BLOCK' || e.policy_decision === 'BLOCK') &&
        e.application_id
      ) {
        blocksByApp.set(
          e.application_id,
          (blocksByApp.get(e.application_id) ?? 0) + 1,
        );
      }
    }

    const inputs: AppRiskInput[] = applications.map((a) => ({
      application_id: a.application_id,
      name: a.name,
      type: a.type,
      environment: a.environment,
      status: a.status,
      trust_level: a.trust_level,
      allowed_models: a.allowed_models,
      allowed_operations: a.allowed_operations,
      recent_blocks: blocksByApp.get(a.application_id) ?? 0,
    }));

    let applicationsClassified = inputs.map(classifyApplicationHeuristic);
    let source: 'local_model' | 'heuristic' = 'heuristic';
    let model_id: string | undefined;
    let summary =
      'Local runtime analyzed and classified application risk from live console signals.';

    const localRuntimeStatus = ctx.checkLocalRuntime
      ? await ctx.checkLocalRuntime()
      : { mode: 'stub', active_runtime: 'stub-local', available: false, airgap: false };
    const runtime = ctx.localRuntime;

    if (runtime && localRuntimeStatus.available && inputs.length > 0 && wantsInsightLlm(request.query)) {
      const preferred =
        ctx.config.ollamaModelName ||
        ctx.registry.listActive().find((m) => m.kind === 'local')?.model_id ||
        'local-general-v1';
      model_id = preferred;
      try {
        const generated = await runtime.generate({
          model: preferred,
          request_id: `risk-${randomUUID()}`,
          num_predict: INSIGHT_NUM_PREDICT,
          signal: insightLlmSignal(),
          messages: [
            {
              role: 'system',
              content:
                'You are the Enigma gateway risk analyst. Analyze each application and classify risk as high, medium, low, or undetermined. Return JSON only: {"summary":string,"applications":[{"application_id":string,"name":string,"risk":"high"|"medium"|"low"|"undetermined","rationale":string}]}.',
            },
            {
              role: 'user',
              content: `Classify each application for governance risk:\n${JSON.stringify(inputs, null, 2)}`,
            },
          ],
        });
        const parsed = parseRiskClassificationJson(generated.content);
        if (parsed) {
          // Prefer model labels; fill any missing apps with heuristics.
          const byId = new Map(parsed.map((p) => [p.application_id, p]));
          applicationsClassified = inputs.map(
            (app) => byId.get(app.application_id) ?? classifyApplicationHeuristic(app),
          );
          source = 'local_model';
        }
        try {
          const start = generated.content.indexOf('{');
          const end = generated.content.lastIndexOf('}');
          if (start >= 0 && end > start) {
            const obj = JSON.parse(generated.content.slice(start, end + 1)) as {
              summary?: string;
            };
            if (typeof obj.summary === 'string' && obj.summary.trim()) {
              summary = obj.summary.trim();
            }
          }
        } catch {
          // keep default summary
        }
      } catch {
        // Keep heuristic classifications.
      }
    } else if (inputs.length === 0) {
      summary = 'No applications registered to classify.';
    }

    const counts = aggregateRiskCounts(applicationsClassified);

    return {
      summary,
      total: applicationsClassified.length,
      counts,
      applications: applicationsClassified,
      source,
      model_id,
      days,
      runtime: localRuntimeStatus,
      generated_at: new Date().toISOString(),
    };
  });

  app.get('/v1/admin/insights/compliance-score', async (request, reply) => {
    if (!(await requireAdmin(request.headers.authorization))) {
      return reply.status(401).send({ status: 'blocked', reason_code: 'UNAUTHENTICATED' });
    }

    const packs = ctx.policyRepository
      ? ctx.policyRepository.getSnapshot().packs.map((p) => ({
          pack_id: p.pack_id,
          name: p.name,
          domain: p.domain,
          status: p.status,
        }))
      : [];
    const policies = ctx.policyRepository
      ? ctx.policyRepository.getSnapshot().policies.map((p) => ({
          policy_id: p.policy_id,
          pack_id: p.pack_id,
          status: p.status,
        }))
      : [];

    let frameworks = PRIORITY_FRAMEWORKS.map((def) =>
      scoreFrameworkHeuristic(def, packs, policies),
    );
    let overall = overallComplianceScore(frameworks);
    let source: 'local_model' | 'heuristic' = 'heuristic';
    let model_id: string | undefined;
    let summary =
      'Local runtime scored priority framework compliance from live pack posture.';

    const localRuntimeStatus = ctx.checkLocalRuntime
      ? await ctx.checkLocalRuntime()
      : { mode: 'stub', active_runtime: 'stub-local', available: false, airgap: false };
    const runtime = ctx.localRuntime;

    if (runtime && localRuntimeStatus.available && wantsInsightLlm(request.query)) {
      const preferred =
        ctx.config.ollamaModelName ||
        ctx.registry.listActive().find((m) => m.kind === 'local')?.model_id ||
        'local-general-v1';
      model_id = preferred;
      try {
        const generated = await runtime.generate({
          model: preferred,
          request_id: `compliance-${randomUUID()}`,
          num_predict: INSIGHT_NUM_PREDICT,
          signal: insightLlmSignal(),
          messages: [
            {
              role: 'system',
              content:
                'You are the Enigma gateway governance analyst. Score each priority framework 0-100 based on loaded policy pack posture (not certification). Return JSON only: {"summary":string,"overall":number,"frameworks":[{"framework_id":string,"name":string,"score":number,"status":"strong"|"partial"|"weak"|"unknown","detail":string,"controls_evaluated":number,"total_controls":number,"high_priority_issues":number}]}.',
            },
            {
              role: 'user',
              content: `Score each priority framework policy posture (not certification):\n${JSON.stringify(
                {
                  priority_frameworks: PRIORITY_FRAMEWORKS,
                  packs,
                  policies,
                },
                null,
                2,
              )}`,
            },
          ],
        });
        const parsed = parseComplianceJson(generated.content);
        if (parsed?.frameworks && parsed.frameworks.length > 0) {
          const byId = new Map(parsed.frameworks.map((f) => [f.framework_id, f]));
          frameworks = PRIORITY_FRAMEWORKS.map(
            (def) =>
              byId.get(def.framework_id) ??
              scoreFrameworkHeuristic(def, packs, policies),
          );
          overall =
            typeof parsed.overall === 'number'
              ? parsed.overall
              : overallComplianceScore(frameworks);
          source = 'local_model';
        }
        if (parsed?.summary) summary = parsed.summary;
      } catch {
        // Keep heuristic scores.
      }
    }

    return {
      summary,
      overall,
      frameworks,
      source,
      model_id,
      runtime: localRuntimeStatus,
      generated_at: new Date().toISOString(),
    };
  });
}
