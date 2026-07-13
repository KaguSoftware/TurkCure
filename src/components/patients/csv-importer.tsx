"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Upload, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, Field } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, THead, TBody, Tr, Th, Td } from "@/components/ui/table";
import { toast } from "@/components/ui/toast";
import { importPatients } from "@/lib/actions/patients";

const TARGETS = [
  { key: "full_name", label: "Full name (required)" },
  { key: "email", label: "Email" },
  { key: "phone", label: "Phone" },
  { key: "source", label: "Source" },
  { key: "notes", label: "Notes" },
] as const;

type TargetKey = (typeof TARGETS)[number]["key"];

export function CsvImporter() {
  const router = useRouter();
  const [headers, setHeaders] = React.useState<string[]>([]);
  const [rows, setRows] = React.useState<Record<string, string>[]>([]);
  const [mapping, setMapping] = React.useState<Partial<Record<TargetKey, string>>>({});
  const [result, setResult] = React.useState<{ inserted: number; skipped: number } | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [importing, setImporting] = React.useState(false);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setResult(null);
    setError(null);
    // papaparse is only needed once a file is picked — load it on demand.
    const { default: Papa } = await import("papaparse");
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (res) => {
        const cols = res.meta.fields ?? [];
        setHeaders(cols);
        setRows(res.data);
        // Best-effort auto-mapping
        const auto: Partial<Record<TargetKey, string>> = {};
        for (const t of TARGETS) {
          const hit = cols.find((c) =>
            c.toLowerCase().replace(/[\s_-]/g, "").includes(t.key.replace("_", ""))
          );
          if (hit) auto[t.key] = hit;
        }
        if (!auto.full_name) {
          const nameCol = cols.find((c) => c.toLowerCase().includes("name"));
          if (nameCol) auto.full_name = nameCol;
        }
        setMapping(auto);
      },
      error: (err) => setError(err.message),
    });
  }

  const mapped = rows.map((r) => {
    const out: Record<string, string> = {};
    for (const t of TARGETS) {
      const src = mapping[t.key];
      if (src) out[t.key] = r[src] ?? "";
    }
    return out;
  });

  async function onImport() {
    setImporting(true);
    setError(null);
    const res = await importPatients(mapped as { full_name: string }[]);
    setImporting(false);
    if (res.error) {
      setError(res.error);
      toast.error(res.error);
    } else {
      setResult({ inserted: res.inserted ?? 0, skipped: res.skipped ?? 0 });
      toast.success(`${res.inserted ?? 0} patients imported, ${res.skipped ?? 0} duplicates skipped.`);
      React.startTransition(() => router.refresh());
    }
  }

  return (
    <div className="max-w-3xl space-y-4">
      <Card>
        <CardContent className="pt-5">
          <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border-strong py-10 text-muted transition-colors hover:border-primary hover:text-primary">
            <Upload className="size-6" />
            <span className="text-sm font-medium">Choose a CSV file</span>
            <input type="file" accept=".csv,text/csv" className="hidden" onChange={onFile} />
          </label>
        </CardContent>
      </Card>

      {headers.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Map columns</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {TARGETS.map((t) => (
              <Field key={t.key} label={t.label}>
                <Select
                  value={mapping[t.key] ?? ""}
                  onChange={(e) =>
                    setMapping((m) => ({ ...m, [t.key]: e.target.value || undefined }))
                  }
                >
                  <option value="">— skip —</option>
                  {headers.map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </Select>
              </Field>
            ))}
          </CardContent>
        </Card>
      )}

      {mapped.length > 0 && mapping.full_name && (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Preview ({mapped.length} rows)</CardTitle>
            </CardHeader>
            <CardContent className="px-0 pb-0">
              <Table className="border-0 shadow-none">
                <THead>
                  <tr>
                    <Th>Name</Th>
                    <Th>Email</Th>
                    <Th>Phone</Th>
                    <Th>Source</Th>
                  </tr>
                </THead>
                <TBody>
                  {mapped.slice(0, 8).map((r, i) => (
                    <Tr key={i}>
                      <Td className="font-medium">{r.full_name || "⚠ missing"}</Td>
                      <Td className="text-muted">{r.email || "—"}</Td>
                      <Td className="text-muted">{r.phone || "—"}</Td>
                      <Td className="text-muted">{r.source || "—"}</Td>
                    </Tr>
                  ))}
                </TBody>
              </Table>
              {mapped.length > 8 && (
                <p className="px-5 py-3 text-xs text-muted">…and {mapped.length - 8} more rows</p>
              )}
            </CardContent>
          </Card>

          <div className="flex items-center gap-3">
            <Button onClick={onImport} pending={importing}>
              Import {mapped.length} leads
            </Button>
            {result && (
              <span className="flex items-center gap-1.5 text-sm text-success">
                <CheckCircle2 className="size-4" />
                {result.inserted} imported, {result.skipped} duplicates skipped
              </span>
            )}
          </div>
        </>
      )}

      {error && <p className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}
    </div>
  );
}
