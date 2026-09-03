import { InMemoryAuditService } from '../audit/service.js';
import type { AuditService } from '../audit/service.js';
import { PostgresAuditService } from '../audit/pg-service.js';
import { IntegrityAuditService } from '../audit/integrity-service.js';
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
  LocalModelProvider,
  StubLocalRuntime,
  defaultPhase4Registry,
  loadModelsFromPostgres,
} from '../models/index.js';
import { ResolvingLocalRuntime } from '../models/runtime/resolving.js';
import type { LocalModelRuntime, ModelGateway, ModelProvider } from '../models/types.js';
import { DeterministicPolicyEngine, FailingPolicyEngine } from '../policy/engine.js';
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
import { checkDatabase } from '../shared/db-health.js';
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
import { buildServer } from './server.js';

/** Well-known demo credentials (tests + local dev). */
export const PHASE1_DEMO_API_KEY = 'n2ai_test_key_approved_app';
export const GENERAL_APP_API_KEY = 'n2ai_test_key_general_app';

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
    allowed_models: ['local-general-v1'],
    allowed_datasets: ['ds_clinical_notes'],
    allowed_operations: ['summarize', 'classify', 'generate'],
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
}

export function createPhase1Gateway(options: CreateGatewayOptions = {}) {
  const config: GatewayConfig = { ...loadConfig(), ...options.config };
  const seed = createPhase1Seed();
  const identityStore = options.identityStore ?? new InMemoryIdentityStore(seed);
  const identity = new IdentityService(identityStore);
  const rawAudit = options.audit ?? new InMemoryAuditService();
  const audit =
    options.audit instanceof IntegrityAuditService
      ? options.audit
      : new IntegrityAuditService(rawAudit, config.auditSigningKey);
  const persistence = options.persistence ?? 'memory';
  const policyStore = options.policyStore ?? new InMemoryPolicyStore();
  const policy =
    options.policy ??
    new DeterministicPolicyEngine({
      defaultLocalModel: 'local-general-v1',
      isPolicyActive: async (policyId) => {
        const latest = await policyStore.listLatest();
        const match = latest.find((p) => p.policy_id === policyId);
        // Empty/unseeded store: keep built-in engine behavior (active).
        if (!match) return true;
        return match.status === 'active';
      },
    });
  const interrogator = options.interrogator ?? new HybridDataInterrogator();
  const vault =
    options.vault ??
    new InMemoryTokenVault(config.vaultEncryptionKey ?? config.auditSigningKey);
  const transform = options.transform ?? new InputTransformService(vault);
  const detokenizer = new PrivilegedDetokenizationService(vault);
  const responseInspector =
    options.responseInspector ?? new DeterministicResponseInspector();

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
    db,
    orchestrator,
    seed,
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
          db,
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
    return createPhase1Gateway({ ...base, persistence: 'memory' });
  }

  const { createPgPool } = await import('../shared/pg.js');
  const { PostgresIdentityStore } = await import('../identity/store.js');
  const pool = createPgPool(config.databaseUrl);
  const identityStore = new PostgresIdentityStore(pool);
  const rawAudit = new PostgresAuditService(pool);
  const audit = new IntegrityAuditService(rawAudit, config.auditSigningKey);
  await audit.bootstrapFromStore();
  const policyStore = new PostgresPolicyStore(pool);
  const vaultKey = config.vaultEncryptionKey ?? config.auditSigningKey;
  const vault = new PostgresTokenVault(pool, vaultKey);
  const dbModels = await loadModelsFromPostgres(pool);
  const registry = new InMemoryModelRegistry(
    dbModels.length > 0 ? dbModels : defaultPhase4Registry(),
  );

  await checkDatabase(config.databaseUrl);

  return createPhase1Gateway({
    ...base,
    identityStore,
    audit,
    persistence: 'postgres',
    policyStore,
    registry,
    db: pool,
    vault,
  });
}

export {
  FailingPolicyEngine,
  FailingDataInterrogator,
  FailingTransformService,
  FailingResponseInspector,
};
