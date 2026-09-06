import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  HIPAA_CLASS_PROFILE,
  HIPAA_PACK_META,
  HIPAA_PROVENANCE_GRAPH,
  HIPAA_RULES,
  type HipaaCompiledRule,
} from './compiled-bundle.js';
import type { PackPolicyMeta } from '../baseline.js';
import type {
  ObligationProvenanceRecord,
  PackProvenanceGraph,
  RegulatorySourceRecord,
} from '../../provenance.js';

export type HipaaClassProfile = {
  profile_id: string;
  version: string;
  prior_profile_id?: string;
  always_phi_entity_types: readonly string[];
  elevatable_pii_entity_types: readonly string[];
  health_context_lexicon: readonly string[];
};

export type CompiledHipaaPack = {
  pack_id: string;
  pack_version: string;
  classification_profile_id: string;
  rules: HipaaCompiledRule[];
  profile: HipaaClassProfile;
  provenance: PackProvenanceGraph;
  policies: PackPolicyMeta[];
  seed_versions: Array<{
    policy_version_id: string;
    policy_id: string;
    version: number;
    status: string;
    phase: 'input' | 'output';
    interpreter: string;
    content_hash: string;
    changelog: string;
  }>;
};

function packRootCandidates(): string[] {
  const here = dirname(fileURLToPath(import.meta.url));
  return [
    join(process.cwd(), 'policy-packs', 'hipaa'),
    join(here, '../../../../../policy-packs/hipaa'),
    join(here, '../../../../../../policy-packs/hipaa'),
  ];
}

function parseSourcesCatalog(raw: unknown): PackProvenanceGraph['sources'] {
  const sources: PackProvenanceGraph['sources'] = {};
  const list = (raw as { sources?: Array<Record<string, unknown>> })?.sources ?? [];
  for (const s of list) {
    const source_id = String(s.source_id ?? s.id ?? '');
    if (!source_id) continue;
    const record: RegulatorySourceRecord = {
      source_id,
      authority: String(s.authority ?? s.citation ?? source_id),
      authority_tier: Number(s.authority_tier ?? s.authority_rank ?? 6),
      authority_type: String(
        s.authority_type ?? 'SECONDARY',
      ) as RegulatorySourceRecord['authority_type'],
      legal_authority: s.legal_authority === true,
      title: s.title != null ? String(s.title) : undefined,
      publisher: s.publisher != null ? String(s.publisher) : undefined,
      citation: s.citation != null ? String(s.citation) : undefined,
      canonical_url:
        s.canonical_url === null
          ? null
          : s.canonical_url != null
            ? String(s.canonical_url)
            : undefined,
      effective_date:
        s.effective_date === null
          ? null
          : s.effective_date != null
            ? String(s.effective_date)
            : undefined,
      retrieved_date:
        s.retrieved_date === null
          ? null
          : s.retrieved_date != null
            ? String(s.retrieved_date)
            : undefined,
      version: s.version === null ? null : s.version != null ? String(s.version) : undefined,
      note: s.note != null ? String(s.note) : undefined,
    };
    sources[source_id] = record;
  }
  return sources;
}

function parseObligationsCatalog(raw: unknown): PackProvenanceGraph['obligations'] {
  const obligations: PackProvenanceGraph['obligations'] = {};
  const list = (raw as { obligations?: Array<Record<string, unknown>> })?.obligations ?? [];
  for (const o of list) {
    const obligation_id = String(o.obligation_id ?? o.id ?? '');
    if (!obligation_id) continue;
    const source_ids = (
      (Array.isArray(o.source_ids) ? o.source_ids : null) ??
      (Array.isArray(o.sources) ? o.sources : [])
    ).map(String);
    const citations = (Array.isArray(o.citations) ? o.citations : []).map(String);
    const record: ObligationProvenanceRecord = {
      obligation_id,
      requirement_type: o.requirement_type != null ? String(o.requirement_type) : undefined,
      authority: o.authority != null ? String(o.authority) : undefined,
      authority_tier: o.authority_tier != null ? Number(o.authority_tier) : undefined,
      citations,
      source_ids,
      informational: o.informational === true,
    };
    obligations[obligation_id] = record;
  }
  return obligations;
}

/** Load docs-as-code pack when present; otherwise use compiled bundle. */
export function loadHipaaPackSources(): {
  root: string | null;
  rules: HipaaCompiledRule[];
  profile: HipaaClassProfile;
  provenance: PackProvenanceGraph;
} {
  for (const root of packRootCandidates()) {
    const rulesPath = join(root, 'rules', 'index.json');
    const profilePath = join(root, 'classifications', 'phi.json');
    if (!existsSync(rulesPath) || !existsSync(profilePath)) continue;
    try {
      const rulesJson = JSON.parse(readFileSync(rulesPath, 'utf8')) as {
        rules: HipaaCompiledRule[];
      };
      const profileJson = JSON.parse(readFileSync(profilePath, 'utf8')) as {
        profile_id: string;
        version: string;
        always_phi_entity_types: string[];
        elevatable_pii_entity_types: string[];
        health_context_lexicon: string[];
      };

      let provenance: PackProvenanceGraph = structuredClone(HIPAA_PROVENANCE_GRAPH);
      const sourcesPath = join(root, 'sources', 'index.json');
      const obligationsPath = join(root, 'obligations', 'index.json');
      if (existsSync(sourcesPath)) {
        const sourcesJson = JSON.parse(readFileSync(sourcesPath, 'utf8'));
        provenance = {
          ...provenance,
          sources: { ...provenance.sources, ...parseSourcesCatalog(sourcesJson) },
        };
      }
      if (existsSync(obligationsPath)) {
        const obligationsJson = JSON.parse(readFileSync(obligationsPath, 'utf8'));
        provenance = {
          ...provenance,
          obligations: {
            ...provenance.obligations,
            ...parseObligationsCatalog(obligationsJson),
          },
        };
      }

      return {
        root,
        rules: rulesJson.rules,
        profile: {
          profile_id: profileJson.profile_id,
          version: profileJson.version,
          prior_profile_id: HIPAA_CLASS_PROFILE.prior_profile_id,
          always_phi_entity_types: profileJson.always_phi_entity_types,
          elevatable_pii_entity_types: profileJson.elevatable_pii_entity_types,
          health_context_lexicon: profileJson.health_context_lexicon,
        },
        provenance,
      };
    } catch {
      // fall through to compiled
    }
  }
  return {
    root: null,
    rules: HIPAA_RULES,
    profile: HIPAA_CLASS_PROFILE,
    provenance: HIPAA_PROVENANCE_GRAPH,
  };
}

/**
 * Compile HIPAA pack into EPA policy metadata + seed version records.
 * Does not invent HIPAA-specific tables — emits standard policy_versions rows.
 * Historical versions (v1 overlay, v2 pack) remain immutable; v3 policies stay active with v3.1 pack metadata.
 */
export function compileHipaaPack(): CompiledHipaaPack {
  const loaded = loadHipaaPackSources();
  const policies: PackPolicyMeta[] = [
    {
      policy_id: HIPAA_PACK_META.input_policy_id,
      version: HIPAA_PACK_META.input_version,
      pack_id: HIPAA_PACK_META.pack_id,
      name: 'HIPAA PHI input governance',
      phase: 'input',
      status: 'active',
      interpreter: HIPAA_PACK_META.input_interpreter,
      description:
        'Applies extra safeguards when true PHI is in scope under HIPAA. It can deny external processing when controls are missing, require stronger evidence before allowing work to continue, and evaluate whether residual PHI in an output may be released. Local or private hosting and tokenization are Enigma controls - not a HIPAA compliance certification, and health-sensitive content alone is not treated as PHI.',
      owner: 'compliance',
      priority: 200,
      scope_tier: 'regulatory',
      domain: 'hipaa',
      content_hash: 'sha256:hipaa_pack_v3_1',
      pack_name: 'HIPAA',
      pack_version: HIPAA_PACK_META.pack_version,
    },
    {
      policy_id: HIPAA_PACK_META.output_policy_id,
      version: HIPAA_PACK_META.output_version,
      pack_id: HIPAA_PACK_META.pack_id,
      name: 'HIPAA output and release governance',
      phase: 'output',
      status: 'active',
      interpreter: HIPAA_PACK_META.output_interpreter,
      description:
        'Evaluates model output and release for PHI under HIPAA-informed controls. Blocks unauthorized residual PHI, and allows Enigma release to authorize detokenization only when release conditions are satisfied. Does not certify HIPAA compliance.',
      owner: 'compliance',
      priority: 200,
      scope_tier: 'regulatory',
      domain: 'hipaa',
      content_hash: 'sha256:hipaa_pack_v3_1_output',
      pack_name: 'HIPAA',
      pack_version: HIPAA_PACK_META.pack_version,
    },
  ];

  return {
    pack_id: HIPAA_PACK_META.pack_id,
    pack_version: HIPAA_PACK_META.pack_version,
    classification_profile_id: loaded.profile.profile_id,
    rules: loaded.rules,
    profile: loaded.profile,
    provenance: loaded.provenance,
    policies,
    seed_versions: [
      {
        policy_version_id: 'pv_pol_hipaa_phi_local_v1',
        policy_id: HIPAA_PACK_META.input_policy_id,
        version: 1,
        status: 'suspended',
        phase: 'input',
        interpreter: HIPAA_PACK_META.prior_overlay_interpreter,
        content_hash: 'sha256:hipaa_overlay_v1',
        changelog: 'M4 HIPAA overlay (immutable historical)',
      },
      {
        policy_version_id: 'pv_pol_hipaa_v2',
        policy_id: HIPAA_PACK_META.input_policy_id,
        version: 2,
        status: 'suspended',
        phase: 'input',
        interpreter: HIPAA_PACK_META.prior_input_interpreter,
        content_hash: 'sha256:hipaa_pack_v2',
        changelog: 'HIPAA pack v2 (immutable historical; suspended on v3 activate)',
      },
      {
        policy_version_id: 'pv_pol_hipaa_v3',
        policy_id: HIPAA_PACK_META.input_policy_id,
        version: 3,
        status: 'active',
        phase: 'input',
        interpreter: HIPAA_PACK_META.input_interpreter,
        content_hash: 'sha256:hipaa_pack_v3_1',
        changelog:
          'HIPAA pack v3.1 — provenance & evidence hardening (citations on decisions); semantics unchanged from v3',
      },
      {
        policy_version_id: 'pv_pol_hipaa_release_v1',
        policy_id: HIPAA_PACK_META.output_policy_id,
        version: 1,
        status: 'suspended',
        phase: 'output',
        interpreter: HIPAA_PACK_META.prior_output_interpreter,
        content_hash: 'sha256:hipaa_pack_v2_output',
        changelog: 'HIPAA pack v2 output (immutable historical)',
      },
      {
        policy_version_id: 'pv_pol_hipaa_release_v2',
        policy_id: HIPAA_PACK_META.output_policy_id,
        version: 2,
        status: 'active',
        phase: 'output',
        interpreter: HIPAA_PACK_META.output_interpreter,
        content_hash: 'sha256:hipaa_pack_v3_1_output',
        changelog:
          'HIPAA pack v3.1 output — Enigma release authorizes detokenization; provenance on release decisions',
      },
    ],
  };
}
