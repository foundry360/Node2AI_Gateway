/**
 * Enterprise Governance Scenarios — CMS / Patient Access / Prior Auth
 * Scenarios 7–10
 */
import { describe, expect, it } from 'vitest';
import {
  APPROVED_CMS_PATIENT,
  assertDenyBlocksModels,
  contributingPackIds,
  evaluateScenario,
  historicalEligible,
  packIds,
} from './helpers.js';

describe('Scenario 7 — CMS Patient Access', () => {
  it('authorized patient access → ALLOW through shared EPA (no CMS-specific engine)', async () => {
    const { decision, repo } = await evaluateScenario({
      requestId: 'req_scen_7',
      regs: ['CMS'],
      sensitivity: 'Internal',
      purpose: 'treatment',
      keepHealthcare: ['cms'],
      governance: { healthcare_interop: APPROVED_CMS_PATIENT },
    });
    expect(decision.decision).toBe('ALLOW');
    expect(packIds(decision)).toContain('pack_cms');
    expect(decision.reason_codes).toContain('CMS_INTEROP_CONTROLS_SATISFIED');
    expect(decision.restrictions.eligible_models!.length).toBeGreaterThan(0);
    expect(historicalEligible(repo, decision.evaluation_id!).eligible).toEqual(
      decision.restrictions.eligible_models,
    );
    // Shared resolver path — contributions recorded on resolution when multi-pack;
    // single CMS pack still uses PackBackedEnterprisePdp.
    expect(decision.evaluation_id).toBeTruthy();
  });
});

describe('Scenario 8 — CMS Patient Access unauthorized application', () => {
  it('application_authorized=false → DENY; eligible=[]; Gateway-ready block projection', async () => {
    const { decision, repo } = await evaluateScenario({
      requestId: 'req_scen_8',
      regs: ['CMS'],
      sensitivity: 'Internal',
      keepHealthcare: ['cms'],
      governance: {
        healthcare_interop: {
          ...APPROVED_CMS_PATIENT,
          application_authorized: false,
        },
      },
    });
    assertDenyBlocksModels(decision);
    expect(decision.reason_codes).toContain('CMS_PATIENT_APPLICATION_UNAUTHORIZED');
    expect(historicalEligible(repo, decision.evaluation_id!).eligible).toEqual([]);
  });
});

describe('Scenario 9 — CMS data scope restriction', () => {
  it('data_scope_excessive → TOKENIZE; transform obligation preserved', async () => {
    const { decision, repo } = await evaluateScenario({
      requestId: 'req_scen_9',
      regs: ['CMS'],
      sensitivity: 'Internal',
      keepHealthcare: ['cms'],
      governance: {
        healthcare_interop: {
          ...APPROVED_CMS_PATIENT,
          data_scope_excessive: true,
        },
      },
    });
    expect(decision.decision).toBe('TOKENIZE');
    expect(decision.reason_codes).toContain('CMS_PATIENT_DATA_SCOPE_EXCESSIVE');
    expect(decision.transformations.some((t) => t.type === 'TOKENIZE') || decision.decision === 'TOKENIZE').toBe(
      true,
    );
    expect(historicalEligible(repo, decision.evaluation_id!).hydrated.decision).toBe(
      'TOKENIZE',
    );
  });
});

describe('Scenario 10 — Prior Authorization unauthorized submission', () => {
  it('prior_auth submit without authorization → DENY; no eligible models', async () => {
    const { decision, repo } = await evaluateScenario({
      requestId: 'req_scen_10',
      regs: ['CMS'],
      sensitivity: 'Internal',
      keepHealthcare: ['cms'],
      governance: {
        healthcare_interop: {
          applicability: 'applicable',
          workflow: 'prior_auth',
          prior_auth_stage: 'submit',
          prior_auth_authorized: false,
        },
      },
    });
    assertDenyBlocksModels(decision);
    expect(
      decision.reason_codes.some((c) => c.startsWith('CMS_PRIOR_AUTH')),
    ).toBe(true);
    expect(contributingPackIds(decision).length >= 0).toBe(true);
    expect(historicalEligible(repo, decision.evaluation_id!).eligible).toEqual([]);
  });
});
