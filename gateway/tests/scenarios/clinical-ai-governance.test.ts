/**
 * Enterprise Governance Scenarios — Clinical AI
 * Scenarios 1–6: authorized / transform / unauthorized / purpose / agent / tool
 */
import { describe, expect, it } from 'vitest';
import {
  APPROVED_ONC_ADMIN,
  assertDenyBlocksModels,
  assertEligibleContainsSelected,
  contributionDecisions,
  contributingPackIds,
  evaluateScenario,
  historicalEligible,
  packIds,
  phiClassification,
  runLiveCompletion,
  SCENARIO_CLINICAL_APP,
} from './helpers.js';

describe('Scenario 1 — Authorized Clinical AI', () => {
  it('HIPAA + ONC satisfied → ALLOW; CMS not applicable; eligible models; live execution correlates', async () => {
    const { decision, repo } = await evaluateScenario({
      requestId: 'req_scen_1',
      regs: ['HIPAA', 'ONC_HTI1', 'CMS'],
      purpose: 'treatment',
      authorization: 'authorized',
      agentId: 'care-agent',
      toolId: 'note-tool',
      keepHealthcare: ['hipaa', 'onc', 'cms'],
      governance: {
        agent_authorized: true,
        tool_authorized: true,
        predictive_dsi: APPROVED_ONC_ADMIN,
        healthcare_interop: {
          applicability: 'not_applicable',
          organization_role: 'non_cms',
          workflow: 'patient_access',
        },
      },
    });

    expect(decision.decision).toBe('ALLOW');
    expect(packIds(decision)).toEqual(expect.arrayContaining(['pack_hipaa', 'pack_onc_hti1']));
    expect(contributingPackIds(decision)).not.toContain('pack_cms');
    expect(decision.reason_codes).toContain('HIPAA_PHI_PROCESSING_CONTROLS_SATISFIED');
    expect(decision.reason_codes).toContain('ONC_DSI_GOVERNANCE_CONTROLS_SATISFIED');
    expect(decision.restrictions.eligible_models!.length).toBeGreaterThan(0);
    expect(
      decision.restrictions.eligible_models!.every((m) => m.startsWith('local-')),
    ).toBe(true);

    const hist = historicalEligible(repo, decision.evaluation_id!);
    expect(hist.eligible).toEqual(decision.restrictions.eligible_models);

    // Avoid content that the local stub echoes as residual PHI on the output path.
    const live = await runLiveCompletion({
      content: 'Summarize discharge instructions for follow-up care.',
      model: 'local-general-v1',
      purpose: 'treatment',
      authorization_context: 'authorized',
      agent_id: 'care-agent',
      tool_id: 'note-tool',
      regulatory_applicability: ['HIPAA', 'ONC_HTI1'],
      governance_context: {
        agent_authorized: true,
        tool_authorized: true,
        predictive_dsi: APPROVED_ONC_ADMIN,
      },
    });
    expect(live.result.httpStatus).toBe(200);
    expect(live.result.body.status).toBe('approved');
    if (live.result.body.status === 'approved') {
      expect(live.result.body.model).toBe('local-general-v1');
    }
    expect(live.audit?.model_selected).toBe('local-general-v1');
    expect(live.audit?.provider).toBeTruthy();
    expect(live.inputRecord?.request_id).toBeTruthy();
    expect(live.audit?.request_id).toBe(live.inputRecord?.request_id);
    assertEligibleContainsSelected(
      live.inputRecord?.restrictions?.eligible_models,
      live.audit?.model_selected,
    );
  });
});

describe('Scenario 2 — Clinical AI excessive data request', () => {
  it('HIPAA minimum necessary → REDACT/TOKENIZE; not DENY; transform obligation present', async () => {
    const { decision, repo } = await evaluateScenario({
      requestId: 'req_scen_2',
      regs: ['HIPAA'],
      purpose: 'treatment',
      authorization: 'authorized',
      keepHealthcare: ['hipaa'],
      permittedEntityTypes: ['MRN'],
      entities: phiClassification().entities,
    });

    expect(['TOKENIZE', 'REDACT']).toContain(decision.decision);
    expect(decision.reason_codes).toContain('HIPAA_MINIMUM_NECESSARY_RESTRICTED');
    expect(
      decision.obligations.some(
        (o) => o.code === 'TOKENIZE_PII' || o.code === 'LOG_GOVERNANCE_EVENT',
      ),
    ).toBe(true);
    expect(decision.decision).not.toBe('DENY');
    expect(decision.restrictions.eligible_models!.length).toBeGreaterThan(0);
    expect(historicalEligible(repo, decision.evaluation_id!).hydrated.decision).toBe(
      decision.decision,
    );
  });
});

describe('Scenario 3 — Unauthorized Clinical AI', () => {
  it('authorization_context unauthorized → DENY; eligible=[]; no human override path', async () => {
    const { decision, repo } = await evaluateScenario({
      requestId: 'req_scen_3',
      regs: ['HIPAA'],
      purpose: 'treatment',
      authorization: 'unauthorized',
      keepHealthcare: ['hipaa'],
    });
    assertDenyBlocksModels(decision);
    expect(decision.reason_codes).toContain(
      'HIPAA_PHI_AUTHORIZATION_CONTEXT_UNAUTHORIZED',
    );
    expect(historicalEligible(repo, decision.evaluation_id!).eligible).toEqual([]);

    const live = await runLiveCompletion({
      content: 'Clinical note MRN: A1234567 patient presents with fever',
      purpose: 'treatment',
      authorization_context: 'unauthorized',
      regulatory_applicability: ['HIPAA'],
    });
    expect(live.result.httpStatus).toBe(403);
    expect(live.result.body.status).toBe('blocked');
    expect(live.audit?.response_decision === 'BLOCK' || live.audit?.policy_decision === 'BLOCK').toBe(
      true,
    );
  });
});

describe('Scenario 4 — Unknown / missing purpose', () => {
  it('missing purpose → REVIEW with hold semantics; eligible empty; not silent ALLOW', async () => {
    const { decision, repo } = await evaluateScenario({
      requestId: 'req_scen_4',
      regs: ['HIPAA'],
      authorization: 'authorized',
      keepHealthcare: ['hipaa'],
      // purpose omitted
    });
    expect(decision.decision).toBe('REVIEW');
    expect(decision.reason_codes).toContain(
      'HIPAA_PHI_INSUFFICIENT_EVIDENCE_FOR_PROCESSING',
    );
    expect(decision.restrictions.eligible_models).toEqual([]);
    expect(decision.decision).not.toBe('ALLOW');
    expect(historicalEligible(repo, decision.evaluation_id!).hydrated.decision).toBe(
      'REVIEW',
    );
  });
});

describe('Scenario 5 — Unauthorized Agent', () => {
  it('agent present + unauthorized → DENY; evidence retains agent context', async () => {
    const { decision, repo } = await evaluateScenario({
      requestId: 'req_scen_5',
      regs: ['HIPAA'],
      purpose: 'treatment',
      authorization: 'authorized',
      agentId: 'shadow-agent',
      keepHealthcare: ['hipaa'],
      governance: { agent_authorized: false },
    });
    assertDenyBlocksModels(decision);
    expect(
      decision.reason_codes.some((c) => c.includes('AGENT') || c.includes('UNAUTHORIZED')),
    ).toBe(true);
    const hist = historicalEligible(repo, decision.evaluation_id!);
    expect(hist.eligible).toEqual([]);
  });
});

describe('Scenario 6 — Unauthorized Tool', () => {
  it('authorized agent + unauthorized tool → DENY; no eligible models', async () => {
    const { decision } = await evaluateScenario({
      requestId: 'req_scen_6',
      regs: ['HIPAA'],
      purpose: 'treatment',
      authorization: 'authorized',
      agentId: 'care-agent',
      toolId: 'rogue-tool',
      keepHealthcare: ['hipaa'],
      governance: { agent_authorized: true, tool_authorized: false },
    });
    assertDenyBlocksModels(decision);
    expect(
      decision.reason_codes.some((c) => c.includes('TOOL') || c.includes('UNAUTHORIZED')),
    ).toBe(true);
    void contributionDecisions;
    void SCENARIO_CLINICAL_APP;
  });
});
