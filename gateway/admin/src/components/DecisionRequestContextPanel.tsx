'use client';

/**
 * Live request/context snapshot from policy_evaluations.
 * Renders only fields that were persisted — missing stays absent.
 */

type RequestContext = {
  execution_mode?: 'simulation' | 'live';
  phase?: string;
  request_id?: string;
  action?: string;
  resource_type?: string;
  classification?: string;
  purpose?: string;
  recipient?: string;
  authorization?: string;
  source?: string;
  processing_location?: string;
  regulatory_applicability?: string[];
  environment?: string;
  deployment_mode?: string;
  risk_level?: string;
  application_id?: string;
  organization_id?: string;
  model?: string;
  intent?: string;
};

type Row = { label: string; value: string };

function rowsFromContext(ctx: RequestContext): Row[] {
  const rows: Row[] = [];
  if (ctx.request_id) rows.push({ label: 'Request ID', value: ctx.request_id });
  if (ctx.action) rows.push({ label: 'Action', value: ctx.action });
  if (ctx.resource_type) rows.push({ label: 'Resource type', value: ctx.resource_type });
  if (ctx.classification) rows.push({ label: 'Classification', value: ctx.classification });
  if (ctx.purpose) rows.push({ label: 'Purpose', value: ctx.purpose });
  if (ctx.recipient) rows.push({ label: 'Recipient', value: ctx.recipient });
  if (ctx.authorization) rows.push({ label: 'Authorization context', value: ctx.authorization });
  if (ctx.regulatory_applicability?.length) {
    rows.push({
      label: 'Regulatory applicability',
      value: ctx.regulatory_applicability.join(', '),
    });
  }
  if (ctx.source) rows.push({ label: 'Source', value: ctx.source });
  if (ctx.processing_location) {
    rows.push({ label: 'Processing location', value: ctx.processing_location });
  }
  if (ctx.environment) rows.push({ label: 'Environment', value: ctx.environment });
  if (ctx.deployment_mode) rows.push({ label: 'Deployment mode', value: ctx.deployment_mode });
  if (ctx.risk_level) rows.push({ label: 'Risk level', value: ctx.risk_level });
  if (ctx.model) rows.push({ label: 'Model', value: ctx.model });
  if (ctx.intent) rows.push({ label: 'Intent', value: ctx.intent });
  if (ctx.application_id) rows.push({ label: 'Application', value: ctx.application_id });
  if (ctx.organization_id) rows.push({ label: 'Organization', value: ctx.organization_id });
  return rows;
}

export function DecisionRequestContextPanel({
  context,
  executionSummary,
}: {
  context?: RequestContext | null;
  executionSummary?: string | null;
}) {
  if (!context) return null;
  const rows = rowsFromContext(context);
  const isSimulation = context.execution_mode === 'simulation';

  return (
    <section className="panel panel-pad" aria-labelledby="request-context-heading">
      <h3 id="request-context-heading" className="section-title">
        1. Request
      </h3>
      <p className="muted">
        What the AI attempted, from context captured at evaluation time. Missing fields are omitted
        — they are not treated as unknown or false.
      </p>
      <dl className="definition-list">
        <div>
          <dt>Execution</dt>
          <dd className="mono">
            {isSimulation ? 'SIMULATION' : 'LIVE'}
            {context.phase ? ` · ${context.phase}` : ''}
          </dd>
        </div>
        {executionSummary ? (
          <div>
            <dt>Status</dt>
            <dd>{executionSummary}</dd>
          </div>
        ) : null}
        {rows.map((row) => (
          <div key={row.label}>
            <dt>{row.label}</dt>
            <dd className="mono">{row.value}</dd>
          </div>
        ))}
      </dl>
      {rows.length === 0 ? (
        <p className="muted" style={{ marginTop: '0.5rem' }}>
          No additional request context was persisted for this evaluation.
        </p>
      ) : null}
    </section>
  );
}
