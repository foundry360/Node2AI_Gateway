'use client';

import { useMemo, useEffect, useState } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';

interface DataPoint {
  date: string;
  tokens: number;
  requests: number;
}

interface UsageTrendsChartProps {
  timeRange: string;
}

export function UsageTrendsChart({ timeRange }: UsageTrendsChartProps) {
  const [mounted, setMounted] = useState(false);

  // Generate mock data based on time range
  const data = useMemo(() => {
    if (!mounted) {
      return [];
    }
    const days =
      timeRange === '7d'
        ? 7
        : timeRange === '30d'
          ? 30
          : timeRange === '90d'
            ? 90
            : 365;
    const points: DataPoint[] = [];

    for (let i = days - 1; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);

      // Generate realistic data with daily patterns
      const dayOfWeek = date.getDay(); // 0 = Sunday, 6 = Saturday
      const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
      const hourOfDay = date.getHours();

      // Base values with realistic ranges
      const baseTokens = isWeekend ? 15000 : 25000;
      const baseRequests = isWeekend ? 80 : 150;

      // Add daily patterns (higher usage during business hours)
      const timeMultiplier = hourOfDay >= 9 && hourOfDay <= 17 ? 1.5 : 0.7;

      // Add some randomness but keep it realistic
      const seed = date.getTime() + timeRange.length;
      const randomFactor = 0.8 + (seed % 40) / 100; // 0.8 to 1.2

      const tokens = Math.round(baseTokens * timeMultiplier * randomFactor);
      const requests = Math.round(baseRequests * timeMultiplier * randomFactor);

      points.push({
        date: date.toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
        }),
        tokens,
        requests,
      });
    }

    return points;
  }, [timeRange, mounted]);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div className="flex h-[300px] items-center justify-center text-gray-500">
        Loading chart...
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart
        data={data}
        margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
      >
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
          yAxisId="left"
        />
        <YAxis
          orientation="right"
          tick={{ fill: 'rgb(107, 114, 128)', fontSize: 11 }}
          yAxisId="right"
        />
        <Tooltip
          content={({ active, payload }) => {
            if (!active || !payload || !payload.length) return null;
            return (
              <div className="rounded-lg border border-gray-200 bg-white p-2 shadow-lg dark:border-[#242424] dark:bg-gray-800">
                <p className="mb-1 text-sm font-semibold text-gray-900 dark:text-white">
                  {payload[0].payload?.date}
                </p>
                <p className="text-sm text-blue-600 dark:text-blue-400">
                  Tokens: {payload[0].value?.toLocaleString()}
                </p>
                {payload[1] && (
                  <p className="text-sm text-green-600 dark:text-green-400">
                    Requests: {payload[1].value?.toLocaleString()}
                  </p>
                )}
              </div>
            );
          }}
        />
        <Legend
          wrapperStyle={{ paddingTop: '20px' }}
          iconType="circle"
          formatter={value => (
            <span className="text-sm text-gray-600 dark:text-gray-400">
              {value}
            </span>
          )}
        />
        <Line
          type="monotone"
          dataKey="tokens"
          stroke="#3b82f6"
          strokeWidth={2}
          dot={false}
          yAxisId="left"
        />
        <Line
          type="monotone"
          dataKey="requests"
          stroke="#10b981"
          strokeWidth={2}
          dot={false}
          yAxisId="right"
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
