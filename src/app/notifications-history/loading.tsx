import { Skeleton } from '@/components/Skeleton';

export default function NotificationsHistoryLoading() {
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
        <div className="relative mx-auto max-w-2xl px-4 py-10 sm:px-6 sm:py-14">
          <h1 className="font-display text-4xl leading-none sm:text-5xl" style={{ color: 'var(--ink)' }}>
            Notifications
          </h1>
        </div>
      </div>

      <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6 sm:py-12">
        <div className="flex flex-col gap-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-start gap-3 rounded-sm border p-4" style={{ borderColor: 'var(--rule)' }}>
              <div className="mt-1.5 h-2 w-2 shrink-0 rounded-full" style={{ background: 'transparent' }} />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-4/5" />
                <Skeleton className="h-3 w-1/3" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
