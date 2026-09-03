import { describe, expect, it } from 'vitest';
import { DeterministicPolicyEngine } from '../../src/policy/engine.js';
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
  allowed_models: ['local-general-v1'],
  allowed_datasets: [],
  allowed_operations: ['summarize'],
};

describe('DeterministicPolicyEngine', () => {
  it('returns eligible local model on allow', async () => {
    const engine = new DeterministicPolicyEngine();
    const result = await engine.evaluateRequest({
      user: clinician,
      application: clinicalApp,
      operation: 'summarize',
      availableModels: ['local-general-v1', 'cloud-public-gpt'],
      environment: 'prod',
      classification: {
        sensitivity: 'Internal',
        confidence: 1,
        risk: 'low',
        reason_codes: [],
      },
      deploymentMode: 'connected',
    });

    expect(result.decision).toBe('ALLOW');
    expect(result.eligible_models).toEqual(['local-general-v1']);
  });

  it('blocks untrusted applications', async () => {
    const engine = new DeterministicPolicyEngine();
    const result = await engine.evaluateRequest({
      user: clinician,
      application: { ...clinicalApp, trust_level: 'untrusted' },
      operation: 'summarize',
      availableModels: ['local-general-v1'],
      environment: 'prod',
      classification: {
        sensitivity: 'Internal',
        confidence: 1,
        risk: 'low',
        reason_codes: [],
      },
      deploymentMode: 'connected',
    });

    expect(result.decision).toBe('BLOCK');
  });

  it('TOKENIZE on PII evidence', async () => {
    const engine = new DeterministicPolicyEngine();
    const result = await engine.evaluateRequest({
      user: clinician,
      application: clinicalApp,
      operation: 'summarize',
      availableModels: ['local-general-v1'],
      environment: 'prod',
      classification: {
        sensitivity: 'PII',
        confidence: 0.97,
        risk: 'medium',
        reason_codes: ['EMAIL_PATTERN'],
      },
      deploymentMode: 'connected',
    });

    expect(result.decision).toBe('TOKENIZE');
    expect(result.transforms[0]?.type).toBe('tokenize');
  });

  it('BLOCK PHI to public cloud', async () => {
    const engine = new DeterministicPolicyEngine();
    const result = await engine.evaluateRequest({
      user: clinician,
      application: {
        ...clinicalApp,
        allowed_models: ['local-general-v1', 'cloud-public-gpt'],
      },
      operation: 'summarize',
      requestedModel: 'cloud-public-gpt',
      availableModels: ['local-general-v1', 'cloud-public-gpt'],
      environment: 'prod',
      classification: {
        sensitivity: 'PHI',
        confidence: 0.97,
        risk: 'high',
        reason_codes: ['HEALTH_INFORMATION'],
      },
      deploymentMode: 'connected',
    });

    expect(result.decision).toBe('BLOCK');
    expect(result.reason_codes).toContain('PHI_PUBLIC_CLOUD_BLOCKED');
  });

  it('BLOCK when core policy is disabled in store', async () => {
    const engine = new DeterministicPolicyEngine({
      defaultLocalModel: 'local-general-v1',
      isPolicyActive: async () => false,
    });
    const result = await engine.evaluateRequest({
      user: clinician,
      application: clinicalApp,
      operation: 'summarize',
      availableModels: ['local-general-v1'],
      environment: 'prod',
      classification: {
        sensitivity: 'Internal',
        confidence: 1,
        risk: 'low',
        reason_codes: [],
      },
      deploymentMode: 'connected',
    });

    expect(result.decision).toBe('BLOCK');
    expect(result.reason_codes).toContain('POLICY_DISABLED');
  });
});
