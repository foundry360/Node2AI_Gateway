import type { FastifyInstance } from 'fastify';
import type { AuditService } from '../audit/service.js';
import type { IdentityStore } from '../identity/store.js';
import type { ModelProvider, ModelRegistry } from '../models/types.js';
import type { GatewayConfig } from '../shared/config.js';

export interface AdminContext {
  config: GatewayConfig;
  identityStore: IdentityStore;
  registry: ModelRegistry;
  providers: ModelProvider[];
  audit: AuditService;
  persistence: 'memory' | 'postgres';
  checkDatabase?: () => Promise<{ ok: boolean; detail: string }>;
}

function extractBearer(header: string | undefined): string | undefined {
  if (!header) return undefined;
  const [scheme, token] = header.split(/\s+/);
  if (!scheme || !token) return undefined;
  if (scheme.toLowerCase() !== 'bearer') return undefined;
  return token;
}

const POLICY_CATALOG = [
  {
    policy_id: 'pol_phase2_core',
    name: 'Request governance',
    status: 'active',
    version: 2,
    summary:
      'Application trust, operation allowlists, PHI local-only, PII tokenize, credential block.',
  },
  {
    policy_id: 'pol_phase5_response',
    name: 'Response governance',
    status: 'active',
    version: 5,
    summary:
      'Block PHI/credentials/tool calls in outputs; redact PII; detokenize only when authorized.',
  },
];

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

    const [events, applications, users] = await Promise.all([
      ctx.audit.list(),
      ctx.identityStore.listApplications(),
      ctx.identityStore.listUsers(),
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

    return {
      gateway: { status: 'ok', mode: ctx.config.deploymentMode },
      policy: { status: 'ready', active_policies: POLICY_CATALOG.length },
      models: {
        status: 'ready',
        active: ctx.registry.listActive().length,
        providers: ctx.providers.map((p) => ({ id: p.providerId, kind: p.kind })),
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

  app.get('/v1/admin/policies', async (request, reply) => {
    if (!(await requireAdmin(request.headers.authorization))) {
      return reply.status(401).send({ status: 'blocked', reason_code: 'UNAUTHENTICATED' });
    }
    return { policies: POLICY_CATALOG };
  });

  app.get('/v1/admin/models', async (request, reply) => {
    if (!(await requireAdmin(request.headers.authorization))) {
      return reply.status(401).send({ status: 'blocked', reason_code: 'UNAUTHENTICATED' });
    }
    return {
      models: ctx.registry.listActive(),
      providers: ctx.providers.map((p) => ({
        provider_id: p.providerId,
        kind: p.kind,
      })),
    };
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

    return {
      deployment_mode: ctx.config.deploymentMode,
      host: ctx.config.host,
      port: ctx.config.port,
      persistence: ctx.persistence,
      ollama_base_url: ctx.config.ollamaBaseUrl,
      external_provider_base_url:
        ctx.config.deploymentMode === 'airgap'
          ? 'disabled'
          : ctx.config.externalProviderBaseUrl,
      airgap: {
        enabled: ctx.config.deploymentMode === 'airgap',
        external_providers:
          ctx.config.deploymentMode === 'airgap' ? 'omitted' : 'allowed',
        local_models_only: ctx.config.deploymentMode === 'airgap',
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
