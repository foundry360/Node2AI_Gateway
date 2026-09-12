/**
 * Enterprise Governance Scenarios — ONC + Cross-domain composition
 * Scenarios 11–14
 */
import { describe, expect, it } from 'vitest';
import {
  APPROVED_CMS_PATIENT,
  APPROVED_ONC_ADMIN,
  INCOMPLETE_ONC_CLINICAL,
  assertDenyBlocksModels,
  contributionDecisions,
  contributingPackIds,
  evaluateScenario,
  historicalEligible,
  packIds,
  phiClassification,
} from './helpers.js';

describe('Scenario 11 — ONC HTI-1 incomplete governance evidence', () => {
  it('high-risk clinical incomplete FAVES → REVIEW; approval obligation; no silent ALLOW', async () => {
    const { decision, repo } = await evaluateScenario({
      requestId: 'req_scen_11',
      regs: ['ONC_HTI1'],
      sensitivity: 'Internal',
      keepHealthcare: ['onc'],
      governance: { predictive_dsi: INCOMPLETE_ONC_CLINICAL },
    });
    expect(decision.decision).toBe('REVIEW');
    expect(decision.reason_codes).toContain('ONC_DSI_FAVES_EVIDENCE_INSUFFICIENT');
    expect(
      decision.obligations.some((o) => o.code === 'REQUIRE_HUMAN_APPROVAL_FOR_EXECUTION'),
    ).toBe(true);
    expect(decision.decision).not.toBe('ALLOW');
    expect(decision.restrictions.eligible_models).toEqual([]);
    expect(historicalEligible(repo, decision.evaluation_id!).hydrated.decision).toBe(
      'REVIEW',
    );
  });
});

describe('Scenario 12 — HIPAA + CMS both satisfied', () => {
  it('both domains contribute → one ALLOW decision; one evaluation; eligible models composed', async () => {
    const { decision, repo } = await evaluateScenario({
      requestId: 'req_scen_12',
      regs: ['HIPAA', 'CMS'],
      purpose: 'treatment',
      authorization: 'authorized',
      agentId: 'exchange-agent',
      toolId: 'fhir-tool',
      keepHealthcare: ['hipaa', 'cms'],
      governance: {
        agent_authorized: true,
        tool_authorized: true,
        healthcare_interop: APPROVED_CMS_PATIENT,
      },
    });
    expect(decision.decision).toBe('ALLOW');
    expect(packIds(decision)).toEqual(
      expect.arrayContaining(['pack_hipaa', 'pack_cms']),
    );
    expect(contributingPackIds(decision).length).toBeGreaterThanOrEqual(2);
    expect(decision.evaluation_id).toBeTruthy();
    expect(
      repo
        .listEvaluations({ limit: 20 })
        .filter((r) => r.request_id === 'req_scen_12' && r.phase === 'input'),
    ).toHaveLength(1);
    expect(decision.restrictions.eligible_models!.length).toBeGreaterThan(0);
    expect(historicalEligible(repo, decision.evaluation_id!).eligible).toEqual(
      decision.restrictions.eligible_models,
    );
  });
});

describe('Scenario 13 — HIPAA DENY + CMS ALLOW → CONSEQUENCE_DENY', () => {
  it('final DENY not REVIEW; contributions retained; eligible=[]; no human override', async () => {
    const { decision, repo } = await evaluateScenario({
      requestId: 'req_scen_13',
      regs: ['HIPAA', 'CMS'],
      purpose: 'treatment',
      authorization: 'unauthorized',
      keepHealthcare: ['hipaa', 'cms'],
      governance: { healthcare_interop: APPROVED_CMS_PATIENT },
    });
    assertDenyBlocksModels(decision);
    expect(decision.reason_codes).toContain('RESOLUTION_CONSEQUENCE_DENY');
    expect(decision.explanation.resolution?.basis).toBe('CONSEQUENCE_DENY');
    expect(decision.decision).not.toBe('REVIEW');
    expect(decision.decision).not.toBe('ALLOW');
    const contribs = contributionDecisions(decision);
    expect(contribs.map((c) => c.pack_id)).toEqual(
      expect.arrayContaining(['pack_hipaa', 'pack_cms']),
    );
    expect(contribs.some((c) => c.pack_id === 'pack_hipaa' && c.decision === 'DENY')).toBe(
      true,
    );
    expect(contribs.some((c) => c.pack_id === 'pack_cms' && c.decision === 'ALLOW')).toBe(
      true,
    );
    expect(historicalEligible(repo, decision.evaluation_id!).eligible).toEqual([]);
  });
});

describe('Scenario 14 — HIPAA TRANSFORM + CMS ALLOW', () => {
  it('minimum necessary REDACT/TOKENIZE survives cross-domain ALLOW from CMS', async () => {
    const { decision, repo } = await evaluateScenario({
      requestId: 'req_scen_14',
      regs: ['HIPAA', 'CMS'],
      purpose: 'treatment',
      authorization: 'authorized',
      keepHealthcare: ['hipaa', 'cms'],
      permittedEntityTypes: ['MRN'],
      entities: phiClassification().entities,
      governance: { healthcare_interop: APPROVED_CMS_PATIENT },
    });
    expect(['TOKENIZE', 'REDACT']).toContain(decision.decision);
    expect(decision.reason_codes).toContain('HIPAA_MINIMUM_NECESSARY_RESTRICTED');
    expect(packIds(decision)).toEqual(
      expect.arrayContaining(['pack_hipaa', 'pack_cms']),
    );
    expect(
      decision.obligations.some(
        (o) => o.code === 'TOKENIZE_PII' || o.code === 'LOG_GOVERNANCE_EVENT',
      ),
    ).toBe(true);
    expect(historicalEligible(repo, decision.evaluation_id!).hydrated.decision).toBe(
      decision.decision,
    );
    void APPROVED_ONC_ADMIN;
  });
});
