import { cn } from "@/lib/utils";

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("skeleton", className)} />;
}

/** Page header placeholder matching PageHeader's title + subtitle. */
export function PageHeaderSkeleton() {
  return (
    <div className="mb-6 space-y-2">
      <Skeleton className="h-6 w-44" />
      <Skeleton className="h-4 w-72" />
    </div>
  );
}

/** Generic list-page skeleton: search bar + button row, then a table card. */
export function TablePageSkeleton({ rows = 8, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div>
      <PageHeaderSkeleton />
      <div className="mb-4 flex items-center justify-between">
        <Skeleton className="h-9 w-72" />
        <Skeleton className="h-9 w-32" />
      </div>
      <div className="overflow-hidden rounded-xl border border-border bg-surface shadow-card">
        <div className="border-b border-border px-4 py-3">
          <div className="flex gap-6">
            {Array.from({ length: cols }).map((_, i) => (
              <Skeleton key={i} className="h-3.5 w-24" />
            ))}
          </div>
        </div>
        <div className="divide-y divide-border">
          {Array.from({ length: rows }).map((_, i) => (
            <div key={i} className="flex items-center gap-6 px-4 py-3.5">
              {Array.from({ length: cols }).map((_, j) => (
                <Skeleton key={j} className={cn("h-4", j === 0 ? "w-40" : "w-24")} />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Dashboard-style skeleton: 6 stat cards + a 2/3 + 1/3 content row, mirroring
    the real dashboard so there's no layout jump when content swaps in. */
export function CardsPageSkeleton() {
  return (
    <div>
      <PageHeaderSkeleton />
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-[88px] rounded-xl" />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <Skeleton className="h-96 rounded-xl xl:col-span-2" />
        <div className="space-y-5">
          <Skeleton className="h-44 rounded-xl" />
          <Skeleton className="h-44 rounded-xl" />
        </div>
      </div>
    </div>
  );
}

/** Kanban board skeleton: 6 status columns each with a header + a few cards,
    matching the Patients board (the default view) so its skeleton doesn't
    resolve into a different layout. */
export function BoardPageSkeleton() {
  return (
    <div>
      <PageHeaderSkeleton />
      <div className="mb-4 flex items-center justify-between">
        <Skeleton className="h-9 w-full max-w-xs" />
        <Skeleton className="h-9 w-56" />
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {Array.from({ length: 6 }).map((_, col) => (
          <div key={col} className="flex flex-col gap-2">
            <Skeleton className="h-5 w-24" />
            <div className="flex flex-col gap-2 rounded-xl bg-surface-hover/50 p-2">
              {Array.from({ length: (col % 3) + 1 }).map((_, i) => (
                <Skeleton key={i} className="h-20 rounded-lg" />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Detail-page skeleton: header + info card + tabbed content block. */
export function DetailPageSkeleton() {
  return (
    <div>
      <PageHeaderSkeleton />
      <Skeleton className="h-40 rounded-xl" />
      <div className="mt-4 flex gap-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-9 w-28" />
        ))}
      </div>
      <Skeleton className="mt-4 h-96 rounded-xl" />
    </div>
  );
}
