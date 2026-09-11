import type { DetectedEntity } from '../interrogation/types.js';
import type {
  AppliedReplacement,
  DetokenizationService,
  TokenVault,
  TransformAction,
  TransformRequest,
  TransformResult,
  TransformService,
} from './types.js';
import { newTokenValue } from './vault.js';

const TOKEN_PATTERN = /\{\{TOK_[A-Za-z0-9_]+\}\}/g;

/** Bucket labels expand to concrete detector entity types. */
const TARGET_BUCKETS: Record<string, readonly string[]> = {
  PHI: ['MRN', 'NPI', 'DOB', 'EMAIL', 'PHONE', 'SSN', 'NAME', 'ADDRESS'],
  PII: ['EMAIL', 'PHONE', 'SSN', 'NAME', 'ADDRESS'],
  CREDENTIAL: ['PASSWORD', 'API_KEY', 'SECRET', 'TOKEN'],
  FINANCIAL: ['CREDIT_CARD', 'BANK_ACCOUNT'],
};

function resolveAction(decision: TransformRequest['decision']): TransformAction {
  switch (decision) {
    case 'TOKENIZE':
      return 'tokenize';
    case 'REDACT':
      return 'redact';
    case 'MASK':
      return 'mask';
    case 'TRANSFORM':
      return 'tokenize';
    default:
      return 'none';
  }
}

function maskValue(value: string, entityType: string): string {
  if (entityType === 'EMAIL') {
    const [user, domain] = value.split('@');
    if (!domain) return '***';
    return `${(user ?? '*').slice(0, 1)}***@${domain.slice(0, 1)}***`;
  }
  if (value.length <= 4) return '****';
  return `${'*'.repeat(Math.max(0, value.length - 4))}${value.slice(-4)}`;
}

function redactValue(entityType: string): string {
  return `[REDACTED_${entityType}]`;
}

function extractOriginal(text: string, entity: DetectedEntity): string {
  return text.slice(entity.start, entity.end);
}

function expandTargets(targets: string[]): Set<string> {
  const out = new Set<string>();
  for (const raw of targets) {
    const key = String(raw ?? '')
      .trim()
      .toUpperCase();
    if (!key) continue;
    const bucket = TARGET_BUCKETS[key];
    if (bucket) {
      for (const t of bucket) out.add(t);
    } else {
      out.add(key);
    }
  }
  return out;
}

/**
 * Filter entities by policy transform targets.
 * Empty targets = no restriction (all non-marker entities).
 */
export function filterEntitiesByTargets(
  entities: DetectedEntity[],
  transforms: Array<{ type: string; targets: string[] }>,
): DetectedEntity[] {
  const allTargets = transforms.flatMap((t) => t.targets ?? []);
  const expanded = expandTargets(allTargets);
  const base = entities.filter((e) => e.type !== 'DIAGNOSIS_MARKER');
  if (expanded.size === 0) return base;
  return base.filter((e) => expanded.has(String(e.type).toUpperCase()));
}

/**
 * Applies policy-required input transforms. Failures must propagate (fail closed).
 * Honors transforms[].targets as entity-type / bucket allowlists (minimum necessary).
 */
export class InputTransformService implements TransformService {
  constructor(
    private readonly vault: TokenVault,
    private readonly options: { forceFailure?: boolean } = {},
  ) {}

  async apply(request: TransformRequest): Promise<TransformResult> {
    if (this.options.forceFailure) {
      throw new Error('Transform service forced failure');
    }

    const action = resolveAction(request.decision);
    if (action === 'none') {
      return { action, transformed_text: request.text, replacements: [] };
    }

    const entities = filterEntitiesByTargets(request.entities, request.transforms).sort(
      (a, b) => b.start - a.start,
    );
    if (entities.length === 0) {
      // Policy required transform but no spans matched targets — fail closed
      throw new Error('Transform required but no entities detected');
    }

    let output = request.text;
    const replacements: AppliedReplacement[] = [];

    // Apply on original text with descending indices (safe)
    for (const entity of entities) {
      if (entity.start < 0 || entity.end > request.text.length || entity.start >= entity.end) {
        throw new Error('Invalid entity span for transform');
      }
      const original = extractOriginal(request.text, entity);
      let replacement: string;
      let token: string | undefined;

      if (action === 'tokenize') {
        token = newTokenValue(entity.type);
        replacement = token;
        await this.vault.store({
          token,
          organization_id: request.organization_id,
          entity_type: entity.type,
          plaintext: original,
          request_id: request.request_id,
        });
      } else if (action === 'mask') {
        replacement = maskValue(original, entity.type);
      } else {
        replacement = redactValue(entity.type);
      }

      output = output.slice(0, entity.start) + replacement + output.slice(entity.end);
      replacements.push({
        token,
        entity_type: entity.type,
        action,
        start: entity.start,
        end: entity.end,
      });
    }

    return {
      action,
      transformed_text: output,
      replacements: replacements.reverse(),
    };
  }
}

export class PrivilegedDetokenizationService implements DetokenizationService {
  constructor(private readonly vault: TokenVault) {}

  async detokenize(input: {
    organization_id: string;
    text: string;
    authorized: boolean;
  }): Promise<{ text: string; restored: number }> {
    if (!input.authorized) {
      // Explicit deny — leave tokens intact
      return { text: input.text, restored: 0 };
    }

    let text = input.text;
    let restored = 0;
    const matches = [...input.text.matchAll(TOKEN_PATTERN)];
    // Replace from end to start
    for (const match of matches.reverse()) {
      const token = match[0];
      const idx = match.index ?? -1;
      if (idx < 0) continue;
      const record = await this.vault.lookup(input.organization_id, token);
      if (!record) continue;
      text = text.slice(0, idx) + record.plaintext + text.slice(idx + token.length);
      restored += 1;
    }
    return { text, restored };
  }
}

/** Test double */
export class FailingTransformService implements TransformService {
  async apply(): Promise<TransformResult> {
    throw new Error('Transform unavailable');
  }
}
