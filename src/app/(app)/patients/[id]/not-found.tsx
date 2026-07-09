import Link from "next/link";
import { UserX } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
      <span className="mb-4 rounded-full bg-surface-hover p-3 text-muted">
        <UserX className="size-6" />
      </span>
      <h1 className="text-lg font-semibold">Patient not found</h1>
      <p className="mt-1 max-w-sm text-sm text-muted">
        This patient may have been deleted or you don&apos;t have access to it.
      </p>
      <Link href="/patients" className="mt-5">
        <Button variant="secondary">Back to patients</Button>
      </Link>
    </div>
  );
}
