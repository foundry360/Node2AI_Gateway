'use client';

import { useMemo } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

interface HourData {
  hour: string;
  requests: number;
}

interface PeakUsageChartProps {
  timeRange: string;
}

export default function PeakUsageChart({ timeRange }: PeakUsageChartProps) {
  const data = useMemo(() => {
    const hours = [
      '1:00',
      '2:00',
      '3:00',
      '4:00',
      '5:00',
      '6:00',
      '7:00',
      '8:00',
      '9:00',
      '10:00',
      '11:00',
      '12:00',
      '13:00',
      '14:00',
      '15:00',
      '16:00',
      '17:00',
      '18:00',
      '19:00',
      '20:00',
      '21:00',
      '22:00',
      '23:00',
      '0:00',
    ];

    // Scale base requests based on time range
    const days =
      timeRange === '7d'
        ? 7
        : timeRange === '30d'
          ? 30
          : timeRange === '90d'
            ? 90
            : 365;
    const scaleFactor = days / 7; // Scale up requests based on days

    const hourData: HourData[] = hours.map((hour, index) => {
      // Generate realistic hourly patterns
      const hourNum = parseInt(hour.split(':')[0]);
      let baseRequests = 50;

      // Business hours (9 AM - 5 PM) have higher usage
      if (hourNum >= 9 && hourNum <= 17) {
        baseRequests = 200;
      }
      // Morning hours (6 AM - 8 AM) moderate usage
      else if (hourNum >= 6 && hourNum <= 8) {
        baseRequests = 120;
      }
      // Evening hours (6 PM - 10 PM) moderate usage
      else if (hourNum >= 18 && hourNum <= 22) {
        baseRequests = 100;
      }
      // Late night/early morning (11 PM - 5 AM) low usage
      else if (hourNum >= 23 || hourNum <= 5) {
        baseRequests = 30;
      }

      // Add some randomness but keep it realistic
      const seed = hourNum * 1000 + timeRange.length;
      const randomFactor = 0.7 + (seed % 60) / 100; // 0.7 to 1.3

      const requests = Math.round(baseRequests * randomFactor * scaleFactor);

      return {
        hour,
        requests,
      };
    });

    return hourData;
  }, [timeRange]);

  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart
        data={data}
        margin={{ top: 5, right: 30, left: 20, bottom: 60 }}
      >
        <CartesianGrid
          strokeDasharray="3 3"
          className="stroke-gray-200 dark:stroke-gray-700"
        />
        <XAxis
          dataKey="hour"
          tick={{ fill: 'rgb(107, 114, 128)', fontSize: 11 }}
          interval={0}
          angle={-45}
          textAnchor="end"
          height={80}
        />
        <YAxis tick={{ fill: 'rgb(107, 114, 128)', fontSize: 11 }} />
        <Tooltip
          content={({ active, payload }) => {
            if (!active || !payload || !payload.length) return null;
            return (
              <div className="rounded-lg border border-gray-200 bg-white p-2 shadow-lg dark:border-[#242424] dark:bg-gray-800">
                <p className="mb-1 text-sm font-semibold text-gray-900 dark:text-white">
                  {payload[0].payload?.hour}
                </p>
                <p className="text-sm text-purple-600 dark:text-purple-400">
                  {payload[0].value?.toLocaleString()} requests
                </p>
              </div>
            );
          }}
        />
        <Bar
          dataKey="requests"
          fill="#9333ea"
          radius={[4, 4, 0, 0]}
          isAnimationActive={false}
          animationDuration={0}
          activeBar={false}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}
