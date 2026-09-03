import { adminFetch } from '@/lib/api';
import {
  ApplicationActions,
  ApiKeyRevoke,
  CreateApplicationForm,
} from '@/components/AdminForms';

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

type KeysResponse = {
  api_keys: Array<{
    api_key_id: string;
    application_id: string;
    key_prefix: string;
    status: string;
  }>;
};

export default async function ApplicationsPage() {
  let data: AppsResponse | null = null;
  let keys: KeysResponse | null = null;
  let error: string | null = null;
  try {
    data = await adminFetch<AppsResponse>('/v1/admin/applications');
    keys = await adminFetch<KeysResponse>('/v1/admin/api-keys');
  } catch (err) {
    error = err instanceof Error ? err.message : 'Failed to load applications';
  }

  return (
    <div>
      <h1 className="page-title">Applications</h1>
      <p className="page-lede">
        Create and manage applications, issue API keys (shown once), and set allowlists.
      </p>
      {error ? <div className="error">{error}</div> : null}
      <div className="stack">
        <div className="panel">
          <CreateApplicationForm />
        </div>
        {data ? (
          <div className="panel">
            <div className="panel-header">Registered applications</div>
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>ID</th>
                  <th>Trust</th>
                  <th>Allowlists</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {data.applications.map((app) => (
                  <tr key={app.application_id}>
                    <td>
                      <strong>{app.name}</strong>
                      <div className="muted">
                        {app.environment} · {app.status} · {app.type}
                      </div>
                    </td>
                    <td className="mono">{app.application_id}</td>
                    <td>
                      <span className="badge badge-neutral">{app.trust_level}</span>
                    </td>
                    <td className="mono">
                      <div>models: {app.allowed_models.join(', ') || '—'}</div>
                      <div>ops: {app.allowed_operations.join(', ') || '—'}</div>
                      <div>datasets: {app.allowed_datasets.join(', ') || '—'}</div>
                    </td>
                    <td>
                      <ApplicationActions
                        applicationId={app.application_id}
                        status={app.status}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
        {keys ? (
          <div className="panel">
            <div className="panel-header">API keys</div>
            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Application</th>
                  <th>Prefix</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {keys.api_keys.map((k) => (
                  <tr key={k.api_key_id}>
                    <td className="mono">{k.api_key_id}</td>
                    <td className="mono">{k.application_id}</td>
                    <td className="mono">{k.key_prefix}…</td>
                    <td>
                      <span
                        className={`badge ${k.status === 'active' ? 'badge-ok' : 'badge-bad'}`}
                      >
                        {k.status}
                      </span>
                    </td>
                    <td>
                      {k.status === 'active' ? <ApiKeyRevoke apiKeyId={k.api_key_id} /> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>
    </div>
  );
}
