# TurkCure — Agent & Contributor Guide

> **READ THIS ENTIRE FILE BEFORE DOING ANYTHING.** Every AI model, chat, agent, and
> human contributor must read every line here at the start of a session. This file
> exists to kill the guessing game: the stack, the conventions, the rules, and the
> recent decisions are all written down so you can get to work immediately without
> re-deriving them.
>
> This is the canonical guide. If you are a non-Claude tool (Cursor, Copilot,
> Codex, Gemini, etc.), treat this file as your instructions too.

---

## 🔴 Non-negotiable rules

1. **There is exactly ONE author, always: the repository owner, Parsa Mansouri.**
   - **NEVER add a co-author.** Do not add `Co-Authored-By:` trailers. Do not add
     "Generated with" / "Co-authored with" lines. Do not credit any AI, tool, or
     assistant in commit messages, PR descriptions, or anywhere in history.
   - Every commit must be authored solely by Parsa Mansouri using the configured
     git identity. No exceptions, ever.
2. **You may push only when you have permission.**
   - Push when the user explicitly asks you to ("push", "push it", "commit and
     push", etc.). Otherwise commit locally at most, and never push unprompted.
   - Never force-push, never rewrite published history, never skip hooks
     (`--no-verify`) or bypass signing unless the user explicitly says so.
3. **Never invent credit or authorship.** When in doubt about attribution, the
   answer is always: single author, the owner. Silence over co-authors.
4. **Migrations are applied by hand.** Do not auto-run or auto-apply SQL. Write the
   migration file; the owner applies it. Say so clearly when you add one.
5. **Confirm before destructive or outward-facing actions** (deletes, overwrites,
   anything that leaves the machine) unless already told to proceed.

---

## What this app is

TurkCure is an internal CRM/operations tool for a medical-tourism business:
patients, their treatment **cases**, quotes, payments, reminders, and the
directory of hospitals/doctors/hotels/drivers behind them. Admins also get a
finance view (per-case margins) and can generate patient-facing PDFs.

## Stack

| Layer      | Choice                                                        |
|------------|---------------------------------------------------------------|
| Framework  | **Next.js 16** (App Router, Turbopack), **React 19**          |
| Language   | TypeScript (strict), ES2017 target, incremental builds        |
| Data       | **Supabase** (Postgres + Auth + Storage) via `@supabase/supabase-js` — **no ORM** |
| Styling    | **Tailwind v4** (Oxide/PostCSS), custom spring-animation utils in `globals.css` |
| Auth       | Supabase JWT; verified locally (see below)                    |
| PDFs       | `@react-pdf/renderer` in Node-runtime API routes only         |
| Deploy     | **Vercel** (serverless) + Vercel Cron                         |

## Layout

```
src/
  app/(app)/…            Authenticated pages (server components; query Supabase, parallelize with Promise.all)
  app/api/…              PDF routes (nodejs runtime), cron, signout
  proxy.ts               Next 16 middleware (auth gate — see below)
  components/…           Feature views; "use client" only where interactive
  lib/
    supabase/            server.ts (cookie + admin clients), client.ts (browser)
    actions/             "use server" mutations; each revalidates paths/tags
    data/                Cached read helpers (unstable_cache + React cache)
    pdf/                 PDF renderers + embedded fonts
supabase/migrations/     Hand-applied SQL migrations, numbered 0001…
```

## Architecture you must know before editing

- **Auth is cheap on purpose. Don't regress it.**
  - `src/proxy.ts` gates requests by decoding the JWT `exp` **locally** from the
    cookie — zero network calls on the common path. It only calls
    `auth.getUser()` when the token is near expiry.
  - `src/lib/supabase/server.ts` `getProfile()` uses `getClaims()` (local JWKS
    verify), is wrapped in React `cache()` (per-request dedupe), and the profile
    row is `unstable_cache`'d (tag `"profiles"`). **Auth does not hit the DB per
    request.** If you touch auth, preserve these properties.
- **Supabase clients are created per call** (`createClient` binds to the request's
  cookies; `createAdminClient` is service-role, `persistSession:false`). This is
  correct for the App Router — it's HTTP, not a socket pool. Don't "singleton" it.
- **Reads that are expensive or near-static live in `src/lib/data/` behind
  `unstable_cache`** with a tag, and `cache()` on top for per-request dedupe.
  Examples: `directory.ts` (tag `"directories"`), `finance.ts` (tag `"finance"`).
- **`unstable_cache` is invalidated ONLY by `revalidateTag`, not
  `revalidatePath`.** If you cache a query, you MUST raise its tag from every
  write action that changes the underlying data. Miss one = stale data.
- **Server actions** (`src/lib/actions/*`, `"use server"`) do all writes and call
  `revalidatePath(...)` / `revalidateTag(...)` afterward.

## Conventions

- **Match the surrounding code** — naming, comment density, idioms. Comments
  explain *why*, not *what*.
- Server components fetch data and parallelize with `Promise.all`. Add `"use
  client"` only to genuinely interactive pieces.
- **Lazy-load heavy client libs** with `next/dynamic` (`ssr:false`) —
  recharts, TipTap, papaparse are already split; keep new heavy deps out of the
  eager bundle.
- **Memoize** derived list transforms (`useMemo`) and row handlers
  (`useCallback`) in large client views to avoid per-keystroke recompute.
- **Paginate/bound** any list that grows with the dataset.
- **Animations**: prefer `transform`/`opacity` (and `grid-template-rows` for
  collapse). Avoid animating `max-height`/`margin`/`padding`/`border`/`filter`
  on high-count lists — it thrashes layout/paint. Use the spring utilities in
  `globals.css`; respect the existing `prefers-reduced-motion` block.
- **Images**: use `next/image`; the Supabase storage host is configured in
  `next.config.ts`.
- **Verify before claiming done**: `npm run build` (types + lint) is the gate.
  For DB changes, `explain analyze` the affected queries.

## Commands

```bash
npm run dev      # Turbopack dev server
npm run build    # production build — the correctness gate (types + lint)
npm run start    # serve the production build
npm run lint     # eslint (core-web-vitals + typescript)
```

---

## Recent work — 2026-07-13 performance pass

A full three-layer audit (data / frontend / infra) drove these changes. Context:
the app had recurring "feels slow" complaints; the auth/middleware layer was
already optimized, so the remaining wins were in the DB, the client bundle, and
client-side re-render cost.

**Database** — `supabase/migrations/0011_perf_indexes.sql` (⚠️ apply by hand):
- Added indexes on hot filter/sort columns: `payments(due_date)`,
  `cases(arrival_date)`, `patients(created_at)`,
  `payments(case_id,direction,status,currency)`, `patients(email)`, `patients(phone)`.
- Added a `pg_trgm` GIN index on `patients(full_name,email,phone)` so the
  leading-wildcard `ILIKE` search stops full-scanning.
- Rewrote `finance_case_rows()` from three correlated subqueries **per case** to
  `GROUP BY` CTE aggregation. Same return shape; no app change needed.

**Bundle & config** — `next.config.ts`:
- `experimental.optimizePackageImports` for lucide/recharts/date-fns/tiptap,
  production `compiler.removeConsole`, and `images.remotePatterns` for Supabase.
- Lazy-loaded the three heavy client libs (nothing was code-split before):
  recharts → `components/finance/finance-chart.tsx`; TipTap →
  `components/ui/markdown-editor.tsx` (dynamic wrapper) + `markdown-editor-impl.tsx`;
  papaparse → on-demand `import()` in `csv-importer.tsx`.

**Client re-render & animation**:
- `patients-view.tsx`: memoized the derived list, replaced 6 per-column filter
  passes with a single `byStatus` grouping, `useCallback`'d row handlers.
- `reminders-panel.tsx`: memoized `withDone` / `patientOptions` / `shown`.
- `finance-view.tsx`: paginated the per-case table (was unbounded); memoized totals.
- `globals.css`: `reminder-out` now collapses via `grid-template-rows` instead of
  layout-thrashing box properties; dropped the `filter` transition from `.pressable`.

**Caching** — `src/lib/data/finance.ts`:
- The expensive finance aggregate is `unstable_cache`'d (tag `"finance"`, 5-min
  revalidate). `revalidateTag("finance")` is raised from payments, case/quote-item,
  and patient-delete actions so it never serves stale numbers.

---

_Keep this file current: when you make a materially new decision or change the
system's shape, update the relevant section (and add a dated note under "Recent
work") so the next reader stays up to speed. Same rules apply to editing this
file — single author, no co-authors._
