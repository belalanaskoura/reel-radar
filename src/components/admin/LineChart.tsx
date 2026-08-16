'use client';

import { useId, useState } from 'react';

export interface LinePoint {
  label: string;
  value: number;
}

function niceMax(value: number): number {
  if (value <= 4) return Math.max(4, value);
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const normalized = value / magnitude;
  const step = normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return step * magnitude;
}

// Single-series line, 2px stroke, filled area at ~10% opacity, gridlines +
// y-axis ticks for scale reference, hover crosshair + tooltip -- no legend
// needed for a single series per the dataviz skill (the section title
// already names it).
export function LineChart({ points }: { points: LinePoint[] }) {
  const gradientId = useId();
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  if (points.length === 0) return null;

  const width = 640;
  const height = 220;
  const padLeft = 36;
  const padRight = 12;
  const padTop = 12;
  const padBottom = 28;
  const plotWidth = width - padLeft - padRight;
  const plotHeight = height - padTop - padBottom;

  const rawMax = Math.max(1, ...points.map((p) => p.value));
  const max = niceMax(rawMax);
  const tickCount = 4;
  const ticks = Array.from({ length: tickCount + 1 }, (_, i) => Math.round((max / tickCount) * i));

  const stepX = points.length > 1 ? plotWidth / (points.length - 1) : 0;
  const coords = points.map((p, i) => ({
    x: padLeft + i * stepX,
    y: padTop + plotHeight - (p.value / max) * plotHeight,
  }));

  const linePath = coords.map((c, i) => `${i === 0 ? 'M' : 'L'} ${c.x} ${c.y}`).join(' ');
  const areaPath = `${linePath} L ${coords[coords.length - 1].x} ${padTop + plotHeight} L ${coords[0].x} ${padTop + plotHeight} Z`;

  // Show every label if there's room, otherwise thin them out.
  const maxLabels = 8;
  const labelStride = Math.max(1, Math.ceil(points.length / maxLabels));

  const hovered = hoverIndex !== null ? { point: points[hoverIndex], coord: coords[hoverIndex] } : null;

  function handleMove(e: React.PointerEvent<SVGRectElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const relX = ((e.clientX - rect.left) / rect.width) * width;
    let nearest = 0;
    let nearestDist = Infinity;
    coords.forEach((c, i) => {
      const dist = Math.abs(c.x - relX);
      if (dist < nearestDist) {
        nearestDist = dist;
        nearest = i;
      }
    });
    setHoverIndex(nearest);
  }

  return (
    <div className="w-full">
      <svg
        width="100%"
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="Trend over time"
        style={{ display: 'block' }}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.18} />
            <stop offset="100%" stopColor="var(--accent)" stopOpacity={0} />
          </linearGradient>
        </defs>

        {ticks.map((t) => {
          const y = padTop + plotHeight - (t / max) * plotHeight;
          return (
            <g key={t}>
              <line x1={padLeft} x2={width - padRight} y1={y} y2={y} stroke="var(--rule)" strokeWidth={1} />
              <text x={padLeft - 8} y={y} fontSize={10} fill="var(--ink-dim)" textAnchor="end" dominantBaseline="middle">
                {t.toLocaleString()}
              </text>
            </g>
          );
        })}

        <path d={areaPath} fill={`url(#${gradientId})`} />
        <path d={linePath} fill="none" stroke="var(--accent)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />

        {coords.map((c, i) => {
          if (i % labelStride !== 0 && i !== coords.length - 1) return null;
          return (
            <text
              key={i}
              x={c.x}
              y={height - 8}
              fontSize={10}
              fill="var(--ink-dim)"
              textAnchor={i === 0 ? 'start' : i === coords.length - 1 ? 'end' : 'middle'}
            >
              {points[i].label}
            </text>
          );
        })}

        {hovered && (
          <g>
            <line
              x1={hovered.coord.x}
              x2={hovered.coord.x}
              y1={padTop}
              y2={padTop + plotHeight}
              stroke="var(--ink-dim)"
              strokeWidth={1}
              opacity={0.4}
            />
            <circle cx={hovered.coord.x} cy={hovered.coord.y} r={4} fill="var(--accent)" stroke="var(--surface)" strokeWidth={2} />
          </g>
        )}

        {!hovered && (
          <circle
            cx={coords[coords.length - 1].x}
            cy={coords[coords.length - 1].y}
            r={4}
            fill="var(--accent)"
            stroke="var(--surface)"
            strokeWidth={2}
          />
        )}

        <rect
          x={padLeft}
          y={padTop}
          width={plotWidth}
          height={plotHeight}
          fill="transparent"
          onPointerMove={handleMove}
          onPointerLeave={() => setHoverIndex(null)}
          style={{ cursor: 'crosshair' }}
        />
      </svg>

      {hovered && (
        <div
          className="pointer-events-none mt-1 inline-flex items-baseline gap-2 rounded-sm border px-2 py-1 text-xs"
          style={{ borderColor: 'var(--rule)', background: 'var(--bg-elevated)' }}
        >
          <span style={{ color: 'var(--ink-dim)' }}>{hovered.point.label}</span>
          <span className="font-semibold" style={{ color: 'var(--ink)' }}>
            {hovered.point.value.toLocaleString()}
          </span>
        </div>
      )}
    </div>
  );
}
