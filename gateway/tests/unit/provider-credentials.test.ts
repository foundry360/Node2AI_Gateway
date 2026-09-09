import { describe, expect, it } from 'vitest';
import {
  createPhase1Gateway,
  GENERAL_APP_API_KEY,
} from '../../src/api/app-factory.js';
import {
  DefaultModelGateway,
  ExternalOpenAICompatibleProvider,
  InMemoryModelRegistry,
  InMemoryProviderCredentialStore,
} from '../../src/models/index.js';

describe('Application BYOK provider credentials', () => {
  it('admin can store credential; GET returns metadata only (no plaintext secret)', async () => {
    const gw = createPhase1Gateway({
      config: { adminApiKey: 'test_admin', deploymentMode: 'connected' },
    });
    const app = await gw.buildServer();

    const put = await app.inject({
      method: 'PUT',
      url: '/v1/admin/applications/app_general/provider-credential',
      headers: { authorization: 'Bearer test_admin' },
      payload: {
        provider_kind: 'openai_compatible',
        endpoint_url: 'https://api.openai.com',
        api_key: 'sk-customer-secret-abcdef',
        model_map: 'cloud-public-gpt:gpt-4o-mini',
      },
    });
    expect(put.statusCode).toBe(200);
    const putBody = put.json() as {
      configured: boolean;
      provider_credential: { api_key_last4: string; endpoint_url: string };
    };
    expect(putBody.configured).toBe(true);
    expect(putBody.provider_credential.api_key_last4).toBe('cdef');
    // PUT responses stay redacted
    expect(JSON.stringify(putBody)).not.toContain('sk-customer-secret');

    const get = await app.inject({
      method: 'GET',
      url: '/v1/admin/applications/app_general/provider-credential',
      headers: { authorization: 'Bearer test_admin' },
    });
    expect(get.statusCode).toBe(200);
    const getBody = get.json() as {
      configured: boolean;
      provider_credential: { api_key_last4: string; api_key?: string };
    };
    expect(getBody.configured).toBe(true);
    expect(getBody.provider_credential.api_key_last4).toBe('cdef');
    expect(getBody.provider_credential.api_key).toBeUndefined();
    expect(JSON.stringify(getBody)).not.toContain('sk-customer-secret');
  });

  it('cloud completion uses application BYOK key, not appliance env key', async () => {
    let seenAuth: string | undefined;
    let seenUrl: string | undefined;
    const fetchImpl: typeof fetch = async (input, init) => {
      seenUrl =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url;
      const headers = new Headers(init?.headers);
      seenAuth = headers.get('authorization') ?? undefined;
      return new Response(
        JSON.stringify({
          choices: [{ message: { role: 'assistant', content: 'BYOK summary' } }],
          usage: { prompt_tokens: 3, completion_tokens: 2 },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    };

    const credentials = new InMemoryProviderCredentialStore();
    await credentials.upsert({
      application_id: 'app_general',
      organization_id: 'org_demo',
      provider_kind: 'openai_compatible',
      endpoint_url: 'https://byok.example.com',
      api_key: 'sk-app-byok-key',
      model_map: { 'cloud-public-gpt': 'gpt-4o-mini' },
    });

    const external = new ExternalOpenAICompatibleProvider({
      baseUrl: 'https://appliance-default.example.com',
      apiKey: 'sk-appliance-env-key',
      modelMap: { 'cloud-public-gpt': 'gpt-4o-mini' },
      fetchImpl,
      kind: 'cloud',
      credentialStore: credentials,
    });
    const registry = new InMemoryModelRegistry([
      {
        model_id: 'cloud-public-gpt',
        provider_id: 'external-openai-compatible',
        name: 'Cloud',
        kind: 'cloud',
        status: 'active',
      },
      {
        model_id: 'local-general-v1',
        provider_id: 'local-runtime',
        name: 'Local',
        kind: 'local',
        status: 'active',
      },
    ]);

    const gw = createPhase1Gateway({
      config: {
        deploymentMode: 'connected',
        externalProviderApiKey: 'sk-appliance-env-key',
      },
      providerCredentials: credentials,
      providers: [external],
      models: new DefaultModelGateway(registry, [external], 'connected'),
      registryModels: ['cloud-public-gpt', 'local-general-v1'],
    });

    const result = await gw.orchestrator.completions(GENERAL_APP_API_KEY, {
      application_id: 'app_general',
      user: { id: 'user_clinician' },
      operation: 'summarize',
      model: 'cloud-public-gpt',
      messages: [{ role: 'user', content: 'Summarize quarterly readiness.' }],
    });

    expect(result.httpStatus).toBe(200);
    expect(result.body.status).toBe('approved');
    expect(seenAuth).toBe('Bearer sk-app-byok-key');
    expect(seenUrl).toContain('https://byok.example.com/v1/chat/completions');
    expect(seenAuth).not.toContain('sk-appliance-env-key');
  });

  it('cloud completion fails closed when no BYOK and no appliance key', async () => {
    const fetchImpl: typeof fetch = async () => {
      throw new Error('should not call provider');
    };
    const credentials = new InMemoryProviderCredentialStore();
    const external = new ExternalOpenAICompatibleProvider({
      baseUrl: 'https://api.openai.com',
      modelMap: { 'cloud-public-gpt': 'gpt-4o-mini' },
      fetchImpl,
      kind: 'cloud',
      credentialStore: credentials,
    });
    const registry = new InMemoryModelRegistry([
      {
        model_id: 'cloud-public-gpt',
        provider_id: 'external-openai-compatible',
        name: 'Cloud',
        kind: 'cloud',
        status: 'active',
      },
      {
        model_id: 'local-general-v1',
        provider_id: 'local-runtime',
        name: 'Local',
        kind: 'local',
        status: 'active',
      },
    ]);

    const gw = createPhase1Gateway({
      config: { deploymentMode: 'connected' },
      providerCredentials: credentials,
      providers: [external],
      models: new DefaultModelGateway(registry, [external], 'connected'),
      registryModels: ['cloud-public-gpt', 'local-general-v1'],
    });

    const result = await gw.orchestrator.completions(GENERAL_APP_API_KEY, {
      application_id: 'app_general',
      user: { id: 'user_clinician' },
      operation: 'summarize',
      model: 'cloud-public-gpt',
      messages: [{ role: 'user', content: 'Summarize quarterly readiness.' }],
    });

    expect(result.body.status).toBe('blocked');
    if (result.body.status === 'blocked') {
      expect(result.body.reason_code).toBe('PROVIDER_CREDENTIAL_MISSING');
    }
  });
});
