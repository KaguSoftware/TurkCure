"use client";

import * as React from "react";
import { AlertCircle, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  React.useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
      <span className="mb-4 rounded-full bg-danger-soft p-3 text-danger">
        <AlertCircle className="size-6" />
      </span>
      <h1 className="text-lg font-semibold">Something went wrong</h1>
      {/* Raw error text here is Supabase/Postgres internals — log it for
          debugging (above) but never show it to staff. */}
      <p className="mt-1 max-w-sm text-sm text-muted">
        An unexpected error occurred while loading this page. Your data is safe — try again, and
        if it keeps happening tell the admin{error.digest ? ` (code ${error.digest})` : ""}.
      </p>
      <Button className="mt-5" onClick={() => reset()}>
        <RotateCw /> Try again
      </Button>
    </div>
  );
}
