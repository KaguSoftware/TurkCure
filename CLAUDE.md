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

TurkCure is a **multi-tenant medical-tourism CRM** (since 2026-08-20): multiple
companies (organizations) each get an isolated workspace — patients, treatment
**cases**, quotes, payments, reminders, and the directory of hospitals/doctors/
hotels/drivers behind them — plus per-company branding (name, logo, colors)
that flows into the app shell and the patient-facing PDFs. Admins get a finance
view (per-case margins). Organizations are created ONLY by the platform owner
(`profiles.is_super`) via `/admin`; org admins invite their own staff. There is
no public signup, by design.

**Multi-tenancy rules (standing, non-negotiable):**
- Every tenant table carries `org_id`. Cookie/browser-client writes self-stamp
  via the column default + RLS `with check`; **service-role (admin client)
  queries MUST filter/stamp `org_id` explicitly by hand** — RLS does not apply
  to them. Composite FKs `(fk, org_id)` make parent/child org mismatch
  unrepresentable.
- **Cached reads are per-org**: `unstable_cache` keys include the orgId and
  tags are `directories:<org>` / `finance:<org>` / `org:<org>`. A new cached
  read that misses the orgId in its key is a cross-tenant leak.
- **Storage paths lead with the org id** (`<orgId>/…`); policies pin folder 1
  to `auth_org_id()`. Every new upload path must be org-prefixed.
- Org identity rides the JWT (`app_metadata.org_id`, server-set only);
  `auth_org_id()` in Postgres falls back to the profiles row. `is_admin()`
  stays a live DB lookup on purpose (demotion must bite immediately).

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
- **Horizontal scrollers never scroll vertically.** Any `overflow-x-auto`
  container (tab bars, table wrappers, chip rows) MUST also set
  `overflow-y-hidden`: with overflow-x non-visible the browser computes
  overflow-y as auto, and 1px of vertical overflow — fractional browser zoom is
  enough — manufactures a phantom vertical scrollbar. `Table` and `TabBar`
  already do this; match them in any new sideways scroller.
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

## Recent work — 2026-07-13 UI/UX pass

A four-track sweep for a more premium, consistent, accessible feel. Context: the
design system was already strong; the wins were in fixing rough edges (layout
jumps, missing feedback, a11y plumbing, unsafe/inconsistent destructive actions,
ephemeral view state), not rebuilding it.

**New shared primitives / hooks:**
- `src/lib/use-focus-trap.ts` — traps Tab, autofocuses first element, restores
  focus on close. Used by `Dialog`, the mobile drawer, and the command palette.
- `src/components/ui/tabs.tsx` — accessible `TabBar` + `TabPanel` (role="tab"/
  "tablist"/"tabpanel", roving tabindex, arrow-key nav). Replaces the ad-hoc
  button rows in `patient-detail.tsx` and `settings-view.tsx`.

**Shared-component fixes (lift the whole app):**
- `Field` in `input.tsx` now associates its `<Label>` with the control via a
  generated id (`useId` + cloneElement), so every form has proper label→field
  wiring. `Select` gained full listbox ARIA + keyboard nav (arrows/Home/End/
  Enter, `aria-activedescendant`) and accepts `id`/`aria-label`.
- `Dialog` got `role="dialog"`/`aria-modal`/`aria-labelledby` + the focus trap.
- `date-picker.tsx`: the clear control is now a real sibling `<button>` (was a
  nested `<span role=button>` — invalid to nest once it's a button); day cells
  have `aria-label`s.
- `button.tsx`: `danger` hover uses a token bg (was `opacity-90`).

**Feel / motion (premium but fast):**
- Skeletons now mirror first paint: `CardsPageSkeleton` = 6 stat cards + 2/3+1/3
  row; new `BoardPageSkeleton` for the Patients board default; finance chart has
  a `loading:` skeleton. No more skeleton→content layout jump.
- In-flight feedback: per-card status `<Select>` spinner + disable, patients
  search spinner, confirm-gated user role/disable changes.

**Interaction correctness:**
- Destructive actions now all confirm: reminder delete, instruction-image remove,
  user role change / disable (each with real `pending` state). The 4 hardcoded
  `ConfirmDialog pending={false}` callers (directory/payments/files/instructions)
  now await-then-close so the confirm button spins and double-clicks can't fire a
  second delete.
- Errors no longer land on a closed dialog: invite (users) and payment upsert
  surface failures via toast / keep-open instead of an unseen inline banner.
- De-duped feedback: `reminders-panel` dropped its inline error banner (toasts
  only); `csv-importer` keeps the persistent inline result, drops the toast.

**Navigation / wayfinding:**
- Shell: mobile top bar now shows a per-route page title and a search button
  (opens the palette via the new `openCommandPalette()` — replaces the old fake
  Ctrl+K dispatch). Sidebar nav got `aria-label`/`aria-current`. **Sign-out moved
  from the top bar into the sidebar user footer** (shows in desktop sidebar and
  mobile drawer). The mobile drawer is now **portaled to `document.body`** so it
  isn't trapped under `<main>` by the sticky header's `z-20` stacking context.
- Deep-linkable view state (was ephemeral `useState`): Patients **view mode**
  (`?view=`), patient-detail **tab + case** (`?tab=`,`?case=`), settings **tab**
  (`?tab=`).
- **Maximize a board column**: each Patients board column has a maximize button
  that opens a **local, same-URL screen-takeover** — a portaled overlay
  (`patients-view.tsx` + `createPortal`) that zooms open from the clicked column
  (`transform-origin` set to its centre) via the `animate-takeover` spring in
  `globals.css`; Esc / backdrop / close animate it out, focus is trapped
  (`useFocusTrap`), body scroll locked. It **fetches that status's patients on
  open** (`getPatientsByStatus` in `lib/actions/patients.ts`, ≤50), seeded
  instantly from the board's loaded cards so counts are accurate regardless of
  pagination. Dashboard status cards open it on landing via a throwaway
  `/patients?focus=<status>` param that's stripped immediately (settled URL stays
  clean `/patients`). `?status=` is now **only** the filters-panel filter, no
  longer tied to maximize. Drag-and-drop remains intentionally out of scope.

---

## Recent work — 2026-07-13 auth fix + cleanup

Auth "sometimes sent you to localhost" and was structurally messy. Root causes and
the overhaul:

- **Localhost redirect bug.** Email links were built from `window.location.origin`,
  so triggering a reset from localhost/a preview baked that origin into the emailed
  link. Fixed with `src/lib/site-url.ts` `getSiteURL()` (resolves
  `NEXT_PUBLIC_SITE_URL` → `NEXT_PUBLIC_VERCEL_URL` → browser origin → localhost).
  **`NEXT_PUBLIC_SITE_URL` must be set in Vercel Production** (= the deployed URL) or
  links inherit the request origin. Supabase dashboard **Site URL** must also be the
  prod URL, and the **Redirect URLs** allowlist must include `<prod>/**` +
  `http://localhost:3000/**`.
- **Server-side callback.** New `src/app/auth/confirm/route.ts` (GET) verifies the
  email token (`verifyOtp` with `token_hash`+`type`) or exchanges the PKCE `?code=`
  server-side, then redirects to a validated relative `next`. Replaces the old racy
  browser-SDK detection. The recovery email's `redirectTo` points here with
  `next=/reset-password/update`, so that page is reached **already authenticated**;
  `update-form.tsx` was simplified accordingly (no more `getSession()`/
  `onAuthStateChange` race, no magic `setTimeout`). The proxy exempts `/auth/confirm`
  and `/reset-password/update` from the "bounce authed users away" rule.
  Note: with Supabase's **default** email template (no custom SMTP), recovery uses the
  PKCE `?code=` path — works **same-browser only** (needs the verifier cookie). For
  cross-device, set up custom SMTP and edit the Reset Password template to the
  `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=…` form;
  the route already handles it.
- **Removed public `/signup`.** Anyone could self-create an active account on an
  internal CRM. Accounts now come only from the admin invite flow (`inviteUser`).
- **One sign-out path.** The sidebar hard-navigates to GET `/auth/signout`, which now
  clears both `turkcure_session_start` and `turkcure_intro`. No more divergent
  client-side signout.
- **Shared constants + server-owned session clock.** `src/lib/auth/cookies.ts` holds
  `SESSION_START_COOKIE`/`INTRO_COOKIE`/`MAX_SESSION_MS`. Forms no longer stamp the
  session cookie client-side (the proxy owns it); fixed the 30-day-cookie-vs-24h-cap
  mismatch.
- **Consistent errors.** `src/components/auth/auth-error.tsx` + `src/lib/auth/errors.ts`
  (`authErrorMessage` maps raw Supabase strings to friendly copy) replace the four
  copy-pasted banners. `/login?error=link_invalid` renders via `authErrorFromCode`.
- **Deduped bare client.** `createAnonClient()` in `supabase/server.ts` replaces the
  inline anon client in `account.ts`.

## Recent work — 2026-07-27 file categories, protocol number, PDF filename

Three small operational asks from live use.

**Patient file categories** — `supabase/migrations/0014_patient_file_categories.sql`
(⚠️ apply by hand):
- `patient_files.category` — `text not null default 'other'` + a named check
  constraint (`'reports' | 'passport' | 'other'`). Text-plus-check rather than a PG
  enum so the list can grow without a non-transactional `alter type`. Pre-existing
  rows land in `other`; forcing them into `reports` would assert what we don't know.
- Index `patient_files(patient_id, category, created_at desc)`.
- `FileCategory` + `FILE_CATEGORIES` (value/label/**hint**) in `src/lib/types.ts` —
  the order of that array is the render order of the sections.
- `files-tab.tsx` is now **grouped sections**, not one flat list: header + count,
  rows, and **a drop target per section** — so upload never has to ask for a
  category. Empty sections show their `hint` rather than collapsing, keeping the
  three targets in a stable position. Files are grouped in one `useMemo` pass. Each
  row carries a narrow `Select` that re-files it (optimistic move between groups);
  Reports/Passport accept `image/*,application/pdf`, Other stays open; the file
  input resets so the same file can be re-picked.

**Case protocol number** — `supabase/migrations/0015_case_protocol_number.sql`
(⚠️ apply by hand):
- `cases.protocol_number text not null default ''` + a **`pg_trgm` GIN** index (the
  palette does a leading-wildcard `ILIKE`, which a b-tree can't serve — same
  reasoning as the patient-name index in `0011`). Deliberately *not* partial on
  `<> ''`: the planner can't prove `ilike '%q%'` implies it, so the predicate would
  only make the index unusable.
- Field heads the case form in `case-tab.tsx` and is added to the `values` object in
  `onSaveCase` — **that object is the effective allowlist**, `upsertCase` passes
  `values` straight to Supabase.
- The case PDF's `ref` now prefers `protocol_number`, falling back to the case-id
  slice, so the cover footer and page meta read `Ref <protocol>` with no layout change.
- `globalSearch` gained a sixth parallel query over `cases.protocol_number`. A
  protocol hit deep-links to `?case=<id>` and **wins over the plain patient row** for
  the same patient — a numeric query can match both a phone and a protocol number.

**PDF download name** — `api/pdf/[caseId]/route.tsx` now downloads as `<Full Name>.pdf`
(was `turkcure-wof-<slug>.pdf`). Headers are Latin-1, so the real name goes in the RFC
5987 `filename*=UTF-8''…` and `filename=` keeps a stripped-ASCII fallback — this is
what makes `Ayşe Çelik.pdf` work instead of throwing the ByteString error that caused
past PDF 500s. The instruction PDF keeps its static name.

## Recent work — 2026-08-07 multi-currency payments, free quote labels, mobile pass

**Multi-currency payments** — `supabase/migrations/0016_payment_fx.sql` (applied 2026-08-07):
- A case is priced in one currency but patients sometimes pay in another. The form already
  accepted any currency while **every total silently dropped the mismatched row**:
  `finance_case_rows()` joined `coll.currency = c.currency`, the patient header chip filtered
  on it, and the case PDF's deposit query had an explicit `.eq("currency", …)`. Real cash
  existed in the DB and appeared nowhere.
- `payments.fx_rate numeric(18,8)` (multiplier to the **case** currency, frozen at booking
  time) + `payments.amount_case numeric(12,2)` (`round(amount * fx_rate, 2)`). `amount_case` is
  **stored, not derived**: a generated column can't reach `cases.currency`, and computing on
  read lets SQL, the optimistic client row and the PDF each round independently. A
  `check (abs(amount_case - amount * fx_rate) <= 0.01)` ties the pair together — the tolerance
  absorbs JS-vs-Postgres rounding; strict equality would fail sporadically on real amounts.
- Legacy off-currency rows were backfilled from the hand-maintained table in `lib/fx.ts`, not
  left at 1:1. `0011`'s `(case_id, direction, status, currency)` index became
  `(case_id, direction, status) include (amount_case)`.
- **Rounding rule, one place:** amount → 2dp, rate → 8dp, then the product → 2dp. Mirrored in
  `payments-tab.tsx`'s `round2` so the optimistic row matches the server.
- Live rates: **`src/lib/data/fx.ts`** (server-only) hits **frankfurter.app** — ECB reference
  rates, no key, open-source — behind `unstable_cache` (tag `"fx"`, 1h) with
  `cache: "no-store"` and a 2.5s `AbortSignal.timeout`. **The try/catch sits OUTSIDE the cached
  function** — inverted, one blip pins the fallback for an hour. This is the app's first
  outbound `fetch`. `src/lib/actions/fx.ts` `getLiveRate()` is the client bridge; it is called
  only from the open payment dialog, never on a render path. `src/lib/fx.ts` stays pure
  (a client component imports it) and now exports `FALLBACK_RATES_TO_USD`.
- `upsertCase` now **refuses to change `cases.currency`** while off-currency payments exist —
  their stored rates were computed against the old target and no check constraint can catch it.
- ⚠️ Applying `0016` **moved numbers**: previously-excluded payments now count.
- Known follow-up: the finance **"All"** mode is now the last hardcoded FX in the app (still the
  2026-07-09 table). Not broken, but the two mechanisms disagreeing is confusing.

**Free-form quote labels** — `supabase/migrations/0017_quote_item_kind_text.sql` (applied):
- `quote_items.kind` moved off the `quote_item_kind` enum to `text` (default `''`), same
  reasoning as `patient_files.category` in `0014` — **no check constraint**, arbitrary text is
  the point. The view `quote_items_public` had to be dropped and recreated around the type
  change. `QuoteItemKind` is now `string`.
- The Type field is a `ComboBox` in **`freeText`** mode over `KIND_SUGGESTIONS`; Description
  dropped its `required`. The ComboBox holds its value in React state, so `form.reset()` can't
  clear it — a `formKey` remounts it after each add. Blank labels render as `—` and the delete
  confirm falls back kind → price so it never says "Remove **** from the quote?".

**Mobile pass (390×844)** — driven in a real browser, not inferred from classes:
- **`scripts/mobile-audit.mjs`** + `playwright` (devDependency). Authenticates by minting a
  magic link with the service-role key in `.env.local` (no test user), then screenshots every
  route and overlay — **full-page plus one shot per scroll position**, because judging a phone
  layout from its first 844px is how below-the-fold breakage survives. It also reports pages
  that scroll horizontally and elements wider than the viewport, **skipping any element whose
  ancestor scrolls it on purpose** — otherwise every intentionally-wide table is a false
  positive. Output goes to gitignored `.mobile-audit/`.
- **Primitives (these lift every screen):** `Table` gained a `min-w` floor — without it
  `w-full` let an 8-column table compress into 390px instead of scrolling, wrapping every cell
  to three lines; this was the single largest source of "horrific". `Dialog` is now capped
  (`max-h` + internally scrolling body) so a tall form no longer takes its own title and
  buttons off screen. `TabBar` scrolls sideways instead of wrapping "Case & Quote" over three
  lines. `CardHeader` wraps. `Toaster` is inset on both sides. `PageHeader` stacks below `sm`.
  The date-picker calendar is wider with ~44px day cells on a phone.
- **Screens:** wide tables now *drop* low-value columns below `sm`/`md`/`lg` rather than
  clipping them (patients → Name/Status/Contact; payments → Counterparty/Amount/Status;
  finance → Patient/Revenue/Collected/Margin). Directory tables can't hide columns (the set is
  dynamic) so they truncate instead of wrapping. Finance stat cards are 2-up. Fixed-width
  toolbar selects are `w-full sm:w-NN`. The command palette no longer opens into the keyboard.
- **A real bug, not cosmetics:** the instruction-image remove button was
  `hidden group-hover:block` — **unreachable on touch**. Tap targets raised on the reminder
  done-toggle (via `before:-inset-3`), board chevrons, table checkboxes and the markdown
  toolbar.

## Recent work — 2026-08-07 "Add dates to reminders" replaces "Done"

`supabase/migrations/0018_reminder_types_schedule.sql` (applied 2026-08-07):
- Case reminders only ever covered **arrival, operation and the two aftercare check-ins**, so
  the hospital check-in/check-out and departure dates sat inert on the case form. Two new
  `reminder_type` values, `hospital` and `departure`, give them somewhere to live.
- `ALTER TYPE ... ADD VALUE` has been transaction-safe since PG12 (we're on 17.6) **provided
  the new value isn't used in the same transaction** — nothing in the file uses them, which is
  why they can share one migration despite the cautionary note in `0005`.
- `regenerateCaseReminders` now takes a `CaseSchedule` and drives off a single `plan` table of
  `[date, type, title, offset]` rows instead of five near-identical if-blocks, so adding a date
  column is a one-line change. It returns the count and still deletes only the **open,
  generated** types — hand-written follow-ups and anything already ticked off survive, so the
  action is safe to re-run.
- `completeCase` is **gone**; the patient-detail "Done" button is now **"Add dates to
  reminders"** (`syncCaseReminders`). Completing a case is the Status field on the case form,
  which is where it belonged — the Completed badge still shows.
- ⚠️ **`"use server"` modules may only export async functions.** `tsc --noEmit` does not catch
  a violation; the dev server and `npm run build` do. `CaseSchedule` / `CASE_SCHEDULE_COLUMNS`
  are deliberately module-private for this reason.
- `TYPE_META` in `reminders-panel.tsx` is a `Record<ReminderType, …>` **and** drives the type
  `<Select>` in the reminder dialog — adding a type there makes it hand-pickable too.
- Dashboard "Upcoming arrivals" needed no change: it reads `cases.arrival_date` directly, so a
  saved arrival date already appears there within the 14-day horizon.
- Reminder rows now wrap on a phone (title claims the line, badge + actions drop below) — with
  real content the single-row layout truncated the patient name to "Cherr…".

## Recent work — 2026-08-07 finance overhaul (true margin, R&P, periods, breakdowns, live FX)

The finance page was "just numbers": all-time quoted revenue/cost + collected, one
chart, one table. Outgoing payments (real payouts to providers) appeared in **zero**
finance figures. `supabase/migrations/0019_finance_overhaul.sql` (⚠️ apply by hand —
until applied, the new page degrades to zero cash/receivables figures, not a crash):

- **`finance_case_rows()` rewritten** (3rd time; sole caller `lib/data/finance.ts`).
  Existing columns byte-identical, appended: `paid_out` (outgoing paid, normalized
  `amount_case` — a `paid` CTE mirroring `coll`, index-only via 0016's include-index)
  plus `hospital_id/name`, `doctor_id/name`, `source`, `country` for breakdowns.
  `drop function` first — `create or replace` can't change a return shape.
- **New `finance_payment_rows()`**: one flat per-payment feed (with per-type
  counterparty-name joins; `counterparty_id` has no FK, dangling ids coalesce to `—`).
  The client derives the cash chart, period totals, receivables aging and payables
  grouping from this single list. THE LINE (in the migration comment): past ~5–10k
  rows, move aggregation server-side.
- **Semantics** (`finance-shared.tsx`): quoted metrics scope by case `month`; cash
  metrics (Collected/Paid out/Cash margin) by `paid_at`; receivables/payables are
  as-of-today balances and ignore the period filter (the Select disables on that
  tab). The two bases are never subtracted across. Planning cases are excluded from
  quoted metrics by default (toolbar checkbox), always included in cash. Period math
  is whole-calendar-month string comparison — no Date arithmetic, no TZ landmines.
- **UI**: `finance-view.tsx` is now a shell — toolbar (planning checkbox, period,
  currency, CSV) sharing one border-line row with a deep-linked `?tab=` TabBar
  (Overview / Receivables & Payables / Breakdowns). Overview: 4 cards with
  vs-previous-period deltas, Cash⇄Quoted segmented chart (always trailing 12
  months), per-case table with actual-margin-over-expected Margin cell. R&P: stats
  live *inside* their cards (`MiniStat`), receivable badge = Overdue/next-due/
  Unscheduled from open incoming rows. Breakdowns: dimension Select over
  operation/hospital/doctor/source/country.
- **Live FX in "All" mode**: `getUsdRates()` in `lib/data/fx.ts` re-bases the
  existing EUR snapshot to USD (rides the `"fx"` cache; try/catch stays outside).
  The 2026-07-09 hardcoded table is now only the offline fallback, and the page
  says so ("FX rates as of <date> (offline table)"). Closes the "last hardcoded FX"
  follow-up from 0016.
- `finance-chart.tsx` is series-driven (`{key,color}[]`) instead of hardcoded
  Revenue/Cost bars.
- **`scripts/finance-audit.mjs`**: finance-only Playwright sweep — every tab at
  390×844 + 1440×900, light + dark (forced via `localStorage.theme` — next-themes
  ignores `prefers-color-scheme` emulation once a stored choice exists), and it
  reports any element with a real vertical scrollbar plus **page micro-overflow**
  (content 1–60px taller than the viewport = a scrollbar for nothing; the Overview
  was +11px until the tab panels went `space-y-4 pt-3`).
- ⚠️ Windows/PS5.1 gotcha that bit this session: `Get-Content -Raw | Set-Content
  -Encoding utf8` **mojibakes BOM-less UTF-8 source files** (reads them as ANSI).
  Use the agent Edit/Write tools for source edits, never PowerShell regex.

## Recent work — 2026-08-12 additional costs, multi-case PDF, wordmark fix

Four asks from live use, all landing on the patient-facing PDF.

**Additional costs** — `supabase/migrations/0020_case_additional_costs.sql` (⚠️ apply by hand):
- `case_additional_costs` (`case_id`, `title`, `amount`, `sort_order`). **Deliberately not
  `quote_items`**: that table's `price` is summed into "Total package price" and *both* its
  `price` and `cost` feed `finance_case_rows()` (0019), so an extra landed there would silently
  move the patient's balance *and* reported margin. These rows must do neither — a separate
  table is the only way to keep both invariants without adding a filter to every consumer.
- RLS follows the ordinary staff-table convention from `0001` (authenticated read/insert/update,
  admin-only delete), **not** `quote_items`' admin-only rule — that exists "for cost safety" and
  there is no cost column here. So the actions use `createClient()`, not `createAdminClient()`.
- The editor sits under `QuoteEditor` in `case-tab.tsx` and has **no totals row**, on purpose: a
  subtotal invites reconciling it against the quote total, which is the confusion the separate
  table exists to prevent.
- On the PDF the block renders after Payment Information, is **omitted entirely when empty**, and
  carries a note that it is excluded from the package total — without that, a patient reading a
  total followed by more prices assumes the total includes them.

**Combined multi-case PDF** — `src/app/api/pdf/combined/route.tsx`:
- The 423-line inline document moved to **`src/lib/pdf/case-doc.tsx`**, split so patient-level
  blocks (`PatientInfoSection`, `CompanySection`, `ConfirmationBlock`) are separate from the
  per-case `CaseBody` — that split is what lets the combined document state them once.
- `GET /api/pdf/combined?cases=id1,id2` — a GET so the download stays a plain `<a download>`.
  Structure: a cover per case, then one flowing body. Sections are numbered `2.1`, `3.1`… via
  `CaseBody`'s `sectionPrefix`; `TableSection`'s `number` prop widened to `number | string`.
  Single-case keeps plain `1..7` (Company shifts 7→8 only when additional costs exist).
- **The same-patient assertion is load-bearing**: `loadCasesData` returns null unless every id
  resolves and they all share one `patient_id`. RLS gates access, but this is what stops a
  hand-crafted URL splicing two patients' cases under one "Prepared for" name.
- `.in()` neither preserves order nor errors on missing ids — hence the length check and the
  chronological re-sort. Cases load in a fixed number of round-trips regardless of count, with
  **one** `createSignedUrls` call for every image across every case.
- **Nothing is summed across cases.** Each case prints its own currency; `amount_case` values
  from different cases are in different units and are not addable (0016).
- Package Details is now the one section allowed to `wrap` — its bullet list grows with the
  quote, and a `wrap={false}` block taller than a page is **silently clipped** by react-pdf.
- The dialog (`combined-pdf-dialog.tsx`) routes a single selection to `/api/pdf/<id>`, so there
  is only ever one canonical single-case document.

**Both wordmarks rewritten** (`common.tsx`) — SVG → flex `<Text>`:
- `WordmarkGold` (cover) was visibly off-centre: two `<Text>` at hardcoded `x=0`/`x=49` in a
  fixed 132-unit viewBox, so `alignItems:"center"` centred the *box*, not the glyph run.
- Screenshotting the output then exposed a **pre-existing bug the fix predicted**: in `Wordmark`
  (blue, used by every `PdfHeader`) "Cure" fell outside the viewBox and was clipped — every page
  header in every PDF had been rendering just **"Turk"**. Flex Text self-sizes to the real
  advance width, so both centre correctly and survive the Helvetica fallback.
- "Cure"'s blue→cyan→green gradient is gone: react-pdf never rendered gradient fills on SVG text
  anyway (`WordmarkGold`'s own comment says so), so solid cyan is the honest version.

**"Medication included"** added to the Package Details bullets.

**Follow-up same day — delete case, one cover, and two react-pdf measurement bugs:**
- **`deleteCase`** (`lib/actions/cases.ts`) + a red "Delete case" button in the case-form footer,
  admin-only like every other delete. Every child table cascades from `cases` (0001, 0020) so one
  delete suffices. `patient-detail.tsx` clears `?case=` afterwards (`clearSelectedCase`) or the URL
  would point at a case that no longer exists.
- **The combined PDF is now ONE cover**, not one per case: `CaseCover` takes `others` and lists
  every treatment on the single cover, and a new **`CaseDivider`** (navy "TREATMENT n OF m" band,
  `break` so each case starts a fresh page) separates the cases in the body.
- ⚠️ **Two react-pdf layout traps, both found by rasterizing the output and reading glyph
  coordinates out of the PDF — neither shows up in a build:**
  1. **A large `<Text>` followed by a sibling `<Text>` collides.** A 19pt title put the next
     baseline only 9.7pt below it. `lineHeight`, a fixed-height wrapper View, and `marginBottom`
     **all failed**. The fix is to make them **one `<Text>` with nested `<Text>` children and a
     `\n`**, so the text engine does the line breaking.
  2. **`flexWrap: "wrap"` containers are under-measured** — react-pdf reports roughly one row's
     height, so the Package Details bullets overflowed their card and collided with the section
     below. This was **pre-existing** in the single-case PDF, just not obvious with fewer bullets.
     Fixed by splitting the list into **two explicit non-wrapping columns**.
  Rule of thumb: in react-pdf, prefer one `<Text>` over sibling Texts for stacked type, and never
  rely on the measured height of a wrapped flex container.
- **`Select` now focuses its search box on open** (`ui/input.tsx`). It always intended to — the
  `.focus()` call was there — but it ran in the same effect that sets `open`, before the portaled
  popover exists, so it silently did nothing and the field had to be clicked twice before you
  could type. Now uses the same double-rAF as `ComboBox`. Anything focused inside a
  `PopoverLayer` needs this; it is the second time the trap has been hit.

Verified by rendering the real routes against live data (Playwright + the magic-link trick from
`scripts/mobile-audit.mjs`) and rasterizing the PDFs with pdfjs to actually look at them: single
case = 4 pages with sections 1-7 unchanged, combined 2-case = 6 pages with Patient Information
once, `2.1`-`2.5` / `3.1`-`3.5`, Company as 4 and one signature block. Guard rails exercised:
two-patient ids → 404, empty param → 400, duplicate id → rendered once.

## Recent work — 2026-08-14 editable case document (live edit before download)

The case PDF was generated and immutable, so per-patient wording changes meant editing the case
record or not making them. Modelled on KaguSoftware/Real-Estate-Manager's document editor.

**The architecture, which is the part worth understanding:** a pure-JSON contract module sits
between two renderers that never import each other. `src/lib/documents/blocks.ts` defines the node
vocabulary (**no Tiptap, no react-pdf imports** — that discipline is what keeps them independent);
a Tiptap editor renders it as React NodeViews, and `src/lib/pdf/editorDoc.tsx` renders the *same*
JSON through **the primitives the generated PDF already uses** (`TableSection`, `TRow`,
`CoverPage`). react-pdf is kept, not replaced.

- **`0021_case_documents.sql`** (applied 2026-08-14, along with `0020` which turned out to be
  already applied): `content` (the editable doc) + `source_data` (frozen seed snapshot, what
  "reset to template" and corrupt-draft recovery rebuild from). A **DB trigger** enforces the
  finalized lock, not the UI — this file goes to patients and hospitals.
- **`buildCaseDoc.ts`** seeds the document from `loadCaseData`, mirroring `CaseBody`'s section
  order exactly. Money/dates are stored **pre-formatted** — the document is a document, not a data
  model, and nothing ever parses them back (the reference pays for that choice with a 216-line
  reverse parser; TurkCure deliberately has none).
- **Section numbering is a running counter**, not hardcoded: Additional Costs is omitted when
  empty, which shifts Company 7→8.
- **`COMPANY` moved to `src/lib/pdf/company.ts`** — `common.tsx` imports `node:fs` for the fonts,
  so anything client-reachable that pulls from it breaks the build.
- **The preview renders on the SERVER** (`POST /api/pdf/draft/<caseId>`), unlike the reference's
  client-side `BlobProvider`. The fonts are registered from the filesystem, so react-pdf cannot run
  in the browser at all. The upside: the preview *is* the download, byte for byte.
- **Tab toggle, not a split pane** — the render is a round trip, so it happens once per switch.
- ⚠️ **`getJSON()` must be deep-cloned before crossing a server-action boundary.** Tiptap returns
  ProseMirror's own node objects; Next's serializer drops what it doesn't recognise and **every
  `attrs` arrives as `{}`** — a document that saves with its structure intact and all of its
  content gone. Found only by inspecting the saved row; the build and the UI both looked fine.
  `JSON.parse(JSON.stringify(doc))` in `currentJson()` and in the editor's `getJSON`.
- ⚠️ **Tiptap fires `onUpdate` while loading content** (trailing paragraph, schema defaults), so a
  freshly opened document showed "Unsaved changes". Gated behind an `onCreate` + rAF flag.
- The editor schema is **narrowed to exactly what the mapper renders** (`italic: false`,
  `link: false`, table cells `content: "paragraph+"`) — anything else would show in the editor and
  vanish from the PDF.
- **`npm test`** (vitest, 6 tests) now exists — it renders through the real react-pdf renderer and
  guards the resilience contract (unknown node → plain text, malformed node → placeholder, never
  throw) and the fragment-not-View rule that makes `pageBreak` work.
- ⚠️ **The document sheet must NOT use app theme tokens.** It is a white page in both themes, but
  `--color-primary-soft`, `text-muted` and `hover:text-foreground` all invert in dark mode — so a
  focused field painted dark-navy under dark text (invisible typing) and "Add row" went white on
  white on hover. `editor.css` defines literal `--doc-focus`, `--doc-focus-dark`, `--doc-ink`,
  `--doc-muted`, `--doc-muted-light`, `--doc-hover-bg` for everything on the sheet. Verified by
  reading computed styles in both themes, not by eye.
- The sheet shows **approximate page-break guides** (A4 content flow = 842−48−76pt, scaled by
  794/595 px-per-pt), capped at 40, recomputed by a `ResizeObserver`, with a note pointing at PDF
  Preview for the exact layout.

Verified end to end in a browser: seeded document renders **byte-identical to the generated PDF**
(all 4 pages, every text item at the same y), an edit survives save → reload → into the rendered
PDF, the preview blob is a real 34KB PDF, and the dirty flag stays clean on load.

## Recent work — 2026-08-19 money-UX rebuild

The quote / additional-costs / payments experience was rebuilt around one
**Money tab** per case. Context: three near-identical "table + add form" cards
across two tabs, nothing editable in place (typo = delete + re-add, losing the
row's position), a payment dialog that closed before its save resolved, and a
finance overview mixing quoted-basis and cash-basis figures unlabeled.

**Tabs**: patient detail is now `Case | Money | Instructions | Files`. The quote
and extras moved out of "Case & Quote" (now just **Case**, full-width form) and
merged with the old Payments tab into **Money**. Old `?tab=Case%20%26%20Quote` /
`?tab=Payments` deep links are remapped via `LEGACY_TABS` in `patient-detail.tsx`.
The header money chip gained a muted `+ €X extras` suffix (extras stay excluded
from quoted/due on purpose — same basis as the PDF).

**Money tab** (`src/components/patients/money/`): `money-tab.tsx` owns all three
optimistic lists (quote items / extras / payments) so `money-summary.tsx` (Quoted
· Paid · Outstanding · Additional costs "billed separately" · admin Margin)
reflects in-flight edits; commits are serialized through a promise queue because
`useOptimisticList`'s snapshot rollback assumes non-overlapping mutations.
`quote-table.tsx` / `additional-costs-table.tsx` are spreadsheet-style: every
cell is an `EditableCell` (`src/components/ui/editable-cell.tsx` — click to
edit, Enter/Tab/blur commit, Esc cancels, native `<datalist>` for suggestions —
deliberately not ComboBox-in-cell), rows reorder with arrow buttons (DnD stays
out of scope) via new `reorderQuoteItems`/`reorderAdditionalCosts` actions, and
the last row is always a **ghost row** that inserts once it has a price/amount.
`payment-dialog.tsx` stays open until the save resolves (inline errors), stages
the receipt file locally and uploads only on Save (cancel leaves no orphan;
replaced receipts are removed after a successful save), and warns when a manual
FX rate is >3× off the fetched live rate. `payments-section.tsx` adds explicit
per-row edit buttons. `payments-tab.tsx` was deleted; `case-tab.tsx` shrank to
the case form alone.

**Migration `0022_money_ux.sql`** (applied 2026-08-20): relaxes the
`case_additional_costs` DELETE policy to any authenticated user — before this,
agent deletes silently no-opped (cookie client vs 0020's admin-only policy) while
the optimistic UI reported success. Decision recorded in the action comments:
quote lines and extras are *drafting data*, agent-deletable by design; deletes of
payments/cases stay admin-only. Also normalizes legacy `'partial'` payment rows
(status has long been derived paid/pending). `upsertQuoteItem`/
`upsertAdditionalCost` now validate amounts (finite, ≥ 0).

**PDF — the one permitted output change**: the "Deposit paid" line now shows the
original currency when a deposit was paid off-currency — `500 Euros (= 540 USD)`
— via a preformatted `CaseDocData.depositDisplay` computed once in
`buildCaseData` (case-doc.tsx) and consumed verbatim by both `CaseBody` and
`buildCaseDoc.ts`, so the PDF and the editor seed cannot drift. Same-currency
cases print exactly as before; balance math is untouched (still Σ `amount_case`).
`loadCasesData` now also selects `amount, currency` from payments. Tests in
`editorDoc.test.tsx` pin both paths.

**2026-08-20 cleanup pass** (after first live use): the ghost rows read as
broken data and the 2/3+1/3 layout starved the extras card, so — adding now goes
through focused **"Add item" / "Add cost" dialogs** (with an "Add & another"
button for entering a whole quote in one sitting); inline click-to-edit stays
for quick fixes but quieter (no cell borders; hover wash only); row controls
(reorder/delete) appear on row hover (always visible below `md`, no hover
there); the sections stack **full width** (Summary → Quote → Extras →
Payments); the summary is four cards with the admin cost/margin as a sub-line
under Quoted. Also: **the app shell no longer scrolls the window** — the shell
is `h-dvh overflow-hidden` and `MainScroller` (`src/components/shell/`) owns
scrolling below the topbar, because the window scrollbar ran the full viewport
height through the sticky topbar's edge. MainScroller resets scroll on pathname
change (Next's window scroll-to-top is a no-op now); `?tab=`-style param
updates keep their position. Body-overflow scroll locks in overlays are now
inert but harmless — a fixed overlay over a non-scrolling body has nothing to
chain to.

**Finance overview**: the four stat cards are split into two labeled groups —
"Quoted — by case month" (Revenue + Expected margin) and "Cash — by paid date"
(Collected, Paid out, Cash margin) — so the two bases can't be read as one; the
chart title now says "· trailing 12 months" (it deliberately ignores the Period
select).

## Recent work — 2026-08-20 form drafts + UX sweep (quick wins, reminders, structural)

Driven by client feedback ("unsaved form input should survive navigation, cache it 30
minutes") plus a full UX audit. Four phases, all built green and browser-verified via
Playwright scripts (19 draft checks + a Phase-2/3/4 sweep, all passing).

**Form drafts (the client ask)** — `src/lib/form-drafts.ts` (storage: `tc:draft:<key>`,
TTL 30 min, purge-on-read/load, versioned payload, best-effort try/catch) +
`src/lib/use-form-draft.ts` (the hook) + `ui/draft-banner.tsx`:
- **Capture**: debounced `new FormData(form)` snapshot after any interaction. ComboBox/
  Select/DatePicker commit into named hidden inputs so the snapshot needs **no changes to
  the input primitives** — but their option clicks land in **portaled popovers outside the
  form**, so the click/keyup listeners sit on `document`, filtered to the form or any
  `[data-popover-layer]`. A **final snapshot runs in the ref-detach on unmount**, which is
  what makes tab switches / dialog closes / case switches lossless without touching
  `Dialog` or the tab shell.
- **Restore is silent** (Parsa's choice): fields come back pre-filled; a banner offers
  Discard. Restore happens in a **mount effect + `formKey` remount**, never in the first
  render — the case form is SSR'd and a synchronous localStorage read would mismatch
  hydration. Every field reads `draft.value("name") ?? serverValue`; controlled state goes
  through `onRestore`/`onDiscard`. ⚠️ **Non-component exports of a "use client" module
  arrive in RSC as client-reference proxies** — `HORIZON_OPTIONS.includes` threw until the
  const moved to plain `dashboard/horizon.ts`. Same trap applies to anything a server page
  imports from a client file.
- Snapshot rules: an attachment that restored a draft always rewrites it (refreshes TTL);
  a pristine one writes only when differing from its mount baseline and clears when the
  user types-then-undoes. `clear()` (successful save / explicit Cancel) resets the baseline
  so post-save editing keeps capturing; `discard()` disarms before its remount so the
  outgoing form can't re-write the draft. Late-mounting fields (the lazy markdown editor)
  adopt their first-seen value into the baseline.
- **Integrated**: case form (`case:<id>` / `case:new:<patientId>`), patient dialog
  (`patient:<id|new>`, DOB via callbacks; body moved into a per-open inner component —
  **Dialog unmounts children, so any form whose hook must re-read per open needs the hook
  in a child of Dialog**, same restructure in directory-manager/quote/extras dialogs),
  payment dialog (provider/currency/fx ride `extra`; staged File + receipt pointer never
  cached), directory rows incl. the Tiptap template body, reminder dialog, quote/extras
  add dialogs (cleared on every successful add so "Add & another" stays blank). Excluded
  by design: auth/invite (credentials), csv-importer, files, EditableCell, the document
  editor (has a server draft), settings profile (only cacheable field is the display name).
  Esc/backdrop keep the draft; **Cancel is the explicit discard**. PII note: drafts hold
  patient data in localStorage bounded by the TTL; sign-out (hard GET) can't clear them.
- **Dirty-close confirm on Dialog deliberately NOT built** — drafts make accidental
  discard recoverable; a confirm would tax every intentional close.

**Quick wins**: patient email/phone are real `mailto:`/`tel:` links (detail header, table
Contact cell, board cards + WhatsApp chip); **duplicate-patient warning** on create
(`findDuplicatePatients` — email case-insensitive, phone by digit suffix, compared in JS
over a bounded fetch; advisory, never blocks); palette directory hits land **pre-filtered**
(`/hospitals?q=<name>&t=doctors` — `&t=` because that page hosts two managers; the manager
adopts `?q=` via the adjust-during-render pattern); the cron's `payment:<uuid>` marker is
stripped from reminder rows (regex at render; the column keeps it for dedupe); `(app)/error.tsx`
no longer prints raw Postgres text (digest code instead) + new root `global-error.tsx` and
app-wide `not-found.tsx`; finance CSV got the UTF-8 BOM (Excel/Turkish names); board/table
view mode persists in `?view=`; dead `"partial"` removed from `PaymentStatus` + tone map.

**Reminders & visibility**: `ReminderForm`/`TYPE_META`/`toLocalInput` extracted to
`src/components/reminders/reminder-form.tsx`. Dashboard panel: **Mine | Everyone**
toggle (Mine default; unassigned rows stay visible under Mine), assignee shown in Everyone
mode + "Unassigned" flagged always, **snooze menu** (1h / tomorrow 9:00 / next week) replaces
the fixed +1 day, overdue clock re-evaluates every minute (was frozen at mount). **Dashboard
horizon is configurable and filters LOCALLY** (Parsa's follow-up, same day): the server
fetches one fixed 90-day window and `dashboard-content.tsx` (client, owns everything below
the topbar) filters reminders/arrivals/payments by the selected 7–90 days — switching is
instant, no server round trip; the choice persists in `localStorage["tc:dashboard-days"]`
(adopted in an effect — the component is SSR'd, a first-render read would mismatch
hydration). A "+N more due beyond X days" line keeps far-future reminders from being
silently invisible. The first cut used `?days=` + server refetch, and also added a
**patient-page reminders card — both reverted on Parsa's feedback** ("reminders everywhere
in the patients page — get rid of it"); reminders are dashboard-only again by design.

**Structural**: board column headers show **true per-status totals** (`patient_status_counts`
RPC; falls back to page counts while filters/search narrow the set); patients table got
**server-side sorting** (`?sort=name|status|created` + `?dir=`, clickable headers, stable
`created_at` tiebreaker, default kept clean-URL); files tab: **in-app preview** (images
`<img>`, PDFs `<iframe>`, signed URL in a Dialog; non-renderable types fall back to
download), **25 MB upload cap**, and rows now show the uploader's name (+ `uploaded_by`
added to the `PatientFile` type — column existed since 0001, was never displayed);
**status nudge chips** on the patient header (case completed → "move to Treated?", paid
incoming payment on a lead → "move to Booked?") — one-click suggestions, dismissible,
never automatic.

Deferred to next sessions (agreed plan, see the 2026-08-20 plan file): timestamped
patient notes (`patient_notes` migration), finance-table sorting, reminder notifications.

## Recent work — 2026-08-20 multi-tenant SaaS conversion (organizations, RLS, branding)

The single-company tool became a multi-tenant product in one pass. Decisions
locked with Parsa: medical-tourism vertical (domain unchanged), owner-created
orgs (no public signup; super-admin = `parsaa.mansourii@gmail.com`), no billing
yet (`organizations.plan` placeholder), branding = PDFs + app accent. Platform
surfaces (login/reset/tab title) stay "TurkCure" for now — naming the platform
itself is an open question.

**Migrations `0023`–`0025`** (written this session; apply order matters — see
the runbook in `0023`'s header):
- **0023_organizations.sql** — `organizations` (slug, plan, active + branding
  columns: logo_url, company/whatsapp/website/url/location/address/tagline,
  `brand_primary`/`pdf_cover_bg`/`pdf_cover_accent` with hex checks, TurkCure
  backfilled from the old `COMPANY` constant); `org_id` on all 17 tenant tables
  (backfill → not null → `default auth_org_id()`); `auth_org_id()` = JWT
  app_metadata claim with a COALESCE profiles fallback (the fallback doubles as
  the column default's data source and covers pre-backfill tokens);
  `set_org_from_parent()` BEFORE INSERT triggers on the 8 child tables (keeps
  service-role inserts correct); **composite FKs `(fk, org_id)` → parent
  `(id, org_id)`** across the whole graph (set-null FKs use the PG15
  column-list form); per-org uniques on countries/operation_types; index
  rework (org-leading hot composites; `payments(due_date)` stays global for
  the cron; new partial `reminders(note) where type='payment'`);
  `handle_new_user()` now reads role+org from **raw_app_meta_data** (server-set
  only — the old user_metadata role was forgeable) and rejects org-less users;
  `profiles.is_super`; `seed_org_defaults(p_org)` (21 countries / 17 op types /
  3 genericized templates) for new orgs.
- **0024_org_rls.sql** — every policy rewritten to
  `org_id = (select auth_org_id())` (+ `with check` on all writes, so a
  forgotten stamp fails loudly); role-specific deletes preserved (payments
  admin-only, reminders owner-or-admin, extras any-staff). **quote_items:**
  org-scoped SELECT for all staff + **column-level grants that revoke `cost`**
  — this FIXES a real bug (agents got zero quote rows in case PDFs because
  `quote_items_public` is security_invoker over an admin-only table) and makes
  cost DB-enforced. Finance RPCs dropped/recreated as
  `finance_case_rows(p_org)` / `finance_payment_rows(p_org)` with org filters
  inside the CTEs (SECURITY DEFINER + execute-revoked: the parameter IS the
  boundary).
- **0025_storage_org.sql** — storage policies pin `(storage.foldername(name))[1]`
  to the caller's org for patient-files/receipts (+ instruction-images writes);
  **adds the missing UPDATE policy** (upsert issues UPDATE; none existed) and
  relaxes delete to org+(admin OR owner) — fixes 4 silently-no-opping browser
  deletes that orphaned receipts/files. New public `org-assets` bucket for
  logos (service-role writes, like avatars).

**Rollout runbook** (state 2026-08-20: code done+green, **migrations NOT yet
applied — `supabase db push` was classifier-blocked; Parsa runs it**):
apply 0023-0025 (`npx supabase db push --linked`) → `node
scripts/backfill-org-claims.mjs` (stamps app_metadata.org_id on existing
users) → `node scripts/migrate-storage-org-prefix.mjs` (moves objects under
the org prefix + rewrites DB paths and embedded body_md URLs) → `node
scripts/org-isolation-audit.mjs` (creates a disposable "Audit Clinic" org and
asserts real-JWT isolation + storage fencing + the agent-quote fix) → deploy.
Verify `select count(*) from profiles where is_super` = 1 (the email match is
a no-op if that auth user doesn't exist yet).

**Code — tenancy core:**
- `requireOrg()` / `requireSuperAdmin()` in `supabase/server.ts`; `Profile` +=
  `org_id`, `is_super`; new `Organization` type.
- **Per-org cache factories** (the pattern for any future cached read):
  `(orgId) => unstable_cache(fn, ["key", orgId], { tags: ["tag:" + orgId] })`
  in `lib/data/directory.ts`, `finance.ts`, and new `lib/data/org.ts`
  (`getOrganization` cached under `org:<id>`, plus `getOrg()`). All admin-client
  queries inside carry explicit `.eq("org_id", …)`. Only 3 pages call these
  (patients, patients/[id], finance) and now pass `profile.org_id`.
- Actions: `revalidateCase(patientId, orgId)` raises `finance:<org>`; the 6
  service-role quote-item sites stamp/filter org (+ `.select("id")` loud-fail
  on delete); `inviteUser` sends `app_metadata: { org_id, role }`;
  `setUserActive`/`setUserRole` org-fence their admin-client updates (and
  setUserRole's missing directories revalidation is fixed); `upsertPayment`
  verifies the counterparty exists in-org (counterparty_id has no FK). New
  `lib/actions/orgs.ts` (createOrganization with rollback-on-failure +
  setOrganizationActive, both requireSuperAdmin) and `lib/actions/
  org-branding.ts` (updateOrgBranding — org id ALWAYS from the caller's
  profile, hex + cover-luminance ≤0.35 guards; updateOrgLogo/removeOrgLogo,
  PNG/JPG only because react-pdf can't decode WebP/SVG).
- Cron: CRON_SECRET-unset guard ("Bearer undefined" was accepted); the sweep
  stamps `org_id` from the payment row and chunks the marker dedupe (200/req).
- Browser uploads: `lib/supabase/client-org.ts` `getOrgId()` (claim fast path,
  one profile-read fallback) prefixes all four upload paths.

**Code — branding pipeline:**
- New pure `lib/branding/color.ts` (mix/lighten/darken/rgba/luminance) — the
  ONE derivation source for PDF theme, app accent, and settings preview.
- New client-safe `lib/pdf/theme.ts`: `PdfTheme` + `DEFAULT_PDF_THEME` (today's
  literal hexes + COMPANY + mark `{text:"TurkCure", splitAt:4}`),
  `orgToPdfTheme()` with the **defaults-are-literal rule** — a family is
  derived only when its base column differs from the shipped default, so an
  untouched org renders byte-identically (proven: rasterized pixel-compare,
  `renderBaseline.test.tsx` + `scripts/pdf-compare.mjs`). `orgToDocVars()`
  feeds the editor sheet's `--doc-*` (unifies the drifted editor.css copy).
- `common.tsx`: `makePdfStyles(theme)` (Map-cached) replaces the module
  StyleSheet; **one `Mark` component** replaces Wordmark/WordmarkGold (logo
  `<Image>` in a fixed 120×30 contain box, else text mark with a generalized
  CamelCase two-tone split); PdfFooter reads theme.company and skips empty
  lines; dead NAVY_DEEP/Section/KV removed.
- ⚠️ **React context does NOT exist in route handlers** — Next bundles them
  under the `react-server` condition, whose React has no
  createContext/useContext (build error: "createContext is not a function").
  The theme therefore travels via a module-scoped `currentCtx` +
  **`renderThemedPdf(ctx, element)`** in common.tsx; safe because react-pdf
  mounts on a synchronous legacy root, so every component (and every
  `usePdfTheme()` read) runs before the first await. All 4 PDF routes use it;
  `usePdfTheme()` keeps the hook-like read API.
- `buildCaseDoc(data, patient, company)` — third param REQUIRED (client-side
  rebuilds get it via `sourceData.company`; colors never enter document JSON).
  Saved/finalized documents keep their seeded strings after a rebrand — by
  design; module-rendered chrome (footer, mark, colors) follows the current
  theme. `CaseDocEditor` gained `docVars` (inline literal hexes; the sheet
  stays app-token-free).
- App accent: `shell/org-accent-style.tsx` emits a `<style>` tag (light +
  `.dark` sets — inline style can't express `.dark`), only when the personal
  `accent_theme === "default"` (relabeled **"Company colors"**) and the org
  color differs from the default — so the app's own blue (#2563eb ≠ PDF
  #1d59d6) is untouched until a company actually picks a color.
  `shell/org-context.tsx` (`OrgProvider`/`useOrg`/`OrgBrand`) supplies the
  brand slot (sidebar/topbar/drawer/intro) and client copy ("patient pays
  {org}", CSV filename via new `slugify` in lib/utils).
- Settings gained an **Organization** tab (admin): logo card, identity +
  documents form (form-draft `org:<id>`), 3 color pickers with derived-shade
  chips + mini cover preview. `Field` gained a `hint` prop.
- **/admin** (super only, finance-page gate pattern): orgs table + "New
  organization" dialog → createOrganization (insert → seed → first admin via
  app_metadata; org row rolled back if user creation fails). Sidebar/topbar
  show a "Platform" nav section for is_super.

**Tests:** vitest is now 15 tests (editorDoc 9 incl. an org-identity seed
test, theme 4, color 3 — plus the env-gated renderBaseline harness). The
pixel gate: `PDF_BASELINE_OUT=… npx vitest run renderBaseline` before/after +
`node scripts/pdf-compare.mjs` — after the whole refactor, only the 2 intended
string changes differ (confirmation now says the full company name; the cover
footer prints the website field's casing).

**2026-08-21 rollout + follow-ups (all APPLIED and verified live):**
- Migrations 0023–0026 applied (`db push` run by Parsa — the assistant's
  permission classifier blocks that command; it also blocks reading the CLI's
  vault token, so Management-API workarounds are off the table too). Claims
  backfill + storage org-prefix migration run; `select count(*) from profiles
  where is_super` = 1 (**parsaxavier@gmail.com** — `parsaa.mansourii@gmail.com`
  has no auth user yet, so 0023's seed for it was a no-op; flag it after that
  account exists).
- **0026_resilient_user_provisioning.sql** — 0023's handle_new_user RAISE
  bricked ALL user creation (an exception in an AFTER INSERT trigger on
  auth.users = opaque GoTrue 500 "{}"; and custom app_metadata can land in a
  follow-up UPDATE on this GoTrue version, so even correct callers hit it).
  Now: insert-if-org + a metadata-guarded AFTER UPDATE trigger that provisions
  the profile when the org claim arrives; org-less users simply get no profile
  (the layout treats that as signed-out). Never RAISE from auth.users triggers.
- **`deleteOrganization`** (Parsa's ask): super-only full workspace purge —
  member auth users first (profiles cascade), then patients (case graph
  cascades), then org-scoped leftovers in dependency order, then the org row,
  then best-effort storage-prefix cleanup. Own-org deletion refused (and the
  button hidden). The org_id FKs stay NO ACTION deliberately so a stray row
  delete can never vaporize a company. Danger button + explicit ConfirmDialog
  in /admin.
- `scripts/org-isolation-audit.mjs` passed 18/18 (real-JWT isolation, seeds,
  storage fencing, cost column-denial, per-org finance) and now leaves its
  disposable org disabled. Browser-verified on live data: TurkCure shell brand
  + Platform nav, /admin (incl. two orgs Parsa created by hand — slug -2
  collision handling works), org-accent `--primary` resolving to a second
  org's hex, org-named intro splash, case PDF pixel-faithful (4 pages,
  navy/gold cover, org tagline/footer), and the delete click-through purging
  Audit Clinic completely (3 orgs × 21 countries = 63 after).
- ⚠️ Dev-server gotcha hit during verification: `unstable_cache` persists in
  `.next/cache` ACROSS restarts — after applying migrations, a stale cached
  profile row (no org_id) made the layout sign everyone out until `.next` was
  cleared. If post-migration behavior looks impossible, clear `.next` first.

## Recent work — 2026-08-21 bulletproofing pass (audit + fixes)

Three parallel audits (tenancy/security, data correctness, resilience) swept the
whole app. **Tenancy came back clean** — every service-role call site org-fenced,
RLS/with-check complete, storage pinned, no cross-org leak. The fixes landed on
money correctness, silent failures and cache invalidation:

- **Currency-change guard hole closed** (`cases.ts`): the block counted
  `.neq(currency, new)` which *excluded* payments already in the new currency
  with `fx_rate ≠ 1` — exactly the rows the change corrupts. Now
  `.or(currency.neq…, fx_rate.neq.1)`, with the currency whitelisted first
  (it's spliced into a PostgREST filter).
- **Finance RPC errors no longer memoized as €0**: `data/finance.ts` throws
  inside the cached fn (fx.ts stance) instead of caching `[]` for 5 minutes.
- **`regenerateCaseReminders` can't silently wipe a schedule**: delete/insert
  errors propagate, and `upsertCase` now re-reads the schedule from the written
  row (like `syncCaseReminders`) instead of trusting client `values`.
- **`importPatients` dedupe injection fixed**: two `.in()` queries (supabase-js
  quotes arrays) replace the hand-concatenated `.or("email.in.(…)")`; errors
  checked so a failed dedupe can't insert duplicates while reporting skipped: 0.
- **Payment↔patient/case linkage enforced**: the case read fences on
  `patient_id`, the write uses the validated caseId (update adds
  `.eq("case_id")`), and `deletePayment` verifies ownership via a
  `cases!inner` join first.
- **Zero-row-guard sweep**: every update/delete that could silently no-op now
  does `.select("id")` + empty-is-error (cases update, instructions,
  additional costs, reminders toggle, patients update/delete/status, payments
  delete, directory delete, case-document finalize/reset — reset on a
  finalized doc used to toast success over an untouched row). Editor
  finalize also aborts when the preceding save failed.
- **Cache-invalidation misses**: patient update/bulk → `finance:<org>` +
  `/dashboard`; directory writes → `finance:<org>` (denormalized names);
  `deleteOrganization` → `directories:<id>` + `finance:<id>` + avatar sweep;
  accent theme → layout revalidate; `revalidateCase` → `/finance`.
- **Cron sweep**: returns `{inserted, scanned, truncated, errors}` (route 500s
  on failure instead of `{ok:true}` always), explicit oldest-first
  `.limit(1000)` with a THE-LINE warning, marker-lookup errors abort (a failed
  chunk used to cause duplicate reminders), timing-safe CRON_SECRET compare.
  **`0027_unique_payment_marker.sql`** (⚠️ apply by hand) makes the
  `payment:<id>` marker index UNIQUE (dedupes existing rows first).
- **PDF routes**: all four now enforce `org.active` (route handlers bypass the
  layout's suspension redirect); `withSafeLogo()` in common.tsx pre-fetches the
  logo with a 3s timeout and degrades to the text mark — a dead `logo_url`
  used to 500 every PDF in the org; `signImages` and the instruction route
  fail loudly on signing errors instead of rendering imageless documents.
- **Uploads**: receipt + instruction images get the 25 MB cap and MIME checks
  (`accept=` is a hint, not validation); files-tab deletes the row before the
  object (old order left rows pointing at deleted objects — same fix in
  instruction image remove) and sweeps the object when the row insert fails.
- **Money-tab races**: reorders compute inside `optimistic(prev)` (two fast
  clicks compose instead of the second clobbering the first) and payments
  mutations ride the same `serialize` queue as the other two lists.
  **`0028_atomic_reorder.sql`** (⚠️ apply by hand) adds atomic reorder RPCs
  (quote_items can't upsert — NOT NULL description); the actions fall back to
  the old per-row batch until it's applied (code 42883/PGRST202 detection).
- **One rounding source**: `round2`/`round8`/`toCaseAmount` exported from
  `lib/fx.ts`; upsertPayment, payment-dialog and payments-section all import
  it (three drifting copies before). Amount capped at numeric(12,2)'s range
  with a friendly error. `upsertReminder` now whitelists fields + type (no
  more raw pass-through of `done_at`/anything). `monthLabel` formats from the
  string (the Date round-trip showed "Jul" for "2026-08" west of UTC);
  `?page=` clamped/floored.
- **Tests**: vitest now 22 (+ fx rounding contract incl. the DB-tolerance
  property, `pdfFilenameHeaders` non-ASCII regression, `monthLabel`).

Verified: `npm run build` green, `npm test` 22/22, and
`scripts/org-isolation-audit.mjs` fully passing against live data. Migrations
0027/0028 are **written, not applied** — the app degrades gracefully until
`npx supabase db push --linked` runs.

## Recent work — 2026-08-21 reminders fix (dates, regeneration, cron, panel)

Parsa reported "dates are wrong / the whole reminders system is weird". Root
cause of the date class: every date-derived `due_at` was built with
`new Date("YYYY-MM-DD")` → **UTC midnight** — 03:00 in Istanbul, previous day
for viewers west of UTC, and "Overdue" from 3am of the event day.

- **New `src/lib/dates.ts`** — the one source for reminder-time semantics:
  `dueAtBusinessHour()` ("YYYY-MM-DD" → `T09:00:00+03:00`; Turkey has no DST
  since 2016, so the fixed offset is exact forever), `parseDateOnly()` (local-
  midnight parse for display), `istanbulToday()`, and `isReminderOverdue()` —
  a due_at at exactly 09:00 TRT is date-derived and goes overdue only after
  **end of that Istanbul day**; any other time was hand-picked and goes red on
  the minute. Used by `cases.ts`, `overdue.ts`, `utils.ts` `formatDate` (date-
  only strings now parse locally, agreeing with the DatePicker) and the panel.
  Tested (`src/lib/dates.test.ts`, vitest now 30).
- **Regeneration is no longer destructive**: `regenerateCaseReminders` is
  **diff-based** (match open generated rows by `(type, title)`; update moved
  slots, delete vanished ones, insert new — no more delete-all-then-insert
  window), returns early on an empty schedule (clearing dates + "Add dates to
  reminders" no longer wipes rows while toasting "nothing to add"), and
  `upsertCase` regenerates **only when a schedule column actually changed** —
  a hotel/notes/status edit no longer resets snoozes or reassignments.
  `syncCaseReminders` now takes `patient_id` from the case row and rejects a
  mismatched client id.
- **Cron sweep**: `today` is the Istanbul day; the insert is
  `.upsert(…, { onConflict: "org_id,note", ignoreDuplicates: true })` with a
  row-by-row 23505-skipping fallback (also covers pre-migration 42P10) — one
  duplicate marker no longer aborts the whole batch and 500s the cron.
- **0027 amended in place** (was written, unapplied): the unique marker index
  is now `reminders(org_id, note) where type='payment' and note like
  'payment:%'` — a second manual payment reminder with an empty note no longer
  explodes, and the constraint is org-scoped. **0029_reminder_due_times.sql**
  (⚠️ apply by hand, after 0027) moves existing open generated/payment rows
  from 00:00Z to +6h (= 09:00 TRT). Code is safe to deploy before either.
- **Panel**: due-from/to filters compare the viewer's local day (was the UTC
  slice); the dashboard horizon compares **epoch ms**, not lexicographic ISO
  strings of different shapes; the 60-row fetch cap is counted
  (`count:"exact"` → `windowOverflow` → the "+N more" line); snooze options
  are based on `max(now, due_at)` and never move a reminder backwards; the
  edit dialog protects the cron's `payment:<uuid>` marker note (hidden input,
  not editable); `DateTimePicker` renders an off-grid time (e.g. a 14:37
  snooze) as an extra option instead of a blank select.

---

_Keep this file current: when you make a materially new decision or change the
system's shape, update the relevant section (and add a dated note under "Recent
work") so the next reader stays up to speed. Same rules apply to editing this
file — single author, no co-authors._
