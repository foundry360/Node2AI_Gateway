'use client';

import React, { useMemo } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

interface MonthlyData {
  month: string;
  cost: number;
}

interface MonthlyComparisonChartProps {
  timeRange: string;
}

const MonthlyComparisonChart: React.FC<MonthlyComparisonChartProps> = ({
  timeRange,
}) => {
  const data = useMemo(() => {
    const months = [
      'Nov 2024',
      'Dec 2024',
      'Jan 2025',
      'Feb 2025',
      'Mar 2025',
      'Apr 2025',
      'May 2025',
      'Jun 2025',
      'Jul 2025',
      'Aug 2025',
      'Sep 2025',
      'Oct 2025',
    ];

    const points: MonthlyData[] = [];

    for (let i = 0; i < months.length; i++) {
      const month = months[i];

      // Generate realistic monthly cost data with seasonal patterns
      const monthIndex = i;
      const seasonalFactor =
        0.8 + (Math.sin((monthIndex / 12) * Math.PI * 2) + 1) * 0.2; // Seasonal variation over 12 months
      const growthFactor = 1 + monthIndex * 0.08; // Gradual growth over time (slower for 12 months)

      // Add some randomness but keep it realistic
      const seed = monthIndex + timeRange.length;
      const randomFactor = 0.85 + (seed % 30) / 100; // 0.85 to 1.15

      const cost = 0.3 * seasonalFactor * growthFactor * randomFactor; // Lower base cost for 12-month view

      points.push({
        month,
        cost,
      });
    }
    return points;
  }, [timeRange]);

  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart
        data={data}
        margin={{ top: 5, right: 30, left: 20, bottom: 80 }}
      >
        <CartesianGrid
          strokeDasharray="3 3"
          className="stroke-gray-200 dark:stroke-gray-700"
        />
        <XAxis
          dataKey="month"
          tick={{ fill: 'rgb(107, 114, 128)', fontSize: 11 }}
          angle={-45}
          textAnchor="end"
          height={60}
          label={{
            value: 'Month',
            position: 'bottom',
            offset: 5,
            className: 'text-sm fill-gray-900 dark:fill-gray-400',
          }}
        />
        <YAxis
          tick={{ fill: 'rgb(107, 114, 128)', fontSize: 11 }}
          label={{
            value: 'Cost ($)',
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
                  {payload[0].payload?.month}
                </p>
                <p className="text-sm text-purple-600 dark:text-purple-400">
                  ${(payload[0].value as number)?.toFixed(2)}
                </p>
              </div>
            );
          }}
        />
        <Bar
          dataKey="cost"
          fill="#9333ea"
          radius={[4, 4, 0, 0]}
          isAnimationActive={false}
          animationDuration={0}
          activeBar={false}
        />
      </BarChart>
    </ResponsiveContainer>
  );
};

export default MonthlyComparisonChart;
