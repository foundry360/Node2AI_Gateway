import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ONC_HTI1_PACK_META,
  ONC_HTI1_PROVENANCE_GRAPH,
  ONC_HTI1_RULES,
  type OncHti1CompiledRule,
} from './compiled-bundle.js';
import type { PackPolicyMeta } from '../baseline.js';
import type {
  ObligationProvenanceRecord,
  PackProvenanceGraph,
  RegulatorySourceRecord,
} from '../../provenance.js';

export type CompiledOncHti1Pack = {
  pack_id: string;
  pack_version: string;
  rules: OncHti1CompiledRule[];
  provenance: PackProvenanceGraph;
  policies: PackPolicyMeta[];
};

function packRootCandidates(): string[] {
  const here = dirname(fileURLToPath(import.meta.url));
  return [
    join(process.cwd(), 'policy-packs', 'onc-hti1'),
    join(here, '../../../../../policy-packs/onc-hti1'),
    join(here, '../../../../../../policy-packs/onc-hti1'),
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
      (Array.isArray(o.sources) ? o.sources : ['src_onc_hti1'])
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

export function loadOncHti1PackSources(): {
  root: string | null;
  rules: OncHti1CompiledRule[];
  provenance: PackProvenanceGraph;
} {
  for (const root of packRootCandidates()) {
    const rulesPath = join(root, 'rules', 'index.json');
    if (!existsSync(rulesPath)) continue;
    try {
      const rulesJson = JSON.parse(readFileSync(rulesPath, 'utf8')) as {
        rules: OncHti1CompiledRule[];
      };
      let provenance: PackProvenanceGraph = structuredClone(ONC_HTI1_PROVENANCE_GRAPH);
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
  return { root: null, rules: ONC_HTI1_RULES, provenance: ONC_HTI1_PROVENANCE_GRAPH };
}

export function compileOncHti1Pack(): CompiledOncHti1Pack {
  const loaded = loadOncHti1PackSources();
  const policies: PackPolicyMeta[] = [
    {
      policy_id: ONC_HTI1_PACK_META.input_policy_id,
      version: ONC_HTI1_PACK_META.input_version,
      pack_id: ONC_HTI1_PACK_META.pack_id,
      name: 'ONC HTI-1 predictive DSI input governance',
      phase: 'input',
      status: 'active',
      interpreter: ONC_HTI1_PACK_META.input_interpreter,
      description:
        'Applies ONC/HTI-1-aligned predictive decision-support governance when HTI-1 applicability is asserted. Evaluates algorithm identity, intended use, transparency/FAVES evidence, risk management, human oversight, and version governance. Does not determine ONC certification or legal compliance.',
      owner: 'compliance',
      priority: 205,
      scope_tier: 'regulatory',
      domain: 'healthcare',
      content_hash: 'sha256:onc_hti1_pack_v1',
      pack_name: ONC_HTI1_PACK_META.pack_name,
      pack_version: ONC_HTI1_PACK_META.pack_version,
    },
    {
      policy_id: ONC_HTI1_PACK_META.output_policy_id,
      version: ONC_HTI1_PACK_META.output_version,
      pack_id: ONC_HTI1_PACK_META.pack_id,
      name: 'ONC HTI-1 predictive DSI output governance',
      phase: 'output',
      status: 'active',
      interpreter: ONC_HTI1_PACK_META.output_interpreter,
      description:
        'Output-phase ONC/HTI-1-aligned predictive DSI governance. Allows controlled release when input governance evidence was satisfied. Does not assert HTI-1 compliance.',
      owner: 'compliance',
      priority: 205,
      scope_tier: 'regulatory',
      domain: 'healthcare',
      content_hash: 'sha256:onc_hti1_pack_v1_output',
      pack_name: ONC_HTI1_PACK_META.pack_name,
      pack_version: ONC_HTI1_PACK_META.pack_version,
    },
  ];

  return {
    pack_id: ONC_HTI1_PACK_META.pack_id,
    pack_version: ONC_HTI1_PACK_META.pack_version,
    rules: loaded.rules,
    provenance: loaded.provenance,
    policies,
  };
}
