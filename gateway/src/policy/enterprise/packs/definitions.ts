/**
 * Pack-backed policy definition manifests for Admin console.
 * Declarative sections mirror interpreter enforcement until relational
 * subject/resource/condition tables are authored.
 */

export interface PolicyDefinition {
  description: string;
  owner: string;
  priority: number;
  scope_tier: string;
  domain: string;
  subjects: Array<{ type: string; match: string; description: string }>;
  resources: Array<{ type: string; classification?: string; description: string }>;
  actions: Array<{ action: string; effect: string; description: string }>;
  ai_context: Array<{ key: string; constraint: string }>;
  conditions: Array<{ id: string; statement: string }>;
  decisions: Array<{ when: string; decision: string; reason_codes: string[] }>;
  obligations: Array<{ code: string; when: string; description: string }>;
}

const BASELINE_INPUT: PolicyDefinition = {
  description:
    'Application trust, operation allowlists, PHI local-only, PII tokenize, credential block.',
  owner: 'security',
  priority: 100,
  scope_tier: 'enterprise',
  domain: 'enterprise',
  subjects: [
    {
      type: 'application',
      match: 'trust_level != untrusted',
      description: 'Untrusted applications are denied.',
    },
    {
      type: 'application',
      match: 'status = active',
      description: 'Inactive applications cannot invoke AI.',
    },
    {
      type: 'role',
      match: 'clinician (when PHI)',
      description: 'PHI requires clinical application type and clinician role.',
    },
  ],
  resources: [
    {
      type: 'prompt_content',
      classification: 'Credential',
      description: 'Credential-bearing content is blocked.',
    },
    {
      type: 'prompt_content',
      classification: 'PHI',
      description: 'PHI restricted to local models and authorized clinical subjects.',
    },
    {
      type: 'prompt_content',
      classification: 'PII|Financial',
      description: 'PII/Financial must be tokenized before model execution.',
    },
  ],
  actions: [
    {
      action: 'summarize|generate|*',
      effect: 'allow_if_listed',
      description: 'Operation must be on the application allowlist.',
    },
  ],
  ai_context: [
    {
      key: 'deployment_mode',
      constraint: 'airgap → local-* models only',
    },
    {
      key: 'requested_model',
      constraint: 'Must be in eligible set after policy filters',
    },
    {
      key: 'available_models',
      constraint: 'Intersected with application allowed_models',
    },
  ],
  conditions: [
    { id: 'c_trust', statement: 'IF trust_level = untrusted THEN DENY' },
    { id: 'c_app_active', statement: 'IF application_status != active THEN DENY' },
    { id: 'c_op_allow', statement: 'IF operation not in allowed_operations THEN DENY' },
    { id: 'c_cred', statement: 'IF classification = Credential THEN DENY' },
    {
      id: 'c_phi_cloud',
      statement: 'IF classification = PHI AND requested_model is cloud THEN DENY',
    },
    {
      id: 'c_phi_auth',
      statement:
        'IF classification = PHI AND (application_type != clinical OR role missing clinician) THEN DENY',
    },
    {
      id: 'c_pii_tok',
      statement: 'IF classification IN (PII, Financial) THEN TOKENIZE',
    },
  ],
  decisions: [
    { when: 'Default eligible path', decision: 'ALLOW', reason_codes: ['POLICY_ALLOW'] },
    {
      when: 'PII or Financial classification',
      decision: 'TOKENIZE',
      reason_codes: ['PII_REQUIRES_TOKENIZE'],
    },
    {
      when: 'Credential / untrusted / PHI cloud / inactive',
      decision: 'DENY',
      reason_codes: [
        'CREDENTIAL_CONTENT_BLOCKED',
        'UNTRUSTED_APPLICATION',
        'PHI_PUBLIC_CLOUD_BLOCKED',
      ],
    },
  ],
  obligations: [
    {
      code: 'LOG_GOVERNANCE_EVENT',
      when: 'always',
      description: 'Emit governance audit event.',
    },
    {
      code: 'LOCAL_MODEL_ONLY',
      when: 'all eligible models are local-*',
      description: 'Restrict execution to local runtime.',
    },
    {
      code: 'TOKENIZE_PII',
      when: 'PII or Financial',
      description: 'Vault-tokenize sensitive fields before model call.',
    },
    {
      code: 'NO_EXTERNAL_TRANSMISSION',
      when: 'PII/Financial with external-eligible models',
      description: 'Block external transmission of raw sensitive data.',
    },
  ],
};

const BASELINE_OUTPUT: PolicyDefinition = {
  description:
    'Block PHI/credentials/tool calls in outputs; redact PII; detokenize only when authorized.',
  owner: 'security',
  priority: 90,
  scope_tier: 'enterprise',
  domain: 'enterprise',
  subjects: [
    {
      type: 'application',
      match: 'trust_level = trusted (for detokenize)',
      description: 'Detokenization requires trusted application.',
    },
  ],
  resources: [
    {
      type: 'model_response',
      classification: 'Credential',
      description: 'Credential content in responses is blocked.',
    },
    {
      type: 'model_response',
      classification: 'PHI',
      description: 'PHI in responses is blocked.',
    },
    {
      type: 'model_response',
      classification: 'PII|Financial',
      description: 'PII/Financial in responses is redacted.',
    },
  ],
  actions: [
    {
      action: 'tool_or_action',
      effect: 'deny',
      description: 'Tool/action suggestions in responses are blocked.',
    },
    {
      action: 'release',
      effect: 'allow',
      description: 'Clean responses may be released to the caller.',
    },
  ],
  ai_context: [
    {
      key: 'inspection_sensitivity',
      constraint: 'Derived from response inspector evidence',
    },
    {
      key: 'contains_tokens',
      constraint: 'Detokenize only when input was tokenized and authorized',
    },
  ],
  conditions: [
    { id: 'c_tool', statement: 'IF tool_or_action THEN BLOCK_OUTPUT' },
    { id: 'c_cred_out', statement: 'IF inspection_sensitivity = Credential THEN BLOCK_OUTPUT' },
    { id: 'c_phi_out', statement: 'IF inspection_sensitivity = PHI THEN BLOCK_OUTPUT' },
    {
      id: 'c_pii_out',
      statement: 'IF inspection_sensitivity IN (PII, Financial) THEN REDACT',
    },
    {
      id: 'c_detok',
      statement:
        'IF allow_detokenization AND contains_tokens AND input_was_tokenized AND trust=trusted THEN AUTHORIZE_DETOKENIZATION',
    },
  ],
  decisions: [
    { when: 'Clean response', decision: 'ALLOW', reason_codes: ['RESPONSE_RELEASE'] },
    { when: 'PII/Financial in response', decision: 'REDACT', reason_codes: ['RESPONSE_PII_REDACT'] },
    {
      when: 'PHI, credentials, or tools',
      decision: 'BLOCK_OUTPUT',
      reason_codes: [
        'RESPONSE_PHI_BLOCKED',
        'RESPONSE_CREDENTIAL_BLOCKED',
        'RESPONSE_TOOL_OR_ACTION_BLOCKED',
      ],
    },
  ],
  obligations: [
    {
      code: 'LOG_GOVERNANCE_EVENT',
      when: 'always',
      description: 'Emit governance audit event.',
    },
    {
      code: 'REDACT_CREDENTIALS',
      when: 'PII/Financial response',
      description: 'Redact sensitive spans before release.',
    },
    {
      code: 'AUTHORIZE_DETOKENIZATION',
      when: 'trusted detokenize path',
      description: 'Permit vault detokenization for authorized callers.',
    },
  ],
};

const HIPAA: PolicyDefinition = {
  description: 'HIPAA overlay: reinforce PHI local-only and no external transmission.',
  owner: 'compliance',
  priority: 200,
  scope_tier: 'regulatory',
  domain: 'hipaa',
  subjects: [
    {
      type: 'application',
      match: 'any (when PHI)',
      description: 'Applies when request classification is PHI.',
    },
  ],
  resources: [
    {
      type: 'prompt_content',
      classification: 'PHI',
      description: 'Protected health information.',
    },
  ],
  actions: [
    {
      action: '*',
      effect: 'restrict',
      description: 'Never weaken a prior DENY; may further restrict models.',
    },
  ],
  ai_context: [
    {
      key: 'requested_model',
      constraint: 'Cloud/public models denied for PHI',
    },
    {
      key: 'eligible_models',
      constraint: 'Filtered to local-* only',
    },
  ],
  conditions: [
    {
      id: 'c_hipaa_cloud',
      statement: 'IF PHI AND (cloud requested OR cloud eligible) THEN DENY',
    },
  ],
  decisions: [
    {
      when: 'PHI with cloud path',
      decision: 'DENY',
      reason_codes: ['HIPAA_PHI_CLOUD_BLOCKED'],
    },
  ],
  obligations: [
    {
      code: 'LOCAL_MODEL_ONLY',
      when: 'PHI',
      description: 'Force local execution for PHI.',
    },
    {
      code: 'NO_EXTERNAL_TRANSMISSION',
      when: 'PHI',
      description: 'No external transmission of PHI.',
    },
  ],
};

const FINANCIAL: PolicyDefinition = {
  description:
    'Financial overlay: tokenize financial data; block write/export/share without approval.',
  owner: 'compliance',
  priority: 180,
  scope_tier: 'regulatory',
  domain: 'financial',
  subjects: [
    {
      type: 'application',
      match: 'any (when FINANCIAL)',
      description: 'Applies when classification is FINANCIAL/Financial.',
    },
  ],
  resources: [
    {
      type: 'prompt_content',
      classification: 'FINANCIAL',
      description: 'Financial regulated data.',
    },
  ],
  actions: [
    {
      action: 'write|export|share|transmit',
      effect: 'deny',
      description: 'Mutating/export financial ops require human approval (denied in overlay).',
    },
  ],
  ai_context: [
    {
      key: 'operation',
      constraint: 'write/export/share/transmit blocked for financial data',
    },
  ],
  conditions: [
    {
      id: 'c_fin_write',
      statement: 'IF FINANCIAL AND operation IN (write,export,share,transmit) THEN DENY',
    },
    {
      id: 'c_fin_tok',
      statement: 'IF FINANCIAL THEN TOKENIZE',
    },
  ],
  decisions: [
    {
      when: 'Financial write/export',
      decision: 'DENY',
      reason_codes: ['FINANCIAL_WRITE_REQUIRES_APPROVAL'],
    },
    {
      when: 'Financial read path',
      decision: 'TOKENIZE',
      reason_codes: ['FINANCIAL_REQUIRES_TOKENIZE'],
    },
  ],
  obligations: [
    {
      code: 'REQUIRE_HUMAN_APPROVAL_FOR_EXECUTION',
      when: 'financial write path',
      description: 'Human approval required for financial mutation.',
    },
    {
      code: 'TOKENIZE_PII',
      when: 'financial data',
      description: 'Tokenize financial fields.',
    },
  ],
};

const LEGAL: PolicyDefinition = {
  description: 'Legal overlay: no external models; block export/share of legal data.',
  owner: 'compliance',
  priority: 170,
  scope_tier: 'regulatory',
  domain: 'legal',
  subjects: [
    {
      type: 'application',
      match: 'any (when LEGAL)',
      description: 'Applies when classification is LEGAL/Legal.',
    },
  ],
  resources: [
    {
      type: 'prompt_content',
      classification: 'LEGAL',
      description: 'Legal privileged or regulated content.',
    },
  ],
  actions: [
    {
      action: 'export|share|transmit',
      effect: 'deny',
      description: 'Export/share of legal data is denied.',
    },
  ],
  ai_context: [
    {
      key: 'requested_model',
      constraint: 'External/cloud models denied for legal data',
    },
  ],
  conditions: [
    {
      id: 'c_legal_export',
      statement: 'IF LEGAL AND operation IN (export,share,transmit) THEN DENY',
    },
    {
      id: 'c_legal_cloud',
      statement: 'IF LEGAL AND cloud model THEN DENY',
    },
  ],
  decisions: [
    {
      when: 'Legal export/share',
      decision: 'DENY',
      reason_codes: ['LEGAL_EXPORT_BLOCKED'],
    },
    {
      when: 'Legal with external model',
      decision: 'DENY',
      reason_codes: ['LEGAL_EXTERNAL_MODEL_BLOCKED'],
    },
  ],
  obligations: [
    {
      code: 'LOCAL_MODEL_ONLY',
      when: 'legal data',
      description: 'Local models only for legal content.',
    },
    {
      code: 'NO_EXTERNAL_TRANSMISSION',
      when: 'legal data',
      description: 'No external transmission of legal content.',
    },
  ],
};

const BY_POLICY_ID: Record<string, PolicyDefinition> = {
  pol_phase2_core: BASELINE_INPUT,
  pol_phase5_response: BASELINE_OUTPUT,
  pol_hipaa_phi_local: HIPAA,
  pol_financial_tokenize: FINANCIAL,
  pol_legal_no_external: LEGAL,
};

const BY_INTERPRETER: Record<string, PolicyDefinition> = {
  baseline_input_v2: BASELINE_INPUT,
  baseline_output_v5: BASELINE_OUTPUT,
  hipaa_overlay_v1: HIPAA,
  financial_overlay_v1: FINANCIAL,
  legal_overlay_v1: LEGAL,
};

export function getPolicyDefinition(
  policyId: string,
  interpreter?: string,
): PolicyDefinition | null {
  if (BY_POLICY_ID[policyId]) return BY_POLICY_ID[policyId];
  if (interpreter && BY_INTERPRETER[interpreter]) return BY_INTERPRETER[interpreter];
  return null;
}
