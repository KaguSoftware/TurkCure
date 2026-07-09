"use client";

import * as React from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Select, Field } from "@/components/ui/input";
import { Dialog } from "@/components/ui/dialog";
import { Table, THead, TBody, Tr, Th, Td } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/components/ui/toast";
import { useRouter } from "next/navigation";
import { inviteUser, setUserActive, setUserRole } from "@/lib/actions/users";
import type { Profile, Role } from "@/lib/types";

export function UsersManager({
  users,
  currentUserId,
}: {
  users: Profile[];
  currentUserId: string;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [togglingId, setTogglingId] = React.useState<string | null>(null);

  async function onInvite(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    const result = await inviteUser(
      String(fd.get("email")),
      String(fd.get("name")),
      String(fd.get("role")) as Role,
      String(fd.get("password"))
    );
    setSaving(false);
    if (result.error) {
      setError(result.error);
      toast.error(result.error);
    } else {
      toast.success("Team member created.");
      setOpen(false);
      router.refresh();
    }
  }

  return (
    <div className="max-w-3xl space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => setOpen(true)}>
          <Plus /> Add team member
        </Button>
      </div>

      <Table>
        <THead>
          <tr>
            <Th>Name</Th>
            <Th>Role</Th>
            <Th>Status</Th>
            <Th className="text-right">Actions</Th>
          </tr>
        </THead>
        <TBody>
          {users.map((u) => (
            <Tr key={u.id}>
              <Td className="font-medium">
                {u.name}
                {u.id === currentUserId && (
                  <span className="ml-2 text-xs text-muted-light">(you)</span>
                )}
              </Td>
              <Td>
                <Select
                  className="h-8 w-32 text-xs"
                  value={u.role}
                  disabled={u.id === currentUserId}
                  onChange={async (e) => {
                    const role = e.target.value as Role;
                    const r = await setUserRole(u.id, role);
                    if (r.error) toast.error(r.error);
                    else {
                      toast.success(`${u.name} is now ${role === "admin" ? "an admin" : "an agent"}.`);
                      router.refresh();
                    }
                  }}
                >
                  <option value="admin">Admin</option>
                  <option value="agent">Agent</option>
                </Select>
              </Td>
              <Td>
                <Badge tone={u.active ? "green" : "red"}>{u.active ? "Active" : "Disabled"}</Badge>
              </Td>
              <Td className="text-right">
                {u.id !== currentUserId && (
                  <Button
                    variant="secondary"
                    size="sm"
                    pending={togglingId === u.id}
                    onClick={async () => {
                      setTogglingId(u.id);
                      const r = await setUserActive(u.id, !u.active);
                      setTogglingId(null);
                      if (r.error) toast.error(r.error);
                      else {
                        toast.success(`${u.name} ${u.active ? "disabled" : "enabled"}.`);
                        router.refresh();
                      }
                    }}
                  >
                    {u.active ? "Disable" : "Enable"}
                  </Button>
                )}
              </Td>
            </Tr>
          ))}
        </TBody>
      </Table>

      <Dialog open={open} onClose={() => setOpen(false)} title="Add team member">
        <form onSubmit={onInvite} className="space-y-4">
          <Field label="Name">
            <Input name="name" required />
          </Field>
          <Field label="Email">
            <Input name="email" type="email" required />
          </Field>
          <Field label="Temporary password">
            <Input name="password" type="text" required minLength={8} placeholder="Min 8 characters" />
          </Field>
          <Field label="Role">
            <Select name="role" defaultValue="agent">
              <option value="agent">Agent — no access to internal costs or finance</option>
              <option value="admin">Admin — full access</option>
            </Select>
          </Field>
          {error && <p className="rounded-lg bg-danger-soft px-3 py-2 text-xs text-danger">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" pending={saving}>
              Create account
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
