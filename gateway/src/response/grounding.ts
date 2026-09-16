/**
 * Response grounding — fail closed when the model invents identifiers/dates
 * that were not present in the source request corpus.
 *
 * This is enforcement, not prompt engineering: one general check for all scenarios.
 */

const TOKEN_RE = /\{\{TOK_[A-Za-z0-9_]+\}\}/g;

const ISO_DATE_RE = /\b(\d{4})-(\d{2})-(\d{2})\b/g;
const US_DATE_RE = /\b(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})\b/g;
const MRN_RE = /\bMRN[-:\s]*([A-Z0-9-]{4,})\b/gi;
const EMAIL_RE = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const PHONE_RE =
  /(?<![A-Za-z0-9])(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}\b/g;

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function toIso(year: number, month: number, day: number): string | null {
  if (year < 1900 || year > 2100) return null;
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > 31) return null;
  const dt = new Date(Date.UTC(year, month - 1, day));
  if (
    dt.getUTCFullYear() !== year ||
    dt.getUTCMonth() !== month - 1 ||
    dt.getUTCDate() !== day
  ) {
    return null;
  }
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

function extractIsoDates(text: string): Set<string> {
  const out = new Set<string>();
  for (const m of text.matchAll(ISO_DATE_RE)) {
    const iso = toIso(Number(m[1]), Number(m[2]), Number(m[3]));
    if (iso) out.add(iso);
  }
  for (const m of text.matchAll(US_DATE_RE)) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    let year = Number(m[3]);
    if (year < 100) year += year >= 70 ? 1900 : 2000;
    // Prefer M/D/Y (US clinical).
    const iso = toIso(year, a, b);
    if (iso) out.add(iso);
  }
  return out;
}

function normalizeMrnId(raw: string): string {
  let id = raw.trim().toUpperCase();
  if (id.startsWith('MRN-')) id = id.slice(4);
  if (id.startsWith('MRN')) id = id.slice(3).replace(/^[-:\s]+/, '');
  return id;
}

function extractLiteralClaims(text: string): Set<string> {
  const out = new Set<string>();
  const withoutTokens = text.replace(TOKEN_RE, ' ');
  for (const m of withoutTokens.matchAll(EMAIL_RE)) {
    out.add(`email:${m[0].toLowerCase()}`);
  }
  for (const m of withoutTokens.matchAll(PHONE_RE)) {
    const digits = m[0].replace(/\D/g, '');
    if (digits.length >= 10) out.add(`phone:${digits.slice(-10)}`);
  }
  for (const m of withoutTokens.matchAll(MRN_RE)) {
    const id = normalizeMrnId(String(m[1] ?? ''));
    if (id.length >= 4) out.add(`mrn:${id}`);
  }
  for (const iso of extractIsoDates(withoutTokens)) {
    out.add(`date:${iso}`);
  }
  return out;
}

export type GroundingResult =
  | { ok: true }
  | { ok: false; ungrounded: string[]; reason_code: 'UNGROUNDED_RESPONSE_CLAIM' };

/**
 * Every identifier/date asserted in the model response must appear in the
 * original (pre-tokenize) source corpus. Vault tokens are ignored here;
 * invented plaintext values fail closed.
 */
export function assertResponseGrounded(
  sourceText: string,
  responseText: string,
): GroundingResult {
  const sourceClaims = extractLiteralClaims(sourceText);
  const responseClaims = extractLiteralClaims(responseText);
  const ungrounded: string[] = [];
  for (const claim of responseClaims) {
    if (!sourceClaims.has(claim)) ungrounded.push(claim);
  }
  if (ungrounded.length === 0) return { ok: true };
  return {
    ok: false,
    ungrounded: ungrounded.sort(),
    reason_code: 'UNGROUNDED_RESPONSE_CLAIM',
  };
}
