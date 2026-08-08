import { Skeleton } from '@/components/Skeleton';

export default function MovieDetailLoading() {
  return (
    <main>
      <div className="relative aspect-video max-h-[70vh] min-h-64 w-full sm:min-h-96">
        <Skeleton className="absolute inset-0 h-full w-full rounded-none" />

        <div className="absolute inset-x-0 bottom-0 mx-auto flex w-full max-w-5xl items-end gap-4 px-4 pb-4 sm:gap-6 sm:px-6 sm:pb-6">
          <Skeleton className="aspect-[2/3] w-20 flex-shrink-0 shadow-lg sm:w-36" />

          <div className="flex min-w-0 flex-1 flex-col gap-2 pb-1">
            <Skeleton className="h-7 w-4/5 sm:h-12" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-5xl px-4 pb-16 sm:px-6">
        <div className="flex gap-4 border-b" style={{ borderColor: 'var(--rule)' }}>
          <Skeleton className="my-2.5 h-4 w-16 rounded-full" />
          <Skeleton className="my-2.5 h-4 w-10 rounded-full" />
          <Skeleton className="my-2.5 h-4 w-20 rounded-full" />
          <Skeleton className="my-2.5 h-4 w-14 rounded-full" />
        </div>

        <div className="space-y-2 pt-6">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      </div>
    </main>
  );
}
