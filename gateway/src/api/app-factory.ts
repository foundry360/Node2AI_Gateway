import { InMemoryAuditService } from '../audit/service.js';
import type { AuditService } from '../audit/service.js';
import { PostgresAuditService, PostgresCheckpointStore } from '../audit/pg-service.js';
import {
  IntegrityAuditService,
  InMemoryCheckpointStore,
  type CheckpointStore,
} from '../audit/integrity-service.js';
import {
  InMemoryAuditSequenceAllocator,
  PostgresAuditSequenceAllocator,
  type AuditSequenceAllocator,
} from '../audit/sequence.js';
import {
  createJoseCheckpointSigner,
  createJoseCheckpointVerifier,
  loadCheckpointPrivateJwk,
  loadCheckpointPublicJwks,
  type CheckpointSigner,
  type CheckpointVerifier,
} from '../audit/checkpoint.js';
import { FilesystemEvidenceAnchorStore } from '../audit/anchor-store.js';
import {
  InMemoryEvidenceAnchorRepository,
  PostgresEvidenceAnchorRepository,
} from '../audit/anchor-repository.js';
import {
  InMemoryAnchorJobRepository,
  PostgresAnchorJobRepository,
} from '../audit/anchor-job.js';
import { EvidenceAnchoringService } from '../audit/anchoring-service.js';
import { EvidenceLifecycleWorker } from '../audit/anchor-worker.js';
import { createS3EvidenceAnchorStore } from '../audit/providers/s3/index.js';
import type { EvidenceAnchorStore } from '../audit/anchor.js';
import {
  InMemoryActionOutcomeStore,
  PostgresActionOutcomeStore,
  type ActionOutcomeStore,
} from '../audit/outcome-store.js';
import {
  InMemoryActorRegistry,
  PostgresActorRegistry,
  type ActorRegistry,
} from '../actors/index.js';
import type { JWK } from 'jose';
import { IdentityService } from '../identity/service.js';
import { InMemoryIdentityStore } from '../identity/store.js';
import type { IdentityStore } from '../identity/store.js';
import type { ApiKeyRecord, Application, Organization, User } from '../identity/types.js';
import {
  FailingDataInterrogator,
  HybridDataInterrogator,
} from '../interrogation/index.js';
import type { DataInterrogator } from '../interrogation/types.js';
import {
  DefaultModelGateway,
  ExternalOpenAICompatibleProvider,
  InMemoryModelRegistry,
  InMemoryProviderCredentialStore,
  LocalModelProvider,
  StubLocalRuntime,
  defaultPhase4Registry,
  loadModelsFromPostgres,
} from '../models/index.js';
import type { ProviderCredentialStore } from '../models/provider-credentials.js';
import { ResolvingLocalRuntime } from '../models/runtime/resolving.js';
import type { LocalModelRuntime, ModelGateway, ModelProvider } from '../models/types.js';
import { DeterministicPolicyEngine, FailingPolicyEngine } from '../policy/engine.js';
import {
  EnterprisePolicyAdapter,
  InMemoryPolicyRepository,
  PackBackedEnterprisePdp,
} from '../policy/enterprise/index.js';
import {
  createGovernanceBaseline,
  InMemoryChangeGovernanceRepository,
} from '../policy/enterprise/change-governance/index.js';
import { InMemoryPolicyStore, PostgresPolicyStore } from '../policy/store.js';
import type { PolicyStore } from '../policy/store.js';
import type { PolicyEngine } from '../policy/types.js';
import type { PgQueryable } from '../shared/pg.js';
import type { MutableModelRegistry } from '../models/registry.js';
import {
  DeterministicResponseInspector,
  FailingResponseInspector,
} from '../response/index.js';
import type { ResponseInspector } from '../response/inspector.js';
import type { GatewayConfig } from '../shared/config.js';
import { loadConfig } from '../shared/config.js';
import {
  assertDatabaseReadyForAppliance,
  checkDatabase,
} from '../shared/db-health.js';
import { hashApiKey } from '../shared/ids.js';
import {
  FailingTransformService,
  InputTransformService,
  InMemoryTokenVault,
  PrivilegedDetokenizationService,
  PostgresTokenVault,
} from '../transform/index.js';
import type { TokenVault, TransformService } from '../transform/types.js';
import { GatewayOrchestrator } from './orchestrator.js';
import { AGENT_ENIGMA_CLINICAL_TARGET_ID } from './admin-routes.js';
import { buildServer } from './server.js';
import {
  hashAdminPassword,
  type AdminUserRecord,
} from '../admin/authz.js';
import { InMemoryAdminUserStore } from '../admin/admin-users.js';
import type { AdminUserStore } from '../admin/authz.js';
import {
  InMemoryDeploymentIdentityStore,
  PostgresDeploymentIdentityStore,
  type DeploymentIdentityStore,
} from '../admin/deployment-identity.js';

async function buildAuditIntegrityExtras(
  config: GatewayConfig,
  opts: {
    deploymentIdentity?: DeploymentIdentityStore;
    db?: PgQueryable;
    sequenceAllocator?: AuditSequenceAllocator;
    checkpointStore?: CheckpointStore;
  },
): Promise<{
  sequenceAllocator?: AuditSequenceAllocator;
  checkpointStore?: CheckpointStore;
  checkpointSigner: CheckpointSigner | null;
  checkpointVerifier: CheckpointVerifier | null;
  deploymentId?: () => Promise<string>;
  anchoring: EvidenceAnchoringService | null;
  publicJwks: Map<string, JWK> | null;
}> {
  const sequenceAllocator =
    opts.sequenceAllocator ??
    (opts.db
      ? new PostgresAuditSequenceAllocator(opts.db)
      : new InMemoryAuditSequenceAllocator());
  const checkpointStore =
    opts.checkpointStore ??
    (opts.db ? new PostgresCheckpointStore(opts.db) : new InMemoryCheckpointStore());

  let checkpointSigner: CheckpointSigner | null = null;
  let checkpointVerifier: CheckpointVerifier | null = null;
  let publicJwks: Map<string, JWK> | null = null;
  try {
    const priv = await loadCheckpointPrivateJwk(config.auditCheckpointPrivateJwk);
    if (priv) {
      checkpointSigner = createJoseCheckpointSigner(priv.jwk, priv.keyId);
    }
    const pubs = await loadCheckpointPublicJwks(config.auditCheckpointPublicJwks);
    if (pubs.size > 0) {
      publicJwks = pubs;
      checkpointVerifier = createJoseCheckpointVerifier(pubs);
    } else if (priv) {
      const { d: _d, ...pub } = priv.jwk;
      publicJwks = new Map([[priv.keyId, { ...pub, kid: priv.keyId, alg: 'EdDSA' }]]);
      checkpointVerifier = createJoseCheckpointVerifier(publicJwks);
    }
  } catch {
    checkpointSigner = null;
    checkpointVerifier = null;
    publicJwks = null;
  }

  const deploymentId = opts.deploymentIdentity
    ? () => opts.deploymentIdentity!.getOrCreateDeploymentId()
    : undefined;

  let anchoring: EvidenceAnchoringService | null = null;
  if (config.auditAnchoringEnabled && config.auditAnchorProvider !== 'none') {
    let store: EvidenceAnchorStore | null = null;
    if (config.auditAnchorProvider === 'filesystem') {
      const location =
        config.auditAnchorLocation?.trim() ||
        '/var/lib/enigma/audit-anchors';
      store = new FilesystemEvidenceAnchorStore(location);
    } else if (config.auditAnchorProvider === 's3') {
      const bucket = config.auditAnchorS3Bucket?.trim();
      const region = config.auditAnchorS3Region?.trim();
      if (!bucket || !region) {
        throw new Error(
          'GATEWAY_AUDIT_ANCHOR_S3_BUCKET and GATEWAY_AUDIT_ANCHOR_S3_REGION are required when GATEWAY_AUDIT_ANCHOR_PROVIDER=s3',
        );
      }
      store = createS3EvidenceAnchorStore({
        bucket,
        region,
        prefix: config.auditAnchorS3Prefix,
        endpoint: config.auditAnchorS3Endpoint,
        forcePathStyle: Boolean(config.auditAnchorS3Endpoint),
      });
    }

    if (store) {
      const repo = opts.db
        ? new PostgresEvidenceAnchorRepository(opts.db)
        : new InMemoryEvidenceAnchorRepository();
      const jobs = opts.db
        ? new PostgresAnchorJobRepository(opts.db)
        : new InMemoryAnchorJobRepository();
      anchoring = new EvidenceAnchoringService(store, repo, publicJwks, jobs, {
        async: config.auditAnchorAsync,
        maxAttempts: config.auditAnchorMaxAttempts,
      });
    }
  }

  return {
    sequenceAllocator,
    checkpointStore,
    checkpointSigner,
    checkpointVerifier,
    deploymentId,
    anchoring,
    publicJwks,
  };
}
function seedAdminUsers(): AdminUserRecord[] {
  const now = new Date().toISOString();
  const password = process.env.ADMIN_UI_PASSWORD ?? 'admin';
  const hash = hashAdminPassword(password);
  return [
    {
      user_id: 'admin_user_administrator',
      organization_id: 'org_demo',
      username: process.env.ADMIN_UI_USERNAME ?? 'admin',
      password_hash: hash,
      role: 'ADMINISTRATOR',
      status: 'ACTIVE',
      created_at: now,
      updated_at: now,
    },
    {
      user_id: 'admin_user_reviewer',
      organization_id: 'org_demo',
      username: 'reviewer',
      password_hash: hashAdminPassword('reviewer'),
      role: 'GOVERNANCE_REVIEWER',
      status: 'ACTIVE',
      created_at: now,
      updated_at: now,
    },
    {
      user_id: 'admin_user_operator',
      organization_id: 'org_demo',
      username: 'operator',
      password_hash: hashAdminPassword('operator'),
      role: 'OPERATOR',
      status: 'ACTIVE',
      created_at: now,
      updated_at: now,
    },
    {
      user_id: 'admin_user_readonly',
      organization_id: 'org_demo',
      username: 'readonly',
      password_hash: hashAdminPassword('readonly'),
      role: 'READ_ONLY',
      status: 'ACTIVE',
      created_at: now,
      updated_at: now,
    },
  ];
}

/** Well-known demo credentials (tests + local dev). */
export const PHASE1_DEMO_API_KEY = 'n2ai_test_key_approved_app';
export const GENERAL_APP_API_KEY = 'n2ai_test_key_general_app';

function seedAgentClinicalBaseline(
  repo: InMemoryChangeGovernanceRepository,
): void {
  if (repo.latestBaseline('application', AGENT_ENIGMA_CLINICAL_TARGET_ID)) {
    return;
  }
  repo.saveBaseline(
    createGovernanceBaseline({
      target_type: 'application',
      target_id: AGENT_ENIGMA_CLINICAL_TARGET_ID,
      organization_id: 'org_demo',
        configuration: {
          ui_label: 'Enigma Clinical Copilot',
          surface: 'demo',
        },
      capabilities: {
        write_capability: false,
        autonomy_level: 'ASSISTIVE',
        tools: [{ id: 'summarize_patient', write: false }],
        model_id: 'local-general-v1',
      },
    }),
  );
}

export function createPhase1Seed(): {
  organizations: Organization[];
  applications: Application[];
  users: User[];
  apiKeys: ApiKeyRecord[];
} {
  const org: Organization = {
    organization_id: 'org_demo',
    name: 'Demo Healthcare Org',
    status: 'active',
    configuration: {},
  };

  const approvedApp: Application = {
    application_id: 'app_clinical',
    organization_id: 'org_demo',
    name: 'Approved Clinical App',
    type: 'clinical',
    environment: 'prod',
    status: 'active',
    trust_level: 'trusted',
    // Cloud may be allowlisted for controlled external processing; default
    // policy still DENYs PHI+cloud without governance evidence + TOKENIZE.
    allowed_models: ['local-general-v1', 'cloud-public-gpt'],
    allowed_datasets: ['ds_clinical_notes'],
    allowed_operations: ['summarize', 'classify', 'generate', 'write'],
  };

  const restrictedModelApp: Application = {
    application_id: 'app_limited',
    organization_id: 'org_demo',
    name: 'Limited App',
    type: 'custom',
    environment: 'prod',
    status: 'active',
    trust_level: 'standard',
    allowed_models: ['local-general-v1'],
    allowed_datasets: [],
    allowed_operations: ['summarize'],
  };

  const generalApp: Application = {
    application_id: 'app_general',
    organization_id: 'org_demo',
    name: 'General Integration App',
    type: 'custom',
    environment: 'prod',
    status: 'active',
    trust_level: 'standard',
    allowed_models: ['local-general-v1', 'cloud-public-gpt'],
    allowed_datasets: [],
    allowed_operations: ['summarize', 'generate'],
  };

  const user: User = {
    user_id: 'user_clinician',
    organization_id: 'org_demo',
    roles: ['clinician'],
    permissions: ['ai:summarize'],
    status: 'active',
  };

  const apiKeys: ApiKeyRecord[] = [
    {
      api_key_id: 'key_clinical',
      organization_id: 'org_demo',
      application_id: 'app_clinical',
      key_prefix: 'n2ai_test',
      key_hash: hashApiKey(PHASE1_DEMO_API_KEY),
      status: 'active',
    },
    {
      api_key_id: 'key_limited',
      organization_id: 'org_demo',
      application_id: 'app_limited',
      key_prefix: 'n2ai_lim',
      key_hash: hashApiKey('n2ai_test_key_limited_app'),
      status: 'active',
    },
    {
      api_key_id: 'key_general',
      organization_id: 'org_demo',
      application_id: 'app_general',
      key_prefix: 'n2ai_gen',
      key_hash: hashApiKey(GENERAL_APP_API_KEY),
      status: 'active',
    },
  ];

  return {
    organizations: [org],
    applications: [approvedApp, restrictedModelApp, generalApp],
    users: [user],
    apiKeys,
  };
}

export interface CreateGatewayOptions {
  config?: Partial<GatewayConfig>;
  policy?: PolicyEngine;
  interrogator?: DataInterrogator;
  transform?: TransformService;
  responseInspector?: ResponseInspector;
  models?: ModelGateway;
  providers?: ModelProvider[];
  externalFetch?: typeof fetch;
  identityStore?: IdentityStore;
  audit?: AuditService;
  persistence?: 'memory' | 'postgres';
  localRuntime?: LocalModelRuntime;
  /** Force stub runtime in tests (default true when unset in createPhase1Gateway). */
  useStubRuntime?: boolean;
  /** Extra registry models (e.g. cloud ids) to prove eligibility blocking. */
  registryModels?: string[];
  policyStore?: PolicyStore;
  registry?: MutableModelRegistry;
  db?: PgQueryable;
  vault?: TokenVault;
  policyRepository?: import('../policy/enterprise/pg-repository.js').PolicyRepository;
  providerCredentials?: ProviderCredentialStore;
  adminUsers?: AdminUserStore;
  /** Installation-scoped deployment identity store (defaults by persistence). */
  deploymentIdentity?: DeploymentIdentityStore;
  /** Test-only license install verification keyring. */
  licenseInstallKeyring?: readonly import('../admin/license-keys.js').LicensePublicKeyEntry[];
  /** Optional Phase 1 integrity wiring (tests / appliance). */
  auditSequenceAllocator?: AuditSequenceAllocator;
  auditCheckpointStore?: CheckpointStore;
  /** Phase 4 client Outcome projection store. */
  outcomeStore?: ActionOutcomeStore;
  /**
   * Phase A Agent/Tool registry.
   * Pass `null` to simulate registry dependency unavailable (fail-closed tests).
   */
  actorRegistry?: ActorRegistry | null;
}

export function createPhase1Gateway(options: CreateGatewayOptions = {}) {
  const config: GatewayConfig = { ...loadConfig(), ...options.config };
  // Tests default to legacy attestation unless explicitly testing enforce/shadow.
  if (options.config?.actorRegistryMode === undefined) {
    config.actorRegistryMode = 'off';
  }
  // Keep approve/activate keys aligned with admin key when tests override adminApiKey only.
  if (options.config?.adminApiKey) {
    config.policyApproverKey =
      options.config.policyApproverKey ?? options.config.adminApiKey;
    config.policyActivatorKey =
      options.config.policyActivatorKey ?? options.config.adminApiKey;
  }
  const seed = createPhase1Seed();
  const identityStore = options.identityStore ?? new InMemoryIdentityStore(seed);
  const identity = new IdentityService(identityStore);
  const deploymentIdentity =
    options.deploymentIdentity ??
    (options.db
      ? new PostgresDeploymentIdentityStore(options.db)
      : new InMemoryDeploymentIdentityStore());
  const rawAudit = options.audit ?? new InMemoryAuditService();
  let audit: AuditService;
  if (options.audit instanceof IntegrityAuditService) {
    audit = options.audit;
  } else {
    // Memory/tests: HMAC chain only unless caller provides Phase 1 wiring.
    const enableV1 = Boolean(
      options.auditSequenceAllocator ||
        options.db ||
        options.auditCheckpointStore,
    );
    audit = new IntegrityAuditService(rawAudit, config.auditSigningKey, {
      deploymentId: enableV1
        ? () => deploymentIdentity.getOrCreateDeploymentId()
        : undefined,
      sequenceAllocator:
        options.auditSequenceAllocator ??
        (enableV1 ? new InMemoryAuditSequenceAllocator() : undefined),
      checkpointStore:
        options.auditCheckpointStore ??
        (enableV1 ? new InMemoryCheckpointStore() : undefined),
      enableCanonicalV1: enableV1,
      checkpointEveryEvents: config.auditCheckpointEveryEvents,
      checkpointIntervalSeconds: config.auditCheckpointIntervalSeconds,
      checkpointingEnabled: config.auditCheckpointingEnabled,
      maxCheckpointsPerTick: config.auditCheckpointMaxPerTick,
    });
  }
  const persistence = options.persistence ?? 'memory';  const policyStore = options.policyStore ?? new InMemoryPolicyStore();
  const isPolicyActive = async (policyId: string) => {
    const latest = await policyStore.listLatest();
    const match = latest.find((p) => p.policy_id === policyId);
    if (!match) return true;
    return match.status === 'active';
  };
  const allowDetokenization = config.allowDetokenization;
  const legacyPolicy =
    options.policy ??
    new DeterministicPolicyEngine({
      defaultLocalModel: 'local-general-v1',
      isPolicyActive,
      allowDetokenization,
    });
  const packRepo = options.policyRepository ?? new InMemoryPolicyRepository();
  const packPdp = new PackBackedEnterprisePdp(packRepo, {
    isPolicyActive,
    allowDetokenization,
  });
  const policy: PolicyEngine =
    options.policy ??
    (config.policyEngineMode === 'legacy'
      ? legacyPolicy
      : new EnterprisePolicyAdapter(packPdp, legacyPolicy, {
          mode: config.policyEngineMode,
        }));
  const interrogator = options.interrogator ?? new HybridDataInterrogator();
  if (config.requireVaultKey && !config.vaultEncryptionKey) {
    throw new Error('GATEWAY_VAULT_KEY is required (GATEWAY_REQUIRE_VAULT_KEY=true)');
  }
  const vault =
    options.vault ??
    new InMemoryTokenVault(
      config.vaultEncryptionKey ??
        (config.requireVaultKey ? undefined : config.auditSigningKey),
    );
  const transform = options.transform ?? new InputTransformService(vault);
  const detokenizer = new PrivilegedDetokenizationService(vault);
  const responseInspector =
    options.responseInspector ?? new DeterministicResponseInspector();

  const providerCredentials: ProviderCredentialStore =
    options.providerCredentials ??
    new InMemoryProviderCredentialStore(
      config.vaultEncryptionKey ?? 'test-provider-credential-key',
    );

  const registryEntries = defaultPhase4Registry().filter((m) =>
    options.registryModels ? options.registryModels.includes(m.model_id) : true,
  );
  const registry: MutableModelRegistry =
    options.registry ?? new InMemoryModelRegistry(registryEntries);
  const db = options.db;

  // Tests default to stub. Appliance bootstrap sets useStubRuntime: false.
  const localRuntime: LocalModelRuntime =
    options.localRuntime ??
    (options.useStubRuntime === false
      ? new ResolvingLocalRuntime(
          config.localRuntimeMode,
          config.deploymentMode === 'airgap',
          {
            ollamaBaseUrl: config.ollamaBaseUrl,
            modelMap: { 'local-general-v1': config.ollamaModelName },
          },
        )
      : new StubLocalRuntime(['local-general-v1']));

  const localProvider = new LocalModelProvider(localRuntime, ['local-general-v1']);

  const providers: ModelProvider[] = options.providers ?? [localProvider];

  // Connected mode may register external adapter; air-gap omits it entirely.
  if (!options.providers && config.deploymentMode === 'connected') {
    providers.push(
      new ExternalOpenAICompatibleProvider({
        baseUrl: config.externalProviderBaseUrl,
        apiKey: config.externalProviderApiKey,
        modelMap: { 'cloud-public-gpt': 'gpt-4o-mini' },
        fetchImpl: options.externalFetch,
        kind: 'cloud',
        credentialStore: providerCredentials,
      }),
    );
  }

  if (config.deploymentMode === 'airgap') {
    const localOnly = providers.filter((p) => p.kind === 'local');
    providers.length = 0;
    providers.push(...localOnly);
  }

  const models =
    options.models ??
    new DefaultModelGateway(registry, providers, config.deploymentMode);

  const changeGovernance = new InMemoryChangeGovernanceRepository();
  seedAgentClinicalBaseline(changeGovernance);
  const adminUsers: AdminUserStore =
    options.adminUsers ?? new InMemoryAdminUserStore(seedAdminUsers());

  const outcomeStore: ActionOutcomeStore =
    options.outcomeStore ??
    (options.db
      ? new PostgresActionOutcomeStore(options.db)
      : new InMemoryActionOutcomeStore());

  // Explicit null = dependency outage (enforce/shadow must fail closed).
  const actorRegistry: ActorRegistry | undefined =
    options.actorRegistry === null
      ? undefined
      : (options.actorRegistry ??
        (options.db
          ? new PostgresActorRegistry(options.db)
          : new InMemoryActorRegistry()));

  const orchestrator = new GatewayOrchestrator({
    config,
    identity,
    interrogator,
    policy,
    transform,
    responseInspector,
    detokenizer,
    models,
    audit,
    policyRepository: packRepo,
    identityStore,
    outcomeStore,
    resolveDeploymentId: () => deploymentIdentity.getOrCreateDeploymentId(),
    actorRegistry,
  });

  return {
    config,
    identity,
    identityStore,
    interrogator,
    policy,
    transform,
    responseInspector,
    vault,
    detokenizer,
    models,
    providers,
    registry,
    audit,
    persistence,
    localRuntime,
    policyStore,
    packRepo,
    packPdp,
    db,
    orchestrator,
    outcomeStore,
    actorRegistry,
    seed,
    providerCredentials,
    changeGovernance,
    adminUsers,
    deploymentIdentity,
    buildServer: () =>
      buildServer({
        orchestrator,
        admin: {
          config,
          identityStore,
          registry,
          providers,
          audit,
          persistence,
          policyStore,
          policyRepository: packRepo,
          packPdp,
          orchestrator,
          outcomeStore,
          actorRegistry,
          db,
          providerCredentials,
          changeGovernance,
          adminUsers,
          deploymentIdentity,
          licenseInstallKeyring: options.licenseInstallKeyring,
          checkDatabase: () => checkDatabase(config.databaseUrl),
          checkLocalRuntime: async () => {
            if ('status' in localRuntime && typeof (localRuntime as ResolvingLocalRuntime).status === 'function') {
              return (localRuntime as ResolvingLocalRuntime).status();
            }
            const available = await localRuntime.isAvailable();
            return {
              mode: config.localRuntimeMode,
              active_runtime: localRuntime.runtimeId,
              available,
              airgap: config.deploymentMode === 'airgap',
            };
          },
          localRuntime,
        },
      }),
  };
}

/** Async appliance bootstrap — uses PostgreSQL when DATABASE_URL is configured. */
export async function createApplianceGateway(
  options: CreateGatewayOptions = {},
) {
  const config: GatewayConfig = { ...loadConfig(), ...options.config };
  const base = {
    ...options,
    config,
    useStubRuntime: false as const,
  };

  if (!config.databaseUrl) {
    return createPhase1Gateway({
      ...base,
      persistence: 'memory',
      config: { ...config, requireVaultKey: config.requireVaultKey },
    });
  }

  if (!config.vaultEncryptionKey) {
    throw new Error(
      'GATEWAY_VAULT_KEY is required for appliance (Postgres) mode — refuse admin-key fallback',
    );
  }

  const { createPgPool } = await import('../shared/pg.js');
  const { PostgresIdentityStore } = await import('../identity/store.js');
  const { PostgresPolicyRepository } = await import('../policy/enterprise/pg-repository.js');
  const pool = createPgPool(config.databaseUrl);

  // Fail closed before bootstrap work when Product 1.0 schema is incomplete.
  await assertDatabaseReadyForAppliance(config.databaseUrl);

  const identityStore = new PostgresIdentityStore(pool);
  const rawAudit = new PostgresAuditService(pool);
  const deploymentIdentity = new PostgresDeploymentIdentityStore(pool);
  // First boot / existing install: ensure durable deployment_id exists.
  await deploymentIdentity.getOrCreateDeploymentId();
  const integrityExtras = await buildAuditIntegrityExtras(config, {
    deploymentIdentity,
    db: pool,
  });
  const audit = new IntegrityAuditService(rawAudit, config.auditSigningKey, {
    deploymentId: integrityExtras.deploymentId,
    sequenceAllocator: integrityExtras.sequenceAllocator,
    checkpointStore: integrityExtras.checkpointStore,
    checkpointSigner: integrityExtras.checkpointSigner,
    checkpointVerifier: integrityExtras.checkpointVerifier,
    enableCanonicalV1: true,
    checkpointEveryEvents: config.auditCheckpointEveryEvents,
    checkpointIntervalSeconds: config.auditCheckpointIntervalSeconds,
    checkpointingEnabled: config.auditCheckpointingEnabled,
    maxCheckpointsPerTick: config.auditCheckpointMaxPerTick,
    anchoring: integrityExtras.anchoring,
    anchorOnCheckpoint: config.auditAnchorOnCheckpoint,
  });
  await audit.bootstrapFromStore();
  const policyStore = new PostgresPolicyStore(pool);
  const policyRepository = await PostgresPolicyRepository.create(pool);
  const vault = new PostgresTokenVault(pool, config.vaultEncryptionKey);
  const { PostgresProviderCredentialStore } = await import(
    '../models/provider-credentials.js'
  );
  const providerCredentials = new PostgresProviderCredentialStore(
    pool,
    config.vaultEncryptionKey,
  );
  const dbModels = await loadModelsFromPostgres(pool);
  const registry = new InMemoryModelRegistry(
    dbModels.length > 0 ? dbModels : defaultPhase4Registry(),
  );

  const gateway = createPhase1Gateway({
    ...base,
    identityStore,
    audit,
    persistence: 'postgres',
    policyStore,
    policyRepository,
    registry,
    db: pool,
    vault,
    providerCredentials,
    deploymentIdentity,
    config: { ...config, requireVaultKey: true },
  });

  const lifecycleWorker = new EvidenceLifecycleWorker(
    audit,
    integrityExtras.anchoring,
    config.auditAnchorWorkerIntervalMs,
  );
  lifecycleWorker.start();

  return {
    ...gateway,
    stopBackgroundJobs: () => {
      lifecycleWorker.stop();
    },
  };
}

export {
  FailingPolicyEngine,
  FailingDataInterrogator,
  FailingTransformService,
  FailingResponseInspector,
};
