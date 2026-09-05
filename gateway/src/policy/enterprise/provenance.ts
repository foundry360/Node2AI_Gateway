/**
 * Generic policy-pack provenance model.
 * Pack-agnostic: Rule → Obligation → Citation → Source → Authority Tier.
 * Does not execute regulatory text; carries structured evidence only.
 */

export type AuthorityType =
  | 'PRIMARY_REGULATORY'
  | 'OFFICIAL_REGULATORY_GUIDANCE'
  | 'FEDERAL_GUIDANCE'
  | 'IMPLEMENTATION_GUIDANCE'
  | 'RECOGNIZED_STANDARD'
  | 'SECONDARY'
  | (string & {});

export interface RegulatorySourceRecord {
  source_id: string;
  authority: string;
  authority_tier: number;
  authority_type: AuthorityType;
  legal_authority: boolean;
  title?: string;
  publisher?: string;
  citation?: string;
  canonical_url?: string | null;
  effective_date?: string | null;
  retrieved_date?: string | null;
  version?: string | null;
  note?: string;
}

export interface ObligationProvenanceRecord {
  obligation_id: string;
  requirement_type?: string;
  authority?: string;
  authority_tier?: number;
  citations: string[];
  source_ids: string[];
  /** Informational / reference-only obligations are not linked to executable rules. */
  informational?: boolean;
}

export interface PackProvenanceGraph {
  sources: Record<string, RegulatorySourceRecord>;
  obligations: Record<string, ObligationProvenanceRecord>;
}

export interface MatchedRuleProvenance {
  rule_id: string;
  obligation_ids: string[];
  citations: string[];
  source_ids: string[];
  authority_tier?: number;
  authority?: string;
  authority_type?: AuthorityType;
  legal_authority?: boolean;
  control_ids?: string[];
  requirement_type?: string;
  obligations?: Array<{
    obligation_id: string;
    citations: string[];
    source_ids: string[];
    authority_tier?: number;
    requirement_type?: string;
  }>;
}

export interface ClassificationProvenance {
  classification: string;
  classification_basis?: {
    type: 'ENIGMA_HEURISTIC' | 'REGULATORY_DEFINITION' | 'DETECTOR' | 'REQUEST_SUPPLIED' | (string & {});
    rule_id?: string;
  };
  regulatory_reference?: {
    source_ids: string[];
    citations: string[];
  };
  applicability?: {
    packs: string[];
    /** Operational pack gating — not a claim that a single CFR sentence mandates the gate. */
    basis: 'ENIGMA_OPERATIONAL' | (string & {});
  };
}

export interface DecisionProvenance {
  matched_rules: MatchedRuleProvenance[];
  sources?: RegulatorySourceRecord[];
  classification?: ClassificationProvenance;
  controls?: Array<{ control_id: string; control_type?: string }>;
  enforcement?: {
    actions: string[];
    authorize_detokenization?: boolean;
  };
}

export interface RuleProvenanceInput {
  rule_id: string;
  obligation_ids?: string[];
  sources?: string[];
  control_ids?: string[];
  requirement_type?: string;
}

/** Resolve Rule → Obligation → Citation → Source → Authority Tier. */
export function resolveMatchedRuleProvenance(
  rule: RuleProvenanceInput,
  graph: PackProvenanceGraph,
): MatchedRuleProvenance {
  const obligationIds = [...(rule.obligation_ids ?? [])];
  const citations: string[] = [];
  const sourceIds = new Set<string>(rule.sources ?? []);
  const obligationDetails: NonNullable<MatchedRuleProvenance['obligations']> = [];

  for (const oid of obligationIds) {
    const obl = graph.obligations[oid];
    if (!obl) {
      obligationDetails.push({
        obligation_id: oid,
        citations: [],
        source_ids: [],
      });
      continue;
    }
    for (const c of obl.citations) {
      if (!citations.includes(c)) citations.push(c);
    }
    for (const sid of obl.source_ids) sourceIds.add(sid);
    obligationDetails.push({
      obligation_id: oid,
      citations: [...obl.citations],
      source_ids: [...obl.source_ids],
      authority_tier: obl.authority_tier,
      requirement_type: obl.requirement_type,
    });
  }

  const resolvedSources = [...sourceIds]
    .map((id) => graph.sources[id])
    .filter((s): s is RegulatorySourceRecord => !!s);

  // Prefer the most authoritative (lowest tier) legal/regulatory source for the summary fields.
  const ranked = [...resolvedSources].sort((a, b) => {
    if (a.legal_authority !== b.legal_authority) return a.legal_authority ? -1 : 1;
    return a.authority_tier - b.authority_tier;
  });
  const primary = ranked[0];

  return {
    rule_id: rule.rule_id,
    obligation_ids: obligationIds,
    citations,
    source_ids: [...sourceIds],
    authority_tier: primary?.authority_tier,
    authority: primary?.authority ?? primary?.citation,
    authority_type: primary?.authority_type,
    legal_authority: primary?.legal_authority,
    control_ids: rule.control_ids ? [...rule.control_ids] : undefined,
    requirement_type: rule.requirement_type,
    obligations: obligationDetails,
  };
}

export function collectSourcesForRules(
  rules: MatchedRuleProvenance[],
  graph: PackProvenanceGraph,
): RegulatorySourceRecord[] {
  const out: RegulatorySourceRecord[] = [];
  const seen = new Set<string>();
  for (const rule of rules) {
    for (const sid of rule.source_ids) {
      if (seen.has(sid)) continue;
      seen.add(sid);
      const src = graph.sources[sid];
      if (src) out.push(src);
    }
  }
  return out;
}

export function appendRuleProvenance(
  current: DecisionProvenance | undefined,
  rule: RuleProvenanceInput,
  graph: PackProvenanceGraph,
  enforcementActions?: string[],
  authorizeDetokenization?: boolean,
): DecisionProvenance {
  const matched = resolveMatchedRuleProvenance(rule, graph);
  const matched_rules = [...(current?.matched_rules ?? []), matched];
  const controls = [
    ...(current?.controls ?? []),
    ...(rule.control_ids ?? []).map((control_id) => ({
      control_id,
      control_type: 'ENIGMA_IMPLEMENTATION_OPTION' as const,
    })),
  ];
  const priorActions = current?.enforcement?.actions ?? [];
  const actions = [...priorActions];
  for (const a of enforcementActions ?? []) {
    if (!actions.includes(a)) actions.push(a);
  }
  return {
    matched_rules,
    sources: collectSourcesForRules(matched_rules, graph),
    classification: current?.classification,
    controls,
    enforcement: {
      actions,
      authorize_detokenization:
        authorizeDetokenization ?? current?.enforcement?.authorize_detokenization,
    },
  };
}

export function emptyProvenanceGraph(): PackProvenanceGraph {
  return { sources: {}, obligations: {} };
}
