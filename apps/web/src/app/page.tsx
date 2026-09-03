'use client';

import { useState, useEffect, useMemo } from 'react';
import { PageLayout } from '@/components/page-layout';
import { useAuth } from '@/contexts/AuthContext';
import { getApiUrl } from '@/lib/api-client';
import {
  CheckCircleIcon,
  ExclamationTriangleIcon,
  XCircleIcon,
  ArrowUpIcon,
  ArrowDownIcon,
} from '@heroicons/react/24/outline';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
  LineChart,
  Line,
  AreaChart,
  Area,
  Legend,
  CartesianGrid,
} from 'recharts';

interface ControlCenterData {
  systemStatus: {
    status: 'healthy' | 'degraded' | 'down';
    uptime: number;
    version: string;
  };
  activeRequests: {
    current: number;
    change: number;
  };
  errorRate: {
    rate: number;
    trend: 'up' | 'down';
  };
  responseTime: {
    current: number;
    avg: number;
  };
  queueDepth: {
    depth: number;
    status: 'normal' | 'high' | 'critical';
  };
  rateLimits: {
    warnings: number;
  };
  requestVolume: Array<{ time: string; count: number }>;
  providers: Array<{
    name: string;
    status: 'healthy' | 'slow' | 'down';
    latency: number | null;
  }>;
  providerStats?: Array<{
    name: string;
    status: 'healthy' | 'slow' | 'down';
    latency: number | null;
    totalRequests: number;
    totalTokens: number;
    totalCost: number;
    modelCount: number;
    models: Array<{
      name: string;
      requestCount: number;
      totalTokens: number;
      totalCost: number;
      status: 'healthy' | 'error';
    }>;
  }>;
  sanitization: {
    phi: number;
    pii: number;
  };
  recentErrors: Array<{
    timestamp: string;
    severity: 'warning' | 'error';
    message: string;
  }>;
  database: {
    connections: { active: number; max: number };
    avgQueryTime: number;
    status: string;
  };
  cache: {
    hitRate: number;
    memory: { used: number; total: number };
    status: string;
  };
  activeSessions: Array<{
    organizationName: string;
    activeRequests: number;
    totalToday: number;
  }>;
  models?: Array<{
    name: string;
    provider: string;
    requestCount: number;
    totalTokens: number;
    totalCost: number;
    status: 'healthy' | 'error';
    lastUsed: string | null;
  }>;
}

export default function DashboardPage() {
  const [data, setData] = useState<ControlCenterData | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { token } = useAuth();

  const fetchData = async () => {
    setIsRefreshing(true);
    try {
      const headers: HeadersInit = {
        'Content-Type': 'application/json',
      };

      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }

      // Single optimized API call instead of 13 separate calls
      // Use API server URL from environment variable
      const apiUrl = getApiUrl();
      const response = await fetch(
        `${apiUrl}/api/v1/control-center/dashboard`,
        {
          headers,
        }
      );

      // Check if response is OK before parsing JSON
      if (!response.ok) {
        const text = await response.text();
        console.error(`Dashboard API error ${response.status}:`, text);
        throw new Error(
          `API returned ${response.status}: ${text.substring(0, 100)}`
        );
      }

      const result = await response.json();

      if (result.success) {
        setData(result.data);
        setLastUpdated(new Date());
      } else {
        console.error('Failed to fetch dashboard data:', result.message);
      }
    } catch (error) {
      console.error('Failed to fetch control center data:', error);
      setError(
        error instanceof Error ? error.message : 'Failed to load dashboard data'
      );
      // Set empty data structure to prevent infinite spinner
      const emptyData: ControlCenterData = {
        systemStatus: {
          status: 'down' as const,
          uptime: 0,
          version: 'unknown',
        },
        activeRequests: { current: 0, change: 0 },
        errorRate: { rate: 0, trend: 'down' as const },
        responseTime: { current: 0, avg: 0 },
        queueDepth: { depth: 0, status: 'normal' as const },
        rateLimits: {
          warnings: 0,
        },
        recentErrors: [],
        requestVolume: [],
        providers: [],
        sanitization: {
          phi: 0,
          pii: 0,
        },
        database: {
          connections: { active: 0, max: 0 },
          avgQueryTime: 0,
          status: 'down',
        },
        cache: {
          hitRate: 0,
          memory: { used: 0, total: 0 },
          status: 'down',
        },
        activeSessions: [],
      };
      setData(emptyData);
    } finally {
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [token]);

  useEffect(() => {
    const interval = setInterval(fetchData, 10000); // Refresh every 10 seconds for real-time updates
    return () => clearInterval(interval);
  }, []);

  const secondsAgo = useMemo(() => {
    return Math.floor((Date.now() - lastUpdated.getTime()) / 1000);
  }, [lastUpdated]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'healthy':
        return 'text-green-500';
      case 'degraded':
      case 'slow':
      case 'warning':
        return 'text-yellow-500';
      case 'down':
      case 'error':
        return 'text-red-500';
      default:
        return 'text-gray-500';
    }
  };

  if (!data && !error) {
    return (
      <PageLayout>
        <div className="mx-auto w-full max-w-[95%] px-4 py-6 sm:px-6 lg:px-8 xl:max-w-[98%]">
          <div className="flex h-64 items-center justify-center">
            <div className="text-center">
              <div className="mx-auto h-12 w-12 animate-spin rounded-full border-b-2 border-blue-600"></div>
              <p className="mt-4 text-gray-600 dark:text-gray-400">
                Loading Control Center...
              </p>
            </div>
          </div>
        </div>
      </PageLayout>
    );
  }

  if (error && !data) {
    return (
      <PageLayout>
        <div className="mx-auto w-full max-w-[95%] px-4 py-6 sm:px-6 lg:px-8 xl:max-w-[98%]">
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-900/20">
            <h3 className="text-lg font-semibold text-red-800 dark:text-red-400">
              Error Loading Dashboard
            </h3>
            <p className="mt-2 text-red-700 dark:text-red-300">{error}</p>
            <button
              onClick={fetchData}
              className="mt-4 rounded-md bg-red-600 px-4 py-2 text-white hover:bg-red-700"
            >
              Retry
            </button>
          </div>
        </div>
      </PageLayout>
    );
  }

  // Early return if no data (TypeScript null check)
  if (!data) {
    return null;
  }

  return (
    <PageLayout>
      <div className="mx-auto w-full max-w-[95%] px-4 pb-6 pt-0 sm:px-6 lg:px-8 xl:max-w-[98%]">
        {/* Header */}
        <div className="mb-2 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
              Control Center
            </h1>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-600 dark:text-gray-400">
              Last updated: {secondsAgo}s ago
            </span>
            {isRefreshing && (
              <div className="h-4 w-4 animate-spin rounded-full border-b-2 border-purple-600"></div>
            )}
          </div>
        </div>

        {/* Top Row: System Metrics */}
        <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
          {/* System Status */}
          <div className="rounded-lg border border-gray-200 bg-white p-3 transition-colors hover:border-gray-300 dark:border-[#242424] dark:bg-[#000000] dark:hover:border-[#333333]">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  System Status
                </p>
                <div className="mt-1 flex items-center gap-2">
                  <span
                    className={`${getStatusColor(data?.systemStatus?.status || 'down')} animate-pulse text-xs`}
                  >
                    {data?.systemStatus?.status === 'healthy'
                      ? '🟢'
                      : data?.systemStatus?.status === 'degraded'
                        ? '🟡'
                        : '🔴'}
                  </span>
                  <p className="text-lg font-semibold capitalize text-gray-900 dark:text-white">
                    {data?.systemStatus?.status || 'down'}
                  </p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Success Rate
                </p>
                <p className="text-lg font-semibold text-gray-900 dark:text-white">
                  {data?.systemStatus?.uptime.toFixed(2) || '0.00'}%
                </p>
              </div>
            </div>
          </div>

          {/* Active Requests */}
          <div className="rounded-lg border border-gray-200 bg-white p-3 dark:border-[#242424] dark:bg-[#000000]">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Active Requests
                </p>
                <div className="mt-1 flex items-center gap-2">
                  <p className="text-lg font-semibold text-gray-900 dark:text-white">
                    {data.activeRequests.current}
                  </p>
                  {data.activeRequests.change !== 0 && (
                    <div className="flex items-center gap-1">
                      {data.activeRequests.change > 0 ? (
                        <>
                          <ArrowUpIcon className="h-4 w-4 text-green-500" />
                          <span className="text-sm text-green-500">
                            +{data.activeRequests.change}
                          </span>
                        </>
                      ) : (
                        <>
                          <ArrowDownIcon className="h-4 w-4 text-red-500" />
                          <span className="text-sm text-red-500">
                            {data.activeRequests.change}
                          </span>
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Error Rate */}
          <div className="rounded-lg border border-gray-200 bg-white p-3 dark:border-[#242424] dark:bg-[#000000]">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Error Rate
                </p>
                <div className="mt-1 flex items-center gap-2">
                  <p className="text-lg font-semibold text-gray-900 dark:text-white">
                    {data.errorRate.rate.toFixed(1)}%
                  </p>
                  {data.errorRate.trend === 'down' ? (
                    <ArrowDownIcon className="h-4 w-4 text-green-500" />
                  ) : (
                    <ArrowUpIcon className="h-4 w-4 text-red-500" />
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Response Time */}
          <div className="rounded-lg border border-gray-200 bg-white p-3 dark:border-[#242424] dark:bg-[#000000]">
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Response Time
              </p>
              <p className="mt-1 text-lg font-semibold text-gray-900 dark:text-white">
                {data.responseTime.current.toFixed(1)}s
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Avg: {data.responseTime.avg.toFixed(1)}s
              </p>
            </div>
          </div>

          {/* Queue Depth */}
          <div className="rounded-lg border border-gray-200 bg-white p-3 dark:border-[#242424] dark:bg-[#000000]">
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Queue Depth
              </p>
              <p className="mt-1 text-lg font-semibold text-gray-900 dark:text-white">
                {data.queueDepth.depth}
              </p>
              <p className="text-xs capitalize text-gray-500 dark:text-gray-400">
                {data.queueDepth.status}
              </p>
            </div>
          </div>

          {/* Rate Limits */}
          <div className="rounded-lg border border-gray-200 bg-white p-3 dark:border-[#242424] dark:bg-[#000000]">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Rate Limits
                </p>
                <p className="mt-1 text-lg font-semibold text-gray-900 dark:text-white">
                  {data.rateLimits?.warnings || 0} warnings
                </p>
              </div>
              {(data.rateLimits?.warnings || 0) > 0 && (
                <span className="text-yellow-500">⚠️</span>
              )}
            </div>
          </div>
        </div>

        {/* Providers, Request Volume, Database & Cache Row */}
        <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-12">
          {/* AI Providers */}
          <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm md:col-span-4 dark:border-[#242424] dark:bg-[#000000]">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
                Active AI Providers
              </h3>
              <span className="rounded-full bg-gray-100 px-2 py-1 text-xs font-medium text-gray-600 dark:bg-[#1a1a1a] dark:text-gray-400">
                {
                  (data.providers || []).filter(p => p.status === 'healthy')
                    .length
                }{' '}
                healthy
              </span>
            </div>
            <ResponsiveContainer width="100%" height={230}>
              <BarChart
                data={(data.providers || []).map(p => ({
                  name: p.name,
                  latency: p.latency || 0,
                  status: p.status,
                }))}
                layout="vertical"
                margin={{ top: 5, right: 30, left: 0, bottom: 5 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="#e5e7eb"
                  className="dark:stroke-gray-800"
                />
                <XAxis
                  type="number"
                  tick={{ fontSize: 10, fill: 'rgb(107, 114, 128)' }}
                  stroke="#9ca3af"
                  label={{
                    value: 'Latency (ms)',
                    position: 'insideBottom',
                    offset: -5,
                    style: { fontSize: '9px' },
                  }}
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  tick={{ fontSize: 9, fill: 'rgb(107, 114, 128)' }}
                  width={90}
                  interval={0}
                  stroke="#9ca3af"
                />
                <Tooltip
                  formatter={(value: number, name: string) => [
                    value === 0 ? 'No data (0ms)' : `${value}ms`,
                    'Latency',
                  ]}
                  contentStyle={{
                    backgroundColor: 'rgba(255, 255, 255, 0.95)',
                    border: '1px solid #e5e7eb',
                    borderRadius: '8px',
                    padding: '8px',
                  }}
                  labelStyle={{ color: '#111827', fontWeight: 600 }}
                />
                <Bar
                  dataKey="latency"
                  radius={[0, 8, 8, 0]}
                  isAnimationActive={true}
                  animationDuration={800}
                  minPointSize={1}
                >
                  {(data.providers || []).map((provider, index) => {
                    const color =
                      provider.status === 'healthy'
                        ? '#10b981'
                        : provider.status === 'slow'
                          ? '#f59e0b'
                          : '#ef4444';
                    return <Cell key={`cell-${index}`} fill={color} />;
                  })}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Request Volume Chart */}
          <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm md:col-span-4 dark:border-[#242424] dark:bg-[#000000]">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
                Request Volume
              </h3>
              <div className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
                <span className="flex items-center gap-1 rounded-full bg-purple-100 px-2 py-1 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400">
                  <div className="h-2 w-2 rounded-full bg-purple-500"></div>
                  Live
                </span>
              </div>
            </div>
            {(data.requestVolume || []).some(v => v.count > 0) ? (
              <ResponsiveContainer width="100%" height={230}>
                <BarChart
                  data={data.requestVolume || []}
                  margin={{ top: 10, right: 30, left: 0, bottom: 0 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="#e5e7eb"
                    className="dark:stroke-gray-800"
                  />
                  <XAxis
                    dataKey="time"
                    tick={{ fontSize: 10, fill: 'rgb(107, 114, 128)' }}
                    stroke="#9ca3af"
                    interval={0}
                    ticks={data.requestVolume
                      .filter(d => {
                        try {
                          const dt = new Date(d.time);
                          const h = dt.getHours();
                          const m = dt.getMinutes();
                          return m === 0 && h % 4 === 0; // label only at :00 and every 4 hours
                        } catch {
                          return false;
                        }
                      })
                      .map(d => d.time)}
                    tickFormatter={(value: string) => {
                      try {
                        return new Date(value).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        });
                      } catch {
                        return value;
                      }
                    }}
                    label={{
                      value: 'Time',
                      position: 'insideBottom',
                      offset: 0,
                      style: { fontSize: '9px' },
                    }}
                  />
                  <YAxis
                    tick={{ fontSize: 10, fill: 'rgb(107, 114, 128)' }}
                    stroke="#9ca3af"
                    width={50}
                    label={{
                      value: 'Requests',
                      angle: -90,
                      position: 'insideLeft',
                      style: { fontSize: '9px' },
                    }}
                  />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        const raw = payload[0].payload.time;
                        let label = raw;
                        try {
                          label = new Date(raw).toLocaleString([], {
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          });
                        } catch {}
                        return (
                          <div className="rounded-lg border border-gray-200 bg-white p-3 shadow-lg dark:border-[#242424] dark:bg-gray-800">
                            <p className="mb-1 text-sm font-semibold text-gray-900 dark:text-white">
                              {label}
                            </p>
                            <p className="text-sm text-purple-600 dark:text-purple-400">
                              {payload[0].value} requests
                            </p>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Bar
                    dataKey="count"
                    fill="#8b5cf6"
                    radius={[8, 8, 0, 0]}
                    isAnimationActive={true}
                    animationDuration={800}
                  />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-[230px] items-center justify-center">
                <div className="text-center">
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    No request data available
                  </p>
                  <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
                    Make API requests to see request volume over the last 24
                    hours
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Database Status */}
          <div className="rounded-lg border border-gray-200 bg-white p-4 md:col-span-2 dark:border-[#242424] dark:bg-[#000000]">
            <h3 className="mb-3 text-sm font-semibold text-gray-900 dark:text-white">
              Database Status
            </h3>
            <div className="space-y-2">
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Connections
                </p>
                <p className="text-lg font-semibold text-gray-900 dark:text-white">
                  {data.database?.connections?.active || 0}/
                  {data.database?.connections?.max || 0}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Query Time
                </p>
                <p className="text-lg font-semibold text-gray-900 dark:text-white">
                  {data.database?.avgQueryTime || 0}ms
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span
                  className={`text-xs ${
                    data.database?.status === 'healthy'
                      ? 'text-green-500'
                      : data.database?.status === 'warning'
                        ? 'text-yellow-500'
                        : 'text-red-500'
                  }`}
                >
                  {data.database?.status === 'healthy'
                    ? '🟢'
                    : data.database?.status === 'warning'
                      ? '🟡'
                      : '🔴'}
                </span>
                <span className="text-sm capitalize text-gray-900 dark:text-white">
                  {data.database?.status || 'unknown'}
                </span>
              </div>
            </div>
          </div>

          {/* Cache Status */}
          <div className="rounded-lg border border-gray-200 bg-white p-4 md:col-span-2 dark:border-[#242424] dark:bg-[#000000]">
            <h3 className="mb-3 text-sm font-semibold text-gray-900 dark:text-white">
              Cache Status
            </h3>
            <div className="space-y-2">
              {data.cache?.status === 'not_configured' ? (
                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Cache not configured (Redis required)
                  </p>
                </div>
              ) : (
                <>
                  <div>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      Hit Rate
                    </p>
                    <p className="text-lg font-semibold text-gray-900 dark:text-white">
                      {data.cache?.hitRate || 0}%
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      Memory
                    </p>
                    <p className="text-lg font-semibold text-gray-900 dark:text-white">
                      {data.cache?.memory?.used || 0}MB /{' '}
                      {data.cache?.memory?.total || 0}MB
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-xs ${
                        data.cache?.status === 'healthy'
                          ? 'text-green-500'
                          : 'text-yellow-500'
                      }`}
                    >
                      {data.cache?.status === 'healthy' ? '🟢' : '🟡'}
                    </span>
                    <span className="text-sm capitalize text-gray-900 dark:text-white">
                      {data.cache?.status || 'unknown'}
                    </span>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* AI Models */}
        <div className="mb-6">
          <div className="mb-4">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              AI Providers
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Aggregate statistics by provider
            </p>
          </div>
          {data.providerStats && data.providerStats.length > 0 ? (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
              {data.providerStats.map(provider => (
                <div
                  key={provider.name}
                  className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-[#242424] dark:bg-[#000000]"
                >
                  <div className="mb-4 flex items-center justify-between">
                    <div>
                      <h4 className="text-base font-semibold text-gray-900 dark:text-white">
                        {provider.name}
                      </h4>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {provider.modelCount} model
                        {provider.modelCount !== 1 ? 's' : ''}
                      </p>
                    </div>
                    <span
                      className={`h-2 w-2 rounded-full ${
                        provider.status === 'healthy'
                          ? 'bg-green-500'
                          : provider.status === 'slow'
                            ? 'bg-yellow-500'
                            : 'bg-red-500'
                      }`}
                    ></span>
                  </div>

                  <div className="space-y-3 border-t border-gray-100 pt-3 dark:border-gray-800">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-gray-600 dark:text-gray-400">
                        Requests:
                      </span>
                      <span className="text-sm font-semibold text-gray-900 dark:text-white">
                        {provider.totalRequests >= 1000
                          ? `${(provider.totalRequests / 1000).toFixed(1)}k`
                          : provider.totalRequests}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-gray-600 dark:text-gray-400">
                        Tokens:
                      </span>
                      <span className="text-sm font-semibold text-gray-900 dark:text-white">
                        {provider.totalTokens >= 1000
                          ? `${(provider.totalTokens / 1000).toFixed(1)}k`
                          : provider.totalTokens}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-gray-600 dark:text-gray-400">
                        Cost:
                      </span>
                      <span className="text-sm font-semibold text-gray-900 dark:text-white">
                        ${provider.totalCost.toFixed(4)}
                      </span>
                    </div>
                    {provider.latency !== null && provider.latency > 0 && (
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-gray-600 dark:text-gray-400">
                          Avg Latency:
                        </span>
                        <span className="text-sm font-semibold text-gray-900 dark:text-white">
                          {provider.latency}ms
                        </span>
                      </div>
                    )}

                    {/* Per-model breakdown */}
                    {provider.models.length > 0 && (
                      <div className="mt-3 border-t border-gray-100 pt-3 dark:border-gray-800">
                        <p className="mb-2 text-xs font-medium text-gray-700 dark:text-gray-300">
                          Per Model:
                        </p>
                        <div className="space-y-2">
                          {provider.models.map(model => (
                            <div
                              key={model.name}
                              className="flex items-center justify-between text-xs"
                            >
                              <span className="text-gray-600 dark:text-gray-400">
                                {model.name}:
                              </span>
                              <span className="font-medium text-gray-900 dark:text-white">
                                {model.requestCount >= 1000
                                  ? `${(model.requestCount / 1000).toFixed(1)}k`
                                  : model.requestCount}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-lg border border-gray-200 bg-white p-4 text-center dark:border-[#242424] dark:bg-[#000000]">
              <p className="text-sm text-gray-500 dark:text-gray-400">
                No provider data available. Configure provider keys in Settings
                to see statistics.
              </p>
            </div>
          )}
        </div>

        {/* Recent Errors */}
        <div className="mb-6 rounded-lg border border-gray-200 bg-white p-4 dark:border-[#242424] dark:bg-[#000000]">
          <h3 className="mb-3 text-sm font-semibold text-gray-900 dark:text-white">
            Recent Errors (Last 15 minutes)
          </h3>
          <div className="space-y-2">
            {data.recentErrors.map((error, idx) => (
              <div key={idx} className="flex items-start gap-2">
                {error.severity === 'warning' && (
                  <span className="text-yellow-500">⚠️</span>
                )}
                {error.severity === 'error' && (
                  <span className="text-red-500">🔴</span>
                )}
                <div>
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    {error.timestamp}
                  </span>
                  <span className="ml-2 text-sm text-gray-900 dark:text-white">
                    - {error.message}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Active Sessions */}
        <div className="rounded-lg border border-gray-200 bg-white dark:border-[#242424] dark:bg-[#000000]">
          <div className="border-b border-gray-200 p-4 dark:border-[#242424]">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
              Active Sessions
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-[#242424]">
              <thead className="bg-gray-50 dark:bg-[#0a0a0a]">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                    Organization
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                    Active Requests
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                    Total Today
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white dark:divide-[#242424] dark:bg-[#000000]">
                {(data.activeSessions || []).map((session, idx) => (
                  <tr key={idx}>
                    <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-900 dark:text-white">
                      {session.organizationName}
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-900 dark:text-white">
                      {session.activeRequests}
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-900 dark:text-white">
                      {session.totalToday.toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </PageLayout>
  );
}
