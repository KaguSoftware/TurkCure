/**
 * Two-org isolation audit — the proof that multi-tenancy actually isolates.
 *
 *   node scripts/org-isolation-audit.mjs
 *
 * Run AFTER 0023–0025 are applied and the claims backfill has run. Uses the
 * service role (from .env.local) to ensure a disposable second workspace
 * ("Audit Clinic") with its own admin, then signs in as that admin through the
 * ordinary anon-key auth flow and asserts, under real RLS with a real JWT:
 *
 *   - zero visibility into the first org's patients/cases/payments/directories
 *   - the seeded defaults exist (countries/operation types/templates)
 *   - profiles lists only the audit org's own team
 *   - patient_status_counts() returns zero rows/counts
 *   - storage: reading a first-org object path fails; writing outside the
 *     caller's org prefix fails; writing inside it succeeds (then cleans up)
 *
 * Exit code 0 = all assertions passed. The audit org is left in place
 * (disabled) so re-runs are cheap and idempotent.
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const env = Object.fromEntries(
  readFileSync(join(process.cwd(), ".env.local"), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    })
);

const URL = env.NEXT_PUBLIC_SUPABASE_URL;
const admin = createClient(URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const AUDIT_SLUG = "audit-clinic";
const AUDIT_EMAIL = "audit-admin@example.com";
const AUDIT_PASSWORD = "audit-password-1";

let failures = 0;
function check(name, ok, detail = "") {
  if (ok) console.log(`  ✓ ${name}`);
  else {
    failures++;
    console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

// ---- setup: ensure the audit org + its admin exist --------------------------

const { data: turkcure } = await admin.from("organizations").select("id").eq("slug", "turkcure").single();
if (!turkcure) {
  console.error("TurkCure org missing — apply 0023 first.");
  process.exit(1);
}

let { data: auditOrg } = await admin.from("organizations").select("id").eq("slug", AUDIT_SLUG).maybeSingle();
if (!auditOrg) {
  const { data: created, error } = await admin
    .from("organizations")
    .insert({ name: "Audit Clinic", slug: AUDIT_SLUG, company_name: "Audit Clinic", brand_primary: "#0f766e" })
    .select("id")
    .single();
  if (error) throw new Error(`create audit org: ${error.message}`);
  auditOrg = created;
  const { error: seedErr } = await admin.rpc("seed_org_defaults", { p_org: auditOrg.id });
  if (seedErr) throw new Error(`seed: ${seedErr.message}`);
}

// The audit admin: create or adopt (idempotent across runs).
{
  const { data: users } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
  const existing = users?.users.find((u) => u.email === AUDIT_EMAIL);
  if (!existing) {
    const { error } = await admin.auth.admin.createUser({
      email: AUDIT_EMAIL,
      password: AUDIT_PASSWORD,
      email_confirm: true,
      user_metadata: { name: "Audit Admin" },
      app_metadata: { org_id: auditOrg.id, role: "admin" },
    });
    if (error) throw new Error(`create audit admin: ${error.message}`);
  } else {
    await admin.auth.admin.updateUserById(existing.id, {
      password: AUDIT_PASSWORD,
      app_metadata: { ...existing.app_metadata, org_id: auditOrg.id },
    });
  }
}

// A known first-org storage object path (if any exist) for the negative read.
const { data: anyFile } = await admin
  .from("patient_files")
  .select("storage_path")
  .eq("org_id", turkcure.id)
  .limit(1)
  .maybeSingle();

// ---- act as the audit admin through the real auth flow ----------------------

const b = createClient(URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
{
  const { error } = await b.auth.signInWithPassword({ email: AUDIT_EMAIL, password: AUDIT_PASSWORD });
  if (error) throw new Error(`audit sign-in: ${error.message}`);
}
const session = (await b.auth.getSession()).data.session;
check("JWT carries the org claim", session?.user.app_metadata?.org_id === auditOrg.id);

console.log("\nIsolation (as Audit Clinic admin):");
const count = async (table) => {
  const { count: c, error } = await b.from(table).select("id", { count: "exact", head: true });
  if (error) return { error };
  return { c: c ?? 0 };
};

for (const [table, expected] of [
  ["patients", 0],
  ["cases", 0],
  ["payments", 0],
  ["quote_items", 0],
  ["hospitals", 0],
  ["doctors", 0],
  ["reminders", 0],
  ["patient_files", 0],
]) {
  const r = await count(table);
  check(`${table}: sees ${expected}`, !r.error && r.c === expected, r.error?.message ?? `saw ${r.c}`);
}
{
  const r = await count("countries");
  check("countries: sees exactly the 21 seeded", r.c === 21, `saw ${r.c}`);
  const o = await count("operation_types");
  check("operation_types: sees exactly the 17 seeded", o.c === 17, `saw ${o.c}`);
  const t = await count("instruction_templates");
  check("instruction_templates: sees the 3 seeded", t.c === 3, `saw ${t.c}`);
  const p = await count("profiles");
  check("profiles: sees only its own team (1)", p.c === 1, `saw ${p.c}`);
}
{
  const { data } = await b.rpc("patient_status_counts");
  const total = (data ?? []).reduce((s, r) => s + Number(r.count), 0);
  check("patient_status_counts sums to 0", total === 0, `sum ${total}`);
}
{
  // quote_items cost column is revoked for authenticated — selecting it must fail.
  const { error } = await b.from("quote_items").select("cost").limit(1);
  check("quote_items.cost is column-denied", Boolean(error), "select cost succeeded");
}

console.log("\nStorage (as Audit Clinic admin):");
if (anyFile?.storage_path) {
  const { data, error } = await b.storage.from("patient-files").createSignedUrl(anyFile.storage_path, 60);
  check("cannot sign a first-org file path", Boolean(error) || !data?.signedUrl, "signed URL was issued");
} else {
  console.log("  (no first-org files to test against — skipped negative read)");
}
{
  const blob = new Blob(["audit"], { type: "text/plain" });
  const good = `${auditOrg.id}/audit-probe/${Date.now()}.txt`;
  const { error: goodErr } = await b.storage.from("patient-files").upload(good, blob);
  check("can upload under own org prefix", !goodErr, goodErr?.message);
  if (!goodErr) await admin.storage.from("patient-files").remove([good]);

  const bad = `${turkcure.id}/audit-probe/${Date.now()}.txt`;
  const { error: badErr } = await b.storage.from("patient-files").upload(bad, blob);
  check("cannot upload under the other org's prefix", Boolean(badErr), "upload succeeded");
  if (!badErr) await admin.storage.from("patient-files").remove([bad]);
}

console.log("\nFirst org still intact (service-role spot checks):");
{
  const { count: pat } = await admin
    .from("patients")
    .select("id", { count: "exact", head: true })
    .eq("org_id", turkcure.id);
  console.log(`  TurkCure patients: ${pat}`);
  const { data: fin, error } = await admin.rpc("finance_case_rows", { p_org: turkcure.id });
  check("finance_case_rows(p_org) returns", !error, error?.message);
  console.log(`  finance rows: ${fin?.length ?? 0}`);
  const { data: finB } = await admin.rpc("finance_case_rows", { p_org: auditOrg.id });
  check("finance for the audit org is empty", (finB?.length ?? 0) === 0, `saw ${finB?.length}`);
}

await b.auth.signOut();
console.log(failures === 0 ? "\nAll isolation checks passed." : `\n${failures} FAILURES.`);
process.exit(failures === 0 ? 0 : 1);
