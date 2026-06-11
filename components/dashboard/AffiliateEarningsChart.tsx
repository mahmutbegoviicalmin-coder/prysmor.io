'use client';

import type { AffiliateChart } from '@/lib/affiliateChart';

const GREEN = '#39FF6A';

export function AffiliateEarningsChart({
  chart,
  height = 220,
}: {
  chart: AffiliateChart;
  height?: number;
}) {
  const points = chart.points.length > 0 ? chart.points : [{ label: '—', value: 0 }];
  const max = Math.max(...points.map((p) => p.value), 1);
  const padding = { top: 20, right: 12, bottom: 36, left: 12 };
  const width = 640;
  const innerW = width - padding.left - padding.right;
  const innerH = height - padding.top - padding.bottom;
  const barGap = 10;
  const barW = Math.max(12, (innerW - barGap * (points.length - 1)) / points.length);

  return (
    <div className="w-full">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-auto w-full"
        role="img"
        aria-label={chart.title}
      >
        {[0.25, 0.5, 0.75, 1].map((tick) => {
          const y = padding.top + innerH - innerH * tick;
          return (
            <line
              key={tick}
              x1={padding.left}
              x2={width - padding.right}
              y1={y}
              y2={y}
              stroke="rgba(255,255,255,0.06)"
              strokeDasharray="4 6"
            />
          );
        })}

        {points.map((point, index) => {
          const barH = Math.max(4, (point.value / max) * innerH);
          const x = padding.left + index * (barW + barGap);
          const y = padding.top + innerH - barH;

          return (
            <g key={`${point.label}-${index}`}>
              <rect
                x={x}
                y={y}
                width={barW}
                height={barH}
                rx={6}
                fill="url(#affiliateBarGradient)"
                opacity={0.92}
              />
              {point.value > 0 && (
                <text
                  x={x + barW / 2}
                  y={y - 8}
                  textAnchor="middle"
                  fill="rgba(255,255,255,0.55)"
                  fontSize="11"
                  fontWeight="600"
                >
                  ${point.value}
                </text>
              )}
              <text
                x={x + barW / 2}
                y={height - 12}
                textAnchor="middle"
                fill="rgba(255,255,255,0.35)"
                fontSize="11"
              >
                {point.label}
              </text>
            </g>
          );
        })}

        <defs>
          <linearGradient id="affiliateBarGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={GREEN} stopOpacity="0.95" />
            <stop offset="100%" stopColor={GREEN} stopOpacity="0.35" />
          </linearGradient>
        </defs>
      </svg>
    </div>
  );
}
