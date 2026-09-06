/**
 * Client-side types + tiny helpers for pack-agnostic decision explanation UX.
 * Mirrors gateway PolicyDecision.explanation shapes — no regulatory branches.
 */

export type ProvenanceRule = {
  rule_id: string;
  obligation_ids: string[];
  citations: string[];
  source_ids: string[];
  authority_tier?: number;
  authority?: string;
  authority_type?: string;
  legal_authority?: boolean;
  control_ids?: string[];
  requirement_type?: string;
};

export type DecisionExplanationPayload = {
  decision?: string;
  reason?: string;
  reason_codes?: string[];
  obligations?: Array<{ code: string; parameters?: Record<string, unknown> }>;
  evaluation_id?: string;
  applicable_policies?: Array<{
    policy_id: string;
    version: number;
    pack_id?: string;
    name?: string;
  }>;
  explanation?: {
    final_reason?: string;
    provenance?: {
      matched_rules?: ProvenanceRule[];
      sources?: Array<{
        source_id: string;
        authority: string;
        authority_tier: number;
        authority_type?: string;
        legal_authority?: boolean;
        citation?: string;
        title?: string;
      }>;
      controls?: Array<{ control_id: string; control_type?: string }>;
      enforcement?: {
        actions: string[];
        authorize_detokenization?: boolean;
      };
    };
    resolution?: {
      category?: string;
      basis?: string;
      contributing_pack_ids?: string[];
      detail?: string;
      conflict_pairs?: Array<{
        pack_a: string;
        pack_b: string;
        policy_a: string;
        policy_b: string;
        category: string;
        detail: string;
      }>;
      contributions?: Array<{
        pack_id: string;
        pack_name?: string;
        pack_version?: string;
        policy_id: string;
        policy_name?: string;
        policy_version: number;
        decision: string;
        rule_ids: string[];
        obligation_ids: string[];
        obligations?: string[];
        controls?: Array<{ control_id: string; control_type?: string }>;
        reason_codes?: string[];
      }>;
    };
    operator?: {
      final_decision: string;
      resolution_category?: string;
      resolution_basis?: string;
      resolution_label: string;
      basis_label: string;
      narrative: string;
      contributing_pack_ids: string[];
      contributions: Array<{
        pack_id: string;
        pack_name: string;
        pack_version?: string;
        policy_id: string;
        policy_name?: string;
        policy_version: number;
        decision: string;
        rule_ids: string[];
        obligation_ids: string[];
        obligations: string[];
        controls: Array<{ control_id: string; control_type?: string }>;
        reason_codes: string[];
        has_provenance: boolean;
      }>;
      authorities: Array<{
        source_id: string;
        authority: string;
        citation?: string;
        authority_tier?: number;
        authority_type?: string;
        legal_authority?: boolean;
        pack_ids: string[];
      }>;
      enforcement_controls: Array<{ control_id: string; control_type?: string }>;
      enforcement_actions: string[];
      enigma_obligations: string[];
      flow: string[];
      conflict_detail?: string;
    };
  };
};

const TIER_LABELS: Record<number, string> = {
  1: 'Tier 1 — Primary legal authority',
  2: 'Tier 2 — Official regulatory guidance',
  3: 'Tier 3 — Federal guidance',
  4: 'Tier 4 — Implementation guidance',
  5: 'Tier 5 — Recognized standard',
  6: 'Tier 6 — Secondary',
};

export function authorityTierLabel(tier: number | undefined): string {
  if (tier == null || Number.isNaN(tier)) return 'Authority tier unknown';
  return TIER_LABELS[tier] ?? `Tier ${tier}`;
}
