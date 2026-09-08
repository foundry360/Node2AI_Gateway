import { GatewayError } from '../../shared/errors.js';
import type { ProviderCredentialStore } from '../provider-credentials.js';
import type {
  ModelExecutionRequest,
  ModelExecutionResult,
  ModelProvider,
} from '../types.js';

export interface ExternalOpenAICompatibleOptions {
  providerId?: string;
  baseUrl: string;
  apiKey?: string;
  /** Gateway model_id → upstream model name */
  modelMap: Record<string, string>;
  fetchImpl?: typeof fetch;
  kind?: 'private' | 'cloud';
  /**
   * Resolve customer BYOK credentials for the calling application.
   * When present and active, overrides constructor baseUrl/apiKey/modelMap entries.
   */
  credentialStore?: ProviderCredentialStore;
}

/**
 * External / private OpenAI-compatible provider adapter.
 * Never authorizes — only called after PolicyEngine eligibility.
 * Prefers application BYOK credentials; falls back to appliance defaults.
 */
export class ExternalOpenAICompatibleProvider implements ModelProvider {
  readonly providerId: string;
  readonly kind: 'private' | 'cloud';
  private readonly baseUrl: string;
  private readonly apiKey?: string;
  private readonly modelMap: Record<string, string>;
  private readonly fetchImpl: typeof fetch;
  private readonly credentialStore?: ProviderCredentialStore;

  constructor(options: ExternalOpenAICompatibleOptions) {
    this.providerId = options.providerId ?? 'external-openai-compatible';
    this.kind = options.kind ?? 'cloud';
    this.baseUrl = options.baseUrl.replace(/\/$/, '');
    this.apiKey = options.apiKey;
    this.modelMap = options.modelMap;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.credentialStore = options.credentialStore;
  }

  supports(modelId: string): boolean {
    return Object.prototype.hasOwnProperty.call(this.modelMap, modelId);
  }

  async execute(req: ModelExecutionRequest): Promise<ModelExecutionResult> {
    let baseUrl = this.baseUrl;
    let apiKey = this.apiKey;
    let modelMap = { ...this.modelMap };

    if (this.credentialStore && req.application_id) {
      const byok = await this.credentialStore.resolveSecret(req.application_id);
      if (byok) {
        baseUrl = byok.endpoint_url.replace(/\/$/, '');
        apiKey = byok.api_key;
        modelMap = { ...modelMap, ...byok.model_map };
      }
    }

    const upstreamModel = modelMap[req.model_id];
    if (!upstreamModel) {
      throw new Error(`No upstream mapping for model ${req.model_id}`);
    }

    if (!apiKey) {
      throw new GatewayError(
        'PROVIDER_CREDENTIAL_MISSING',
        'No provider API key configured for this application. Register a model provider credential in Enigma Admin.',
        403,
      );
    }

    const headers: Record<string, string> = {
      'content-type': 'application/json',
      'x-request-id': req.request_id,
      'x-correlation-id': req.correlation_id,
      authorization: `Bearer ${apiKey}`,
    };

    const res = await this.fetchImpl(`${baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: upstreamModel,
        messages: req.messages,
      }),
    });

    if (!res.ok) {
      throw new Error(`External provider error: HTTP ${res.status}`);
    }

    const data = (await res.json()) as {
      choices?: Array<{ message?: { role?: string; content?: string } }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };

    const content = data.choices?.[0]?.message?.content ?? '';
    return {
      model_id: req.model_id,
      provider: this.providerId,
      message: { role: 'assistant', content },
      usage: {
        input_tokens: data.usage?.prompt_tokens ?? 0,
        output_tokens: data.usage?.completion_tokens ?? 0,
      },
    };
  }
}
