export type FrameworkCompliance = {
  framework_id: string;
  name: string;
  score: number;
  status: 'strong' | 'partial' | 'weak' | 'unknown';
  detail: string;
  compliant_controls: number;
  total_controls: number;
  high_priority_issues: number;
};

export type PriorityFrameworkDef = {
  framework_id: string;
  name: string;
  pack_ids: string[];
  domains: string[];
};

/** Priority regulatory frameworks surfaced on the Console compliance card. */
export const PRIORITY_FRAMEWORKS: PriorityFrameworkDef[] = [
  {
    framework_id: 'eu_ai_act',
    name: 'EU AI Act',
    pack_ids: ['pack_eu_ai_act', 'pack_eu'],
    domains: ['eu', 'eu_ai_act'],
  },
  {
    framework_id: 'hipaa',
    name: 'HIPAA',
    pack_ids: ['pack_hipaa'],
    domains: ['hipaa'],
  },
  {
    framework_id: 'financial',
    name: 'Financial Services',
    pack_ids: ['pack_financial'],
    domains: ['financial'],
  },
  {
    framework_id: 'legal',
    name: 'Legal',
    pack_ids: ['pack_legal'],
    domains: ['legal'],
  },
];

export type PackFact = {
  pack_id: string;
  name: string;
  domain: string;
  status: string;
};

export type PolicyFact = {
  policy_id: string;
  pack_id: string;
  status: string;
};

export function complianceStatusForScore(
  score: number,
): FrameworkCompliance['status'] {
  if (score >= 80) return 'strong';
  if (score >= 50) return 'partial';
  if (score > 0) return 'weak';
  return 'unknown';
}

export function scoreFrameworkHeuristic(
  def: PriorityFrameworkDef,
  packs: PackFact[],
  policies: PolicyFact[],
): FrameworkCompliance {
  const pack = packs.find(
    (p) =>
      def.pack_ids.includes(p.pack_id) ||
      def.domains.includes(p.domain.toLowerCase()) ||
      p.name.toLowerCase().includes(def.name.toLowerCase().split(' ')[0]!.toLowerCase()),
  );

  if (!pack) {
    return {
      framework_id: def.framework_id,
      name: def.name,
      score: 0,
      status: 'unknown',
      detail: 'No matching policy pack loaded for this framework.',
      compliant_controls: 0,
      total_controls: 10,
      high_priority_issues: 2,
    };
  }

  const related = policies.filter((p) => p.pack_id === pack.pack_id);
  const active = related.filter((p) => p.status === 'active').length;
  const approved = related.filter((p) => p.status === 'approved').length;
  const gap = related.filter(
    (p) => p.status !== 'active' && p.status !== 'approved',
  ).length;
  const total = related.length;

  let score = 0;
  if (pack.status === 'active') score += 40;
  else if (pack.status === 'approved') score += 25;
  else if (pack.status === 'draft') score += 15;
  else if (pack.status === 'suspended' || pack.status === 'retired') score += 5;

  if (total > 0) {
    score += Math.round((active / total) * 50);
    score += Math.round((approved / total) * 10);
  } else if (pack.status === 'active') {
    score += 20;
  }

  score = Math.max(0, Math.min(100, score));

  const totalControls = Math.max(total, 1) * (total === 0 ? 10 : 1);
  const compliantControls =
    total > 0 ? active + approved : pack.status === 'active' ? 6 : 0;
  const highPriorityIssues =
    gap +
    (pack.status === 'draft' || pack.status === 'suspended' ? 1 : 0) +
    (total === 0 ? 2 : 0);

  return {
    framework_id: def.framework_id,
    name: def.name,
    score,
    status: complianceStatusForScore(score),
    detail:
      total > 0
        ? `${active} of ${total} pack policies active (${pack.status} pack).`
        : `Pack ${pack.name} is ${pack.status} with no linked policies.`,
    compliant_controls: Math.min(compliantControls, totalControls),
    total_controls: totalControls,
    high_priority_issues: highPriorityIssues,
  };
}

export function overallComplianceScore(frameworks: FrameworkCompliance[]): number {
  if (frameworks.length === 0) return 0;
  const sum = frameworks.reduce((acc, f) => acc + f.score, 0);
  return Math.round(sum / frameworks.length);
}

export function parseComplianceJson(raw: string): {
  summary?: string;
  overall?: number;
  frameworks?: FrameworkCompliance[];
} | null {
  const trimmed = raw.trim();
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    const parsed = JSON.parse(trimmed.slice(start, end + 1)) as {
      summary?: string;
      overall?: number;
      frameworks?: Array<Partial<FrameworkCompliance>>;
    };
    const frameworks = (parsed.frameworks ?? [])
      .filter(
        (f) =>
          typeof f.framework_id === 'string' &&
          typeof f.name === 'string' &&
          typeof f.score === 'number',
      )
      .map((f) => {
        const score = Math.max(0, Math.min(100, Math.round(Number(f.score))));
        const totalControls =
          typeof f.total_controls === 'number' && f.total_controls > 0
            ? Math.round(f.total_controls)
            : 10;
        const compliantControls =
          typeof f.compliant_controls === 'number'
            ? Math.max(0, Math.min(totalControls, Math.round(f.compliant_controls)))
            : Math.round((score / 100) * totalControls);
        return {
          framework_id: String(f.framework_id),
          name: String(f.name),
          score,
          status:
            f.status === 'strong' ||
            f.status === 'partial' ||
            f.status === 'weak' ||
            f.status === 'unknown'
              ? f.status
              : complianceStatusForScore(score),
          detail:
            typeof f.detail === 'string'
              ? f.detail
              : 'Scored by local runtime.',
          compliant_controls: compliantControls,
          total_controls: totalControls,
          high_priority_issues:
            typeof f.high_priority_issues === 'number'
              ? Math.max(0, Math.round(f.high_priority_issues))
              : score < 80
                ? Math.max(1, Math.round((100 - score) / 25))
                : 0,
        };
      });
    return {
      summary: typeof parsed.summary === 'string' ? parsed.summary : undefined,
      overall:
        typeof parsed.overall === 'number'
          ? Math.max(0, Math.min(100, Math.round(parsed.overall)))
          : undefined,
      frameworks: frameworks.length > 0 ? frameworks : undefined,
    };
  } catch {
    return null;
  }
}
