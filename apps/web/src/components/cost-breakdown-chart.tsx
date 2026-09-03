'use client';

import { useState, useMemo } from 'react';

interface CostDataPoint {
  date: string;
  cost: number;
}

interface CostBreakdownChartProps {
  timeRange: string;
}

export default function CostBreakdownChart({
  timeRange,
}: CostBreakdownChartProps) {
  const [tooltip, setTooltip] = useState<{
    visible: boolean;
    x: number;
    y: number;
    data: CostDataPoint | null;
  }>({
    visible: false,
    x: 0,
    y: 0,
    data: null,
  });

  const data = useMemo(() => {
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
      const baseCost = isWeekend ? 0.05 : 0.15;

      // Add monthly patterns (higher costs mid-month)
      const monthlyFactor =
        0.8 + (Math.sin((dayOfMonth / 30) * Math.PI * 2) + 1) * 0.2;

      // Add some randomness but keep it realistic
      const seed = date.getTime() + timeRange.length;
      const randomFactor = 0.7 + (seed % 60) / 100; // 0.7 to 1.3

      const cost = baseCost * monthlyFactor * randomFactor;

      points.push({
        date: date.toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
        }),
        cost,
      });
    }

    return points;
  }, [timeRange]);

  const maxCost = Math.max(...data.map(d => d.cost));
  const chartWidth = 100; // Use percentage for full width
  const chartHeight = 300;

  const handleMouseEnter = (event: React.MouseEvent, point: CostDataPoint) => {
    const rect = event.currentTarget.getBoundingClientRect();
    setTooltip({
      visible: true,
      x: rect.left + rect.width / 2,
      y: rect.top - 10,
      data: point,
    });
  };

  const handleMouseLeave = () => {
    setTooltip({
      visible: false,
      x: 0,
      y: 0,
      data: null,
    });
  };

  return (
    <div className="relative">
      <svg
        width="100%"
        height={chartHeight}
        viewBox="0 0 1000 300"
        className="overflow-visible"
      >
        {/* Grid lines */}
        <defs>
          <pattern
            id="costBreakdownGrid"
            width="40"
            height="30"
            patternUnits="userSpaceOnUse"
          >
            <path
              d="M 40 0 L 0 0 0 30"
              fill="none"
              stroke="#e5e7eb"
              strokeWidth="0.5"
              className="dark:stroke-gray-700"
            />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#costBreakdownGrid)" />

        {/* Y-axis labels for cost */}
        {[0, 0.25, 0.5, 0.75, 1].map((ratio, index) => (
          <text
            key={`cost-${index}`}
            x="20"
            y={50 + ratio * (chartHeight - 100)}
            className="fill-gray-500 text-xs dark:fill-gray-400"
            textAnchor="end"
            dominantBaseline="middle"
          >
            ${(maxCost * ratio).toFixed(2)}
          </text>
        ))}

        {/* Cost line */}
        <path
          d={data
            .map((point, index) => {
              const x = 60 + (index / (data.length - 1)) * (1000 - 120);
              const y = 50 + (1 - point.cost / maxCost) * (chartHeight - 100);
              return `${index === 0 ? 'M' : 'L'} ${x} ${y}`;
            })
            .join(' ')}
          fill="none"
          stroke="#9333ea"
          strokeWidth="3"
          className="drop-shadow-sm"
        />

        {/* Data points */}
        {data.map((point, index) => {
          const x = 60 + (index / (data.length - 1)) * (1000 - 120);
          const y = 50 + (1 - point.cost / maxCost) * (chartHeight - 100);

          return (
            <circle
              key={index}
              cx={x}
              cy={y}
              r="4"
              fill="#9333ea"
              className="cursor-pointer transition-colors hover:fill-purple-600"
              onMouseEnter={e => handleMouseEnter(e, point)}
              onMouseLeave={handleMouseLeave}
            />
          );
        })}

        {/* X-axis labels */}
        {data
          .filter((_, index) => index % Math.ceil(data.length / 8) === 0)
          .map((point, index) => {
            const originalIndex = data.indexOf(point);
            const x = 60 + (originalIndex / (data.length - 1)) * (1000 - 120);
            return (
              <text
                key={index}
                x={x}
                y={chartHeight - 20}
                className="fill-gray-500 text-xs dark:fill-gray-400"
                textAnchor="middle"
              >
                {point.date}
              </text>
            );
          })}

        {/* Y-axis line */}
        <line
          x1="60"
          y1="50"
          x2="60"
          y2={chartHeight - 50}
          stroke="#d1d5db"
          strokeWidth="1"
          className="dark:stroke-gray-600"
        />

        {/* X-axis line */}
        <line
          x1="60"
          y1={chartHeight - 50}
          x2="980"
          y2={chartHeight - 50}
          stroke="#d1d5db"
          strokeWidth="1"
          className="dark:stroke-gray-600"
        />
      </svg>

      {/* Tooltip */}
      {tooltip.visible && tooltip.data && (
        <div
          className="pointer-events-none fixed z-50 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm shadow-lg dark:border-[#242424] dark:bg-[#000000]"
          style={{
            left: tooltip.x,
            top: tooltip.y,
            transform: 'translateX(-50%)',
          }}
        >
          <div className="font-medium text-gray-900 dark:text-white">
            {tooltip.data.date}
          </div>
          <div className="text-gray-600 dark:text-gray-300">
            Cost: ${tooltip.data.cost.toFixed(2)}
          </div>
        </div>
      )}
    </div>
  );
}
