import { adminFetch } from '@/lib/api';

type AppsResponse = {
  applications: Array<{
    application_id: string;
    name: string;
    type: string;
    environment: string;
    status: string;
    trust_level: string;
    allowed_models: string[];
    allowed_datasets: string[];
    allowed_operations: string[];
  }>;
};

export default async function ApplicationsPage() {
  let data: AppsResponse | null = null;
  let error: string | null = null;
  try {
    data = await adminFetch<AppsResponse>('/v1/admin/applications');
  } catch (err) {
    error = err instanceof Error ? err.message : 'Failed to load applications';
  }

  return (
    <div>
      <h1 className="page-title">Applications</h1>
      <p className="page-lede">
        Registered applications and their allowed models, datasets, and operations.
      </p>
      {error ? <div className="error">{error}</div> : null}
      {data ? (
        <div className="panel">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>ID</th>
                <th>Type</th>
                <th>Trust</th>
                <th>Models</th>
                <th>Operations</th>
                <th>Datasets</th>
              </tr>
            </thead>
            <tbody>
              {data.applications.map((app) => (
                <tr key={app.application_id}>
                  <td>
                    <strong>{app.name}</strong>
                    <div className="muted">{app.environment} · {app.status}</div>
                  </td>
                  <td className="mono">{app.application_id}</td>
                  <td>{app.type}</td>
                  <td>
                    <span className="badge badge-neutral">{app.trust_level}</span>
                  </td>
                  <td className="mono">{app.allowed_models.join(', ') || '—'}</td>
                  <td className="mono">{app.allowed_operations.join(', ') || '—'}</td>
                  <td className="mono">{app.allowed_datasets.join(', ') || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
