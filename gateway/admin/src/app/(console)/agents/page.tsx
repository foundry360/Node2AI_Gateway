import Link from 'next/link';
import { adminFetch } from '@/lib/api';
import { EmptyState } from '@/components/EmptyState';
import { AgentRegisterDrawer } from '@/components/AgentRegisterDrawer';
import { AgentLifecycleActions } from '@/components/AgentLifecycleActions';
import { PageHeader } from '@/components/PageHeader';
import { StatusBadge } from '@/components/StatusBadge';

type AgentsResponse = {
  agents: Array<{
    agent_id: string;
    name: string;
    status: string;
    autonomy_level: string;
    organization_id: string;
    application_ids?: string[];
    granted_tool_count?: number;
  }>;
  deployment_id: string;
};

type AppsResponse = {
  applications: Array<{
    application_id: string;
    name: string;
    organization_id: string;
  }>;
};

export default async function AgentsPage() {
  let data: AgentsResponse | null = null;
  let apps: AppsResponse['applications'] = [];
  let error: string | null = null;
  try {
    const [agentsRes, appsRes] = await Promise.all([
      adminFetch<AgentsResponse>('/v1/admin/agents'),
      adminFetch<AppsResponse>('/v1/admin/applications').catch(() => ({
        applications: [] as AppsResponse['applications'],
      })),
    ]);
    data = agentsRes;
    apps = appsRes.applications;
  } catch (err) {
    error = err instanceof Error ? err.message : 'Failed to load agents';
  }

  const appName = (id: string) =>
    apps.find((a) => a.application_id === id)?.name ?? id;

  return (
    <div className="page-fill">
      <PageHeader
        title="Agents"
        lede="Register runtime actors available to this appliance."
        actions={<AgentRegisterDrawer applications={apps} />}
      />
      {error ? <div className="error">{error}</div> : null}
      <div className="settings-sections page-fill-scroll">
        <section className="settings-section">
          <div className="settings-section-aside">
            <h2 className="settings-section-title">Registered agents</h2>
            <p className="settings-section-explainer">
              Available agent substrate. Registration and active status do not
              authorize an action; that is decided by policy and recorded on
              the Decision.
            </p>
          </div>
          <div className="settings-section-data">
            {!data || data.agents.length === 0 ? (
              <EmptyState
                title="No agents registered"
                description="Register an agent to make it available for policy evaluation."
              />
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Agent ID</th>
                    <th>Application</th>
                    <th>Tools</th>
                    <th>Status</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {data.agents.map((a) => {
                    const appsLabel =
                      (a.application_ids ?? []).map(appName).join(', ') || '—';
                    return (
                      <tr key={a.agent_id}>
                        <td>
                          <Link
                            href={`/agents/${encodeURIComponent(a.agent_id)}`}
                            className="table-link"
                          >
                            <strong>{a.name}</strong>
                          </Link>
                        </td>
                        <td className="mono">{a.agent_id}</td>
                        <td>{appsLabel}</td>
                        <td>{a.granted_tool_count ?? 0}</td>
                        <td>
                          <StatusBadge showLabel status={a.status} />
                        </td>
                        <td>
                          <AgentLifecycleActions
                            agentId={a.agent_id}
                            status={a.status}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
