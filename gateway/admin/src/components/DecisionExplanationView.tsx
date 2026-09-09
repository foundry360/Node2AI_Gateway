'use client';

import Link from 'next/link';
import { ChevronDown } from 'lucide-react';
import { type ReactNode } from 'react';
import { StatusBadge } from '@/components/StatusBadge';
import { formatReasonCodes } from '@/lib/reason-codes';
import {
  authorityTierLabel,
  type DecisionExplanationPayload,
  type ProvenanceRule,
} from '@/lib/decision-explanation';

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
export function DecisionResolutionPanel({
  decision,
}: {
  decision: DecisionExplanationPayload;
}) {
  const operator = decision.explanation?.operator;
  const resolution = decision.explanation?.resolution;
  if (!resolution && !operator?.resolution_category) return null;

  const packIds =
    operator?.contributing_pack_ids ?? resolution?.contributing_pack_ids ?? [];
  const detail = operator?.conflict_detail ?? resolution?.detail;
  const basisLabel = operator?.basis_label ?? resolution?.basis ?? '-';

  return (
    <section
      className="section-card resolution-card"
      aria-labelledby="resolution-heading"
    >
      <div className="section-card-header">
        <h3 id="resolution-heading">Resolution</h3>
      </div>
      <div className="contribution-attrs">
        <AttrRow label="Category" mono>
          {operator?.resolution_category ?? resolution?.category ?? '-'}
        </AttrRow>
        <AttrRow label="Basis">
          <span className="resolution-basis">
            <span>{basisLabel}</span>
            {operator?.basis_label && resolution?.basis ? (
              <span className="muted mono">{resolution.basis}</span>
            ) : null}
          </span>
        </AttrRow>
        <AttrRow label="Contributing Packs">
          <CodeInline items={packIds} empty="None" />
        </AttrRow>
        {detail ? <AttrRow label="Detail">{detail}</AttrRow> : null}
      </div>
      {resolution?.conflict_pairs?.length ? (
        <div className="decision-reason-block">
          <div className="muted decision-sublabel">Conflict Pairs</div>
          <ul className="decision-code-list">
            {resolution.conflict_pairs.map((p, i) => (
              <li key={`${p.pack_a}-${p.pack_b}-${i}`}>
                <span className="mono">
                  {p.pack_a} ({p.policy_a}) vs {p.pack_b} ({p.policy_b})
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

export function DecisionExplanationView({
  decision,
  afterTop,
}: {
  decision: DecisionExplanationPayload;
  /** Optional second-row companion (e.g. Enforcement Consequence). */
  afterTop?: ReactNode;
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
  const hasResolution = Boolean(resolution || operator?.resolution_category);

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
            <div className="contribution-list contribution-accordion-list">
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
                const policyLabel = c.policy_name ?? c.policy_id;
                return (
                  <details
                    key={`${c.pack_id}-${c.policy_id}`}
                    className="contribution-accordion"
                  >
                    <summary className="contribution-accordion-summary">
                      <span className="contribution-accordion-lead">
                        <ChevronDown
                          className="contribution-accordion-chevron"
                          size={16}
                          strokeWidth={2}
                          aria-hidden
                        />
                        <span className="contribution-accordion-title">
                          <Link
                            href={`/policies/${c.policy_id}`}
                            className="table-link"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {policyLabel}
                          </Link>
                          {c.policy_version != null ? (
                            <span className="muted"> · v{c.policy_version}</span>
                          ) : null}
                        </span>
                      </span>
                      <StatusBadge variant="badge" status={c.decision} />
                    </summary>
                    <div className="contribution-accordion-body">
                      <div className="contribution-attrs">
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
                    </div>
                  </details>
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

      {hasResolution || afterTop ? (
        <div className="decision-explanation-top">
          {hasResolution ? <DecisionResolutionPanel decision={decision} /> : null}
          {afterTop ?? null}
        </div>
      ) : null}

      {authorities.length > 0 ? (
        <section
          className="section-card resolution-card"
          aria-labelledby="authorities-heading"
        >
          <div className="section-card-header">
            <h3 id="authorities-heading">
              Contributing Authorities ({authorities.length})
            </h3>
          </div>
          <div className="contribution-list">
            {authorities.map((a) => {
              const citation =
                a.citation && a.citation !== a.authority ? a.citation : null;
              return (
                <article key={a.source_id} className="contribution-block">
                  <div className="contribution-attrs">
                    <AttrRow label="Authority">{a.authority}</AttrRow>
                    {citation ? (
                      <AttrRow label="Citation">
                        <span className="mono">{citation}</span>
                      </AttrRow>
                    ) : null}
                    <AttrRow label="Source" mono>
                      {a.source_id}
                    </AttrRow>
                    <AttrRow label="Authority Tier">
                      {authorityTierLabel(a.authority_tier)}
                    </AttrRow>
                    {a.legal_authority != null ? (
                      <AttrRow label="Legal Authority">
                        {a.legal_authority ? 'Yes' : 'No'}
                      </AttrRow>
                    ) : null}
                    {a.authority_type ? (
                      <AttrRow label="Authority Type">{a.authority_type}</AttrRow>
                    ) : null}
                    {a.pack_ids?.length ? (
                      <AttrRow label="Packs">
                        <CodeInline items={a.pack_ids} empty="None" />
                      </AttrRow>
                    ) : null}
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      ) : null}
    </div>
  );
}
