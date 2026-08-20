"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Field } from "@/components/ui/input";
import { Dialog } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Table, THead, TBody, Tr, Th, Td } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/components/ui/toast";
import { createOrganization, setOrganizationActive } from "@/lib/actions/orgs";
import { formatDate } from "@/lib/utils";
import type { Organization } from "@/lib/types";

export type OrgRow = Organization & { members: number };

/**
 * Platform-owner org management, modeled on the Team tab's UsersManager: a
 * table plus a create dialog that stays open until the server confirms (no
 * form-draft — the temp password is a credential and credentials are never
 * cached by convention).
 */
export function OrgsManager({ orgs }: { orgs: OrgRow[] }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [confirm, setConfirm] = React.useState<OrgRow | null>(null);
  const [confirmPending, setConfirmPending] = React.useState(false);

  async function onCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    const r = await createOrganization(
      String(fd.get("name")),
      String(fd.get("admin_name")),
      String(fd.get("admin_email")),
      String(fd.get("password"))
    );
    setSaving(false);
    if (r.error) {
      setError(r.error);
      return;
    }
    setOpen(false);
    toast.success("Workspace created — the admin can sign in with the temporary password.");
    React.startTransition(() => router.refresh());
  }

  async function onToggleActive() {
    if (!confirm) return;
    setConfirmPending(true);
    const r = await setOrganizationActive(confirm.id, !confirm.active);
    setConfirmPending(false);
    setConfirm(null);
    if (r.error) toast.error(r.error);
    else {
      toast.success(`${confirm.name} ${confirm.active ? "disabled" : "enabled"}.`);
      React.startTransition(() => router.refresh());
    }
  }

  return (
    <div className="max-w-4xl space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => setOpen(true)}>
          <Plus /> New organization
        </Button>
      </div>

      <Table>
        <THead>
          <tr>
            <Th>Company</Th>
            <Th className="hidden sm:table-cell">Members</Th>
            <Th className="hidden md:table-cell">Created</Th>
            <Th>Status</Th>
            <Th className="text-right">Actions</Th>
          </tr>
        </THead>
        <TBody>
          {orgs.map((o) => (
            <Tr key={o.id}>
              <Td className="font-medium">
                {o.name}
                <span className="ml-2 text-xs text-muted-light">{o.slug}</span>
              </Td>
              <Td className="hidden sm:table-cell">{o.members}</Td>
              <Td className="hidden md:table-cell">{formatDate(o.created_at)}</Td>
              <Td>
                <Badge tone={o.active ? "green" : "red"}>{o.active ? "Active" : "Disabled"}</Badge>
              </Td>
              <Td className="text-right">
                <Button variant="secondary" size="sm" onClick={() => setConfirm(o)}>
                  {o.active ? "Disable" : "Enable"}
                </Button>
              </Td>
            </Tr>
          ))}
        </TBody>
      </Table>

      <Dialog open={open} onClose={() => setOpen(false)} title="New organization">
        <form onSubmit={onCreate} className="space-y-4">
          <Field label="Company name" hint="Their workspace name, logo fallback and PDF identity">
            <Input name="name" required maxLength={80} />
          </Field>
          <Field label="First admin — name">
            <Input name="admin_name" required />
          </Field>
          <Field label="First admin — email">
            <Input name="admin_email" type="email" required />
          </Field>
          <Field
            label="Temporary password"
            hint="Share it with them out-of-band; they can change it in Settings"
          >
            <Input name="password" type="text" required minLength={8} placeholder="Min 8 characters" />
          </Field>
          {error && <p className="rounded-lg bg-danger-soft px-3 py-2 text-xs text-danger">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" pending={saving}>
              Create workspace
            </Button>
          </div>
        </form>
      </Dialog>

      <ConfirmDialog
        open={confirm !== null}
        onClose={() => setConfirm(null)}
        onConfirm={onToggleActive}
        pending={confirmPending}
        title={confirm?.active ? "Disable organization" : "Enable organization"}
        confirmLabel={confirm?.active ? "Disable" : "Enable"}
        description={
          confirm ? (
            <>
              {confirm.active ? "Disable" : "Enable"}{" "}
              <span className="font-medium text-foreground">{confirm.name}</span>?{" "}
              {confirm.active
                ? "Every member is signed out on their next request and cannot log in until re-enabled. Their data is kept."
                : "Its members will be able to log in again."}
            </>
          ) : undefined
        }
      />
    </div>
  );
}
