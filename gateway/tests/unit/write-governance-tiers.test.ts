/**
 * Phase B — Tiered PHI write governance (agent-agnostic).
 * Clinical notes remain REVIEW; administrative low-risk fields may ALLOW with audit.
 */
import { describe, expect, it } from 'vitest';
import type { Application, User } from '../../src/identity/types.js';
import {
  InMemoryPolicyRepository,
  PackBackedEnterprisePdp,
} from '../../src/policy/enterprise/index.js';
import {
  createPhase1Gateway,
  PHASE1_DEMO_API_KEY,
} from '../../src/api/app-factory.js';
import {
  deriveWriteGovernanceClass,
  isAdministrativeLowRiskField,
  normalizeWriteFieldToken,
} from '../../src/policy/enterprise/packs/hipaa/write-field-class.js';

const clinician: User = {
  user_id: 'user_clinician',
  organization_id: 'org_demo',
  roles: ['clinician'],
  permissions: [],
  status: 'active',
};

const clinicalApp: Application = {
  application_id: 'app_clinical',
  organization_id: 'org_demo',
  name: 'Clinical',
  type: 'clinical',
  environment: 'prod',
  status: 'active',
  trust_level: 'trusted',
  allowed_models: ['local-general-v1'],
  allowed_datasets: [],
  allowed_operations: ['summarize', 'write', 'export'],
};

function baseWrite(extra: Record<string, unknown> = {}) {
  return {
    user: clinician,
    application: clinicalApp,
    operation: 'write' as const,
    requestedModel: 'local-general-v1',
    availableModels: ['local-general-v1'],
    environment: 'prod' as const,
    classification: {
      sensitivity: 'PHI' as const,
      confidence: 0.99,
      risk: 'medium' as const,
      reason_codes: ['REGULATORY_APPLICABILITY:HIPAA'],
    },
    deploymentMode: 'connected' as const,
    purpose: 'treatment',
    authorization_context: 'authorized',
    agent_id: 'agent_generic_1',
    tool_id: 'update_patient_field',
    governance_context: {
      tool_authorized: true,
      agent_authorized: true,
    },
    ...extra,
  };
}

describe('Phase B — write field classification (server-side)', () => {
  it('normalizes field tokens without vendor-specific branching', () => {
    expect(normalizeWriteFieldToken('Phone__c')).toBe('phone');
    expect(normalizeWriteFieldToken('email_address')).toBe('email_address');
    expect(isAdministrativeLowRiskField('phone')).toBe(true);
    expect(isAdministrativeLowRiskField('Phone__c')).toBe(true);
    expect(isAdministrativeLowRiskField('Primary_Diagnosis__c')).toBe(false);
  });

  it('derives governance classes from declared action facts', () => {
    expect(
      deriveWriteGovernanceClass({
        operation: 'write',
        action_kind: 'clinical_note',
      }),
    ).toBe('CLINICAL_NOTE');
    expect(
      deriveWriteGovernanceClass({
        operation: 'write',
        action_kind: 'field_update',
        action_attributes: { field: 'email' },
      }),
    ).toBe('ADMINISTRATIVE_LOW_RISK');
    expect(
      deriveWriteGovernanceClass({
        operation: 'write',
        action_kind: 'field_update',
        action_attributes: { field: 'primary_diagnosis' },
      }),
    ).toBe('UNKNOWN');
    expect(deriveWriteGovernanceClass({ operation: 'write' })).toBe('UNKNOWN');
  });
});

describe('Phase B — tiered PHI write policy', () => {
  it('1. low-risk administrative field → ALLOW + LOG', async () => {
    const pdp = new PackBackedEnterprisePdp(new InMemoryPolicyRepository());
    const decision = await pdp.evaluateLegacyRequest(
      baseWrite({
        action: {
          kind: 'field_update',
          attributes: { field: 'phone', value: '555-0100' },
        },
      }) as never,
    );
    expect(decision.decision).toBe('ALLOW');
    expect(decision.reason_codes).toContain(
      'HIPAA_PHI_ADMINISTRATIVE_WRITE_ALLOWED',
    );
    expect(decision.obligations.some((o) => o.code === 'LOG_GOVERNANCE_EVENT')).toBe(
      true,
    );
    expect(decision.obligations.some((o) => o.code === 'REQUIRE_HUMAN_APPROVAL_FOR_EXECUTION')).toBe(
      false,
    );
    expect(decision.restrictions.eligible_models.length).toBeGreaterThan(0);
  });

  it('2. clinical note → REVIEW with approval obligation', async () => {
    const pdp = new PackBackedEnterprisePdp(new InMemoryPolicyRepository());
    const decision = await pdp.evaluateLegacyRequest(
      baseWrite({
        tool_id: 'update_clinical_notes',
        action: { kind: 'clinical_note', attributes: { note: 'Patient stable.' } },
      }) as never,
    );
    expect(decision.decision).toBe('REVIEW');
    expect(decision.reason_codes).toContain(
      'HIPAA_PHI_CLINICAL_WRITE_REQUIRES_APPROVAL',
    );
    expect(
      decision.obligations.some(
        (o) => o.code === 'REQUIRE_HUMAN_APPROVAL_FOR_EXECUTION',
      ),
    ).toBe(true);
  });

  it('3. unknown field → REVIEW (fail closed)', async () => {
    const pdp = new PackBackedEnterprisePdp(new InMemoryPolicyRepository());
    const decision = await pdp.evaluateLegacyRequest(
      baseWrite({
        action: {
          kind: 'field_update',
          attributes: { field: 'primary_diagnosis', value: 'I10' },
        },
      }) as never,
    );
    expect(decision.decision).toBe('REVIEW');
    expect(decision.reason_codes).toContain('HIPAA_PHI_WRITE_REQUIRES_APPROVAL');
  });

  it('4. unauthorized tool → DENY even for low-risk-looking field', async () => {
    const pdp = new PackBackedEnterprisePdp(new InMemoryPolicyRepository());
    const decision = await pdp.evaluateLegacyRequest(
      baseWrite({
        governance_context: {
          tool_authorized: false,
          agent_authorized: true,
        },
        action: {
          kind: 'field_update',
          attributes: { field: 'phone', value: '555-0100' },
        },
      }) as never,
    );
    expect(decision.decision).toBe('DENY');
    expect(decision.reason_codes).toContain('HIPAA_PHI_TOOL_UNAUTHORIZED');
  });

  it('5. unauthorized purpose → DENY', async () => {
    const pdp = new PackBackedEnterprisePdp(new InMemoryPolicyRepository());
    const decision = await pdp.evaluateLegacyRequest(
      baseWrite({
        purpose: 'marketing',
        action: {
          kind: 'field_update',
          attributes: { field: 'email', value: 'a@b.com' },
        },
      }) as never,
    );
    expect(decision.decision).toBe('DENY');
    expect(decision.reason_codes).toContain('HIPAA_PHI_PURPOSE_UNAUTHORIZED');
  });

  it('6. external transmission → DENY', async () => {
    const pdp = new PackBackedEnterprisePdp(new InMemoryPolicyRepository());
    const decision = await pdp.evaluateLegacyRequest(
      baseWrite({
        operation: 'export',
        action: undefined,
      }) as never,
    );
    expect(decision.decision).toBe('DENY');
    expect(decision.reason_codes).toContain('HIPAA_PHI_WRITEBACK_NOT_AUTHORIZED');
  });

  it('7. non-PHI write does not inherit PHI write approval rule', async () => {
    const pdp = new PackBackedEnterprisePdp(new InMemoryPolicyRepository());
    const decision = await pdp.evaluateLegacyRequest(
      baseWrite({
        classification: {
          sensitivity: 'INTERNAL',
          confidence: 0.9,
          risk: 'low',
          reason_codes: [],
        },
        action: {
          kind: 'field_update',
          attributes: { field: 'phone', value: '555' },
        },
      }) as never,
    );
    expect(decision.reason_codes).not.toContain(
      'HIPAA_PHI_ADMINISTRATIVE_WRITE_ALLOWED',
    );
    expect(decision.reason_codes).not.toContain(
      'HIPAA_PHI_CLINICAL_WRITE_REQUIRES_APPROVAL',
    );
    expect(decision.reason_codes).not.toContain('HIPAA_PHI_WRITE_REQUIRES_APPROVAL');
  });

  it('8. agent neutrality — identical facts, different app/agent → same consequence', async () => {
    const pdp = new PackBackedEnterprisePdp(new InMemoryPolicyRepository());
    const a = await pdp.evaluateLegacyRequest(
      baseWrite({
        application: { ...clinicalApp, application_id: 'app_platform_a' },
        agent_id: 'agent_a1',
        action: {
          kind: 'field_update',
          attributes: { field: 'phone', value: '555-0100' },
        },
      }) as never,
    );
    const b = await pdp.evaluateLegacyRequest(
      baseWrite({
        application: { ...clinicalApp, application_id: 'app_platform_b' },
        agent_id: 'agent_b1',
        action: {
          kind: 'field_update',
          attributes: { field: 'phone', value: '555-0100' },
        },
      }) as never,
    );
    expect(a.decision).toBe(b.decision);
    expect(a.reason_codes).toEqual(b.reason_codes);
    expect(a.decision).toBe('ALLOW');
  });

  it('9. evaluation persists action facts on historical Decision', async () => {
    const repo = new InMemoryPolicyRepository();
    const pdp = new PackBackedEnterprisePdp(repo);
    const decision = await pdp.evaluateLegacyRequest(
      baseWrite({
        request_id: 'req_hist_write',
        action: {
          kind: 'field_update',
          target_id: 'patient_x',
          attributes: { field: 'email', value: 'n@example.com' },
        },
      }) as never,
    );
    const record = repo.getEvaluation(decision.evaluation_id!);
    expect(record).toBeTruthy();
    expect(record?.decision).toBe('ALLOW');
    expect(record?.ai_context?.action).toEqual({
      kind: 'field_update',
      target_id: 'patient_x',
      attributes: { field: 'email', value: 'n@example.com' },
    });
    expect(record?.ai_context?.tool_id).toBe('update_patient_field');
  });

  it('10a. /v1/ai/actions allows admin phone write without safety hold', async () => {
    const gw = createPhase1Gateway({ config: { adminApiKey: 'test_admin' } });
    const server = await gw.buildServer();
    const res = await server.inject({
      method: 'POST',
      url: '/v1/ai/actions',
      headers: { authorization: `Bearer ${PHASE1_DEMO_API_KEY}` },
      payload: {
        application_id: 'app_clinical',
        user: { id: 'user_clinician' },
        operation: 'write',
        model: 'local-general-v1',
        messages: [
          {
            role: 'user',
            content:
              'Agent write: update patient field.\nPatient: Demo\nMRN: MRN-1\nDOB: 1980-01-01\nField: phone\nValue: 555-0100',
          },
        ],
        purpose: 'treatment',
        authorization_context: 'authorized',
        agent_id: 'agent_generic_1',
        tool_id: 'update_patient_field',
        governance_context: {
          tool_authorized: true,
          agent_authorized: true,
        },
        action: {
          kind: 'field_update',
          attributes: { field: 'phone', value: '555-0100' },
        },
        regulatory_applicability: ['HIPAA'],
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.status).toBe('approved');
    expect(body.action).toBe('commit_allowed');
    expect(body.safety_hold).toBeUndefined();
    await server.close();
  });

  it('10b. /v1/ai/actions holds clinical note write for REVIEW', async () => {
    const gw = createPhase1Gateway({ config: { adminApiKey: 'test_admin' } });
    const server = await gw.buildServer();
    const res = await server.inject({
      method: 'POST',
      url: '/v1/ai/actions',
      headers: { authorization: `Bearer ${PHASE1_DEMO_API_KEY}` },
      payload: {
        application_id: 'app_clinical',
        user: { id: 'user_clinician' },
        operation: 'write',
        model: 'local-general-v1',
        messages: [
          {
            role: 'user',
            content:
              'Agent write: append clinical note.\nPatient: Demo\nMRN: MRN-1\nDOB: 1980-01-01\nNote:\nClinical follow-up.',
          },
        ],
        purpose: 'treatment',
        authorization_context: 'authorized',
        agent_id: 'agent_generic_1',
        tool_id: 'update_clinical_notes',
        governance_context: {
          tool_authorized: true,
          agent_authorized: true,
        },
        action: { kind: 'clinical_note', attributes: { note: 'Clinical follow-up.' } },
        regulatory_applicability: ['HIPAA'],
      },
    });
    expect(res.statusCode).toBe(403);
    const body = res.json();
    expect(body.safety_hold).toBe(true);
    expect(String(body.machine_decision).toUpperCase()).toBe('REVIEW');
    expect(body.evaluation_id).toBeTruthy();
    await server.close();
  });
});
