import { adminFetch } from '@/lib/api';

type PoliciesResponse = {
  policies: Array<{
    policy_id: string;
    name: string;
    status: string;
    version: number;
    summary: string;
  }>;
};

export default async function PoliciesPage() {
  let data: PoliciesResponse | null = null;
  let error: string | null = null;
  try {
    data = await adminFetch<PoliciesResponse>('/v1/admin/policies');
  } catch (err) {
    error = err instanceof Error ? err.message : 'Failed to load policies';
  }

  return (
    <div>
      <h1 className="page-title">Policies</h1>
      <p className="page-lede">
        Active governance policies. PolicyEngine remains the sole authorization authority.
      </p>
      {error ? <div className="error">{error}</div> : null}
      {data ? (
        <div className="panel">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>ID</th>
                <th>Version</th>
                <th>Status</th>
                <th>Summary</th>
              </tr>
            </thead>
            <tbody>
              {data.policies.map((p) => (
                <tr key={p.policy_id}>
                  <td>
                    <strong>{p.name}</strong>
                  </td>
                  <td className="mono">{p.policy_id}</td>
                  <td>{p.version}</td>
                  <td>
                    <span className="badge badge-ok">{p.status}</span>
                  </td>
                  <td className="muted">{p.summary}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
