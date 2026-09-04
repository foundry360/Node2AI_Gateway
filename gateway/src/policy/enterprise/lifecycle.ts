import type { PolicyRequestContext } from '../types.js';
import type { PackBackedEnterprisePdp } from './pack-pdp.js';
import {
  interpretBaselineInput,
  type BaselineFacts,
  type PackPolicyMeta,
} from './packs/baseline.js';
import type { PolicyDecision } from './types.js';

export interface PolicyTestFixture {
  classification?: string;
  requested_model?: string;
  action?: string;
  application_type?: string;
  roles?: string[];
  available_models?: string[];
  allowed_operations?: string[];
  allowed_models?: string[];
  trust_level?: string;
  application_status?: string;
  deployment_mode?: string;
}

export interface PolicyTestSpec {
  test_id: string;
  name: string;
  fixture: PolicyTestFixture;
  expect_decision: string;
  expect_obligations?: string[];
  required: boolean;
}

/** Built-in TEST 001–005 for Baseline pack activation gates. */
export const BASELINE_POLICY_TESTS: PolicyTestSpec[] = [
  {
    test_id: 'TEST_001',
    name: 'PHI + external model → DENY',
    fixture: {
      classification: 'PHI',
      requested_model: 'cloud-public-gpt',
      action: 'summarize',
      application_type: 'clinical',
      roles: ['clinician'],
    },
    expect_decision: 'DENY',
    expect_obligations: [],
    required: true,
  },
  {
    test_id: 'TEST_002',
    name: 'PHI + approved local model → ALLOW',
    fixture: {
      classification: 'PHI',
      requested_model: 'local-general-v1',
      action: 'summarize',
      application_type: 'clinical',
      roles: ['clinician'],
    },
    expect_decision: 'ALLOW',
    expect_obligations: ['LOCAL_MODEL_ONLY'],
    required: true,
  },
  {
    test_id: 'TEST_003',
    name: 'PII + approved cloud → TOKENIZE',
    fixture: {
      classification: 'PII',
      available_models: ['local-general-v1', 'cloud-public-gpt'],
      action: 'summarize',
    },
    expect_decision: 'TOKENIZE',
    expect_obligations: ['TOKENIZE_PII'],
    required: true,
  },
  {
    test_id: 'TEST_004',
    name: 'Credential + any model → DENY',
    fixture: { classification: 'Credential', action: 'summarize' },
    expect_decision: 'DENY',
    expect_obligations: [],
    required: true,
  },
  {
    test_id: 'TEST_005',
    name: 'WRITE not allowlisted → DENY',
    fixture: {
      action: 'write',
      allowed_operations: ['summarize'],
    },
    expect_decision: 'DENY',
    expect_obligations: [],
    required: true,
  },
];

export function fixtureToFacts(fixture: PolicyTestFixture): BaselineFacts {
  const allowedOps = fixture.allowed_operations ?? ['summarize', 'generate', 'classify'];
  const allowedModels = fixture.allowed_models ?? [
    'local-general-v1',
    'cloud-public-gpt',
  ];
  const available = fixture.available_models ?? allowedModels;
  return {
    trust_level: fixture.trust_level ?? 'trusted',
    application_status: fixture.application_status ?? 'active',
    application_type: fixture.application_type ?? 'clinical',
    allowed_operations: allowedOps,
    allowed_models: allowedModels,
    operation: (fixture.action ?? 'summarize').toLowerCase(),
    classification: fixture.classification ?? 'Internal',
    deployment_mode: fixture.deployment_mode ?? 'connected',
    roles: fixture.roles ?? ['clinician'],
    requested_model: fixture.requested_model,
    available_models: available,
  };
}

export function fixtureToRequestContext(fixture: PolicyTestFixture): PolicyRequestContext {
  const facts = fixtureToFacts(fixture);
  return {
    user: {
      user_id: 'sim_user',
      organization_id: 'org_demo',
      roles: facts.roles,
      permissions: [],
      status: 'active',
    },
    application: {
      application_id: 'app_sim',
      organization_id: 'org_demo',
      name: 'Simulation App',
      type: facts.application_type,
      environment: 'prod',
      status: (facts.application_status === 'suspended' ? 'suspended' : 'active') as
        | 'active'
        | 'suspended'
        | 'deleted',
      trust_level: (['trusted', 'standard', 'untrusted'].includes(facts.trust_level)
        ? facts.trust_level
        : 'trusted') as 'trusted' | 'standard' | 'untrusted',
      allowed_models: facts.allowed_models,
      allowed_datasets: [],
      allowed_operations: facts.allowed_operations,
    },
    operation: facts.operation,
    requestedModel: facts.requested_model,
    availableModels: facts.available_models,
    environment: 'prod',
    classification: {
      sensitivity: facts.classification,
      confidence: 1,
      risk: 'medium',
      reason_codes: ['SIMULATION'],
    },
    deploymentMode: facts.deployment_mode === 'airgap' ? 'airgap' : 'connected',
  };
}

export function validatePolicyVersion(meta: PackPolicyMeta | undefined): {
  ok: boolean;
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!meta) {
    errors.push('Policy not found in EPA repository');
    return { ok: false, errors, warnings };
  }
  if (!meta.interpreter) {
    errors.push('Policy version missing interpreter');
  }
  if (!['baseline_input_v2', 'baseline_output_v5', 'hipaa_overlay_v1', 'financial_overlay_v1', 'legal_overlay_v1', 'framework_stub'].includes(meta.interpreter)) {
    errors.push(`Unknown interpreter: ${meta.interpreter}`);
  }
  if (!meta.version || meta.version < 1) {
    errors.push('Invalid policy version number');
  }
  if (meta.status === 'retired') {
    warnings.push(`Policy status is ${meta.status}`);
  }
  return { ok: errors.length === 0, errors, warnings };
}

export async function runPolicyTests(
  pdp: PackBackedEnterprisePdp,
  tests: PolicyTestSpec[] = BASELINE_POLICY_TESTS,
): Promise<{
  ok: boolean;
  results: Array<{
    test_id: string;
    name: string;
    passed: boolean;
    expected: string;
    actual: string;
    missing_obligations: string[];
  }>;
}> {
  const results = [];
  for (const t of tests) {
    const decision = await pdp.evaluateLegacyRequest(fixtureToRequestContext(t.fixture));
    const missing = (t.expect_obligations ?? []).filter(
      (code) => !decision.obligations.some((o) => o.code === code),
    );
    const passed = decision.decision === t.expect_decision && missing.length === 0;
    results.push({
      test_id: t.test_id,
      name: t.name,
      passed,
      expected: t.expect_decision,
      actual: decision.decision,
      missing_obligations: missing,
    });
  }
  return {
    ok: results.every((r) => r.passed),
    results,
  };
}

export async function simulatePolicy(
  pdp: PackBackedEnterprisePdp,
  fixture: PolicyTestFixture,
): Promise<PolicyDecision> {
  return pdp.evaluateLegacyRequest(fixtureToRequestContext(fixture));
}

/** Dry-run interpreter against pack meta without mutating state. */
export function dryRunAgainstMeta(
  fixture: PolicyTestFixture,
  meta: PackPolicyMeta,
): ReturnType<typeof interpretBaselineInput> {
  return interpretBaselineInput(fixtureToFacts(fixture), meta);
}
