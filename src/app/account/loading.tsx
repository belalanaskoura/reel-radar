import { Skeleton } from '@/components/Skeleton';

export default function AccountLoading() {
  return (
    <main className="relative overflow-hidden">
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse 80% 60% at 50% -20%, color-mix(in srgb, var(--accent) 16%, transparent), transparent)',
        }}
      />
      <div className="relative mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-12">
        <div className="grid gap-8 lg:grid-cols-[220px_1fr]">
          <div className="flex flex-col gap-4">
            <Skeleton className="aspect-square w-[120px]" />
            <Skeleton className="h-8 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>

          <div>
            <Skeleton className="mb-5 h-8 w-1/2" />
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex flex-col gap-2">
                  <Skeleton className="aspect-[2/3] w-full" />
                  <Skeleton className="h-4 w-4/5" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
