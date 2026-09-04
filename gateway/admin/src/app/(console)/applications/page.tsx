import { adminFetch } from '@/lib/api';
import { ApplicationsDirectory } from '@/components/ApplicationsDirectory';

type AppsResponse = {
  applications: Array<{
    application_id: string;
    name: string;
    type: string;
    environment: string;
    status: string;
    trust_level: string;
    allowed_models: string[];
    allowed_operations: string[];
  }>;
};

type KeysResponse = {
  api_keys: Array<{
    api_key_id: string;
    application_id: string;
    status: string;
  }>;
};

/** Applications directory — card/list console for governed apps. */
export default async function ApplicationsPage() {
  let apps: AppsResponse['applications'] = [];
  let keys: KeysResponse['api_keys'] = [];
  let error: string | null = null;

  try {
    const [appsRes, keysRes] = await Promise.all([
      adminFetch<AppsResponse>('/v1/admin/applications'),
      adminFetch<KeysResponse>('/v1/admin/api-keys'),
    ]);
    apps = appsRes.applications;
    keys = keysRes.api_keys;
  } catch (err) {
    error = err instanceof Error ? err.message : 'Failed to load applications';
  }

  const keyCount = new Map<string, number>();
  for (const k of keys) {
    if (k.status !== 'active') continue;
    keyCount.set(k.application_id, (keyCount.get(k.application_id) ?? 0) + 1);
  }

  return (
    <div>
      {error ? <div className="error">{error}</div> : null}
      <ApplicationsDirectory
        applications={apps.map((a) => ({
          ...a,
          key_count: keyCount.get(a.application_id) ?? 0,
        }))}
      />
    </div>
  );
}
