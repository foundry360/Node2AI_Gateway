/**
 * Derive Admin PolicyDefinition sections from compiled pack rules.
 * Keeps Conditions / Decisions / Obligations aligned with interpreter rule indexes.
 */

import type { PolicyDefinition } from './definitions.js';

export type DerivableRule = {
  rule_id: string;
  name: string;
  phase: 'input' | 'output' | string;
  priority?: number;
  conditions: Record<string, unknown>;
  decision: string;
  reason_codes?: string[];
  enigma_obligations?: string[];
  obligation_ids?: string[];
  note?: string;
};

export type FrameworkPackProfile = {
  pack_id: string;
  pack_name: string;
  domain: string;
  scope_tier: string;
  owner: string;
  priority: number;
  applicability_label: string;
  description_input: string;
  description_output: string;
  subjects: PolicyDefinition['subjects'];
  resources: PolicyDefinition['resources'];
  actions: PolicyDefinition['actions'];
  ai_context: PolicyDefinition['ai_context'];
};

function formatConditionValue(value: unknown): string {
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (value == null) return 'null';
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  return JSON.stringify(value);
}

/** Build an IF … THEN statement from a rule's condition bag. */
export function formatRuleConditionStatement(rule: DerivableRule): string {
  const parts = Object.entries(rule.conditions ?? {}).map(
    ([key, value]) => `${key} = ${formatConditionValue(value)}`,
  );
  const when = parts.length > 0 ? parts.join(' AND ') : 'always';
  return `IF ${when} THEN ${rule.decision}`;
}

function uniqueObligations(
  rules: DerivableRule[],
): PolicyDefinition['obligations'] {
  const seen = new Set<string>();
  const out: PolicyDefinition['obligations'] = [];
  for (const rule of rules) {
    const codes = [
      ...(rule.enigma_obligations ?? []),
      ...(rule.obligation_ids ?? []),
    ];
    for (const code of codes) {
      if (!code || seen.has(code)) continue;
      seen.add(code);
      out.push({
        code,
        when: rule.name,
        description:
          rule.enigma_obligations?.includes(code)
            ? `Enigma control applied when: ${rule.name}`
            : `Pack obligation referenced when: ${rule.name}`,
      });
    }
  }
  if (out.length === 0) {
    out.push({
      code: 'LOG_GOVERNANCE_EVENT',
      when: 'always',
      description: 'Emit a governance audit event for pack decisions.',
    });
  }
  return out;
}

export function derivePolicyDefinition(opts: {
  phase: 'input' | 'output';
  profile: FrameworkPackProfile;
  rules: DerivableRule[];
}): PolicyDefinition {
  const phaseRules = opts.rules
    .filter((r) => r.phase === opts.phase)
    .slice()
    .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));

  const conditions = phaseRules.map((rule) => ({
    id: rule.rule_id,
    statement: formatRuleConditionStatement(rule),
  }));

  const decisions = phaseRules.map((rule) => ({
    when: rule.name,
    decision: rule.decision,
    reason_codes: rule.reason_codes ?? [],
  }));

  const obligations = uniqueObligations(phaseRules);

  return {
    description:
      opts.phase === 'input'
        ? opts.profile.description_input
        : opts.profile.description_output,
    owner: opts.profile.owner,
    priority: opts.profile.priority,
    scope_tier: opts.profile.scope_tier,
    domain: opts.profile.domain,
    subjects: opts.profile.subjects,
    resources: opts.profile.resources,
    actions: opts.profile.actions,
    ai_context: opts.profile.ai_context,
    conditions,
    decisions,
    obligations,
  };
}

/** Shared ABAC-style profile for framework / standard evidence-gate packs. */
export function frameworkEvidenceProfile(opts: {
  pack_id: string;
  pack_name: string;
  domain?: string;
  scope_tier?: string;
  owner?: string;
  priority?: number;
  applicability_key: string;
  applicability_label: string;
  authority_note: string;
  input_focus: string;
  output_focus: string;
}): FrameworkPackProfile {
  const domain = opts.domain ?? 'ai_risk';
  return {
    pack_id: opts.pack_id,
    pack_name: opts.pack_name,
    domain,
    scope_tier: opts.scope_tier ?? 'framework',
    owner: opts.owner ?? 'compliance',
    priority: opts.priority ?? 140,
    applicability_label: opts.applicability_label,
    description_input: `${opts.input_focus} ${opts.authority_note}`,
    description_output: `${opts.output_focus} ${opts.authority_note}`,
    subjects: [
      {
        type: 'organization',
        match: `${opts.applicability_key} asserted`,
        description: `Pack engages when ${opts.applicability_label} applicability is in scope for the request.`,
      },
      {
        type: 'application',
        match: 'trust_level != untrusted',
        description: 'Untrusted applications remain subject to baseline denial overlays.',
      },
      {
        type: 'role',
        match: 'governance / compliance reviewer (when REVIEW)',
        description: 'Missing evidence yields human review rather than silent allow.',
      },
    ],
    resources: [
      {
        type: 'prompt_content',
        classification: opts.applicability_label,
        description: `Input content evaluated under ${opts.pack_name} evidence gates.`,
      },
      {
        type: 'model_response',
        classification: opts.applicability_label,
        description: `Output residual content remains in scope for ${opts.pack_name} monitoring.`,
      },
      {
        type: 'governance_evidence',
        description: `Organizational / system evidence required by ${opts.pack_name} rules.`,
      },
    ],
    actions: [
      {
        action: 'summarize|generate|read|*',
        effect: 'allow_with_controls_or_review',
        description:
          'Analysis paths proceed only when required evidence is established; otherwise REVIEW.',
      },
      {
        action: 'write|export|share|transmit',
        effect: 'restrict',
        description: 'Mutating and outbound operations inherit pack controls and baseline overlays.',
      },
    ],
    ai_context: [
      {
        key: 'regulatory_applicability',
        constraint: `${opts.applicability_key} must be asserted for pack rules to bind`,
      },
      {
        key: 'evidence_context',
        constraint: 'Missing required documentation / evidence yields REVIEW',
      },
      {
        key: 'requested_model',
        constraint: 'Model choice remains subject to baseline and overlay controls',
      },
      {
        key: 'operation',
        constraint: 'Outbound operations remain subject to release and transmission controls',
      },
    ],
  };
}
