"use client";

import * as React from "react";
import { Pencil, Plus, Search, Star, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Textarea, Select, Field } from "@/components/ui/input";
import { MarkdownEditor } from "@/components/ui/markdown-editor";
import { uploadInstructionImage } from "@/lib/upload-instruction-image";
import { Dialog } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { StarRating } from "@/components/ui/star-rating";
import { Table, THead, TBody, Tr, Th, Td, EmptyRow } from "@/components/ui/table";
import { useOptimisticList, tempId } from "@/lib/use-optimistic-list";
import {
  upsertDirectoryRow,
  deleteDirectoryRow,
  type DirectoryTable,
} from "@/lib/actions/directory";

export interface FieldDef {
  key: string;
  label: string;
  type?: "text" | "number" | "textarea" | "markdown" | "select" | "tel" | "email" | "url" | "list" | "stars";
  options?: { value: string; label: string }[];
  required?: boolean;
  hideInTable?: boolean;
  /** For select fields: joined relation key whose .name is shown in the table (serializable — no render functions across the server/client boundary). */
  displayKey?: string;
}

function MarkdownField({ name, defaultValue }: { name: string; defaultValue: string }) {
  const [value, setValue] = React.useState(defaultValue);
  return (
    <MarkdownEditor
      name={name}
      value={value}
      onChange={setValue}
      rows={18}
      uploadImage={(file) => uploadInstructionImage(file, "templates")}
    />
  );
}

function ListField({ name, defaultValue, label }: { name: string; defaultValue: string[]; label: string }) {
  const [items, setItems] = React.useState<string[]>(defaultValue.length ? defaultValue : [""]);
  return (
    <div className="space-y-2">
      {items.map((item, i) => (
        <div key={i} className="flex items-center gap-2">
          <Input
            name={name}
            defaultValue={item}
            placeholder={`${label} ${i + 1}`}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={`Remove ${label.toLowerCase()} ${i + 1}`}
            className="shrink-0 hover:text-danger"
            disabled={items.length === 1}
            onClick={() => setItems((prev) => prev.filter((_, j) => j !== i))}
          >
            <X />
          </Button>
        </div>
      ))}
      <Button type="button" variant="soft" size="sm" onClick={() => setItems((prev) => [...prev, ""])}>
        <Plus /> Add {label.toLowerCase()}
      </Button>
    </div>
  );
}

export function DirectoryManager({
  table,
  entityName,
  entityNamePlural,
  fields,
  rows,
  isAdmin,
}: {
  table: DirectoryTable;
  entityName: string;
  entityNamePlural?: string;
  fields: FieldDef[];
  rows: Record<string, unknown>[];
  isAdmin: boolean;
}) {
  const plural = entityNamePlural ?? `${entityName.toLowerCase()}s`;
  const [open, setOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Record<string, unknown> | null>(null);
  const [confirmDelete, setConfirmDelete] = React.useState<string | null>(null);
  const [query, setQuery] = React.useState("");
  const { items, mutate, pending } = useOptimisticList<Record<string, unknown> & { id: string }>(
    rows as (Record<string, unknown> & { id: string })[]
  );

  const visible = fields.filter((f) => !f.hideInTable);
  const filtered = query
    ? items.filter((r) =>
        fields.some((f) => String(r[f.key] ?? "").toLowerCase().includes(query.toLowerCase()))
      )
    : items;

  function openNew() {
    setEditing(null);
    setOpen(true);
  }

  function openEdit(row: Record<string, unknown>) {
    setEditing(row);
    setOpen(true);
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const values: Record<string, unknown> = {};
    for (const f of fields) {
      if (f.type === "list") {
        values[f.key] = fd
          .getAll(f.key)
          .map((v) => String(v).trim())
          .filter(Boolean);
        continue;
      }
      const raw = fd.get(f.key);
      if (raw === null) continue;
      const s = String(raw);
      if (f.type === "number" || f.type === "stars") values[f.key] = s === "" ? null : Number(s);
      else if (f.type === "select" && s === "") values[f.key] = null;
      else values[f.key] = s;
    }
    const editingId = editing?.id as string | undefined;
    const optimisticRow = editingId
      ? { ...(editing as Record<string, unknown>), ...values, id: editingId }
      : { ...values, id: tempId() };
    setOpen(false);
    await mutate({
      optimistic: (prev) =>
        editingId
          ? prev.map((r) => (r.id === editingId ? (optimisticRow as typeof r) : r))
          : [...prev, optimisticRow as (typeof prev)[number]],
      action: () => upsertDirectoryRow(table, values, editingId),
      success: editing ? `${entityName} updated.` : `${entityName} created.`,
      reconcile: (r, prev) =>
        r?.row
          ? prev.map((x) =>
              x.id === optimisticRow.id ? (r.row as (typeof prev)[number]) : x
            )
          : prev,
    });
  }

  async function onDelete(id: string) {
    // Keep the confirm dialog open (with a spinner) until the delete resolves,
    // then close — so double-clicks can't fire a second delete.
    await mutate({
      optimistic: (prev) => prev.filter((r) => r.id !== id),
      action: () => deleteDirectoryRow(table, id),
      success: `${entityName} deleted.`,
    });
    setConfirmDelete(null);
  }

  function cellValue(row: Record<string, unknown>, f: FieldDef): string {
    if (f.displayKey) return (row[f.displayKey] as { name?: string } | null)?.name ?? "—";
    if (f.type === "select")
      return (
        f.options?.find((o) => o.value === row[f.key])?.label ??
        (String(row[f.key] ?? "") || "—")
      );
    if (f.type === "list") {
      const arr = (row[f.key] as string[] | null) ?? [];
      return arr.length ? arr.join(", ") : "—";
    }
    return String(row[f.key] ?? "") || "—";
  }

  function renderCell(row: Record<string, unknown>, f: FieldDef): React.ReactNode {
    if (f.type === "email" || f.type === "tel" || f.type === "url") {
      const val = String(row[f.key] ?? "").trim();
      if (!val) return "—";
      const href =
        f.type === "email"
          ? `mailto:${val}`
          : f.type === "tel"
            ? `tel:${val.replace(/[^\d+]/g, "")}`
            : /^https?:\/\//i.test(val)
              ? val
              : `https://${val}`;
      return (
        <a
          href={href}
          {...(f.type === "url" ? { target: "_blank", rel: "noreferrer" } : {})}
          className="text-primary hover:underline"
          onClick={(e) => e.stopPropagation()}
        >
          {val}
        </a>
      );
    }
    if (f.type === "stars") {
      const n = Number(row[f.key] ?? 0);
      if (!n) return "—";
      return (
        <span className="inline-flex items-center gap-0.5 text-warning">
          {Array.from({ length: n }).map((_, i) => (
            <Star key={i} className="size-3.5 fill-warning" />
          ))}
        </span>
      );
    }
    return cellValue(row, f);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
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
            <EmptyRow colSpan={visible.length + 1} message={`No ${plural} yet.`} />
          )}
          {filtered.map((row) => (
            <Tr key={row.id as string}>
              {visible.map((f) => (
                <Td key={f.key} className={f === visible[0] ? "font-medium" : "text-muted"}>
                  {renderCell(row, f)}
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
                      onClick={() => setConfirmDelete(row.id as string)}
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
        wide={fields.some((f) => f.type === "markdown")}
      >
        <form onSubmit={onSubmit} className="space-y-4">
          {fields.map((f) => (
            <Field key={f.key} label={f.label}>
              {f.type === "markdown" ? (
                <MarkdownField
                  key={(editing?.id as string) ?? "new"}
                  name={f.key}
                  defaultValue={(editing?.[f.key] as string) ?? ""}
                />
              ) : f.type === "textarea" ? (
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
              ) : f.type === "list" ? (
                <ListField
                  key={(editing?.id as string) ?? "new"}
                  name={f.key}
                  label={f.label.replace(/s$/, "")}
                  defaultValue={(editing?.[f.key] as string[]) ?? []}
                />
              ) : f.type === "stars" ? (
                <StarRating
                  key={(editing?.id as string) ?? "new"}
                  name={f.key}
                  defaultValue={Number(editing?.[f.key] ?? 0)}
                />
              ) : (
                <Input
                  name={f.key}
                  type={f.type ?? "text"}
                  inputMode={f.type === "tel" ? "tel" : f.type === "email" ? "email" : undefined}
                  required={f.required}
                  defaultValue={(editing?.[f.key] as string) ?? ""}
                />
              )}
            </Field>
          ))}
          <div className="flex items-center justify-between gap-2 pt-2">
            <div>
              {editing && isAdmin && (
                <Button
                  type="button"
                  variant="ghost"
                  className="text-danger hover:bg-danger-soft"
                  onClick={() => setConfirmDelete(editing.id as string)}
                >
                  <Trash2 /> Delete
                </Button>
              )}
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" pending={pending}>
                Save
              </Button>
            </div>
          </div>
        </form>
      </Dialog>

      <ConfirmDialog
        open={confirmDelete !== null}
        onClose={() => setConfirmDelete(null)}
        onConfirm={() => confirmDelete && onDelete(confirmDelete)}
        pending={pending}
        title={`Delete ${entityName.toLowerCase()}`}
        description={
          <>
            This will permanently delete this {entityName.toLowerCase()}. Records that reference it
            (e.g. cases) will keep working but lose the link. This cannot be undone.
          </>
        }
      />
    </div>
  );
}
