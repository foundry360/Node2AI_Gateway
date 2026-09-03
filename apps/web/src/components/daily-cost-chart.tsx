'use client';

import { useMemo, useEffect, useState } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

interface CostDataPoint {
  date: string;
  cost: number;
}

interface DailyCostChartProps {
  timeRange: string;
}

export function DailyCostChart({ timeRange }: DailyCostChartProps) {
  const [mounted, setMounted] = useState(false);

  // Generate mock cost data based on time range
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
    const points: CostDataPoint[] = [];

    for (let i = days - 1; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);

      // Generate realistic cost data with business patterns
      const dayOfWeek = date.getDay();
      const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
      const dayOfMonth = date.getDate();

      // Base cost with realistic ranges
      const baseCost = isWeekend ? 120 : 200;

      // Add monthly patterns (higher costs mid-month)
      const monthlyFactor =
        0.8 + (Math.sin((dayOfMonth / 30) * Math.PI * 2) + 1) * 0.2;

      // Add some randomness but keep it realistic
      const seed = date.getTime() + timeRange.length;
      const randomFactor = 0.7 + (seed % 60) / 100; // 0.7 to 1.3

      const cost = Math.round(baseCost * monthlyFactor * randomFactor);

      points.push({
        date: date.toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
        }),
        cost,
      });
    }

    return points;
  }, [timeRange, mounted]);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div className="flex h-[350px] items-center justify-center text-gray-500">
        Loading chart...
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={350}>
      <BarChart data={data} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
        <CartesianGrid
          strokeDasharray="3 3"
          className="stroke-gray-200 dark:stroke-gray-700"
        />
        <XAxis
          dataKey="date"
          tick={{ fill: 'rgb(107, 114, 128)', fontSize: 11 }}
        />
        <YAxis tick={{ fill: 'rgb(107, 114, 128)', fontSize: 11 }} />
        <Tooltip
          content={({ active, payload }) => {
            if (!active || !payload || !payload.length) return null;
            return (
              <div className="rounded-lg border border-gray-200 bg-white p-2 shadow-lg dark:border-[#242424] dark:bg-gray-800">
                <p className="mb-1 text-sm font-semibold text-gray-900 dark:text-white">
                  {payload[0].payload?.date}
                </p>
                <p className="text-sm text-blue-600 dark:text-blue-400">
                  ${(payload[0].value as number)?.toFixed(2)}
                </p>
              </div>
            );
          }}
        />
        <Bar
          dataKey="cost"
          fill="#3b82f6"
          radius={[4, 4, 0, 0]}
          isAnimationActive={false}
          animationDuration={0}
          activeBar={false}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}
