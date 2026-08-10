export interface LinePoint {
  label: string;
  value: number;
}

// Single-series line, 2px stroke, filled area at ~10% opacity, one
// end-marker with a surface ring -- no legend needed for a single series
// per the dataviz skill (the section title already names it).
export function LineChart({ points }: { points: LinePoint[] }) {
  if (points.length === 0) return null;

  const width = 600;
  const height = 140;
  const padding = 8;
  const max = Math.max(1, ...points.map((p) => p.value));
  const stepX = points.length > 1 ? (width - padding * 2) / (points.length - 1) : 0;

  const coords = points.map((p, i) => ({
    x: padding + i * stepX,
    y: height - padding - (p.value / max) * (height - padding * 2),
  }));

  const linePath = coords.map((c, i) => `${i === 0 ? 'M' : 'L'} ${c.x} ${c.y}`).join(' ');
  const areaPath = `${linePath} L ${coords[coords.length - 1].x} ${height} L ${coords[0].x} ${height} Z`;

  const last = coords[coords.length - 1];

  return (
    <div className="overflow-x-auto">
      <svg width={width} height={height + 20} viewBox={`0 0 ${width} ${height + 20}`} role="img" aria-label="Trend over time">
        <path d={areaPath} fill="var(--accent)" opacity={0.1} />
        <path d={linePath} fill="none" stroke="var(--accent)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
        <circle cx={last.x} cy={last.y} r={4} fill="var(--accent)" stroke="var(--surface)" strokeWidth={2} />
        <text x={coords[0].x} y={height + 16} fontSize={10} fill="var(--ink-dim)" textAnchor="start">
          {points[0].label}
        </text>
        <text x={last.x} y={height + 16} fontSize={10} fill="var(--ink-dim)" textAnchor="end">
          {points[points.length - 1].label}
        </text>
      </svg>
    </div>
  );
}
