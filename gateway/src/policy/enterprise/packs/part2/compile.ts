import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  PART2_PACK_META,
  PART2_PROVENANCE_GRAPH,
  PART2_RULES,
  type Part2CompiledRule,
} from './compiled-bundle.js';
import type { PackPolicyMeta } from '../baseline.js';
import type {
  ObligationProvenanceRecord,
  PackProvenanceGraph,
  RegulatorySourceRecord,
} from '../../provenance.js';

export type CompiledPart2Pack = {
  pack_id: string;
  pack_version: string;
  rules: Part2CompiledRule[];
  provenance: PackProvenanceGraph;
  policies: PackPolicyMeta[];
};

function packRootCandidates(): string[] {
  const here = dirname(fileURLToPath(import.meta.url));
  return [
    join(process.cwd(), 'policy-packs', 'part2'),
    join(here, '../../../../../policy-packs/part2'),
    join(here, '../../../../../../policy-packs/part2'),
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

export function loadPart2PackSources(): {
  root: string | null;
  rules: Part2CompiledRule[];
  provenance: PackProvenanceGraph;
} {
  for (const root of packRootCandidates()) {
    const rulesPath = join(root, 'rules', 'index.json');
    if (!existsSync(rulesPath)) continue;
    try {
      const rulesJson = JSON.parse(readFileSync(rulesPath, 'utf8')) as {
        rules: Part2CompiledRule[];
      };
      let provenance: PackProvenanceGraph = structuredClone(PART2_PROVENANCE_GRAPH);
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
  return { root: null, rules: PART2_RULES, provenance: PART2_PROVENANCE_GRAPH };
}

export function compilePart2Pack(): CompiledPart2Pack {
  const loaded = loadPart2PackSources();
  const policies: PackPolicyMeta[] = [
    {
      policy_id: PART2_PACK_META.input_policy_id,
      version: PART2_PACK_META.input_version,
      pack_id: PART2_PACK_META.pack_id,
      name: 'Part 2 SUD record input governance',
      phase: 'input',
      status: 'active',
      interpreter: PART2_PACK_META.input_interpreter,
      description:
        'Applies 42 CFR Part 2 confidentiality controls when substance use disorder (SUD) records are in scope. Consent evidence gates processing, and unauthorized external paths or write/export actions are denied. Does not certify Part 2 compliance.',
      owner: 'compliance',
      priority: 210,
      scope_tier: 'regulatory',
      domain: 'healthcare',
      content_hash: 'sha256:part2_pack_v1',
      pack_name: '42 CFR Part 2',
      pack_version: PART2_PACK_META.pack_version,
    },
    {
      policy_id: PART2_PACK_META.output_policy_id,
      version: PART2_PACK_META.output_version,
      pack_id: PART2_PACK_META.pack_id,
      name: 'Part 2 redisclosure and release governance',
      phase: 'output',
      status: 'active',
      interpreter: PART2_PACK_META.output_interpreter,
      description:
        'Evaluates model output and redisclosure for Part 2 SUD records. Blocks unauthorized residual plaintext and allows Enigma release to authorize detokenization only when redisclosure conditions are satisfied.',
      owner: 'compliance',
      priority: 210,
      scope_tier: 'regulatory',
      domain: 'healthcare',
      content_hash: 'sha256:part2_pack_v1_output',
      pack_name: '42 CFR Part 2',
      pack_version: PART2_PACK_META.pack_version,
    },
  ];

  return {
    pack_id: PART2_PACK_META.pack_id,
    pack_version: PART2_PACK_META.pack_version,
    rules: loaded.rules,
    provenance: loaded.provenance,
    policies,
  };
}
