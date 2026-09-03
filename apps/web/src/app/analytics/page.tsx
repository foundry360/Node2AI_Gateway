'use client';

import { useState, useEffect, useMemo } from 'react';
import {
  ChartBarIcon,
  ArrowTrendingUpIcon,
  ArrowTrendingDownIcon,
  ClockIcon,
  CurrencyDollarIcon,
  ShieldCheckIcon,
  CpuChipIcon,
  UserGroupIcon,
  BanknotesIcon,
  ChartPieIcon,
  BoltIcon,
} from '@heroicons/react/24/outline';
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { PageLayout } from '@/components/page-layout';
import { UsageTrendsChart } from '@/components/usage-trends-chart';
import { DailyCostChart } from '@/components/daily-cost-chart';
import PeakUsageChart from '@/components/peak-usage-chart';
import CostBreakdownChart from '@/components/cost-breakdown-chart';
import CostByProviderChart from '@/components/cost-by-provider-chart';
import MonthlyComparisonChart from '@/components/monthly-comparison-chart';
import { useAuth } from '@/contexts/AuthContext';

interface AnalyticsData {
  overview: {
    total_requests: number;
    total_cost: number;
    total_tokens: number;
    avg_latency: number;
    median_latency: number;
    p95_latency: number;
    p99_latency: number;
    success_rate: number;
    error_rate: number;
    sanitization_rate: number;
  };
  usage_trends: {
    date: string;
    requests: number;
    tokens: number;
    cost: number;
    latency: number;
  }[];
  model_usage: {
    model: string;
    provider: string;
    requests: number;
    total_tokens: number;
    cost: number;
    avg_latency: number;
    error_count: number;
    success_rate: number;
  }[];
  sanitization_stats: {
    total_sanitized: number;
    total_sanitizations: number;
    pii_detected: number;
    phi_detected: number;
    financial_detected: number;
    government_detected: number;
  };
  provider_stats?: Array<{
    provider: string;
    requests: number;
    total_tokens: number;
    total_cost: number;
    avg_latency: number;
    error_count: number;
    success_rate: number;
  }>;
  hourly_patterns?: Array<{
    hour: number;
    requests: number;
    avg_latency: number;
  }>;
  response_time_distribution?: Array<{ label: string; value: number }>;
  forecast?: {
    daily_avg: number;
    current_month_spend: number;
    projected_month_cost: number;
    projected_next_30d_cost: number;
    confidence: number;
    monthly_budget: number;
  };
}

export default function AnalyticsPage() {
  const [selectedCategory, setSelectedCategory] = useState('usage-trends');
  const [timeRange, setTimeRange] = useState('7d');
  const [analyticsData, setAnalyticsData] = useState<AnalyticsData | null>(
    null
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { token } = useAuth();

  // Generate daily spending forecast data for the chart based on time range
  const forecastChartData = useMemo(() => {
    const dailyAvg = Number(analyticsData?.forecast?.daily_avg || 0);
    const currentSpend = Number(
      analyticsData?.forecast?.current_month_spend || 0
    );
    const monthlyBudget = Number(analyticsData?.forecast?.monthly_budget || 0);

    // Determine forecast period based on time range
    const forecastDays =
      timeRange === '7d'
        ? 7
        : timeRange === '30d'
          ? 30
          : timeRange === '90d'
            ? 90
            : 30;

    const forecastData = [];
    const today = new Date();

    for (let i = 0; i < forecastDays; i++) {
      const date = new Date(today);
      date.setDate(today.getDate() + i);

      const projectedSpending = currentSpend + dailyAvg * i;

      forecastData.push({
        date: date.toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
        }),
        dateValue: date, // Keep original date for proper sorting
        projected: Math.max(0, projectedSpending),
        budget: monthlyBudget > 0 ? monthlyBudget : undefined,
        zero: 0, // Zero line for reference
        dayNumber: i + 1, // Day number for better tooltip display
      });
    }

    return forecastData;
  }, [analyticsData?.forecast, timeRange]);

  // Fetch analytics data from API
  useEffect(() => {
    const fetchAnalyticsData = async () => {
      try {
        setLoading(true);
        setError(null);

        if (!token) {
          setError('Not authenticated');
          setLoading(false);
          return;
        }

        // Get user's timezone (e.g., 'America/New_York', 'UTC', etc.)
        const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

        const response = await fetch(
          `/api/v1/analytics/data?timeRange=${timeRange}&timezone=${encodeURIComponent(userTimezone)}`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
          }
        );

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(
            `Failed to fetch analytics: ${response.status} ${errorText}`
          );
        }

        const result = await response.json();
        if (result.success && result.data) {
          setAnalyticsData(result.data);
        } else {
          throw new Error(result.message || 'Failed to fetch analytics data');
        }
      } catch (err: any) {
        console.error('Error fetching analytics data:', err);
        setError(err.message || 'Failed to fetch analytics data');
      } finally {
        setLoading(false);
      }
    };

    fetchAnalyticsData();
  }, [timeRange, token]);

  const categoryGroups = [
    {
      title: 'Usage',
      categories: [
        {
          id: 'usage-trends',
          name: 'Usage Trends',
          icon: ChartBarIcon,
          description: 'Request patterns and usage analytics',
        },
      ],
    },
    {
      title: 'Models',
      categories: [
        {
          id: 'model-insights',
          name: 'Model Insights',
          icon: CpuChipIcon,
          description: 'AI model performance and usage',
        },
        {
          id: 'performance',
          name: 'Performance',
          icon: BoltIcon,
          description: 'System performance metrics',
        },
      ],
    },
    {
      title: 'Financial',
      categories: [
        {
          id: 'cost-analysis',
          name: 'Cost Analysis',
          icon: BanknotesIcon,
          description: 'Spending patterns and cost optimization',
        },
        {
          id: 'budget-forecast',
          name: 'Budget Forecast',
          icon: ChartPieIcon,
          description: 'Future spending predictions',
        },
      ],
    },
    {
      title: 'Compliance',
      categories: [
        {
          id: 'sanitation-statistics',
          name: 'Sanitation Statistics',
          icon: ShieldCheckIcon,
          description: 'Data sanitization and compliance',
        },
      ],
    },
  ];

  return (
    <PageLayout>
      <div className="mx-auto w-full max-w-[95%] px-4 pb-6 pt-0 sm:px-6 lg:px-8 xl:max-w-[98%]">
        {/* Page Header */}
        <div className="mb-2">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            Advanced Analytics
          </h1>
          <div className="mt-2 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-lg text-gray-600 dark:text-gray-400">
              Comprehensive insights into your AI usage and spending
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setTimeRange('7d')}
                className={`rounded-md border px-3 py-1 text-sm transition-colors ${
                  timeRange === '7d'
                    ? 'border-[#9333ea] bg-blue-50 text-gray-700 dark:bg-blue-900/20 dark:text-gray-300'
                    : 'border-gray-300 text-gray-700 hover:bg-gray-50 dark:border-[#242424] dark:text-gray-300 dark:hover:bg-gray-800'
                }`}
              >
                7 days
              </button>
              <button
                onClick={() => setTimeRange('30d')}
                className={`rounded-md border px-3 py-1 text-sm transition-colors ${
                  timeRange === '30d'
                    ? 'border-[#9333ea] bg-blue-50 text-gray-700 dark:bg-blue-900/20 dark:text-gray-300'
                    : 'border-gray-300 text-gray-700 hover:bg-gray-50 dark:border-[#242424] dark:text-gray-300 dark:hover:bg-gray-800'
                }`}
              >
                Last 30 days
              </button>
              <button
                onClick={() => setTimeRange('90d')}
                className={`rounded-md border px-3 py-1 text-sm transition-colors ${
                  timeRange === '90d'
                    ? 'border-[#9333ea] bg-blue-50 text-gray-700 dark:bg-blue-900/20 dark:text-gray-300'
                    : 'border-gray-300 text-gray-700 hover:bg-gray-50 dark:border-[#242424] dark:text-gray-300 dark:hover:bg-gray-800'
                }`}
              >
                Last 90 days
              </button>
            </div>
          </div>
          <div className="mt-6 border-t border-gray-200 dark:border-[#242424]"></div>
        </div>

        <div className="flex flex-col gap-0 lg:flex-row">
          {/* Left Column - Navigation */}
          <div className="sticky top-[72px] z-10 flex-shrink-0 self-start lg:max-h-[calc(100vh-72px)] lg:w-64 lg:overflow-y-auto">
            <div className="bg-transparent">
              <div className="mb-4">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                  Analytics Categories
                </h3>
              </div>
              <nav className="space-y-6">
                {categoryGroups.map(group => (
                  <div key={group.title}>
                    <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                      {group.title}
                    </h4>
                    <div className="space-y-1">
                      {group.categories.map(category => {
                        const Icon = category.icon;
                        const isActive = selectedCategory === category.id;

                        return (
                          <button
                            key={category.id}
                            onClick={() => setSelectedCategory(category.id)}
                            className={`flex w-full items-center rounded-md px-3 py-2 text-left transition-colors ${
                              isActive
                                ? 'bg-blue-50 dark:bg-[#000000]'
                                : 'text-gray-700 hover:font-bold dark:text-gray-300'
                            }`}
                          >
                            <Icon
                              className={`mr-3 h-5 w-5 flex-shrink-0 ${
                                isActive ? 'text-gray-400' : 'text-gray-400'
                              }`}
                            />
                            <span
                              className={`text-sm ${
                                isActive
                                  ? 'font-bold text-gray-900 dark:text-white'
                                  : 'font-medium text-gray-900 dark:text-white'
                              }`}
                            >
                              {category.name}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </nav>
            </div>
          </div>

          {/* Right Column - Charts and Analytics */}
          <div className="flex-1">
            {loading ? (
              <div className="flex h-64 items-center justify-center">
                <div className="text-center">
                  <div className="mb-4 inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-gray-300 border-r-gray-600 dark:border-gray-600 dark:border-r-gray-300"></div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Loading analytics data...
                  </p>
                </div>
              </div>
            ) : error ? (
              <div className="flex h-64 items-center justify-center">
                <div className="text-center">
                  <p className="text-sm font-medium text-red-600 dark:text-red-400">
                    Error: {error}
                  </p>
                  <button
                    onClick={() => window.location.reload()}
                    className="mt-4 rounded-md bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700"
                  >
                    Retry
                  </button>
                </div>
              </div>
            ) : (
              <AnalyticsContent
                category={selectedCategory}
                timeRange={timeRange}
                analyticsData={analyticsData}
                forecastChartData={forecastChartData}
              />
            )}
          </div>
        </div>
      </div>
    </PageLayout>
  );
}

// Analytics Content Component
function AnalyticsContent({
  category,
  timeRange,
  analyticsData,
  forecastChartData,
}: {
  category: string;
  timeRange: string;
  analyticsData: AnalyticsData | null;
  forecastChartData: Array<{
    date: string;
    projected: number;
    budget?: number;
  }>;
}) {
  const renderCategoryContent = (
    forecastChartData: Array<{
      date: string;
      projected: number;
      budget?: number;
    }>
  ) => {
    if (!analyticsData) {
      return (
        <div className="flex h-64 items-center justify-center">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            No data available
          </p>
        </div>
      );
    }

    switch (category) {
      case 'usage-trends':
        return (
          <UsageTrendsContent
            timeRange={timeRange}
            analyticsData={analyticsData}
          />
        );
      case 'cost-analysis':
        return (
          <CostAnalysisContent
            timeRange={timeRange}
            analyticsData={analyticsData}
          />
        );
      case 'model-insights':
        return (
          <ModelInsightsContent
            timeRange={timeRange}
            analyticsData={analyticsData}
          />
        );
      case 'performance':
        return (
          <PerformanceContent
            timeRange={timeRange}
            analyticsData={analyticsData}
          />
        );
      case 'budget-forecast':
        return (
          <BudgetForecastContent
            timeRange={timeRange}
            analyticsData={analyticsData}
            forecastChartData={forecastChartData}
          />
        );
      case 'sanitation-statistics':
        return (
          <SanitationStatisticsContent
            timeRange={timeRange}
            analyticsData={analyticsData}
          />
        );
      default:
        return (
          <UsageTrendsContent
            timeRange={timeRange}
            analyticsData={analyticsData}
          />
        );
    }
  };

  return (
    <div className="space-y-6">{renderCategoryContent(forecastChartData)}</div>
  );
}

// Usage Trends Content
function UsageTrendsContent({
  timeRange,
  analyticsData,
}: {
  timeRange: string;
  analyticsData: AnalyticsData | null;
}) {
  // Use real data from API or generate placeholder if no data
  const generateChartData = () => {
    if (analyticsData?.usage_trends) {
      return analyticsData.usage_trends.map(trend => {
        // Parse YYYY-MM-DD date string as local date to avoid timezone shift
        const [year, month, day] = trend.date.split('-').map(Number);
        const date = new Date(year, month - 1, day);
        return {
          date: date.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
          }),
          tokens: trend.tokens || 0,
          tokensK: (trend.tokens || 0) / 1000,
          requests: trend.requests || 0,
          cost: trend.cost || 0,
        };
      });
    }

    // Fallback to empty data if no API data
    return [];
  };

  const chartData = generateChartData();

  // Use overview data from API for summary values
  const overview = analyticsData?.overview;
  const totalTokens = overview?.total_tokens || 0;
  const totalRequests = overview?.total_requests || 0;
  const avgTokensPerRequest =
    totalRequests > 0 ? Math.round(totalTokens / totalRequests) : 0;

  // Calculate peak hour from hourly patterns in API data
  const generatePeakData = () => {
    if (analyticsData?.hourly_patterns) {
      return analyticsData.hourly_patterns.map(pattern => ({
        hour: `${pattern.hour}:00`,
        requests: pattern.requests || 0,
      }));
    }

    // Fallback: generate empty data
    return Array.from({ length: 24 }, (_, i) => ({
      hour: `${i}:00`,
      requests: 0,
    }));
  };

  const peakData = generatePeakData();
  const maxRequests = Math.max(...peakData.map(d => d.requests), 0);
  const peakDataPoint = peakData.find(d => d.requests === maxRequests);
  const peakHourNum = peakDataPoint
    ? parseInt(peakDataPoint.hour.split(':')[0])
    : 14;
  const peakHour =
    peakHourNum === 0
      ? '12:00 AM'
      : peakHourNum < 12
        ? `${peakHourNum}:00 AM`
        : peakHourNum === 12
          ? '12:00 PM'
          : `${peakHourNum - 12}:00 PM`;

  const tokensTrend = 12.5;
  const requestsTrend = 8.2;
  const avgTrend = -2.1;
  const peakTrend = 5.3;

  return (
    <>
      {/* About Section */}
      <div className="card mb-6">
        <div className="card-content pt-6">
          <div className="flex items-start">
            <div className="mr-4 flex-shrink-0">
              <div className="rounded-lg bg-purple-100 p-2 dark:bg-purple-900/20">
                <ChartBarIcon className="h-6 w-6 text-purple-600 dark:text-purple-400" />
              </div>
            </div>
            <div className="flex-1">
              <h2 className="mb-3 text-xl font-semibold text-gray-900 dark:text-white">
                About Usage Trends
              </h2>
              <p className="text-sm leading-relaxed text-gray-600 dark:text-gray-400">
                Track your API usage patterns to understand when and how
                you&apos;re using AI services. The charts below show your token
                consumption, request volume, and peak usage times to help you
                optimize your usage and identify patterns.
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="mb-6 grid grid-cols-1 gap-6 md:grid-cols-4">
        <div className="card">
          <div className="card-content p-6">
            <div className="flex flex-col">
              <div className="mb-3 flex items-center">
                <ChartBarIcon className="mr-3 h-6 w-6 text-gray-600 dark:text-gray-400" />
                <p className="text-xs font-medium text-gray-600 dark:text-gray-400">
                  Total Tokens
                </p>
              </div>
              <div className="flex items-center">
                <p className="mr-3 text-lg font-bold text-gray-900 dark:text-white">
                  {totalTokens.toLocaleString()}
                </p>
                <div className="flex items-center">
                  <ArrowTrendingUpIcon className="mr-1 h-4 w-4 text-green-500" />
                  <span className="text-xs text-green-600">
                    +{tokensTrend}%
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-content p-6">
            <div className="flex flex-col">
              <div className="mb-3 flex items-center">
                <UserGroupIcon className="mr-3 h-6 w-6 text-gray-600 dark:text-gray-400" />
                <p className="text-xs font-medium text-gray-600 dark:text-gray-400">
                  Total Requests
                </p>
              </div>
              <div className="flex items-center">
                <p className="mr-3 text-lg font-bold text-gray-900 dark:text-white">
                  {totalRequests.toLocaleString()}
                </p>
                <div className="flex items-center">
                  <ArrowTrendingUpIcon className="mr-1 h-4 w-4 text-green-500" />
                  <span className="text-xs text-green-600">
                    +{requestsTrend}%
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-content p-6">
            <div className="flex flex-col">
              <div className="mb-3 flex items-center">
                <CpuChipIcon className="mr-3 h-6 w-6 text-gray-600 dark:text-gray-400" />
                <p className="text-xs font-medium text-gray-600 dark:text-gray-400">
                  Avg Tokens/Request
                </p>
              </div>
              <div className="flex items-center">
                <p className="mr-3 text-lg font-bold text-gray-900 dark:text-white">
                  {avgTokensPerRequest}
                </p>
                <div className="flex items-center">
                  <ArrowTrendingDownIcon className="mr-1 h-4 w-4 text-red-500" />
                  <span className="text-xs text-red-600">{avgTrend}%</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-content p-6">
            <div className="flex flex-col">
              <div className="mb-3 flex items-center">
                <ClockIcon className="mr-3 h-6 w-6 text-gray-600 dark:text-gray-400" />
                <p className="text-xs font-medium text-gray-600 dark:text-gray-400">
                  Peak Hour
                </p>
              </div>
              <div className="flex items-center">
                <p className="mr-3 text-lg font-bold text-gray-900 dark:text-white">
                  {peakHour}
                </p>
                <div className="flex items-center">
                  <ArrowTrendingUpIcon className="mr-1 h-4 w-4 text-green-500" />
                  <span className="text-xs text-green-600">+{peakTrend}%</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h3 className="card-title">Usage Trends</h3>
          <p className="card-description">
            Daily requests and tokens over time
          </p>
        </div>
        <div className="card-content">
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={chartData}
                margin={{ top: 10, right: 16, left: 16, bottom: 0 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  className="dark:stroke-gray-800"
                />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 10, fill: 'rgb(107,114,128)' }}
                  stroke="#9ca3af"
                  interval={0}
                  ticks={
                    ['30d', '90d'].includes(timeRange)
                      ? chartData
                          .filter((_: any, i: number) => i % 3 === 0)
                          .map((d: any) => d.date)
                      : undefined
                  }
                />
                <YAxis
                  yAxisId="left"
                  tick={{ fontSize: 11, fill: 'rgb(107,114,128)' }}
                  stroke="#9ca3af"
                  width={50}
                  tickMargin={0}
                  label={{
                    value: 'Requests',
                    angle: -90,
                    position: 'outsideLeft',
                    offset: 9,
                    style: { fontSize: '12px', fill: 'rgb(107,114,128)' },
                  }}
                />
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  tick={{ fontSize: 11, fill: 'rgb(107,114,128)' }}
                  stroke="#9ca3af"
                  width={54}
                  tickMargin={0}
                  label={{
                    value: 'Tokens (k)',
                    angle: 90,
                    position: 'outsideRight',
                    offset: 9,
                    style: { fontSize: '12px', fill: 'rgb(107,114,128)' },
                  }}
                />
                <Tooltip
                  formatter={(value: number, name: string) => {
                    if (name.includes('Tokens')) {
                      return [`${value.toLocaleString()}k`, 'Tokens'];
                    }
                    return [value.toLocaleString(), name];
                  }}
                />
                <Legend />
                <Area
                  yAxisId="left"
                  type="monotone"
                  dataKey="requests"
                  name="Requests"
                  stroke="#7c3aed"
                  fill="#7c3aed"
                  fillOpacity={0.2}
                />
                <Area
                  yAxisId="right"
                  type="monotone"
                  dataKey="tokensK"
                  name="Tokens (k)"
                  stroke="#60a5fa"
                  fill="#60a5fa"
                  fillOpacity={0.2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h3 className="card-title">Daily Cost Pattern</h3>
          <p className="card-description">Cost distribution across days</p>
        </div>
        <div className="card-content">
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={chartData}
                margin={{ top: 10, right: 24, left: 0, bottom: 0 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  className="dark:stroke-gray-800"
                />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 10, fill: 'rgb(107,114,128)' }}
                  stroke="#9ca3af"
                />
                <YAxis
                  tick={{ fontSize: 10, fill: 'rgb(107,114,128)' }}
                  stroke="#9ca3af"
                  width={60}
                />
                <Tooltip
                  formatter={(v: number) => [
                    `$${(v as number).toFixed(4)}`,
                    'Cost',
                  ]}
                />
                <Area
                  type="monotone"
                  dataKey="cost"
                  name="Cost"
                  stroke="#10b981"
                  fill="#10b981"
                  fillOpacity={0.2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h3 className="card-title">Peak Usage Hours</h3>
          <p className="card-description">Request volume by hour of day</p>
        </div>
        <div className="card-content">
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={(analyticsData?.hourly_patterns || []).map(h => ({
                  hour: `${h.hour}:00`,
                  requests: h.requests,
                }))}
                margin={{ top: 10, right: 24, left: 0, bottom: 0 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  className="dark:stroke-gray-800"
                />
                <XAxis
                  dataKey="hour"
                  tick={{ fontSize: 10, fill: 'rgb(107,114,128)' }}
                  stroke="#9ca3af"
                />
                <YAxis
                  tick={{ fontSize: 10, fill: 'rgb(107,114,128)' }}
                  stroke="#9ca3af"
                  width={50}
                />
                <Tooltip formatter={(v: number) => [v, 'Requests']} />
                <Bar
                  dataKey="requests"
                  name="Requests"
                  fill="#7c3aed"
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </>
  );
}

// Cost Analysis Content
function CostAnalysisContent({
  timeRange,
  analyticsData,
}: {
  timeRange: string;
  analyticsData: AnalyticsData | null;
}) {
  // Use real data from API for cost breakdown
  const costBreakdownData = (() => {
    if (analyticsData?.usage_trends) {
      return analyticsData.usage_trends.map(trend => {
        // Parse YYYY-MM-DD date string as local date to avoid timezone shift
        const [year, month, day] = trend.date.split('-').map(Number);
        const date = new Date(year, month - 1, day);
        return {
          date: date.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
          }),
          cost: Number(trend.cost) || 0, // Ensure we convert to number and handle small values
        };
      });
    }

    // Fallback: generate empty data
    return [];
  })();

  // Days in range
  const daysInRange =
    timeRange === '7d'
      ? 7
      : timeRange === '30d'
        ? 30
        : timeRange === '90d'
          ? 90
          : 365;

  // Calculate summary values based on API overview (fallback to series if missing)
  const totalCost =
    (analyticsData?.overview?.total_cost ?? 0) ||
    costBreakdownData.reduce((sum, p) => sum + p.cost, 0);
  const avgDailyCost = daysInRange > 0 ? totalCost / daysInRange : 0;

  // Compute simple trend: compare last half of days vs previous half using usage_trends.cost
  const periodTrend = (() => {
    const series = (analyticsData?.usage_trends || []).map(t => t.cost || 0);
    if (series.length < 4) return 0;
    const half = Math.floor(series.length / 2);
    const prev = series.slice(0, half).reduce((a, b) => a + b, 0);
    const curr = series.slice(-half).reduce((a, b) => a + b, 0);
    if (prev === 0) return curr > 0 ? 100 : 0;
    return Math.round(((curr - prev) / prev) * 1000) / 10; // one decimal percent
  })();

  // Generate provider costs based on time range
  const providerData = (() => {
    const stats =
      analyticsData?.provider_stats && analyticsData.provider_stats.length > 0
        ? analyticsData.provider_stats
        : (analyticsData as any)?.provider_summary || [];
    const colorMap: Record<string, string> = {
      openai: '#3b82f6',
      anthropic: '#10b981',
      google: '#f59e0b',
      perplexity: '#8b5cf6',
    };
    return stats.map((p: any) => {
      const name = (p.name || p.provider || 'unknown').toLowerCase();
      const label = p.name || p.provider || 'Unknown';
      const cost = (p.totalCost ?? p.total_cost ?? 0) as number;
      return {
        name,
        label,
        cost,
        color: colorMap[name] || '#64748b',
      };
    });
  })();

  // Generate top models by cost based on time range
  const topModelsData = (() => {
    const stats = analyticsData?.provider_stats || [];
    const models: Array<{
      name: string;
      cost: number;
      requests: number;
      avgPerRequest: number;
      color: string;
    }> = [];
    const colorMap: Record<string, string> = {
      openai: '#3b82f6',
      anthropic: '#10b981',
      google: '#f59e0b',
      perplexity: '#8b5cf6',
    };
    stats.forEach((p: any) => {
      const providerColor =
        colorMap[p.name?.toLowerCase?.() || ''] || '#64748b';
      (p.models || []).forEach((m: any) => {
        const avgPerRequest =
          (m.requestCount || 0) > 0 ? (m.totalCost || 0) / m.requestCount : 0;
        models.push({
          name: m.name,
          cost: m.totalCost || 0,
          requests: m.requestCount || 0,
          avgPerRequest,
          color: providerColor,
        });
      });
    });
    return models.sort((a, b) => b.cost - a.cost).slice(0, 8);
  })();

  return (
    <>
      {/* About Section */}
      <div className="card mb-6">
        <div className="card-content pt-6">
          <div className="flex items-start">
            <div className="mr-4 flex-shrink-0">
              <div className="rounded-lg bg-purple-100 p-2 dark:bg-purple-900/20">
                <BanknotesIcon className="h-6 w-6 text-purple-600 dark:text-purple-400" />
              </div>
            </div>
            <div className="flex-1">
              <h2 className="mb-3 text-xl font-semibold text-gray-900 dark:text-white">
                About Cost Analysis
              </h2>
              <p className="text-sm leading-relaxed text-gray-600 dark:text-gray-400">
                Monitor your AI spending across different providers and models.
                The 7-day trend shows whether your costs are increasing or
                decreasing compared to the previous period. Use this data to
                identify cost-saving opportunities and optimize your AI usage.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Cost Summary Cards */}
      <div className="mb-6 grid grid-cols-1 gap-6 md:grid-cols-3">
        <div className="card">
          <div className="card-content p-6">
            <div className="flex flex-col">
              <div className="mb-3 flex items-center">
                <CurrencyDollarIcon className="mr-3 h-6 w-6 text-gray-600 dark:text-gray-400" />
                <p className="text-xs font-medium text-gray-600 dark:text-gray-400">
                  Total Cost
                </p>
              </div>
              <div className="flex items-center">
                <p className="mr-3 text-lg font-bold text-gray-900 dark:text-white">
                  {totalCost > 0 && totalCost < 0.01
                    ? '<$0.01'
                    : `$${totalCost.toFixed(4)}`}
                </p>
                <div className="flex items-center">
                  <ArrowTrendingUpIcon className="mr-1 h-4 w-4 text-red-500" />
                  <span className="text-xs text-red-600">+{periodTrend}%</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-content p-6">
            <div className="flex flex-col">
              <div className="mb-3 flex items-center">
                <ChartBarIcon className="mr-3 h-6 w-6 text-gray-600 dark:text-gray-400" />
                <p className="text-xs font-medium text-gray-600 dark:text-gray-400">
                  Avg Daily Cost
                </p>
              </div>
              <div className="flex items-center">
                <p className="mr-3 text-lg font-bold text-gray-900 dark:text-white">
                  {avgDailyCost > 0 && avgDailyCost < 0.01
                    ? '<$0.01'
                    : `$${avgDailyCost.toFixed(4)}`}
                </p>
                <div className="flex items-center">
                  <ArrowTrendingUpIcon className="mr-1 h-4 w-4 text-red-500" />
                  <span className="text-xs text-red-600">+{periodTrend}%</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-content p-6">
            <div className="flex flex-col">
              <div className="mb-3 flex items-center">
                <ArrowTrendingUpIcon className="mr-3 h-6 w-6 text-gray-600 dark:text-gray-400" />
                <p className="text-xs font-medium text-gray-600 dark:text-gray-400">
                  {timeRange === '7d'
                    ? '7'
                    : timeRange === '30d'
                      ? '30'
                      : timeRange === '90d'
                        ? '90'
                        : '365'}
                  -Day Trend
                </p>
              </div>
              <div className="flex items-center">
                <p className="mr-3 text-lg font-bold text-gray-900 dark:text-white">
                  +{periodTrend}%
                </p>
                <div className="flex items-center">
                  <ArrowTrendingUpIcon className="mr-1 h-4 w-4 text-red-500" />
                  <span className="text-xs text-red-600">vs last period</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Cost Breakdown Chart */}
      <div className="card mb-6">
        <div className="card-header">
          <h3 className="card-title">Cost Breakdown</h3>
          <p className="card-description">
            Daily spending trends over the selected period
          </p>
        </div>
        <div className="card-content">
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart
              data={
                costBreakdownData.length > 0
                  ? costBreakdownData
                  : [{ date: 'N/A', cost: 0 }]
              }
            >
              <CartesianGrid
                strokeDasharray="3 3"
                className="stroke-gray-200 dark:stroke-gray-700"
              />
              <XAxis
                dataKey="date"
                tick={{ fill: 'rgb(107, 114, 128)', fontSize: 11 }}
                label={{
                  value: 'Date',
                  position: 'insideBottom',
                  offset: -5,
                  className: 'text-sm fill-gray-900 dark:fill-gray-400',
                }}
              />
              <YAxis
                tick={{ fill: 'rgb(107, 114, 128)', fontSize: 11 }}
                domain={['dataMin', 'dataMax']}
                label={{
                  value: 'Cost ($)',
                  angle: -90,
                  position: 'insideLeft',
                  className: 'text-sm fill-gray-600 dark:fill-gray-400',
                }}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'rgba(255, 255, 255, 0.95)',
                  border: '1px solid #242424',
                  borderRadius: '0.5rem',
                }}
                labelStyle={{ color: '#111827', fontWeight: 600 }}
                formatter={(value: number) => {
                  const numValue = Number(value);
                  if (numValue > 0 && numValue < 0.01) {
                    return '<$0.01';
                  }
                  return `$${numValue.toFixed(4)}`;
                }}
              />
              <Area
                type="monotone"
                dataKey="cost"
                stroke="#9333ea"
                fill="#9333ea"
                fillOpacity={0.2}
                strokeWidth={3}
                dot={{ fill: '#9333ea', r: 4 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Cost by Provider */}
      <div className="card mb-6">
        <div className="card-header">
          <h3 className="card-title">Cost by Provider</h3>
          <p className="card-description">
            Spending distribution across AI providers
          </p>
        </div>
        <div className="card-content">
          <div className="flex flex-col items-center gap-8 lg:flex-row">
            <div className="flex w-full justify-center lg:w-1/3">
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={providerData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    innerRadius={80}
                    outerRadius={120}
                    paddingAngle={2}
                    dataKey="cost"
                  >
                    {providerData.map((entry: any, index: number) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'rgba(255, 255, 255, 0.95)',
                      border: '1px solid #242424',
                      borderRadius: '0.5rem',
                    }}
                    formatter={(value: number) =>
                      value > 0 && value < 0.01
                        ? '<$0.01'
                        : `$${(value as number).toFixed(4)}`
                    }
                  />
                  <text
                    x="50%"
                    y="45%"
                    textAnchor="middle"
                    dominantBaseline="middle"
                    className="fill-gray-900 text-2xl font-bold dark:fill-white"
                  >
                    {totalCost > 0 && totalCost < 0.01
                      ? '<$0.01'
                      : `$${totalCost.toFixed(4)}`}
                  </text>
                  <text
                    x="50%"
                    y="55%"
                    textAnchor="middle"
                    dominantBaseline="middle"
                    className="fill-gray-600 text-sm dark:fill-gray-400"
                  >
                    Total Cost
                  </text>
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="w-full space-y-3 lg:w-2/3">
              {providerData.map((provider: any) => {
                const percent =
                  totalCost > 0
                    ? ((provider.cost / totalCost) * 100).toFixed(1)
                    : '0.0';
                return (
                  <div
                    key={provider.name}
                    className="flex items-center justify-between rounded-lg border border-gray-200 p-4 dark:border-[#242424]"
                  >
                    <div className="flex items-center">
                      <div
                        className="mr-4 h-5 w-5 rounded-sm"
                        style={{ backgroundColor: provider.color }}
                      ></div>
                      <span className="text-base font-medium text-gray-900 dark:text-white">
                        {provider.label}
                      </span>
                    </div>
                    <span className="text-base font-bold text-gray-900 dark:text-white">
                      {provider.cost > 0 && provider.cost < 0.01
                        ? '<$0.01'
                        : `$${provider.cost.toFixed(4)}`}{' '}
                      ({percent}%)
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Monthly Comparison */}
      <div className="card mb-6">
        <div className="card-header">
          <h3 className="card-title">Monthly Comparison</h3>
          <p className="card-description">12-month rolling cost trends</p>
        </div>
        <div className="card-content">
          {(() => {
            // Aggregate usage_trends by month (local timezone) and fill missing months
            const byMonth = new Map<string, number>();
            (analyticsData?.usage_trends || []).forEach(t => {
              // Parse YYYY-MM-DD date string as local date to avoid timezone shift
              const [year, month, day] = t.date.split('-').map(Number);
              const d = new Date(year, month - 1, day);
              const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
              byMonth.set(key, (byMonth.get(key) || 0) + (t.cost || 0));
            });

            // Generate last 12 months based on current local date
            const now = new Date();
            const monthsTmp: { ts: number; label: string; cost: number }[] = [];
            for (let i = 11; i >= 0; i--) {
              // Calculate month in local timezone
              const ref = new Date(now.getFullYear(), now.getMonth() - i, 1);
              const key = `${ref.getFullYear()}-${String(ref.getMonth() + 1).padStart(2, '0')}`;
              const monthStr = ref.toLocaleDateString('en-US', {
                month: 'short',
              });
              const yearStr = ref.toLocaleDateString('en-US', {
                year: '2-digit',
              });
              const label = `${monthStr} '${yearStr}`; // e.g., Jan '25
              monthsTmp.push({
                ts: ref.getTime(),
                label,
                cost: byMonth.get(key) || 0,
              });
            }
            const months = monthsTmp
              .sort((a, b) => a.ts - b.ts)
              .map(m => ({ label: m.label, cost: m.cost }));

            return (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart
                  data={months}
                  margin={{ top: 10, right: 16, left: 8, bottom: 0 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    className="dark:stroke-gray-800"
                  />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 10, fill: 'rgb(107,114,128)' }}
                    stroke="#9ca3af"
                    interval={0}
                  />
                  <YAxis
                    tick={{ fontSize: 10, fill: 'rgb(107,114,128)' }}
                    stroke="#9ca3af"
                    width={60}
                    label={{
                      value: 'Cost ($)',
                      angle: -90,
                      position: 'insideLeft',
                      style: { fontSize: '10px', fill: 'rgb(107,114,128)' },
                    }}
                  />
                  <Tooltip
                    formatter={(v: number) => `$${(v as number).toFixed(4)}`}
                  />
                  <Bar
                    dataKey="cost"
                    name="Cost"
                    fill="#10b981"
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            );
          })()}
        </div>
      </div>

      {/* Top Models by Cost */}
      <div className="card">
        <div className="card-header">
          <h3 className="card-title">Top Models by Cost</h3>
          <p className="card-description">
            Detailed cost breakdown by AI model
          </p>
        </div>
        <div className="card-content">
          <div className="space-y-4">
            {topModelsData.map(model => {
              const percent = ((model.cost / totalCost) * 100).toFixed(1);
              return (
                <div
                  key={model.name}
                  className="rounded-lg border border-gray-200 p-4 dark:border-[#242424]"
                >
                  <div className="mb-2 flex items-center justify-between">
                    <span className="font-medium text-gray-900 dark:text-white">
                      {model.name}
                    </span>
                    <span className="font-bold text-gray-900 dark:text-white">
                      {model.cost < 0.01 && model.cost > 0
                        ? '<$0.01'
                        : `$${model.cost.toFixed(4)}`}
                    </span>
                  </div>
                  <div className="mb-2 flex items-center justify-between text-sm text-gray-600 dark:text-gray-400">
                    <span>
                      {model.requests} requests • $
                      {model.avgPerRequest.toFixed(4)} avg/request
                    </span>
                    <span>{percent}%</span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-gray-200 dark:bg-gray-700">
                    <div
                      className="h-2 rounded-full"
                      style={{
                        width: `${percent}%`,
                        backgroundColor: model.color,
                      }}
                    ></div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </>
  );
}

// Model Insights Content
function ModelInsightsContent({
  timeRange,
  analyticsData,
}: {
  timeRange: string;
  analyticsData: AnalyticsData | null;
}) {
  // Build model performance data from analytics API
  const modelUsage = analyticsData?.model_usage || [];
  const modelPerformanceData = modelUsage.map(m => ({
    name: m.model,
    provider: m.provider,
    requests: m.requests || 0,
    tokens: m.total_tokens || 0,
    cost: m.cost || 0,
    avgLatency: m.avg_latency || 0,
    successRate: m.success_rate || 0,
    costPer1k: m.total_tokens > 0 ? (m.cost / m.total_tokens) * 1000 : 0,
    avgTokensPerRequest:
      m.requests > 0 ? Math.round((m.total_tokens as number) / m.requests) : 0,
  }));

  // Ensure Model Performance chart shows all known models even without data
  const knownModels: string[] = [
    'gpt-4o',
    'gemini-2.5-pro',
    'claude-opus-4-20250514',
    'claude-sonnet-4-20250514',
    'claude-sonnet-4-5-20250929',
    'sonar',
    'o1',
  ];
  const allModelNames = Array.from(
    new Set<string>([...knownModels, ...modelPerformanceData.map(m => m.name)])
  );
  const chartModelPerformanceData = allModelNames.map(name => {
    const found = modelPerformanceData.find(m => m.name === name);
    return {
      name,
      avgTokens: found?.avgTokensPerRequest || 0,
    };
  });

  // Summary values
  const totalModels = modelPerformanceData.length;
  const mostUsed = modelPerformanceData.reduce(
    (max, model) => (model.requests > max.requests ? model : max),
    modelPerformanceData[0] || { name: '-', requests: 0 }
  );
  const mostEfficient = modelPerformanceData.reduce(
    (min, model) => (model.costPer1k < min.costPer1k ? model : min),
    modelPerformanceData[0] || { name: '-', costPer1k: Infinity }
  );

  // Generate Model Usage Distribution data (top 5 by request volume)
  const usageDistribution = (() => {
    const sorted = [...modelPerformanceData].sort(
      (a, b) => b.requests - a.requests
    );
    const top5 = sorted.slice(0, 5);
    const others = sorted.slice(5);
    const othersTotal = others.reduce((sum, model) => sum + model.requests, 0);
    const totalRequests = modelPerformanceData.reduce(
      (sum, model) => sum + model.requests,
      0
    );

    const result = top5.map(model => ({
      name: model.name,
      percentage: Math.round((model.requests / totalRequests) * 100 * 10) / 10,
    }));

    if (othersTotal > 0) {
      result.push({
        name: 'Others',
        percentage: Math.round((othersTotal / totalRequests) * 100 * 10) / 10,
      });
    }

    return result;
  })();

  // Generate Cost Efficiency data (sorted by cost)
  const costEfficiency = (() => {
    const sorted = [...modelPerformanceData].sort(
      (a, b) => a.costPer1k - b.costPer1k
    );
    const maxCost = Math.max(...sorted.map(m => m.costPer1k), 1);

    return sorted.map(model => ({
      name: model.name,
      cost: model.costPer1k,
      percentage: Math.round((model.costPer1k / maxCost) * 100),
    }));
  })();

  return (
    <>
      {/* About Section */}
      <div className="card mb-6">
        <div className="card-content pt-6">
          <div className="flex items-start">
            <div className="mr-4 flex-shrink-0">
              <div className="rounded-lg bg-purple-100 p-2 dark:bg-purple-900/20">
                <CpuChipIcon className="h-6 w-6 text-purple-600 dark:text-purple-400" />
              </div>
            </div>
            <div className="flex-1">
              <h2 className="mb-3 text-xl font-semibold text-gray-900 dark:text-white">
                About Model Insights
              </h2>
              <p className="text-sm leading-relaxed text-gray-600 dark:text-gray-400">
                Compare the performance and cost-efficiency of different AI
                models. The most efficient model uses the fewest tokens per
                dollar, while the most used model has the highest request
                volume. Use these insights to choose the right model for your
                needs.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="mb-6 grid grid-cols-1 gap-6 md:grid-cols-3">
        <div className="card">
          <div className="card-content p-4">
            <div className="flex items-center">
              <div className="mr-3 flex-shrink-0">
                <CpuChipIcon className="h-8 w-8 text-gray-400" />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
                  Total Models
                </p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">
                  {totalModels}
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-content p-4">
            <div className="flex items-center">
              <div className="mr-3 flex-shrink-0">
                <ChartBarIcon className="h-8 w-8 text-gray-400" />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
                  Most Used
                </p>
                <p className="text-lg font-bold text-gray-900 dark:text-white">
                  {mostUsed.name}
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-content p-4">
            <div className="flex items-center">
              <div className="mr-3 flex-shrink-0">
                <CurrencyDollarIcon className="h-8 w-8 text-gray-400" />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
                  Most Efficient
                </p>
                <p className="text-lg font-bold text-gray-900 dark:text-white">
                  {mostEfficient.name}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h3 className="card-title">Model Performance</h3>
          <p className="card-description">
            Average tokens per request by model
          </p>
        </div>
        <div className="card-content">
          <ResponsiveContainer width="100%" height={320}>
            <BarChart
              data={chartModelPerformanceData}
              layout="vertical"
              margin={{ left: 120, right: 20, bottom: 40 }}
              onMouseEnter={() => {}}
              onMouseLeave={() => {}}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                className="stroke-gray-200 dark:stroke-gray-700"
              />
              <XAxis
                type="number"
                tick={{ fill: 'rgb(107, 114, 128)', fontSize: 11 }}
                label={{
                  value: 'Avg Tokens/Request',
                  position: 'insideBottom',
                  offset: 0,
                  className: 'text-sm fill-gray-900 dark:fill-gray-400',
                }}
              />
              <YAxis
                type="category"
                dataKey="name"
                tick={{ fill: 'rgb(107, 114, 128)', fontSize: 11 }}
                width={100}
              />
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload || !payload.length) return null;
                  return (
                    <div className="rounded-lg border border-gray-200 bg-white p-2 shadow-lg dark:border-[#242424] dark:bg-gray-800">
                      <p className="mb-1 text-sm font-semibold text-gray-900 dark:text-white">
                        {payload[0].payload?.name}
                      </p>
                      <p className="text-sm text-purple-600 dark:text-purple-400">
                        {payload[0].value?.toLocaleString()} avg tokens/request
                      </p>
                    </div>
                  );
                }}
              />
              <Bar
                dataKey="avgTokens"
                fill="#8b5cf6"
                radius={[0, 4, 4, 0]}
                isAnimationActive={false}
                animationDuration={0}
                activeBar={false}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">Model Usage Distribution</h3>
            <p className="card-description">
              Top 5 models by request volume (others grouped)
            </p>
          </div>
          <div className="card-content">
            <div className="space-y-4">
              {usageDistribution.map(model => (
                <div key={model.name}>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600 dark:text-gray-400">
                      {model.name}
                    </span>
                    <span className="text-sm font-medium text-gray-900 dark:text-white">
                      {model.percentage}%
                    </span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-gray-200 dark:bg-gray-700">
                    <div
                      className="h-2 rounded-full bg-blue-500"
                      style={{ width: `${model.percentage}%` }}
                    ></div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <h3 className="card-title">Cost Efficiency</h3>
            <p className="card-description">Cost per 1,000 tokens by model</p>
          </div>
          <div className="card-content">
            <div className="space-y-4">
              {costEfficiency.map(model => (
                <div key={model.name}>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600 dark:text-gray-400">
                      {model.name}
                    </span>
                    <span className="text-sm font-medium text-gray-900 dark:text-white">
                      ${model.cost.toFixed(2)}
                    </span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-gray-200 dark:bg-gray-700">
                    <div
                      className="h-2 rounded-full bg-blue-500"
                      style={{ width: `${model.percentage}%` }}
                    ></div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Detailed Model Statistics */}
      <div className="card">
        <div className="card-header">
          <h3 className="card-title">Detailed Model Statistics</h3>
          <p className="card-description">
            Complete breakdown of all models used
          </p>
        </div>
        <div className="card-content">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead>
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                    Model
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                    Provider
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                    Requests
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                    Tokens
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                    Cost
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                    Avg/Request
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                    $/1K Tokens
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {modelPerformanceData.map(m => {
                  const costPer1k = m.costPer1k || 0;
                  const avgPerReq = m.requests > 0 ? m.cost / m.requests : 0;
                  const tokensPretty =
                    m.tokens >= 1000
                      ? `${(m.tokens / 1000).toFixed(1)}K`
                      : m.tokens.toString();
                  return (
                    <tr
                      key={m.name}
                      className="transition-colors duration-150 hover:bg-gray-50 dark:hover:bg-gray-800/50"
                    >
                      <td className="whitespace-nowrap px-6 py-4 text-sm font-medium text-gray-900 dark:text-white">
                        {m.name}
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500 dark:text-gray-400">
                        {m.provider}
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-900 dark:text-white">
                        {m.requests.toLocaleString()}
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-900 dark:text-white">
                        {tokensPretty}
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-900 dark:text-white">
                        {m.cost > 0 && m.cost < 0.01
                          ? '<$0.01'
                          : `$${m.cost.toFixed(4)}`}
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-900 dark:text-white">
                        ${avgPerReq.toFixed(4)}
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-900 dark:text-white">
                        ${costPer1k.toFixed(4)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}

// Performance Content
function PerformanceContent({
  timeRange,
  analyticsData,
}: {
  timeRange: string;
  analyticsData: AnalyticsData | null;
}) {
  // Build efficiency series (tokens per request per day) from analytics data
  const efficiencyData = (analyticsData?.usage_trends || []).map(t => {
    // Parse YYYY-MM-DD date string as local date to avoid timezone shift
    const [year, month, day] = t.date.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    return {
      date: date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
      }),
      value: t.requests > 0 ? Math.round(t.tokens / t.requests) : 0,
    };
  });

  // Summary values from overview (more accurate): avg tokens/request and total requests
  const totalRequests = analyticsData?.overview.total_requests || 0;
  const totalTokens = analyticsData?.overview.total_tokens || 0;
  const avgTokensPerRequest =
    totalRequests > 0 ? Math.round(totalTokens / totalRequests) : 0;

  // Simple trend: compare last 3 days vs previous 3 days average
  const computeTrend = () => {
    const series = efficiencyData.map(p => p.value);
    if (series.length < 6) return 0;
    const last3 = series.slice(-3).reduce((a, b) => a + b, 0) / 3;
    const prev3 = series.slice(-6, -3).reduce((a, b) => a + b, 0) / 3;
    if (prev3 === 0) return last3 > 0 ? 100 : 0;
    return Math.round(((last3 - prev3) / prev3) * 1000) / 10; // one decimal percent
  };
  const efficiencyTrend = computeTrend();

  // Model performance dataset for this section
  const perfModels = (analyticsData?.model_usage || []).map(m => ({
    name: m.model,
    avgTokensPerRequest:
      (m.requests || 0) > 0
        ? Math.round((m.total_tokens || 0) / m.requests)
        : 0,
  }));

  // Ensure all known models appear even if no data
  const perfKnownModels: string[] = [
    'gpt-4o',
    'gemini-2.5-pro',
    'claude-opus-4-20250514',
    'claude-sonnet-4-20250514',
    'claude-sonnet-4-5-20250929',
    'sonar',
    'o1',
  ];
  const perfAllNames = Array.from(
    new Set<string>([...perfKnownModels, ...perfModels.map(m => m.name)])
  );
  const perfModelsAll = perfAllNames.map(name => {
    const f = perfModels.find(m => m.name === name);
    return { name, avgTokensPerRequest: f?.avgTokensPerRequest || 0 };
  });

  return (
    <>
      {/* About Section */}
      <div className="card mb-6">
        <div className="card-content pt-6">
          <div className="flex items-start">
            <div className="mr-4 flex-shrink-0">
              <div className="rounded-lg bg-purple-100 p-2 dark:bg-purple-900/20">
                <BoltIcon className="h-6 w-6 text-purple-600 dark:text-purple-400" />
              </div>
            </div>
            <div className="flex-1">
              <h2 className="mb-3 text-xl font-semibold text-gray-900 dark:text-white">
                About Performance Metrics
              </h2>
              <p className="text-sm leading-relaxed text-gray-600 dark:text-gray-400">
                Token efficiency measures how many tokens are used per request.
                Lower values indicate more efficient prompts and responses. The
                efficiency trend shows whether your token usage is increasing or
                decreasing over time compared to the previous period.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="mb-6 grid grid-cols-1 gap-6 md:grid-cols-3">
        <div className="card">
          <div className="card-content p-4">
            <div className="flex items-center">
              <div className="mr-3 flex-shrink-0">
                <CpuChipIcon className="h-8 w-8 text-gray-400" />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
                  Avg Tokens/Request
                </p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">
                  {avgTokensPerRequest.toLocaleString()}
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-content p-4">
            <div className="flex items-center">
              <div className="mr-3 flex-shrink-0">
                <ChartBarIcon className="h-8 w-8 text-gray-400" />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
                  Total Requests
                </p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">
                  {totalRequests.toLocaleString()}
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-content p-4">
            <div className="flex items-center">
              <div className="mr-3 flex-shrink-0">
                <ArrowTrendingUpIcon className="h-8 w-8 text-gray-400" />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
                  {timeRange === '7d'
                    ? '7'
                    : timeRange === '30d'
                      ? '30'
                      : timeRange === '90d'
                        ? '90'
                        : '365'}
                  -Day Trend
                </p>
                <p className="text-2xl font-bold text-red-600 dark:text-red-400">
                  +{efficiencyTrend}%
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  More tokens used
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Token Efficiency Over Time */}
      <div className="card mb-6">
        <div className="card-header">
          <h3 className="card-title">Token Efficiency Over Time</h3>
          <p className="card-description">
            Average tokens per request - lower is more efficient
          </p>
        </div>
        <div className="card-content">
          <ResponsiveContainer width="100%" height={320}>
            <AreaChart data={efficiencyData}>
              <CartesianGrid
                strokeDasharray="3 3"
                className="stroke-gray-200 dark:stroke-gray-700"
              />
              <XAxis
                dataKey="date"
                tick={{ fill: 'rgb(107, 114, 128)', fontSize: 11 }}
                label={{
                  value: 'Date',
                  position: 'insideBottom',
                  offset: -5,
                  className: 'text-sm fill-gray-900 dark:fill-gray-400',
                }}
              />
              <YAxis
                tick={{ fill: 'rgb(107, 114, 128)', fontSize: 11 }}
                label={{
                  value: 'Avg Tokens',
                  angle: -90,
                  position: 'insideLeft',
                  className: 'text-sm fill-gray-900 dark:fill-gray-400',
                }}
              />
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload || !payload.length) return null;
                  return (
                    <div className="rounded-lg border border-gray-200 bg-white p-2 shadow-lg dark:border-[#242424] dark:bg-gray-800">
                      <p className="mb-1 text-sm font-semibold text-gray-900 dark:text-white">
                        {payload[0].payload?.date}
                      </p>
                      <p className="text-sm text-purple-600 dark:text-purple-400">
                        {payload[0].value?.toLocaleString()} tokens
                      </p>
                    </div>
                  );
                }}
              />
              <Area
                type="monotone"
                dataKey="value"
                stroke="#8b5cf6"
                fill="#8b5cf6"
                fillOpacity={0.2}
                strokeWidth={2}
                dot={{ fill: '#8b5cf6', r: 3 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Response Time Distribution */}
      <div className="card mb-6">
        <div className="card-header">
          <h3 className="card-title">Response Time Distribution</h3>
          <p className="card-description">Request volume by response time</p>
        </div>
        <div className="card-content">
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={analyticsData?.response_time_distribution || []}>
              <CartesianGrid
                strokeDasharray="3 3"
                className="stroke-gray-200 dark:stroke-gray-700"
              />
              <XAxis
                dataKey="label"
                tick={{ fill: 'rgb(107, 114, 128)', fontSize: 11 }}
                angle={-45}
                textAnchor="end"
                height={100}
                label={{
                  value: 'Response Time Range',
                  position: 'insideBottom',
                  offset: 5,
                  className: 'text-sm fill-gray-900 dark:fill-gray-400',
                }}
              />
              <YAxis
                tick={{ fill: 'rgb(107, 114, 128)', fontSize: 11 }}
                label={{
                  value: 'Requests',
                  angle: -90,
                  position: 'insideLeft',
                  className: 'text-sm fill-gray-600 dark:fill-gray-400',
                }}
              />
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload || !payload.length) return null;
                  return (
                    <div className="rounded-lg border border-gray-200 bg-white p-2 shadow-lg dark:border-[#242424] dark:bg-gray-800">
                      <p className="mb-1 text-sm font-semibold text-gray-900 dark:text-white">
                        {payload[0].name || payload[0].payload?.label}
                      </p>
                      <p className="text-sm text-blue-600 dark:text-blue-400">
                        {payload[0].value} requests
                      </p>
                    </div>
                  );
                }}
              />
              <Bar dataKey="value" fill="#3b82f6" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Token Efficiency by Model (from analytics usage) */}
      <div className="card">
        <div className="card-header">
          <h3 className="card-title">Token Efficiency by Model</h3>
          <p className="card-description">
            Most efficient models (lowest tokens/request)
          </p>
        </div>
        <div className="card-content">
          <ResponsiveContainer width="100%" height={320}>
            <BarChart
              data={perfModelsAll
                .map(m => ({
                  name: m.name,
                  tokens: m.avgTokensPerRequest || 0,
                }))
                .sort((a, b) => a.tokens - b.tokens)
                .slice(0, 10)}
              layout="vertical"
              margin={{ right: 30, bottom: 40 }}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                className="stroke-gray-200 dark:stroke-gray-700"
              />
              <XAxis
                type="number"
                tick={{ fill: 'rgb(107, 114, 128)', fontSize: 11 }}
                label={{
                  value: 'Avg Tokens/Request',
                  position: 'insideBottom',
                  offset: -5,
                  className: 'text-sm fill-gray-600 dark:fill-gray-400',
                }}
              />
              <YAxis
                type="category"
                dataKey="name"
                tick={{ fill: 'rgb(107, 114, 128)', fontSize: 11 }}
                width={150}
              />
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload || !payload.length) return null;
                  return (
                    <div className="rounded-lg border border-gray-200 bg-white p-2 shadow-lg dark:border-[#242424] dark:bg-gray-800">
                      <p className="mb-1 text-sm font-semibold text-gray-900 dark:text-white">
                        {payload[0].name || payload[0].payload?.name}
                      </p>
                      <p className="text-sm text-purple-600 dark:text-purple-400">
                        {payload[0].value?.toLocaleString()} avg tokens/request
                      </p>
                    </div>
                  );
                }}
              />
              <Bar dataKey="tokens" fill="#8b5cf6" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </>
  );
}

// Sanitation Statistics Content
function SanitationStatisticsContent({
  timeRange,
  analyticsData,
}: {
  timeRange: string;
  analyticsData: AnalyticsData | null;
}) {
  return (
    <>
      {/* About Section */}
      <div className="card mb-6">
        <div className="card-content pt-6">
          <div className="flex items-start">
            <div className="mr-4 flex-shrink-0">
              <div className="rounded-lg bg-purple-100 p-2 dark:bg-purple-900/20">
                <ShieldCheckIcon className="h-6 w-6 text-purple-600 dark:text-purple-400" />
              </div>
            </div>
            <div className="flex-1">
              <h2 className="mb-3 text-xl font-semibold text-gray-900 dark:text-white">
                About Sanitation Statistics
              </h2>
              <p className="text-sm leading-relaxed text-gray-600 dark:text-gray-400">
                Description will be provided.
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h3 className="card-title">Data Sanitization Overview</h3>
          <p className="card-description">
            Sanitization statistics over {timeRange}
          </p>
        </div>
        <div className="card-content">
          <div className="flex h-64 items-center justify-center rounded-lg bg-gray-50 dark:bg-gray-800">
            <div className="text-center">
              <ShieldCheckIcon className="mx-auto mb-2 h-12 w-12 text-gray-400" />
              <p className="text-gray-500 dark:text-gray-400">
                Sanitization Chart
              </p>
              <p className="text-sm text-gray-400">
                Sanitization visualization will be implemented here
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
        <div className="card">
          <div className="card-content">
            <div className="flex items-center">
              <div className="rounded-lg bg-blue-500 p-3">
                <ShieldCheckIcon className="h-6 w-6 text-white" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
                  Total Sanitized
                </p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">
                  13,450
                </p>
                <div className="mt-1 flex items-center">
                  <ArrowTrendingUpIcon className="mr-1 h-4 w-4 text-green-500" />
                  <span className="text-sm text-green-600">+8.7%</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-content">
            <div className="flex items-center">
              <div className="rounded-lg bg-red-500 p-3">
                <ShieldCheckIcon className="h-6 w-6 text-white" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
                  PII Detected
                </p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">
                  8,900
                </p>
                <div className="mt-1 flex items-center">
                  <ArrowTrendingUpIcon className="mr-1 h-4 w-4 text-red-500" />
                  <span className="text-sm text-red-600">+12.3%</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-content">
            <div className="flex items-center">
              <div className="rounded-lg bg-orange-500 p-3">
                <ShieldCheckIcon className="h-6 w-6 text-white" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
                  PHI Detected
                </p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">
                  2,100
                </p>
                <div className="mt-1 flex items-center">
                  <ArrowTrendingUpIcon className="mr-1 h-4 w-4 text-orange-500" />
                  <span className="text-sm text-orange-600">+6.8%</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
// Budget Forecast Content
function BudgetForecastContent({
  timeRange,
  analyticsData,
  forecastChartData,
}: {
  timeRange: string;
  analyticsData: AnalyticsData | null;
  forecastChartData: Array<{
    date: string;
    projected: number;
    budget?: number;
  }>;
}) {
  const cumulativeData = (() => {
    if (
      !analyticsData?.usage_trends ||
      analyticsData.usage_trends.length === 0
    ) {
      return [];
    }

    // Use the actual usage trends data from the API
    const usageTrends = analyticsData.usage_trends as Array<{
      date: string;
      cost: number;
    }>;
    let cumulativeSpending = 0;

    // Sort by date to ensure proper chronological order
    const sortedTrends = [...usageTrends].sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    );

    const points = sortedTrends.map(trend => {
      cumulativeSpending += Number(trend.cost) || 0;
      // Parse YYYY-MM-DD date string as local date to avoid timezone shift
      const [year, month, day] = trend.date.split('-').map(Number);
      const date = new Date(year, month - 1, day);
      return {
        date: date.toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
        }),
        spending: Math.round(cumulativeSpending * 10000) / 10000, // 4 decimal places for precision
      };
    });

    return points;
  })();

  // Calculate values for summary cards using real API data
  const currentSpending = analyticsData?.forecast?.current_month_spend || 0;
  const monthlyBudget = analyticsData?.forecast?.monthly_budget || 0;
  const budgetPercent =
    monthlyBudget > 0 ? (currentSpending / monthlyBudget) * 100 : 0;
  const remainingBudget = Math.max(0, monthlyBudget - currentSpending);
  const projectedEnd = analyticsData?.forecast?.projected_month_cost || 0;
  const avgDaily = analyticsData?.forecast?.daily_avg || 0;

  // Calculate budget health values based on actual calendar data
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const daysInMonth = monthEnd.getDate();
  const daysElapsed = Math.min(now.getDate(), daysInMonth);
  const daysRemaining = Math.max(0, daysInMonth - daysElapsed);

  // Calculate budget exhaustion based on current daily average
  const budgetExhausted =
    avgDaily > 0 ? Math.round(remainingBudget / avgDaily) : 0;

  // More nuanced budget status calculation
  const budgetStatus = (() => {
    if (budgetPercent < 50) return 'HEALTHY';
    if (budgetPercent < 75) return 'GOOD';
    if (budgetPercent < 90) return 'WARNING';
    if (budgetPercent < 100) return 'CRITICAL';
    return 'OVER_BUDGET';
  })();

  const budgetStatusColor = (() => {
    if (budgetPercent < 50) return 'text-green-600 dark:text-green-400';
    if (budgetPercent < 75) return 'text-blue-600 dark:text-blue-400';
    if (budgetPercent < 90) return 'text-yellow-600 dark:text-yellow-400';
    if (budgetPercent < 100) return 'text-orange-600 dark:text-orange-400';
    return 'text-red-600 dark:text-red-400';
  })();

  return (
    <>
      {/* About Section */}
      <div className="card mb-6">
        <div className="card-content pt-6">
          <div className="flex items-start">
            <div className="mr-4 flex-shrink-0">
              <div className="rounded-lg bg-purple-100 p-2 dark:bg-purple-900/20">
                <ChartPieIcon className="h-6 w-6 text-purple-600 dark:text-purple-400" />
              </div>
            </div>
            <div className="flex-1">
              <h2 className="mb-3 text-xl font-semibold text-gray-900 dark:text-white">
                About Budget Forecasting
              </h2>
              <p className="text-sm leading-relaxed text-gray-600 dark:text-gray-400">
                Stay on track with your monthly AI spending budget. The forecast
                predicts your end-of-month spending based on current usage
                patterns. Budget health indicators help you take action before
                exceeding your limit.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Current Spending Metrics */}
      <div className="mb-6 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
        <div className="card">
          <div className="card-content p-6">
            <div className="flex flex-col">
              <div className="mb-3 flex items-center">
                <CurrencyDollarIcon className="mr-3 h-6 w-6 text-gray-600 dark:text-gray-400" />
                <p className="text-xs font-medium text-gray-600 dark:text-gray-400">
                  Current Spending
                </p>
              </div>
              <div className="flex items-center">
                <p className="mr-3 text-lg font-bold text-gray-900 dark:text-white">
                  {currentSpending > 0 && currentSpending < 0.01
                    ? '<$0.01'
                    : `$${currentSpending.toFixed(4)}`}
                </p>
                <div className="flex items-center">
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    {budgetPercent.toFixed(1)}% of budget
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-content p-6">
            <div className="flex flex-col">
              <div className="mb-3 flex items-center">
                <BanknotesIcon className="mr-3 h-6 w-6 text-gray-600 dark:text-gray-400" />
                <p className="text-xs font-medium text-gray-600 dark:text-gray-400">
                  Monthly Budget
                </p>
              </div>
              <div className="flex items-center">
                <p className="mr-3 text-lg font-bold text-gray-900 dark:text-white">
                  ${monthlyBudget.toFixed(2)}
                </p>
                <div className="flex items-center">
                  <span className="text-xs text-green-600">
                    ${remainingBudget.toFixed(2)} remaining
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-content p-6">
            <div className="flex flex-col">
              <div className="mb-3 flex items-center">
                <ArrowTrendingUpIcon className="mr-3 h-6 w-6 text-gray-600 dark:text-gray-400" />
                <p className="text-xs font-medium text-gray-600 dark:text-gray-400">
                  Projected
                </p>
              </div>
              <div className="flex items-center">
                <p className="mr-3 text-lg font-bold text-gray-900 dark:text-white">
                  {projectedEnd > 0 && projectedEnd < 0.01
                    ? '<$0.01'
                    : `$${projectedEnd.toFixed(4)}`}
                </p>
                <div className="flex items-center">
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    End of month
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-content p-6">
            <div className="flex flex-col">
              <div className="mb-3 flex items-center">
                <ClockIcon className="mr-3 h-6 w-6 text-gray-600 dark:text-gray-400" />
                <p className="text-xs font-medium text-gray-600 dark:text-gray-400">
                  Avg Daily
                </p>
              </div>
              <div className="flex items-center">
                <p className="mr-3 text-lg font-bold text-gray-900 dark:text-white">
                  {avgDaily > 0 && avgDaily < 0.01
                    ? '<$0.01'
                    : `$${avgDaily.toFixed(4)}`}
                </p>
                <div className="flex items-center">
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    {timeRange === '7d'
                      ? 7
                      : timeRange === '30d'
                        ? 30
                        : timeRange === '90d'
                          ? 90
                          : 365}{' '}
                    days
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Daily Spending Forecast Chart */}
      <div className="card mb-6">
        <div className="card-header">
          <h3 className="card-title">Daily Spending Forecast</h3>
          <p className="card-description">
            Projected daily spending over the next{' '}
            {timeRange === '7d'
              ? '7 days'
              : timeRange === '30d'
                ? '30 days'
                : timeRange === '90d'
                  ? '90 days'
                  : '30 days'}{' '}
            based on current trends
          </p>
        </div>
        <div className="card-content">
          {!analyticsData?.forecast ? (
            <div className="flex h-[300px] items-center justify-center">
              <p className="text-sm text-gray-500 dark:text-gray-400">
                No forecast data available
              </p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <LineChart
                data={forecastChartData}
                key={`forecast-${timeRange}-${analyticsData?.forecast?.current_month_spend}-${analyticsData?.forecast?.daily_avg}-${analyticsData?.forecast?.monthly_budget}`}
                margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  className="dark:stroke-gray-800"
                />
                <XAxis
                  dataKey="date"
                  tick={{ fill: 'rgb(107, 114, 128)', fontSize: 10 }}
                  interval={timeRange === '7d' ? 0 : 1}
                  stroke="#9ca3af"
                  tickFormatter={(value, index) => {
                    // Show every day for 7d, every other day for longer ranges
                    if (timeRange === '7d') return value;
                    return index % 2 === 0 ? value : '';
                  }}
                />
                <YAxis
                  tick={{ fill: 'rgb(107, 114, 128)', fontSize: 10 }}
                  tickFormatter={value => {
                    if (value === 0) return '$0.00';
                    if (value < 0.01) return `$${value.toFixed(4)}`;
                    return `$${value.toFixed(2)}`;
                  }}
                  stroke="#9ca3af"
                  domain={[0, 'dataMax + 0.01']}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'rgba(255, 255, 255, 0.95)',
                    border: '1px solid #242424',
                    borderRadius: '0.5rem',
                  }}
                  labelStyle={{ color: '#111827', fontWeight: 600 }}
                  labelFormatter={(label, payload) => {
                    if (payload && payload[0]) {
                      const data = payload[0].payload;
                      return `Day ${data.dayNumber}: ${data.date}`;
                    }
                    return label;
                  }}
                  formatter={(value: number, name: string, props: any) => {
                    const formattedValue = Number(value).toFixed(4);
                    const displayValue =
                      Number(value) > 0 && Number(value) < 0.01
                        ? '<$0.01'
                        : `$${formattedValue}`;

                    if (name === 'projected') {
                      return [displayValue, 'Projected Spending'];
                    } else if (name === 'budget') {
                      return [displayValue, 'Monthly Budget'];
                    } else if (name === 'zero') {
                      return ['$0.00', 'Zero Line'];
                    }
                    return [displayValue, name];
                  }}
                />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="projected"
                  stroke="#3b82f6"
                  strokeWidth={3}
                  dot={{ fill: '#3b82f6', r: 4 }}
                  name="Projected Spending"
                />
                <Line
                  type="monotone"
                  dataKey="zero"
                  stroke="#e5e7eb"
                  strokeWidth={1}
                  strokeDasharray="2 2"
                  dot={false}
                  name="Zero Line"
                />
                {(() => {
                  const budget = Number(
                    analyticsData?.forecast?.monthly_budget || 0
                  );
                  return budget > 0 ? (
                    <Line
                      type="monotone"
                      dataKey="budget"
                      stroke="#ef4444"
                      strokeWidth={2}
                      strokeDasharray="5 5"
                      dot={false}
                      name="Monthly Budget"
                    />
                  ) : null;
                })()}
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Cumulative Spending */}
        <div className="card lg:col-span-2">
          <div className="card-header">
            <h3 className="card-title">Cumulative Spending</h3>
            <p className="card-description">
              Total spending accumulation over the selected time period
            </p>
          </div>
          <div className="card-content">
            <ResponsiveContainer width="100%" height={320}>
              <AreaChart data={cumulativeData}>
                <CartesianGrid
                  strokeDasharray="3 3"
                  className="stroke-gray-200 dark:stroke-gray-700"
                />
                <XAxis
                  dataKey="date"
                  tick={{ fill: 'rgb(107, 114, 128)', fontSize: 11 }}
                />
                <YAxis
                  tick={{ fill: 'rgb(107, 114, 128)', fontSize: 11 }}
                  tickFormatter={value => {
                    if (value === 0) return '$0.00';
                    if (value < 0.01) return `$${value.toFixed(4)}`;
                    return `$${value.toFixed(2)}`;
                  }}
                  label={{
                    value: 'Cost ($)',
                    angle: -90,
                    position: 'insideLeft',
                    className: 'text-base fill-gray-600 dark:fill-gray-400',
                  }}
                  domain={[0, 'dataMax + 0.01']}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'rgba(255, 255, 255, 0.95)',
                    border: '1px solid #242424',
                    borderRadius: '0.5rem',
                  }}
                  labelStyle={{ color: '#111827', fontWeight: 600 }}
                  formatter={(value: number) => {
                    const formattedValue = Number(value).toFixed(4);
                    const displayValue =
                      Number(value) > 0 && Number(value) < 0.01
                        ? '<$0.01'
                        : `$${formattedValue}`;
                    return [displayValue, 'Cumulative Spending'];
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="spending"
                  stroke="#3b82f6"
                  fill="#3b82f6"
                  fillOpacity={0.2}
                  strokeWidth={3}
                  dot={{ fill: '#3b82f6', r: 4 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Budget Health */}
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">Budget Health</h3>
            <p className="card-description">
              Current budget status and recommendations
            </p>
          </div>
          <div className="card-content">
            <div className="grid grid-cols-1 gap-3">
              {/* Budget Status */}
              <div className="rounded-lg border border-gray-200 p-3 dark:border-[#242424]">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-600 dark:text-gray-400">
                    Budget Status
                  </span>
                  <span
                    className={`text-sm font-semibold ${budgetStatusColor}`}
                  >
                    {budgetStatus.replace('_', ' ')}
                  </span>
                </div>
                <div className="mt-1">
                  <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
                    <span>Usage: {budgetPercent.toFixed(1)}%</span>
                    <span>Remaining: ${remainingBudget.toFixed(2)}</span>
                  </div>
                </div>
              </div>

              {/* Month Progress */}
              <div className="rounded-lg border border-gray-200 p-3 dark:border-[#242424]">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-600 dark:text-gray-400">
                    Month Progress
                  </span>
                  <span className="text-lg font-bold text-gray-900 dark:text-white">
                    {daysElapsed}/{daysInMonth} days
                  </span>
                </div>
                <div className="mt-2">
                  <div className="h-2 w-full rounded-full bg-gray-200 dark:bg-gray-700">
                    <div
                      className="h-2 rounded-full bg-blue-600 transition-all duration-300"
                      style={{ width: `${(daysElapsed / daysInMonth) * 100}%` }}
                    ></div>
                  </div>
                </div>
              </div>

              {/* Budget Exhaustion */}
              <div className="rounded-lg border border-gray-200 p-3 dark:border-[#242424]">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-600 dark:text-gray-400">
                    Budget Exhaustion
                  </span>
                  <span className="text-lg font-bold text-gray-900 dark:text-white">
                    {budgetExhausted > 0 ? `${budgetExhausted} days` : 'N/A'}
                  </span>
                </div>
                <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  {budgetExhausted > 0
                    ? `At current rate, budget will last ${budgetExhausted} more days`
                    : 'Insufficient data to calculate'}
                </div>
              </div>

              {/* Daily Average */}
              <div className="rounded-lg border border-gray-200 p-3 dark:border-[#242424]">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-600 dark:text-gray-400">
                    Daily Average
                  </span>
                  <span className="text-lg font-bold text-gray-900 dark:text-white">
                    {avgDaily > 0 && avgDaily < 0.01
                      ? '<$0.01'
                      : `$${avgDaily.toFixed(4)}`}
                  </span>
                </div>
                <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  Based on current usage patterns
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
