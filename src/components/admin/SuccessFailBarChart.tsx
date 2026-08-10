export interface DayCounts {
  label: string;
  success: number;
  fail: number;
}

// Simple grouped-bar chart for a small daily success/fail series --
// status colors only (ok/error), no categorical palette needed since
// there are exactly two series and their meaning is fixed.
export function SuccessFailBarChart({ days }: { days: DayCounts[] }) {
  const max = Math.max(1, ...days.map((d) => d.success + d.fail));
  const barWidth = 10;
  const gap = 2;
  const groupGap = 10;
  const groupWidth = barWidth * 2 + gap;
  const chartHeight = 140;
  const width = days.length * (groupWidth + groupGap);

  return (
    <div className="overflow-x-auto">
      <div className="flex items-center gap-4 pb-2 text-xs" style={{ color: 'var(--ink-dim)' }}>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2 w-2 rounded-full" style={{ background: 'var(--ok-ink)' }} />
          Success
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2 w-2 rounded-full" style={{ background: 'var(--error-ink)' }} />
          Failed
        </span>
      </div>
      <svg width={Math.max(width, 200)} height={chartHeight + 24} role="img" aria-label="Daily success and failure counts">
        {days.map((d, i) => {
          const x = i * (groupWidth + groupGap);
          const successHeight = (d.success / max) * chartHeight;
          const failHeight = (d.fail / max) * chartHeight;
          return (
            <g key={d.label}>
              <rect
                x={x}
                y={chartHeight - successHeight}
                width={barWidth}
                height={successHeight}
                rx={4}
                fill="var(--ok-ink)"
              />
              <rect
                x={x + barWidth + gap}
                y={chartHeight - failHeight}
                width={barWidth}
                height={failHeight}
                rx={4}
                fill="var(--error-ink)"
              />
              <text
                x={x + groupWidth / 2}
                y={chartHeight + 16}
                textAnchor="middle"
                fontSize={10}
                fill="var(--ink-dim)"
              >
                {d.label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
