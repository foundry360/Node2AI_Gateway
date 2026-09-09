'use client';

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { SelectDropdown } from '@/components/SelectDropdown';
import { PageHeader } from '@/components/PageHeader';

export const TIMEFRAME_OPTIONS = [
  { days: 7, label: 'Last 7 days' },
  { days: 30, label: 'Last 30 days' },
  { days: 60, label: 'Last 60 days' },
  { days: 90, label: 'Last 90 days' },
] as const;

export type TimeframeDays = (typeof TIMEFRAME_OPTIONS)[number]['days'];

export type TriageFilterOption = { value: string; label: string };

type TriageFiltersState = {
  application: string;
  reason: string;
  blockedDate: string;
  setApplication: (value: string) => void;
  setReason: (value: string) => void;
  setBlockedDate: (value: string) => void;
  applicationOptions: TriageFilterOption[];
  reasonOptions: TriageFilterOption[];
  blockedDateOptions: TriageFilterOption[];
  setFilterOptions: (options: {
    applicationOptions: TriageFilterOption[];
    reasonOptions: TriageFilterOption[];
    blockedDateOptions: TriageFilterOption[];
  }) => void;
};

const ConsoleTimeframeContext = createContext<TimeframeDays>(30);
const TriageFiltersContext = createContext<TriageFiltersState | null>(null);

export function useConsoleTimeframe() {
  return useContext(ConsoleTimeframeContext);
}

export function useTriageFilters() {
  const ctx = useContext(TriageFiltersContext);
  if (!ctx) {
    throw new Error('useTriageFilters must be used within ConsoleTabs');
  }
  return ctx;
}

const TABS = ['Insights', 'Status', 'Triage'] as const;
type Tab = (typeof TABS)[number];

/** UI shows Insights only; Status/Triage stay mounted but hidden for easy restore. */
const VISIBLE_TAB: Tab = 'Insights';
const SHOW_CONSOLE_TAB_BAR = false;

export function ConsoleTabs({
  title,
  lede,
  overview,
  posture,
  blocked,
}: {
  title?: string;
  lede?: string;
  overview: ReactNode;
  posture: ReactNode;
  blocked: ReactNode;
}) {
  const [tab, setTab] = useState<Tab>(VISIBLE_TAB);
  const [days, setDays] = useState<TimeframeDays>(30);
  const [application, setApplication] = useState('');
  const [reason, setReason] = useState('');
  const [blockedDate, setBlockedDate] = useState('');
  const [applicationOptions, setApplicationOptions] = useState<TriageFilterOption[]>([]);
  const [reasonOptions, setReasonOptions] = useState<TriageFilterOption[]>([]);
  const [blockedDateOptions, setBlockedDateOptions] = useState<TriageFilterOption[]>([]);

  const activeTab = SHOW_CONSOLE_TAB_BAR ? tab : VISIBLE_TAB;
  const showTimeframe = activeTab === 'Insights' || activeTab === 'Triage';
  const showTriageFilters = activeTab === 'Triage';
  const timeframeInHeader = Boolean(title) && !SHOW_CONSOLE_TAB_BAR && showTimeframe;

  const setFilterOptions = useCallback(
    (options: {
      applicationOptions: TriageFilterOption[];
      reasonOptions: TriageFilterOption[];
      blockedDateOptions: TriageFilterOption[];
    }) => {
      setApplicationOptions(options.applicationOptions);
      setReasonOptions(options.reasonOptions);
      setBlockedDateOptions(options.blockedDateOptions);
    },
    [],
  );

  const timeframeValue = useMemo(() => days, [days]);
  const triageFilters = useMemo<TriageFiltersState>(
    () => ({
      application,
      reason,
      blockedDate,
      setApplication,
      setReason,
      setBlockedDate,
      applicationOptions,
      reasonOptions,
      blockedDateOptions,
      setFilterOptions,
    }),
    [
      application,
      reason,
      blockedDate,
      applicationOptions,
      reasonOptions,
      blockedDateOptions,
      setFilterOptions,
    ],
  );

  const timeframeSelect = (
    <SelectDropdown
      compact
      ariaLabel="Timeframe"
      value={String(days)}
      onChange={(next) => setDays(Number(next) as TimeframeDays)}
      options={TIMEFRAME_OPTIONS.map((o) => ({
        value: String(o.days),
        label: o.label,
      }))}
    />
  );

  return (
    <ConsoleTimeframeContext.Provider value={timeframeValue}>
      <TriageFiltersContext.Provider value={triageFilters}>
        {title ? (
          <PageHeader
            title={title}
            lede={lede}
            actions={timeframeInHeader ? timeframeSelect : undefined}
          />
        ) : null}
        <div className="console-tabs">
          {SHOW_CONSOLE_TAB_BAR || (showTimeframe && !timeframeInHeader) ? (
            <div className="console-tabs-bar">
              {SHOW_CONSOLE_TAB_BAR ? (
                <div className="tabs" role="tablist" aria-label="Console sections">
                  {TABS.map((t) => (
                    <button
                      key={t}
                      type="button"
                      role="tab"
                      aria-selected={activeTab === t}
                      className={`tab${activeTab === t ? ' tab-active' : ''}`}
                      onClick={() => setTab(t)}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              ) : null}
              {showTimeframe && !timeframeInHeader ? (
                <div className="console-toolbar">
                  {showTriageFilters ? (
                    <>
                      <SelectDropdown
                        compact
                        ariaLabel="Filter by application"
                        value={application}
                        onChange={setApplication}
                        options={[
                          { value: '', label: 'All applications' },
                          ...applicationOptions,
                        ]}
                      />
                      <SelectDropdown
                        compact
                        ariaLabel="Filter by reason"
                        value={reason}
                        onChange={setReason}
                        options={[
                          { value: '', label: 'All reasons' },
                          ...reasonOptions,
                        ]}
                      />
                      <SelectDropdown
                        compact
                        ariaLabel="Filter by blocked date"
                        value={blockedDate}
                        onChange={setBlockedDate}
                        options={[
                          { value: '', label: 'All blocked dates' },
                          ...blockedDateOptions,
                        ]}
                      />
                    </>
                  ) : null}
                  {timeframeSelect}
                </div>
              ) : null}
            </div>
          ) : null}
          <div className="tab-panel console-tab-panel">
            <div hidden={activeTab !== 'Insights'}>{overview}</div>
            {/* Status + Triage retained; hidden from UI while Insights-only mode is on. */}
            <div hidden={activeTab !== 'Status'}>{posture}</div>
            <div hidden={activeTab !== 'Triage'}>{blocked}</div>
          </div>
        </div>
      </TriageFiltersContext.Provider>
    </ConsoleTimeframeContext.Provider>
  );
}
