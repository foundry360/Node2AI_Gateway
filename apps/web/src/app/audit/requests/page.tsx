'use client';

/**
 * Audit Requests Page
 * Lists all AI requests with filters and pagination
 */

import { useState, useEffect } from 'react';
import React from 'react';
import { useRouter } from 'next/navigation';
import { PageLayout } from '@/components/page-layout';

interface AIRequest {
  id: string;
  requestId: string;
  createdAt: string;
  provider: string;
  model: string;
  status: string;
  inputTokenCount: number;
  outputTokenCount: number;
  costUsd: number;
  piiDetectedCount: number;
  phiDetectedCount: number;
  durationMs: number;
  title?: string;
  lastActivity?: string;
  messageCount?: number;
}

interface AuditLogsData {
  requests: AIRequest[];
  total: number;
  page: number;
  perPage: number;
  totalPages: number;
}

export default function AuditRequestsPage() {
  const router = useRouter();
  const [data, setData] = useState<AuditLogsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [filterDialogOpen, setFilterDialogOpen] = useState<string | null>(null);
  const [filters, setFilters] = useState({
    page: 1,
    perPage: 100,
    status: 'response',
    provider: '',
    user: '',
    startDate: '',
    endDate: '',
    timeInterval: '',
    containsPii: false,
    containsPhi: false,
  });

  const toggleRow = (id: string) => {
    setExpandedRows(prev => {
      // If clicking on the currently open row, close it
      if (prev.has(id)) {
        return new Set();
      }
      // Otherwise, close all and open just this one
      return new Set([id]);
    });
  };

  // Calculate pagination for conversations (145 total conversations from index 6 to 150)
  const totalConversations = 145;
  const conversationTotalPages = Math.ceil(
    totalConversations / filters.perPage
  );
  const conversationStartIndex = (filters.page - 1) * filters.perPage;
  const conversationEndIndex = conversationStartIndex + filters.perPage;

  // Generate 150 additional sample conversation rows
  const generateSampleConversations = (startIndex = 0, endIndex = 100) => {
    const conversations = [];
    const titles = [
      'Product Inquiry',
      'Technical Support',
      'Account Question',
      'Feature Request',
      'Bug Report',
    ];
    const users = [
      'alice.smith@company.com',
      'bob.jones@company.com',
      'carol.taylor@company.com',
      'dave.wilson@company.com',
    ];
    const statuses = ['Active', 'Completed', 'Archived'];
    const statusColors = {
      Active: 'green',
      Completed: 'blue',
      Archived: 'purple',
    };

    for (let i = startIndex + 6; i <= Math.min(150, endIndex + 6); i++) {
      const id = `conv_${i.toString().padStart(13, '0')}`;
      const title = titles[Math.floor(Math.random() * titles.length)];
      const user = users[Math.floor(Math.random() * users.length)];
      const status = statuses[Math.floor(Math.random() * statuses.length)];
      const statusColor = statusColors[status as keyof typeof statusColors];
      const messageCount = Math.floor(Math.random() * 20) + 5;
      const tokens = Math.floor(Math.random() * 50000) + 10000;
      const cost = (tokens * 0.00001).toFixed(4);
      const daysAgo = Math.floor(Math.random() * 30);
      const date = new Date();
      date.setDate(date.getDate() - daysAgo);
      const startedAt = date.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
      const lastActivity = new Date(
        date.getTime() + Math.random() * 3600000
      ).toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });

      conversations.push(
        <>
          <tr
            onClick={() => toggleRow(id)}
            className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800"
            key={id}
          >
            <ChevronIcon expanded={expandedRows.has(id)} id={id} />
            <td className="whitespace-nowrap px-4 py-3 text-sm text-[#888f98]">
              <div className="flex flex-col gap-1">
                <span className="font-medium">{title}</span>
                <span className="font-mono text-xs text-[#888f98]">{id}</span>
              </div>
            </td>
            <td className="whitespace-nowrap px-4 py-3 text-sm text-[#888f98]">
              {user}
            </td>
            <td className="whitespace-nowrap px-4 py-3 text-sm text-[#888f98]">
              {lastActivity}
            </td>
            <td className="whitespace-nowrap px-4 py-3 text-sm text-[#888f98]">
              {messageCount}
            </td>
            <td className="whitespace-nowrap px-4 py-3 text-sm text-[#888f98]">
              {tokens.toLocaleString()}
            </td>
            <td className="whitespace-nowrap px-4 py-3 text-sm text-[#888f98]">
              ${cost}
            </td>
            <td className="px-3 py-2 text-sm text-[#888f98]">
              <div className="flex items-center gap-2">
                <span
                  className={`h-2 w-2 rounded-full bg-${statusColor}-400`}
                ></span>
                <span>{status}</span>
              </div>
            </td>
          </tr>
          {expandedRows.has(id) && (
            <tr key={`${id}_expanded`}>
              <td
                colSpan={9}
                className="bg-gray-50 px-3 py-4 dark:!bg-[#0a0a0a]"
              >
                <div className="space-y-3">
                  <div className="grid grid-cols-4 gap-2 pl-[3.2125rem] text-left text-xs">
                    <div>
                      <span className="font-medium text-gray-600 dark:text-gray-400">
                        Session ID:
                      </span>
                      <span className="ml-2 text-gray-900 dark:text-white">
                        {id}
                      </span>
                    </div>
                    <div>
                      <span className="font-medium text-gray-600 dark:text-gray-400">
                        User:
                      </span>
                      <span className="ml-2 text-gray-900 dark:text-white">
                        {user}
                      </span>
                    </div>
                  </div>
                </div>
              </td>
            </tr>
          )}
        </>
      );
    }
    return conversations;
  };

  const ChevronIcon = ({ expanded, id }: { expanded: boolean; id: string }) => (
    <td className="whitespace-nowrap px-4 py-3 text-sm text-[#888f98]">
      <svg
        className="h-4 w-4"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        {expanded ? (
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M5 15l7-7 7 7"
          />
        ) : (
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 9l-7 7-7-7"
          />
        )}
      </svg>
    </td>
  );

  useEffect(() => {
    fetchAuditLogs();
  }, [filters]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        filterDialogOpen &&
        !(event.target as HTMLElement).closest('.relative')
      ) {
        setFilterDialogOpen(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [filterDialogOpen]);

  const fetchAuditLogs = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (filters.page) params.append('page', filters.page.toString());
      if (filters.perPage)
        params.append('per_page', filters.perPage.toString());
      if (filters.status) params.append('status', filters.status);
      if (filters.provider) params.append('provider', filters.provider);
      if (filters.startDate) params.append('start_date', filters.startDate);
      if (filters.endDate) params.append('end_date', filters.endDate);
      if (filters.containsPii) params.append('contains_pii', 'true');
      if (filters.containsPhi) params.append('contains_phi', 'true');

      const response = await fetch(
        `/api/v1/audit/requests?${params.toString()}`
      );
      const json = await response.json();

      if (json.success) {
        setData(json.data);
      }
    } catch (error) {
      console.error('Error fetching audit logs:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleExport = async (format: 'csv' | 'json') => {
    try {
      const response = await fetch('/api/v1/audit/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filters, format }),
      });

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `audit-logs-${new Date().toISOString()}.${format}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error exporting logs:', error);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completion':
        return 'bg-blue-100 text-blue-800';
      case 'response':
        return 'bg-green-100 text-green-800';
      case 'conversation':
        return 'bg-purple-100 text-purple-800';
      case 'error':
        return 'bg-red-100 text-red-800';
      case 'timeout':
        return 'bg-yellow-100 text-yellow-800';
      case 'rate_limited':
        return 'bg-orange-100 text-orange-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const formatDuration = (ms: number) => {
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(2)}s`;
  };

  if (loading) {
    return (
      <PageLayout>
        <div className="flex h-64 items-center justify-center">
          <div className="text-lg">Loading audit logs...</div>
        </div>
      </PageLayout>
    );
  }

  return (
    <>
      <style>{`
        select {
          background-color: transparent;
          appearance: none;
          background-image: url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='m6 8 4 4 4-4'/%3e%3c/svg%3e");
          background-position: right 0.5rem center;
          background-repeat: no-repeat;
          background-size: 1.5em 1.5em;
          padding-right: 2.5rem;
          outline: none;
          ring: none;
        }
        select:focus {
          outline: none !important;
          ring: none !important;
          box-shadow: none !important;
        }
        select option {
          background-color: #0a0a0a;
          color: #888f98;
        }
        @media (prefers-color-scheme: dark) {
          select {
            background-color: #0a0a0a;
          }
          select option {
            background-color: #0a0a0a;
            color: #888f98;
          }
        }
        .dark select {
          background-color: #0a0a0a;
        }
        .dark select option {
          background-color: #0a0a0a;
          color: #888f98;
        }
        .dark button.input {
          background-color: #0a0a0a !important;
        }
        .dark div[style*="backgroundColor"] {
          background-color: #000000 !important;
        }
        .dark .absolute.z-10 {
          background-color: #000000 !important;
          opacity: 1 !important;
        }
        div[style*="opacity: 1"] {
          opacity: 1 !important;
        }
        .absolute.z-10 {
          background: #000000 !important;
          opacity: 1 !important;
        }
      `}</style>
      <PageLayout>
        <div className="mx-auto w-full max-w-[95%] px-4 pb-6 pt-2 sm:px-6 lg:px-8 xl:max-w-[98%]">
          <div className="mb-6">
            <div className="flex items-center justify-between">
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
                Audit Logs
              </h1>
              <div className="flex gap-2">
                <button
                  onClick={() => handleExport('csv')}
                  className="rounded-md border border-gray-300 bg-transparent px-4 py-2 text-sm font-medium text-gray-900 transition-colors hover:bg-gray-50 dark:border-[#242424] dark:text-white dark:hover:bg-gray-800"
                >
                  Export CSV
                </button>
                <button
                  onClick={() => handleExport('json')}
                  className="rounded-md border border-gray-300 bg-transparent px-4 py-2 text-sm font-medium text-gray-900 transition-colors hover:bg-gray-50 dark:border-[#242424] dark:text-white dark:hover:bg-gray-800"
                >
                  Export JSON
                </button>
              </div>
            </div>
          </div>

          {/* Divider */}
          <div className="mb-6 border-t border-gray-200 dark:border-[#242424]"></div>

          {/* Filters */}
          <div className="card mb-6 border-0 !bg-transparent shadow-none">
            <div className="p-0">
              <div className="grid grid-cols-1 gap-x-4 gap-y-4 md:grid-cols-5">
                <div className="relative">
                  <label className="mb-2 block text-sm text-gray-700 dark:text-gray-300">
                    Type
                  </label>
                  <button
                    type="button"
                    onClick={() =>
                      setFilterDialogOpen(
                        filterDialogOpen === 'type' ? null : 'type'
                      )
                    }
                    className="input w-full text-left"
                  >
                    {filters.status === 'completion'
                      ? 'Completions'
                      : filters.status === 'response'
                        ? 'Requests'
                        : filters.status === 'conversation'
                          ? 'Conversations'
                          : 'Requests'}
                  </button>
                  {filterDialogOpen === 'type' && (
                    <div className="absolute z-50 mt-1 w-full rounded-md border border-gray-200 bg-white shadow-lg dark:border-[#242424] dark:bg-black">
                      <div className="py-1">
                        {['completion', 'response', 'conversation'].map(
                          value => {
                            const labels: Record<string, string> = {
                              completion: 'Completions',
                              response: 'Requests',
                              conversation: 'Conversations',
                            };
                            return (
                              <button
                                key={value}
                                type="button"
                                onClick={() => {
                                  setFilters({
                                    ...filters,
                                    status: value,
                                    page: 1,
                                  });
                                  setFilterDialogOpen(null);
                                }}
                                className="w-full px-4 py-2 text-left text-sm text-gray-700 transition-colors hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
                              >
                                {labels[value]}
                              </button>
                            );
                          }
                        )}
                      </div>
                    </div>
                  )}
                </div>
                <div className="relative">
                  <label className="mb-2 block text-sm text-gray-700 dark:text-gray-300">
                    Provider
                  </label>
                  <button
                    type="button"
                    onClick={() =>
                      setFilterDialogOpen(
                        filterDialogOpen === 'provider' ? null : 'provider'
                      )
                    }
                    className="input w-full text-left"
                  >
                    {filters.provider === 'openai'
                      ? 'OpenAI'
                      : filters.provider === 'anthropic'
                        ? 'Anthropic'
                        : filters.provider === 'google'
                          ? 'Google'
                          : filters.provider === 'local'
                            ? 'Local'
                            : 'All Providers'}
                  </button>
                  {filterDialogOpen === 'provider' && (
                    <div className="absolute z-50 mt-1 w-full rounded-md border border-gray-200 bg-white shadow-lg dark:border-[#242424] dark:bg-black">
                      <div className="py-1">
                        {['', 'openai', 'anthropic', 'google', 'local'].map(
                          value => {
                            const labels: Record<string, string> = {
                              '': 'All Providers',
                              openai: 'OpenAI',
                              anthropic: 'Anthropic',
                              google: 'Google',
                              local: 'Local',
                            };
                            return (
                              <button
                                key={value}
                                type="button"
                                onClick={() => {
                                  setFilters({
                                    ...filters,
                                    provider: value,
                                    page: 1,
                                  });
                                  setFilterDialogOpen(null);
                                }}
                                className="w-full px-4 py-2 text-left text-sm text-gray-700 transition-colors hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
                              >
                                {labels[value]}
                              </button>
                            );
                          }
                        )}
                      </div>
                    </div>
                  )}
                </div>
                <div className="relative">
                  <label className="mb-2 block text-sm text-gray-700 dark:text-gray-300">
                    Time Interval
                  </label>
                  <button
                    type="button"
                    onClick={() =>
                      setFilterDialogOpen(
                        filterDialogOpen === 'interval' ? null : 'interval'
                      )
                    }
                    className="input w-full text-left"
                  >
                    {filters.timeInterval === '7'
                      ? 'Last 7 days'
                      : filters.timeInterval === '30'
                        ? 'Last 30 days'
                        : filters.timeInterval === '90'
                          ? 'Last 90 days'
                          : filters.timeInterval === '180'
                            ? 'Last 6 months'
                            : filters.timeInterval === '365'
                              ? 'Last year'
                              : 'All Time'}
                  </button>
                  {filterDialogOpen === 'interval' && (
                    <div className="absolute z-50 mt-1 w-full rounded-md border border-gray-200 bg-white shadow-lg dark:border-[#242424] dark:bg-black">
                      <div className="py-1">
                        {[
                          { value: '', label: 'All Time' },
                          { value: '7', label: 'Last 7 days' },
                          { value: '30', label: 'Last 30 days' },
                          { value: '90', label: 'Last 90 days' },
                          { value: '180', label: 'Last 6 months' },
                          { value: '365', label: 'Last year' },
                        ].map(item => (
                          <button
                            key={item.value}
                            type="button"
                            onClick={() => {
                              const interval = item.value;
                              let start = '';
                              let end = '';

                              if (interval) {
                                const now = new Date();
                                const daysAgo = parseInt(interval);
                                const startDate = new Date(now);
                                startDate.setDate(now.getDate() - daysAgo);
                                start = startDate.toISOString().split('T')[0];
                                end = now.toISOString().split('T')[0];
                              }

                              setFilters({
                                ...filters,
                                startDate: start,
                                endDate: end,
                                timeInterval: interval,
                                page: 1,
                              });
                              setFilterDialogOpen(null);
                            }}
                            className="w-full px-4 py-2 text-left text-sm text-gray-700 transition-colors hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
                          >
                            {item.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                <div className="relative">
                  <label className="mb-2 block text-sm text-gray-700 dark:text-gray-300">
                    User
                  </label>
                  <button
                    type="button"
                    onClick={() =>
                      setFilterDialogOpen(
                        filterDialogOpen === 'user' ? null : 'user'
                      )
                    }
                    className="input w-full text-left"
                  >
                    {filters.user || 'All Users'}
                  </button>
                  {filterDialogOpen === 'user' && (
                    <div className="absolute z-50 mt-1 w-full rounded-md border border-gray-200 bg-white shadow-lg dark:border-[#242424] dark:bg-black">
                      <div className="py-1">
                        <button
                          key="all"
                          type="button"
                          onClick={() => {
                            setFilters({ ...filters, user: '', page: 1 });
                            setFilterDialogOpen(null);
                          }}
                          className="w-full px-4 py-2 text-left text-sm text-gray-700 transition-colors hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
                        >
                          All Users
                        </button>
                        <button
                          key="alice"
                          type="button"
                          onClick={() => {
                            setFilters({
                              ...filters,
                              user: 'alice.smith@company.com',
                              page: 1,
                            });
                            setFilterDialogOpen(null);
                          }}
                          className="w-full px-4 py-2 text-left text-sm text-gray-700 transition-colors hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
                        >
                          alice.smith@company.com
                        </button>
                        <button
                          key="bob"
                          type="button"
                          onClick={() => {
                            setFilters({
                              ...filters,
                              user: 'bob.jones@company.com',
                              page: 1,
                            });
                            setFilterDialogOpen(null);
                          }}
                          className="w-full px-4 py-2 text-left text-sm text-gray-700 transition-colors hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
                        >
                          bob.jones@company.com
                        </button>
                        <button
                          key="carol"
                          type="button"
                          onClick={() => {
                            setFilters({
                              ...filters,
                              user: 'carol.taylor@company.com',
                              page: 1,
                            });
                            setFilterDialogOpen(null);
                          }}
                          className="w-full px-4 py-2 text-left text-sm text-gray-700 transition-colors hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
                        >
                          carol.taylor@company.com
                        </button>
                        <button
                          key="dave"
                          type="button"
                          onClick={() => {
                            setFilters({
                              ...filters,
                              user: 'dave.wilson@company.com',
                              page: 1,
                            });
                            setFilterDialogOpen(null);
                          }}
                          className="w-full px-4 py-2 text-left text-sm text-gray-700 transition-colors hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
                        >
                          dave.wilson@company.com
                        </button>
                        <button
                          key="emily"
                          type="button"
                          onClick={() => {
                            setFilters({
                              ...filters,
                              user: 'emily.williams@company.com',
                              page: 1,
                            });
                            setFilterDialogOpen(null);
                          }}
                          className="w-full px-4 py-2 text-left text-sm text-gray-700 transition-colors hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
                        >
                          emily.williams@company.com
                        </button>
                      </div>
                    </div>
                  )}
                </div>
                <div>
                  <label className="mb-2 block text-sm text-gray-700 dark:text-gray-300">
                    Search
                  </label>
                  <div className="relative">
                    <div className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 transform">
                      <svg
                        className="h-5 w-5 text-gray-400"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                        />
                      </svg>
                    </div>
                    <input
                      type="text"
                      placeholder="Search..."
                      className="input w-full bg-transparent pl-10 focus:outline-none focus:ring-0 focus:ring-offset-0"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Table */}
          <div className="card group">
            <div
              className="card-content overflow-x-auto p-0 pt-2"
              style={{
                scrollbarWidth: 'thin',
                scrollbarColor: '#121212 transparent',
              }}
            >
              <table className="w-full min-w-max">
                {(filters.status === 'conversation' ||
                  filters.status === 'response' ||
                  (data?.requests && data.requests.length > 0)) && (
                  <thead className="sticky top-0 z-10 border-b border-[#242424] bg-transparent">
                    <tr>
                      {filters.status === 'conversation' ? (
                        <>
                          <th className="bg-card w-10 whitespace-nowrap px-4 py-3 text-left text-xs font-medium uppercase text-gray-500"></th>
                          <th className="bg-card whitespace-nowrap px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">
                            Session
                          </th>
                          <th className="bg-card whitespace-nowrap px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">
                            User
                          </th>
                          <th className="bg-card whitespace-nowrap px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">
                            Last activity
                          </th>
                          <th className="bg-card whitespace-nowrap px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">
                            Message count
                          </th>
                          <th className="bg-card whitespace-nowrap px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">
                            Total tokens
                          </th>
                          <th className="bg-card whitespace-nowrap px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">
                            Total cost
                          </th>
                          <th className="bg-card whitespace-nowrap px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">
                            Status
                          </th>
                        </>
                      ) : (
                        <>
                          <th className="bg-card w-10 whitespace-nowrap px-4 py-3 text-left text-xs font-medium uppercase text-gray-500"></th>
                          <th className="bg-card whitespace-nowrap px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">
                            Request ID
                          </th>
                          <th className="bg-card whitespace-nowrap px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">
                            User
                          </th>
                          <th className="bg-card whitespace-nowrap px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">
                            Provider
                          </th>
                          <th className="bg-card whitespace-nowrap px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">
                            Status
                          </th>
                          <th className="bg-card whitespace-nowrap px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">
                            Tokens / Cost
                          </th>
                          <th className="bg-card whitespace-nowrap px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">
                            PII Detected
                          </th>
                          <th className="bg-card whitespace-nowrap px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">
                            PHI Detected
                          </th>
                          <th className="bg-card whitespace-nowrap px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">
                            Duration
                          </th>
                        </>
                      )}
                    </tr>
                  </thead>
                )}
                <tbody className="[&>tr]:border-b [&>tr]:border-[#242424]">
                  {filters.status === 'conversation' ? (
                    <>
                      <>
                        <tr
                          onClick={() => toggleRow('conv_8f3a9b2c1d4e')}
                          className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 [&>td]:border-t [&>td]:border-[#242424]"
                        >
                          <ChevronIcon
                            expanded={expandedRows.has('conv_8f3a9b2c1d4e')}
                            id="conv_8f3a9b2c1d4e"
                          />
                          <td className="whitespace-nowrap px-4 py-3 text-sm text-[#888f98]">
                            <div className="flex flex-col gap-1">
                              <span className="font-medium">
                                Customer Support Chat
                              </span>
                              <span className="font-mono text-xs text-[#888f98]">
                                conv_8f3a9b2c1d4e
                              </span>
                            </div>
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-sm text-[#888f98]">
                            john.doe@company.com
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-sm text-[#888f98]">
                            Dec 15, 2024 10:45 AM
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-sm text-[#888f98]">
                            14
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-sm text-[#888f98]">
                            45,230
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-sm text-[#888f98]">
                            $0.0245
                          </td>
                          <td className="px-3 py-2 text-sm text-[#888f98]">
                            <div className="flex items-center gap-2">
                              <span className="h-2 w-2 rounded-full bg-green-400"></span>
                              <span>Active</span>
                            </div>
                          </td>
                        </tr>
                        {expandedRows.has('conv_8f3a9b2c1d4e') && (
                          <tr>
                            <td
                              colSpan={9}
                              className="bg-gray-50 px-3 py-4 dark:!bg-[#0a0a0a]"
                            >
                              <div className="space-y-3">
                                <div className="grid grid-cols-4 gap-2 pl-[3.2125rem] text-left text-xs">
                                  <div>
                                    <span className="font-medium text-gray-600 dark:text-gray-400">
                                      Session ID:
                                    </span>
                                    <span className="ml-2 text-gray-900 dark:text-white">
                                      conv_8f3a9b2c1d4e
                                    </span>
                                  </div>
                                  <div>
                                    <span className="font-medium text-gray-600 dark:text-gray-400">
                                      User:
                                    </span>
                                    <span className="ml-2 text-gray-900 dark:text-white">
                                      john.doe@company.com
                                    </span>
                                  </div>
                                  <div>
                                    <span className="font-medium text-gray-600 dark:text-gray-400">
                                      Started:
                                    </span>
                                    <span className="ml-2 text-gray-900 dark:text-white">
                                      Dec 15, 2024 10:23 AM
                                    </span>
                                  </div>
                                  <div>
                                    <span className="font-medium text-gray-600 dark:text-gray-400">
                                      Last Activity:
                                    </span>
                                    <span className="ml-2 text-gray-900 dark:text-white">
                                      Dec 15, 2024 10:45 AM
                                    </span>
                                  </div>
                                  <div>
                                    <span className="font-medium text-gray-600 dark:text-gray-400">
                                      Messages:
                                    </span>
                                    <span className="ml-2 text-gray-900 dark:text-white">
                                      14
                                    </span>
                                  </div>
                                  <div>
                                    <span className="font-medium text-gray-600 dark:text-gray-400">
                                      Total Tokens:
                                    </span>
                                    <span className="ml-2 text-gray-900 dark:text-white">
                                      45,230
                                    </span>
                                  </div>
                                  <div>
                                    <span className="font-medium text-gray-600 dark:text-gray-400">
                                      Total Cost:
                                    </span>
                                    <span className="ml-2 text-gray-900 dark:text-white">
                                      $0.0245
                                    </span>
                                  </div>
                                  <div>
                                    <span className="font-medium text-gray-600 dark:text-gray-400">
                                      Status:
                                    </span>
                                    <span className="ml-2 text-green-400">
                                      Active
                                    </span>
                                  </div>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </>
                      <>
                        <tr
                          onClick={() => toggleRow('conv_7e2d8a1b5c3f')}
                          className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800"
                        >
                          <ChevronIcon
                            expanded={expandedRows.has('conv_7e2d8a1b5c3f')}
                            id="conv_7e2d8a1b5c3f"
                          />
                          <td className="whitespace-nowrap px-4 py-3 text-sm text-[#888f98]">
                            <div className="flex flex-col gap-1">
                              <span className="font-medium">
                                Product Q&A Session
                              </span>
                              <span className="font-mono text-xs text-[#888f98]">
                                conv_7e2d8a1b5c3f
                              </span>
                            </div>
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-sm text-[#888f98]">
                            sarah.smith@company.com
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-sm text-[#888f98]">
                            Dec 15, 2024 09:32 AM
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-sm text-[#888f98]">
                            8
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-sm text-[#888f98]">
                            28,450
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-sm text-[#888f98]">
                            $0.0156
                          </td>
                          <td className="px-3 py-2 text-sm text-[#888f98]">
                            <div className="flex items-center gap-2">
                              <span className="h-2 w-2 rounded-full bg-blue-400"></span>
                              <span>Completed</span>
                            </div>
                          </td>
                        </tr>
                        {expandedRows.has('conv_7e2d8a1b5c3f') && (
                          <tr>
                            <td
                              colSpan={9}
                              className="bg-gray-50 px-3 py-4 dark:!bg-[#0a0a0a]"
                            >
                              <div className="space-y-3">
                                <div className="grid grid-cols-4 gap-2 pl-[3.2125rem] text-left text-xs">
                                  <div>
                                    <span className="font-medium text-gray-600 dark:text-gray-400">
                                      Session ID:
                                    </span>
                                    <span className="ml-2 text-gray-900 dark:text-white">
                                      conv_7e2d8a1b5c3f
                                    </span>
                                  </div>
                                  <div>
                                    <span className="font-medium text-gray-600 dark:text-gray-400">
                                      User:
                                    </span>
                                    <span className="ml-2 text-gray-900 dark:text-white">
                                      sarah.smith@company.com
                                    </span>
                                  </div>
                                  <div>
                                    <span className="font-medium text-gray-600 dark:text-gray-400">
                                      Started:
                                    </span>
                                    <span className="ml-2 text-gray-900 dark:text-white">
                                      Dec 15, 2024 09:15 AM
                                    </span>
                                  </div>
                                  <div>
                                    <span className="font-medium text-gray-600 dark:text-gray-400">
                                      Last Activity:
                                    </span>
                                    <span className="ml-2 text-gray-900 dark:text-white">
                                      Dec 15, 2024 09:32 AM
                                    </span>
                                  </div>
                                  <div>
                                    <span className="font-medium text-gray-600 dark:text-gray-400">
                                      Messages:
                                    </span>
                                    <span className="ml-2 text-gray-900 dark:text-white">
                                      8
                                    </span>
                                  </div>
                                  <div>
                                    <span className="font-medium text-gray-600 dark:text-gray-400">
                                      Total Tokens:
                                    </span>
                                    <span className="ml-2 text-gray-900 dark:text-white">
                                      28,450
                                    </span>
                                  </div>
                                  <div>
                                    <span className="font-medium text-gray-600 dark:text-gray-400">
                                      Total Cost:
                                    </span>
                                    <span className="ml-2 text-gray-900 dark:text-white">
                                      $0.0156
                                    </span>
                                  </div>
                                  <div>
                                    <span className="font-medium text-gray-600 dark:text-gray-400">
                                      Status:
                                    </span>
                                    <span className="ml-2 text-blue-400">
                                      Completed
                                    </span>
                                  </div>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </>
                      <>
                        <tr
                          onClick={() => toggleRow('conv_6d1c7b0a4e3d')}
                          className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800"
                        >
                          <ChevronIcon
                            expanded={expandedRows.has('conv_6d1c7b0a4e3d')}
                            id="conv_6d1c7b0a4e3d"
                          />
                          <td className="whitespace-nowrap px-4 py-3 text-sm text-[#888f98]">
                            <div className="flex flex-col gap-1">
                              <span className="font-medium">
                                Technical Support Discussion
                              </span>
                              <span className="font-mono text-xs text-[#888f98]">
                                conv_6d1c7b0a4e3d
                              </span>
                            </div>
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-sm text-[#888f98]">
                            mike.johnson@company.com
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-sm text-[#888f98]">
                            Dec 14, 2024 04:12 PM
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-sm text-[#888f98]">
                            22
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-sm text-[#888f98]">
                            89,340
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-sm text-[#888f98]">
                            $0.0487
                          </td>
                          <td className="px-3 py-2 text-sm text-[#888f98]">
                            <div className="flex items-center gap-2">
                              <span className="h-2 w-2 rounded-full bg-green-400"></span>
                              <span>Active</span>
                            </div>
                          </td>
                        </tr>
                        {expandedRows.has('conv_6d1c7b0a4e3d') && (
                          <tr>
                            <td
                              colSpan={9}
                              className="bg-gray-50 px-3 py-4 dark:!bg-[#0a0a0a]"
                            >
                              <div className="space-y-3">
                                <div className="grid grid-cols-4 gap-2 pl-[3.2125rem] text-left text-xs">
                                  <div>
                                    <span className="font-medium text-gray-600 dark:text-gray-400">
                                      Session ID:
                                    </span>
                                    <span className="ml-2 text-gray-900 dark:text-white">
                                      conv_6d1c7b0a4e3d
                                    </span>
                                  </div>
                                  <div>
                                    <span className="font-medium text-gray-600 dark:text-gray-400">
                                      User:
                                    </span>
                                    <span className="ml-2 text-gray-900 dark:text-white">
                                      mike.johnson@company.com
                                    </span>
                                  </div>
                                  <div>
                                    <span className="font-medium text-gray-600 dark:text-gray-400">
                                      Started:
                                    </span>
                                    <span className="ml-2 text-gray-900 dark:text-white">
                                      Dec 14, 2024 03:45 PM
                                    </span>
                                  </div>
                                  <div>
                                    <span className="font-medium text-gray-600 dark:text-gray-400">
                                      Last Activity:
                                    </span>
                                    <span className="ml-2 text-gray-900 dark:text-white">
                                      Dec 14, 2024 04:12 PM
                                    </span>
                                  </div>
                                  <div>
                                    <span className="font-medium text-gray-600 dark:text-gray-400">
                                      Messages:
                                    </span>
                                    <span className="ml-2 text-gray-900 dark:text-white">
                                      22
                                    </span>
                                  </div>
                                  <div>
                                    <span className="font-medium text-gray-600 dark:text-gray-400">
                                      Total Tokens:
                                    </span>
                                    <span className="ml-2 text-gray-900 dark:text-white">
                                      89,340
                                    </span>
                                  </div>
                                  <div>
                                    <span className="font-medium text-gray-600 dark:text-gray-400">
                                      Total Cost:
                                    </span>
                                    <span className="ml-2 text-gray-900 dark:text-white">
                                      $0.0487
                                    </span>
                                  </div>
                                  <div>
                                    <span className="font-medium text-gray-600 dark:text-gray-400">
                                      Status:
                                    </span>
                                    <span className="ml-2 text-green-400">
                                      Active
                                    </span>
                                  </div>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </>
                      <>
                        <tr
                          onClick={() => toggleRow('conv_5c0b6a9d3c2e')}
                          className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800"
                        >
                          <ChevronIcon
                            expanded={expandedRows.has('conv_5c0b6a9d3c2e')}
                            id="conv_5c0b6a9d3c2e"
                          />
                          <td className="whitespace-nowrap px-4 py-3 text-sm text-[#888f98]">
                            <div className="flex flex-col gap-1">
                              <span className="font-medium">Sales Inquiry</span>
                              <span className="font-mono text-xs text-[#888f98]">
                                conv_5c0b6a9d3c2e
                              </span>
                            </div>
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-sm text-[#888f98]">
                            emily.williams@company.com
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-sm text-[#888f98]">
                            Dec 14, 2024 01:41 PM
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-sm text-[#888f98]">
                            6
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-sm text-[#888f98]">
                            19,220
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-sm text-[#888f98]">
                            $0.0103
                          </td>
                          <td className="px-3 py-2 text-sm text-[#888f98]">
                            <div className="flex items-center gap-2">
                              <span className="h-2 w-2 rounded-full bg-purple-400"></span>
                              <span>Archived</span>
                            </div>
                          </td>
                        </tr>
                        {expandedRows.has('conv_5c0b6a9d3c2e') && (
                          <tr>
                            <td
                              colSpan={9}
                              className="bg-gray-50 px-3 py-4 dark:!bg-[#0a0a0a]"
                            >
                              <div className="space-y-3">
                                <div className="grid grid-cols-4 gap-2 pl-[3.2125rem] text-left text-xs">
                                  <div>
                                    <span className="font-medium text-gray-600 dark:text-gray-400">
                                      Session ID:
                                    </span>
                                    <span className="ml-2 text-gray-900 dark:text-white">
                                      conv_5c0b6a9d3c2e
                                    </span>
                                  </div>
                                  <div>
                                    <span className="font-medium text-gray-600 dark:text-gray-400">
                                      User:
                                    </span>
                                    <span className="ml-2 text-gray-900 dark:text-white">
                                      emily.williams@company.com
                                    </span>
                                  </div>
                                  <div>
                                    <span className="font-medium text-gray-600 dark:text-gray-400">
                                      Started:
                                    </span>
                                    <span className="ml-2 text-gray-900 dark:text-white">
                                      Dec 14, 2024 01:30 PM
                                    </span>
                                  </div>
                                  <div>
                                    <span className="font-medium text-gray-600 dark:text-gray-400">
                                      Last Activity:
                                    </span>
                                    <span className="ml-2 text-gray-900 dark:text-white">
                                      Dec 14, 2024 01:41 PM
                                    </span>
                                  </div>
                                  <div>
                                    <span className="font-medium text-gray-600 dark:text-gray-400">
                                      Messages:
                                    </span>
                                    <span className="ml-2 text-gray-900 dark:text-white">
                                      6
                                    </span>
                                  </div>
                                  <div>
                                    <span className="font-medium text-gray-600 dark:text-gray-400">
                                      Total Tokens:
                                    </span>
                                    <span className="ml-2 text-gray-900 dark:text-white">
                                      19,220
                                    </span>
                                  </div>
                                  <div>
                                    <span className="font-medium text-gray-600 dark:text-gray-400">
                                      Total Cost:
                                    </span>
                                    <span className="ml-2 text-gray-900 dark:text-white">
                                      $0.0103
                                    </span>
                                  </div>
                                  <div>
                                    <span className="font-medium text-gray-600 dark:text-gray-400">
                                      Status:
                                    </span>
                                    <span className="ml-2 text-purple-400">
                                      Archived
                                    </span>
                                  </div>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </>
                      <>
                        <tr
                          onClick={() => toggleRow('conv_4b9a58e2c1d0')}
                          className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800"
                        >
                          <ChevronIcon
                            expanded={expandedRows.has('conv_4b9a58e2c1d0')}
                            id="conv_4b9a58e2c1d0"
                          />
                          <td className="whitespace-nowrap px-4 py-3 text-sm text-[#888f98]">
                            <div className="flex flex-col gap-1">
                              <span className="font-medium">
                                Billing Question
                              </span>
                              <span className="font-mono text-xs text-[#888f98]">
                                conv_4b9a58e2c1d0
                              </span>
                            </div>
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-sm text-[#888f98]">
                            david.brown@company.com
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-sm text-[#888f98]">
                            Dec 14, 2024 11:22 AM
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-sm text-[#888f98]">
                            12
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-sm text-[#888f98]">
                            32,180
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-sm text-[#888f98]">
                            $0.0174
                          </td>
                          <td className="px-3 py-2 text-sm text-[#888f98]">
                            <div className="flex items-center gap-2">
                              <span className="h-2 w-2 rounded-full bg-blue-400"></span>
                              <span>Completed</span>
                            </div>
                          </td>
                        </tr>
                        {expandedRows.has('conv_4b9a58e2c1d0') && (
                          <tr>
                            <td
                              colSpan={9}
                              className="bg-gray-50 px-3 py-4 dark:!bg-[#0a0a0a]"
                            >
                              <div className="space-y-3">
                                <div className="grid grid-cols-4 gap-2 pl-[3.2125rem] text-left text-xs">
                                  <div>
                                    <span className="font-medium text-gray-600 dark:text-gray-400">
                                      Session ID:
                                    </span>
                                    <span className="ml-2 text-gray-900 dark:text-white">
                                      conv_4b9a58e2c1d0
                                    </span>
                                  </div>
                                  <div>
                                    <span className="font-medium text-gray-600 dark:text-gray-400">
                                      User:
                                    </span>
                                    <span className="ml-2 text-gray-900 dark:text-white">
                                      david.brown@company.com
                                    </span>
                                  </div>
                                  <div>
                                    <span className="font-medium text-gray-600 dark:text-gray-400">
                                      Started:
                                    </span>
                                    <span className="ml-2 text-gray-900 dark:text-white">
                                      Dec 14, 2024 11:00 AM
                                    </span>
                                  </div>
                                  <div>
                                    <span className="font-medium text-gray-600 dark:text-gray-400">
                                      Last Activity:
                                    </span>
                                    <span className="ml-2 text-gray-900 dark:text-white">
                                      Dec 14, 2024 11:22 AM
                                    </span>
                                  </div>
                                  <div>
                                    <span className="font-medium text-gray-600 dark:text-gray-400">
                                      Messages:
                                    </span>
                                    <span className="ml-2 text-gray-900 dark:text-white">
                                      12
                                    </span>
                                  </div>
                                  <div>
                                    <span className="font-medium text-gray-600 dark:text-gray-400">
                                      Total Tokens:
                                    </span>
                                    <span className="ml-2 text-gray-900 dark:text-white">
                                      32,180
                                    </span>
                                  </div>
                                  <div>
                                    <span className="font-medium text-gray-600 dark:text-gray-400">
                                      Total Cost:
                                    </span>
                                    <span className="ml-2 text-gray-900 dark:text-white">
                                      $0.0174
                                    </span>
                                  </div>
                                  <div>
                                    <span className="font-medium text-gray-600 dark:text-gray-400">
                                      Status:
                                    </span>
                                    <span className="ml-2 text-blue-400">
                                      Completed
                                    </span>
                                  </div>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </>
                      {generateSampleConversations(
                        conversationStartIndex,
                        conversationEndIndex
                      )}
                    </>
                  ) : filters.status === 'response' ? (
                    <>
                      <>
                        <tr
                          onClick={() => toggleRow('req_001')}
                          className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 [&>td:first-child]:border-t [&>td:first-child]:border-[#242424]"
                        >
                          <ChevronIcon
                            expanded={expandedRows.has('req_001')}
                            id="req_001"
                          />
                          <td className="whitespace-nowrap px-4 py-3 text-sm text-[#888f98]">
                            <div className="flex flex-col gap-1">
                              <button
                                onClick={e => {
                                  e.stopPropagation();
                                  router.push(`/audit/requests/req_001`);
                                }}
                                className="text-left font-mono hover:text-purple-400"
                              >
                                req_8a3b9c2d...
                              </button>
                              <span className="text-xs text-[#888f98]">
                                Dec 15, 2024 10:23 AM
                              </span>
                            </div>
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-sm text-[#888f98]">
                            alice.smith@company.com
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-sm text-[#888f98]">
                            <div className="flex flex-col gap-1">
                              <span>OpenAI</span>
                              <span className="text-xs text-[#888f98]">
                                gpt-4
                              </span>
                            </div>
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-sm text-[#888f98]">
                            <div className="flex items-center gap-2">
                              <span className="h-2 w-2 rounded-full bg-green-400"></span>
                              <span>completed</span>
                            </div>
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-sm text-[#888f98]">
                            <div className="flex flex-col gap-1">
                              <span>1,245 / 892</span>
                              <span className="text-xs text-[#888f98]">
                                $0.0245
                              </span>
                            </div>
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-sm text-[#888f98]">
                            <span className="text-gray-500">—</span>
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-sm text-[#888f98]">
                            <span className="text-gray-500">—</span>
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-sm text-[#888f98]">
                            1.2s
                          </td>
                        </tr>
                        {expandedRows.has('req_001') && (
                          <tr>
                            <td
                              colSpan={9}
                              className="bg-gray-50 px-3 py-4 dark:!bg-[#0a0a0a]"
                            >
                              <div className="space-y-3">
                                <div className="grid grid-cols-4 gap-2 pl-[3.2125rem] text-left text-xs">
                                  <div>
                                    <span className="font-medium text-gray-600 dark:text-gray-400">
                                      Request ID:
                                    </span>
                                    <span className="ml-2 text-gray-900 dark:text-white">
                                      req_8a3b9c2d
                                    </span>
                                  </div>
                                  <div>
                                    <span className="font-medium text-gray-600 dark:text-gray-400">
                                      Timestamp:
                                    </span>
                                    <span className="ml-2 text-gray-900 dark:text-white">
                                      Dec 15, 2024 10:23 AM
                                    </span>
                                  </div>
                                  <div>
                                    <span className="font-medium text-gray-600 dark:text-gray-400">
                                      Provider:
                                    </span>
                                    <span className="ml-2 text-gray-900 dark:text-white">
                                      OpenAI
                                    </span>
                                  </div>
                                  <div>
                                    <span className="font-medium text-gray-600 dark:text-gray-400">
                                      Model:
                                    </span>
                                    <span className="ml-2 text-gray-900 dark:text-white">
                                      gpt-4
                                    </span>
                                  </div>
                                  <div>
                                    <span className="font-medium text-gray-600 dark:text-gray-400">
                                      Status:
                                    </span>
                                    <span className="ml-2 text-gray-900 dark:text-white">
                                      completed
                                    </span>
                                  </div>
                                  <div>
                                    <span className="font-medium text-gray-600 dark:text-gray-400">
                                      Input Tokens:
                                    </span>
                                    <span className="ml-2 text-gray-900 dark:text-white">
                                      1,245
                                    </span>
                                  </div>
                                  <div>
                                    <span className="font-medium text-gray-600 dark:text-gray-400">
                                      Output Tokens:
                                    </span>
                                    <span className="ml-2 text-gray-900 dark:text-white">
                                      892
                                    </span>
                                  </div>
                                  <div>
                                    <span className="font-medium text-gray-600 dark:text-gray-400">
                                      Cost:
                                    </span>
                                    <span className="ml-2 text-gray-900 dark:text-white">
                                      $0.0245
                                    </span>
                                  </div>
                                  <div>
                                    <span className="font-medium text-gray-600 dark:text-gray-400">
                                      Duration:
                                    </span>
                                    <span className="ml-2 text-gray-900 dark:text-white">
                                      1.2s
                                    </span>
                                  </div>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </>
                      <>
                        <tr
                          onClick={() => toggleRow('req_002')}
                          className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800"
                        >
                          <ChevronIcon
                            expanded={expandedRows.has('req_002')}
                            id="req_002"
                          />
                          <td className="whitespace-nowrap px-4 py-3 text-sm text-[#888f98]">
                            <div className="flex flex-col gap-1">
                              <button
                                onClick={e => {
                                  e.stopPropagation();
                                  router.push(`/audit/requests/req_002`);
                                }}
                                className="text-left font-mono hover:text-purple-400"
                              >
                                req_7e2f4a1b...
                              </button>
                              <span className="text-xs text-[#888f98]">
                                Dec 15, 2024 09:15 AM
                              </span>
                            </div>
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-sm text-[#888f98]">
                            bob.jones@company.com
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-sm text-[#888f98]">
                            <div className="flex flex-col gap-1">
                              <span>Anthropic</span>
                              <span className="text-xs text-[#888f98]">
                                claude-3.5-sonnet
                              </span>
                            </div>
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-sm text-[#888f98]">
                            <div className="flex items-center gap-2">
                              <span className="h-2 w-2 rounded-full bg-green-400"></span>
                              <span>completed</span>
                            </div>
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-sm text-[#888f98]">
                            <div className="flex flex-col gap-1">
                              <span>890 / 567</span>
                              <span className="text-xs text-[#888f98]">
                                $0.0156
                              </span>
                            </div>
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-sm text-[#888f98]">
                            <span className="text-red-400">PII: 2</span>
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-sm text-[#888f98]">
                            <span className="text-gray-500">—</span>
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-sm text-[#888f98]">
                            0.8s
                          </td>
                        </tr>
                        {expandedRows.has('req_002') && (
                          <tr>
                            <td
                              colSpan={9}
                              className="bg-gray-50 px-3 py-4 dark:!bg-[#0a0a0a]"
                            >
                              <div className="space-y-3">
                                <div className="grid grid-cols-4 gap-2 pl-[3.2125rem] text-left text-xs">
                                  <div>
                                    <span className="font-medium text-gray-600 dark:text-gray-400">
                                      Request ID:
                                    </span>
                                    <span className="ml-2 text-gray-900 dark:text-white">
                                      req_7e2f4a1b
                                    </span>
                                  </div>
                                  <div>
                                    <span className="font-medium text-gray-600 dark:text-gray-400">
                                      Timestamp:
                                    </span>
                                    <span className="ml-2 text-gray-900 dark:text-white">
                                      Dec 15, 2024 09:15 AM
                                    </span>
                                  </div>
                                  <div>
                                    <span className="font-medium text-gray-600 dark:text-gray-400">
                                      Provider:
                                    </span>
                                    <span className="ml-2 text-gray-900 dark:text-white">
                                      Anthropic
                                    </span>
                                  </div>
                                  <div>
                                    <span className="font-medium text-gray-600 dark:text-gray-400">
                                      Model:
                                    </span>
                                    <span className="ml-2 text-gray-900 dark:text-white">
                                      claude-3.5-sonnet
                                    </span>
                                  </div>
                                  <div>
                                    <span className="font-medium text-gray-600 dark:text-gray-400">
                                      Status:
                                    </span>
                                    <span className="ml-2 text-gray-900 dark:text-white">
                                      completed
                                    </span>
                                  </div>
                                  <div>
                                    <span className="font-medium text-gray-600 dark:text-gray-400">
                                      Input Tokens:
                                    </span>
                                    <span className="ml-2 text-gray-900 dark:text-white">
                                      890
                                    </span>
                                  </div>
                                  <div>
                                    <span className="font-medium text-gray-600 dark:text-gray-400">
                                      Output Tokens:
                                    </span>
                                    <span className="ml-2 text-gray-900 dark:text-white">
                                      567
                                    </span>
                                  </div>
                                  <div>
                                    <span className="font-medium text-gray-600 dark:text-gray-400">
                                      Cost:
                                    </span>
                                    <span className="ml-2 text-gray-900 dark:text-white">
                                      $0.0156
                                    </span>
                                  </div>
                                  <div>
                                    <span className="font-medium text-gray-600 dark:text-gray-400">
                                      PII Detected:
                                    </span>
                                    <span className="ml-2 text-red-400">2</span>
                                  </div>
                                  <div>
                                    <span className="font-medium text-gray-600 dark:text-gray-400">
                                      Duration:
                                    </span>
                                    <span className="ml-2 text-gray-900 dark:text-white">
                                      0.8s
                                    </span>
                                  </div>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </>
                      <>
                        <tr
                          onClick={() => toggleRow('req_003')}
                          className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800"
                        >
                          <ChevronIcon
                            expanded={expandedRows.has('req_003')}
                            id="req_003"
                          />
                          <td className="whitespace-nowrap px-4 py-3 text-sm text-[#888f98]">
                            <div className="flex flex-col gap-1">
                              <button
                                onClick={e => {
                                  e.stopPropagation();
                                  router.push(`/audit/requests/req_003`);
                                }}
                                className="text-left font-mono hover:text-purple-400"
                              >
                                req_6d1c8e3f...
                              </button>
                              <span className="text-xs text-[#888f98]">
                                Dec 14, 2024 03:45 PM
                              </span>
                            </div>
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-sm text-[#888f98]">
                            carol.taylor@company.com
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-sm text-[#888f98]">
                            <div className="flex flex-col gap-1">
                              <span>OpenAI</span>
                              <span className="text-xs text-[#888f98]">
                                gpt-3.5-turbo
                              </span>
                            </div>
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-sm text-[#888f98]">
                            <div className="flex items-center gap-2">
                              <span className="h-2 w-2 rounded-full bg-red-400"></span>
                              <span>error</span>
                            </div>
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-sm text-[#888f98]">
                            <div className="flex flex-col gap-1">
                              <span>1,450 / 0</span>
                              <span className="text-xs text-[#888f98]">
                                $0.0000
                              </span>
                            </div>
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-sm text-[#888f98]">
                            <span className="text-red-400">PII: 3</span>
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-sm text-[#888f98]">
                            <span className="text-orange-400">PHI: 1</span>
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-sm text-[#888f98]">
                            0.3s
                          </td>
                        </tr>
                        {expandedRows.has('req_003') && (
                          <tr>
                            <td
                              colSpan={9}
                              className="bg-gray-50 px-3 py-4 dark:!bg-[#0a0a0a]"
                            >
                              <div className="space-y-3">
                                <div className="grid grid-cols-4 gap-2 pl-[3.2125rem] text-left text-xs">
                                  <div>
                                    <span className="font-medium text-gray-600 dark:text-gray-400">
                                      Request ID:
                                    </span>
                                    <span className="ml-2 text-gray-900 dark:text-white">
                                      req_6d1c8e3f
                                    </span>
                                  </div>
                                  <div>
                                    <span className="font-medium text-gray-600 dark:text-gray-400">
                                      Timestamp:
                                    </span>
                                    <span className="ml-2 text-gray-900 dark:text-white">
                                      Dec 14, 2024 03:45 PM
                                    </span>
                                  </div>
                                  <div>
                                    <span className="font-medium text-gray-600 dark:text-gray-400">
                                      Provider:
                                    </span>
                                    <span className="ml-2 text-gray-900 dark:text-white">
                                      OpenAI
                                    </span>
                                  </div>
                                  <div>
                                    <span className="font-medium text-gray-600 dark:text-gray-400">
                                      Model:
                                    </span>
                                    <span className="ml-2 text-gray-900 dark:text-white">
                                      gpt-3.5-turbo
                                    </span>
                                  </div>
                                  <div>
                                    <span className="font-medium text-gray-600 dark:text-gray-400">
                                      Status:
                                    </span>
                                    <span className="ml-2 text-red-400">
                                      error
                                    </span>
                                  </div>
                                  <div>
                                    <span className="font-medium text-gray-600 dark:text-gray-400">
                                      Input Tokens:
                                    </span>
                                    <span className="ml-2 text-gray-900 dark:text-white">
                                      1,450
                                    </span>
                                  </div>
                                  <div>
                                    <span className="font-medium text-gray-600 dark:text-gray-400">
                                      Output Tokens:
                                    </span>
                                    <span className="ml-2 text-gray-900 dark:text-white">
                                      0
                                    </span>
                                  </div>
                                  <div>
                                    <span className="font-medium text-gray-600 dark:text-gray-400">
                                      Cost:
                                    </span>
                                    <span className="ml-2 text-gray-900 dark:text-white">
                                      $0.0000
                                    </span>
                                  </div>
                                  <div>
                                    <span className="font-medium text-gray-600 dark:text-gray-400">
                                      PII Detected:
                                    </span>
                                    <span className="ml-2 text-red-400">3</span>
                                  </div>
                                  <div>
                                    <span className="font-medium text-gray-600 dark:text-gray-400">
                                      PHI Detected:
                                    </span>
                                    <span className="ml-2 text-orange-400">
                                      1
                                    </span>
                                  </div>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </>
                      <>
                        <tr
                          onClick={() => toggleRow('req_004')}
                          className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800"
                        >
                          <ChevronIcon
                            expanded={expandedRows.has('req_004')}
                            id="req_004"
                          />
                          <td className="whitespace-nowrap px-4 py-3 text-sm text-[#888f98]">
                            <div className="flex flex-col gap-1">
                              <button
                                onClick={e => {
                                  e.stopPropagation();
                                  router.push(`/audit/requests/req_004`);
                                }}
                                className="text-left font-mono hover:text-purple-400"
                              >
                                req_5b0a9d4e...
                              </button>
                              <span className="text-xs text-[#888f98]">
                                Dec 14, 2024 01:30 PM
                              </span>
                            </div>
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-sm text-[#888f98]">
                            dave.wilson@company.com
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-sm text-[#888f98]">
                            <div className="flex flex-col gap-1">
                              <span>Google</span>
                              <span className="text-xs text-[#888f98]">
                                gemini-pro
                              </span>
                            </div>
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-sm text-[#888f98]">
                            <div className="flex items-center gap-2">
                              <span className="h-2 w-2 rounded-full bg-green-400"></span>
                              <span>completed</span>
                            </div>
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-sm text-[#888f98]">
                            <div className="flex flex-col gap-1">
                              <span>567 / 234</span>
                              <span className="text-xs text-[#888f98]">
                                $0.0089
                              </span>
                            </div>
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-sm text-[#888f98]">
                            <span className="text-gray-500">—</span>
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-sm text-[#888f98]">
                            <span className="text-gray-500">—</span>
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-sm text-[#888f98]">
                            0.5s
                          </td>
                        </tr>
                        {expandedRows.has('req_004') && (
                          <tr>
                            <td
                              colSpan={9}
                              className="bg-gray-50 px-3 py-4 dark:!bg-[#0a0a0a]"
                            >
                              <div className="space-y-3">
                                <div className="grid grid-cols-4 gap-2 pl-[3.2125rem] text-left text-xs">
                                  <div>
                                    <span className="font-medium text-gray-600 dark:text-gray-400">
                                      Request ID:
                                    </span>
                                    <span className="ml-2 text-gray-900 dark:text-white">
                                      req_5b0a9d4e
                                    </span>
                                  </div>
                                  <div>
                                    <span className="font-medium text-gray-600 dark:text-gray-400">
                                      Timestamp:
                                    </span>
                                    <span className="ml-2 text-gray-900 dark:text-white">
                                      Dec 14, 2024 01:30 PM
                                    </span>
                                  </div>
                                  <div>
                                    <span className="font-medium text-gray-600 dark:text-gray-400">
                                      Provider:
                                    </span>
                                    <span className="ml-2 text-gray-900 dark:text-white">
                                      Google
                                    </span>
                                  </div>
                                  <div>
                                    <span className="font-medium text-gray-600 dark:text-gray-400">
                                      Model:
                                    </span>
                                    <span className="ml-2 text-gray-900 dark:text-white">
                                      gemini-pro
                                    </span>
                                  </div>
                                  <div>
                                    <span className="font-medium text-gray-600 dark:text-gray-400">
                                      Status:
                                    </span>
                                    <span className="ml-2 text-gray-900 dark:text-white">
                                      completed
                                    </span>
                                  </div>
                                  <div>
                                    <span className="font-medium text-gray-600 dark:text-gray-400">
                                      Input Tokens:
                                    </span>
                                    <span className="ml-2 text-gray-900 dark:text-white">
                                      567
                                    </span>
                                  </div>
                                  <div>
                                    <span className="font-medium text-gray-600 dark:text-gray-400">
                                      Output Tokens:
                                    </span>
                                    <span className="ml-2 text-gray-900 dark:text-white">
                                      234
                                    </span>
                                  </div>
                                  <div>
                                    <span className="font-medium text-gray-600 dark:text-gray-400">
                                      Cost:
                                    </span>
                                    <span className="ml-2 text-gray-900 dark:text-white">
                                      $0.0089
                                    </span>
                                  </div>
                                  <div>
                                    <span className="font-medium text-gray-600 dark:text-gray-400">
                                      Duration:
                                    </span>
                                    <span className="ml-2 text-gray-900 dark:text-white">
                                      0.5s
                                    </span>
                                  </div>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </>
                      <>
                        <tr
                          onClick={() => toggleRow('req_005')}
                          className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800"
                        >
                          <ChevronIcon
                            expanded={expandedRows.has('req_005')}
                            id="req_005"
                          />
                          <td className="whitespace-nowrap px-4 py-3 text-sm text-[#888f98]">
                            <div className="flex flex-col gap-1">
                              <button
                                onClick={e => {
                                  e.stopPropagation();
                                  router.push(`/audit/requests/req_005`);
                                }}
                                className="text-left font-mono hover:text-purple-400"
                              >
                                req_4a9e2b7c...
                              </button>
                              <span className="text-xs text-[#888f98]">
                                Dec 14, 2024 11:00 AM
                              </span>
                            </div>
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-sm text-[#888f98]">
                            emily.williams@company.com
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-sm text-[#888f98]">
                            <div className="flex flex-col gap-1">
                              <span>Anthropic</span>
                              <span className="text-xs text-[#888f98]">
                                claude-3-opus
                              </span>
                            </div>
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-sm text-[#888f98]">
                            <div className="flex items-center gap-2">
                              <span className="h-2 w-2 rounded-full bg-yellow-400"></span>
                              <span>timeout</span>
                            </div>
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-sm text-[#888f98]">
                            <div className="flex flex-col gap-1">
                              <span>2,340 / 456</span>
                              <span className="text-xs text-[#888f98]">
                                $0.0345
                              </span>
                            </div>
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-sm text-[#888f98]">
                            <span className="text-gray-500">—</span>
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-sm text-[#888f98]">
                            <span className="text-orange-400">PHI: 2</span>
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-sm text-[#888f98]">
                            —
                          </td>
                        </tr>
                        {expandedRows.has('req_005') && (
                          <tr>
                            <td
                              colSpan={9}
                              className="bg-gray-50 px-3 py-4 dark:!bg-[#0a0a0a]"
                            >
                              <div className="space-y-3">
                                <div className="grid grid-cols-4 gap-2 pl-[3.2125rem] text-left text-xs">
                                  <div>
                                    <span className="font-medium text-gray-600 dark:text-gray-400">
                                      Request ID:
                                    </span>
                                    <span className="ml-2 text-gray-900 dark:text-white">
                                      req_4a9e2b7c
                                    </span>
                                  </div>
                                  <div>
                                    <span className="font-medium text-gray-600 dark:text-gray-400">
                                      Timestamp:
                                    </span>
                                    <span className="ml-2 text-gray-900 dark:text-white">
                                      Dec 14, 2024 11:00 AM
                                    </span>
                                  </div>
                                  <div>
                                    <span className="font-medium text-gray-600 dark:text-gray-400">
                                      Provider:
                                    </span>
                                    <span className="ml-2 text-gray-900 dark:text-white">
                                      Anthropic
                                    </span>
                                  </div>
                                  <div>
                                    <span className="font-medium text-gray-600 dark:text-gray-400">
                                      Model:
                                    </span>
                                    <span className="ml-2 text-gray-900 dark:text-white">
                                      claude-3-opus
                                    </span>
                                  </div>
                                  <div>
                                    <span className="font-medium text-gray-600 dark:text-gray-400">
                                      Status:
                                    </span>
                                    <span className="ml-2 text-yellow-400">
                                      timeout
                                    </span>
                                  </div>
                                  <div>
                                    <span className="font-medium text-gray-600 dark:text-gray-400">
                                      Input Tokens:
                                    </span>
                                    <span className="ml-2 text-gray-900 dark:text-white">
                                      2,340
                                    </span>
                                  </div>
                                  <div>
                                    <span className="font-medium text-gray-600 dark:text-gray-400">
                                      Output Tokens:
                                    </span>
                                    <span className="ml-2 text-gray-900 dark:text-white">
                                      456
                                    </span>
                                  </div>
                                  <div>
                                    <span className="font-medium text-gray-600 dark:text-gray-400">
                                      Cost:
                                    </span>
                                    <span className="ml-2 text-gray-900 dark:text-white">
                                      $0.0345
                                    </span>
                                  </div>
                                  <div>
                                    <span className="font-medium text-gray-600 dark:text-gray-400">
                                      PHI Detected:
                                    </span>
                                    <span className="ml-2 text-orange-400">
                                      2
                                    </span>
                                  </div>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </>
                    </>
                  ) : data?.requests && data.requests.length > 0 ? (
                    data.requests.map(request => (
                      <React.Fragment key={request.id}>
                        <tr
                          className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 [&>td:first-child]:border-t [&>td:first-child]:border-[#242424]"
                          onClick={() => toggleRow(request.id)}
                        >
                          <ChevronIcon
                            expanded={expandedRows.has(request.id)}
                            id={request.id}
                          />
                          <td className="whitespace-nowrap px-4 py-3 text-sm text-[#888f98]">
                            {new Date(request.createdAt).toLocaleString()}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-sm text-[#888f98]">
                            <button
                              onClick={e => {
                                e.stopPropagation();
                                router.push(`/audit/requests/${request.id}`);
                              }}
                              className="font-mono underline hover:text-purple-400"
                            >
                              {request.requestId.substring(0, 12)}...
                            </button>
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-sm text-[#888f98]">
                            {request.provider} / {request.model}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-sm text-[#888f98]">
                            <span
                              className={`rounded px-2 py-1 text-xs ${getStatusColor(request.status)}`}
                            >
                              {request.status}
                            </span>
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-sm text-[#888f98]">
                            {request.inputTokenCount} /{' '}
                            {request.outputTokenCount}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-sm text-[#888f98]">
                            ${Number(request.costUsd).toFixed(4)}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-sm text-[#888f98]">
                            {request.piiDetectedCount > 0 ? (
                              <span className="inline-flex items-center rounded border border-red-500/30 bg-red-500/20 px-2 py-1 text-xs text-red-400">
                                PII: {request.piiDetectedCount}
                              </span>
                            ) : (
                              <span className="text-gray-500">—</span>
                            )}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-sm text-[#888f98]">
                            {request.phiDetectedCount > 0 ? (
                              <span className="inline-flex items-center rounded border border-orange-500/30 bg-orange-500/20 px-2 py-1 text-xs text-orange-400">
                                PHI: {request.phiDetectedCount}
                              </span>
                            ) : (
                              <span className="text-gray-500">—</span>
                            )}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-sm text-[#888f98]">
                            {formatDuration(request.durationMs)}
                          </td>
                        </tr>
                        {expandedRows.has(request.id) && (
                          <tr>
                            <td
                              colSpan={9}
                              className="bg-gray-50 px-3 py-4 dark:!bg-[#0a0a0a]"
                            >
                              <div className="space-y-3">
                                <h4 className="mb-2 text-sm font-semibold">
                                  Request Details
                                </h4>
                                <div className="grid grid-cols-4 gap-2 pl-[3.2125rem] text-left text-xs">
                                  <div>
                                    <span className="font-medium text-gray-600 dark:text-gray-400">
                                      Request ID:
                                    </span>
                                    <span className="ml-2 text-gray-900 dark:text-white">
                                      {request.requestId}
                                    </span>
                                  </div>
                                  <div>
                                    <span className="font-medium text-gray-600 dark:text-gray-400">
                                      Timestamp:
                                    </span>
                                    <span className="ml-2 text-gray-900 dark:text-white">
                                      {new Date(
                                        request.createdAt
                                      ).toLocaleString()}
                                    </span>
                                  </div>
                                  <div>
                                    <span className="font-medium text-gray-600 dark:text-gray-400">
                                      Provider:
                                    </span>
                                    <span className="ml-2 text-gray-900 dark:text-white">
                                      {request.provider}
                                    </span>
                                  </div>
                                  <div>
                                    <span className="font-medium text-gray-600 dark:text-gray-400">
                                      Model:
                                    </span>
                                    <span className="ml-2 text-gray-900 dark:text-white">
                                      {request.model}
                                    </span>
                                  </div>
                                  <div>
                                    <span className="font-medium text-gray-600 dark:text-gray-400">
                                      Input Tokens:
                                    </span>
                                    <span className="ml-2 text-gray-900 dark:text-white">
                                      {request.inputTokenCount}
                                    </span>
                                  </div>
                                  <div>
                                    <span className="font-medium text-gray-600 dark:text-gray-400">
                                      Output Tokens:
                                    </span>
                                    <span className="ml-2 text-gray-900 dark:text-white">
                                      {request.outputTokenCount}
                                    </span>
                                  </div>
                                  <div>
                                    <span className="font-medium text-gray-600 dark:text-gray-400">
                                      Cost:
                                    </span>
                                    <span className="ml-2 text-gray-900 dark:text-white">
                                      ${Number(request.costUsd).toFixed(4)}
                                    </span>
                                  </div>
                                  <div>
                                    <span className="font-medium text-gray-600 dark:text-gray-400">
                                      Duration:
                                    </span>
                                    <span className="ml-2 text-gray-900 dark:text-white">
                                      {formatDuration(request.durationMs)}
                                    </span>
                                  </div>
                                  {request.piiDetectedCount > 0 && (
                                    <div>
                                      <span className="font-medium text-gray-600 dark:text-gray-400">
                                        PII Detected:
                                      </span>
                                      <span className="ml-2 text-red-600 dark:text-red-400">
                                        {request.piiDetectedCount} instance(s)
                                      </span>
                                    </div>
                                  )}
                                  {request.phiDetectedCount > 0 && (
                                    <div>
                                      <span className="font-medium text-gray-600 dark:text-gray-400">
                                        PHI Detected:
                                      </span>
                                      <span className="ml-2 text-orange-600 dark:text-orange-400">
                                        {request.phiDetectedCount} instance(s)
                                      </span>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={9} className="px-3 py-16 text-center">
                        <div className="flex flex-col items-center justify-center space-y-4">
                          <svg
                            className="h-16 w-16 text-gray-400"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={1.5}
                              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                            />
                          </svg>
                          <div>
                            <p className="text-lg font-medium text-gray-900 dark:text-gray-300">
                              No audit logs found
                            </p>
                            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                              There are no items to display
                            </p>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Pagination */}
        {filters.status === 'conversation' && conversationTotalPages >= 1 && (
          <div className="mb-6 mt-6 flex items-center justify-center gap-2">
            <div className="mr-4 text-sm text-gray-600 dark:text-gray-400">
              Page {filters.page} of {conversationTotalPages}
            </div>

            <button
              onClick={() => setFilters({ ...filters, page: filters.page - 1 })}
              disabled={filters.page === 1}
              className="rounded border border-gray-300 bg-transparent px-4 py-2 text-sm text-gray-700 transition-colors hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-[#242424] dark:text-[#888f98] dark:hover:bg-gray-800"
            >
              Previous
            </button>

            {/* Page Numbers */}
            {Array.from(
              { length: Math.min(5, conversationTotalPages) },
              (_, i) => {
                let pageNum;
                if (conversationTotalPages <= 5) {
                  pageNum = i + 1;
                } else if (filters.page <= 3) {
                  pageNum = i + 1;
                } else if (filters.page >= conversationTotalPages - 2) {
                  pageNum = conversationTotalPages - 4 + i;
                } else {
                  pageNum = filters.page - 2 + i;
                }

                return (
                  <button
                    key={pageNum}
                    onClick={() => setFilters({ ...filters, page: pageNum })}
                    className={`min-w-[40px] rounded border px-3 py-2 text-sm transition-colors ${
                      pageNum === filters.page
                        ? 'border-purple-600 bg-purple-600 text-white'
                        : 'border-gray-300 bg-transparent text-gray-700 hover:bg-gray-100 dark:border-[#242424] dark:text-[#888f98] dark:hover:bg-gray-800'
                    }`}
                  >
                    {pageNum}
                  </button>
                );
              }
            )}

            <button
              onClick={() => setFilters({ ...filters, page: filters.page + 1 })}
              disabled={filters.page >= conversationTotalPages}
              className="rounded border border-gray-300 bg-transparent px-4 py-2 text-sm text-gray-700 transition-colors hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-[#242424] dark:text-[#888f98] dark:hover:bg-gray-800"
            >
              Next
            </button>
          </div>
        )}

        {/* Pagination for Requests/Completions */}
        {filters.status !== 'conversation' && (
          <div className="mb-6 mt-6 flex items-center justify-center gap-2">
            <div className="mr-4 text-sm text-gray-600 dark:text-gray-400">
              Page {data?.page || filters.page} of {data?.totalPages || 1}
            </div>

            <button
              onClick={() => setFilters({ ...filters, page: filters.page - 1 })}
              disabled={filters.page === 1}
              className="rounded border border-gray-300 bg-transparent px-4 py-2 text-sm text-gray-700 transition-colors hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-[#242424] dark:text-[#888f98] dark:hover:bg-gray-800"
            >
              Previous
            </button>

            {/* Page Numbers */}
            {Array.from(
              { length: Math.min(5, data?.totalPages || 1) },
              (_, i) => {
                let pageNum;
                const total = data?.totalPages || 1;
                const current = data?.page || filters.page;
                if (total <= 5) {
                  pageNum = i + 1;
                } else if (current <= 3) {
                  pageNum = i + 1;
                } else if (current >= total - 2) {
                  pageNum = total - 4 + i;
                } else {
                  pageNum = current - 2 + i;
                }

                return (
                  <button
                    key={pageNum}
                    onClick={() => setFilters({ ...filters, page: pageNum })}
                    className={`min-w-[40px] rounded border px-3 py-2 text-sm transition-colors ${
                      pageNum === filters.page
                        ? 'border-purple-600 bg-purple-600 text-white'
                        : 'border-gray-300 bg-transparent text-gray-700 hover:bg-gray-100 dark:border-[#242424] dark:text-[#888f98] dark:hover:bg-gray-800'
                    }`}
                  >
                    {pageNum}
                  </button>
                );
              }
            )}

            <button
              onClick={() => setFilters({ ...filters, page: filters.page + 1 })}
              disabled={filters.page >= (data?.totalPages || 1)}
              className="rounded border border-gray-300 bg-transparent px-4 py-2 text-sm text-gray-700 transition-colors hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-[#242424] dark:text-[#888f98] dark:hover:bg-gray-800"
            >
              Next
            </button>
          </div>
        )}
      </PageLayout>
    </>
  );
}
