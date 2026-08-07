import { Skeleton } from '@/components/Skeleton';

export default function CinemasLoading() {
  return (
    <main className="relative overflow-x-hidden">
      <div
        className="pointer-events-none absolute top-0 left-1/2 h-[400px] w-[800px] max-w-[200vw] -translate-x-1/2 rounded-full opacity-60 blur-[120px]"
        style={{ background: 'color-mix(in srgb, var(--accent) 22%, transparent)' }}
        aria-hidden="true"
      />

      <div className="relative mx-auto max-w-5xl px-4 pt-8 pb-6 sm:px-6 sm:pt-12 sm:pb-8">
        <h1
          className="font-display text-4xl leading-none tracking-wide uppercase sm:text-6xl lg:text-7xl"
          style={{ color: 'var(--ink)' }}
        >
          Available cinemas
        </h1>
      </div>

      <div className="relative mx-auto max-w-5xl px-4 pb-10 sm:px-6 sm:pb-14">
        <div className="flex flex-col gap-6">
          {Array.from({ length: 2 }).map((_, i) => (
            <div
              key={i}
              className="flex flex-col overflow-hidden rounded-lg sm:flex-row"
              style={{ background: 'var(--surface)', boxShadow: '0 0 0 1px var(--rule)' }}
            >
              <Skeleton className="h-28 shrink-0 rounded-none sm:h-auto sm:w-64" />
              <div className="flex flex-1 flex-col gap-3 p-5 sm:p-6">
                <Skeleton className="h-8 w-2/3" />
                <Skeleton className="h-4 w-1/3" />
                <Skeleton className="h-3 w-3/5" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
