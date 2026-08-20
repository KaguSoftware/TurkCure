/**
 * One-time (idempotent) storage migration: move every existing object in
 * patient-files / receipts / instruction-images under the TurkCure org prefix
 * (`<orgId>/…`), then rewrite the DB columns and embedded markdown URLs that
 * point at the old paths. Run AFTER the new code is deployed and BEFORE
 * applying 0025 (which makes un-prefixed paths unreachable for user clients;
 * this script itself uses the service role and is indifferent).
 *
 *   node scripts/migrate-storage-org-prefix.mjs [--dry]
 *
 * Objects already under an org prefix are skipped, so re-running is safe.
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const DRY = process.argv.includes("--dry");

const env = Object.fromEntries(
  readFileSync(join(process.cwd(), ".env.local"), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    })
);

const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const { data: turkcure, error: orgErr } = await admin
  .from("organizations")
  .select("id")
  .eq("slug", "turkcure")
  .single();
if (orgErr || !turkcure) {
  console.error("TurkCure org not found — apply 0023 first.", orgErr?.message ?? "");
  process.exit(1);
}
const ORG = turkcure.id;
const PREFIX = `${ORG}/`;

/** Recursively list every object path in a bucket (folders come back id:null). */
async function listAll(bucket, prefix = "") {
  const paths = [];
  let offset = 0;
  for (;;) {
    const { data, error } = await admin.storage
      .from(bucket)
      .list(prefix, { limit: 1000, offset, sortBy: { column: "name", order: "asc" } });
    if (error) throw new Error(`list ${bucket}/${prefix}: ${error.message}`);
    for (const entry of data ?? []) {
      const full = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.id === null) paths.push(...(await listAll(bucket, full)));
      else paths.push(full);
    }
    if (!data || data.length < 1000) break;
    offset += 1000;
  }
  return paths;
}

for (const bucket of ["patient-files", "receipts", "instruction-images"]) {
  const paths = await listAll(bucket);
  const toMove = paths.filter((p) => !p.startsWith(PREFIX));
  console.log(`${bucket}: ${paths.length} objects, ${toMove.length} to move`);
  for (const p of toMove) {
    if (DRY) {
      console.log(`  would move ${p} → ${PREFIX}${p}`);
      continue;
    }
    const { error } = await admin.storage.from(bucket).move(p, `${PREFIX}${p}`);
    if (error) {
      console.error(`  move ${p}: ${error.message}`);
      process.exitCode = 1;
    }
  }
}

// ---- DB path rewrites (skip anything already prefixed) ----------------------

async function rewriteColumn(table, column, extraFilter) {
  let query = admin.from(table).select(`id, ${column}`).not(column, "like", `${PREFIX}%`);
  if (extraFilter) query = extraFilter(query);
  const { data, error } = await query;
  if (error) throw new Error(`${table}.${column} select: ${error.message}`);
  console.log(`${table}.${column}: ${data.length} rows to rewrite`);
  for (const row of data) {
    const next = `${PREFIX}${row[column]}`;
    if (DRY) continue;
    const { error: updErr } = await admin.from(table).update({ [column]: next }).eq("id", row.id);
    if (updErr) {
      console.error(`  ${table} ${row.id}: ${updErr.message}`);
      process.exitCode = 1;
    }
  }
}

await rewriteColumn("patient_files", "storage_path");
await rewriteColumn("payments", "receipt_path", (q) => q.neq("receipt_path", ""));

// case_instructions.image_paths is a text[] — rewrite element-wise.
{
  const { data, error } = await admin
    .from("case_instructions")
    .select("id, image_paths")
    .neq("image_paths", "{}");
  if (error) throw new Error(`case_instructions select: ${error.message}`);
  const rows = (data ?? []).filter((r) => (r.image_paths ?? []).some((p) => !p.startsWith(PREFIX)));
  console.log(`case_instructions.image_paths: ${rows.length} rows to rewrite`);
  for (const row of rows) {
    const next = row.image_paths.map((p) => (p.startsWith(PREFIX) ? p : `${PREFIX}${p}`));
    if (DRY) continue;
    const { error: updErr } = await admin
      .from("case_instructions")
      .update({ image_paths: next })
      .eq("id", row.id);
    if (updErr) {
      console.error(`  case_instructions ${row.id}: ${updErr.message}`);
      process.exitCode = 1;
    }
  }
}

// Embedded public URLs inside markdown bodies. move() leaves no redirect, so
// without this every historical inline image would 404.
const URL_MARK = "/object/public/instruction-images/";
const hasOldUrl = (s) => new RegExp(`/object/public/instruction-images/(?!${ORG}/)`).test(s ?? "");
for (const table of ["instruction_templates", "case_instructions"]) {
  const { data, error } = await admin
    .from(table)
    .select("id, body_md")
    .like("body_md", `%${URL_MARK}%`);
  if (error) throw new Error(`${table} body_md select: ${error.message}`);
  const rows = (data ?? []).filter((r) => hasOldUrl(r.body_md));
  console.log(`${table}.body_md: ${rows.length} rows to rewrite`);
  for (const row of rows) {
    const next = row.body_md.replace(
      new RegExp(`(/object/public/instruction-images/)(?!${ORG}/)`, "g"),
      `$1${ORG}/`
    );
    if (DRY) continue;
    const { error: updErr } = await admin.from(table).update({ body_md: next }).eq("id", row.id);
    if (updErr) {
      console.error(`  ${table} ${row.id}: ${updErr.message}`);
      process.exitCode = 1;
    }
  }
}

console.log(DRY ? "Dry run complete — nothing changed." : "Done.");
