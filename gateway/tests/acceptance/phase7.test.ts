import { describe, expect, it } from 'vitest';
import {
  createPhase1Gateway,
  GENERAL_APP_API_KEY,
  PHASE1_DEMO_API_KEY,
} from '../../src/api/app-factory.js';
import {
  DefaultModelGateway,
  ExternalOpenAICompatibleProvider,
  InMemoryModelRegistry,
  LocalModelProvider,
  ScriptedModelProvider,
  StubLocalRuntime,
} from '../../src/models/index.js';
import { createStrictAirgapFetch } from '../../src/shared/airgap.js';

describe('Phase 7 acceptance — Air-Gap', () => {
  it('Test 10 — full governed path with network disabled (local only, zero external calls)', async () => {
    let outboundAttempts = 0;
    const sealedFetch: typeof fetch = async (input) => {
      outboundAttempts += 1;
      const url =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url;
      throw new Error(`AIRGAP_NETWORK_DENIED: ${url}`);
    };

    const provider = new ScriptedModelProvider(
      ['local-general-v1'],
      'Air-gap summary: continue supportive care.',
      { providerId: 'local-runtime' },
    );
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

    const gw = createPhase1Gateway({
      config: { deploymentMode: 'airgap' },
      externalFetch: sealedFetch,
      providers: [provider],
      models: new DefaultModelGateway(registry, [provider], 'airgap'),
    });

    // Prove available models are local-only in air-gap
    expect(gw.models.listAvailableModels()).toEqual(['local-general-v1']);
    expect(gw.providers.every((p) => p.kind === 'local')).toBe(true);

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
      expect(result.body.response.message.content).toContain('Air-gap summary');
    }

    const last = (await gw.audit.list()).at(-1)!;
    expect(last.provider).toBe('local-runtime');
    expect(last.response_decision).toBe('RELEASE');
    expect(outboundAttempts).toBe(0);
  });

  it('Air-gap blocks cloud model with zero external provider HTTP', async () => {
    let externalCalls = 0;
    const fetchImpl: typeof fetch = async () => {
      externalCalls += 1;
      return new Response('should-not-run', { status: 500 });
    };

    // Even if an external provider is constructed, air-gap factory strips non-local.
    const external = new ExternalOpenAICompatibleProvider({
      baseUrl: 'https://api.openai.com',
      modelMap: { 'cloud-public-gpt': 'gpt-4o-mini' },
      fetchImpl,
      kind: 'cloud',
    });
    const local = new LocalModelProvider(
      new StubLocalRuntime(['local-general-v1']),
      ['local-general-v1'],
    );

    const gw = createPhase1Gateway({
      config: { deploymentMode: 'airgap' },
      providers: [local, external],
    });

    expect(gw.providers.map((p) => p.kind)).toEqual(['local']);
    expect(externalCalls).toBe(0);

    const blocked = await gw.orchestrator.completions(GENERAL_APP_API_KEY, {
      application_id: 'app_general',
      user: { id: 'user_clinician' },
      operation: 'summarize',
      model: 'cloud-public-gpt',
      messages: [{ role: 'user', content: 'Try cloud while air-gapped' }],
    });

    expect(blocked.body.status).toBe('blocked');
    expect(externalCalls).toBe(0);
  });

  it('Strict airgap fetch denies any outbound URL', async () => {
    const sealed = createStrictAirgapFetch();
    await expect(sealed('https://api.openai.com/v1/models')).rejects.toThrow(
      /AIRGAP_NETWORK_DENIED/,
    );
  });

  it('Documented bypass prevention: no ungoverned provider route in air-gap server', async () => {
    const gw = createPhase1Gateway({ config: { deploymentMode: 'airgap' } });
    const server = await gw.buildServer();
    await server.ready();

    const status = await server.inject({ method: 'GET', url: '/v1/system/status' });
    expect(status.json().deployment_mode).toBe('airgap');

    const routes = server.printRoutes().toLowerCase();
    expect(routes).not.toContain('openai');
    expect(routes).not.toContain('bypass');
    expect(routes).toContain('completions');

    await server.close();
  });
});
