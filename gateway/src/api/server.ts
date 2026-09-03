import Fastify, { type FastifyInstance } from 'fastify';
import type { GatewayOrchestrator } from './orchestrator.js';
import { registerAdminRoutes, type AdminContext } from './admin-routes.js';

export interface BuildServerOptions {
  orchestrator: GatewayOrchestrator;
  admin?: AdminContext;
  /** Mount only governance routes — no ungoverned AI shortcuts. */
  logger?: boolean;
}

function extractBearer(header: string | undefined): string | undefined {
  if (!header) return undefined;
  const [scheme, token] = header.split(/\s+/);
  if (!scheme || !token) return undefined;
  if (scheme.toLowerCase() !== 'bearer') return undefined;
  return token;
}

/**
 * Production HTTP surface for AI execution + admin read APIs.
 * Intentionally does NOT expose provider passthrough or "test chat" executors.
 */
export async function buildServer(opts: BuildServerOptions): Promise<FastifyInstance> {
  const app = Fastify({ logger: opts.logger ?? false });

  if (opts.admin?.config.corsOrigins.length) {
    const allowed = new Set(opts.admin.config.corsOrigins);
    app.addHook('onRequest', async (request, reply) => {
      const origin = request.headers.origin;
      if (origin && allowed.has(origin)) {
        reply.header('access-control-allow-origin', origin);
        reply.header('access-control-allow-headers', 'authorization, content-type');
        reply.header('access-control-allow-methods', 'GET,POST,PATCH,PUT,DELETE,OPTIONS');
      }
      if (request.method === 'OPTIONS') {
        return reply.status(204).send();
      }
    });
  }

  app.get('/health', async (_request, reply) => {
    const db = opts.admin?.checkDatabase
      ? await opts.admin.checkDatabase()
      : undefined;
    const localRuntime = opts.admin?.checkLocalRuntime
      ? await opts.admin.checkLocalRuntime()
      : undefined;
    const airgap = opts.admin?.config.deploymentMode === 'airgap';

    // Air-gap appliances fail closed when the local runtime is unreachable.
    if (airgap && localRuntime && !localRuntime.available) {
      return reply.status(503).send({
        status: 'unavailable',
        service: 'node2ai-gateway',
        reason_code: 'AIRGAP_LOCAL_RUNTIME_UNAVAILABLE',
        database: db,
        local_runtime: localRuntime,
      });
    }

    return {
      status: 'ok',
      service: 'node2ai-gateway',
      database: db,
      local_runtime: localRuntime,
    };
  });

  app.get('/v1/system/status', async () => ({
    status: 'ok',
    governance: {
      policy_engine: 'ready',
      audit: 'ready',
      model_gateway: 'ready',
      response_inspector: 'ready',
      interrogator: 'ready',
    },
    deployment_mode: opts.admin?.config.deploymentMode ?? 'connected',
    note: 'AI execution only via POST /v1/ai/completions',
  }));

  app.post('/v1/ai/completions', async (request, reply) => {
    const rawKey = extractBearer(request.headers.authorization);
    const result = await opts.orchestrator.completions(rawKey, request.body);
    return reply.status(result.httpStatus).send(result.body);
  });

  if (opts.admin) {
    registerAdminRoutes(app, opts.admin);
  }

  return app;
}
