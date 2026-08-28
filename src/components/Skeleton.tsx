export function Skeleton({ className = '' }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded-sm ${className}`}
      style={{ background: 'var(--bg-elevated)' }}
      aria-hidden="true"
    />
  );
}

export function PosterGridSkeleton({ count = 12 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex flex-col gap-2">
          <Skeleton className="aspect-[2/3] w-full" />
          <Skeleton className="h-4 w-4/5" />
          <Skeleton className="h-3 w-2/5" />
        </div>
      ))}
    </div>
  );
}

// Generic placeholder for one admin page section -- a SectionHeader-shaped
// bar plus a handful of block rows. Every /admin/* subpage's content is
// SectionHeader-led regardless of what it actually renders (stat tiles,
// tables, charts), so one shape covers all of them rather than a bespoke
// skeleton per page mirroring exact content.
export function AdminSectionSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-3">
        <Skeleton className="h-3 w-32" />
      </div>
      <div className="flex flex-col gap-2">
        {Array.from({ length: rows }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    </div>
  );
}
