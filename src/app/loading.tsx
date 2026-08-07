import { Skeleton } from '@/components/Skeleton';

export default function LandingLoading() {
  return (
    <main style={{ background: 'var(--bg)' }}>
      <section className="relative overflow-hidden">
        <div className="relative mx-auto flex max-w-5xl flex-col items-center px-4 py-24 text-center sm:px-6 sm:py-36">
          <Skeleton className="mb-8 h-7 w-56 rounded-full" />
          <Skeleton className="mb-3 h-16 w-full max-w-2xl sm:h-24" />
          <Skeleton className="mb-6 h-16 w-3/4 max-w-xl sm:h-24" />
          <Skeleton className="mb-10 h-16 w-full max-w-lg" />
        </div>
      </section>

      <section className="py-16 sm:py-20" style={{ background: 'var(--bg-elevated)' }}>
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <Skeleton className="mb-8 h-10 w-64" />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="aspect-[2/3] w-full" />
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
