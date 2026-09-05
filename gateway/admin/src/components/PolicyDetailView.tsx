'use client';

import { useState } from 'react';
import {
  LegacyRulesEditor,
  PolicyLifecycleActions,
  PolicySimulatePanel,
} from '@/components/PolicyLifecycle';
import { EmptyState } from '@/components/EmptyState';
import { StatusBadge } from '@/components/StatusBadge';
import { formatReasonCode, formatReasonCodes } from '@/lib/reason-codes';

type Definition = {
  description: string;
  owner: string;
  priority: number;
  scope_tier: string;
  domain: string;
  subjects: Array<{ type: string; match: string; description: string }>;
  resources: Array<{ type: string; classification?: string; description: string }>;
  actions: Array<{ action: string; effect: string; description: string }>;
  ai_context: Array<{ key: string; constraint: string }>;
  conditions: Array<{ id: string; statement: string }>;
  decisions: Array<{ when: string; decision: string; reason_codes: string[] }>;
  obligations: Array<{ code: string; when: string; description: string }>;
};

export type PolicyDetail = {
  policy: {
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
    scope_tier?: string;
  };
  pack: { pack_id: string; name: string; domain: string; status: string } | null;
  definition: Definition | null;
  store: {
    policy_id: string;
    summary: string;
    rules: Record<string, unknown>;
    status: string;
    version: number;
  } | null;
  versions: Array<{
    policy_id: string;
    version: number;
    status: string;
    created_at: string | null;
    created_by: string | null;
    source: string;
  }>;
  evaluations: Array<{
    audit_id: string;
    timestamp: string;
    request_id: string;
    application_id?: string;
    operation?: string;
    policy_decision?: string;
    response_decision?: string;
    reason_codes?: string[];
    data_classification?: string;
  }>;
  engine_mode: string;
};

const TABS = [
  'Overview',
  'Scope',
  'Subjects',
  'Resources',
  'Actions',
  'AI Context',
  'Conditions',
  'Decisions',
  'Obligations',
  'Versions',
  'Evidence',
  'Simulate',
] as const;

type Tab = (typeof TABS)[number];

export function PolicyDetailView({ detail }: { detail: PolicyDetail }) {
  const [tab, setTab] = useState<Tab>('Overview');
  const { policy, pack, definition, store, versions, evaluations, engine_mode } =
    detail;
  const domain = policy.domain ?? pack?.domain ?? definition?.domain;
  const domainLabel = domain
    ? domain.charAt(0).toUpperCase() + domain.slice(1)
    : '—';

  return (
    <div className="stack">
      <div className="panel">
        <div className="panel-header">Lifecycle</div>
        <div className="panel-pad">
          <PolicyLifecycleActions
            policyId={policy.policy_id}
            status={policy.status}
            interpreter={policy.interpreter}
          />
        </div>
      </div>

      <div className="tabs" role="tablist">
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t}
            className={`tab${tab === t ? ' tab-active' : ''}`}
            onClick={() => setTab(t)}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="tab-panel">
        <div className="panel-pad" style={{ paddingLeft: 0, paddingRight: 0 }}>
          {tab === 'Overview' ? (
            <dl className="definition-list">
              <dt>ID</dt>
              <dd className="mono">{policy.policy_id}</dd>
              <dt>Version</dt>
              <dd className="mono">v{policy.version}</dd>
              <dt>Status</dt>
              <dd>
                <StatusBadge status={policy.status} />
              </dd>
              <dt>Phase</dt>
              <dd>{policy.phase}</dd>
              <dt>Interpreter</dt>
              <dd className="mono">{policy.interpreter}</dd>
              <dt>Owner</dt>
              <dd>{policy.owner ?? definition?.owner ?? '—'}</dd>
              <dt>Priority</dt>
              <dd className="mono">{policy.priority ?? definition?.priority ?? '—'}</dd>
              <dt>Description</dt>
              <dd>{policy.description ?? definition?.description ?? '—'}</dd>
              <dt>Engine</dt>
              <dd className="mono">{engine_mode}</dd>
            </dl>
          ) : null}

          {tab === 'Scope' ? (
            <dl className="definition-list">
              <dt>Pack</dt>
              <dd>
                {pack?.name ?? policy.pack_id}{' '}
                {pack ? <StatusBadge status={pack.status} /> : null}
              </dd>
              <dt>Pack ID</dt>
              <dd className="mono">{policy.pack_id}</dd>
              <dt>Domain</dt>
              <dd>{domainLabel}</dd>
              <dt>Scope tier</dt>
              <dd>{policy.scope_tier ?? definition?.scope_tier ?? '—'}</dd>
            </dl>
          ) : null}

          {tab === 'Subjects' ? (
            <DefinitionTable
              empty="No subject matchers in definition"
              columns={['Type', 'Match', 'Description']}
              rows={(definition?.subjects ?? []).map((s) => [
                s.type,
                s.match,
                s.description,
              ])}
            />
          ) : null}

          {tab === 'Resources' ? (
            <DefinitionTable
              empty="No resource matchers in definition"
              columns={['Type', 'Classification', 'Description']}
              rows={(definition?.resources ?? []).map((r) => [
                r.type,
                r.classification ?? '—',
                r.description,
              ])}
            />
          ) : null}

          {tab === 'Actions' ? (
            <DefinitionTable
              empty="No actions in definition"
              columns={['Action', 'Effect', 'Description']}
              rows={(definition?.actions ?? []).map((a) => [
                a.action,
                a.effect,
                a.description,
              ])}
            />
          ) : null}

          {tab === 'AI Context' ? (
            <DefinitionTable
              empty="No AI context constraints"
              columns={['Key', 'Constraint']}
              rows={(definition?.ai_context ?? []).map((a) => [
                a.key,
                a.constraint,
              ])}
            />
          ) : null}

          {tab === 'Conditions' ? (
            <DefinitionTable
              empty="No conditions in definition"
              columns={['ID', 'Statement']}
              rows={(definition?.conditions ?? []).map((c) => [
                c.id,
                c.statement,
              ])}
            />
          ) : null}

          {tab === 'Decisions' ? (
            <DefinitionTable
              empty="No decision matrix entries"
              columns={['When', 'Decision', 'Reason codes']}
              rows={(definition?.decisions ?? []).map((d) => [
                d.when,
                d.decision,
                d.reason_codes.map((c) => formatReasonCode(c)).join(', '),
              ])}
            />
          ) : null}

          {tab === 'Obligations' ? (
            <DefinitionTable
              empty="No obligations in definition"
              columns={['Code', 'When', 'Description']}
              rows={(definition?.obligations ?? []).map((o) => [
                o.code,
                o.when,
                o.description,
              ])}
            />
          ) : null}

          {tab === 'Versions' ? (
            versions.length === 0 ? (
              <EmptyState title="No version history" />
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Version</th>
                    <th>Status</th>
                    <th>Source</th>
                    <th>Created</th>
                    <th>By</th>
                  </tr>
                </thead>
                <tbody>
                  {versions.map((v) => (
                    <tr key={`${v.source}-${v.policy_id}-${v.version}`}>
                      <td className="mono">v{v.version}</td>
                      <td>
                        <StatusBadge status={v.status} />
                      </td>
                      <td className="mono">{v.source}</td>
                      <td className="mono">{v.created_at ?? '—'}</td>
                      <td className="mono">{v.created_by ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )
          ) : null}

          {tab === 'Evidence' ? (
            evaluations.length === 0 ? (
              <EmptyState
                title="No policy-linked evaluations yet"
                description="Audit events that reference this policy_id will appear here."
              />
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>Request</th>
                    <th>Decision</th>
                    <th>Classification</th>
                    <th>Reasons</th>
                  </tr>
                </thead>
                <tbody>
                  {evaluations.map((e) => (
                    <tr key={e.audit_id}>
                      <td className="mono">{e.timestamp}</td>
                      <td className="mono">{e.request_id}</td>
                      <td>
                        <StatusBadge
                          status={e.policy_decision ?? e.response_decision ?? '—'}
                        />
                      </td>
                      <td>{e.data_classification ?? '—'}</td>
                      <td>
                        {formatReasonCodes(e.reason_codes) || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )
          ) : null}

          {tab === 'Simulate' ? <PolicySimulatePanel policyId={policy.policy_id} /> : null}
        </div>
      </div>

      {store ? (
        <div className="panel">
          <div className="panel-header">Advanced — legacy store metadata</div>
          <div className="panel-pad stack-tight">
            <p className="muted">{store.summary || 'No summary'}</p>
            <LegacyRulesEditor
              policyId={store.policy_id}
              rulesJson={JSON.stringify(store.rules, null, 2)}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}

function DefinitionTable({
  columns,
  rows,
  empty,
}: {
  columns: string[];
  rows: string[][];
  empty: string;
}) {
  if (rows.length === 0) {
    return <EmptyState title={empty} />;
  }
  return (
    <table>
      <thead>
        <tr>
          {columns.map((c) => (
            <th key={c}>{c}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          <tr key={i}>
            {row.map((cell, j) => (
              <td key={j} className={j === 0 ? 'mono' : undefined}>
                {cell}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
