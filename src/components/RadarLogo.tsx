// The ReelRadar mark: a film reel rendered as a radar dial, with a radar
// sweep wedge and a pulsing star as the "signal" being tracked. Built from
// the brand's reference SVG (five reel cutouts + spindle + sweep + star),
// using theme tokens instead of hardcoded hex so it recolors correctly
// across light/dark mode rather than shipping a fixed-palette raster export.
export function RadarLogo({
  size = 32,
  animated = false,
  className,
}: {
  size?: number;
  animated?: boolean;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 200 200"
      fill="none"
      aria-hidden
      className={className}
      style={{ flexShrink: 0 }}
    >
      {/* Outer canister edge */}
      <circle cx="100" cy="100" r="94" fill="none" stroke="var(--rule)" strokeWidth="2" strokeDasharray="4 4" />

      <g style={animated ? { transformOrigin: '100px 100px', animation: 'radar-sweep 8s linear infinite' } : undefined}>
        {/* Outer rim */}
        <circle cx="100" cy="100" r="86" fill="none" stroke="var(--accent)" strokeWidth="5" />
        {/* Inner thick ring (reel body) */}
        <circle cx="100" cy="100" r="56" fill="none" stroke="var(--accent)" strokeWidth="44" />

        {/* Five reel cutouts */}
        <g fill="var(--bg)">
          <circle cx="100" cy="52" r="19" />
          <circle cx="100" cy="52" r="19" transform="rotate(72 100 100)" />
          <circle cx="100" cy="52" r="19" transform="rotate(144 100 100)" />
          <circle cx="100" cy="52" r="19" transform="rotate(216 100 100)" />
          <circle cx="100" cy="52" r="19" transform="rotate(288 100 100)" />
        </g>

        {/* Central spindle hole */}
        <circle cx="100" cy="100" r="15" fill="var(--bg)" />
        <circle cx="100" cy="100" r="12" fill="none" stroke="var(--accent)" strokeWidth="2.5" />

        {/* Radar sweep wedge */}
        <path
          d="M 100 100 L 100 14 A 86 86 0 0 1 174 100 Z"
          fill="var(--highlight)"
          opacity="0.18"
        />
      </g>

      {/* Central star -- the tracked signal */}
      <path
        d="M 100 90 L 102.5 97.5 L 110 100 L 102.5 102.5 L 100 110 L 97.5 102.5 L 90 100 L 97.5 97.5 Z"
        fill="var(--highlight)"
        style={animated ? { transformOrigin: '100px 100px', animation: 'radar-pulse 2s ease-in-out infinite' } : undefined}
      />
    </svg>
  );
}
