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
  | 'MODEL_NOT_ELIGIBLE'
  | 'OPERATION_NOT_ALLOWED'
  | 'TOKENIZE_REQUIRED'
  | 'TRANSFORM_FAILURE'
  | 'INSPECTION_FAILURE'
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
