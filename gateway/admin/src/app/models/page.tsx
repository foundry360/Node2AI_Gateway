import { adminFetch } from '@/lib/api';

type ModelsResponse = {
  models: Array<{
    model_id: string;
    provider_id: string;
    name: string;
    kind: string;
    status: string;
  }>;
  providers: Array<{ provider_id: string; kind: string }>;
};

export default async function ModelsPage() {
  let data: ModelsResponse | null = null;
  let error: string | null = null;
  try {
    data = await adminFetch<ModelsResponse>('/v1/admin/models');
  } catch (err) {
    error = err instanceof Error ? err.message : 'Failed to load models';
  }

  return (
    <div>
      <h1 className="page-title">Models</h1>
      <p className="page-lede">
        Approved model registry and provider adapters. Eligibility is decided by policy first.
      </p>
      {error ? <div className="error">{error}</div> : null}
      {data ? (
        <div className="stack">
          <div className="panel">
            <div className="panel-header">Registered models</div>
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Model ID</th>
                  <th>Provider</th>
                  <th>Kind</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {data.models.map((m) => (
                  <tr key={m.model_id}>
                    <td>
                      <strong>{m.name}</strong>
                    </td>
                    <td className="mono">{m.model_id}</td>
                    <td className="mono">{m.provider_id}</td>
                    <td>{m.kind}</td>
                    <td>
                      <span className="badge badge-ok">{m.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="panel">
            <div className="panel-header">Providers</div>
            <table>
              <thead>
                <tr>
                  <th>Provider</th>
                  <th>Kind</th>
                </tr>
              </thead>
              <tbody>
                {data.providers.map((p) => (
                  <tr key={p.provider_id}>
                    <td className="mono">{p.provider_id}</td>
                    <td>{p.kind}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </div>
  );
}
