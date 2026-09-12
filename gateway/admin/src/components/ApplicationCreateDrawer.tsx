'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { X } from 'lucide-react';
import { proxyJson } from '@/lib/client-api';
import { MultiSelectDropdown } from '@/components/MultiSelectDropdown';
import { SelectDropdown } from '@/components/SelectDropdown';
import { APPLICATION_TYPE_OPTIONS } from '@/lib/application-types';
import { SecretInput } from '@/components/SecretInput';

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
  { value: 'write', label: 'Write' },
];

export function ApplicationCreateDrawer({
  label = '+ New application',
}: {
  label?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [models, setModels] = useState<RegistryModel[]>(FALLBACK_MODELS);
  const [selectedModels, setSelectedModels] = useState<string[]>(['local-general-v1']);
  const [selectedOperations, setSelectedOperations] = useState<string[]>([
    'summarize',
    'generate',
  ]);
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
      setSelectedModels(['local-general-v1']);
      setSelectedOperations(['summarize', 'generate']);
      return;
    }
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
  }, [open]);

  return (
    <>
      <button type="button" className="btn" onClick={() => setOpen(true)}>
        {label}
      </button>

      {open ? (
        <div className="drawer-root" role="presentation">
          <button
            type="button"
            className="drawer-backdrop"
            aria-label="Close create panel"
            onClick={() => setOpen(false)}
          />
          <aside
            className="drawer-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="create-app-title"
          >
            <div className="drawer-header">
              <div>
                <h2 id="create-app-title" className="drawer-title">
                  New application
                </h2>
                <p className="drawer-sub">Register a governed app for gateway access.</p>
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
                  const name = fd.get('name');
                  const created = (await proxyJson('applications', 'POST', {
                    name,
                    type: fd.get('type'),
                    environment: fd.get('environment'),
                    trust_level: fd.get('trust_level'),
                    allowed_models: selectedModels.join(','),
                    allowed_operations: selectedOperations.join(','),
                    provider_kind: fd.get('provider_kind'),
                    provider_endpoint_url: fd.get('provider_endpoint_url'),
                    provider_api_key: fd.get('provider_api_key'),
                    provider_model_map: fd.get('provider_model_map'),
                  })) as { application?: { application_id: string } };
                  form.reset();
                  setSelectedModels(['local-general-v1']);
                  setSelectedOperations(['summarize', 'generate']);
                  setModelsMenuOpen(false);
                  setOperationsMenuOpen(false);
                  setOpen(false);
                  router.refresh();
                  if (created.application?.application_id) {
                    router.push(`/applications/${created.application.application_id}`);
                  }
                } catch (err) {
                  setError(err instanceof Error ? err.message : 'Failed to create');
                } finally {
                  setBusy(false);
                }
              }}
            >
              <div className="drawer-form">
                {error ? <div className="error">{error}</div> : null}

                <label>
                  Name
                  <input name="name" required placeholder="Pilot App" />
                </label>
                <SelectDropdown
                  label="Type"
                  name="type"
                  defaultValue="custom"
                  options={APPLICATION_TYPE_OPTIONS.map((o) => ({
                    value: o.value,
                    label: o.label,
                  }))}
                />
                <SelectDropdown
                  label="Environment"
                  name="environment"
                  defaultValue="prod"
                  options={[
                    { value: 'dev', label: 'Dev' },
                    { value: 'staging', label: 'Staging' },
                    { value: 'prod', label: 'Prod' },
                  ]}
                />
                <SelectDropdown
                  label="Trust level"
                  name="trust_level"
                  defaultValue="standard"
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
                <SelectDropdown
                  label="Provider kind"
                  name="provider_kind"
                  defaultValue="openai_compatible"
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
                  />
                </label>
                <label>
                  Provider API key
                  <SecretInput name="provider_api_key" placeholder="sk-…" />
                </label>
                <label>
                  Provider model map
                  <input
                    name="provider_model_map"
                    placeholder="cloud-public-gpt:gpt-4o-mini"
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
                  {busy ? 'Creating…' : 'Create application'}
                </button>
              </div>
            </form>
          </aside>
        </div>
      ) : null}
    </>
  );
}
