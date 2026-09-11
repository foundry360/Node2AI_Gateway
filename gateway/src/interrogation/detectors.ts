import type { DetectedEntity, DetectedEntityType } from './types.js';

interface PatternDef {
  type: DetectedEntityType;
  regex: RegExp;
  category: 'PII' | 'PHI' | 'Credential' | 'Financial';
  reason: string;
  /**
   * When set, only the capture group is tokenized (label stays plaintext).
   * Regex must use the `d` flag so match.indices is available.
   */
  valueGroup?: number;
}

const PATTERNS: PatternDef[] = [
  {
    type: 'SSN',
    regex: /\b\d{3}-\d{2}-\d{4}\b/g,
    category: 'PII',
    reason: 'SSN_PATTERN',
  },
  {
    type: 'EMAIL',
    regex: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
    category: 'PII',
    reason: 'EMAIL_PATTERN',
  },
  {
    type: 'PHONE',
    // Avoid \\b before '(' so "(415) 555-0142" matches including parentheses.
    regex: /(?<![A-Za-z0-9])(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}\b/g,
    category: 'PII',
    reason: 'PHONE_PATTERN',
  },
  {
    type: 'CREDIT_CARD',
    regex: /\b(?:\d[ -]*?){13,19}\b/g,
    category: 'Financial',
    reason: 'CREDIT_CARD_PATTERN',
  },
  {
    type: 'MRN',
    // Value-only: keep "MRN:" label; tokenize the identifier.
    regex: /\b(?:MRN|Medical\s*Record\s*(?:No|Number|#)?)[:\s#-]*([A-Z0-9-]{4,})\b/gi,
    valueGroup: 1,
    category: 'PHI',
    reason: 'HEALTH_INFORMATION',
  },
  {
    type: 'NPI',
    regex: /\bNPI[:\s#-]*(\d{10})\b/gi,
    valueGroup: 1,
    category: 'PHI',
    reason: 'HEALTH_INFORMATION',
  },
  {
    type: 'DOB',
    // Labeled DOB only (avoids bare-date false positives). Supports M/D/Y and ISO.
    regex:
      /\b(?:DOB|Date\s*of\s*Birth)[:\s-]*(\d{4}-\d{2}-\d{2}|\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})\b/gi,
    valueGroup: 1,
    category: 'PHI',
    reason: 'HEALTH_INFORMATION',
  },
  {
    type: 'DIAGNOSIS_MARKER',
    regex: /\b(?:diagnosis|diagnosed with|ICD-10|PHI|patient\s+presents|clinical\s+note)\b/gi,
    category: 'PHI',
    reason: 'HEALTH_INFORMATION',
  },
  {
    type: 'AWS_KEY',
    regex: /\bAKIA[0-9A-Z]{16}\b/g,
    category: 'Credential',
    reason: 'CREDENTIAL_PATTERN',
  },
  {
    type: 'API_KEY',
    regex: /\b(?:api[_-]?key|secret[_-]?key)[:\s=]+['\"]?[A-Za-z0-9_\-]{16,}['\"]?/gi,
    category: 'Credential',
    reason: 'CREDENTIAL_PATTERN',
  },
  {
    type: 'PASSWORD',
    regex: /\b(?:password|passwd|pwd)[:\s=]+\S+/gi,
    category: 'Credential',
    reason: 'CREDENTIAL_PATTERN',
  },
  {
    type: 'BEARER_TOKEN',
    regex: /\bBearer\s+[A-Za-z0-9\-._~+\/]+=*/g,
    category: 'Credential',
    reason: 'CREDENTIAL_PATTERN',
  },
  {
    type: 'IBAN',
    regex: /\b[A-Z]{2}\d{2}[A-Z0-9]{10,30}\b/g,
    category: 'Financial',
    reason: 'FINANCIAL_PATTERN',
  },
];

export interface DeterministicDetection {
  entities: DetectedEntity[];
  categories: Set<'PII' | 'PHI' | 'Credential' | 'Financial'>;
  reason_codes: string[];
}

function previewOf(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length <= 4) return '****';
  return `${trimmed.slice(0, 2)}…${trimmed.slice(-2)}`;
}

function spanForMatch(
  match: RegExpExecArray,
  valueGroup?: number,
): { start: number; end: number; value: string } | null {
  if (valueGroup == null) {
    return {
      start: match.index,
      end: match.index + match[0].length,
      value: match[0],
    };
  }
  const value = match[valueGroup];
  if (!value || !value.trim()) return null;
  const indices = match.indices?.[valueGroup];
  const rawStart = indices ? indices[0] : match.index + match[0].indexOf(value);
  if (rawStart < 0) return null;
  const lead = value.length - value.trimStart().length;
  const trail = value.length - value.trimEnd().length;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return {
    start: rawStart + lead,
    end: rawStart + value.length - trail,
    value: trimmed,
  };
}

export function detectDeterministic(text: string): DeterministicDetection {
  const entities: DetectedEntity[] = [];
  const categories = new Set<'PII' | 'PHI' | 'Credential' | 'Financial'>();
  const reason_codes = new Set<string>();

  for (const pattern of PATTERNS) {
    const flags = new Set(pattern.regex.flags.split('').filter(Boolean));
    flags.add('g');
    if (pattern.valueGroup != null) flags.add('d');
    const re = new RegExp(pattern.regex.source, [...flags].join(''));
    let match: RegExpExecArray | null;
    while ((match = re.exec(text)) !== null) {
      const span = spanForMatch(match, pattern.valueGroup);
      if (!span) continue;
      // Already-tokenized vault placeholders are not residual plaintext entities.
      if (/^\{\{TOK_[A-Za-z0-9_]+\}\}$/.test(span.value)) continue;
      // Avoid naive credit-card false positives on short digit groups / MRNs
      if (pattern.type === 'CREDIT_CARD') {
        const digits = span.value.replace(/\D/g, '');
        if (digits.length < 13 || digits.length > 19) continue;
      }
      // Skip diagnosis markers for transform targets — evidence only via category.
      // (Transform still receives them today; TOKENIZE of markers is harmless but noisy.
      // Keep as entities for classification.)
      entities.push({
        type: pattern.type,
        preview: previewOf(span.value),
        start: span.start,
        end: span.end,
        source: 'deterministic',
      });
      categories.add(pattern.category);
      reason_codes.add(pattern.reason);
    }
  }

  return {
    entities,
    categories,
    reason_codes: [...reason_codes],
  };
}
