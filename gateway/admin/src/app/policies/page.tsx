import { adminFetch } from '@/lib/api';
import {
  LegacyRulesEditor,
  PolicyLifecycleActions,
} from '@/components/PolicyLifecycle';

type PacksResponse = {
  packs: Array<{
    pack_id: string;
    name: string;
    domain: string;
    status: string;
  }>;
  policies: Array<{
    policy_id: string;
    name: string;
    status: string;
    version: number;
    pack_id: string;
    phase: string;
    interpreter: string;
  }>;
  engine_mode: string;
};

type StorePoliciesResponse = {
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
  let packs: PacksResponse | null = null;
  let store: StorePoliciesResponse | null = null;
  let error: string | null = null;
  try {
    packs = await adminFetch<PacksResponse>('/v1/admin/policy-packs');
    store = await adminFetch<StorePoliciesResponse>('/v1/admin/policies');
  } catch (err) {
    error = err instanceof Error ? err.message : 'Failed to load policies';
  }

  const storeById = new Map(store?.policies.map((p) => [p.policy_id, p]) ?? []);

  return (
    <div>
      <h1 className="page-title">Policies</h1>
      <p className="page-lede">
        Enigma enterprise policy packs — validate, simulate, activate, and suspend.
        Decisions come from the pack-backed PDP, not from rules JSON.
      </p>
      {packs ? (
        <p className="muted">
          Engine mode: <strong>{packs.engine_mode}</strong>
        </p>
      ) : null}
      {error ? <div className="error">{error}</div> : null}

      {packs ? (
        <div className="stack">
          {packs.packs.map((pack) => {
            const policies = packs.policies.filter((p) => p.pack_id === pack.pack_id);
            return (
              <div className="panel" key={pack.pack_id}>
                <div className="panel-header">
                  {pack.name}{' '}
                  <span className="muted">
                    {pack.domain} · {pack.pack_id}
                  </span>
                </div>
                <p>
                  Pack status:{' '}
                  <span
                    className={`badge ${
                      pack.status === 'active' ? 'badge-ok' : 'badge-bad'
                    }`}
                  >
                    {pack.status}
                  </span>
                </p>
                <div className="stack">
                  {policies.map((p) => {
                    const legacy = storeById.get(p.policy_id);
                    return (
                      <div className="panel nested-panel" key={p.policy_id}>
                        <div className="panel-header">
                          {p.name}{' '}
                          <span className="muted">
                            v{p.version} · {p.phase} · {p.policy_id}
                          </span>
                        </div>
                        <p>
                          Status:{' '}
                          <span
                            className={`badge ${
                              p.status === 'active' ? 'badge-ok' : 'badge-bad'
                            }`}
                          >
                            {p.status}
                          </span>
                          {legacy ? (
                            <span className="muted">
                              {' '}
                              · store {legacy.status}
                            </span>
                          ) : null}
                        </p>
                        {legacy?.summary ? (
                          <p className="muted">{legacy.summary}</p>
                        ) : null}
                        <PolicyLifecycleActions
                          policyId={p.policy_id}
                          status={p.status}
                          interpreter={p.interpreter}
                        />
                        {legacy ? (
                          <LegacyRulesEditor
                            policyId={p.policy_id}
                            rulesJson={JSON.stringify(legacy.rules, null, 2)}
                          />
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
