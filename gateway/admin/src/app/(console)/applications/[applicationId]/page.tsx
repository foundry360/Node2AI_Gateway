import { adminFetch } from '@/lib/api';
import { ApplicationDetailView } from '@/components/ApplicationDetailView';
import type { ProviderCredentialPublic } from '@/components/ProviderCredentialForm';

type AppsResponse = {
  applications: Array<{
    application_id: string;
    organization_id?: string;
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

type Overview = {
  policy: { active_policies: number };
  recent_blocked: Array<{ application_id?: string }>;
};

type ProviderCredentialResponse = {
  configured: boolean;
  provider_credential?: ProviderCredentialPublic;
};

export default async function ApplicationDetailPage({
  params,
}: {
  params: { applicationId: string };
}) {
  const applicationId = params.applicationId;
  let app: AppsResponse['applications'][number] | null = null;
  let keys: KeysResponse['api_keys'] = [];
  let blockedCount = 0;
  let activePolicies = 0;
  let providerCredential: ProviderCredentialPublic | null = null;
  let error: string | null = null;

  try {
    const [appsRes, keysRes, overview, credRes] = await Promise.all([
      adminFetch<AppsResponse>('/v1/admin/applications'),
      adminFetch<KeysResponse>('/v1/admin/api-keys'),
      adminFetch<Overview>('/v1/admin/overview'),
      adminFetch<ProviderCredentialResponse>(
        `/v1/admin/applications/${applicationId}/provider-credential`,
      ).catch(() => ({ configured: false as const })),
    ]);
    app = appsRes.applications.find((a) => a.application_id === applicationId) ?? null;
    keys = keysRes.api_keys.filter((k) => k.application_id === applicationId);
    blockedCount = overview.recent_blocked.filter(
      (e) => e.application_id === applicationId,
    ).length;
    activePolicies = overview.policy.active_policies;
    providerCredential =
      'provider_credential' in credRes ? credRes.provider_credential ?? null : null;
  } catch (err) {
    error = err instanceof Error ? err.message : 'Failed to load application';
  }

  return (
    <div>
      {error ? <div className="error">{error}</div> : null}
      {!error && !app ? (
        <div className="error">Application not found</div>
      ) : null}
      {app ? (
        <ApplicationDetailView
          app={app}
          keys={keys}
          blockedCount={blockedCount}
          activePolicies={activePolicies}
          providerCredential={providerCredential}
        />
      ) : null}
    </div>
  );
}
