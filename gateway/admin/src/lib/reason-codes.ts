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
  };

  if (known[key]) return known[key];

  return key
    .toLowerCase()
    .split('_')
    .filter(Boolean)
    .map((part, i) => (i === 0 ? part.charAt(0).toUpperCase() + part.slice(1) : part))
    .join(' ');
}

export function formatReasonCodes(codes: string[] | undefined | null): string {
  if (!codes || codes.length === 0) return '';
  return codes.map(formatReasonCode).join(', ');
}
