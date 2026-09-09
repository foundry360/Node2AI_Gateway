'use client';

import { useMemo, useState, type ReactNode } from 'react';

export type DecisionDetailTabId =
  | 'preview'
  | 'context'
  | 'policy'
  | 'review';

type TabDef = {
  id: DecisionDetailTabId;
  label: string;
};

/**
 * Tabs below Decision Identity — one panel per card section.
 */
export function DecisionDetailTabs({
  showPreview = true,
  showContext = true,
  showPolicy = true,
  showReview = false,
  defaultTab,
  preview,
  context,
  policy,
  review,
}: {
  showPreview?: boolean;
  showContext?: boolean;
  showPolicy?: boolean;
  showReview?: boolean;
  defaultTab?: DecisionDetailTabId;
  preview: ReactNode;
  context: ReactNode;
  policy: ReactNode;
  review?: ReactNode;
}) {
  const tabs = useMemo(() => {
    const list: TabDef[] = [];
    if (showPolicy) list.push({ id: 'policy', label: 'Policy Decision' });
    if (showContext) list.push({ id: 'context', label: 'Request Context' });
    if (showPreview) list.push({ id: 'preview', label: 'Request Review' });
    if (showReview) list.push({ id: 'review', label: 'Human Review' });
    return list;
  }, [showPreview, showContext, showPolicy, showReview]);

  const initial = useMemo(() => {
    if (defaultTab && tabs.some((t) => t.id === defaultTab)) return defaultTab;
    return tabs[0]?.id ?? 'policy';
  }, [defaultTab, tabs]);

  const [tab, setTab] = useState<DecisionDetailTabId>(initial);

  const active = tabs.some((t) => t.id === tab) ? tab : tabs[0]?.id;

  if (tabs.length === 0) return null;

  return (
    <div className="decision-detail-tabs">
      <div className="console-tabs-bar">
        <div className="tabs" role="tablist" aria-label="Decision sections">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={active === t.id}
              className={`tab${active === t.id ? ' tab-active' : ''}`}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="decision-detail-tab-panel" role="tabpanel">
        {active === 'preview' ? preview : null}
        {active === 'context' ? context : null}
        {active === 'policy' ? policy : null}
        {active === 'review' ? review : null}
      </div>
    </div>
  );
}
