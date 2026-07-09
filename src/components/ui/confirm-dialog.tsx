"use client";

import * as React from "react";
import { TriangleAlert } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = "Delete",
  pending = false,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description: React.ReactNode;
  confirmLabel?: string;
  pending?: boolean;
}) {
  return (
    <Dialog open={open} onClose={() => !pending && onClose()} title={title}>
      <div className="flex items-start gap-3">
        <span className="mt-0.5 rounded-full bg-danger-soft p-2 text-danger">
          <TriangleAlert className="size-4" />
        </span>
        <div className="text-sm text-muted">{description}</div>
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onClose} disabled={pending}>
          Cancel
        </Button>
        <Button type="button" variant="danger" onClick={onConfirm} pending={pending}>
          {confirmLabel}
        </Button>
      </div>
    </Dialog>
  );
}
