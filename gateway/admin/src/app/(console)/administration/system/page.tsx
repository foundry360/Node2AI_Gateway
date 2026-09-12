import { adminFetch } from '@/lib/api';
import { PageHeader } from '@/components/PageHeader';
import {
  SystemSettingsView,
  type SystemResponse,
} from '@/components/SystemSettingsView';

export default async function AdministrationSystemPage() {
  let data: SystemResponse | null = null;
  let error: string | null = null;
  try {
    data = await adminFetch<SystemResponse>('/v1/admin/system');
  } catch (err) {
    error = err instanceof Error ? err.message : 'Failed to load system';
  }

  return (
    <div>
      <PageHeader
        title="System"
        lede="Deployment, license, database, and organization settings for this Enigma appliance."
      />
      <SystemSettingsView data={data} error={error} />
    </div>
  );
}
