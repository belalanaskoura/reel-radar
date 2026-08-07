import { Skeleton } from '@/components/Skeleton';

export default function MovieDetailLoading() {
  return (
    <main>
      <Skeleton className="aspect-video max-h-[70vh] min-h-56 w-full rounded-none sm:min-h-80" />

      <div className="mx-auto max-w-5xl px-4 sm:px-6">
        <div className="-mt-16 flex flex-col gap-4 sm:-mt-32 sm:flex-row sm:gap-6">
          <Skeleton className="aspect-[2/3] w-28 flex-shrink-0 shadow-lg sm:w-48" />

          <div className="flex flex-1 flex-col justify-end gap-3 pb-2">
            <Skeleton className="h-10 w-4/5 sm:h-14" />
            <Skeleton className="h-4 w-1/2" />
          </div>
        </div>

        <div className="mt-6 flex flex-col gap-8 pb-16 sm:flex-row">
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-2/3" />
          </div>

          <div className="w-full sm:w-72 sm:flex-shrink-0">
            <Skeleton className="mb-4 h-4 w-24" />
            <Skeleton className="h-24 w-full" />
          </div>
        </div>
      </div>
    </main>
  );
}
