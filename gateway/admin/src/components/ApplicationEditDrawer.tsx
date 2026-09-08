'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { X } from 'lucide-react';
import { proxyJson } from '@/lib/client-api';
import { MultiSelectDropdown } from '@/components/MultiSelectDropdown';
import { SelectDropdown } from '@/components/SelectDropdown';
import { APPLICATION_TYPE_OPTIONS } from '@/lib/application-types';
import type { ProviderCredentialPublic } from '@/components/ProviderCredentialForm';
import { SecretInput } from '@/components/SecretInput';

type App = {
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
};

type RegistryModel = {
  model_id: string;
  name: string;
  kind: string;
  status: string;
};

const FALLBACK_MODELS: RegistryModel[] = [
  {
    model_id: 'local-general-v1',
    name: 'Local General v1',
    kind: 'local',
    status: 'active',
  },
  {
    model_id: 'cloud-public-gpt',
    name: 'Approved External GPT',
    kind: 'cloud',
    status: 'active',
  },
];

const OPERATION_OPTIONS = [
  { value: 'summarize', label: 'Summarize' },
  { value: 'generate', label: 'Generate' },
  { value: 'classify', label: 'Classify' },
];

export function ApplicationEditDrawer({
  app,
  providerCredential,
}: {
  app: App;
  providerCredential: ProviderCredentialPublic | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [models, setModels] = useState<RegistryModel[]>(FALLBACK_MODELS);
  const [selectedModels, setSelectedModels] = useState<string[]>(app.allowed_models);
  const [selectedOperations, setSelectedOperations] = useState<string[]>(
    app.allowed_operations,
  );
  const [modelsMenuOpen, setModelsMenuOpen] = useState(false);
  const [operationsMenuOpen, setOperationsMenuOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (modelsMenuOpen) {
          setModelsMenuOpen(false);
          return;
        }
        if (operationsMenuOpen) {
          setOperationsMenuOpen(false);
          return;
        }
        setOpen(false);
      }
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, modelsMenuOpen, operationsMenuOpen]);

  useEffect(() => {
    if (!open) {
      setModelsMenuOpen(false);
      setOperationsMenuOpen(false);
      setSelectedModels(app.allowed_models);
      setSelectedOperations(app.allowed_operations);
      setError(null);
      return;
    }
    setSelectedModels(app.allowed_models);
    setSelectedOperations(app.allowed_operations);
    let cancelled = false;
    (async () => {
      try {
        const data = (await proxyJson('models', 'GET')) as {
          models?: RegistryModel[];
        };
        const active = (data.models ?? []).filter((m) => m.status === 'active');
        if (!cancelled && active.length > 0) setModels(active);
      } catch {
        if (!cancelled) setModels(FALLBACK_MODELS);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, app.allowed_models, app.allowed_operations]);

  return (
    <>
      <button type="button" className="btn btn-secondary" onClick={() => setOpen(true)}>
        Edit
      </button>

      {open ? (
        <div className="drawer-root" role="presentation">
          <button
            type="button"
            className="drawer-backdrop"
            aria-label="Close edit panel"
            onClick={() => setOpen(false)}
          />
          <aside
            className="drawer-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby={`edit-app-${app.application_id}`}
          >
            <div className="drawer-header">
              <div>
                <h2 id={`edit-app-${app.application_id}`} className="drawer-title">
                  Edit application
                </h2>
                <p className="drawer-sub mono">{app.application_id}</p>
              </div>
              <button
                type="button"
                className="icon-btn"
                aria-label="Close"
                onClick={() => setOpen(false)}
              >
                <X size={18} strokeWidth={1.75} />
              </button>
            </div>

            <form
              className="drawer-shell"
              onSubmit={async (e) => {
                e.preventDefault();
                const form = e.currentTarget;
                const fd = new FormData(form);
                if (selectedModels.length === 0) {
                  setError('Select at least one allowed model');
                  return;
                }
                if (selectedOperations.length === 0) {
                  setError('Select at least one allowed operation');
                  return;
                }
                setBusy(true);
                setError(null);
                try {
                  await proxyJson(`applications/${app.application_id}`, 'PATCH', {
                    name: fd.get('name'),
                    type: fd.get('type'),
                    environment: fd.get('environment'),
                    status: fd.get('status'),
                    trust_level: fd.get('trust_level'),
                    allowed_models: selectedModels.join(','),
                    allowed_operations: selectedOperations.join(','),
                  });

                  const providerApiKey = String(fd.get('provider_api_key') ?? '').trim();
                  const providerEndpoint = String(
                    fd.get('provider_endpoint_url') ?? '',
                  ).trim();
                  if (providerApiKey) {
                    await proxyJson(
                      `applications/${app.application_id}/provider-credential`,
                      'PUT',
                      {
                        provider_kind: fd.get('provider_kind'),
                        endpoint_url:
                          providerEndpoint ||
                          providerCredential?.endpoint_url ||
                          'https://api.openai.com',
                        api_key: providerApiKey,
                        model_map: fd.get('provider_model_map'),
                      },
                    );
                  }

                  setOpen(false);
                  router.refresh();
                } catch (err) {
                  setError(err instanceof Error ? err.message : 'Failed to save');
                } finally {
                  setBusy(false);
                }
              }}
            >
              <div className="drawer-form">
                {error ? <div className="error">{error}</div> : null}

                <label>
                  Name
                  <input name="name" required defaultValue={app.name} />
                </label>
                <SelectDropdown
                  label="Type"
                  name="type"
                  defaultValue={
                    APPLICATION_TYPE_OPTIONS.some((o) => o.value === app.type)
                      ? app.type
                      : 'custom'
                  }
                  options={APPLICATION_TYPE_OPTIONS.map((o) => ({
                    value: o.value,
                    label: o.label,
                  }))}
                />
                <SelectDropdown
                  label="Environment"
                  name="environment"
                  defaultValue={app.environment}
                  options={[
                    { value: 'dev', label: 'Dev' },
                    { value: 'staging', label: 'Staging' },
                    { value: 'prod', label: 'Prod' },
                  ]}
                />
                <SelectDropdown
                  label="Status"
                  name="status"
                  defaultValue={app.status}
                  options={[
                    { value: 'active', label: 'Active' },
                    { value: 'suspended', label: 'Suspended' },
                  ]}
                />
                <SelectDropdown
                  label="Trust level"
                  name="trust_level"
                  defaultValue={app.trust_level}
                  options={[
                    { value: 'trusted', label: 'Trusted' },
                    { value: 'standard', label: 'Standard' },
                    { value: 'untrusted', label: 'Untrusted' },
                  ]}
                />
                <MultiSelectDropdown
                  label="Allowed models"
                  placeholder="Select models…"
                  options={models.map((m) => ({
                    value: m.model_id,
                    label: `${m.name} (${m.kind.charAt(0).toUpperCase()}${m.kind.slice(1)})`,
                  }))}
                  selected={selectedModels}
                  onChange={setSelectedModels}
                  open={modelsMenuOpen}
                  onOpenChange={(next) => {
                    setModelsMenuOpen(next);
                    if (next) setOperationsMenuOpen(false);
                  }}
                />
                <MultiSelectDropdown
                  label="Allowed operations"
                  placeholder="Select operations…"
                  options={OPERATION_OPTIONS}
                  selected={selectedOperations}
                  onChange={setSelectedOperations}
                  open={operationsMenuOpen}
                  onOpenChange={(next) => {
                    setOperationsMenuOpen(next);
                    if (next) setModelsMenuOpen(false);
                  }}
                />
                <p className="muted" style={{ marginBottom: 0 }}>
                  <strong>Model provider credentials</strong>
                </p>
                {providerCredential ? (
                  <p className="muted" style={{ marginTop: 0 }}>
                    Configured: <span className="mono">…{providerCredential.api_key_last4}</span>{' '}
                    → <span className="mono">{providerCredential.endpoint_url}</span>
                  </p>
                ) : null}
                <SelectDropdown
                  label="Provider kind"
                  name="provider_kind"
                  defaultValue={
                    providerCredential?.provider_kind ?? 'openai_compatible'
                  }
                  options={[
                    { value: 'openai_compatible', label: 'OpenAI compatible' },
                    { value: 'custom', label: 'Custom' },
                  ]}
                />
                <label>
                  Provider endpoint URL
                  <input
                    name="provider_endpoint_url"
                    placeholder="https://api.openai.com"
                    defaultValue={providerCredential?.endpoint_url ?? ''}
                  />
                </label>
                <label>
                  Provider API key
                  <SecretInput
                    name="provider_api_key"
                    placeholder={providerCredential ? undefined : 'sk-…'}
                    defaultValue={providerCredential?.api_key ?? ''}
                    defaultVisible={!providerCredential?.api_key}
                  />
                </label>
                <label>
                  Provider model map
                  <input
                    name="provider_model_map"
                    placeholder="cloud-public-gpt:gpt-4o-mini"
                    defaultValue={
                      providerCredential &&
                      Object.keys(providerCredential.model_map).length > 0
                        ? Object.entries(providerCredential.model_map)
                            .map(([k, v]) => `${k}:${v}`)
                            .join(', ')
                        : undefined
                    }
                  />
                </label>
              </div>

              <div className="drawer-actions">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setOpen(false)}
                  disabled={busy}
                >
                  Cancel
                </button>
                <button type="submit" className="btn" disabled={busy}>
                  {busy ? 'Saving…' : 'Save changes'}
                </button>
              </div>
            </form>
          </aside>
        </div>
      ) : null}
    </>
  );
}
