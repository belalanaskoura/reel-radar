import { PosterGridSkeleton } from '@/components/Skeleton';

export default function BrowseLoading() {
  return (
    <main className="relative overflow-x-hidden">
      <div
        className="pointer-events-none absolute top-0 left-1/2 h-[400px] w-[800px] max-w-[200vw] -translate-x-1/2 rounded-full opacity-60 blur-[120px]"
        style={{ background: 'color-mix(in srgb, var(--accent) 22%, transparent)' }}
        aria-hidden="true"
      />

      <div className="relative mx-auto max-w-7xl px-4 pt-8 pb-6 sm:px-6 sm:pt-12 sm:pb-8">
        <h1
          className="font-display text-4xl leading-none tracking-wide uppercase sm:text-6xl lg:text-7xl"
          style={{ color: 'var(--ink)' }}
        >
          Now booking &amp; on the way
        </h1>
      </div>

      <div className="relative mx-auto max-w-7xl px-4 pb-10 sm:px-6 sm:pb-14">
        <PosterGridSkeleton count={15} />
      </div>
    </main>
  );
}
