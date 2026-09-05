'use client';

import {
  ApplicationActions,
  ApiKeyRevoke,
} from '@/components/AdminForms';
import { ApplicationEditDrawer } from '@/components/ApplicationEditDrawer';
import { ApplicationSparklines } from '@/components/ApplicationSparklines';
import { StatusBadge } from '@/components/StatusBadge';

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

type Key = {
  api_key_id: string;
  application_id: string;
  key_prefix: string;
  status: string;
};

export function ApplicationDetailView({
  app,
  keys,
  blockedCount,
  activePolicies,
}: {
  app: App;
  keys: Key[];
  blockedCount: number;
  activePolicies: number;
}) {
  const checklist = [
    { label: 'Application registered', done: true },
    { label: 'Trust level assigned', done: !!app.trust_level },
    { label: 'Model allowlist set', done: app.allowed_models.length > 0 },
    { label: 'API key issued', done: keys.some((k) => k.status === 'active') },
    {
      label: 'Traffic flowing',
      done: blockedCount >= 0 && keys.some((k) => k.status === 'active'),
      pending: !keys.some((k) => k.status === 'active'),
    },
  ];
  const doneCount = checklist.filter((c) => c.done && !c.pending).length;
  const activeKeys = keys.filter((k) => k.status === 'active').length;
  const capitalize = (value: string) =>
    value ? value.charAt(0).toUpperCase() + value.slice(1) : value;

  return (
    <div className="stack">
      <div className="meridian-top">
        <div className="meridian-header">
          <div className="meridian-header-text">
            <h1 className="meridian-title">{app.name}</h1>
          </div>
          <div className="meridian-header-actions">
            <ApplicationEditDrawer app={app} />
            <ApplicationActions applicationId={app.application_id} status={app.status} />
          </div>
        </div>

        <div className="meridian-panel">
          <div className="meridian-panel-left">
            <div className="meridian-card-head">
              <h2 className="meridian-card-title">Governance posture</h2>
              <span className="meridian-pill">Application-wide</span>
            </div>
            <div className="leader-rows">
              <div className="leader-row">
                <span className="leader-label">Active policies</span>
                <span className="leader-dots" aria-hidden />
                <span className="leader-value">{activePolicies}</span>
              </div>
              <div className="leader-row">
                <span className="leader-label">Trust level</span>
                <span className="leader-dots" aria-hidden />
                <span className="leader-value">
                  {app.trust_level ? capitalize(app.trust_level) : '—'}
                </span>
              </div>
              <div className="leader-row">
                <span className="leader-label">Model coverage</span>
                <span className="leader-dots" aria-hidden />
                <span className="leader-value">
                  {app.allowed_models.length > 0
                    ? `${app.allowed_models.length} Allow listed`
                    : 'Not enough data'}
                </span>
              </div>
              <div className="leader-row">
                <span className="leader-label">API keys</span>
                <span className="leader-dots" aria-hidden />
                <span className="leader-value">
                  {keys.length > 0 ? `Connected (${activeKeys})` : 'Not enough data'}
                </span>
              </div>
            </div>
          </div>

          <div className="meridian-panel-right">
            <div className="meridian-attr">
              <span className="meridian-attr-label">Application</span>
              <span className="meridian-attr-value meridian-attr-strong">{app.name}</span>
            </div>
            <div className="meridian-attr">
              <span className="meridian-attr-label">ID</span>
              <span className="meridian-attr-value mono">{app.application_id}</span>
            </div>
            <div className="meridian-attr">
              <span className="meridian-attr-label">Organization</span>
              <span className="meridian-attr-value mono">
                {app.organization_id ?? '—'}
              </span>
            </div>
            <div className="meridian-attr">
              <span className="meridian-attr-label">Type</span>
              <span className="meridian-attr-value">{capitalize(app.type)}</span>
            </div>
            <div className="meridian-attr">
              <span className="meridian-attr-label">Environment</span>
              <span className="meridian-attr-value">{capitalize(app.environment)}</span>
            </div>
            <div className="meridian-attr">
              <span className="meridian-attr-label">Status</span>
              <span className="meridian-attr-value">
                <span
                  className={`status-inline${
                    app.status.toLowerCase() === 'active'
                      ? ' status-inline-active'
                      : app.status.toLowerCase() === 'suspended'
                        ? ' status-inline-suspended'
                        : app.status.toLowerCase() === 'deleted'
                          ? ' status-inline-deleted'
                          : ''
                  }`}
                >
                  <span className="status-dot" aria-hidden />
                  <span className="status-inline-text">
                    {app.status.toLowerCase() === 'active'
                      ? 'Active'
                      : app.status.toLowerCase() === 'suspended'
                        ? 'Suspended'
                        : app.status.toLowerCase() === 'deleted'
                          ? 'Deleted'
                          : app.status.charAt(0).toUpperCase() + app.status.slice(1)}
                  </span>
                </span>
              </span>
            </div>
            <div className="meridian-attr">
              <span className="meridian-attr-label">Trust</span>
              <span className="meridian-attr-value">
                {app.trust_level ? capitalize(app.trust_level) : '—'}
              </span>
            </div>
            <div className="meridian-attr">
              <span className="meridian-attr-label">Datasets</span>
              <span className="meridian-attr-value mono">
                {app.allowed_datasets.join(', ') || '—'}
              </span>
            </div>
            <div className="meridian-attr">
              <span className="meridian-attr-label">Operations</span>
              <span className="meridian-attr-value mono">
                {app.allowed_operations.join(', ') || '—'}
              </span>
            </div>
          </div>
        </div>
      </div>

      <ApplicationSparklines applicationId={app.application_id} />

      <div className="triple-grid">
        <div className="section-card">
          <div className="section-card-header">
            <h3>Checklist</h3>
            <span className="count">
              {doneCount}/{checklist.length}
            </span>
          </div>
          <ul className="check-list">
            {checklist.map((item) => (
              <li
                key={item.label}
                className={item.done && !item.pending ? undefined : 'pending'}
              >
                <span className="check-label">{item.label}</span>
                <span className="check-dots" aria-hidden />
                <span className="check-mark">
                  {item.done && !item.pending ? '✓' : '○'}
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className="section-card">
          <div className="section-card-header">
            <h3>Allowlists</h3>
            <span className="count">{app.allowed_models.length} models</span>
          </div>
          {app.allowed_models.length === 0 ? (
            <p className="muted">No models allowlisted.</p>
          ) : (
            app.allowed_models.map((m) => (
              <div className="list-item" key={m}>
                <span className="mono">{m}</span>
              </div>
            ))
          )}
          <div style={{ marginTop: '0.75rem' }}>
            <div className="muted" style={{ marginBottom: '0.35rem' }}>
              Operations
            </div>
            {app.allowed_operations.map((op) => (
              <div className="list-item" key={op}>
                <span className="mono">{op}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="section-card">
          <div className="section-card-header">
            <h3>API keys</h3>
            <span className="count">{keys.length}</span>
          </div>
          {keys.length === 0 ? (
            <p className="muted">No keys yet. Issue one from Actions.</p>
          ) : (
            keys.map((k) => (
              <div className="list-item" key={k.api_key_id}>
                <div>
                  <div className="mono">{k.key_prefix}…</div>
                  <div className="muted mono">{k.api_key_id}</div>
                </div>
                <div className="action-row">
                  <StatusBadge status={k.status} />
                  {k.status === 'active' ? (
                    <ApiKeyRevoke apiKeyId={k.api_key_id} />
                  ) : null}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
