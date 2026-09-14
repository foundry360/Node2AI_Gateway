import Link from 'next/link';
import { adminFetch } from '@/lib/api';
import { Breadcrumbs } from '@/components/Breadcrumbs';
import { StatusBadge } from '@/components/StatusBadge';
import { ToolLifecycleActions } from '@/components/ToolLifecycleActions';
import { formatDisplayDateTime } from '@/lib/display-datetime';

type ToolDetail = {
  tool: {
    tool_id: string;
    name: string;
    status: string;
    organization_id: string;
    operations: string[];
    metadata?: Record<string, unknown>;
    created_at?: string;
    updated_at?: string;
  };
  deployment_id: string;
  grants: Array<{
    agent_id: string;
    agent_name: string;
    agent_status: string | null;
    allowed_operations: string[];
    status: string;
  }>;
};

export default async function ToolDetailPage({
  params,
}: {
  params: { toolId: string };
}) {
  const toolId = decodeURIComponent(params.toolId);
  let detail: ToolDetail | null = null;
  let error: string | null = null;

  try {
    detail = await adminFetch<ToolDetail>(
      `/v1/admin/tools/${encodeURIComponent(toolId)}`,
    );
  } catch (err) {
    error = err instanceof Error ? err.message : 'Failed to load tool';
  }

  if (error || !detail) {
    return (
      <div>
        <Breadcrumbs
          items={[
            { href: '/tools', label: 'Tools' },
            { label: toolId },
          ]}
        />
        <div className="error">{error ?? 'Tool not found'}</div>
      </div>
    );
  }

  const { tool, deployment_id, grants } = detail;
  const description =
    typeof tool.metadata?.description === 'string'
      ? tool.metadata.description
      : null;
  const activeGrants = grants.filter((g) => g.status === 'ACTIVE');

  return (
    <div className="page-fill">
      <Breadcrumbs
        items={[
          { href: '/tools', label: 'Tools' },
          { label: tool.name },
        ]}
      />
      <div className="page-header">
        <h1 className="page-title">{tool.name}</h1>
        <div className="page-header-subrow">
          <p className="page-lede">
            Capability substrate. Agents reach this tool only through active
            grants; EPA remains the sole decision authority.
          </p>
          <div className="page-header-actions">
            <ToolLifecycleActions toolId={tool.tool_id} status={tool.status} />
          </div>
        </div>
      </div>

      <div className="settings-sections page-fill-scroll">
        <section className="settings-section">
          <div className="settings-section-aside">
            <h2 className="settings-section-title">Identity</h2>
            <p className="settings-section-explainer">
              Deployment-scoped tool identity and lifecycle.
            </p>
          </div>
          <div className="settings-section-data">
            <div className="section-card">
              <div className="contribution-attrs">
                <div className="meridian-attr">
                  <span className="meridian-attr-label">Tool</span>
                  <span className="meridian-attr-value">{tool.name}</span>
                </div>
                <div className="meridian-attr">
                  <span className="meridian-attr-label">Tool ID</span>
                  <span className="meridian-attr-value mono">{tool.tool_id}</span>
                </div>
                {description ? (
                  <div className="meridian-attr">
                    <span className="meridian-attr-label">Description</span>
                    <span className="meridian-attr-value">{description}</span>
                  </div>
                ) : null}
                <div className="meridian-attr">
                  <span className="meridian-attr-label">Deployment</span>
                  <span className="meridian-attr-value mono">{deployment_id}</span>
                </div>
                <div className="meridian-attr">
                  <span className="meridian-attr-label">Status</span>
                  <span className="meridian-attr-value">
                    <StatusBadge showLabel status={tool.status} />
                  </span>
                </div>
                {tool.updated_at ? (
                  <div className="meridian-attr">
                    <span className="meridian-attr-label">Updated</span>
                    <span className="meridian-attr-value mono">
                      {formatDisplayDateTime(tool.updated_at)}
                    </span>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </section>

        <section className="settings-section">
          <div className="settings-section-aside">
            <h2 className="settings-section-title">Supported operations</h2>
            <p className="settings-section-explainer">
              Declared operations for this tool. Grants may only allow a subset.
            </p>
          </div>
          <div className="settings-section-data">
            <div className="section-card">
              {tool.operations.length === 0 ? (
                <p className="muted">No operations declared.</p>
              ) : (
                <ul className="ops-list">
                  {tool.operations.map((op) => (
                    <li key={op} className="mono">
                      {op}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </section>

        <section className="settings-section">
          <div className="settings-section-aside">
            <h2 className="settings-section-title">Authorized agents</h2>
            <p className="settings-section-explainer">
              Agents with an active grant to this tool and their permitted
              operations.
            </p>
          </div>
          <div className="settings-section-data">
            {activeGrants.length === 0 ? (
              <div className="section-card">
                <p className="muted">No agents currently granted access.</p>
              </div>
            ) : (
              activeGrants.map((g) => (
                <div key={g.agent_id} className="section-card" style={{ marginBottom: '0.75rem' }}>
                  <div className="section-card-header">
                    <h3>
                      <Link
                        href={`/agents/${encodeURIComponent(g.agent_id)}`}
                        className="table-link"
                      >
                        {g.agent_name}
                      </Link>{' '}
                      <span className="mono muted">({g.agent_id})</span>
                    </h3>
                    {g.agent_status ? (
                      <StatusBadge showLabel status={g.agent_status} />
                    ) : null}
                  </div>
                  <ul className="ops-list">
                    {g.allowed_operations.length === 0 ? (
                      <li className="muted">No operations granted</li>
                    ) : (
                      g.allowed_operations.map((op) => (
                        <li key={op} className="mono">
                          {op}
                        </li>
                      ))
                    )}
                  </ul>
                </div>
              ))
            )}
            {grants.some((g) => g.status === 'REVOKED') ? (
              <p className="muted" style={{ marginTop: '0.75rem' }}>
                {grants.filter((g) => g.status === 'REVOKED').length} revoked
                grant(s) retained for history.
              </p>
            ) : null}
          </div>
        </section>
      </div>
    </div>
  );
}
