import { describe, expect, it } from 'vitest';
import {
  createPhase1Gateway,
  PHASE1_DEMO_API_KEY,
} from '../../src/api/app-factory.js';
import { PackBackedEnterprisePdp } from '../../src/policy/enterprise/pack-pdp.js';
import { InMemoryPolicyRepository } from '../../src/policy/enterprise/repository.js';
import type { Application, User } from '../../src/identity/types.js';
import {
  InputTransformService,
  InMemoryTokenVault,
  filterEntitiesByTargets,
} from '../../src/transform/index.js';
import { ScriptedModelProvider } from '../../src/models/index.js';

const clinician: User = {
  user_id: 'u1',
  organization_id: 'o1',
  roles: ['clinician'],
  permissions: [],
  status: 'active',
};

const opsUser: User = {
  user_id: 'u_ops',
  organization_id: 'o1',
  roles: ['ops'],
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
  allowed_operations: ['summarize', 'analyze'],
};

const phiClassification = {
  sensitivity: 'PHI' as const,
  confidence: 0.99,
  risk: 'high' as const,
  reason_codes: ['REGULATORY_APPLICABILITY:HIPAA'],
  entities: [
    {
      type: 'MRN',
      preview: 'A1…67',
      start: 14,
      end: 22,
      source: 'deterministic' as const,
    },
    {
      type: 'SSN',
      preview: '12…89',
      start: 30,
      end: 41,
      source: 'deterministic' as const,
    },
  ],
};

describe('Healthcare Phase 1–2 runtime completion', () => {
  it('1. Authorized user + PHI + authorized purpose → ALLOW with controls', async () => {
    const pdp = new PackBackedEnterprisePdp(new InMemoryPolicyRepository());
    const decision = await pdp.evaluateLegacyRequest({
      user: clinician,
      application: clinicalApp,
      operation: 'summarize',
      requestedModel: 'local-general-v1',
      availableModels: ['local-general-v1'],
      environment: 'prod',
      classification: phiClassification,
      deploymentMode: 'connected',
      purpose: 'treatment',
      authorization_context: 'authorized',
      request_id: 'req_hc_1',
    });
    expect(decision.decision).toBe('ALLOW');
    expect(decision.reason_codes).toContain('HIPAA_PHI_PROCESSING_CONTROLS_SATISFIED');
    expect(
      (decision.restrictions?.eligible_models ?? []).every((m) =>
        m.startsWith('local-'),
      ),
    ).toBe(true);
  });

  it('2. Unauthorized user + PHI → DENY', async () => {
    const pdp = new PackBackedEnterprisePdp(new InMemoryPolicyRepository());
    const decision = await pdp.evaluateLegacyRequest({
      user: opsUser,
      application: clinicalApp,
      operation: 'summarize',
      requestedModel: 'local-general-v1',
      availableModels: ['local-general-v1'],
      environment: 'prod',
      classification: phiClassification,
      deploymentMode: 'connected',
      purpose: 'treatment',
      authorization_context: 'authorized',
      request_id: 'req_hc_2',
    });
    expect(decision.decision).toBe('DENY');
    expect(
      decision.reason_codes.some((c) =>
        [
          'HIPAA_PHI_USER_UNAUTHORIZED',
          'PHI_APPLICATION_NOT_AUTHORIZED',
        ].includes(c),
      ),
    ).toBe(true);
  });

  it('3. Missing authorization context → REVIEW', async () => {
    const pdp = new PackBackedEnterprisePdp(new InMemoryPolicyRepository());
    const decision = await pdp.evaluateLegacyRequest({
      user: clinician,
      application: clinicalApp,
      operation: 'summarize',
      requestedModel: 'local-general-v1',
      availableModels: ['local-general-v1'],
      environment: 'prod',
      classification: phiClassification,
      deploymentMode: 'connected',
      purpose: 'treatment',
      request_id: 'req_hc_3',
    });
    expect(decision.decision).toBe('REVIEW');
    expect(decision.reason_codes).toContain(
      'HIPAA_PHI_INSUFFICIENT_EVIDENCE_FOR_PROCESSING',
    );
  });

  it('4. PHI + valid purpose → ALLOW/control', async () => {
    const pdp = new PackBackedEnterprisePdp(new InMemoryPolicyRepository());
    const decision = await pdp.evaluateLegacyRequest({
      user: clinician,
      application: clinicalApp,
      operation: 'analyze',
      requestedModel: 'local-general-v1',
      availableModels: ['local-general-v1'],
      environment: 'prod',
      classification: phiClassification,
      deploymentMode: 'connected',
      purpose: 'care_management',
      authorization_context: 'treatment_relationship',
      request_id: 'req_hc_4',
    });
    expect(decision.decision).toBe('ALLOW');
  });

  it('5. PHI + missing purpose → REVIEW', async () => {
    const pdp = new PackBackedEnterprisePdp(new InMemoryPolicyRepository());
    const decision = await pdp.evaluateLegacyRequest({
      user: clinician,
      application: clinicalApp,
      operation: 'summarize',
      requestedModel: 'local-general-v1',
      availableModels: ['local-general-v1'],
      environment: 'prod',
      classification: phiClassification,
      deploymentMode: 'connected',
      authorization_context: 'authorized',
      request_id: 'req_hc_5',
    });
    expect(decision.decision).toBe('REVIEW');
    expect(decision.reason_codes).toContain(
      'HIPAA_PHI_INSUFFICIENT_EVIDENCE_FOR_PROCESSING',
    );
  });

  it('6. PHI + unauthorized purpose → DENY', async () => {
    const pdp = new PackBackedEnterprisePdp(new InMemoryPolicyRepository());
    const decision = await pdp.evaluateLegacyRequest({
      user: clinician,
      application: clinicalApp,
      operation: 'summarize',
      requestedModel: 'local-general-v1',
      availableModels: ['local-general-v1'],
      environment: 'prod',
      classification: phiClassification,
      deploymentMode: 'connected',
      purpose: 'marketing',
      authorization_context: 'authorized',
      request_id: 'req_hc_6',
    });
    expect(decision.decision).toBe('DENY');
    expect(decision.reason_codes).toContain('HIPAA_PHI_PURPOSE_UNAUTHORIZED');
  });

  it('7. Authorized agent + PHI → ALLOW and agent on EPA subject/ai_context', async () => {
    const pdp = new PackBackedEnterprisePdp(new InMemoryPolicyRepository());
    const decision = await pdp.evaluateLegacyRequest({
      user: clinician,
      application: clinicalApp,
      operation: 'summarize',
      requestedModel: 'local-general-v1',
      availableModels: ['local-general-v1'],
      environment: 'prod',
      classification: phiClassification,
      deploymentMode: 'connected',
      purpose: 'treatment',
      authorization_context: 'authorized',
      agent_id: 'care-mgmt-agent',
      governance_context: { agent_authorized: true },
      request_id: 'req_hc_7',
    });
    expect(decision.decision).toBe('ALLOW');
    const { toInputEvaluationRequest } = await import(
      '../../src/policy/enterprise/map.js'
    );
    const mapped = toInputEvaluationRequest({
      user: clinician,
      application: clinicalApp,
      operation: 'summarize',
      requestedModel: 'local-general-v1',
      availableModels: ['local-general-v1'],
      environment: 'prod',
      classification: phiClassification,
      deploymentMode: 'connected',
      purpose: 'treatment',
      authorization_context: 'authorized',
      agent_id: 'care-mgmt-agent',
      governance_context: { agent_authorized: true },
      request_id: 'req_hc_7_map',
    });
    expect(mapped.subject.agent_id).toBe('care-mgmt-agent');
    expect(mapped.ai_context?.agent_id).toBe('care-mgmt-agent');
  });

  it('8. Unauthorized agent + PHI → DENY', async () => {
    const pdp = new PackBackedEnterprisePdp(new InMemoryPolicyRepository());
    const decision = await pdp.evaluateLegacyRequest({
      user: clinician,
      application: clinicalApp,
      operation: 'summarize',
      requestedModel: 'local-general-v1',
      availableModels: ['local-general-v1'],
      environment: 'prod',
      classification: phiClassification,
      deploymentMode: 'connected',
      purpose: 'treatment',
      authorization_context: 'authorized',
      agent_id: 'shadow-agent',
      governance_context: { agent_authorized: false },
      request_id: 'req_hc_8',
    });
    expect(decision.decision).toBe('DENY');
    expect(decision.reason_codes).toContain('HIPAA_PHI_AGENT_UNAUTHORIZED');
  });

  it('9. Approved agent + approved tool → ALLOW', async () => {
    const pdp = new PackBackedEnterprisePdp(new InMemoryPolicyRepository());
    const decision = await pdp.evaluateLegacyRequest({
      user: clinician,
      application: clinicalApp,
      operation: 'summarize',
      requestedModel: 'local-general-v1',
      availableModels: ['local-general-v1'],
      environment: 'prod',
      classification: phiClassification,
      deploymentMode: 'connected',
      purpose: 'treatment',
      authorization_context: 'authorized',
      agent_id: 'care-mgmt-agent',
      tool_id: 'ehr-read',
      governance_context: { agent_authorized: true, tool_authorized: true },
      request_id: 'req_hc_9',
    });
    expect(decision.decision).toBe('ALLOW');
  });

  it('10. Approved agent + unauthorized tool → DENY', async () => {
    const pdp = new PackBackedEnterprisePdp(new InMemoryPolicyRepository());
    const decision = await pdp.evaluateLegacyRequest({
      user: clinician,
      application: clinicalApp,
      operation: 'summarize',
      requestedModel: 'local-general-v1',
      availableModels: ['local-general-v1'],
      environment: 'prod',
      classification: phiClassification,
      deploymentMode: 'connected',
      purpose: 'treatment',
      authorization_context: 'authorized',
      agent_id: 'care-mgmt-agent',
      tool_id: 'billing-export',
      governance_context: { agent_authorized: true, tool_authorized: false },
      request_id: 'req_hc_10',
    });
    expect(decision.decision).toBe('DENY');
    expect(decision.reason_codes).toContain('HIPAA_PHI_TOOL_UNAUTHORIZED');
  });

  it('11. Requested data within permitted scope → ALLOW', async () => {
    const pdp = new PackBackedEnterprisePdp(new InMemoryPolicyRepository());
    const decision = await pdp.evaluateLegacyRequest({
      user: clinician,
      application: clinicalApp,
      operation: 'summarize',
      requestedModel: 'local-general-v1',
      availableModels: ['local-general-v1'],
      environment: 'prod',
      classification: {
        ...phiClassification,
        entities: [phiClassification.entities![0]!],
      },
      deploymentMode: 'connected',
      purpose: 'care_management',
      authorization_context: 'authorized',
      permitted_entity_types: ['MRN'],
      request_id: 'req_hc_11',
    });
    expect(decision.decision).toBe('ALLOW');
  });

  it('12. Excess data request → REDACT controlled outcome + gateway enforces', async () => {
    const pdp = new PackBackedEnterprisePdp(new InMemoryPolicyRepository());
    const decision = await pdp.evaluateLegacyRequest({
      user: clinician,
      application: clinicalApp,
      operation: 'summarize',
      requestedModel: 'local-general-v1',
      availableModels: ['local-general-v1'],
      environment: 'prod',
      classification: phiClassification,
      deploymentMode: 'connected',
      purpose: 'care_management',
      authorization_context: 'authorized',
      permitted_entity_types: ['MRN'],
      request_id: 'req_hc_12',
    });
    expect(decision.decision).toBe('REDACT');
    expect(decision.reason_codes).toContain('HIPAA_MINIMUM_NECESSARY_RESTRICTED');
    expect(
      (decision.transformations ?? []).some((t) => t.targets.includes('SSN')),
    ).toBe(true);

    const transform = new InputTransformService(new InMemoryTokenVault());
    const result = await transform.apply({
      organization_id: 'o1',
      request_id: 'req_hc_12',
      correlation_id: 'c1',
      text: 'Patient MRN: ABC12345 SSN 123-45-6789',
      entities: [
        {
          type: 'MRN',
          preview: 'AB…45',
          start: 13,
          end: 21,
          source: 'deterministic',
        },
        {
          type: 'SSN',
          preview: '12…89',
          start: 26,
          end: 37,
          source: 'deterministic',
        },
      ],
      decision: 'REDACT',
      transforms: decision.transformations ?? [],
    });
    expect(result.transformed_text).toContain('ABC12345');
    expect(result.transformed_text).toContain('[REDACTED_SSN]');
    expect(result.transformed_text).not.toContain('123-45-6789');
  });

  it('13. PHI + approved local model → ALLOW', async () => {
    const pdp = new PackBackedEnterprisePdp(new InMemoryPolicyRepository());
    const decision = await pdp.evaluateLegacyRequest({
      user: clinician,
      application: clinicalApp,
      operation: 'summarize',
      requestedModel: 'local-general-v1',
      availableModels: ['local-general-v1'],
      environment: 'prod',
      classification: phiClassification,
      deploymentMode: 'connected',
      purpose: 'treatment',
      authorization_context: 'authorized',
      request_id: 'req_hc_13',
    });
    expect(decision.decision).toBe('ALLOW');
    expect(decision.restrictions?.eligible_models).toEqual(['local-general-v1']);
  });

  it('14. PHI + prohibited external model → DENY', async () => {
    const pdp = new PackBackedEnterprisePdp(new InMemoryPolicyRepository());
    const decision = await pdp.evaluateLegacyRequest({
      user: clinician,
      application: clinicalApp,
      operation: 'summarize',
      requestedModel: 'cloud-public-gpt',
      availableModels: ['local-general-v1', 'cloud-public-gpt'],
      environment: 'prod',
      classification: phiClassification,
      deploymentMode: 'connected',
      purpose: 'treatment',
      authorization_context: 'authorized',
      request_id: 'req_hc_14',
    });
    expect(decision.decision).toBe('DENY');
  });

  it('15–20. Live gateway: output purpose forwarded, enforcement + audit', async () => {
    const local = new ScriptedModelProvider(
      ['local-general-v1'],
      'Summary without residual identifiers.',
      { providerId: 'local-runtime' },
    );
    const gw = createPhase1Gateway({
      config: { adminApiKey: 'test_admin', auditSigningKey: 'test-audit-key' },
      providers: [local],
      useStubRuntime: true,
    });
    const result = await gw.orchestrator.completions(PHASE1_DEMO_API_KEY, {
      application_id: 'app_clinical',
      user: { id: 'user_clinician' },
      operation: 'summarize',
      model: 'local-general-v1',
      purpose: 'treatment',
      authorization_context: 'authorized',
      agent_id: 'note-assist-agent',
      governance_context: { agent_authorized: true },
      messages: [
        {
          role: 'user',
          content: 'Patient MRN: ABC12345 presents for follow-up.',
        },
      ],
    } as never);

    expect(
      result.httpStatus,
      `unexpected block: ${JSON.stringify(result.body)}`,
    ).toBe(200);

    const requestId = String(result.body.request_id);
    const evals = gw.packRepo.listEvaluations({ limit: 100 });
    const inputEval = evals.find(
      (e) => e.request_id === requestId && e.phase === 'input',
    );
    const outputEval = evals.find(
      (e) => e.request_id === requestId && e.phase === 'output',
    );
    expect(inputEval).toBeTruthy();
    expect(outputEval).toBeTruthy();
    expect(inputEval!.context.purpose).toBe('treatment');
    expect(inputEval!.context.authorization).toBe('authorized');
    expect(inputEval!.subject.agent_id).toBe('note-assist-agent');
    expect(outputEval!.context.purpose).toBe('treatment');
    expect(outputEval!.context.authorization).toBe('authorized');
    expect(outputEval!.subject.agent_id).toBe('note-assist-agent');
    expect(inputEval!.request_id).toBe(requestId);
    expect(outputEval!.request_id).toBe(requestId);
  });

  it('transform targets filter honors PHI bucket vs concrete types', () => {
    const entities = [
      {
        type: 'MRN',
        preview: 'x',
        start: 0,
        end: 1,
        source: 'deterministic' as const,
      },
      {
        type: 'SSN',
        preview: 'y',
        start: 2,
        end: 3,
        source: 'deterministic' as const,
      },
      {
        type: 'EMAIL',
        preview: 'z',
        start: 4,
        end: 5,
        source: 'deterministic' as const,
      },
    ];
    const onlySsn = filterEntitiesByTargets(entities, [
      { type: 'redact', targets: ['SSN'] },
    ]);
    expect(onlySsn.map((e) => e.type)).toEqual(['SSN']);
    const phiBucket = filterEntitiesByTargets(entities, [
      { type: 'tokenize', targets: ['PHI'] },
    ]);
    expect(phiBucket.map((e) => e.type).sort()).toEqual(['EMAIL', 'MRN', 'SSN']);
  });

  it('authorization_context unauthorized → DENY distinct from missing', async () => {
    const pdp = new PackBackedEnterprisePdp(new InMemoryPolicyRepository());
    const decision = await pdp.evaluateLegacyRequest({
      user: clinician,
      application: clinicalApp,
      operation: 'summarize',
      requestedModel: 'local-general-v1',
      availableModels: ['local-general-v1'],
      environment: 'prod',
      classification: phiClassification,
      deploymentMode: 'connected',
      purpose: 'treatment',
      authorization_context: 'unauthorized',
      request_id: 'req_hc_authz_deny',
    });
    expect(decision.decision).toBe('DENY');
    expect(decision.reason_codes).toContain(
      'HIPAA_PHI_AUTHORIZATION_CONTEXT_UNAUTHORIZED',
    );
  });
});
