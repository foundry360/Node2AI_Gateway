import type { DetectedEntity } from '../interrogation/types.js';
import type { PolicyDecision } from '../policy/types.js';

export type TransformAction = 'tokenize' | 'redact' | 'mask' | 'none';

export interface TransformRequest {
  organization_id: string;
  request_id: string;
  correlation_id: string;
  text: string;
  entities: DetectedEntity[];
  decision: PolicyDecision;
  transforms: Array<{ type: string; targets: string[] }>;
}

export interface AppliedReplacement {
  token?: string;
  entity_type: string;
  action: TransformAction;
  start: number;
  end: number;
}

export interface TransformResult {
  action: TransformAction;
  transformed_text: string;
  replacements: AppliedReplacement[];
}

export interface TokenVaultRecord {
  token: string;
  organization_id: string;
  entity_type: string;
  /** Sensitive value — vault only; never logged by default. */
  plaintext: string;
  request_id: string;
  created_at: string;
}

export interface TokenVault {
  store(record: Omit<TokenVaultRecord, 'created_at'> & { created_at?: string }): Promise<void>;
  lookup(organizationId: string, token: string): Promise<TokenVaultRecord | null>;
}

export interface TransformService {
  apply(request: TransformRequest): Promise<TransformResult>;
}

/**
 * Detokenization is a privileged operation — never invoke automatically
 * just because a model returned a token string.
 */
export interface DetokenizationService {
  detokenize(input: {
    organization_id: string;
    text: string;
    /** Must be true and granted by response policy (Phase 5+). */
    authorized: boolean;
  }): Promise<{ text: string; restored: number }>;
}
