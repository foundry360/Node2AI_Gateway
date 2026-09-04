'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { AppWindow, Filter, LayoutGrid, List } from 'lucide-react';
import { ApplicationCardMenu } from '@/components/ApplicationCardMenu';
import { ApplicationCreateDrawer } from '@/components/ApplicationCreateDrawer';
import { EmptyState } from '@/components/EmptyState';
import { PageHeader } from '@/components/PageHeader';

export type AppCard = {
  application_id: string;
  name: string;
  type: string;
  environment: string;
  status: string;
  trust_level: string;
  allowed_models: string[];
  allowed_operations: string[];
  key_count?: number;
};

export function ApplicationsDirectory({
  applications,
  title = 'Applications',
  lede = 'Governed applications that call the Enigma gateway.',
}: {
  applications: AppCard[];
  title?: string;
  lede?: string;
}) {
  const [q, setQ] = useState('');
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const [trust, setTrust] = useState('all');

  const filtered = useMemo(() => {
    return applications.filter((a) => {
      if (a.status === 'suspended') return false;
      if (trust !== 'all' && a.trust_level !== trust) return false;
      if (q.trim()) {
        const needle = q.trim().toLowerCase();
        const hay = `${a.name} ${a.application_id} ${a.type} ${a.environment}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
  }, [applications, q, trust]);

  return (
    <div>
      <PageHeader
        title={title}
        lede={lede}
        actions={
          <>
            <input
              className="control-input"
              placeholder="Search applications"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            <div className="view-toggle" role="group" aria-label="View">
              <button
                type="button"
                className={view === 'grid' ? 'active' : ''}
                onClick={() => setView('grid')}
                aria-label="Grid view"
              >
                <LayoutGrid size={18} strokeWidth={1.75} />
              </button>
              <button
                type="button"
                className={view === 'list' ? 'active' : ''}
                onClick={() => setView('list')}
                aria-label="List view"
              >
                <List size={18} strokeWidth={1.75} />
              </button>
            </div>
            <label
              className="control-input"
              style={{
                minWidth: '8rem',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.4rem',
              }}
            >
              <Filter size={16} strokeWidth={1.75} aria-hidden />
              <select
                value={trust}
                onChange={(e) => setTrust(e.target.value)}
                aria-label="Filter trust"
                style={{
                  border: 'none',
                  background: 'transparent',
                  color: 'inherit',
                  font: 'inherit',
                  width: '100%',
                  padding: 0,
                }}
              >
                <option value="all">Filter</option>
                <option value="trusted">trusted</option>
                <option value="standard">standard</option>
                <option value="untrusted">untrusted</option>
              </select>
            </label>
            <ApplicationCreateDrawer />
          </>
        }
      />

      {filtered.length === 0 ? (
        <EmptyState
          title="No applications"
          description="Create an application to issue API keys and set allowlists."
        />
      ) : view === 'grid' ? (
        <div className="card-grid">
          {filtered.map((app) => (
            <div key={app.application_id} className="entity-card">
              <div className="entity-card-top">
                <Link
                  href={`/applications/${app.application_id}`}
                  className="entity-card-title-row"
                >
                  <span className="entity-icon" aria-hidden>
                    <AppWindow size={16} strokeWidth={1.75} />
                  </span>
                  <span className="entity-card-title">{app.name}</span>
                </Link>
                <ApplicationCardMenu
                  applicationId={app.application_id}
                  name={app.name}
                />
              </div>
              <Link
                href={`/applications/${app.application_id}`}
                className="entity-card-body-link"
              >
                <div className="entity-card-meta entity-card-tags">
                  <span className="tag">{app.type}</span>
                  <span className="tag-sep" aria-hidden>
                    |
                  </span>
                  <span className="tag">{app.trust_level}</span>
                  <span className="tag-sep" aria-hidden>
                    |
                  </span>
                  <span className="tag">{app.environment}</span>
                </div>
                <div className="entity-card-footer">
                  <span className="connected">
                    <span className="status-dot" />
                    {app.status === 'active' ? 'Connected' : app.status}
                  </span>
                  <span>
                    {app.key_count ?? 0} API key{(app.key_count ?? 0) === 1 ? '' : 's'}
                  </span>
                </div>
              </Link>
            </div>
          ))}
        </div>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Type</th>
              <th>Trust</th>
              <th>Status</th>
              <th>Keys</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((app) => (
              <tr key={app.application_id}>
                <td>
                  <Link
                    href={`/applications/${app.application_id}`}
                    className="table-link"
                  >
                    {app.name}
                  </Link>
                  <div className="muted mono">{app.application_id}</div>
                </td>
                <td>
                  {app.type} · {app.environment}
                </td>
                <td>{app.trust_level}</td>
                <td>{app.status}</td>
                <td>{app.key_count ?? 0}</td>
                <td>
                  <ApplicationCardMenu
                    applicationId={app.application_id}
                    name={app.name}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
