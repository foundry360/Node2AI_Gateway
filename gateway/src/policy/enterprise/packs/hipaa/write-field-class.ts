/**
 * Server-controlled write governance classification for HIPAA pack input.
 *
 * Declared action.kind / field attributes are request facts only — never authorization.
 * Classification is derived here so clients cannot self-assert "low risk".
 *
 * Agent-agnostic: field tokens are normalized identifiers (phone, email, …),
 * not vendor-specific application logic.
 */

export type WriteGovernanceClass =
  | 'CLINICAL_NOTE'
  | 'ADMINISTRATIVE_LOW_RISK'
  | 'UNKNOWN';

/**
 * Explicit allowlist of administrative / demographic field tokens.
 * Keep intentionally small — unknown fields fail closed to REVIEW.
 */
export const ADMINISTRATIVE_LOW_RISK_FIELD_TOKENS: ReadonlySet<string> = new Set([
  'phone',
  'phone_number',
  'mobile',
  'mobile_phone',
  'email',
  'email_address',
  'address',
  'street',
  'city',
  'state',
  'postal_code',
  'zip',
  'zip_code',
  'preferred_language',
  'language',
  'emergency_contact',
  'emergency_contact_name',
  'emergency_contact_phone',
  'emergency_contact_relation',
]);

/** Normalize a declared field identifier into a comparable token. */
export function normalizeWriteFieldToken(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  return trimmed
    .toLowerCase()
    // Common custom-field suffix patterns across enterprise platforms
    .replace(/__c$/i, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

export function isAdministrativeLowRiskField(fieldRaw: unknown): boolean {
  const token = normalizeWriteFieldToken(fieldRaw);
  if (!token) return false;
  if (ADMINISTRATIVE_LOW_RISK_FIELD_TOKENS.has(token)) return true;
  // phone_home → phone prefix match only for explicit contact prefixes
  if (token.startsWith('phone_') || token.endsWith('_phone')) return true;
  if (token.startsWith('email_') || token.endsWith('_email')) return true;
  return false;
}

/**
 * Derive write governance class from declared action facts.
 * Missing / unrecognized write subtypes → UNKNOWN (fail closed).
 */
export function deriveWriteGovernanceClass(facts: {
  operation?: string;
  action_kind?: string;
  action_attributes?: Record<string, unknown>;
}): WriteGovernanceClass | undefined {
  const op = String(facts.operation ?? '')
    .trim()
    .toLowerCase();
  if (op !== 'write') return undefined;

  const kind = String(facts.action_kind ?? '')
    .trim()
    .toLowerCase();

  if (kind === 'clinical_note') return 'CLINICAL_NOTE';

  if (kind === 'field_update') {
    const field = facts.action_attributes?.field;
    if (isAdministrativeLowRiskField(field)) return 'ADMINISTRATIVE_LOW_RISK';
    return 'UNKNOWN';
  }

  return 'UNKNOWN';
}
