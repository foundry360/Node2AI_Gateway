import { describe, expect, it } from 'vitest';
import {
  createPhase1Gateway,
  GENERAL_APP_API_KEY,
  PHASE1_DEMO_API_KEY,
} from '../../src/api/app-factory.js';
import {
  DefaultModelGateway,
  InMemoryModelRegistry,
  LocalModelProvider,
  StubLocalRuntime,
  selectEligibleModel,
} from '../../src/models/index.js';

describe('Phase 4 acceptance — Model Gateway', () => {
  it('Policy → eligible models → Model Gateway → local runtime execution', async () => {
    const gw = createPhase1Gateway();
    const result = await gw.orchestrator.completions(PHASE1_DEMO_API_KEY, {
      application_id: 'app_clinical',
      user: { id: 'user_clinician' },
      operation: 'summarize',
      messages: [{ role: 'user', content: 'Summarize discharge instructions.' }],
    });

    expect(result.httpStatus).toBe(200);
    expect(result.body.status).toBe('approved');
    if (result.body.status === 'approved') {
      expect(result.body.model).toBe('local-general-v1');
      expect(result.body.response.message.content).toContain('[local-runtime:local-general-v1]');
    }

    const last = (await gw.audit.list()).at(-1)!;
    expect(last.provider).toBe('local-runtime');
    expect(last.model_selected).toBe('local-general-v1');
  });

  it('External adapter executes only after policy eligibility (connected)', async () => {
    let externalCalls = 0;
    const fetchImpl: typeof fetch = async () => {
      externalCalls += 1;
      return new Response(
        JSON.stringify({
          choices: [{ message: { role: 'assistant', content: 'external-ok' } }],
          usage: { prompt_tokens: 3, completion_tokens: 2 },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    };

    const gw = createPhase1Gateway({
      config: { deploymentMode: 'connected' },
      externalFetch: fetchImpl,
    });

    const result = await gw.orchestrator.completions(GENERAL_APP_API_KEY, {
      application_id: 'app_general',
      user: { id: 'user_clinician' },
      operation: 'summarize',
      model: 'cloud-public-gpt',
      messages: [{ role: 'user', content: 'Summarize public release notes.' }],
    });

    expect(result.httpStatus).toBe(200);
    expect(result.body.status).toBe('approved');
    if (result.body.status === 'approved') {
      expect(result.body.model).toBe('cloud-public-gpt');
      expect(result.body.response.message.content).toBe('external-ok');
    }
    expect(externalCalls).toBe(1);

    const last = (await gw.audit.list()).at(-1)!;
    expect(last.provider).toBe('external-openai-compatible');
  });

  it('Air-gap does not register external provider — cloud model blocked by policy', async () => {
    let externalCalls = 0;
    const fetchImpl: typeof fetch = async () => {
      externalCalls += 1;
      return new Response('should-not-run', { status: 500 });
    };

    const gw = createPhase1Gateway({
      config: { deploymentMode: 'airgap' },
      externalFetch: fetchImpl,
    });

    const result = await gw.orchestrator.completions(GENERAL_APP_API_KEY, {
      application_id: 'app_general',
      user: { id: 'user_clinician' },
      operation: 'summarize',
      model: 'cloud-public-gpt',
      messages: [{ role: 'user', content: 'Try cloud in airgap' }],
    });

    expect(result.body.status).toBe('blocked');
    expect(externalCalls).toBe(0);
  });

  it('Gateway rejects model outside eligible set (defense in depth, not policy)', async () => {
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
    const gateway = new DefaultModelGateway(registry, [
      new LocalModelProvider(new StubLocalRuntime(['local-general-v1']), [
        'local-general-v1',
      ]),
    ]);

    await expect(
      gateway.executeApproved({
        request_id: 'req_x',
        correlation_id: 'corr_x',
        model_id: 'cloud-public-gpt',
        messages: [{ role: 'user', content: 'nope' }],
        operation: 'summarize',
        eligible_models: ['local-general-v1'],
      }),
    ).rejects.toMatchObject({ reasonCode: 'MODEL_NOT_ELIGIBLE' });
  });

  it('SmartRouter selects only from eligible models', () => {
    expect(
      selectEligibleModel({
        eligibleModels: ['local-general-v1', 'cloud-public-gpt'],
        requestedModel: 'cloud-public-gpt',
      }),
    ).toBe('cloud-public-gpt');

    expect(
      selectEligibleModel({
        eligibleModels: ['local-general-v1'],
        requestedModel: 'cloud-public-gpt',
      }),
    ).toBe('local-general-v1');
  });
});
