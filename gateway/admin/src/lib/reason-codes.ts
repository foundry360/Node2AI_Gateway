import { formatFieldLabel } from '@/lib/field-label';

/** Turn POLICY_REASON_CODE into a human label. */
export function formatReasonCode(code: string): string {
  const key = code.trim();
  if (!key) return key;

  const known: Record<string, string> = {
    MODEL_NOT_ELIGIBLE: 'Model not eligible',
    VALIDATION_FAILED: 'Validation failed',
    APPLICATION_MISMATCH: 'Application mismatch',
    POLICY_DISABLED: 'Policy disabled',
    POLICY_ALLOW: 'Policy allow',
    UNAUTHENTICATED: 'Unauthenticated',
    TRANSFORM_FAILURE: 'Transform failure',
    UNTRUSTED_APPLICATION: 'Untrusted application',
    RESPONSE_TOOL_OR_ACTION_BLOCKED: 'Tool or action blocked',
    RESPONSE_CREDENTIAL_BLOCKED: 'Credential blocked',
    RESPONSE_PHI_BLOCKED: 'PHI blocked',
    RESPONSE_PII_REDACT: 'PII redacted',
    LOCAL_MODEL_ONLY: 'Local model only',
    EMAIL_PATTERN: 'Email pattern',
    HEALTH_INFORMATION: 'Health information',
    PII_LANGUAGE: 'PII language',
    CONFIDENTIAL_LANGUAGE: 'Confidential language',
    SEMANTIC_HEURISTIC: 'Semantic heuristic',
    SEMANTIC_NO_ELEVATION: 'No semantic elevation',
    HIPAA_PHI_EXTERNAL_CONTROLS_NOT_SATISFIED:
      'HIPAA PHI external controls not satisfied',
    HIPAA_PHI_PROCESSING_CONTROLS_SATISFIED:
      'HIPAA PHI processing controls satisfied',
    HIPAA_PHI_INSUFFICIENT_EVIDENCE_FOR_PROCESSING:
      'HIPAA PHI insufficient evidence for processing',
    HIPAA_PHI_OUTPUT_NOT_AUTHORIZED: 'HIPAA PHI output not authorized',
  };

  if (known[key]) return known[key];

  return formatFieldLabel(key);
}

export function formatReasonCodes(codes: string[] | undefined | null): string {
  if (!codes || codes.length === 0) return '';
  return codes.map(formatReasonCode).join(', ');
}
