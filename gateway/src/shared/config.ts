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
   * Policy engine path (Enigma EPA):
   * - enterprise: pack PDP authoritative (default)
   * - shadow: EPA authoritative + legacy dual-run mismatch reporting
   * - compare / legacy: rollback only (requires GATEWAY_ALLOW_LEGACY_ENGINE=true)
   */
  policyEngineMode: 'legacy' | 'enterprise' | 'compare' | 'shadow';
  /** Separate keys for policy approve vs activate (default to admin key). */
  policyApproverKey: string;
  policyActivatorKey: string;
  /** Allow legacy/compare engine modes (default false after M4 soak). */
  allowLegacyEngine: boolean;
  /**
   * When true (appliance), refuse to start without GATEWAY_VAULT_KEY
   * (no silent fallback to admin key).
   */
  requireVaultKey: boolean;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): GatewayConfig {
  const cors = env.GATEWAY_CORS_ORIGINS ?? 'http://localhost:3080,http://127.0.0.1:3080';
  const runtimeEnv = (env.GATEWAY_LOCAL_RUNTIME ?? 'auto').toLowerCase();
  const localRuntimeMode: LocalRuntimeMode =
    runtimeEnv === 'stub' || runtimeEnv === 'ollama' ? runtimeEnv : 'auto';
  const vaultEncryptionKey = env.GATEWAY_VAULT_KEY;
  const adminApiKey = env.GATEWAY_ADMIN_API_KEY ?? 'n2ai_admin_dev_key';
  const allowLegacyEngine = env.GATEWAY_ALLOW_LEGACY_ENGINE === 'true';
  const policyMode = (env.GATEWAY_POLICY_ENGINE ?? 'enterprise').toLowerCase();
  let policyEngineMode: GatewayConfig['policyEngineMode'] = 'enterprise';
  if (policyMode === 'shadow') {
    policyEngineMode = 'shadow';
  } else if (
    (policyMode === 'legacy' || policyMode === 'compare') &&
    allowLegacyEngine
  ) {
    policyEngineMode = policyMode;
  } else if (policyMode === 'legacy' || policyMode === 'compare') {
    // Soak retirement: ignore legacy modes unless explicitly allowed.
    policyEngineMode = 'enterprise';
  }

  const requireVaultKey = env.GATEWAY_REQUIRE_VAULT_KEY === 'true';

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
    policyApproverKey: env.GATEWAY_POLICY_APPROVER_KEY ?? adminApiKey,
    policyActivatorKey: env.GATEWAY_POLICY_ACTIVATOR_KEY ?? adminApiKey,
    allowLegacyEngine,
    requireVaultKey,
  };
}
