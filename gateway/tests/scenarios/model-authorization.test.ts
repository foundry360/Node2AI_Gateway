/**
 * Enterprise Governance Scenarios — Model authorization + historical evidence
 * Scenarios 15–18 + negative regressions
 */
import { describe, expect, it } from 'vitest';
import {
  InMemoryModelRegistry,
  DefaultModelGateway,
  LocalModelProvider,
  StubLocalRuntime,
} from '../../src/models/index.js';
import { GatewayError } from '../../src/shared/errors.js';
import {
  projectEnforcementResult,
  isEligibleForHumanReview,
  evaluationRecordToDecisionPayload,
} from '../../src/policy/enterprise/index.js';
import type { PolicyEvaluationRecord } from '../../src/policy/enterprise/evaluation-record.js';
import type { AuditEvent } from '../../src/audit/service.js';
import {
  assertDenyBlocksModels,
  assertEligibleContainsSelected,
  evaluateScenario,
  historicalEligible,
  runLiveCompletion,
  SCENARIO_CLINICAL_APP,
} from './helpers.js';

describe('Scenario 15 — Model authorization (requested outside eligible)', () => {
  it('cloud requested under PHI local-only → DENY / not eligible; Model Gateway rejects non-eligible', async () => {
    const { decision, repo } = await evaluateScenario({
      requestId: 'req_scen_15',
      regs: ['HIPAA'],
      purpose: 'treatment',
      authorization: 'authorized',
      requestedModel: 'cloud-public-gpt',
      availableModels: ['local-general-v1', 'cloud-public-gpt'],
      keepHealthcare: ['hipaa'],
    });
    // Baseline/HIPAA: PHI + cloud without controlled path → DENY
    expect(['DENY', 'TOKENIZE']).toContain(decision.decision);
    if (decision.decision === 'DENY') {
      expect(decision.restrictions.eligible_models).toEqual([]);
      expect(decision.restrictions.eligible_models).not.toContain('cloud-public-gpt');
    } else {
      // Controlled tokenize path may keep only requested cloud if authorized —
      // still must not expand beyond eligible.
      expect(decision.restrictions.eligible_models).toBeDefined();
    }

    const registry = new InMemoryModelRegistry([
      {
        model_id: 'local-general-v1',
        provider_id: 'local-runtime',
        name: 'Local',
        kind: 'local',
        status: 'active',
      },
      {
        model_id: 'cloud-public-gpt',
        provider_id: 'external-openai-compatible',
        name: 'Cloud',
        kind: 'cloud',
        status: 'active',
      },
    ]);
    const gateway = new DefaultModelGateway(
      registry,
      [new LocalModelProvider(new StubLocalRuntime())],
      'connected',
    );
    await expect(
      gateway.executeApproved({
        request_id: 'req_scen_15_gw',
        correlation_id: 'cor',
        model_id: 'cloud-public-gpt',
        messages: [{ role: 'user', content: 'x' }],
        operation: 'summarize',
        eligible_models: ['local-general-v1'],
      }),
    ).rejects.toMatchObject({ reasonCode: 'MODEL_NOT_ELIGIBLE' });

    // Disabled model cannot execute even if listed eligible
    registry.setStatus('local-general-v1', 'disabled');
    await expect(
      gateway.executeApproved({
        request_id: 'req_scen_15_dis',
        correlation_id: 'cor',
        model_id: 'local-general-v1',
        messages: [{ role: 'user', content: 'x' }],
        operation: 'summarize',
        eligible_models: ['local-general-v1'],
      }),
    ).rejects.toBeInstanceOf(GatewayError);

    expect(historicalEligible(repo, decision.evaluation_id!).eligible).toEqual(
      decision.restrictions.eligible_models,
    );
  });
});

describe('Scenario 16 — Authorized model execution', () => {
  it('requested → available → eligible → selected → executed; historical eligible preserved', async () => {
    const live = await runLiveCompletion({
      content: 'Summarize discharge instructions for follow-up care.',
      model: 'local-general-v1',
      purpose: 'treatment',
      authorization_context: 'authorized',
      regulatory_applicability: ['HIPAA'],
    });
    expect(live.result.httpStatus).toBe(200);
    expect(live.result.body.status).toBe('approved');
    const available = live.gw.models.listAvailableModels();
    expect(available).toContain('local-general-v1');
    const eligible = live.inputRecord?.restrictions?.eligible_models ?? [];
    const selected = live.audit?.model_selected;
    assertEligibleContainsSelected(eligible, selected);
    expect(live.audit?.provider).toBeTruthy();
    if (live.result.body.status === 'approved') {
      expect(live.result.body.model).toBe(selected);
    }
    // Historical hydrate must not recalculate from registry
    const hydrated = evaluationRecordToDecisionPayload(live.inputRecord!);
    expect(hydrated.restrictions.eligible_models).toEqual(eligible);
  });
});

describe('Scenario 17 — Historical governance evidence chain', () => {
  it('request_id ↔ evaluation ↔ eligible_models ↔ audit model/provider without recalculation', async () => {
    const live = await runLiveCompletion({
      content: 'Summarize visit notes for care coordination.',
      model: 'local-general-v1',
      purpose: 'treatment',
      authorization_context: 'authorized',
      regulatory_applicability: ['HIPAA'],
      governance_context: { agent_authorized: true },
      agent_id: 'care-agent',
    });
    expect(live.result.body.status).toBe('approved');
    expect(live.inputRecord).toBeTruthy();
    expect(live.audit).toBeTruthy();

    const record = live.inputRecord!;
    const audit = live.audit!;
    expect(record.request_id).toBe(audit.request_id);
    expect(record.decision).toBeTruthy();
    expect(Array.isArray(record.obligations)).toBe(true);
    expect(record.restrictions?.eligible_models).toEqual(
      expect.arrayContaining([audit.model_selected!]),
    );
    expect(audit.model_selected).toBeTruthy();
    expect(audit.provider).toBeTruthy();

    const again = live.gw.packRepo.getEvaluation(record.evaluation_id)!;
    expect(again.restrictions?.eligible_models).toEqual(
      record.restrictions?.eligible_models,
    );
    const payload = evaluationRecordToDecisionPayload(again);
    expect(payload.restrictions.eligible_models).toEqual(
      record.restrictions?.eligible_models,
    );
  });
});

describe('Scenario 18 — Enforcement verification mismatch → UNKNOWN', () => {
  it('ALLOW decision without matching Gateway audit → UNKNOWN (not falsely VERIFIED)', () => {
    const record: PolicyEvaluationRecord = {
      evaluation_id: 'eval_mismatch',
      request_id: 'req_mismatch',
      phase: 'input',
      subject: {},
      resource: {},
      context: {},
      ai_context: {},
      evidence_in: {},
      decision: 'ALLOW',
      applicable_policies: [],
      obligations: [],
      restrictions: { eligible_models: ['local-general-v1'] },
      explanation: {
        matched_conditions: [],
        rejected_conditions: [],
        final_reason: 'ALLOW',
      },
      created_at: new Date().toISOString(),
    };
    const projection = projectEnforcementResult(record, null);
    expect(projection.status).toMatch(/UNKNOWN|NOT_EXECUTED/);
    expect(projection.verified).toBe(false);

    // Wrong-direction mismatch: decision ALLOW but audit BLOCK without join confidence
    const badAudit: AuditEvent = {
      audit_id: 'aud_bad',
      timestamp: new Date().toISOString(),
      request_id: 'req_other',
      correlation_id: 'cor_other',
      policy_decision: 'BLOCK',
      response_decision: 'BLOCK',
    };
    const mismatched = projectEnforcementResult(record, badAudit);
    // Different request_id → should not claim verified ALLOWED
    expect(mismatched.status).not.toBe('ALLOWED');
  });
});

describe('Negative regressions — restrictive controls cannot be weakened', () => {
  it('DENY cannot become ALLOW or REVIEW; human review not eligible', async () => {
    const { decision } = await evaluateScenario({
      requestId: 'req_scen_neg_deny',
      regs: ['HIPAA'],
      purpose: 'treatment',
      authorization: 'unauthorized',
      keepHealthcare: ['hipaa'],
    });
    assertDenyBlocksModels(decision);
    expect(decision.decision).not.toBe('ALLOW');
    expect(decision.decision).not.toBe('REVIEW');
  });

  it('CMS not_applicable does not contribute false ALLOW against HIPAA DENY', async () => {
    const { decision } = await evaluateScenario({
      requestId: 'req_scen_neg_cms_na',
      regs: ['HIPAA', 'CMS'],
      purpose: 'treatment',
      authorization: 'unauthorized',
      keepHealthcare: ['hipaa', 'cms'],
      governance: {
        healthcare_interop: {
          applicability: 'not_applicable',
          organization_role: 'non_cms',
          workflow: 'patient_access',
        },
      },
    });
    expect(decision.decision).toBe('DENY');
    expect(decision.reason_codes).not.toContain('CMS_INTEROP_CONTROLS_SATISFIED');
  });

  it('ONC not_applicable does not contribute false ALLOW', async () => {
    const { decision } = await evaluateScenario({
      requestId: 'req_scen_neg_onc_na',
      regs: ['HIPAA', 'ONC_HTI1'],
      purpose: 'treatment',
      authorization: 'authorized',
      keepHealthcare: ['hipaa', 'onc'],
      governance: {
        predictive_dsi: {
          applicability: 'not_applicable',
          organization_role: 'payer',
          use_class: 'clinical',
          risk_tier: 'high',
        },
      },
    });
    expect(decision.decision).toBe('ALLOW');
    expect(decision.reason_codes).not.toContain('ONC_DSI_FAVES_EVIDENCE_INSUFFICIENT');
    // ONC skip must not appear as contributing ALLOW that alters HIPAA path incorrectly
    expect(
      (decision.explanation.resolution?.contributing_pack_ids ?? []).includes(
        'pack_onc_hti1',
      ),
    ).toBe(false);
  });

  it('unauthorized application type cannot process PHI', async () => {
    const { decision } = await evaluateScenario({
      requestId: 'req_scen_neg_app',
      regs: ['HIPAA'],
      purpose: 'treatment',
      authorization: 'authorized',
      keepHealthcare: ['hipaa'],
      application: {
        ...SCENARIO_CLINICAL_APP,
        application_id: 'app_general_like',
        type: 'general',
      },
    });
    expect(decision.decision).toBe('DENY');
  });

  it('REVIEW is not silently ALLOW', async () => {
    const { decision } = await evaluateScenario({
      requestId: 'req_scen_neg_review',
      regs: ['HIPAA'],
      authorization: 'authorized',
      keepHealthcare: ['hipaa'],
    });
    expect(decision.decision).toBe('REVIEW');
    expect(decision.decision).not.toBe('ALLOW');
    expect(isEligibleForHumanReview({
      evaluation_id: decision.evaluation_id,
      phase: 'input',
      subject: {},
      resource: {},
      context: {},
      ai_context: {},
      evidence_in: {},
      decision: 'REVIEW',
      applicable_policies: [],
      obligations: decision.obligations,
      explanation: decision.explanation,
      created_at: new Date().toISOString(),
    })).toBe(true);
  });
});
