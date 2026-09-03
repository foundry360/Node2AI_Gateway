export type SensitivityLabel =
  | 'Public'
  | 'Internal'
  | 'Confidential'
  | 'Restricted'
  | 'PII'
  | 'PHI'
  | 'Financial'
  | 'Credential'
  | 'Proprietary'
  | 'Legal'
  | 'SecuritySensitive';

export type DetectedEntityType =
  | 'EMAIL'
  | 'PHONE'
  | 'SSN'
  | 'CREDIT_CARD'
  | 'MRN'
  | 'NPI'
  | 'DOB'
  | 'DIAGNOSIS_MARKER'
  | 'API_KEY'
  | 'PASSWORD'
  | 'AWS_KEY'
  | 'BEARER_TOKEN'
  | 'IBAN'
  | 'ROUTING_NUMBER';

export interface DetectedEntity {
  type: DetectedEntityType;
  /** Redacted preview only — never full secret in evidence by default. */
  preview: string;
  start: number;
  end: number;
  source: 'deterministic' | 'semantic';
}

export interface InterrogationContext {
  user_id: string;
  application_id: string;
  organization_id: string;
  operation: string;
  requested_model?: string;
  environment: string;
  deployment_mode: 'connected' | 'airgap';
}

export interface InterrogationResult {
  classification: {
    sensitivity: SensitivityLabel;
    confidence: number;
  };
  entities: DetectedEntity[];
  intent: string;
  risk: 'low' | 'medium' | 'high';
  reason_codes: string[];
  /** Evidence only — never an authorization decision. */
  semantic?: {
    applied: boolean;
    classification?: SensitivityLabel;
    confidence?: number;
    reason_codes?: string[];
  };
}

export interface DataInterrogator {
  interrogate(
    text: string,
    context: InterrogationContext,
  ): Promise<InterrogationResult>;
}

/** Optional local semantic classifier — evidence only, never authorizes. */
export interface SemanticClassifier {
  classify(input: {
    text: string;
    deterministic: InterrogationResult;
    context: InterrogationContext;
  }): Promise<{
    classification: SensitivityLabel;
    confidence: number;
    entities: DetectedEntity[];
    intent?: string;
    risk?: 'low' | 'medium' | 'high';
    reason_codes: string[];
  }>;
}
