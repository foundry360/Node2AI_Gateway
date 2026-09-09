import { describe, expect, it } from 'vitest';
import {
  createPhase1Gateway,
  GENERAL_APP_API_KEY,
  PHASE1_DEMO_API_KEY,
} from '../../src/api/app-factory.js';
import {
  computeDecisionHash,
  decisionBindingFromRecord,
} from '../../src/audit/decision-binding.js';
import { IntegrityAuditService } from '../../src/audit/integrity-service.js';
import { verifyAuditChain } from '../../src/audit/integrity.js';
import { PackBackedEnterprisePdp } from '../../src/policy/enterprise/pack-pdp.js';
import { InMemoryPolicyRepository } from '../../src/policy/enterprise/repository.js';
import {
  resolvePackContributions,
  type PackEvaluationContribution,
} from '../../src/policy/enterprise/policy-resolution.js';
import type { Application, User } from '../../src/identity/types.js';
import { ScriptedModelProvider } from '../../src/models/index.js';

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

const phiEntities = [
  {
    type: 'MRN',
    preview: 'A1…67',
    start: 14,
    end: 22,
    source: 'deterministic' as const,
  },
];

const controlledGov = {
  sensitive_data_processing: { external_processing_authorized: true },
};

function contrib(
  partial: Partial<PackEvaluationContribution> &
    Pick<PackEvaluationContribution, 'pack_id' | 'policy_id' | 'decision'>,
): PackEvaluationContribution {
  return {
    pack_name: partial.pack_id,
    pack_version: '1.0.0',
    policy_name: partial.policy_id,
    policy_version: 1,
    reason_codes: [],
    rule_ids: [],
    obligation_ids: [],
    obligations: [],
    controls: [],
    transforms: [],
    eligible_models: ['local-general-v1'],
    matched: [],
    applicable: true,
    ...partial,
  };
}

describe('Controlled PHI external TOKENIZE', () => {
  it('PHI + cloud + no evidence → DENY', async () => {
    const repo = new InMemoryPolicyRepository();
    const pdp = new PackBackedEnterprisePdp(repo);
    const decision = await pdp.evaluateLegacyRequest({
      user: clinician,
      application: clinicalApp,
      operation: 'summarize',
      requestedModel: 'cloud-public-gpt',
      availableModels: ['local-general-v1', 'cloud-public-gpt'],
      environment: 'prod',
      classification: {
        sensitivity: 'PHI',
        confidence: 0.99,
        risk: 'high',
        reason_codes: ['REGULATORY_APPLICABILITY:HIPAA'],
        entities: phiEntities,
      },
      deploymentMode: 'connected',
      purpose: 'treatment',
    });
    expect(decision.decision).toBe('DENY');
    expect(decision.reason_codes).toContain('PHI_PUBLIC_CLOUD_BLOCKED');
  });

  it('PHI + cloud + auth but no entity spans → DENY (tokenize unavailable)', async () => {
    const repo = new InMemoryPolicyRepository();
    const pdp = new PackBackedEnterprisePdp(repo);
    const decision = await pdp.evaluateLegacyRequest({
      user: clinician,
      application: clinicalApp,
      operation: 'summarize',
      requestedModel: 'cloud-public-gpt',
      availableModels: ['local-general-v1', 'cloud-public-gpt'],
      environment: 'prod',
      classification: {
        sensitivity: 'PHI',
        confidence: 0.99,
        risk: 'high',
        reason_codes: ['REGULATORY_APPLICABILITY:HIPAA'],
      },
      deploymentMode: 'connected',
      purpose: 'treatment',
      governance_context: controlledGov,
    });
    expect(decision.decision).toBe('DENY');
    expect(decision.reason_codes).toContain('PHI_PUBLIC_CLOUD_BLOCKED');
    expect(decision.reason_codes).toContain('TOKENIZE_UNAVAILABLE');
  });

  it('PHI + cloud + controls but model not allowlisted → DENY', async () => {
    const repo = new InMemoryPolicyRepository();
    const pdp = new PackBackedEnterprisePdp(repo);
    const decision = await pdp.evaluateLegacyRequest({
      user: clinician,
      application: {
        ...clinicalApp,
        allowed_models: ['local-general-v1'],
      },
      operation: 'summarize',
      requestedModel: 'cloud-public-gpt',
      availableModels: ['local-general-v1', 'cloud-public-gpt'],
      environment: 'prod',
      classification: {
        sensitivity: 'PHI',
        confidence: 0.99,
        risk: 'high',
        reason_codes: ['REGULATORY_APPLICABILITY:HIPAA'],
        entities: phiEntities,
      },
      deploymentMode: 'connected',
      purpose: 'treatment',
      governance_context: controlledGov,
    });
    expect(decision.decision).toBe('DENY');
    expect(decision.reason_codes).toContain('MODEL_NOT_ELIGIBLE');
  });

  it('PHI + cloud + controls + spans → TOKENIZE with cloud eligible', async () => {
    const gw = createPhase1Gateway();
    const decision = await gw.packPdp.evaluateLegacyRequest({
      user: clinician,
      application: {
        ...clinicalApp,
        application_id: 'app_clinical',
        organization_id: 'org_demo',
      },
      operation: 'summarize',
      requestedModel: 'cloud-public-gpt',
      availableModels: ['local-general-v1', 'cloud-public-gpt'],
      environment: 'prod',
      classification: {
        sensitivity: 'PHI',
        confidence: 0.99,
        risk: 'high',
        reason_codes: ['REGULATORY_APPLICABILITY:HIPAA'],
        entities: phiEntities,
      },
      deploymentMode: 'connected',
      purpose: 'treatment',
      governance_context: controlledGov,
    });
    expect(decision.decision).toBe('TOKENIZE');
    expect(decision.restrictions.eligible_models).toContain('cloud-public-gpt');
    expect(decision.transformations.some((t) => t.type === 'tokenize')).toBe(true);
    expect(decision.obligations.some((o) => o.code === 'LOCAL_MODEL_ONLY')).toBe(
      false,
    );
  });

  it('Gateway E2E: external model receives tokenized content, not raw MRN', async () => {
    const original = 'Clinical note MRN: A1234567 patient presents with fever';
    let seenContent = '';

    const cloudProvider = new ScriptedModelProvider(
      ['cloud-public-gpt'],
      'Summary without identifiers.',
      { providerId: 'external-openai-compatible', kind: 'cloud' },
    );
    const origExecute = cloudProvider.execute.bind(cloudProvider);
    cloudProvider.execute = async (req) => {
      seenContent = req.messages.map((m) => m.content).join('\n');
      return origExecute(req);
    };

    const local = new ScriptedModelProvider(['local-general-v1'], 'local ok', {
      providerId: 'local-runtime',
    });

    const gw = createPhase1Gateway({
      providers: [local, cloudProvider],
      useStubRuntime: true,
    });

    const available = gw.models.listAvailableModels();
    const pre = await gw.packPdp.evaluateLegacyRequest({
      user: {
        user_id: 'user_clinician',
        organization_id: 'org_demo',
        roles: ['clinician'],
        permissions: ['ai:summarize'],
        status: 'active',
      },
      application: gw.seed.applications.find((a) => a.application_id === 'app_clinical')!,
      operation: 'summarize',
      requestedModel: 'cloud-public-gpt',
      availableModels: available,
      environment: 'prod',
      classification: {
        sensitivity: 'PHI',
        confidence: 0.99,
        risk: 'high',
        reason_codes: ['REGULATORY_APPLICABILITY:HIPAA', 'ENTITY:MRN'],
        entities: [
          {
            type: 'MRN',
            start: original.indexOf('A1234567'),
            end: original.indexOf('A1234567') + 8,
            preview: 'A1…67',
            source: 'deterministic',
          },
        ],
      },
      deploymentMode: 'connected',
      purpose: 'treatment',
      governance_context: controlledGov,
    });
    expect(pre.decision).toBe('TOKENIZE');
    expect(pre.restrictions.eligible_models).toContain('cloud-public-gpt');

    const result = await gw.orchestrator.completions(PHASE1_DEMO_API_KEY, {
      application_id: 'app_clinical',
      user: { id: 'user_clinician' },
      operation: 'summarize',
      model: 'cloud-public-gpt',
      purpose: 'treatment',
      governance_context: controlledGov,
      messages: [{ role: 'user', content: original }],
    });

    expect(result.body.status).toBe('approved');
    const last = (await gw.audit.list()).at(-1)!;
    expect({
      model: last.model_selected,
      provider: last.provider,
      xform: last.input_transformation,
      seen: seenContent.slice(0, 160),
    }).toEqual({
      model: 'cloud-public-gpt',
      provider: 'external-openai-compatible',
      xform: 'tokenize',
      seen: expect.stringMatching(/\{\{TOK_/),
    });
    expect(seenContent).not.toContain('A1234567');
    expect(last.policy_decision).toBe('TOKENIZE');
    expect(last.response_hash).toBeTruthy();
  });

  it('TOKENIZE + DENY contribution → CONFLICT unresolved → REVIEW', () => {
    const resolved = resolvePackContributions([
      contrib({
        pack_id: 'pack_enterprise_baseline',
        policy_id: 'pol_phase2_core',
        decision: 'TOKENIZE',
        reason_codes: ['PHI_REQUIRES_TOKENIZE'],
        obligations: [{ code: 'TOKENIZE_PII' }],
        eligible_models: ['cloud-public-gpt'],
      }),
      contrib({
        pack_id: 'pack_deny_test',
        policy_id: 'pol_deny',
        decision: 'DENY',
        reason_codes: ['OTHER_DENY'],
      }),
    ]);
    expect(resolved.resolution.category).toMatch(/CONFLICT|UNRESOLVED/);
    expect(resolved.decision).toBe('REVIEW');
    expect(resolved.reason_codes).toContain('POLICY_CONFLICT_UNRESOLVED');
  });

  it('machine DENY remains not human-review eligible (PHI cloud no evidence)', async () => {
    const gw = createPhase1Gateway();
    const result = await gw.orchestrator.completions(PHASE1_DEMO_API_KEY, {
      application_id: 'app_clinical',
      user: { id: 'user_clinician' },
      operation: 'summarize',
      model: 'cloud-public-gpt',
      messages: [
        {
          role: 'user',
          content: 'Clinical note MRN: A1234567 patient presents with fever',
        },
      ],
    });
    expect(result.body.status).toBe('blocked');
    if (result.body.status === 'blocked') {
      expect(result.body.reason_code).toBe('PHI_PUBLIC_CLOUD_BLOCKED');
    }
    const last = (await gw.audit.list()).at(-1)!;
    expect(last.metadata?.safety_hold).not.toBe(true);
    expect(last.metadata?.machine_decision).not.toBe('REVIEW');
  });

  it('TOKENIZE + complementary LOG → COMPLEMENTARY with composed obligations', () => {
    const resolved = resolvePackContributions([
      contrib({
        pack_id: 'pack_enterprise_baseline',
        policy_id: 'pol_phase2_core',
        decision: 'TOKENIZE',
        reason_codes: ['PHI_REQUIRES_TOKENIZE'],
        obligations: [{ code: 'TOKENIZE_PII' }, { code: 'NO_EXTERNAL_TRANSMISSION' }],
        eligible_models: ['cloud-public-gpt'],
        transforms: [{ type: 'tokenize', targets: ['PHI'] }],
      }),
      contrib({
        pack_id: 'pack_nist_ai_rmf',
        policy_id: 'pol_nist',
        decision: 'ALLOW',
        reason_codes: ['NIST_GOVERN'],
        obligations: [{ code: 'LOG_GOVERNANCE_EVENT' }],
        eligible_models: ['cloud-public-gpt', 'local-general-v1'],
      }),
    ]);
    expect(resolved.resolution.category).toMatch(/COMPLEMENTARY|AGREEMENT|RESTRICTIVE/);
    expect(resolved.decision).toBe('TOKENIZE');
    expect(resolved.obligations.some((o) => o.code === 'TOKENIZE_PII')).toBe(true);
    expect(resolved.obligations.some((o) => o.code === 'LOG_GOVERNANCE_EVENT')).toBe(
      true,
    );
  });

  it('PHI + local model preserves local path (no cloud evidence required)', async () => {
    const local = new ScriptedModelProvider(
      ['local-general-v1'],
      'Summary: continue supportive care and follow up as scheduled.',
      { providerId: 'local-runtime' },
    );
    const gw = createPhase1Gateway({
      providers: [local],
      useStubRuntime: true,
    });
    const result = await gw.orchestrator.completions(PHASE1_DEMO_API_KEY, {
      application_id: 'app_clinical',
      user: { id: 'user_clinician' },
      operation: 'summarize',
      model: 'local-general-v1',
      purpose: 'treatment',
      messages: [
        {
          role: 'user',
          content: 'Clinical note MRN: A1234567 patient presents with fever',
        },
      ],
    });
    expect(result.body.status).toBe('approved');
    const last = (await gw.audit.list()).at(-1)!;
    expect(last.model_selected).toBe('local-general-v1');
    expect(last.data_classification).toBe('PHI');
    expect(['ALLOW', 'TOKENIZE', 'ALLOW_WITH_CONTROLS']).toContain(last.policy_decision);
  });

  it('PII + cloud TOKENIZE path remains unchanged', async () => {
    let seen = '';
    const cloudProvider = new ScriptedModelProvider(
      ['cloud-public-gpt'],
      'ok',
      { providerId: 'external-openai-compatible', kind: 'cloud' },
    );
    const orig = cloudProvider.execute.bind(cloudProvider);
    cloudProvider.execute = async (req) => {
      seen = req.messages.map((m) => m.content).join('\n');
      return orig(req);
    };
    const local = new ScriptedModelProvider(['local-general-v1'], 'local', {
      providerId: 'local-runtime',
    });
    const gw = createPhase1Gateway({
      providers: [local, cloudProvider],
      useStubRuntime: true,
    });
    const result = await gw.orchestrator.completions(GENERAL_APP_API_KEY, {
      application_id: 'app_general',
      user: { id: 'user_clinician' },
      operation: 'summarize',
      model: 'cloud-public-gpt',
      messages: [
        {
          role: 'user',
          content: 'Contact jane.doe@example.com about billing',
        },
      ],
    });
    expect(result.body.status).toBe('approved');
    expect(seen).toMatch(/\{\{TOK_/);
    expect(seen).not.toContain('jane.doe@example.com');
  });

  it('Salesforce-shaped patient summary → TOKENIZE → transformed egress → proof', async () => {
    const mrn = 'MRN-77821';
    const chart = [
      'Summarize the following patient chart for a clinician.',
      `Name: Ada Lovelace`,
      `MRN: ${mrn}`,
      'Clinical notes: Follow-up for hypertension.',
    ].join('\n');
    let seenContent = '';
    const cloudProvider = new ScriptedModelProvider(
      ['cloud-public-gpt'],
      'Clinician summary without identifiers.',
      { providerId: 'external-openai-compatible', kind: 'cloud' },
    );
    const origExecute = cloudProvider.execute.bind(cloudProvider);
    cloudProvider.execute = async (req) => {
      seenContent = req.messages.map((m) => m.content).join('\n');
      return origExecute(req);
    };
    const local = new ScriptedModelProvider(['local-general-v1'], 'local', {
      providerId: 'local-runtime',
    });
    const gw = createPhase1Gateway({
      providers: [local, cloudProvider],
      useStubRuntime: true,
      config: { adminApiKey: 'test_admin', auditSigningKey: 'test-audit-key' },
    });

    // Platform-neutral client payload matching Salesforce shape (generic fields only).
    const result = await gw.orchestrator.completions(PHASE1_DEMO_API_KEY, {
      application_id: 'app_clinical',
      user: { id: 'user_clinician' },
      operation: 'summarize',
      model: 'cloud-public-gpt',
      purpose: 'treatment',
      governance_context: controlledGov,
      messages: [{ role: 'user', content: chart }],
      metadata: {
        correlation_id: 'sf-patient-demo',
        salesforce_user_id: '005XXPLACEHOLDER',
      },
    });

    expect(result.body.status).toBe('approved');
    expect(seenContent).toMatch(/\{\{TOK_/);
    expect(seenContent).not.toContain(mrn);

    const last = (await gw.audit.list()).at(-1)!;
    expect(last.policy_decision).toBe('TOKENIZE');
    expect(last.input_transformation).toBe('tokenize');
    expect(last.model_selected).toBe('cloud-public-gpt');
    expect(last.evaluation_id).toBeTruthy();
    expect(last.decision_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(last.response_hash).toBeTruthy();
    expect(last.event_hash).toMatch(/^[a-f0-9]{64}$/);

    const record = gw.packRepo.getEvaluation(last.evaluation_id!);
    expect(record).toBeTruthy();
    expect(last.decision_hash).toBe(decisionBindingFromRecord(record!).decision_hash);
    expect(computeDecisionHash(record!)).toBe(last.decision_hash);

    const integrity = await (gw.audit as IntegrityAuditService).verifyIntegrity();
    expect(integrity.ok).toBe(true);

    const chain = verifyAuditChain([last], 'test-audit-key');
    expect(chain.ok).toBe(true);

    const tampered = { ...last, decision_hash: '0'.repeat(64) };
    expect(verifyAuditChain([tampered], 'test-audit-key').ok).toBe(false);
  });

  it('output residual PHI is independently governed (not auto-released by input TOKENIZE)', async () => {
    const original = 'Clinical note MRN: A1234567 patient presents with fever';
    const cloudProvider = new ScriptedModelProvider(
      ['cloud-public-gpt'],
      'Patient MRN A1234567 should continue current therapy.',
      { providerId: 'external-openai-compatible', kind: 'cloud' },
    );
    const local = new ScriptedModelProvider(['local-general-v1'], 'local', {
      providerId: 'local-runtime',
    });
    const gw = createPhase1Gateway({
      providers: [local, cloudProvider],
      useStubRuntime: true,
    });
    const result = await gw.orchestrator.completions(PHASE1_DEMO_API_KEY, {
      application_id: 'app_clinical',
      user: { id: 'user_clinician' },
      operation: 'summarize',
      model: 'cloud-public-gpt',
      purpose: 'treatment',
      governance_context: controlledGov,
      messages: [{ role: 'user', content: original }],
    });
    expect(result.body.status).not.toBe('approved');
    expect(['blocked', 'held', 'error']).toContain(result.body.status);
    const last = (await gw.audit.list()).at(-1)!;
    expect(last.policy_decision).toBe('TOKENIZE');
    expect(['BLOCK', 'BLOCK_OUTPUT', 'REDACT', 'REVIEW']).toContain(
      last.response_decision ?? last.policy_decision,
    );
  });
});
