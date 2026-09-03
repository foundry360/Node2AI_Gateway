import type { DetectedEntity, DetectedEntityType } from './types.js';

interface PatternDef {
  type: DetectedEntityType;
  regex: RegExp;
  category: 'PII' | 'PHI' | 'Credential' | 'Financial';
  reason: string;
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
    regex: /\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}\b/g,
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
    regex: /\b(?:MRN|Medical\s*Record\s*(?:No|Number|#)?)[:\s#-]*[A-Z0-9-]{4,}\b/gi,
    category: 'PHI',
    reason: 'HEALTH_INFORMATION',
  },
  {
    type: 'NPI',
    regex: /\bNPI[:\s#-]*\d{10}\b/gi,
    category: 'PHI',
    reason: 'HEALTH_INFORMATION',
  },
  {
    type: 'DOB',
    regex: /\b(?:DOB|Date\s*of\s*Birth)[:\s-]*\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}\b/gi,
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
  if (value.length <= 4) return '****';
  return `${value.slice(0, 2)}…${value.slice(-2)}`;
}

export function detectDeterministic(text: string): DeterministicDetection {
  const entities: DetectedEntity[] = [];
  const categories = new Set<'PII' | 'PHI' | 'Credential' | 'Financial'>();
  const reason_codes = new Set<string>();

  for (const pattern of PATTERNS) {
    const re = new RegExp(pattern.regex.source, pattern.regex.flags);
    let match: RegExpExecArray | null;
    while ((match = re.exec(text)) !== null) {
      const value = match[0];
      // Avoid naive credit-card false positives on short digit groups / MRNs
      if (pattern.type === 'CREDIT_CARD') {
        const digits = value.replace(/\D/g, '');
        if (digits.length < 13 || digits.length > 19) continue;
      }
      entities.push({
        type: pattern.type,
        preview: previewOf(value),
        start: match.index,
        end: match.index + value.length,
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
