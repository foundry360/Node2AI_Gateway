import Link from 'next/link';
import { adminFetch } from '@/lib/api';
import { EmptyState } from '@/components/EmptyState';
import { ToolRegisterDrawer } from '@/components/ToolRegisterDrawer';
import { ToolRowMenu } from '@/components/ToolRowMenu';
import { PageHeader } from '@/components/PageHeader';
import { StatusBadge } from '@/components/StatusBadge';

type ToolsResponse = {
  tools: Array<{
    tool_id: string;
    name: string;
    status: string;
    organization_id: string;
    operations: string[];
    granted_agent_count?: number;
  }>;
  deployment_id: string;
};

export default async function ToolsPage() {
  let data: ToolsResponse | null = null;
  let error: string | null = null;
  try {
    data = await adminFetch<ToolsResponse>('/v1/admin/tools');
  } catch (err) {
    error = err instanceof Error ? err.message : 'Failed to load tools';
  }

  return (
    <div className="page-fill">
      <PageHeader
        title="Tools"
        lede="Register tools available to this appliance."
        actions={<ToolRegisterDrawer />}
      />
      {error ? <div className="error">{error}</div> : null}
      <div className="settings-sections page-fill-scroll">
        <section className="settings-section">
          <div className="settings-section-aside">
            <h2 className="settings-section-title">Registered tools</h2>
            <p className="settings-section-explainer">
              Tools declare a subset of the platform Action catalog. Active
              status and declared operations do not authorize a request — that
              is decided by policy and recorded on the Decision.
            </p>
          </div>
          <div className="settings-section-data">
            {!data || data.tools.length === 0 ? (
              <EmptyState
                title="No tools registered"
                description="Register a tool to make it available for policy evaluation."
              />
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Tool ID</th>
                    <th>Operations</th>
                    <th>Agents</th>
                    <th>Status</th>
                    <th aria-label="Actions" />
                  </tr>
                </thead>
                <tbody>
                  {data.tools.map((t) => (
                    <tr key={t.tool_id}>
                      <td>
                        <Link
                          href={`/tools/${encodeURIComponent(t.tool_id)}`}
                          className="table-link"
                        >
                          <strong>{t.name}</strong>
                        </Link>
                      </td>
                      <td className="mono">{t.tool_id}</td>
                      <td>
                        {(t.operations ?? []).slice(0, 3).join(', ') || '—'}
                        {(t.operations?.length ?? 0) > 3
                          ? ` +${t.operations.length - 3}`
                          : ''}
                      </td>
                      <td>{t.granted_agent_count ?? 0}</td>
                      <td>
                        <StatusBadge showLabel status={t.status} />
                      </td>
                      <td className="admin-user-actions">
                        <ToolRowMenu
                          tool={{
                            tool_id: t.tool_id,
                            name: t.name,
                            status: t.status,
                            operations: t.operations ?? [],
                          }}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
