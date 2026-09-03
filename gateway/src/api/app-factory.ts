import { InMemoryAuditService } from '../audit/service.js';
import type { AuditService } from '../audit/service.js';
import { PostgresAuditService } from '../audit/pg-service.js';
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
} from '../models/index.js';
import type { ModelGateway, ModelProvider } from '../models/types.js';
import { DeterministicPolicyEngine, FailingPolicyEngine } from '../policy/engine.js';
import type { PolicyEngine } from '../policy/types.js';
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
} from '../transform/index.js';
import type { TransformService } from '../transform/types.js';
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
  /** Extra registry models (e.g. cloud ids) to prove eligibility blocking. */
  registryModels?: string[];
}

export function createPhase1Gateway(options: CreateGatewayOptions = {}) {
  const config: GatewayConfig = { ...loadConfig(), ...options.config };
  const seed = createPhase1Seed();
  const identityStore = options.identityStore ?? new InMemoryIdentityStore(seed);
  const identity = new IdentityService(identityStore);
  const audit = options.audit ?? new InMemoryAuditService();
  const persistence = options.persistence ?? 'memory';
  const policy =
    options.policy ??
    new DeterministicPolicyEngine({ defaultLocalModel: 'local-general-v1' });
  const interrogator = options.interrogator ?? new HybridDataInterrogator();
  const vault = new InMemoryTokenVault();
  const transform = options.transform ?? new InputTransformService(vault);
  const detokenizer = new PrivilegedDetokenizationService(vault);
  const responseInspector =
    options.responseInspector ?? new DeterministicResponseInspector();

  const registryEntries = defaultPhase4Registry().filter((m) =>
    options.registryModels ? options.registryModels.includes(m.model_id) : true,
  );
  const registry = new InMemoryModelRegistry(registryEntries);

  const localProvider = new LocalModelProvider(
    new StubLocalRuntime(['local-general-v1']),
    ['local-general-v1'],
  );

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
          checkDatabase: () => checkDatabase(config.databaseUrl),
        },
      }),
  };
}

/** Async appliance bootstrap — uses PostgreSQL when DATABASE_URL is configured. */
export async function createApplianceGateway(
  options: CreateGatewayOptions = {},
) {
  const config: GatewayConfig = { ...loadConfig(), ...options.config };
  if (!config.databaseUrl) {
    return createPhase1Gateway({ ...options, config, persistence: 'memory' });
  }

  const { createPgPool } = await import('../shared/pg.js');
  const { PostgresIdentityStore } = await import('../identity/store.js');
  const pool = createPgPool(config.databaseUrl);
  const identityStore = new PostgresIdentityStore(pool);
  const audit = new PostgresAuditService(pool);

  // Verify connectivity early
  await checkDatabase(config.databaseUrl);

  return createPhase1Gateway({
    ...options,
    config,
    identityStore,
    audit,
    persistence: 'postgres',
  });
}

export {
  FailingPolicyEngine,
  FailingDataInterrogator,
  FailingTransformService,
  FailingResponseInspector,
};
