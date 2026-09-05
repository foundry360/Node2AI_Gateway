export type ActionItem = {
  priority: 'high' | 'medium' | 'low';
  title: string;
  detail: string;
  href?: string;
};

export type ActionItemFacts = {
  gateway_ok: boolean;
  database_ok: boolean;
  database_detail: string;
  runtime_available: boolean;
  runtime_id: string;
  active_policies: number;
  active_models: number;
  applications: number;
  audit_events: number;
  recent_blocked: number;
  blocked_reasons: string[];
  persistence: string;
};

export function buildHeuristicActionItems(facts: ActionItemFacts): ActionItem[] {
  const items: ActionItem[] = [];

  if (!facts.database_ok || facts.database_detail === 'not_configured') {
    items.push({
      priority: 'high',
      title: 'Restore database connectivity',
      detail:
        facts.database_detail === 'not_configured'
          ? 'Persistence is memory-only. Configure Postgres for durable audit and identity.'
          : `Database reports ${facts.database_detail}. Governance state may be incomplete.`,
      href: '/system',
    });
  }

  if (!facts.runtime_available) {
    items.push({
      priority: 'high',
      title: 'Local runtime unavailable',
      detail: 'Appliance inference is down. Completions that require local models will fail closed.',
      href: '/models',
    });
  }

  if (facts.recent_blocked > 0) {
    const reasons =
      facts.blocked_reasons.length > 0
        ? facts.blocked_reasons
            .slice(0, 3)
            .map((code) =>
              code
                .toLowerCase()
                .split('_')
                .filter(Boolean)
                .map((part, i) =>
                  i === 0 ? part.charAt(0).toUpperCase() + part.slice(1) : part,
                )
                .join(' '),
            )
            .join(', ')
        : 'policy or response BLOCK';
    items.push({
      priority: 'high',
      title: `Triage ${facts.recent_blocked} recent blocked event${facts.recent_blocked === 1 ? '' : 's'}`,
      detail: `Top signals: ${reasons}. Review audit for false positives vs real denials.`,
      href: '/audit',
    });
  }

  if (facts.active_policies === 0) {
    items.push({
      priority: 'medium',
      title: 'No active policies',
      detail: 'Activate an EPA pack so the gateway can decide allow/deny at request time.',
      href: '/policies',
    });
  }

  if (facts.applications === 0) {
    items.push({
      priority: 'medium',
      title: 'Register first application',
      detail: 'Applications bind identity, keys, and model allowlists under policy.',
      href: '/applications',
    });
  } else if (facts.active_models === 0) {
    items.push({
      priority: 'medium',
      title: 'No active models',
      detail: 'Enable at least one local or approved model for eligible traffic.',
      href: '/models',
    });
  }

  if (facts.gateway_ok && facts.database_ok && facts.runtime_available && items.length === 0) {
    items.push({
      priority: 'low',
      title: 'Posture looks healthy',
      detail: `${facts.active_policies} active policies, ${facts.active_models} models, ${facts.applications} apps. Keep watching blocked completions.`,
      href: '/audit',
    });
  }

  if (facts.audit_events === 0 && !items.some((i) => i.title.includes('healthy'))) {
    items.push({
      priority: 'low',
      title: 'No audit volume yet',
      detail: 'Send a governed completion to verify policy decide → gateway enforce → audit chain.',
      href: '/audit',
    });
  }

  return items.slice(0, 6);
}

export function parseActionItemsJson(raw: string): {
  summary?: string;
  items?: ActionItem[];
} | null {
  const trimmed = raw.trim();
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    const parsed = JSON.parse(trimmed.slice(start, end + 1)) as {
      summary?: string;
      items?: Array<Partial<ActionItem>>;
    };
    const items = (parsed.items ?? [])
      .filter((i) => typeof i.title === 'string' && typeof i.detail === 'string')
      .map((i) => ({
        priority:
          i.priority === 'high' || i.priority === 'medium' || i.priority === 'low'
            ? i.priority
            : ('medium' as const),
        title: String(i.title),
        detail: String(i.detail),
        href: typeof i.href === 'string' ? i.href : undefined,
      }));
    return {
      summary: typeof parsed.summary === 'string' ? parsed.summary : undefined,
      items: items.length > 0 ? items.slice(0, 6) : undefined,
    };
  } catch {
    return null;
  }
}
