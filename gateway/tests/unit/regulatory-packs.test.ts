import { describe, expect, it } from 'vitest';
import {
  InMemoryPolicyRepository,
  PackBackedEnterprisePdp,
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
  allowed_operations: ['summarize'],
};

describe('Enigma EPA M4 regulatory overlays', () => {
  it('includes HIPAA/Financial/Legal packs in default snapshot', () => {
    const repo = new InMemoryPolicyRepository();
    const snap = repo.getSnapshot();
    expect(snap.packs.map((p) => p.pack_id)).toEqual(
      expect.arrayContaining(['pack_hipaa', 'pack_financial', 'pack_legal']),
    );
  });

  it('HIPAA overlay reinforces PHI local-only obligations', async () => {
    const repo = new InMemoryPolicyRepository();
    const pdp = new PackBackedEnterprisePdp(repo);
    const decision = await pdp.evaluateLegacyRequest({
      user: clinician,
      application: clinicalApp,
      operation: 'summarize',
      requestedModel: 'local-general-v1',
      availableModels: ['local-general-v1', 'cloud-public-gpt'],
      environment: 'prod',
      classification: {
        sensitivity: 'PHI',
        confidence: 0.99,
        risk: 'high',
        reason_codes: ['HEALTH'],
      },
      deploymentMode: 'connected',
    });
    expect(decision.decision).toBe('ALLOW');
    expect(decision.obligations.some((o) => o.code === 'LOCAL_MODEL_ONLY')).toBe(true);
    expect(decision.obligations.some((o) => o.code === 'NO_EXTERNAL_TRANSMISSION')).toBe(
      true,
    );
    expect(decision.explanation.matched_conditions.some((m) => m.condition_key.includes('hipaa'))).toBe(
      true,
    );
  });

  it('activating financial overlay tokenizes FINANCIAL classification', async () => {
    const repo = new InMemoryPolicyRepository();
    repo.setPolicyStatus('pol_financial_tokenize', 'active');
    repo.setPackStatus('pack_financial', 'active');
    const pdp = new PackBackedEnterprisePdp(repo);
    const decision = await pdp.evaluateLegacyRequest({
      user: clinician,
      application: clinicalApp,
      operation: 'summarize',
      availableModels: ['local-general-v1'],
      environment: 'prod',
      classification: {
        sensitivity: 'FINANCIAL',
        confidence: 0.95,
        risk: 'medium',
        reason_codes: [],
      },
      deploymentMode: 'connected',
    });
    // Baseline treats unknown labels as ALLOW; financial overlay forces TOKENIZE.
    expect(decision.decision).toBe('TOKENIZE');
    expect(decision.reason_codes).toContain('FINANCIAL_REQUIRES_TOKENIZE');
  });

  it('financial overlay blocks WRITE of FINANCIAL data', async () => {
    const repo = new InMemoryPolicyRepository();
    repo.setPolicyStatus('pol_financial_tokenize', 'active');
    const pdp = new PackBackedEnterprisePdp(repo);
    const decision = await pdp.evaluateLegacyRequest({
      user: clinician,
      application: {
        ...clinicalApp,
        allowed_operations: ['summarize', 'write'],
      },
      operation: 'write',
      availableModels: ['local-general-v1'],
      environment: 'prod',
      classification: {
        sensitivity: 'FINANCIAL',
        confidence: 0.95,
        risk: 'high',
        reason_codes: [],
      },
      deploymentMode: 'connected',
    });
    expect(decision.decision).toBe('DENY');
    expect(decision.reason_codes).toContain('FINANCIAL_WRITE_REQUIRES_APPROVAL');
  });

  it('activating legal overlay blocks external models for LEGAL data', async () => {
    const repo = new InMemoryPolicyRepository();
    repo.setPolicyStatus('pol_legal_no_external', 'active');
    repo.setPackStatus('pack_legal', 'active');
    const pdp = new PackBackedEnterprisePdp(repo);
    const decision = await pdp.evaluateLegacyRequest({
      user: clinician,
      application: clinicalApp,
      operation: 'summarize',
      requestedModel: 'cloud-public-gpt',
      availableModels: ['local-general-v1', 'cloud-public-gpt'],
      environment: 'prod',
      classification: {
        sensitivity: 'LEGAL',
        confidence: 0.95,
        risk: 'high',
        reason_codes: [],
      },
      deploymentMode: 'connected',
    });
    expect(decision.decision).toBe('DENY');
    expect(decision.reason_codes).toContain('LEGAL_EXTERNAL_MODEL_BLOCKED');
  });
});
