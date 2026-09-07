import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  SOC2_PACK_META,
  SOC2_PROVENANCE_GRAPH,
  SOC2_RULES,
  type Soc2CompiledRule,
} from './compiled-bundle.js';
import type { PackPolicyMeta } from '../baseline.js';
import type {
  ObligationProvenanceRecord,
  PackProvenanceGraph,
  RegulatorySourceRecord,
} from '../../provenance.js';

export type CompiledSoc2Pack = {
  pack_id: string;
  pack_version: string;
  rules: Soc2CompiledRule[];
  provenance: PackProvenanceGraph;
  policies: PackPolicyMeta[];
};

function packRootCandidates(): string[] {
  const here = dirname(fileURLToPath(import.meta.url));
  return [
    join(process.cwd(), 'policy-packs', 'soc2'),
    join(here, '../../../../../policy-packs/soc2'),
    join(here, '../../../../../../policy-packs/soc2'),
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
      authority_id: s.authority_id != null ? String(s.authority_id) : undefined,
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

export function loadSoc2PackSources(): {
  root: string | null;
  rules: Soc2CompiledRule[];
  provenance: PackProvenanceGraph;
} {
  for (const root of packRootCandidates()) {
    const rulesPath = join(root, 'rules', 'index.json');
    if (!existsSync(rulesPath)) continue;
    try {
      const rulesJson = JSON.parse(readFileSync(rulesPath, 'utf8')) as {
        rules: Soc2CompiledRule[];
      };
      let provenance: PackProvenanceGraph = structuredClone(SOC2_PROVENANCE_GRAPH);
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
      return { root, rules: rulesJson.rules, provenance };
    } catch {
      // fall through
    }
  }
  return {
    root: null,
    rules: SOC2_RULES,
    provenance: SOC2_PROVENANCE_GRAPH,
  };
}

export function compileSoc2Pack(): CompiledSoc2Pack {
  const loaded = loadSoc2PackSources();
  const policies: PackPolicyMeta[] = [
    {
      policy_id: SOC2_PACK_META.input_policy_id,
      version: SOC2_PACK_META.input_version,
      pack_id: SOC2_PACK_META.pack_id,
      name: 'SOC 2 input governance',
      phase: 'input',
      status: 'active',
      interpreter: SOC2_PACK_META.input_interpreter,
      description:
        'Applies AICPA Trust Services Criteria (SOC 2-informed) as Enigma enterprise assurance evidence gates. Framework — does not certify SOC 2 compliance or produce an audit opinion.',
      owner: 'compliance',
      priority: 115,
      scope_tier: 'standard',
      domain: 'ai_risk',
      content_hash: 'sha256:soc2_pack_v1',
      pack_name: 'SOC 2',
      pack_version: SOC2_PACK_META.pack_version,
    },
    {
      policy_id: SOC2_PACK_META.output_policy_id,
      version: SOC2_PACK_META.output_version,
      pack_id: SOC2_PACK_META.pack_id,
      name: 'SOC 2 output governance',
      phase: 'output',
      status: 'active',
      interpreter: SOC2_PACK_META.output_interpreter,
      description:
        'Adds complementary Enigma logging for SOC 2-scoped responses (system monitoring family).',
      owner: 'compliance',
      priority: 115,
      scope_tier: 'standard',
      domain: 'ai_risk',
      content_hash: 'sha256:soc2_pack_v1_output',
      pack_name: 'SOC 2',
      pack_version: SOC2_PACK_META.pack_version,
    },
  ];

  return {
    pack_id: SOC2_PACK_META.pack_id,
    pack_version: SOC2_PACK_META.pack_version,
    rules: loaded.rules,
    provenance: loaded.provenance,
    policies,
  };
}
