import { PageHeaderSkeleton, Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="max-w-3xl">
      <PageHeaderSkeleton />
      <Skeleton className="h-40 rounded-xl" />
    </div>
  );
}
