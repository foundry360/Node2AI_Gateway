import { adminFetch } from '@/lib/api';
import { Breadcrumbs } from '@/components/Breadcrumbs';
import { PageHeader } from '@/components/PageHeader';
import { StatusBadge } from '@/components/StatusBadge';
import {
  PolicyDetailView,
  type PolicyDetail,
} from '@/components/PolicyDetailView';

type DetailResponse = Omit<PolicyDetail, 'evaluations'> & {
  evaluations?: PolicyDetail['evaluations'];
};

type EvaluationsResponse = {
  policy_id: string;
  evaluations: PolicyDetail['evaluations'];
};

export default async function PolicyDetailPage({
  params,
}: {
  params: { policyId: string };
}) {
  const policyId = params.policyId;
  let detail: DetailResponse | null = null;
  let evaluations: PolicyDetail['evaluations'] = [];
  let error: string | null = null;

  try {
    detail = await adminFetch<DetailResponse>(`/v1/admin/policies/${policyId}`);
    const ev = await adminFetch<EvaluationsResponse>(
      `/v1/admin/policies/${policyId}/evaluations`,
    );
    evaluations = ev.evaluations ?? [];
  } catch (err) {
    error = err instanceof Error ? err.message : 'Failed to load policy';
  }

  return (
    <div>
      <Breadcrumbs
        items={[
          { href: '/policies', label: 'Policies' },
          { label: detail?.policy.name ?? policyId },
        ]}
      />
      <PageHeader
        title={detail?.policy.name ?? policyId}
        lede={
          detail
            ? `${detail.policy.policy_id} · v${detail.policy.version} · ${detail.policy.phase}`
            : undefined
        }
        actions={
          detail ? <StatusBadge status={detail.policy.status} /> : undefined
        }
      />
      {error ? <div className="error">{error}</div> : null}
      {detail ? (
        <PolicyDetailView detail={{ ...detail, evaluations }} />
      ) : null}
    </div>
  );
}
