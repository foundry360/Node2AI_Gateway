import Link from 'next/link';
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

export default async function PolicyDetailPage({
  params,
}: {
  params: { policyId: string };
}) {
  const policyId = params.policyId;
  let packs: PacksResponse | null = null;
  let store: StorePoliciesResponse | null = null;
  let error: string | null = null;
  try {
    packs = await adminFetch<PacksResponse>('/v1/admin/policy-packs');
    store = await adminFetch<StorePoliciesResponse>('/v1/admin/policies');
  } catch (err) {
    error = err instanceof Error ? err.message : 'Failed to load policy';
  }

  const epa = packs?.policies.find((p) => p.policy_id === policyId);
  const pack = packs?.packs.find((p) => p.pack_id === epa?.pack_id);
  const legacy = store?.policies.find((p) => p.policy_id === policyId);

  return (
    <div>
      <p className="muted">
        <Link href="/policies">← Policies</Link>
      </p>
      <h1 className="page-title">{epa?.name ?? policyId}</h1>
      {error ? <div className="error">{error}</div> : null}
      {!epa ? (
        <div className="error">Policy not found in EPA repository</div>
      ) : (
        <div className="stack">
          <div className="panel">
            <div className="panel-header">Overview</div>
            <p>
              <strong>ID:</strong> {epa.policy_id}
            </p>
            <p>
              <strong>Version:</strong> {epa.version}
            </p>
            <p>
              <strong>Phase:</strong> {epa.phase}
            </p>
            <p>
              <strong>Interpreter:</strong> <code>{epa.interpreter}</code>
            </p>
            <p>
              <strong>Status:</strong>{' '}
              <span className={`badge ${epa.status === 'active' ? 'badge-ok' : 'badge-bad'}`}>
                {epa.status}
              </span>
            </p>
            <p className="muted">Engine mode: {packs?.engine_mode}</p>
          </div>

          <div className="panel">
            <div className="panel-header">Scope / Pack</div>
            <p>
              <strong>Pack:</strong> {pack?.name ?? epa.pack_id} ({pack?.domain})
            </p>
            <p>
              <strong>Pack status:</strong> {pack?.status}
            </p>
          </div>

          <div className="panel">
            <div className="panel-header">Lifecycle</div>
            <PolicyLifecycleActions
              policyId={epa.policy_id}
              status={epa.status}
              interpreter={epa.interpreter}
            />
          </div>

          {legacy ? (
            <div className="panel">
              <div className="panel-header">Legacy store metadata</div>
              <p className="muted">{legacy.summary}</p>
              <LegacyRulesEditor
                policyId={legacy.policy_id}
                rulesJson={JSON.stringify(legacy.rules, null, 2)}
              />
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
