'use client';

import Link from 'next/link';
import { useState, type ReactNode } from 'react';
import {
  PolicyLifecycleActions,
  PolicySimulatePanel,
} from '@/components/PolicyLifecycle';
import { EmptyState } from '@/components/EmptyState';
import { StatusBadge } from '@/components/StatusBadge';
import { formatDomainLabel } from '@/lib/domain-label';
import { formatDisplayDateTime } from '@/lib/display-datetime';
import { formatFieldLabel } from '@/lib/field-label';
import { formatClassificationLabel } from '@/lib/classification-label';
import { formatReasonCode } from '@/lib/reason-codes';

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

/** Summary row from policy_evaluations (not audit events). */
export type PolicyEvaluationSummary = {
  evaluation_id: string;
  created_at: string;
  decision: string;
  phase: string;
  status: string;
  request_id?: string;
  action?: string;
  resolution_category?: string;
  contributing_pack_ids: string[];
  policy_ids?: string[];
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
  evaluations: PolicyEvaluationSummary[];
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
  'Evaluations',
  'Simulate',
] as const;

type Tab = (typeof TABS)[number];

function capitalize(value: string) {
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : value;
}

function uniqueLabels(values: Array<string | undefined | null>) {
  return Array.from(
    new Set(values.map((v) => (v ?? '').trim()).filter(Boolean)),
  );
}

function TabIntro({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="policy-tab-intro">
      <h3>{title}</h3>
      <p>{children}</p>
    </div>
  );
}

function ChipList({ items, empty = '-' }: { items: string[]; empty?: string }) {
  if (items.length === 0) return <span className="muted">{empty}</span>;
  return (
    <>
      {items.map((item) => (
        <span key={item} className="policy-chip">
          {item}
        </span>
      ))}
    </>
  );
}

function DefinitionValue({ children }: { children: ReactNode }) {
  return <div className="definition-value">{children}</div>;
}

function ReasonCodeList({ codes }: { codes: string[] }) {
  if (codes.length === 0) return <span className="muted">-</span>;
  return (
    <span title={codes.join(', ')}>
      {codes.map((code) => formatReasonCode(code)).join(', ')}
    </span>
  );
}

export function PolicyDetailView({ detail }: { detail: PolicyDetail }) {
  const [tab, setTab] = useState<Tab>('Overview');
  const { policy, pack, definition, versions, evaluations, engine_mode } =
    detail;
  const domainLabel = formatDomainLabel(
    policy.domain ?? pack?.domain ?? definition?.domain,
  );
  const description =
    policy.description ?? definition?.description ?? 'No description provided.';
  const owner = policy.owner ?? definition?.owner ?? '-';
  const priority = policy.priority ?? definition?.priority ?? '-';
  const scopeTier = policy.scope_tier ?? definition?.scope_tier ?? '-';

  const subjects = definition?.subjects ?? [];
  const resources = definition?.resources ?? [];
  const actions = definition?.actions ?? [];
  const aiContext = definition?.ai_context ?? [];
  const conditions = definition?.conditions ?? [];
  const decisions = definition?.decisions ?? [];
  const obligations = definition?.obligations ?? [];

  const subjectTypes = uniqueLabels(subjects.map((s) => formatFieldLabel(s.type)));
  const resourceTypes = uniqueLabels(resources.map((r) => formatFieldLabel(r.type)));
  const classifications = uniqueLabels(
    resources
      .map((r) => r.classification)
      .flatMap((c) => (c ? c.split('|') : []))
      .map((c) => formatClassificationLabel(c)),
  );
  const actionEffects = uniqueLabels(actions.map((a) => a.effect));

  return (
    <div className="stack">
      <div className="meridian-top">
        <div className="meridian-header">
          <div className="meridian-header-text">
            <div className="policy-detail-title-row">
              <h1 className="meridian-title">{policy.name}</h1>
            </div>
            <p className="meridian-lede">{description}</p>
          </div>
          <div className="meridian-header-actions">
            <PolicyLifecycleActions
              policyId={policy.policy_id}
              status={policy.status}
            />
          </div>
        </div>

        <div className="meridian-panel">
          <div className="meridian-panel-left">
            <div className="meridian-card-head">
              <h2 className="meridian-card-title">Policy Identity</h2>
              <span className="meridian-pill">Authoritative</span>
            </div>
            <div className="leader-rows">
              <div className="leader-row">
                <span className="leader-label">Status</span>
                <span className="leader-dots" aria-hidden />
                <span className="leader-value">
                  <StatusBadge showLabel status={policy.status} />
                </span>
              </div>
              <div className="leader-row">
                <span className="leader-label">Phase</span>
                <span className="leader-dots" aria-hidden />
                <span className="leader-value">{capitalize(policy.phase)}</span>
              </div>
              <div className="leader-row">
                <span className="leader-label">Version</span>
                <span className="leader-dots" aria-hidden />
                <span className="leader-value mono">v{policy.version}</span>
              </div>
              <div className="leader-row">
                <span className="leader-label">Priority</span>
                <span className="leader-dots" aria-hidden />
                <span className="leader-value mono">{priority}</span>
              </div>
              <div className="leader-row">
                <span className="leader-label">Owner</span>
                <span className="leader-dots" aria-hidden />
                <span className="leader-value">{owner}</span>
              </div>
              <div className="leader-row">
                <span className="leader-label">Interpreter</span>
                <span className="leader-dots" aria-hidden />
                <span className="leader-value mono">{policy.interpreter}</span>
              </div>
            </div>
          </div>

          <div className="meridian-panel-right">
            <div className="meridian-attr">
              <span className="meridian-attr-label">Policy ID</span>
              <span className="meridian-attr-value mono">{policy.policy_id}</span>
            </div>
            <div className="meridian-attr">
              <span className="meridian-attr-label">Domain</span>
              <span className="meridian-attr-value">{domainLabel}</span>
            </div>
            <div className="meridian-attr">
              <span className="meridian-attr-label">Pack</span>
              <span className="meridian-attr-value pack-status-inline">
                <span>{pack?.name ?? policy.pack_id}</span>
                {pack ? (
                  <StatusBadge variant="badge" status={pack.status} />
                ) : null}
              </span>
            </div>
            <div className="meridian-attr">
              <span className="meridian-attr-label">Scope Tier</span>
              <span className="meridian-attr-value">{scopeTier}</span>
            </div>
            <div className="meridian-attr">
              <span className="meridian-attr-label">Engine</span>
              <span className="meridian-attr-value mono">{engine_mode}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="console-tabs-bar">
        <div className="tabs" role="tablist" aria-label="Policy sections">
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
      </div>

      <div className="section-card policy-detail-tab-panel">
        {tab === 'Overview' ? (
          <div className="policy-detail-overview">
            <div className="policy-detail-overview-block">
              <h3>Applicability</h3>
              <dl className="definition-list">
                <dt>Domain</dt>
                <dd>{domainLabel}</dd>
                <dt>Scope Tier</dt>
                <dd>{formatFieldLabel(String(scopeTier))}</dd>
                <dt>Phase</dt>
                <dd>{capitalize(policy.phase)}</dd>
                <dt>Pack</dt>
                <dd>{pack?.name ?? policy.pack_id}</dd>
                <dt>Classifications</dt>
                <dd>
                  <DefinitionValue>
                    {classifications.length ? (
                      classifications.join(', ')
                    ) : (
                      <span className="muted">No classification matchers</span>
                    )}
                  </DefinitionValue>
                </dd>
              </dl>
            </div>

            {decisions.length > 0 ? (
              <div className="policy-detail-overview-block">
                <h3>Decision Paths</h3>
                <table>
                  <thead>
                    <tr>
                      <th>When</th>
                      <th>Decision</th>
                      <th>Reason Codes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {decisions.map((d) => (
                      <tr key={`${d.when}-${d.decision}`}>
                        <td>{d.when}</td>
                        <td>
                          <StatusBadge variant="badge" status={d.decision} />
                        </td>
                        <td>
                          <ReasonCodeList codes={d.reason_codes} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}

            {obligations.length > 0 ? (
              <div className="policy-detail-overview-block">
                <h3>Controls & Obligations</h3>
                <table>
                  <thead>
                    <tr>
                      <th>Code</th>
                      <th>When</th>
                      <th>Description</th>
                    </tr>
                  </thead>
                  <tbody>
                    {obligations.map((o) => (
                      <tr key={o.code}>
                        <td>{formatReasonCode(o.code)}</td>
                        <td>{o.when}</td>
                        <td>{o.description}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}

            <div className="policy-detail-overview-block">
              <h3>Recent Evaluations</h3>
              {evaluations.length === 0 ? (
                <p className="muted">
                  No recorded decisions yet for this policy. Traffic evaluations will appear
                  under Evaluations.
                </p>
              ) : (
                <table>
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Phase</th>
                      <th>Decision</th>
                      <th>Action</th>
                      <th>Resolution</th>
                      <th>ID</th>
                    </tr>
                  </thead>
                  <tbody>
                    {evaluations.slice(0, 5).map((e) => (
                      <tr key={e.evaluation_id}>
                        <td className="mono">
                          {formatDisplayDateTime(e.created_at)}
                        </td>
                        <td>{formatFieldLabel(e.phase)}</td>
                        <td>
                          <StatusBadge variant="badge" status={e.decision} />
                        </td>
                        <td className="mono">{e.action ?? '-'}</td>
                        <td className="mono">
                          {e.resolution_category
                            ? formatFieldLabel(e.resolution_category)
                            : '-'}
                        </td>
                        <td className="mono">
                          <Link
                            href={`/evaluations/${e.evaluation_id}`}
                            className="table-link"
                          >
                            {e.evaluation_id}
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        ) : null}

        {tab === 'Scope' ? (
          <div className="policy-tab-body">
            <TabIntro title="Scope">
              Where this policy applies - pack, domain, tier, and the subject / resource / action surface it governs.
            </TabIntro>
            <dl className="definition-list">
              <dt>Pack</dt>
              <dd>
                <DefinitionValue>
                  <span>{pack?.name ?? policy.pack_id}</span>
                  {pack ? <StatusBadge variant="badge" status={pack.status} /> : null}
                </DefinitionValue>
              </dd>
              <dt>Pack ID</dt>
              <dd>
                <DefinitionValue>
                  <span className="mono">{policy.pack_id}</span>
                </DefinitionValue>
              </dd>
              <dt>Domain</dt>
              <dd>
                <DefinitionValue>{domainLabel}</DefinitionValue>
              </dd>
              <dt>Scope Tier</dt>
              <dd>
                <DefinitionValue>{formatFieldLabel(String(scopeTier))}</DefinitionValue>
              </dd>
              <dt>Phase</dt>
              <dd>
                <DefinitionValue>{capitalize(policy.phase)}</DefinitionValue>
              </dd>
              <dt>Priority</dt>
              <dd>
                <DefinitionValue>
                  <span className="mono">{priority}</span>
                </DefinitionValue>
              </dd>
              <dt>Classifications</dt>
              <dd>
                <DefinitionValue>
                  {classifications.length ? (
                    classifications.join(', ')
                  ) : (
                    <span className="muted">No classifications</span>
                  )}
                </DefinitionValue>
              </dd>
              <dt>Action Effects</dt>
              <dd>
                <DefinitionValue>
                  {actionEffects.length ? (
                    actionEffects.map((effect) => (
                      <StatusBadge key={effect} variant="badge" status={effect} />
                    ))
                  ) : (
                    <span className="muted">No actions</span>
                  )}
                </DefinitionValue>
              </dd>
              <dt>Subject Types</dt>
              <dd>
                <DefinitionValue>
                  <ChipList items={subjectTypes} empty="No subject matchers" />
                </DefinitionValue>
              </dd>
              <dt>Resource Types</dt>
              <dd>
                <DefinitionValue>
                  <ChipList items={resourceTypes} empty="No resource matchers" />
                </DefinitionValue>
              </dd>
              <dt>AI Context Keys</dt>
              <dd>
                <DefinitionValue>
                  <ChipList
                    items={uniqueLabels(aiContext.map((a) => a.key))}
                    empty="No AI context constraints"
                  />
                </DefinitionValue>
              </dd>
            </dl>
          </div>
        ) : null}

        {tab === 'Subjects' ? (
          <div className="policy-tab-body">
            <TabIntro title="Subjects">
              Who or what can invoke this policy - applications, roles, and other subject matchers evaluated before enforcement.
            </TabIntro>
            <DefinitionTable
              empty="No subject matchers in definition"
              columns={['Type', 'Match', 'Description']}
              rows={subjects.map((s) => [
                formatFieldLabel(s.type),
                s.match,
                s.description,
              ])}
            />
          </div>
        ) : null}

        {tab === 'Resources' ? (
          <div className="policy-tab-body">
            <TabIntro title="Resources">
              Content and artifacts this policy protects - prompts, responses, and derived outputs by classification.
            </TabIntro>
            <DefinitionTable
              empty="No resource matchers in definition"
              columns={['Type', 'Classification', 'Description']}
              rows={resources.map((r) => [
                formatFieldLabel(r.type),
                r.classification ? formatClassificationLabel(r.classification) : '-',
                r.description,
              ])}
            />
          </div>
        ) : null}

        {tab === 'Actions' ? (
          <div className="policy-tab-body">
            <TabIntro title="Actions">
              Operations governed by this policy and the effect applied when they match.
            </TabIntro>
            {actions.length === 0 ? (
              <EmptyState title="No actions in definition" />
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Action</th>
                    <th>Effect</th>
                    <th>Description</th>
                  </tr>
                </thead>
                <tbody>
                  {actions.map((a) => (
                    <tr key={`${a.action}-${a.effect}`}>
                      <td className="mono">{a.action}</td>
                      <td>
                        <StatusBadge variant="badge" status={a.effect} />
                      </td>
                      <td>{a.description}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        ) : null}

        {tab === 'AI Context' ? (
          <div className="policy-tab-body">
            <TabIntro title="AI Context">
              Runtime AI attributes consulted by this policy - models, deployment mode, classification, and related constraints.
            </TabIntro>
            {aiContext.length === 0 ? (
              <EmptyState title="No AI context constraints" />
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Key</th>
                    <th>Constraint</th>
                  </tr>
                </thead>
                <tbody>
                  {aiContext.map((a) => (
                    <tr key={a.key}>
                      <td>
                        <span className="policy-chip policy-chip-code">{a.key}</span>
                      </td>
                      <td>{a.constraint}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        ) : null}

        {tab === 'Conditions' ? (
          <div className="policy-tab-body">
            <TabIntro title="Conditions">
              Rule statements that drive deny, tokenize, review, and related outcomes for this policy.
            </TabIntro>
            {conditions.length === 0 ? (
              <EmptyState title="No conditions in definition" />
            ) : (
              <ul className="policy-condition-list">
                {conditions.map((c) => (
                  <li key={c.id}>
                    <span className="policy-chip policy-chip-code">{c.id}</span>
                    <code className="policy-condition-statement">{c.statement}</code>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : null}

        {tab === 'Decisions' ? (
          <div className="policy-tab-body">
            <TabIntro title="Decisions">
              Machine outcomes this policy can produce, with the reason codes attached to each path.
            </TabIntro>
            {decisions.length === 0 ? (
              <EmptyState title="No decision matrix entries" />
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>When</th>
                    <th>Decision</th>
                    <th>Reason Codes</th>
                  </tr>
                </thead>
                <tbody>
                  {decisions.map((d) => (
                    <tr key={`${d.when}-${d.decision}`}>
                      <td>{d.when}</td>
                      <td>
                        <StatusBadge variant="badge" status={d.decision} />
                      </td>
                      <td>
                        <ReasonCodeList codes={d.reason_codes} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        ) : null}

        {tab === 'Obligations' ? (
          <div className="policy-tab-body">
            <TabIntro title="Obligations">
              Controls the gateway must apply when this policy contributes to a decision - logging, tokenization, local-only, approval, and release.
            </TabIntro>
            {obligations.length === 0 ? (
              <EmptyState title="No obligations in definition" />
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Code</th>
                    <th>When</th>
                    <th>Description</th>
                  </tr>
                </thead>
                <tbody>
                  {obligations.map((o) => (
                    <tr key={o.code}>
                      <td>{formatReasonCode(o.code)}</td>
                      <td>{o.when}</td>
                      <td>{o.description}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        ) : null}

        {tab === 'Versions' ? (
          <div className="policy-tab-body">
            <TabIntro title="Versions">
              Lifecycle and store revisions for this policy. Pack-backed definitions are authoritative for enforcement; store versions are operator metadata.
            </TabIntro>
            {versions.length === 0 ? (
              <EmptyState title="No version history" />
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Version</th>
                    <th>Status</th>
                    <th>Source</th>
                    <th>Date</th>
                    <th>By</th>
                  </tr>
                </thead>
                <tbody>
                  {versions.map((v) => (
                    <tr key={`${v.source}-${v.policy_id}-${v.version}`}>
                      <td className="mono">v{v.version}</td>
                      <td>
                        <StatusBadge variant="badge" status={v.status} />
                      </td>
                      <td>
                        <span className="policy-chip">{formatFieldLabel(v.source)}</span>
                      </td>
                      <td className="mono">
                        {formatDisplayDateTime(v.created_at)}
                      </td>
                      <td className="mono">{v.created_by ?? '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        ) : null}

        {tab === 'Evaluations' ? (
          <div className="policy-tab-body">
            <TabIntro title="Evaluations">
              Recorded policy decisions where this policy contributed. Open an ID for the full explanation.
            </TabIntro>
            {evaluations.length === 0 ? (
              <EmptyState
                title="No policy evaluations yet"
                description="Decisions for this policy appear here when traffic is evaluated."
              />
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Phase</th>
                    <th>Decision</th>
                    <th>Action</th>
                    <th>Resolution</th>
                    <th>Packs</th>
                    <th>Request</th>
                    <th>ID</th>
                  </tr>
                </thead>
                <tbody>
                  {evaluations.map((e) => (
                    <tr key={e.evaluation_id}>
                      <td className="mono">
                        {formatDisplayDateTime(e.created_at)}
                      </td>
                      <td>{formatFieldLabel(e.phase)}</td>
                      <td>
                        <StatusBadge variant="badge" status={e.decision} />
                      </td>
                      <td className="mono">{e.action ?? '-'}</td>
                      <td className="mono">
                        {e.resolution_category
                          ? formatFieldLabel(e.resolution_category)
                          : '-'}
                      </td>
                      <td className="mono">
                        {e.contributing_pack_ids?.length
                          ? e.contributing_pack_ids.join(', ')
                          : '-'}
                      </td>
                      <td className="mono">{e.request_id ?? '-'}</td>
                      <td className="mono">
                        <Link
                          href={`/evaluations/${e.evaluation_id}`}
                          className="table-link"
                        >
                          {e.evaluation_id}
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        ) : null}

        {tab === 'Simulate' ? (
          <PolicySimulatePanel policyId={policy.policy_id} />
        ) : null}
      </div>
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
