"use client";

import * as React from "react";
import { Pencil, Plus, Search, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Textarea, Select, Field } from "@/components/ui/input";
import { Dialog } from "@/components/ui/dialog";
import { Table, THead, TBody, Tr, Th, Td, EmptyRow } from "@/components/ui/table";
import {
  upsertDirectoryRow,
  deleteDirectoryRow,
  type DirectoryTable,
} from "@/lib/actions/directory";

export interface FieldDef {
  key: string;
  label: string;
  type?: "text" | "number" | "textarea" | "select";
  options?: { value: string; label: string }[];
  required?: boolean;
  hideInTable?: boolean;
  render?: (row: Record<string, unknown>) => React.ReactNode;
}

export function DirectoryManager({
  table,
  entityName,
  fields,
  rows,
  isAdmin,
}: {
  table: DirectoryTable;
  entityName: string;
  fields: FieldDef[];
  rows: Record<string, unknown>[];
  isAdmin: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Record<string, unknown> | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [query, setQuery] = React.useState("");

  const visible = fields.filter((f) => !f.hideInTable);
  const filtered = query
    ? rows.filter((r) =>
        fields.some((f) => String(r[f.key] ?? "").toLowerCase().includes(query.toLowerCase()))
      )
    : rows;

  function openNew() {
    setEditing(null);
    setError(null);
    setOpen(true);
  }

  function openEdit(row: Record<string, unknown>) {
    setEditing(row);
    setError(null);
    setOpen(true);
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    const values: Record<string, unknown> = {};
    for (const f of fields) {
      const raw = fd.get(f.key);
      if (raw === null) continue;
      const s = String(raw);
      if (f.type === "number") values[f.key] = s === "" ? null : Number(s);
      else if (f.type === "select" && s === "") values[f.key] = null;
      else values[f.key] = s;
    }
    const result = await upsertDirectoryRow(table, values, editing?.id as string | undefined);
    setSaving(false);
    if (result.error) setError(result.error);
    else setOpen(false);
  }

  async function onDelete(id: string) {
    if (!confirm(`Delete this ${entityName.toLowerCase()}?`)) return;
    const result = await deleteDirectoryRow(table, id);
    if (result.error) alert(result.error);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="relative w-full max-w-xs">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-light" />
          <Input
            placeholder={`Search…`}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <Button onClick={openNew}>
          <Plus /> Add {entityName}
        </Button>
      </div>

      <Table>
        <THead>
          <tr>
            {visible.map((f) => (
              <Th key={f.key}>{f.label}</Th>
            ))}
            <Th className="w-24 text-right">Actions</Th>
          </tr>
        </THead>
        <TBody>
          {filtered.length === 0 && (
            <EmptyRow colSpan={visible.length + 1} message={`No ${entityName.toLowerCase()}s yet.`} />
          )}
          {filtered.map((row) => (
            <Tr key={row.id as string}>
              {visible.map((f) => (
                <Td key={f.key} className={f === visible[0] ? "font-medium" : "text-muted"}>
                  {f.render
                    ? f.render(row)
                    : f.type === "select"
                      ? f.options?.find((o) => o.value === row[f.key])?.label ?? "—"
                      : String(row[f.key] ?? "") || "—"}
                </Td>
              ))}
              <Td className="text-right">
                <div className="flex justify-end gap-1">
                  <Button variant="ghost" size="icon" aria-label="Edit" onClick={() => openEdit(row)}>
                    <Pencil />
                  </Button>
                  {isAdmin && (
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Delete"
                      className="hover:text-danger"
                      onClick={() => onDelete(row.id as string)}
                    >
                      <Trash2 />
                    </Button>
                  )}
                </div>
              </Td>
            </Tr>
          ))}
        </TBody>
      </Table>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? `Edit ${entityName}` : `Add ${entityName}`}
      >
        <form onSubmit={onSubmit} className="space-y-4">
          {fields.map((f) => (
            <Field key={f.key} label={f.label}>
              {f.type === "textarea" ? (
                <Textarea
                  name={f.key}
                  defaultValue={(editing?.[f.key] as string) ?? ""}
                  rows={f.key === "body_md" ? 12 : 3}
                />
              ) : f.type === "select" ? (
                <Select name={f.key} defaultValue={(editing?.[f.key] as string) ?? ""}>
                  <option value="">—</option>
                  {f.options?.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </Select>
              ) : (
                <Input
                  name={f.key}
                  type={f.type === "number" ? "number" : "text"}
                  required={f.required}
                  defaultValue={(editing?.[f.key] as string) ?? ""}
                />
              )}
            </Field>
          ))}
          {error && <p className="rounded-lg bg-danger-soft px-3 py-2 text-xs text-danger">{error}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
