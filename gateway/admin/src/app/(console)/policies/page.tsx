import { adminFetch } from '@/lib/api';
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
    <div className="page-fill">
      {error ? <div className="error">{error}</div> : null}
      <PoliciesTable
        packs={packs?.packs ?? []}
        policies={packs?.policies ?? []}
      />
    </div>
  );
}
