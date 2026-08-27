'use client';

import { useState } from 'react';

export interface DayCounts {
  label: string;
  success: number;
  fail: number;
}

function niceMax(value: number): number {
  if (value <= 4) return Math.max(4, value);
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const normalized = value / magnitude;
  const step = normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return step * magnitude;
}

// Grouped-bar chart for a small daily success/fail series -- status colors
// only (ok/error), no categorical palette needed since there are exactly
// two series and their meaning is fixed. Gridlines + y-axis ticks for scale
// reference, per-bar hover tooltip.
export function SuccessFailBarChart({ days }: { days: DayCounts[] }) {
  const [hover, setHover] = useState<{ day: DayCounts; kind: 'success' | 'fail'; x: number } | null>(null);

  const barWidth = 16;
  const gap = 2;
  const groupGap = 20;
  const groupWidth = barWidth * 2 + gap;
  const padLeft = 36;
  const padRight = 12;
  const padTop = 12;
  const padBottom = 24;
  const plotHeight = 160;
  const height = plotHeight + padTop + padBottom;
  const plotWidth = Math.max(days.length * (groupWidth + groupGap), 200);
  const width = plotWidth + padLeft + padRight;

  const rawMax = Math.max(1, ...days.map((d) => Math.max(d.success, d.fail)));
  const max = niceMax(rawMax);
  const tickCount = 4;
  const ticks = Array.from({ length: tickCount + 1 }, (_, i) => Math.round((max / tickCount) * i));

  // Fixed per-day pixel width means this chart is wider than a phone
  // screen well before 14 days -- scrolls silently with nothing to
  // signal that, so a visible "swipe to see more" only shown below the
  // point where it actually needs scrolling.
  const scrollsOnMobile = plotWidth + padLeft + padRight > 380;

  return (
    <div className="w-full">
      <div className="flex items-center gap-4 pb-2 text-xs" style={{ color: 'var(--ink-dim)' }}>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2 w-2 rounded-full" style={{ background: 'var(--ok-ink)' }} />
          Success
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2 w-2 rounded-full" style={{ background: 'var(--error-ink)' }} />
          Failed
        </span>
        {scrollsOnMobile && <span className="ml-auto sm:hidden">Swipe to see more &rarr;</span>}
      </div>
      <div className="overflow-x-auto">
        <svg
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label="Daily success and failure counts"
        >
          {ticks.map((t) => {
            const y = padTop + plotHeight - (t / max) * plotHeight;
            return (
              <g key={t}>
                <line x1={padLeft} x2={width - padRight} y1={y} y2={y} stroke="var(--rule)" strokeWidth={1} />
                <text x={padLeft - 8} y={y} fontSize={12} fill="var(--ink-dim)" textAnchor="end" dominantBaseline="middle">
                  {t.toLocaleString()}
                </text>
              </g>
            );
          })}

          {days.map((d, i) => {
            const x = padLeft + i * (groupWidth + groupGap);
            const successHeight = (d.success / max) * plotHeight;
            const failHeight = (d.fail / max) * plotHeight;
            const successX = x;
            const failX = x + barWidth + gap;
            return (
              <g key={d.label}>
                <rect
                  x={successX}
                  y={padTop + plotHeight - successHeight}
                  width={barWidth}
                  height={Math.max(successHeight, d.success > 0 ? 2 : 0)}
                  rx={4}
                  fill="var(--ok-ink)"
                  opacity={hover && hover.day.label === d.label && hover.kind !== 'success' ? 0.55 : 1}
                  onPointerEnter={() => setHover({ day: d, kind: 'success', x: successX + barWidth / 2 })}
                  onPointerDown={() => setHover({ day: d, kind: 'success', x: successX + barWidth / 2 })}
                  onPointerLeave={() => setHover(null)}
                />
                <rect
                  x={failX}
                  y={padTop + plotHeight - failHeight}
                  width={barWidth}
                  height={Math.max(failHeight, d.fail > 0 ? 2 : 0)}
                  rx={4}
                  fill="var(--error-ink)"
                  opacity={hover && hover.day.label === d.label && hover.kind !== 'fail' ? 0.55 : 1}
                  onPointerEnter={() => setHover({ day: d, kind: 'fail', x: failX + barWidth / 2 })}
                  onPointerDown={() => setHover({ day: d, kind: 'fail', x: failX + barWidth / 2 })}
                  onPointerLeave={() => setHover(null)}
                />
                {/* Wider transparent hit area so hover/tap isn't pinpoint on thin
                    bars -- defaults to whichever bar is taller, since a tap
                    here (as opposed to on a bar itself) can't tell which one
                    was meant. */}
                <rect
                  x={x - gap}
                  y={padTop}
                  width={groupWidth + gap * 2}
                  height={plotHeight}
                  fill="transparent"
                  onPointerDown={() =>
                    setHover(
                      d.success >= d.fail
                        ? { day: d, kind: 'success', x: successX + barWidth / 2 }
                        : { day: d, kind: 'fail', x: failX + barWidth / 2 },
                    )
                  }
                  onPointerLeave={() => setHover(null)}
                />
                <text x={x + groupWidth / 2} y={height - 6} textAnchor="middle" fontSize={12} fill="var(--ink-dim)">
                  {d.label}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      <div className="mt-1 h-7">
        {hover && (
          <div
            className="pointer-events-none inline-flex items-baseline gap-2 rounded-sm border px-2 py-1 text-xs"
            style={{ borderColor: 'var(--rule)', background: 'var(--bg-elevated)' }}
          >
            <span style={{ color: 'var(--ink-dim)' }}>
              {hover.day.label} · {hover.kind === 'success' ? 'Success' : 'Failed'}
            </span>
            <span className="font-semibold" style={{ color: hover.kind === 'success' ? 'var(--ok-ink)' : 'var(--error-ink)' }}>
              {hover.kind === 'success' ? hover.day.success : hover.day.fail}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
