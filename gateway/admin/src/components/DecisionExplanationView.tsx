'use client';

import Link from 'next/link';
import { type ReactNode } from 'react';
import { StatusBadge } from '@/components/StatusBadge';
import { formatReasonCodes } from '@/lib/reason-codes';
import {
  authorityTierLabel,
  type DecisionExplanationPayload,
  type ProvenanceRule,
} from '@/lib/decision-explanation';

function CodeList({ items, empty = 'None' }: { items: string[]; empty?: string }) {
  if (!items.length) return <span className="muted">{empty}</span>;
  return (
    <ul className="decision-code-list">
      {items.map((item) => (
        <li key={item} className="mono">
          {item}
        </li>
      ))}
    </ul>
  );
}

function CodeInline({ items, empty = '-' }: { items: string[]; empty?: string }) {
  if (!items.length) return <span className="muted">{empty}</span>;
  return <span className="mono">{items.join(', ')}</span>;
}

function AttrRow({
  label,
  children,
  mono,
}: {
  label: string;
  children: ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="meridian-attr">
      <span className="meridian-attr-label">{label}</span>
      <span className={mono ? 'meridian-attr-value mono' : 'meridian-attr-value'}>
        {children}
      </span>
    </div>
  );
}

function ProvenanceChain({ rule }: { rule: ProvenanceRule }) {
  return (
    <div className="provenance-chain contribution-attrs">
      <AttrRow label="Rule" mono>
        {rule.rule_id}
      </AttrRow>
      <AttrRow label="Obligations">
        <CodeInline items={rule.obligation_ids} />
      </AttrRow>
      <AttrRow label="Citations">
        <CodeInline items={rule.citations} />
      </AttrRow>
      <AttrRow label="Sources">
        <CodeInline items={rule.source_ids} />
      </AttrRow>
      <AttrRow label="Authority Tier">{authorityTierLabel(rule.authority_tier)}</AttrRow>
      {rule.authority ? <AttrRow label="Authority">{rule.authority}</AttrRow> : null}
      {rule.control_ids?.length ? (
        <AttrRow label="Mapped Controls">
          <CodeInline items={rule.control_ids} />
        </AttrRow>
      ) : null}
    </div>
  );
}

/**
 * Pack-agnostic decision intelligence panel.
 * Renders structured PolicyDecision explanation - no regulatory forks.
 */
export function DecisionExplanationView({
  decision,
}: {
  decision: DecisionExplanationPayload;
}) {
  const operator = decision.explanation?.operator;
  const resolution = decision.explanation?.resolution;
  const provenance = decision.explanation?.provenance;
  const machineDecision = operator?.final_decision ?? decision.decision ?? '-';
  const narrative =
    operator?.narrative ??
    decision.explanation?.final_reason ??
    decision.reason ??
    '';
  const contributions = operator?.contributions ?? [];
  const authorities =
    operator?.authorities ??
    provenance?.sources?.map((s) => ({
      source_id: s.source_id,
      authority: s.authority,
      citation: s.citation,
      authority_tier: s.authority_tier,
      authority_type: s.authority_type,
      legal_authority: s.legal_authority,
      pack_ids: [] as string[],
    })) ??
    [];

  const allRules = provenance?.matched_rules ?? [];

  return (
    <div className="decision-explanation">
      <div className="decision-explanation-top">
        <section className="section-card" aria-labelledby="machine-decision-heading">
          <div className="section-card-header">
            <h3 id="machine-decision-heading">Machine Decision</h3>
            <StatusBadge variant="badge" status={machineDecision} />
          </div>
          {(operator?.resolution_label ||
            resolution?.category ||
            narrative ||
            decision.reason_codes?.length) ? (
            <div className="contribution-attrs">
              {(operator?.resolution_label || resolution?.category) && (
                <AttrRow label="Resolution">
                  {operator?.resolution_label ?? resolution?.category}
                </AttrRow>
              )}
              {narrative ? <AttrRow label="Narrative">{narrative}</AttrRow> : null}
              {decision.reason_codes?.length ? (
                <AttrRow label="Reason Codes">
                  {formatReasonCodes(decision.reason_codes)}
                </AttrRow>
              ) : null}
            </div>
          ) : null}
        </section>

        <section className="section-card" aria-labelledby="contributions-heading">
          <div className="section-card-header">
            <h3 id="contributions-heading">
              Policy Contributions ({contributions.length})
            </h3>
          </div>
          {contributions.length > 0 ? (
            <div className="contribution-list">
              {contributions.map((c) => {
                const rules =
                  c.rule_ids.length > 0
                    ? allRules.filter((r) => c.rule_ids.includes(r.rule_id))
                    : [];
                const obligations =
                  c.obligation_ids.length > 0 ? c.obligation_ids : c.obligations;
                const controls =
                  c.controls.map((x) => x.control_id).length > 0
                    ? c.controls.map((x) => x.control_id)
                    : c.obligations;
                return (
                  <article
                    key={`${c.pack_id}-${c.policy_id}`}
                    className="contribution-block"
                  >
                    <div className="contribution-attrs">
                      <AttrRow label="Policy">
                        <span className="contribution-policy-value">
                          <span>
                            <Link
                              href={`/policies/${c.policy_id}`}
                              className="table-link"
                            >
                              {c.policy_name ?? c.policy_id}
                            </Link>
                            {c.policy_version != null ? (
                              <span className="muted"> · v{c.policy_version}</span>
                            ) : null}
                          </span>
                          <StatusBadge variant="badge" status={c.decision} />
                        </span>
                      </AttrRow>
                      {c.pack_name ? (
                        <AttrRow label="Pack">
                          {c.pack_name}
                          {c.pack_version ? (
                            <span className="muted"> v{c.pack_version}</span>
                          ) : null}
                        </AttrRow>
                      ) : null}
                      <AttrRow label="Rules">
                        <CodeInline items={c.rule_ids} />
                      </AttrRow>
                      <AttrRow label="Obligations">
                        <CodeInline items={obligations} />
                      </AttrRow>
                      <AttrRow label="Controls">
                        <CodeInline items={controls} />
                      </AttrRow>
                      {rules.length === 0 ? (
                        <AttrRow label="Evidence">
                          <span className="muted">-</span>
                        </AttrRow>
                      ) : null}
                    </div>
                    {rules.length > 0 ? (
                      <div className="contribution-provenance">
                        <div className="muted decision-sublabel">Evidence</div>
                        {rules.map((r) => (
                          <ProvenanceChain key={r.rule_id} rule={r} />
                        ))}
                      </div>
                    ) : null}
                  </article>
                );
              })}
            </div>
          ) : (
            <p className="muted decision-panel-lede">
              No policy contributions attached to this evaluation.
            </p>
          )}
        </section>
      </div>

      {resolution || operator?.resolution_category ? (
        <section className="section-card" aria-labelledby="resolution-heading">
          <div className="section-card-header">
            <h3 id="resolution-heading">Resolution</h3>
          </div>
          <dl className="definition-list">
            <div>
              <dt>Category</dt>
              <dd className="mono">
                {operator?.resolution_category ?? resolution?.category ?? '-'}
              </dd>
            </div>
            <div>
              <dt>Basis</dt>
              <dd>
                {operator?.basis_label ?? resolution?.basis ?? '-'}
                {resolution?.basis ? (
                  <div className="muted mono" style={{ marginTop: '0.25rem' }}>
                    {resolution.basis}
                  </div>
                ) : null}
              </dd>
            </div>
            <div>
              <dt>Contributing Packs</dt>
              <dd>
                <CodeList
                  items={
                    operator?.contributing_pack_ids ??
                    resolution?.contributing_pack_ids ??
                    []
                  }
                />
              </dd>
            </div>
            {(operator?.conflict_detail || resolution?.detail) && (
              <div>
                <dt>Detail</dt>
                <dd>{operator?.conflict_detail ?? resolution?.detail}</dd>
              </div>
            )}
          </dl>
          {resolution?.conflict_pairs?.length ? (
            <div className="decision-reason-block">
              <div className="muted decision-sublabel">Conflict Pairs</div>
              <ul className="decision-code-list">
                {resolution.conflict_pairs.map((p, i) => (
                  <li key={`${p.pack_a}-${p.pack_b}-${i}`}>
                    <span className="mono">
                      {p.pack_a} ({p.policy_a}) vs {p.pack_b} ({p.policy_b})
                    </span>
                    <span className="muted">
                      {' '}
                      - {p.category}: {p.detail}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>
      ) : null}

      {authorities.length > 0 ? (
        <section className="section-card" aria-labelledby="authorities-heading">
          <div className="section-card-header">
            <h3 id="authorities-heading">Contributing Authorities</h3>
            <span className="count">{authorities.length}</span>
          </div>
          <div className="authority-grid">
            {authorities.map((a) => (
              <article key={a.source_id} className="authority-card">
                <strong>{a.authority}</strong>
                {a.citation ? <div className="mono muted">{a.citation}</div> : null}
                <dl className="definition-list compact">
                  <div>
                    <dt>Source</dt>
                    <dd className="mono">{a.source_id}</dd>
                  </div>
                  <div>
                    <dt>Authority Tier</dt>
                    <dd>{authorityTierLabel(a.authority_tier)}</dd>
                  </div>
                  {a.legal_authority != null ? (
                    <div>
                      <dt>Legal Authority</dt>
                      <dd>{a.legal_authority ? 'Yes' : 'No'}</dd>
                    </div>
                  ) : null}
                </dl>
              </article>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
