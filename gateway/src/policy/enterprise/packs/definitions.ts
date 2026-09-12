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
    'Checks that only trusted, active applications can call AI, limits them to allowed operations, and protects sensitive input - credentials are blocked, PHI stays on local models for authorized clinical use, and PII or financial data must be tokenized before a model runs.',
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
    {
      action: 'write|export|share|transmit',
      effect: 'restrict',
      description: 'Mutating and outbound operations remain subject to classification overlays.',
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
    {
      key: 'classification',
      constraint: 'Credential / PHI / PII / Financial drive deny, local-only, or tokenize paths',
    },
  ],
  conditions: [
    { id: 'c_trust', statement: 'IF trust_level = untrusted THEN DENY' },
    { id: 'c_app_active', statement: 'IF application_status != active THEN DENY' },
    { id: 'c_op_allow', statement: 'IF operation not in allowed_operations THEN DENY' },
    { id: 'c_cred', statement: 'IF classification = Credential THEN DENY' },
    {
      id: 'c_phi_cloud',
      statement:
        'IF classification = PHI AND requested_model is cloud AND controlled external evidence missing THEN DENY; IF evidence + tokenization available THEN TOKENIZE (external eligible)',
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
      when: 'Credential / untrusted / PHI cloud without controls / inactive',
      decision: 'DENY',
      reason_codes: [
        'CREDENTIAL_CONTENT_BLOCKED',
        'UNTRUSTED_APPLICATION',
        'PHI_PUBLIC_CLOUD_BLOCKED',
      ],
    },
    {
      when: 'PHI + cloud + controlled external evidence + tokenization available',
      decision: 'TOKENIZE',
      reason_codes: ['PHI_REQUIRES_TOKENIZE', 'EXTERNAL_MODEL_PRESENT'],
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
    'Reviews model responses before release: blocks PHI, credentials, and tool suggestions; redacts PII or financial content; and allows detokenization only for trusted, authorized callers.',
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
    {
      type: 'caller',
      match: 'authorized release recipient',
      description: 'Response release and detokenize apply to the requesting application context.',
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
    {
      type: 'model_response',
      classification: 'tool_or_action',
      description: 'Tool/action suggestions embedded in responses are treated as blocked output.',
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
    {
      action: 'detokenize',
      effect: 'allow_if_authorized',
      description: 'Detokenize only when input was tokenized and the caller is trusted/authorized.',
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
    {
      key: 'trust_level',
      constraint: 'Trusted application required for AUTHORIZE_DETOKENIZATION',
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
  description:
    'Applies extra safeguards when true PHI is in scope under HIPAA. It can deny external processing when controls are missing, require stronger evidence before allowing work to continue, and keep processing inside approved control boundaries. Local or private hosting and tokenization are Enigma controls - not a HIPAA compliance certification, and health-sensitive content alone is not treated as PHI.',
  owner: 'compliance',
  priority: 200,
  scope_tier: 'regulatory',
  domain: 'hipaa',
  subjects: [
    {
      type: 'application',
      match: 'any (when regulatory PHI / HIPAA applicability)',
      description:
        'Applies when classification is PHI and HIPAA is applicable - not mere health-sensitive context.',
    },
    {
      type: 'role',
      match: 'clinician / covered-entity workflow',
      description: 'PHI processing expects an authorized clinical or covered-entity subject context.',
    },
    {
      type: 'organization',
      match: 'HIPAA applicability asserted',
      description: 'Regulatory pack engages only when HIPAA applicability is in scope for the request.',
    },
  ],
  resources: [
    {
      type: 'prompt_content',
      classification: 'PHI',
      description: 'Protected health information on the input path (regulatory).',
    },
    {
      type: 'processing_environment',
      classification: 'PHI',
      description: 'Local/private vs external processing context for PHI.',
    },
  ],
  actions: [
    {
      action: '*',
      effect: 'restrict',
      description: 'Never weaken a prior DENY; may further restrict models and release.',
    },
  ],
  ai_context: [
    {
      key: 'requested_model',
      constraint: 'External processing denied when required controls are not satisfied',
    },
    {
      key: 'purpose',
      constraint: 'Explicit unknown purpose does not silently become approved',
    },
    {
      key: 'authorization_context',
      constraint: 'Insufficient evidence yields REVIEW rather than silent allow',
    },
    {
      key: 'deployment_mode',
      constraint: 'LOCAL/PRIVATE supports controls; it is not itself a HIPAA compliance claim',
    },
  ],
  conditions: [
    {
      id: 'HIPAA-R-INPUT-EXTERNAL-DENY',
      statement:
        'IF PHI AND HIPAA applicable AND unauthorized_external AND NOT controls_satisfied THEN DENY',
    },
    {
      id: 'HIPAA-R-INPUT-CONTROLS-SATISFIED',
      statement:
        'IF PHI AND local_or_private AND controls_satisfied THEN ALLOW_WITH_CONTROLS (not a compliance claim)',
    },
    {
      id: 'HIPAA-R-INPUT-INSUFFICIENT-EVIDENCE',
      statement: 'IF PHI AND evidence_insufficient THEN REVIEW',
    },
  ],
  decisions: [
    {
      when: 'PHI with external controls not satisfied',
      decision: 'DENY',
      reason_codes: ['HIPAA_PHI_EXTERNAL_CONTROLS_NOT_SATISFIED'],
    },
    {
      when: 'PHI with processing controls satisfied',
      decision: 'ALLOW',
      reason_codes: ['HIPAA_PHI_PROCESSING_CONTROLS_SATISFIED'],
    },
    {
      when: 'Insufficient evidence',
      decision: 'REVIEW',
      reason_codes: ['HIPAA_PHI_INSUFFICIENT_EVIDENCE_FOR_PROCESSING'],
    },
  ],
  obligations: [
    {
      code: 'LOCAL_MODEL_ONLY',
      when: 'Enigma implementation option for PHI path',
      description: 'Enigma control - not a HIPAA mandate.',
    },
    {
      code: 'NO_EXTERNAL_TRANSMISSION',
      when: 'Enigma implementation option',
      description: 'Enigma control supporting transmission security obligation.',
    },
    {
      code: 'TOKENIZE_PII',
      when: 'optional Enigma control on non-trusted entity spans',
      description: 'TOKENIZE is Enigma enforcement, not a HIPAA mandate.',
    },
  ],
};

const HIPAA_OUTPUT: PolicyDefinition = {
  description:
    'Evaluates model output and release for PHI under HIPAA-informed controls. Blocks unauthorized residual PHI, and allows Enigma release to authorize detokenization only when release conditions are satisfied. Does not certify HIPAA compliance.',
  owner: 'compliance',
  priority: 200,
  scope_tier: 'regulatory',
  domain: 'hipaa',
  subjects: [
    {
      type: 'application',
      match: 'any (when regulatory PHI / HIPAA applicability)',
      description: 'Applies on the output/release path when HIPAA PHI applicability is in scope.',
    },
    {
      type: 'caller',
      match: 'authorized release recipient',
      description: 'Release and detokenize decisions apply to the requesting application context.',
    },
  ],
  resources: [
    {
      type: 'model_response',
      classification: 'PHI',
      description: 'Residual PHI in model output is evaluated for authorized release.',
    },
  ],
  actions: [
    {
      action: 'release|detokenize',
      effect: 'allow_if_controls',
      description: 'Release/detokenize only when Enigma release conditions are satisfied.',
    },
  ],
  ai_context: [
    {
      key: 'contains_tokens',
      constraint: 'Detokenize only when release conditions are satisfied',
    },
    {
      key: 'release_conditions_satisfied',
      constraint: 'Enigma release policy decides; gateway enforces',
    },
  ],
  conditions: [
    {
      id: 'HIPAA-R-OUT-RELEASE-EVAL',
      statement:
        'IF tokens AND release_conditions_satisfied THEN ENIGMA AUTHORIZED_DETOKENIZATION',
    },
    {
      id: 'HIPAA-R-OUT-PHI-BLOCK',
      statement: 'IF residual PHI AND NOT release_authorized THEN BLOCK_OUTPUT',
    },
  ],
  decisions: [
    {
      when: 'Unauthorized residual PHI in output',
      decision: 'BLOCK_OUTPUT',
      reason_codes: ['HIPAA_PHI_OUTPUT_NOT_AUTHORIZED'],
    },
    {
      when: 'Release conditions satisfied for tokenized PHI',
      decision: 'ALLOW',
      reason_codes: ['HIPAA_PHI_PROCESSING_CONTROLS_SATISFIED'],
    },
  ],
  obligations: [
    {
      code: 'AUTHORIZE_DETOKENIZATION',
      when: 'Enigma release policy when release conditions satisfied',
      description: 'Enigma release decides; gateway enforces. HIPAA does not issue detokenize.',
    },
    {
      code: 'LOG_GOVERNANCE_EVENT',
      when: 'always',
      description: 'Emit a governance audit event for HIPAA output/release decisions.',
    },
  ],
};

const PART2_INPUT: PolicyDefinition = {
  description:
    'Applies 42 CFR Part 2 confidentiality controls when substance use disorder (SUD) records are in scope. Consent evidence gates processing, and unauthorized external paths or write/export actions are denied. Does not certify Part 2 compliance.',
  owner: 'compliance',
  priority: 210,
  scope_tier: 'regulatory',
  domain: 'healthcare',
  subjects: [
    {
      type: 'application',
      match: 'any (when Part 2 SUD records apply)',
      description: 'Applies when Part 2 regulatory applicability is asserted for SUD records.',
    },
    {
      type: 'role',
      match: 'authorized Part 2 recipient / program context',
      description: 'Processing expects an authorized program or recipient context with consent evidence.',
    },
  ],
  resources: [
    {
      type: 'prompt_content',
      classification: 'PART2',
      description: 'Substance use disorder records protected under 42 CFR Part 2.',
    },
    {
      type: 'processing_environment',
      classification: 'PART2',
      description: 'External vs controlled processing path for Part 2 records.',
    },
  ],
  actions: [
    {
      action: '*',
      effect: 'restrict',
      description: 'Never weaken a prior DENY; may further restrict models and release.',
    },
    {
      action: 'write|export|share|transmit',
      effect: 'deny',
      description: 'Write/export/share without consent evidence are denied.',
    },
  ],
  ai_context: [
    {
      key: 'authorization_context',
      constraint: 'Consent evidence required; unknown does not silently become approved',
    },
    {
      key: 'requested_model',
      constraint: 'Unauthorized external processing denied without consent path',
    },
  ],
  conditions: [
    {
      id: 'PART2-R-INPUT-EXTERNAL-DENY',
      statement: 'IF PART2 AND unauthorized_external AND NOT consent THEN DENY',
    },
    {
      id: 'PART2-R-INPUT-WRITE-DENY',
      statement: 'IF PART2 AND operation IN (write,export,share,transmit) AND NOT consent THEN DENY',
    },
    {
      id: 'PART2-R-INPUT-INSUFFICIENT-EVIDENCE',
      statement: 'IF PART2 AND consent_evidence_insufficient THEN REVIEW',
    },
  ],
  decisions: [
    {
      when: 'Part 2 without consent on external or write path',
      decision: 'DENY',
      reason_codes: ['PART2_CONSENT_REQUIRED'],
    },
    {
      when: 'Insufficient Part 2 consent evidence',
      decision: 'REVIEW',
      reason_codes: ['PART2_INSUFFICIENT_CONSENT_EVIDENCE'],
    },
    {
      when: 'Part 2 controls and consent satisfied',
      decision: 'ALLOW',
      reason_codes: ['PART2_PROCESSING_CONTROLS_SATISFIED'],
    },
  ],
  obligations: [
    {
      code: 'NO_EXTERNAL_TRANSMISSION',
      when: 'Part 2 record path without authorized external consent',
      description: 'Block external transmission of Part 2 SUD content.',
    },
    {
      code: 'LOG_GOVERNANCE_EVENT',
      when: 'always',
      description: 'Emit a governance audit event for Part 2 input decisions.',
    },
    {
      code: 'TOKENIZE_PII',
      when: 'optional Enigma control on Part 2 entity spans',
      description: 'TOKENIZE is Enigma enforcement, not a Part 2 mandate.',
    },
  ],
};

const PART2_OUTPUT: PolicyDefinition = {
  description:
    'Evaluates model output and redisclosure for Part 2 SUD records. Blocks unauthorized residual plaintext and allows Enigma release to authorize detokenization only when redisclosure conditions are satisfied.',
  owner: 'compliance',
  priority: 210,
  scope_tier: 'regulatory',
  domain: 'healthcare',
  subjects: [
    {
      type: 'application',
      match: 'any (when Part 2 SUD records apply)',
      description: 'Applies on the output/redisclosure path when Part 2 applicability is in scope.',
    },
  ],
  resources: [
    {
      type: 'model_response',
      classification: 'PART2',
      description: 'Residual Part 2 content in model output is evaluated for redisclosure.',
    },
  ],
  actions: [
    {
      action: 'release|detokenize|redisclose',
      effect: 'allow_if_controls',
      description: 'Release/detokenize only when Part 2 redisclosure conditions are satisfied.',
    },
  ],
  ai_context: [
    {
      key: 'release_conditions_satisfied',
      constraint: 'Enigma release decides redisclosure authorization; gateway enforces',
    },
  ],
  conditions: [
    {
      id: 'PART2-R-OUT-REDISCLOSURE',
      statement: 'IF PART2 residual AND NOT redisclosure_authorized THEN BLOCK_OUTPUT',
    },
    {
      id: 'PART2-R-OUT-DETOK',
      statement:
        'IF tokens AND release_conditions_satisfied THEN ENIGMA AUTHORIZED_DETOKENIZATION',
    },
  ],
  decisions: [
    {
      when: 'Unauthorized Part 2 residual in output',
      decision: 'BLOCK_OUTPUT',
      reason_codes: ['PART2_REDISCLOSURE_NOT_AUTHORIZED'],
    },
    {
      when: 'Redisclosure conditions satisfied',
      decision: 'ALLOW',
      reason_codes: ['PART2_PROCESSING_CONTROLS_SATISFIED'],
    },
  ],
  obligations: [
    {
      code: 'AUTHORIZE_DETOKENIZATION',
      when: 'Enigma release when Part 2 redisclosure conditions satisfied',
      description: 'Enigma release decides; gateway enforces.',
    },
    {
      code: 'LOG_GOVERNANCE_EVENT',
      when: 'always',
      description: 'Emit a governance audit event for Part 2 output/release decisions.',
    },
  ],
};

const ONC_HTI1_INPUT: PolicyDefinition = {
  description:
    'Applies ONC/HTI-1-aligned predictive decision-support governance when HTI-1 applicability is asserted. Evaluates algorithm identity, intended use, transparency/FAVES evidence, risk management, human oversight, and version governance. Does not determine ONC certification or legal compliance.',
  owner: 'compliance',
  priority: 205,
  scope_tier: 'regulatory',
  domain: 'healthcare',
  subjects: [
    {
      type: 'application',
      match: 'any (when ONC_HTI1 applicability is asserted)',
      description:
        'Applies only when REGULATORY_APPLICABILITY:ONC_HTI1 is present — Healthcare+AI alone is insufficient.',
    },
  ],
  resources: [
    {
      type: 'prompt_content',
      classification: 'PREDICTIVE_DSI',
      description: 'Predictive decision-support / algorithm transparency governance context.',
    },
  ],
  actions: [
    {
      action: 'summarize|analyze|generate|classify|*',
      effect: 'allow_with_controls',
      description:
        'Predictive DSI paths proceed when required governance evidence is present for the applicable risk tier.',
    },
  ],
  ai_context: [
    {
      key: 'governance_context.predictive_dsi',
      constraint:
        'Applicability, algorithm/model identity, intended use, FAVES/transparency, risk management, oversight, version governance',
    },
  ],
  conditions: [
    {
      id: 'ONC-R-DSI-IDENTITY',
      statement: 'IF ONC applicable AND high-risk clinical AND NOT identity THEN DENY',
    },
    {
      id: 'ONC-R-DSI-UNSUPPORTED-CONTEXT',
      statement: 'IF ONC applicable AND clinical AND NOT identity THEN REVIEW',
    },
    {
      id: 'ONC-R-DSI-FAVES',
      statement: 'IF ONC applicable AND high-risk clinical AND NOT faves THEN REVIEW',
    },
  ],
  decisions: [
    {
      when: 'High-risk clinical predictive model identity missing',
      decision: 'DENY',
      reason_codes: ['ONC_DSI_IDENTITY_REQUIRED'],
    },
    {
      when: 'Required predictive-model governance evidence not available',
      decision: 'REVIEW',
      reason_codes: ['ONC_DSI_FAVES_EVIDENCE_INSUFFICIENT'],
    },
    {
      when: 'ONC DSI governance evidence satisfied',
      decision: 'ALLOW',
      reason_codes: ['ONC_DSI_GOVERNANCE_CONTROLS_SATISFIED'],
    },
  ],
  obligations: [
    {
      code: 'REQUIRE_HUMAN_APPROVAL_FOR_EXECUTION',
      when: 'REVIEW paths for missing FAVES/oversight/intended-use/version governance',
      description: 'Human resolution hold — not an automatic legal finding.',
    },
    {
      code: 'LOG_GOVERNANCE_EVENT',
      when: 'always',
      description: 'Emit a governance audit event for ONC HTI-1 decisions.',
    },
  ],
};

const ONC_HTI1_OUTPUT: PolicyDefinition = {
  description:
    'Output-phase ONC/HTI-1-aligned predictive DSI governance. Allows controlled release when input governance evidence was satisfied. Does not assert HTI-1 compliance.',
  owner: 'compliance',
  priority: 205,
  scope_tier: 'regulatory',
  domain: 'healthcare',
  subjects: [
    {
      type: 'application',
      match: 'any (when ONC_HTI1 applicability is asserted)',
      description: 'Output path when ONC HTI-1 predictive DSI applicability is in scope.',
    },
  ],
  resources: [
    {
      type: 'model_response',
      classification: 'PREDICTIVE_DSI',
      description: 'Model output under ONC HTI-1-aligned predictive DSI governance.',
    },
  ],
  actions: [
    {
      action: 'release|*',
      effect: 'allow_if_controls',
      description: 'Release when ONC DSI governance controls were satisfied on input.',
    },
  ],
  ai_context: [
    {
      key: 'governance_context.predictive_dsi',
      constraint: 'Output release gated by onc_controls_satisfied derived from predictive_dsi evidence',
    },
  ],
  conditions: [
    {
      id: 'ONC-R-DSI-OUT-RELEASE',
      statement: 'IF ONC applicable AND controls_satisfied THEN ALLOW_WITH_CONTROLS',
    },
  ],
  decisions: [
    {
      when: 'ONC DSI output governance satisfied',
      decision: 'ALLOW',
      reason_codes: ['ONC_DSI_OUTPUT_GOVERNANCE_SATISFIED'],
    },
  ],
  obligations: [
    {
      code: 'LOG_GOVERNANCE_EVENT',
      when: 'always',
      description: 'Emit a governance audit event for ONC HTI-1 output decisions.',
    },
  ],
};

const CMS_INPUT: PolicyDefinition = {
  description:
    'Applies CMS-aligned interoperability, patient/provider/payer access, prior-authorization workflow, API/FHIR, data-exchange, and AI/agent governance when CMS applicability is asserted. Does not determine CMS compliance.',
  owner: 'compliance',
  priority: 200,
  scope_tier: 'regulatory',
  domain: 'healthcare',
  subjects: [
    {
      type: 'application',
      match: 'any (when CMS applicability is asserted)',
      description:
        'Applies only when REGULATORY_APPLICABILITY:CMS is present — Healthcare+AI alone is insufficient.',
    },
  ],
  resources: [
    {
      type: 'prompt_content',
      classification: 'CMS_INTEROP',
      description: 'CMS interoperability / access / PA / API governance context.',
    },
  ],
  actions: [
    {
      action: 'retrieve|generate|submit|transmit|summarize|*',
      effect: 'allow_with_controls',
      description: 'CMS workflow actions proceed when applicable controls are satisfied.',
    },
  ],
  ai_context: [
    {
      key: 'governance_context.healthcare_interop',
      constraint:
        'Applicability, workflow family, authorization, data scope, PA stage, API/FHIR, agent/tool',
    },
  ],
  conditions: [
    {
      id: 'CMS-R-PATIENT-AUTHORIZED-ACCESS',
      statement: 'IF CMS patient_access AND NOT patient_authorized THEN DENY',
    },
    {
      id: 'CMS-R-PRIOR-AUTH-SUBMIT-UNAUTHORIZED',
      statement: 'IF CMS prior_auth submit AND NOT authorized THEN DENY',
    },
  ],
  decisions: [
    {
      when: 'Unauthorized CMS access or exchange',
      decision: 'DENY',
      reason_codes: ['CMS_PATIENT_ACCESS_UNAUTHORIZED'],
    },
    {
      when: 'CMS interoperability controls satisfied',
      decision: 'ALLOW',
      reason_codes: ['CMS_INTEROP_CONTROLS_SATISFIED'],
    },
  ],
  obligations: [
    {
      code: 'LOG_GOVERNANCE_EVENT',
      when: 'always',
      description: 'Emit a governance audit event for CMS decisions.',
    },
  ],
};

const CMS_OUTPUT: PolicyDefinition = {
  description:
    'Output-phase CMS-aligned interoperability governance. Allows controlled release when input controls were satisfied. Does not assert CMS compliance.',
  owner: 'compliance',
  priority: 200,
  scope_tier: 'regulatory',
  domain: 'healthcare',
  subjects: [
    {
      type: 'application',
      match: 'any (when CMS applicability is asserted)',
      description: 'Output path when CMS applicability is in scope.',
    },
  ],
  resources: [
    {
      type: 'model_response',
      classification: 'CMS_INTEROP',
      description: 'Model output under CMS-aligned interoperability governance.',
    },
  ],
  actions: [
    {
      action: 'release|*',
      effect: 'allow_if_controls',
      description: 'Release when CMS input controls were satisfied.',
    },
  ],
  ai_context: [
    {
      key: 'governance_context.healthcare_interop',
      constraint: 'Output release gated by cms_controls_satisfied',
    },
  ],
  conditions: [
    {
      id: 'CMS-R-OUT-RELEASE',
      statement: 'IF CMS applicable AND controls_satisfied THEN ALLOW_WITH_CONTROLS',
    },
  ],
  decisions: [
    {
      when: 'CMS output governance satisfied',
      decision: 'ALLOW',
      reason_codes: ['CMS_OUTPUT_GOVERNANCE_SATISFIED'],
    },
  ],
  obligations: [
    {
      code: 'LOG_GOVERNANCE_EVENT',
      when: 'always',
      description: 'Emit a governance audit event for CMS output decisions.',
    },
  ],
};

const FINANCIAL: PolicyDefinition = {
  description:
    'Protects financial data in AI requests: sensitive fields are safeguarded before processing, and write, export, and sharing actions stay controlled unless human approval allows them.',
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
    {
      type: 'role',
      match: 'finance_operator (preferred)',
      description: 'Write/export paths expect a finance-capable operator role when approval is sought.',
    },
    {
      type: 'application',
      match: 'trust_level != untrusted',
      description: 'Untrusted applications cannot process financial data.',
    },
  ],
  resources: [
    {
      type: 'prompt_content',
      classification: 'FINANCIAL',
      description: 'Financial account numbers, balances, statements, and similar regulated fields.',
    },
    {
      type: 'model_response',
      classification: 'FINANCIAL',
      description: 'Financial data residual in model output remains governed by the same controls.',
    },
    {
      type: 'derived_artifact',
      classification: 'FINANCIAL',
      description: 'Exports, shares, and transmitted copies of financial content.',
    },
  ],
  actions: [
    {
      action: 'summarize|generate|read|*',
      effect: 'allow_with_controls',
      description: 'Read/analysis paths may proceed when financial fields are tokenized.',
    },
    {
      action: 'write|export|share|transmit',
      effect: 'deny',
      description: 'Mutating and outbound financial operations are denied without human approval.',
    },
  ],
  ai_context: [
    {
      key: 'operation',
      constraint: 'write/export/share/transmit blocked for financial data',
    },
    {
      key: 'classification',
      constraint: 'FINANCIAL/Financial triggers overlay regardless of application domain',
    },
    {
      key: 'requested_model',
      constraint: 'Eligible models still subject to tokenize and transmission controls',
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
    {
      id: 'c_fin_trust',
      statement: 'IF FINANCIAL AND trust_level = untrusted THEN DENY',
    },
    {
      id: 'c_fin_approval',
      statement:
        'IF FINANCIAL AND operation IN (write,export,share,transmit) AND NOT human_approved THEN DENY',
    },
  ],
  decisions: [
    {
      when: 'Financial write/export/share/transmit',
      decision: 'DENY',
      reason_codes: ['FINANCIAL_WRITE_REQUIRES_APPROVAL'],
    },
    {
      when: 'Financial read/analysis path',
      decision: 'TOKENIZE',
      reason_codes: ['FINANCIAL_REQUIRES_TOKENIZE'],
    },
    {
      when: 'Untrusted application with financial data',
      decision: 'DENY',
      reason_codes: ['UNTRUSTED_APPLICATION'],
    },
  ],
  obligations: [
    {
      code: 'REQUIRE_HUMAN_APPROVAL_FOR_EXECUTION',
      when: 'financial write/export/share/transmit path',
      description: 'Human approval required before mutating or releasing financial data.',
    },
    {
      code: 'TOKENIZE_PII',
      when: 'financial data present',
      description: 'Tokenize financial fields before model execution.',
    },
    {
      code: 'LOG_GOVERNANCE_EVENT',
      when: 'always',
      description: 'Emit a governance audit event for financial overlay decisions.',
    },
    {
      code: 'NO_EXTERNAL_TRANSMISSION',
      when: 'raw financial fields would leave the trust boundary',
      description: 'Block external transmission of raw financial content.',
    },
  ],
};

const LEGAL: PolicyDefinition = {
  description:
    'Keeps privileged legal content off external models and blocks export or sharing so confidential counsel material stays inside approved local or private processing paths.',
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
    {
      type: 'role',
      match: 'legal_counsel (preferred)',
      description: 'Privileged legal workflows expect an authorized legal role.',
    },
    {
      type: 'application',
      match: 'trust_level != untrusted',
      description: 'Untrusted applications cannot process legal content.',
    },
  ],
  resources: [
    {
      type: 'prompt_content',
      classification: 'LEGAL',
      description: 'Legal privileged, litigation, or regulated counsel content.',
    },
    {
      type: 'model_response',
      classification: 'LEGAL',
      description: 'Legal content residual in responses remains governed by local-only and export controls.',
    },
    {
      type: 'derived_artifact',
      classification: 'LEGAL',
      description: 'Exports, shares, and transmitted copies of legal content.',
    },
  ],
  actions: [
    {
      action: 'summarize|generate|read|*',
      effect: 'allow_with_controls',
      description: 'Analysis paths may proceed only on eligible local/private models.',
    },
    {
      action: 'export|share|transmit',
      effect: 'deny',
      description: 'Export and share of legal data are denied.',
    },
  ],
  ai_context: [
    {
      key: 'requested_model',
      constraint: 'External/cloud models denied for legal data',
    },
    {
      key: 'operation',
      constraint: 'export/share/transmit blocked for legal data',
    },
    {
      key: 'deployment_mode',
      constraint: 'Prefer local/private runtimes for privileged legal content',
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
    {
      id: 'c_legal_trust',
      statement: 'IF LEGAL AND trust_level = untrusted THEN DENY',
    },
  ],
  decisions: [
    {
      when: 'Legal export/share/transmit',
      decision: 'DENY',
      reason_codes: ['LEGAL_EXPORT_BLOCKED'],
    },
    {
      when: 'Legal with external model',
      decision: 'DENY',
      reason_codes: ['LEGAL_EXTERNAL_MODEL_BLOCKED'],
    },
    {
      when: 'Legal on eligible local path',
      decision: 'ALLOW',
      reason_codes: ['POLICY_ALLOW'],
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
    {
      code: 'LOG_GOVERNANCE_EVENT',
      when: 'always',
      description: 'Emit a governance audit event for legal overlay decisions.',
    },
  ],
};

const BY_POLICY_ID: Record<string, PolicyDefinition> = {
  pol_phase2_core: BASELINE_INPUT,
  pol_phase5_response: BASELINE_OUTPUT,
  pol_hipaa_phi_local: HIPAA,
  pol_hipaa_release: HIPAA_OUTPUT,
  pol_part2_sud_records: PART2_INPUT,
  pol_part2_redisclosure: PART2_OUTPUT,
  pol_onc_hti1_dsi_input: ONC_HTI1_INPUT,
  pol_onc_hti1_dsi_output: ONC_HTI1_OUTPUT,
  pol_cms_interop_input: CMS_INPUT,
  pol_cms_interop_output: CMS_OUTPUT,
  pol_financial_tokenize: FINANCIAL,
  pol_legal_no_external: LEGAL,
};

const BY_INTERPRETER: Record<string, PolicyDefinition> = {
  baseline_input_v2: BASELINE_INPUT,
  baseline_output_v5: BASELINE_OUTPUT,
  hipaa_overlay_v1: HIPAA,
  hipaa_pack_v2: HIPAA,
  hipaa_pack_v2_output: HIPAA_OUTPUT,
  hipaa_pack_v3: HIPAA,
  hipaa_pack_v3_output: HIPAA_OUTPUT,
  part2_pack_v1: PART2_INPUT,
  part2_pack_v1_output: PART2_OUTPUT,
  onc_hti1_pack_v1: ONC_HTI1_INPUT,
  onc_hti1_pack_v1_output: ONC_HTI1_OUTPUT,
  cms_pack_v1: CMS_INPUT,
  cms_pack_v1_output: CMS_OUTPUT,
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
