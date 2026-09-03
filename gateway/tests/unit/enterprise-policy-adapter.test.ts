import { describe, expect, it } from 'vitest';
import { DeterministicPolicyEngine } from '../../src/policy/engine.js';
import {
  DelegatingEnterprisePdp,
  EnterprisePolicyAdapter,
  mapOperationToAction,
  toInputEvaluationRequest,
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
  allowed_models: ['local-general-v1'],
  allowed_datasets: [],
  allowed_operations: ['summarize'],
};

const baseCtx = {
  user: clinician,
  application: clinicalApp,
  operation: 'summarize',
  availableModels: ['local-general-v1', 'cloud-public-gpt'],
  environment: 'prod',
  classification: {
    sensitivity: 'Internal' as const,
    confidence: 1,
    risk: 'low' as const,
    reason_codes: [] as string[],
  },
  deploymentMode: 'connected' as const,
};

describe('Enigma enterprise policy M1 adapter', () => {
  it('maps operations into Enigma action taxonomy', () => {
    expect(mapOperationToAction('summarize')).toBe('SUMMARIZE');
    expect(mapOperationToAction('generate')).toBe('GENERATE');
  });

  it('builds EPA evaluation request from legacy context', () => {
    const req = toInputEvaluationRequest(baseCtx);
    expect(req.evaluation_phase).toBe('input');
    expect(req.action).toBe('SUMMARIZE');
    expect(req.subject.application_id).toBe('a1');
    expect(req.resource.classification).toBe('Internal');
    expect(req.evidence.classification).toBe('Internal');
  });

  it('round-trips ALLOW through adapter with zero decision drift', async () => {
    const legacy = new DeterministicPolicyEngine({ defaultLocalModel: 'local-general-v1' });
    const adapter = new EnterprisePolicyAdapter(
      new DelegatingEnterprisePdp(legacy),
      legacy,
      { mode: 'enterprise' },
    );

    const direct = await legacy.evaluateRequest(baseCtx);
    const via = await adapter.evaluateRequest(baseCtx);

    expect(via.decision).toBe(direct.decision);
    expect(via.eligible_models).toEqual(direct.eligible_models);
    expect(via.reason_codes).toEqual(direct.reason_codes);
    expect(via.policy_ids).toEqual(direct.policy_ids);
  });

  it('round-trips TOKENIZE and DENY/BLOCK', async () => {
    const legacy = new DeterministicPolicyEngine({ defaultLocalModel: 'local-general-v1' });
    const adapter = new EnterprisePolicyAdapter(
      new DelegatingEnterprisePdp(legacy),
      legacy,
      { mode: 'enterprise' },
    );

    const tokenizeCtx = {
      ...baseCtx,
      classification: {
        sensitivity: 'PII' as const,
        confidence: 0.97,
        risk: 'medium' as const,
        reason_codes: ['EMAIL_PATTERN'],
      },
    };
    const tDirect = await legacy.evaluateRequest(tokenizeCtx);
    const tVia = await adapter.evaluateRequest(tokenizeCtx);
    expect(tVia.decision).toBe('TOKENIZE');
    expect(tVia.decision).toBe(tDirect.decision);

    const denyCtx = {
      ...baseCtx,
      application: { ...clinicalApp, trust_level: 'untrusted' as const },
    };
    const dVia = await adapter.evaluateRequest(denyCtx);
    expect(dVia.decision).toBe('BLOCK');
  });

  it('compare mode enforces legacy on mismatch path', async () => {
    const legacy = new DeterministicPolicyEngine({ defaultLocalModel: 'local-general-v1' });
    const mismatches: unknown[] = [];
    const adapter = new EnterprisePolicyAdapter(
      new DelegatingEnterprisePdp(legacy),
      legacy,
      {
        mode: 'compare',
        onMismatch: (info) => mismatches.push(info),
      },
    );
    const result = await adapter.evaluateRequest(baseCtx);
    expect(result.decision).toBe('ALLOW');
    expect(mismatches).toHaveLength(0);
  });

  it('fail-closes pure evaluate without legacy bridge', async () => {
    const legacy = new DeterministicPolicyEngine({ defaultLocalModel: 'local-general-v1' });
    const pdp = new DelegatingEnterprisePdp(legacy);
    const decision = await pdp.evaluate(toInputEvaluationRequest(baseCtx));
    expect(decision.decision).toBe('DENY');
    expect(decision.fail_closed).toBe(true);
  });

  it('maps EPA DENY back to legacy BLOCK', () => {
    const mapped = toLegacyRequestResult({
      decision: 'DENY',
      reason: 'x',
      reason_codes: ['UNTRUSTED_APPLICATION'],
      applicable_policies: [{ policy_id: 'pol_phase2_core', version: 2 }],
      obligations: [],
      transformations: [],
      restrictions: { eligible_models: [] },
      approval_requirements: [],
      conflicts: [],
      explanation: { matched_conditions: [], rejected_conditions: [], final_reason: 'x' },
      evidence: {},
      evaluation_id: 'eval_test',
    });
    expect(mapped.decision).toBe('BLOCK');
  });
});
