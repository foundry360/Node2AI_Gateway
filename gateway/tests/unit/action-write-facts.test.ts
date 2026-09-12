/**
 * Phase A — Agent WRITE action facts reach healthcare policy evaluation.
 * Severity unchanged: PHI + HIPAA + write still REVIEW.
 */
import { describe, expect, it } from 'vitest';
import type { Application, User } from '../../src/identity/types.js';
import {
  InMemoryPolicyRepository,
  PackBackedEnterprisePdp,
} from '../../src/policy/enterprise/index.js';
import { toInputEvaluationRequest } from '../../src/policy/enterprise/map.js';

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
  allowed_operations: ['summarize', 'write'],
};

function conditionKeys(
  decision: { explanation?: { matched_conditions?: Array<{ condition_key: string }> } },
): string[] {
  return (decision.explanation?.matched_conditions ?? []).map((m) => m.condition_key);
}

describe('Phase A — Agent WRITE action facts in HIPAA evaluation', () => {
  it('clinical_note action, tool_id, agent_id, purpose, authz reach pack facts; PHI write still REVIEW', async () => {
    const repo = new InMemoryPolicyRepository();
    const pdp = new PackBackedEnterprisePdp(repo);
    const decision = await pdp.evaluateLegacyRequest({
      user: clinician,
      application: clinicalApp,
      operation: 'write',
      requestedModel: 'local-general-v1',
      availableModels: ['local-general-v1'],
      environment: 'prod',
      classification: {
        sensitivity: 'PHI',
        confidence: 0.99,
        risk: 'high',
        reason_codes: ['REGULATORY_APPLICABILITY:HIPAA'],
      },
      deploymentMode: 'connected',
      purpose: 'treatment',
      authorization_context: 'authorized',
      agent_id: 'agent_enigma_clinical',
      tool_id: 'update_clinical_notes',
      governance_context: {
        tool_authorized: true,
        agent_authorized: true,
      },
      action: {
        kind: 'clinical_note',
        target_id: 'patient_1',
        attributes: { note: 'Follow-up BP stable.' },
      },
      request_id: 'req_action_note',
    });

    const keys = conditionKeys(decision);
    expect(keys).toEqual(expect.arrayContaining(['action_kind:clinical_note']));
    expect(keys).toEqual(expect.arrayContaining(['tool_id:update_clinical_notes']));
    expect(keys).toEqual(expect.arrayContaining(['agent_id:agent_enigma_clinical']));
    expect(keys).toEqual(expect.arrayContaining(['purpose:treatment']));
    expect(keys).toEqual(
      expect.arrayContaining(['authorization_context:authorized']),
    );
    expect(decision.decision).toBe('REVIEW');
    expect(decision.reason_codes).toContain(
      'HIPAA_PHI_CLINICAL_WRITE_REQUIRES_APPROVAL',
    );
    expect(
      decision.explanation.provenance?.matched_rules.some(
        (r) => r.rule_id === 'HIPAA-R-INPUT-WRITE-CLINICAL-NOTE-REQUIRE-APPROVAL',
      ),
    ).toBe(true);
  });

  it('field_update action + admin field name reach pack facts; PHI admin write ALLOWs', async () => {
    const repo = new InMemoryPolicyRepository();
    const pdp = new PackBackedEnterprisePdp(repo);
    const decision = await pdp.evaluateLegacyRequest({
      user: clinician,
      application: clinicalApp,
      operation: 'write',
      requestedModel: 'local-general-v1',
      availableModels: ['local-general-v1'],
      environment: 'prod',
      classification: {
        sensitivity: 'PHI',
        confidence: 0.99,
        risk: 'medium',
        reason_codes: ['REGULATORY_APPLICABILITY:HIPAA'],
      },
      deploymentMode: 'connected',
      purpose: 'treatment',
      authorization_context: 'authorized',
      agent_id: 'agent_enigma_clinical',
      tool_id: 'update_patient_field',
      governance_context: {
        tool_authorized: true,
        agent_authorized: true,
      },
      action: {
        kind: 'field_update',
        target_id: 'patient_1',
        attributes: { field: 'Phone__c', value: '555-0100' },
      },
      request_id: 'req_action_field',
    });

    const keys = conditionKeys(decision);
    expect(keys).toEqual(expect.arrayContaining(['action_kind:field_update']));
    expect(keys).toEqual(expect.arrayContaining(['action_field:Phone__c']));
    expect(keys).toEqual(
      expect.arrayContaining(['write_governance_class:ADMINISTRATIVE_LOW_RISK']),
    );
    expect(keys).toEqual(expect.arrayContaining(['tool_id:update_patient_field']));
    expect(decision.decision).toBe('ALLOW');
    expect(decision.reason_codes).toContain(
      'HIPAA_PHI_ADMINISTRATIVE_WRITE_ALLOWED',
    );
  });

  it('classification + HIPAA applicability remain visible on write evaluation', async () => {
    const repo = new InMemoryPolicyRepository();
    const pdp = new PackBackedEnterprisePdp(repo);
    const decision = await pdp.evaluateLegacyRequest({
      user: clinician,
      application: clinicalApp,
      operation: 'write',
      requestedModel: 'local-general-v1',
      availableModels: ['local-general-v1'],
      environment: 'prod',
      classification: {
        sensitivity: 'PHI',
        confidence: 0.99,
        risk: 'high',
        reason_codes: ['REGULATORY_APPLICABILITY:HIPAA'],
      },
      deploymentMode: 'connected',
      purpose: 'treatment',
      authorization_context: 'authorized',
      action: { kind: 'clinical_note' },
    });

    expect(decision.evidence.classification).toBe('PHI');
    expect(
      decision.explanation.provenance?.classification?.applicability?.packs,
    ).toEqual(expect.arrayContaining(['HIPAA']));
    expect(decision.decision).toBe('REVIEW');
  });

  it('unauthorized tool on PHI write remains DENY (severity facts do not authorize)', async () => {
    const repo = new InMemoryPolicyRepository();
    const pdp = new PackBackedEnterprisePdp(repo);
    const decision = await pdp.evaluateLegacyRequest({
      user: clinician,
      application: clinicalApp,
      operation: 'write',
      requestedModel: 'local-general-v1',
      availableModels: ['local-general-v1'],
      environment: 'prod',
      classification: {
        sensitivity: 'PHI',
        confidence: 0.99,
        risk: 'high',
        reason_codes: ['REGULATORY_APPLICABILITY:HIPAA'],
      },
      deploymentMode: 'connected',
      purpose: 'treatment',
      authorization_context: 'authorized',
      tool_id: 'update_clinical_notes',
      // tool present but not authorized → unauthorized tool DENY before write REVIEW
      governance_context: {
        tool_authorized: false,
        agent_authorized: true,
      },
      action: {
        kind: 'clinical_note',
        attributes: { note: 'spoofed low risk claim does not matter' },
      },
    });

    expect(decision.decision).toBe('DENY');
    expect(decision.reason_codes).toContain('HIPAA_PHI_TOOL_UNAUTHORIZED');
  });

  it('toInputEvaluationRequest persists declared action on ai_context', () => {
    const mapped = toInputEvaluationRequest({
      user: clinician,
      application: clinicalApp,
      operation: 'write',
      availableModels: ['local-general-v1'],
      environment: 'prod',
      classification: {
        sensitivity: 'PHI',
        confidence: 0.9,
        risk: 'high',
        reason_codes: ['REGULATORY_APPLICABILITY:HIPAA'],
      },
      deploymentMode: 'connected',
      purpose: 'treatment',
      authorization_context: 'authorized',
      tool_id: 'update_patient_field',
      action: {
        kind: 'field_update',
        attributes: { field: 'Email__c', value: 'a@b.com' },
      },
    });

    expect(mapped.ai_context.tool_id).toBe('update_patient_field');
    expect(mapped.ai_context.action).toEqual({
      kind: 'field_update',
      attributes: { field: 'Email__c', value: 'a@b.com' },
    });
    expect(mapped.action).toBe('WRITE');
  });
});
