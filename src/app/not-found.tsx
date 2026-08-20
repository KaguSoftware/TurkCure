import Link from "next/link";
import { Compass } from "lucide-react";

/** App-wide 404 — before this, an unknown URL fell through to Next's default page. */
export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background text-center">
      <span className="mb-4 rounded-full bg-surface-hover p-3 text-muted">
        <Compass className="size-6" />
      </span>
      <h1 className="text-lg font-semibold text-foreground">Page not found</h1>
      <p className="mt-1 max-w-sm text-sm text-muted">
        This page doesn&apos;t exist or has moved.
      </p>
      <Link
        href="/dashboard"
        className="mt-5 rounded-lg border border-border bg-surface px-4 py-2 text-sm font-medium text-foreground shadow-card hover:bg-surface-hover"
      >
        Go to dashboard
      </Link>
    </div>
  );
}
