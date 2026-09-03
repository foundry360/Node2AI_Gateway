'use client';

/**
 * Audit Statistics Page
 * Analytics dashboard for audit logs
 */

import { useState, useEffect } from 'react';
import { PageLayout } from '@/components/page-layout';

interface Statistics {
  totalRequests: number;
  requestsByStatus: Record<string, number>;
  requestsByProvider: Record<string, number>;
  totalCost: number;
  totalTokens: number;
  piiDetectionsCount: number;
  phiDetectionsCount: number;
  avgDurationMs: number;
}

export default function AuditStatsPage() {
  const [stats, setStats] = useState<Statistics | null>(null);
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState({
    startDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split('T')[0],
    endDate: new Date().toISOString().split('T')[0],
  });

  useEffect(() => {
    fetchStats();
  }, [dateRange]);

  const fetchStats = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      params.append('organization_id', 'default-org'); // TODO: Get from auth
      if (dateRange.startDate) params.append('start_date', dateRange.startDate);
      if (dateRange.endDate) params.append('end_date', dateRange.endDate);

      const response = await fetch(`/api/v1/audit/stats?${params.toString()}`);
      const json = await response.json();

      if (json.success) {
        setStats(json.data);
      }
    } catch (error) {
      console.error('Error fetching stats:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading || !stats) {
    return (
      <PageLayout>
        <div className="flex h-64 items-center justify-center">
          <div className="text-lg">Loading statistics...</div>
        </div>
      </PageLayout>
    );
  }

  return (
    <PageLayout>
      <div className="mx-auto w-full max-w-[95%] px-4 pb-6 pt-2 sm:px-6 lg:px-8 xl:max-w-[98%]">
        <div className="mb-6">
          <h1 className="mb-2 text-3xl font-bold text-gray-900 dark:text-white">
            Audit Statistics
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            Comprehensive analytics for AI request auditing
          </p>
        </div>

        {/* Date Range Selector */}
        <div className="card mb-6">
          <div className="card-content p-6">
            <div className="flex items-end gap-4">
              <div className="flex-1">
                <label className="mb-1 block text-sm font-medium">
                  Start Date
                </label>
                <input
                  type="date"
                  value={dateRange.startDate}
                  onChange={e =>
                    setDateRange({ ...dateRange, startDate: e.target.value })
                  }
                  className="w-full rounded border p-2"
                />
              </div>
              <div className="flex-1">
                <label className="mb-1 block text-sm font-medium">
                  End Date
                </label>
                <input
                  type="date"
                  value={dateRange.endDate}
                  onChange={e =>
                    setDateRange({ ...dateRange, endDate: e.target.value })
                  }
                  className="w-full rounded border p-2"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-lg bg-white p-6 shadow">
            <h3 className="text-sm font-medium text-gray-600">
              Total Requests
            </h3>
            <p className="mt-2 text-3xl font-bold">
              {stats.totalRequests.toLocaleString()}
            </p>
          </div>
          <div className="rounded-lg bg-white p-6 shadow">
            <h3 className="text-sm font-medium text-gray-600">Total Cost</h3>
            <p className="mt-2 text-3xl font-bold">
              ${stats.totalCost.toFixed(2)}
            </p>
          </div>
          <div className="rounded-lg bg-white p-6 shadow">
            <h3 className="text-sm font-medium text-gray-600">
              Avg Response Time
            </h3>
            <p className="mt-2 text-3xl font-bold">
              {formatDuration(stats.avgDurationMs)}
            </p>
          </div>
          <div className="rounded-lg bg-white p-6 shadow">
            <h3 className="text-sm font-medium text-gray-600">
              PII Detections
            </h3>
            <p className="mt-2 text-3xl font-bold">
              {stats.piiDetectionsCount.toLocaleString()}
            </p>
          </div>
        </div>

        {/* Detailed Stats */}
        <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Requests by Status */}
          <div className="card">
            <div className="card-content p-6">
              <h2 className="mb-4 text-xl font-bold">Requests by Status</h2>
              <div className="space-y-2">
                {Object.entries(stats.requestsByStatus).map(
                  ([status, count]) => (
                    <div
                      key={status}
                      className="flex items-center justify-between"
                    >
                      <span className="capitalize">{status}</span>
                      <div className="flex items-center gap-3">
                        <div className="h-2 w-32 rounded-full bg-gray-200">
                          <div
                            className={`h-2 rounded-full ${
                              status === 'success'
                                ? 'bg-green-500'
                                : status === 'error'
                                  ? 'bg-red-500'
                                  : 'bg-yellow-500'
                            }`}
                            style={{
                              width: `${(count / stats.totalRequests) * 100}%`,
                            }}
                          />
                        </div>
                        <span className="text-sm font-medium">{count}</span>
                      </div>
                    </div>
                  )
                )}
              </div>
            </div>
          </div>

          {/* Requests by Provider */}
          <div className="card">
            <div className="card-content p-6">
              <h2 className="mb-4 text-xl font-bold">Requests by Provider</h2>
              <div className="space-y-2">
                {Object.entries(stats.requestsByProvider).map(
                  ([provider, count]) => (
                    <div
                      key={provider}
                      className="flex items-center justify-between"
                    >
                      <span className="capitalize">{provider}</span>
                      <div className="flex items-center gap-3">
                        <div className="h-2 w-32 rounded-full bg-gray-200">
                          <div
                            className="h-2 rounded-full bg-blue-500"
                            style={{
                              width: `${(count / stats.totalRequests) * 100}%`,
                            }}
                          />
                        </div>
                        <span className="text-sm font-medium">{count}</span>
                      </div>
                    </div>
                  )
                )}
              </div>
            </div>
          </div>
        </div>

        {/* PII/PHI Summary */}
        <div className="card">
          <div className="card-content p-6">
            <h2 className="mb-4 text-xl font-bold">
              Privacy & Compliance Summary
            </h2>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <div className="rounded-lg bg-red-50 p-4">
                <h3 className="text-sm font-medium text-red-800">
                  PII Detections
                </h3>
                <p className="mt-1 text-2xl font-bold text-red-900">
                  {stats.piiDetectionsCount}
                </p>
                <p className="mt-1 text-sm text-red-700">
                  {stats.totalRequests > 0
                    ? (
                        (stats.piiDetectionsCount / stats.totalRequests) *
                        100
                      ).toFixed(1)
                    : 0}
                  % of requests
                </p>
              </div>
              <div className="rounded-lg bg-orange-50 p-4">
                <h3 className="text-sm font-medium text-orange-800">
                  PHI Detections
                </h3>
                <p className="mt-1 text-2xl font-bold text-orange-900">
                  {stats.phiDetectionsCount}
                </p>
                <p className="mt-1 text-sm text-orange-700">
                  {stats.totalRequests > 0
                    ? (
                        (stats.phiDetectionsCount / stats.totalRequests) *
                        100
                      ).toFixed(1)
                    : 0}
                  % of requests
                </p>
              </div>
              <div className="rounded-lg bg-green-50 p-4">
                <h3 className="text-sm font-medium text-green-800">
                  Total Tokens
                </h3>
                <p className="mt-1 text-2xl font-bold text-green-900">
                  {stats.totalTokens.toLocaleString()}
                </p>
                <p className="mt-1 text-sm text-green-700">
                  {stats.totalRequests > 0
                    ? (stats.totalTokens / stats.totalRequests).toFixed(0)
                    : 0}{' '}
                  tokens/request
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </PageLayout>
  );
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(2)}s`;
  if (ms < 3600000) return `${(ms / 60000).toFixed(2)}m`;
  return `${(ms / 3600000).toFixed(2)}h`;
}
