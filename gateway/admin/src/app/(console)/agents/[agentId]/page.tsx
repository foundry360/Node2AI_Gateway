import Link from 'next/link';
import { adminFetch } from '@/lib/api';
import { Breadcrumbs } from '@/components/Breadcrumbs';
import { StatusBadge } from '@/components/StatusBadge';
import { AgentLifecycleActions } from '@/components/AgentLifecycleActions';
import { AgentToolGrantEditor } from '@/components/AgentToolGrantEditor';
import { GrantToolDrawer } from '@/components/GrantToolDrawer';
import { formatDisplayDateTime } from '@/lib/display-datetime';

type AgentDetail = {
  agent: {
    agent_id: string;
    name: string;
    status: string;
    autonomy_level: string;
    organization_id: string;
    metadata?: Record<string, unknown>;
    created_at?: string;
    updated_at?: string;
  };
  deployment_id: string;
  bindings: Array<{
    application_id: string;
    status: string;
  }>;
  grants: Array<{
    tool_id: string;
    tool_name: string;
    tool_status: string | null;
    tool_operations: string[];
    allowed_operations: string[];
    status: string;
  }>;
};

type AppsResponse = {
  applications: Array<{ application_id: string; name: string }>;
};

type ToolsResponse = {
  tools: Array<{
    tool_id: string;
    name: string;
    status: string;
    operations: string[];
  }>;
};

export default async function AgentDetailPage({
  params,
}: {
  params: { agentId: string };
}) {
  const agentId = decodeURIComponent(params.agentId);
  let detail: AgentDetail | null = null;
  let apps: AppsResponse['applications'] = [];
  let tools: ToolsResponse['tools'] = [];
  let error: string | null = null;

  try {
    const [d, appsRes, toolsRes] = await Promise.all([
      adminFetch<AgentDetail>(`/v1/admin/agents/${encodeURIComponent(agentId)}`),
      adminFetch<AppsResponse>('/v1/admin/applications').catch(() => ({
        applications: [] as AppsResponse['applications'],
      })),
      adminFetch<ToolsResponse>('/v1/admin/tools').catch(() => ({
        tools: [] as ToolsResponse['tools'],
      })),
    ]);
    detail = d;
    apps = appsRes.applications;
    tools = toolsRes.tools.filter((t) => t.status === 'ACTIVE');
  } catch (err) {
    error = err instanceof Error ? err.message : 'Failed to load agent';
  }

  if (error || !detail) {
    return (
      <div>
        <Breadcrumbs
          items={[
            { href: '/agents', label: 'Agents' },
            { label: agentId },
          ]}
        />
        <div className="error">{error ?? 'Agent not found'}</div>
      </div>
    );
  }

  const { agent, deployment_id, bindings, grants } = detail;
  const description =
    typeof agent.metadata?.description === 'string'
      ? agent.metadata.description
      : null;
  const activeGrants = grants.filter((g) => g.status === 'ACTIVE');
  const grantedOps = [
    ...new Set(activeGrants.flatMap((g) => g.allowed_operations)),
  ].sort();
  const appLabel = (id: string) =>
    apps.find((a) => a.application_id === id)?.name ?? id;

  return (
    <div className="page-fill">
      <Breadcrumbs
        items={[
          { href: '/agents', label: 'Agents' },
          { label: agent.name },
        ]}
      />
      <div className="page-header">
        <h1 className="page-title">{agent.name}</h1>
        <div className="page-header-subrow">
          <p className="page-lede">
            Runtime actor substrate. Grants define which tools and operations
            this agent may present; EPA remains the sole decision authority.
          </p>
          <div className="page-header-actions">
            <GrantToolDrawer
              agentId={agent.agent_id}
              tools={tools.map((t) => ({
                tool_id: t.tool_id,
                name: t.name,
                operations: t.operations,
              }))}
            />
            <AgentLifecycleActions
              agentId={agent.agent_id}
              status={agent.status}
            />
          </div>
        </div>
      </div>

      <div className="settings-sections page-fill-scroll">
        <section className="settings-section">
          <div className="settings-section-aside">
            <h2 className="settings-section-title">Identity</h2>
            <p className="settings-section-explainer">
              Deployment-scoped agent identity and application bindings.
            </p>
          </div>
          <div className="settings-section-data">
            <div className="section-card">
              <div className="contribution-attrs">
                <div className="meridian-attr">
                  <span className="meridian-attr-label">Agent</span>
                  <span className="meridian-attr-value">{agent.name}</span>
                </div>
                <div className="meridian-attr">
                  <span className="meridian-attr-label">Agent ID</span>
                  <span className="meridian-attr-value mono">{agent.agent_id}</span>
                </div>
                {description ? (
                  <div className="meridian-attr">
                    <span className="meridian-attr-label">Description</span>
                    <span className="meridian-attr-value">{description}</span>
                  </div>
                ) : null}
                <div className="meridian-attr">
                  <span className="meridian-attr-label">Application</span>
                  <span className="meridian-attr-value">
                    {bindings.length === 0
                      ? '—'
                      : bindings
                          .map(
                            (b) =>
                              `${appLabel(b.application_id)} (${b.status})`,
                          )
                          .join(', ')}
                  </span>
                </div>
                <div className="meridian-attr">
                  <span className="meridian-attr-label">Deployment</span>
                  <span className="meridian-attr-value mono">{deployment_id}</span>
                </div>
                <div className="meridian-attr">
                  <span className="meridian-attr-label">Autonomy</span>
                  <span className="meridian-attr-value">
                    {agent.autonomy_level}
                  </span>
                </div>
                <div className="meridian-attr">
                  <span className="meridian-attr-label">Status</span>
                  <span className="meridian-attr-value">
                    <StatusBadge showLabel status={agent.status} />
                  </span>
                </div>
                {agent.updated_at ? (
                  <div className="meridian-attr">
                    <span className="meridian-attr-label">Updated</span>
                    <span className="meridian-attr-value mono">
                      {formatDisplayDateTime(agent.updated_at)}
                    </span>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </section>

        <section className="settings-section">
          <div className="settings-section-aside">
            <h2 className="settings-section-title">Granted operations</h2>
            <p className="settings-section-explainer">
              Union of operations on active tool grants. An agent may only
              request operations that appear here and on the specific tool grant.
            </p>
          </div>
          <div className="settings-section-data">
            <div className="section-card">
              {grantedOps.length === 0 ? (
                <p className="muted">No granted operations.</p>
              ) : (
                <ul className="ops-list">
                  {grantedOps.map((op) => (
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
            <h2 className="settings-section-title">Tool access</h2>
            <p className="settings-section-explainer">
              Explicit Agent → Tool grants with operation allowlists. Empty
              grants never mean allow-all.
            </p>
          </div>
          <div className="settings-section-data">
            {grants.length === 0 ? (
              <div className="section-card">
                <p className="muted">
                  No tool grants yet.{' '}
                  <span className="muted">Use Grant tool access to add one.</span>
                </p>
              </div>
            ) : (
              grants.map((g) => (
                <div key={g.tool_id} style={{ marginBottom: '1rem' }}>
                  <AgentToolGrantEditor
                    agentId={agent.agent_id}
                    toolId={g.tool_id}
                    toolName={g.tool_name}
                    toolOperations={
                      g.tool_operations.length > 0
                        ? g.tool_operations
                        : g.allowed_operations
                    }
                    grantedOperations={g.allowed_operations}
                    grantStatus={g.status}
                  />
                  <p className="muted" style={{ marginTop: '0.35rem' }}>
                    <Link
                      href={`/tools/${encodeURIComponent(g.tool_id)}`}
                      className="table-link"
                    >
                      View tool
                    </Link>
                    {g.tool_status ? ` · Tool ${g.tool_status}` : null}
                  </p>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
