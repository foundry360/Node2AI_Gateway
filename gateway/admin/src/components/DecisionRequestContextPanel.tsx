'use client';

/**
 * Live request/context snapshot from policy_evaluations.
 * Renders only fields that were persisted - missing stays absent.
 */

import { StatusBadge } from '@/components/StatusBadge';
import { formatClassificationLabel } from '@/lib/classification-label';
import { formatFieldLabel } from '@/lib/field-label';

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
  governance?: {
    accountability_documented?: boolean;
    system_context_documented?: boolean;
    measurement_documented?: boolean;
    risk_response_documented?: boolean;
  };
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

type Row = { label: string; value: string; mono?: boolean };

function rowsFromContext(
  ctx: RequestContext,
  executionSummary?: string | null,
): Row[] {
  const rows: Row[] = [];
  const isSimulation = ctx.execution_mode === 'simulation';

  rows.push({
    label: 'Execution',
    value: isSimulation ? 'Simulation' : 'Live',
  });
  if (ctx.phase) {
    rows.push({ label: 'Phase', value: formatFieldLabel(ctx.phase) });
  }
  if (executionSummary) {
    rows.push({ label: 'Status', value: executionSummary });
  }
  if (ctx.request_id) {
    rows.push({ label: 'Request ID', value: ctx.request_id, mono: true });
  }
  if (ctx.action) {
    rows.push({ label: 'Action', value: ctx.action, mono: true });
  }
  if (ctx.resource_type) {
    rows.push({
      label: 'Resource Type',
      value: formatFieldLabel(ctx.resource_type),
    });
  }
  if (ctx.classification) {
    rows.push({
      label: 'Classification',
      value: formatClassificationLabel(ctx.classification),
    });
  }
  if (ctx.purpose) rows.push({ label: 'Purpose', value: ctx.purpose });
  if (ctx.recipient) rows.push({ label: 'Recipient', value: ctx.recipient });
  if (ctx.authorization) {
    rows.push({ label: 'Authorization Context', value: ctx.authorization });
  }
  if (ctx.governance) {
    const bits = [
      ctx.governance.accountability_documented != null
        ? `accountability=${ctx.governance.accountability_documented}`
        : null,
      ctx.governance.system_context_documented != null
        ? `system_context=${ctx.governance.system_context_documented}`
        : null,
      ctx.governance.measurement_documented != null
        ? `measurement=${ctx.governance.measurement_documented}`
        : null,
      ctx.governance.risk_response_documented != null
        ? `risk_response=${ctx.governance.risk_response_documented}`
        : null,
    ].filter(Boolean);
    if (bits.length) {
      rows.push({ label: 'Governance Context', value: bits.join(', ') });
    }
  }
  if (ctx.regulatory_applicability?.length) {
    rows.push({
      label: 'Regulatory Applicability',
      value: ctx.regulatory_applicability.join(', '),
    });
  }
  if (ctx.source) rows.push({ label: 'Source', value: ctx.source });
  if (ctx.processing_location) {
    rows.push({ label: 'Processing Location', value: ctx.processing_location });
  }
  if (ctx.environment) {
    rows.push({
      label: 'Environment',
      value: formatFieldLabel(ctx.environment),
    });
  }
  if (ctx.deployment_mode) {
    rows.push({
      label: 'Deployment Mode',
      value: formatFieldLabel(ctx.deployment_mode),
    });
  }
  if (ctx.risk_level) {
    rows.push({
      label: 'Risk Level',
      value: formatFieldLabel(ctx.risk_level),
    });
  }
  if (ctx.model) rows.push({ label: 'Model', value: ctx.model, mono: true });
  if (ctx.intent) rows.push({ label: 'Intent', value: ctx.intent });
  if (ctx.application_id) {
    rows.push({ label: 'Application', value: ctx.application_id, mono: true });
  }
  if (ctx.organization_id) {
    rows.push({
      label: 'Organization',
      value: ctx.organization_id,
      mono: true,
    });
  }
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
  const rows = rowsFromContext(context, executionSummary);
  const isSimulation = context.execution_mode === 'simulation';

  return (
    <section
      className="section-card request-context-card"
      aria-labelledby="request-context-heading"
    >
      <div className="section-card-header">
        <h3 id="request-context-heading">Request Context</h3>
        <StatusBadge
          variant="badge"
          status={isSimulation ? 'simulation' : 'live'}
          label={isSimulation ? 'Simulation' : 'Live'}
        />
      </div>
      <p className="muted decision-panel-lede">
        Context around this request - the operation and surrounding facts, such as summarizing or analysis. Missing fields are omitted.
      </p>
      <div className="request-context-grid">
        {rows.map((row) => (
          <div key={row.label} className="meridian-attr">
            <span className="meridian-attr-label">{row.label}</span>
            <span
              className={
                row.mono
                  ? 'meridian-attr-value mono'
                  : 'meridian-attr-value'
              }
            >
              {row.value}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
