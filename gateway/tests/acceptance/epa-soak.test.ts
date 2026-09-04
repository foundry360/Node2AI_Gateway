import { describe, expect, it } from 'vitest';
import { createPhase1Gateway, PHASE1_DEMO_API_KEY } from '../../src/api/app-factory.js';

/**
 * Automated pilot soak for Enigma EPA (post M4).
 * Complements docs/PILOT_ACCEPTANCE.md Test 1 / 1b / 11.
 */
describe('Enigma EPA pilot soak', () => {
  it('governed completion + integrity + EPA simulate/validate', async () => {
    const gw = createPhase1Gateway({
      config: { adminApiKey: 'soak_admin' },
    });
    const server = await gw.buildServer();
    const admin = { authorization: 'Bearer soak_admin' };

    const completion = await gw.orchestrator.completions(PHASE1_DEMO_API_KEY, {
      application_id: 'app_clinical',
      user: { id: 'user_clinician' },
      operation: 'summarize',
      model: 'local-general-v1',
      messages: [{ role: 'user', content: 'Summarize: soak readiness looks good.' }],
    });
    expect(completion.httpStatus).toBe(200);
    expect(completion.body.status).toBe('approved');
    if (completion.body.status === 'approved') {
      expect(completion.body.integrity?.response_hash).toBeTruthy();
      expect(completion.body.integrity?.event_hash).toBeTruthy();
    }

    const integrity = await server.inject({
      method: 'GET',
      url: '/v1/admin/audit/integrity',
      headers: admin,
    });
    expect(integrity.statusCode).toBe(200);
    expect(integrity.json().integrity.ok).toBe(true);

    const packs = await server.inject({
      method: 'GET',
      url: '/v1/admin/policy-packs',
      headers: admin,
    });
    expect(packs.statusCode).toBe(200);
    expect(packs.json().engine_mode).toBe('enterprise');
    expect(packs.json().packs.some((p: { pack_id: string }) => p.pack_id === 'pack_hipaa')).toBe(
      true,
    );

    const simulate = await server.inject({
      method: 'POST',
      url: '/v1/admin/policy/simulate',
      headers: admin,
      payload: {
        classification: 'PHI',
        requested_model: 'cloud-public-gpt',
        application_type: 'clinical',
        roles: ['clinician'],
      },
    });
    expect(simulate.statusCode).toBe(200);
    expect(simulate.json().model_executed).toBe(false);
    expect(simulate.json().decision.decision).toBe('DENY');

    const validate = await server.inject({
      method: 'POST',
      url: '/v1/admin/policies/pol_phase2_core/validate',
      headers: admin,
    });
    expect(validate.statusCode).toBe(200);
    expect(validate.json().ok).toBe(true);
  });
});
