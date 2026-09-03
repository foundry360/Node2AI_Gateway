import { GatewayError } from '../shared/errors.js';
import type { DeploymentMode } from '../shared/config.js';
import type {
  ModelExecutionRequest,
  ModelExecutionResult,
  ModelGateway,
  ModelProvider,
  ModelRegistry,
} from './types.js';

/**
 * Routes execution to a provider for an already policy-approved model.
 * Does not evaluate policy. Defense-in-depth: rejects models outside eligible_models.
 * In air-gap mode, refuses non-local providers (configuration enforcement, not policy).
 */
export class DefaultModelGateway implements ModelGateway {
  constructor(
    private readonly registry: ModelRegistry,
    private readonly providers: ModelProvider[],
    private readonly deploymentMode: DeploymentMode = 'connected',
  ) {}

  listAvailableModels(): string[] {
    const ids = this.registry.listActiveModelIds();
    if (this.deploymentMode !== 'airgap') return ids;
    return this.registry
      .listActive()
      .filter((m) => m.kind === 'local')
      .map((m) => m.model_id);
  }

  async executeApproved(req: ModelExecutionRequest): Promise<ModelExecutionResult> {
    if (!req.eligible_models.includes(req.model_id)) {
      throw new GatewayError(
        'MODEL_NOT_ELIGIBLE',
        'Model is not in the policy-eligible set.',
        403,
      );
    }

    const registered = this.registry.get(req.model_id);
    if (!registered || registered.status !== 'active') {
      throw new GatewayError(
        'MODEL_NOT_ELIGIBLE',
        'Model is not in the approved registry.',
        403,
      );
    }

    if (this.deploymentMode === 'airgap' && registered.kind !== 'local') {
      throw new GatewayError(
        'MODEL_NOT_ELIGIBLE',
        'Air-gap mode permits local models only.',
        403,
      );
    }

    const provider =
      this.providers.find(
        (p) => p.providerId === registered.provider_id && p.supports(req.model_id),
      ) ?? this.providers.find((p) => p.supports(req.model_id));

    if (!provider) {
      throw new GatewayError(
        'MODEL_NOT_ELIGIBLE',
        'No provider available for approved model.',
        403,
      );
    }

    if (this.deploymentMode === 'airgap' && provider.kind !== 'local') {
      throw new GatewayError(
        'MODEL_NOT_ELIGIBLE',
        'Air-gap mode refuses non-local providers.',
        403,
      );
    }

    return provider.execute(req);
  }
}
