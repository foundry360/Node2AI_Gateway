import { adminFetch } from '@/lib/api';
import { ModelActions } from '@/components/AdminForms';
import { EmptyState } from '@/components/EmptyState';
import { ModelRegisterDrawer } from '@/components/ModelRegisterDrawer';
import { PageHeader } from '@/components/PageHeader';
import { StatusBadge } from '@/components/StatusBadge';

type ModelsResponse = {
  models: Array<{
    model_id: string;
    provider_id: string;
    name: string;
    kind: string;
    status: string;
  }>;
  providers: Array<{ provider_id: string; kind: string }>;
};

export default async function ModelsPage() {
  let data: ModelsResponse | null = null;
  let error: string | null = null;
  try {
    data = await adminFetch<ModelsResponse>('/v1/admin/models');
  } catch (err) {
    error = err instanceof Error ? err.message : 'Failed to load models';
  }

  return (
    <div>
      <PageHeader
        title="Models"
        lede="Register local and cloud models. Policy decides eligibility at request time."
        actions={<ModelRegisterDrawer />}
      />
      {error ? <div className="error">{error}</div> : null}
      <div className="settings-sections">
        <section className="settings-section">
          <div className="settings-section-aside">
            <h2 className="settings-section-title">Registered models</h2>
            <p className="settings-section-explainer">
              Models available for policy evaluation and routing at request time.
            </p>
          </div>
          <div className="settings-section-data">
            {!data || data.models.length === 0 ? (
              <EmptyState
                title="No models registered"
                description="Register a model to make it available for policy evaluation."
              />
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Model ID</th>
                    <th>Provider</th>
                    <th>Kind</th>
                    <th>Status</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {data.models.map((m) => (
                    <tr key={m.model_id}>
                      <td>
                        <strong>{m.name}</strong>
                      </td>
                      <td className="mono">{m.model_id}</td>
                      <td className="mono">{m.provider_id}</td>
                      <td>{m.kind}</td>
                      <td>
                        <StatusBadge status={m.status} />
                      </td>
                      <td>
                        <ModelActions modelId={m.model_id} status={m.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>
        <section className="settings-section">
          <div className="settings-section-aside">
            <h2 className="settings-section-title">Providers</h2>
            <p className="settings-section-explainer">
              Inference providers registered with this gateway appliance.
            </p>
          </div>
          <div className="settings-section-data">
            {!data || data.providers.length === 0 ? (
              <EmptyState title="No providers" />
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Provider</th>
                    <th>Kind</th>
                  </tr>
                </thead>
                <tbody>
                  {data.providers.map((p) => (
                    <tr key={p.provider_id}>
                      <td className="mono">{p.provider_id}</td>
                      <td>{p.kind}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
