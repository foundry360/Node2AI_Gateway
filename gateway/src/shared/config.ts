export type DeploymentMode = 'connected' | 'airgap';

export interface GatewayConfig {
  host: string;
  port: number;
  deploymentMode: DeploymentMode;
  /** When true, audit write failures block execution (default). */
  failClosedOnAuditError: boolean;
  /** Ollama base URL when using OllamaLocalRuntime */
  ollamaBaseUrl: string;
  /** External OpenAI-compatible endpoint (connected mode only) */
  externalProviderBaseUrl: string;
  externalProviderApiKey?: string;
  /** Bearer token for /v1/admin/* (governance console). */
  adminApiKey: string;
  /** Optional PostgreSQL URL for appliance health / future persistence. */
  databaseUrl?: string;
  /** CORS origins for admin UI */
  corsOrigins: string[];
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): GatewayConfig {
  const cors = env.GATEWAY_CORS_ORIGINS ?? 'http://localhost:3080,http://127.0.0.1:3080';
  return {
    host: env.GATEWAY_HOST ?? '127.0.0.1',
    port: Number(env.GATEWAY_PORT ?? 8080),
    deploymentMode: env.GATEWAY_DEPLOYMENT_MODE === 'airgap' ? 'airgap' : 'connected',
    failClosedOnAuditError: env.GATEWAY_FAIL_CLOSED_AUDIT !== 'false',
    ollamaBaseUrl: env.GATEWAY_OLLAMA_URL ?? 'http://127.0.0.1:11434',
    externalProviderBaseUrl:
      env.GATEWAY_EXTERNAL_PROVIDER_URL ?? 'http://127.0.0.1:9',
    externalProviderApiKey: env.GATEWAY_EXTERNAL_PROVIDER_API_KEY,
    adminApiKey: env.GATEWAY_ADMIN_API_KEY ?? 'n2ai_admin_dev_key',
    databaseUrl: env.DATABASE_URL,
    corsOrigins: cors.split(',').map((s) => s.trim()).filter(Boolean),
  };
}
