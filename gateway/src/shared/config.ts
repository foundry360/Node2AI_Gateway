export type DeploymentMode = 'connected' | 'airgap';
export type LocalRuntimeMode = 'stub' | 'ollama' | 'auto';

export interface GatewayConfig {
  host: string;
  port: number;
  deploymentMode: DeploymentMode;
  /** When true, audit write failures block execution (default). */
  failClosedOnAuditError: boolean;
  /** Ollama base URL when using OllamaLocalRuntime */
  ollamaBaseUrl: string;
  /** Local inference: stub (CI), ollama (appliance), auto (prefer ollama). */
  localRuntimeMode: LocalRuntimeMode;
  /** Ollama model name mapped from local-general-v1 */
  ollamaModelName: string;
  /** External OpenAI-compatible endpoint (connected mode only) */
  externalProviderBaseUrl: string;
  externalProviderApiKey?: string;
  /** Bearer token for /v1/admin/* (governance console). */
  adminApiKey: string;
  /** Optional PostgreSQL URL for appliance health / future persistence. */
  databaseUrl?: string;
  /** CORS origins for admin UI */
  corsOrigins: string[];
  /** AES key material for token vault encryption (32-byte hex or passphrase). */
  vaultEncryptionKey?: string;
  /** HMAC key for signed audit hash chain (defaults to vault key or admin key). */
  auditSigningKey: string;
  /**
   * Policy engine path (Enigma EPA migration):
   * - legacy: DeterministicPolicyEngine only
   * - enterprise: adapter + delegating PDP (M1 default for new installs once wired)
   * - compare: both; enforce legacy; report mismatches
   */
  policyEngineMode: 'legacy' | 'enterprise' | 'compare';
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): GatewayConfig {
  const cors = env.GATEWAY_CORS_ORIGINS ?? 'http://localhost:3080,http://127.0.0.1:3080';
  const runtimeEnv = (env.GATEWAY_LOCAL_RUNTIME ?? 'auto').toLowerCase();
  const localRuntimeMode: LocalRuntimeMode =
    runtimeEnv === 'stub' || runtimeEnv === 'ollama' ? runtimeEnv : 'auto';
  const vaultEncryptionKey = env.GATEWAY_VAULT_KEY;
  const adminApiKey = env.GATEWAY_ADMIN_API_KEY ?? 'n2ai_admin_dev_key';
  const policyMode = (env.GATEWAY_POLICY_ENGINE ?? 'enterprise').toLowerCase();
  const policyEngineMode =
    policyMode === 'legacy' || policyMode === 'compare' ? policyMode : 'enterprise';

  return {
    host: env.GATEWAY_HOST ?? '127.0.0.1',
    port: Number(env.GATEWAY_PORT ?? 8080),
    deploymentMode: env.GATEWAY_DEPLOYMENT_MODE === 'airgap' ? 'airgap' : 'connected',
    failClosedOnAuditError: env.GATEWAY_FAIL_CLOSED_AUDIT !== 'false',
    ollamaBaseUrl: env.GATEWAY_OLLAMA_URL ?? 'http://127.0.0.1:11434',
    localRuntimeMode,
    ollamaModelName: env.GATEWAY_OLLAMA_MODEL ?? 'llama3.2',
    externalProviderBaseUrl:
      env.GATEWAY_EXTERNAL_PROVIDER_URL ?? 'http://127.0.0.1:9',
    externalProviderApiKey: env.GATEWAY_EXTERNAL_PROVIDER_API_KEY,
    adminApiKey,
    databaseUrl: env.DATABASE_URL,
    corsOrigins: cors.split(',').map((s) => s.trim()).filter(Boolean),
    vaultEncryptionKey,
    auditSigningKey:
      env.GATEWAY_AUDIT_KEY ?? vaultEncryptionKey ?? adminApiKey,
    policyEngineMode,
  };
}
