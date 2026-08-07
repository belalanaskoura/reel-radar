import { PosterGridSkeleton, Skeleton } from '@/components/Skeleton';

export default function CinemaDetailLoading() {
  return (
    <main className="relative overflow-x-hidden">
      <div
        className="pointer-events-none absolute top-0 left-1/2 h-[400px] w-[800px] max-w-[200vw] -translate-x-1/2 rounded-full opacity-60 blur-[120px]"
        style={{ background: 'color-mix(in srgb, var(--accent) 22%, transparent)' }}
        aria-hidden="true"
      />

      <div className="relative mx-auto max-w-5xl px-4 pt-6 pb-10 sm:px-6 sm:pb-14">
        <Skeleton className="mb-6 h-4 w-24" />

        <div
          className="mb-8 flex flex-col gap-2 rounded-lg p-6 sm:p-8"
          style={{ background: 'var(--surface)', boxShadow: '0 0 0 1px var(--rule)' }}
        >
          <Skeleton className="h-12 w-1/2" />
          <Skeleton className="h-4 w-1/3" />
        </div>

        <PosterGridSkeleton count={10} />
      </div>
    </main>
  );
}
