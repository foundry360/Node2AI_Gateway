import { describe, expect, it } from 'vitest';
import {
  AGENT_ENIGMA_CLINICAL_TARGET_ID,
} from '../../src/api/admin-routes.js';
import { createPhase1Gateway } from '../../src/api/app-factory.js';

describe('Admin change governance HTTP', () => {
  it('seeds agent baseline and evaluates clinical write_capability → MATERIAL / REVIEW (policy)', async () => {
    const gw = createPhase1Gateway({
      config: { adminApiKey: 'test_admin' },
    });
    const server = await gw.buildServer();
    const auth = { authorization: 'Bearer test_admin' };

    const baselineRes = await server.inject({
      method: 'GET',
      url: `/v1/admin/governance/baselines?target_id=${AGENT_ENIGMA_CLINICAL_TARGET_ID}&target_type=application`,
      headers: auth,
    });
    expect(baselineRes.statusCode).toBe(200);
    const baseline = baselineRes.json().baseline;
    expect(baseline.capabilities.write_capability).toBe(false);
    expect(baseline.target_id).toBe(AGENT_ENIGMA_CLINICAL_TARGET_ID);

    const evaluateRes = await server.inject({
      method: 'POST',
      url: '/v1/admin/governance/changes/evaluate',
      headers: auth,
      payload: {
        target_type: 'application',
        target_id: AGENT_ENIGMA_CLINICAL_TARGET_ID,
        previous_baseline_id: baseline.baseline_id,
        proposed_state: {
          write_capability: true,
          tools: [
            { id: 'summarize_patient', write: false },
            { id: 'update_clinical_notes', write: true },
          ],
        },
        request_id: 'req_agent_write_cap_http',
      },
    });
    expect(evaluateRes.statusCode).toBe(200);
    const body = evaluateRes.json();
    expect(body.materiality).toBe('MATERIAL');
    expect(body.lifecycle_decision).toBe('REEVALUATION_REQUIRED');
    expect(body.change_types).toContain('WRITE_CAPABILITY');
    expect(String(body.policy_decision?.decision).toUpperCase()).toBe('REVIEW');
    expect(body.policy_decision?.reason_codes).toEqual(
      expect.arrayContaining(['HIPAA_PHI_WRITE_REQUIRES_APPROVAL']),
    );
    expect(String(body.policy_decision?.decision).toUpperCase()).not.toBe('DENY');
    expect(body.evaluation_id || body.policy_decision?.evaluation_id).toBeTruthy();
    // Policy-held high-risk write must not silently commit write=true
    expect(body.next_baseline).toBeFalsy();
  });
});
