/**
 * One-time (idempotent) backfill: stamp app_metadata.org_id on every existing
 * auth user. Run AFTER applying 0023 and BEFORE (or right after) 0024 — RLS
 * reads the claim from each user's next token; until a user's token refreshes
 * (≤1h), the auth_org_id() profiles fallback covers them, so timing is soft.
 *
 *   node scripts/backfill-org-claims.mjs
 *
 * Uses the service-role key from .env.local. Users that already carry an
 * org_id claim are skipped, so re-running is safe. The org comes from the
 * user's profiles row (everything pre-0023 backfilled to the TurkCure org).
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

let page = 1;
let stamped = 0;
let skipped = 0;
for (;;) {
  const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
  if (error) {
    console.error("listUsers:", error.message);
    process.exit(1);
  }
  for (const user of data.users) {
    if (typeof user.app_metadata?.org_id === "string" && user.app_metadata.org_id) {
      skipped++;
      continue;
    }
    const { data: profile } = await admin
      .from("profiles")
      .select("org_id")
      .eq("id", user.id)
      .maybeSingle();
    const orgId = profile?.org_id ?? turkcure.id;
    // Spread the existing app_metadata so provider keys survive regardless of
    // whether the admin API merges or replaces the object.
    const { error: updErr } = await admin.auth.admin.updateUserById(user.id, {
      app_metadata: { ...user.app_metadata, org_id: orgId },
    });
    if (updErr) {
      console.error(`  ${user.email ?? user.id}: ${updErr.message}`);
      process.exitCode = 1;
    } else {
      stamped++;
      console.log(`  stamped ${user.email ?? user.id} → ${orgId}`);
    }
  }
  if (data.users.length < 200) break;
  page++;
}
console.log(`Done. Stamped ${stamped}, already had a claim: ${skipped}.`);
