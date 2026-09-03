'use client';

import { useState } from 'react';

interface ProviderData {
  name: string;
  cost: number;
  color: string;
}

interface CostByProviderChartProps {
  timeRange: string;
}

export default function CostByProviderChart({
  timeRange,
}: CostByProviderChartProps) {
  const [hoveredSegment, setHoveredSegment] = useState<string | null>(null);
  const [tooltip, setTooltip] = useState<{
    visible: boolean;
    x: number;
    y: number;
    data: ProviderData | null;
  }>({
    visible: false,
    x: 0,
    y: 0,
    data: null,
  });

  // Mock data for providers
  const providers: ProviderData[] = [
    { name: 'openai', cost: 1.93, color: '#3b82f6' },
    { name: 'anthropic', cost: 1.07, color: '#10b981' },
    { name: 'google', cost: 0.41, color: '#f59e0b' },
    { name: 'perplexity', cost: 0.08, color: '#8b5cf6' },
  ];

  const totalCost = providers.reduce((sum, provider) => sum + provider.cost, 0);
  const centerX = 200;
  const centerY = 160;
  const radius = 140;
  const innerRadius = 80; // For donut chart

  let currentAngle = 0;

  const createArcPath = (
    startAngle: number,
    endAngle: number,
    innerRadius: number,
    outerRadius: number
  ) => {
    const outerStart = polarToCartesian(
      centerX,
      centerY,
      outerRadius,
      startAngle
    );
    const outerEnd = polarToCartesian(centerX, centerY, outerRadius, endAngle);
    const innerStart = polarToCartesian(
      centerX,
      centerY,
      innerRadius,
      startAngle
    );
    const innerEnd = polarToCartesian(centerX, centerY, innerRadius, endAngle);

    const largeArcFlag = endAngle - startAngle <= 180 ? '0' : '1';

    return [
      'M',
      outerStart.x,
      outerStart.y,
      'A',
      outerRadius,
      outerRadius,
      0,
      largeArcFlag,
      1,
      outerEnd.x,
      outerEnd.y,
      'L',
      innerEnd.x,
      innerEnd.y,
      'A',
      innerRadius,
      innerRadius,
      0,
      largeArcFlag,
      0,
      innerStart.x,
      innerStart.y,
      'Z',
    ].join(' ');
  };

  const polarToCartesian = (
    centerX: number,
    centerY: number,
    radius: number,
    angleInDegrees: number
  ) => {
    const angleInRadians = ((angleInDegrees - 90) * Math.PI) / 180.0;
    return {
      x: centerX + radius * Math.cos(angleInRadians),
      y: centerY + radius * Math.sin(angleInRadians),
    };
  };

  const segments = providers.map(provider => {
    const percentage = provider.cost / totalCost;
    const angle = percentage * 360;
    const startAngle = currentAngle;
    const endAngle = currentAngle + angle;

    currentAngle += angle;

    return {
      ...provider,
      startAngle,
      endAngle,
      percentage,
      path: createArcPath(startAngle, endAngle, innerRadius, radius),
      labelPosition: polarToCartesian(
        centerX,
        centerY,
        (innerRadius + radius) / 2,
        startAngle + angle / 2
      ),
    };
  });

  const handleMouseEnter = (
    event: React.MouseEvent,
    provider: ProviderData
  ) => {
    setHoveredSegment(provider.name);
    setTooltip({
      visible: true,
      x: event.clientX,
      y: event.clientY - 10,
      data: provider,
    });
  };

  const handleMouseLeave = () => {
    setHoveredSegment(null);
    setTooltip({
      visible: false,
      x: 0,
      y: 0,
      data: null,
    });
  };

  return (
    <div className="flex flex-col items-start gap-8 lg:flex-row">
      {/* Chart */}
      <div className="flex flex-1 items-start justify-center">
        <svg width="400" height="400">
          {segments.map(segment => (
            <g key={segment.name}>
              <path
                d={segment.path}
                fill={segment.color}
                className={`cursor-pointer transition-all duration-200 ${
                  hoveredSegment === segment.name ? 'opacity-80' : 'opacity-100'
                }`}
                onMouseEnter={e => handleMouseEnter(e, segment)}
                onMouseLeave={handleMouseLeave}
                stroke="white"
                strokeWidth="2"
              />

              {/* Label */}
              <text
                x={segment.labelPosition.x}
                y={segment.labelPosition.y}
                className="pointer-events-none fill-white text-xs font-medium"
                textAnchor="middle"
                dominantBaseline="middle"
              >
                {segment.percentage > 0.05
                  ? `${(segment.percentage * 100).toFixed(0)}%`
                  : ''}
              </text>
            </g>
          ))}

          {/* Total Cost Display in Center */}
          <text
            x={centerX}
            y={centerY - 8}
            className="fill-gray-900 text-2xl font-bold dark:fill-white"
            textAnchor="middle"
            dominantBaseline="middle"
          >
            ${totalCost.toFixed(2)}
          </text>
          <text
            x={centerX}
            y={centerY + 12}
            className="fill-gray-600 text-sm dark:fill-gray-400"
            textAnchor="middle"
            dominantBaseline="middle"
          >
            Total Cost
          </text>
        </svg>
      </div>

      {/* Legend */}
      <div className="flex-1 space-y-3">
        {segments.map(segment => (
          <div
            key={segment.name}
            className={`flex items-center justify-between rounded-lg border border-gray-200 p-3 transition-all duration-200 dark:border-[#242424] ${
              hoveredSegment === segment.name
                ? 'bg-gray-100/50 dark:bg-gray-800/50'
                : 'bg-transparent'
            }`}
            onMouseEnter={e => handleMouseEnter(e, segment)}
            onMouseLeave={handleMouseLeave}
          >
            <div className="flex items-center">
              <div
                className="mr-3 h-4 w-4 rounded-full"
                style={{ backgroundColor: segment.color }}
              ></div>
              <span className="font-medium capitalize text-gray-900 dark:text-white">
                {segment.name}
              </span>
            </div>
            <div className="text-right">
              <div className="font-bold text-gray-900 dark:text-white">
                ${segment.cost.toFixed(2)}
              </div>
              <div className="text-sm text-gray-600 dark:text-gray-400">
                {(segment.percentage * 100).toFixed(1)}%
              </div>
            </div>
          </div>
        ))}
      </div>

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
          <div className="mb-1 font-medium text-gray-900 dark:text-white">
            {tooltip.data.name.charAt(0).toUpperCase() +
              tooltip.data.name.slice(1)}
          </div>
          <div className="text-gray-600 dark:text-gray-300">
            Cost: ${tooltip.data.cost.toFixed(2)}
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-400">
            {((tooltip.data.cost / totalCost) * 100).toFixed(1)}% of total
          </div>
        </div>
      )}
    </div>
  );
}
