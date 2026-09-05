export type RiskLevel = 'high' | 'medium' | 'low' | 'undetermined';

export type AppRiskInput = {
  application_id: string;
  name: string;
  type: string;
  environment: string;
  status: string;
  trust_level: string;
  allowed_models: string[];
  allowed_operations: string[];
  recent_blocks: number;
};

export type AppRiskClassification = {
  application_id: string;
  name: string;
  risk: RiskLevel;
  rationale: string;
};

export type RiskCounts = Record<RiskLevel, number>;

export function emptyRiskCounts(): RiskCounts {
  return { high: 0, medium: 0, low: 0, undetermined: 0 };
}

export function classifyApplicationHeuristic(app: AppRiskInput): AppRiskClassification {
  if (!app.name || !app.application_id) {
    return {
      application_id: app.application_id,
      name: app.name || app.application_id,
      risk: 'undetermined',
      rationale: 'Insufficient application metadata to classify.',
    };
  }

  if (app.status === 'deleted') {
    return {
      application_id: app.application_id,
      name: app.name,
      risk: 'undetermined',
      rationale: 'Application is deleted; risk posture is inactive.',
    };
  }

  if (app.trust_level === 'untrusted' || app.recent_blocks >= 3) {
    return {
      application_id: app.application_id,
      name: app.name,
      risk: 'high',
      rationale:
        app.trust_level === 'untrusted'
          ? 'Untrusted trust level elevates governance risk.'
          : 'Repeated recent blocked completions indicate elevated risk.',
    };
  }

  if (
    app.status === 'suspended' ||
    app.trust_level === 'standard' ||
    app.environment === 'prod' ||
    app.recent_blocks > 0 ||
    app.allowed_models.length === 0
  ) {
    return {
      application_id: app.application_id,
      name: app.name,
      risk: 'medium',
      rationale:
        app.status === 'suspended'
          ? 'Suspended applications retain residual exposure until retired.'
          : app.environment === 'prod'
            ? 'Production environment with standard controls warrants medium risk.'
            : 'Standard trust, missing allowlists, or recent blocks warrant medium risk.',
    };
  }

  if (app.trust_level === 'trusted' && app.status === 'active') {
    return {
      application_id: app.application_id,
      name: app.name,
      risk: 'low',
      rationale: 'Trusted active application with no recent block pressure.',
    };
  }

  return {
    application_id: app.application_id,
    name: app.name,
    risk: 'undetermined',
    rationale: 'Could not confidently map trust, environment, and activity signals.',
  };
}

export function aggregateRiskCounts(
  classifications: AppRiskClassification[],
): RiskCounts {
  const counts = emptyRiskCounts();
  for (const c of classifications) {
    counts[c.risk] += 1;
  }
  return counts;
}

export function parseRiskClassificationJson(raw: string): AppRiskClassification[] | null {
  const trimmed = raw.trim();
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    const parsed = JSON.parse(trimmed.slice(start, end + 1)) as {
      applications?: Array<Partial<AppRiskClassification>>;
    };
    const apps = (parsed.applications ?? [])
      .filter(
        (a) =>
          typeof a.application_id === 'string' &&
          typeof a.name === 'string' &&
          (a.risk === 'high' ||
            a.risk === 'medium' ||
            a.risk === 'low' ||
            a.risk === 'undetermined'),
      )
      .map((a) => ({
        application_id: String(a.application_id),
        name: String(a.name),
        risk: a.risk as RiskLevel,
        rationale:
          typeof a.rationale === 'string'
            ? a.rationale
            : 'Classified by local runtime.',
      }));
    return apps.length > 0 ? apps : null;
  } catch {
    return null;
  }
}
