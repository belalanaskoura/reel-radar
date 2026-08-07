import { Skeleton } from '@/components/Skeleton';
import { TicketIcon } from '@/components/icons';

export default function WatchlistLoading() {
  return (
    <main>
      <div className="relative overflow-hidden border-b" style={{ borderColor: 'var(--rule)' }}>
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'radial-gradient(ellipse 80% 60% at 50% -20%, color-mix(in srgb, var(--accent) 16%, transparent), transparent)',
          }}
        />
        <div className="relative mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
          <div className="mb-2 flex items-center gap-3">
            <div
              className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full"
              style={{ background: 'var(--ok-bg)', color: 'var(--accent)' }}
            >
              <TicketIcon />
            </div>
            <h1 className="font-display text-4xl leading-none sm:text-5xl" style={{ color: 'var(--ink)' }}>
              Your watchlist
            </h1>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-10">
        <div className="flex flex-col gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex gap-4">
              <Skeleton className="aspect-[2/3] w-20 shrink-0" />
              <div className="flex flex-1 flex-col gap-2 py-1">
                <Skeleton className="h-5 w-3/5" />
                <Skeleton className="h-3 w-2/5" />
                <Skeleton className="h-3 w-1/3" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
