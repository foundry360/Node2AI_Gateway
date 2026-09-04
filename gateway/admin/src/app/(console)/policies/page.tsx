import { adminFetch } from '@/lib/api';
import { PageHeader } from '@/components/PageHeader';
import { PoliciesTable } from '@/components/PoliciesTable';

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
    description?: string;
    owner?: string;
    priority?: number;
    domain?: string;
  }>;
  engine_mode: string;
};

export default async function PoliciesPage() {
  let packs: PacksResponse | null = null;
  let error: string | null = null;
  try {
    packs = await adminFetch<PacksResponse>('/v1/admin/policy-packs');
  } catch (err) {
    error = err instanceof Error ? err.message : 'Failed to load policies';
  }

  return (
    <div>
      <PageHeader
        title="Policies"
        lede="Enterprise policy packs — open a policy to validate, simulate, approve, activate, suspend, or retire. Binding decisions come from the pack-backed PDP."
      />
      {packs ? (
        <p className="muted" style={{ marginTop: '-0.75rem', marginBottom: '1rem' }}>
          Engine mode: <strong className="mono">{packs.engine_mode}</strong>
        </p>
      ) : null}
      {error ? <div className="error">{error}</div> : null}
      {packs ? (
        <PoliciesTable packs={packs.packs} policies={packs.policies} />
      ) : null}
    </div>
  );
}
