'use client';

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

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

export function ConsoleTabs({
  overview,
  posture,
  blocked,
}: {
  overview: ReactNode;
  posture: ReactNode;
  blocked: ReactNode;
}) {
  const [tab, setTab] = useState<Tab>('Insights');
  const [days, setDays] = useState<TimeframeDays>(30);
  const [application, setApplication] = useState('');
  const [reason, setReason] = useState('');
  const [blockedDate, setBlockedDate] = useState('');
  const [applicationOptions, setApplicationOptions] = useState<TriageFilterOption[]>([]);
  const [reasonOptions, setReasonOptions] = useState<TriageFilterOption[]>([]);
  const [blockedDateOptions, setBlockedDateOptions] = useState<TriageFilterOption[]>([]);

  const showTimeframe = tab === 'Insights' || tab === 'Triage';
  const showTriageFilters = tab === 'Triage';

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

  return (
    <ConsoleTimeframeContext.Provider value={timeframeValue}>
      <TriageFiltersContext.Provider value={triageFilters}>
        <div className="console-tabs">
          <div className="console-tabs-bar">
            <div className="tabs" role="tablist" aria-label="Console sections">
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
            {showTimeframe ? (
              <div className="console-toolbar">
                {showTriageFilters ? (
                  <>
                    <label className="console-toolbar-field">
                      <span className="sr-only">Application</span>
                      <select
                        value={application}
                        onChange={(e) => setApplication(e.target.value)}
                        aria-label="Filter by application"
                      >
                        <option value="">All applications</option>
                        {applicationOptions.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="console-toolbar-field">
                      <span className="sr-only">Reason</span>
                      <select
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        aria-label="Filter by reason"
                      >
                        <option value="">All reasons</option>
                        {reasonOptions.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="console-toolbar-field">
                      <span className="sr-only">Blocked date</span>
                      <select
                        value={blockedDate}
                        onChange={(e) => setBlockedDate(e.target.value)}
                        aria-label="Filter by blocked date"
                      >
                        <option value="">All blocked dates</option>
                        {blockedDateOptions.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  </>
                ) : null}
                <label className="console-toolbar-field">
                  <span className="sr-only">Timeframe</span>
                  <select
                    value={days}
                    onChange={(e) => setDays(Number(e.target.value) as TimeframeDays)}
                    aria-label="Timeframe"
                  >
                    {TIMEFRAME_OPTIONS.map((o) => (
                      <option key={o.days} value={o.days}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            ) : null}
          </div>
          <div className="tab-panel console-tab-panel">
            <div hidden={tab !== 'Insights'}>{overview}</div>
            <div hidden={tab !== 'Status'}>{posture}</div>
            <div hidden={tab !== 'Triage'}>{blocked}</div>
          </div>
        </div>
      </TriageFiltersContext.Provider>
    </ConsoleTimeframeContext.Provider>
  );
}
