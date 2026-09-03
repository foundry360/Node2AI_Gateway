import { adminFetch } from '@/lib/api';
import { PolicyActions } from '@/components/AdminForms';

type PoliciesResponse = {
  policies: Array<{
    policy_id: string;
    name: string;
    status: string;
    version: number;
    summary: string;
    rules: Record<string, unknown>;
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
        Enable/disable is enforced at evaluation time. Rule JSON is operator metadata in v1 —
        binding decisions still come from the deterministic PolicyEngine.
      </p>
      {error ? <div className="error">{error}</div> : null}
      {data ? (
        <div className="stack">
          {data.policies.map((p) => (
            <div className="panel" key={p.policy_id}>
              <div className="panel-header">
                {p.name}{' '}
                <span className="muted">
                  v{p.version} · {p.policy_id}
                </span>
              </div>
              <p className="muted">{p.summary}</p>
              <p>
                Status:{' '}
                <span className={`badge ${p.status === 'active' ? 'badge-ok' : 'badge-bad'}`}>
                  {p.status}
                </span>
              </p>
              <PolicyActions
                policyId={p.policy_id}
                status={p.status}
                rulesJson={JSON.stringify(p.rules, null, 2)}
              />
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
