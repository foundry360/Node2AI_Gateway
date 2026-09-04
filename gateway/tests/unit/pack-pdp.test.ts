import { describe, expect, it } from 'vitest';
import { DeterministicPolicyEngine } from '../../src/policy/engine.js';
import {
  EnterprisePolicyAdapter,
  InMemoryPolicyRepository,
  PackBackedEnterprisePdp,
  toLegacyRequestResult,
} from '../../src/policy/enterprise/index.js';
import type { Application, User } from '../../src/identity/types.js';

const clinician: User = {
  user_id: 'u1',
  organization_id: 'o1',
  roles: ['clinician'],
  permissions: [],
  status: 'active',
};

const clinicalApp: Application = {
  application_id: 'a1',
  organization_id: 'o1',
  name: 'App',
  type: 'clinical',
  environment: 'prod',
  status: 'active',
  trust_level: 'trusted',
  allowed_models: ['local-general-v1', 'cloud-public-gpt'],
  allowed_datasets: [],
  allowed_operations: ['summarize', 'generate'],
};

function ctx(overrides: Record<string, unknown> = {}) {
  return {
    user: clinician,
    application: clinicalApp,
    operation: 'summarize',
    availableModels: ['local-general-v1', 'cloud-public-gpt'],
    environment: 'prod',
    classification: {
      sensitivity: 'Internal',
      confidence: 1,
      risk: 'low' as const,
      reason_codes: [] as string[],
    },
    deploymentMode: 'connected' as const,
    ...overrides,
  };
}

describe('Enigma EPA M2 pack-backed PDP', () => {
  const repo = new InMemoryPolicyRepository();
  const pdp = new PackBackedEnterprisePdp(repo);

  it('TEST 001 — PHI + external model → DENY', async () => {
    const decision = await pdp.evaluateLegacyRequest(
      ctx({
        requestedModel: 'cloud-public-gpt',
        classification: {
          sensitivity: 'PHI',
          confidence: 0.99,
          risk: 'high',
          reason_codes: ['HEALTH_INFORMATION'],
        },
      }) as never,
    );
    expect(decision.decision).toBe('DENY');
    expect(decision.reason_codes).toContain('PHI_PUBLIC_CLOUD_BLOCKED');
    expect(decision.applicable_policies[0]?.pack_id).toBe('pack_enterprise_baseline');
  });

  it('TEST 002 — PHI + approved local model → ALLOW + LOCAL_MODEL_ONLY', async () => {
    const decision = await pdp.evaluateLegacyRequest(
      ctx({
        requestedModel: 'local-general-v1',
        classification: {
          sensitivity: 'PHI',
          confidence: 0.99,
          risk: 'high',
          reason_codes: ['HEALTH_INFORMATION'],
        },
      }) as never,
    );
    expect(decision.decision).toBe('ALLOW');
    expect(decision.obligations.some((o) => o.code === 'LOCAL_MODEL_ONLY')).toBe(true);
    expect(decision.restrictions.eligible_models).toEqual(['local-general-v1']);
  });

  it('TEST 003 — PII + approved cloud → TOKENIZE', async () => {
    const decision = await pdp.evaluateLegacyRequest(
      ctx({
        classification: {
          sensitivity: 'PII',
          confidence: 0.97,
          risk: 'medium',
          reason_codes: ['EMAIL_PATTERN'],
        },
      }) as never,
    );
    expect(decision.decision).toBe('TOKENIZE');
    expect(decision.obligations.some((o) => o.code === 'TOKENIZE_PII')).toBe(true);
    expect(toLegacyRequestResult(decision).decision).toBe('TOKENIZE');
  });

  it('TEST 004 — Credential + any model → DENY', async () => {
    const decision = await pdp.evaluateLegacyRequest(
      ctx({
        classification: {
          sensitivity: 'Credential',
          confidence: 1,
          risk: 'high',
          reason_codes: ['API_KEY'],
        },
      }) as never,
    );
    expect(decision.decision).toBe('DENY');
    expect(decision.reason_codes).toContain('CREDENTIAL_CONTENT_BLOCKED');
  });

  it('TEST 005 — WRITE not allowlisted → DENY (approval framework placeholder)', async () => {
    const decision = await pdp.evaluateLegacyRequest(
      ctx({ operation: 'write' }) as never,
    );
    expect(decision.decision).toBe('DENY');
    expect(decision.reason_codes).toContain('OPERATION_NOT_ALLOWED');
  });

  it('compare mode: pack vs legacy has zero mismatches on baseline fixtures', async () => {
    const legacy = new DeterministicPolicyEngine({ defaultLocalModel: 'local-general-v1' });
    const mismatches: unknown[] = [];
    const adapter = new EnterprisePolicyAdapter(pdp, legacy, {
      mode: 'compare',
      onMismatch: (m) => mismatches.push(m),
    });

    const fixtures = [
      ctx(),
      ctx({
        requestedModel: 'cloud-public-gpt',
        classification: {
          sensitivity: 'PHI',
          confidence: 0.99,
          risk: 'high',
          reason_codes: ['HEALTH_INFORMATION'],
        },
      }),
      ctx({
        classification: {
          sensitivity: 'PII',
          confidence: 0.97,
          risk: 'medium',
          reason_codes: ['EMAIL'],
        },
      }),
      ctx({
        classification: {
          sensitivity: 'Credential',
          confidence: 1,
          risk: 'high',
          reason_codes: [],
        },
      }),
      ctx({ application: { ...clinicalApp, trust_level: 'untrusted' } }),
    ];

    for (const f of fixtures) {
      await adapter.evaluateRequest(f as never);
    }
    expect(mismatches).toHaveLength(0);
  });

  it('fail-closes when baseline input policy is suspended in repository', async () => {
    const isolated = new InMemoryPolicyRepository();
    isolated.setPolicyStatus('pol_phase2_core', 'suspended');
    const isolatedPdp = new PackBackedEnterprisePdp(isolated);
    const decision = await isolatedPdp.evaluateLegacyRequest(ctx() as never);
    expect(decision.decision).toBe('DENY');
    expect(decision.reason_codes).toContain('POLICY_DISABLED');
  });
});
