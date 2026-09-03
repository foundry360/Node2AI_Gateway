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

/**
 * Applies policy-required input transforms. Failures must propagate (fail closed).
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

    const entities = [...request.entities].sort((a, b) => b.start - a.start);
    if (entities.length === 0) {
      // Policy required transform but no spans — fail closed
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
