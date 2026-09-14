export type DeploymentMode = 'connected' | 'airgap';
export type LocalRuntimeMode = 'stub' | 'ollama' | 'auto';
/** Phase A Agent/Tool registry: off=legacy attestation, shadow=resolve+compare, enforce=server authority. */
export type ActorRegistryMode = 'off' | 'shadow' | 'enforce';

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
   * Path or inline JSON for Ed25519 private JWK used to sign audit checkpoints.
   * Never logged or returned via API.
   */
  auditCheckpointPrivateJwk?: string;
  /** Path or inline JWKS/public JWK for verifying audit checkpoints. */
  auditCheckpointPublicJwks?: string;
  /** Auto-create checkpoint every N new events since last checkpoint (0 disables). Default 500. */
  auditCheckpointEveryEvents: number;
  /** Auto-create checkpoint when this many seconds elapsed since last (0 disables). Default 900. */
  auditCheckpointIntervalSeconds: number;
  /** Master switch for automatic checkpointing (manual still allowed). */
  auditCheckpointingEnabled: boolean;
  /** Max catch-up checkpoints per worker tick. Default 5. */
  auditCheckpointMaxPerTick: number;
  /** Enable external evidence anchoring (Phase 2+). */
  auditAnchoringEnabled: boolean;
  /** filesystem | s3 | none — S3 is optional; air-gap uses filesystem. */
  auditAnchorProvider: 'filesystem' | 's3' | 'none';
  /** Root directory for filesystem anchors (air-gap / local). */
  auditAnchorLocation?: string;
  /** When true, auto-anchor after checkpoint creation. */
  auditAnchorOnCheckpoint: boolean;
  /** Customer S3 bucket for evidence anchors (provider=s3). */
  auditAnchorS3Bucket?: string;
  /** Optional key prefix inside the bucket. */
  auditAnchorS3Prefix?: string;
  /** AWS region for the evidence bucket. */
  auditAnchorS3Region?: string;
  /** Optional custom endpoint (LocalStack / VPC endpoint tests). */
  auditAnchorS3Endpoint?: string;
  /** Max durable anchor attempts before FAILED. */
  auditAnchorMaxAttempts: number;
  /** Background worker poll interval (ms). */
  auditAnchorWorkerIntervalMs: number;
  /** Use durable async queue when a job repository is available. */
  auditAnchorAsync: boolean;
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
  /**
   * When true, response policy may authorize vault detokenization for
   * trusted clinical + clinician paths (still gated by pack rules).
   * Default true. Set GATEWAY_ALLOW_DETOKENIZATION=false to disable.
   */
  allowDetokenization: boolean;
  /**
   * Agent/Tool registry mode (Phase A).
   * Production default: enforce. createPhase1Gateway tests default to off.
   */
  actorRegistryMode: ActorRegistryMode;
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
  const allowDetokenization = env.GATEWAY_ALLOW_DETOKENIZATION !== 'false';
  const actorModeRaw = (env.GATEWAY_ACTOR_REGISTRY_MODE ?? 'enforce').toLowerCase();
  const actorRegistryMode: ActorRegistryMode =
    actorModeRaw === 'off' || actorModeRaw === 'shadow' || actorModeRaw === 'enforce'
      ? actorModeRaw
      : 'enforce';

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
      (env.GATEWAY_AUDIT_KEY && env.GATEWAY_AUDIT_KEY.trim()) ||
      vaultEncryptionKey ||
      adminApiKey,
    auditCheckpointPrivateJwk: env.GATEWAY_AUDIT_CHECKPOINT_PRIVATE_JWK,
    auditCheckpointPublicJwks: env.GATEWAY_AUDIT_CHECKPOINT_PUBLIC_JWKS,
    auditCheckpointEveryEvents: Number(
      env.GATEWAY_AUDIT_CHECKPOINT_EVERY_EVENTS ??
        env.GATEWAY_AUDIT_CHECKPOINT_EVENT_THRESHOLD ??
        500,
    ),
    auditCheckpointIntervalSeconds: Number(
      env.GATEWAY_AUDIT_CHECKPOINT_INTERVAL_SECONDS ?? 900,
    ),
    auditCheckpointingEnabled:
      env.GATEWAY_AUDIT_CHECKPOINTING_ENABLED !== 'false',
    auditCheckpointMaxPerTick: Number(
      env.GATEWAY_AUDIT_CHECKPOINT_MAX_PER_TICK ?? 5,
    ),
    auditAnchoringEnabled: env.GATEWAY_AUDIT_ANCHORING_ENABLED === 'true',
    auditAnchorProvider:
      env.GATEWAY_AUDIT_ANCHOR_PROVIDER === 'filesystem'
        ? 'filesystem'
        : env.GATEWAY_AUDIT_ANCHOR_PROVIDER === 's3'
          ? 's3'
          : 'none',
    auditAnchorLocation: env.GATEWAY_AUDIT_ANCHOR_LOCATION,
    auditAnchorOnCheckpoint: env.GATEWAY_AUDIT_ANCHOR_ON_CHECKPOINT !== 'false',
    auditAnchorS3Bucket: env.GATEWAY_AUDIT_ANCHOR_S3_BUCKET,
    auditAnchorS3Prefix: env.GATEWAY_AUDIT_ANCHOR_S3_PREFIX,
    auditAnchorS3Region: env.GATEWAY_AUDIT_ANCHOR_S3_REGION ?? env.AWS_REGION,
    auditAnchorS3Endpoint: env.GATEWAY_AUDIT_ANCHOR_S3_ENDPOINT,
    auditAnchorMaxAttempts: Number(env.GATEWAY_AUDIT_ANCHOR_MAX_ATTEMPTS ?? 8),
    auditAnchorWorkerIntervalMs: Number(
      env.GATEWAY_AUDIT_ANCHOR_WORKER_INTERVAL_MS ?? 5000,
    ),
    auditAnchorAsync: env.GATEWAY_AUDIT_ANCHOR_ASYNC !== 'false',
    policyEngineMode,
    policyApproverKey: env.GATEWAY_POLICY_APPROVER_KEY ?? adminApiKey,
    policyActivatorKey: env.GATEWAY_POLICY_ACTIVATOR_KEY ?? adminApiKey,
    allowLegacyEngine,
    requireVaultKey,
    allowDetokenization,
    actorRegistryMode,
  };
}
