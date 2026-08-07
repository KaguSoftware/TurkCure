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

_Keep this file current: when you make a materially new decision or change the
system's shape, update the relevant section (and add a dated note under "Recent
work") so the next reader stays up to speed. Same rules apply to editing this
file — single author, no co-authors._
