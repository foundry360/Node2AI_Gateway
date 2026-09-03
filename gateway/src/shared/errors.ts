export type ReasonCode =
  | 'UNAUTHENTICATED'
  | 'APPLICATION_MISMATCH'
  | 'APPLICATION_INACTIVE'
  | 'USER_NOT_FOUND'
  | 'USER_INACTIVE'
  | 'VALIDATION_FAILED'
  | 'CLASSIFICATION_FAILURE'
  | 'POLICY_BLOCKED'
  | 'POLICY_ENGINE_FAILURE'
  | 'POLICY_DISABLED'
  | 'MODEL_NOT_ELIGIBLE'
  | 'OPERATION_NOT_ALLOWED'
  | 'TOKENIZE_REQUIRED'
  | 'TRANSFORM_FAILURE'
  | 'INSPECTION_FAILURE'
  | 'LOCAL_RUNTIME_UNAVAILABLE'
  | 'LOCAL_MODEL_NOT_READY'
  | 'AIRGAP_LOCAL_RUNTIME_UNAVAILABLE'
  | 'INTERNAL_ERROR';

export class GatewayError extends Error {
  constructor(
    public readonly reasonCode: ReasonCode,
    message: string,
    public readonly httpStatus: number = 403,
  ) {
    super(message);
    this.name = 'GatewayError';
  }
}

export function isGatewayError(err: unknown): err is GatewayError {
  return err instanceof GatewayError;
}

/** Map runtime Error messages that use CODE: detail form into GatewayError. */
export function gatewayErrorFromUnknown(err: unknown): GatewayError | null {
  if (isGatewayError(err)) return err;
  if (!(err instanceof Error)) return null;
  const msg = err.message;
  const map: Array<[string, ReasonCode, number]> = [
    ['AIRGAP_LOCAL_RUNTIME_UNAVAILABLE', 'AIRGAP_LOCAL_RUNTIME_UNAVAILABLE', 503],
    ['LOCAL_RUNTIME_UNAVAILABLE', 'LOCAL_RUNTIME_UNAVAILABLE', 503],
    ['LOCAL_MODEL_NOT_READY', 'LOCAL_MODEL_NOT_READY', 503],
  ];
  for (const [prefix, code, status] of map) {
    if (msg.startsWith(prefix)) {
      return new GatewayError(code, msg, status);
    }
  }
  if (msg.includes('Ollama runtime error: HTTP 404')) {
    return new GatewayError(
      'LOCAL_MODEL_NOT_READY',
      'LOCAL_MODEL_NOT_READY: Local model is not pulled yet (Ollama returned 404).',
      503,
    );
  }
  return null;
}
