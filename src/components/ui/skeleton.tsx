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

/** Dashboard-style skeleton: stat cards + two content panels. */
export function CardsPageSkeleton() {
  return (
    <div>
      <PageHeaderSkeleton />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-xl" />
        ))}
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Skeleton className="h-72 rounded-xl" />
        <Skeleton className="h-72 rounded-xl" />
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
