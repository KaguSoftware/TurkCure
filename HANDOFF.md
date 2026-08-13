# TurkCure — Handoff

> Read this first when starting a fresh chat.
> **The canonical guide is [`CLAUDE.md`](CLAUDE.md)** — the full stack, conventions, architecture,
> and dated decision log live there. This file is the short "where are we, what's next" layer on
> top. Read both. There is also a persistent memory index at
> `C:\Users\p.mansouri\.claude\projects\c--Users-p-mansouri-Desktop-kagu-TurkCure\memory\MEMORY.md`.
>
> ⚠️ Not to be confused with **ExxionOs**, a separate project on the same laptop with its own
> HANDOFF.md and plan file. Different repo, different rules.

## Working style
- **One author, always: Parsa Mansouri.** NEVER add `Co-Authored-By`, never mention AI/Claude in
  commit messages or PR bodies. (git identity: `parsaxavier@gmail.com`.)
- **Push only when asked** ("push", "push it", etc.). Otherwise commit locally at most.
- **Migrations are applied by hand** — write the numbered SQL file, tell Parsa to apply it; never
  auto-run SQL.
- **Confirm before destructive / outward-facing actions.**
- **`npm run build` is the correctness gate** (types + lint). Green build ≠ verified behaviour —
  say what was and wasn't driven in a browser.

## What this is
Internal CRM / operations tool for a medical-tourism business: patients, their treatment **cases**,
quotes, payments, reminders, and a directory of hospitals/doctors/hotels/drivers. Admins get a
finance view (per-case margins) and can generate patient-facing PDFs. Two-ish internal users; no
public signup (invite-only). See CLAUDE.md → "What this app is".

## Stack & environment
- **Next.js 16.2.10** (App Router, Turbopack, `staleTimes`), **React 19.2.4**, TypeScript strict.
- **Supabase** (Postgres + Auth + Storage) via `@supabase/supabase-js`, **no ORM**.
- **Tailwind v4**, custom spring-animation utilities in `globals.css` (macOS-style motion is a
  standing preference — use those utilities, don't fight them).
- **PDFs**: `@react-pdf/renderer` in Node-runtime API routes only.
- Deploy: **Vercel** + Vercel Cron. `NEXT_PUBLIC_SITE_URL` must be set in Vercel Production (auth
  email links depend on it — see CLAUDE.md → auth section).
- Windows 11 + PowerShell (Bash tool also available).

## Conventions (the load-bearing ones — full list in CLAUDE.md)
- Auth is cheap on purpose: JWT `exp` decoded locally in `src/proxy.ts`; `getProfile()` uses
  `getClaims()` + React `cache()` + `unstable_cache`. **Don't make auth hit the DB per request.**
- `unstable_cache` is invalidated ONLY by `revalidateTag`, never `revalidatePath`. If you cache a
  read, raise its tag from every write that changes the data.
- Server components fetch + `Promise.all`; `"use client"` only where interactive. Lazy-load heavy
  client libs with `next/dynamic`.
- **All design colour lives in the `:root`/`.dark` token block at the top of `globals.css`.** Raw
  hex in a component is a bug.
- i18n/RTL discipline and logical CSS properties (from the sibling ExxionOs playbook) are NOT
  enforced here — TurkCure is English-only. Match the surrounding code.

## Current status (2026-08-12 — additional costs, multi-case PDF, wordmark fix)

Four asks from live use, all on the patient PDF. `npm run build` green, and this session the
PDFs were **actually rendered and looked at** (Playwright through the app's own auth, then
rasterized with pdfjs) rather than inferred from the build.

1. **⚠️ Migration `0020_case_additional_costs.sql` is written but NOT APPLIED.** Parsa authorized
   applying it, but `npx supabase db push --linked` was blocked by the assistant's permission
   layer (same as `0019` last session) and there is no DB connection string in `.env.local`, so
   **Parsa must run `npx supabase db push --linked` himself.** Until then the Additional costs
   card errors on save and the PDF block never appears; nothing else is affected.
   - **Correction to the note below:** `supabase migration list --linked` on 2026-08-12 shows
     **`0019` IS applied remotely** (`local 0019 / remote 0019`). The finance page is not
     degraded. `0020` is the only pending migration.
2. **Additional costs** — a per-case list of extras (title + amount) that prints on the PDF under
   Payment Information and is **deliberately inert everywhere else**: not in the package total,
   not in Finance. New `case_additional_costs` table rather than `quote_items`, because
   `quote_items.price` feeds the PDF total and both its money columns feed `finance_case_rows()`.
   Editor sits under the Quote card; the PDF block is hidden entirely when the list is empty.
3. **Combined multi-case PDF** — "Combined PDF" button on the patient header (shown only when
   there's >1 case) opens a case-picker dialog. One cover per case, then a single body where
   Patient Information, the company block and the signature page appear **once**, and each case
   contributes `2.1`, `3.1`… sections. Selecting one case routes to the existing single-case URL.
   The 423-line inline document was extracted to `src/lib/pdf/case-doc.tsx` so both routes share it.
4. **Both PDF wordmarks fixed.** The cover one was off-centre as reported. Screenshotting then
   revealed a **pre-existing bug**: the blue header wordmark had been clipping "Cure", so every
   page header in every PDF read just **"Turk"**. Both are now flex text instead of SVG.
5. **"Medication included"** added to the Package Details bullets.
6. **Cases can be deleted.** There was no delete path at all before. Red "Delete case" button in
   the case-form footer, admin-only, with a confirm that spells out what cascades (quote,
   payments, reminders, instructions, additional costs). Verified in a browser.
7. **The combined PDF has ONE cover**, not one per case (first cut stacked them back to back).
   The single cover lists every treatment; a loud navy "TREATMENT n OF m" divider starts each
   case on a fresh page in the body.
8. **Two react-pdf layout bugs fixed, one of them pre-existing.** Package Details bullets were
   overflowing their card into the next section — that bug was already in the live single-case
   PDF, it just needed more bullets to show. See Gotchas.

**Verified in-browser:** single-case PDF unchanged (4 pages, sections 1-7, medication bullet
present); combined 2-case mixed-currency PDF (6 pages) with correct numbering, per-case
currencies never summed, and the closing blocks once; `?cases=` spanning two patients → 404,
empty → 400, duplicate id → rendered once. **Not yet verified:** the Additional costs block
end-to-end (needs `0020`), and the new dialog on a real phone.

## Previous status (2026-08-07, evening — finance overhaul)

**Second 2026-08-07 session: the Finance section went from "just numbers" to a real
finance tool.** Everything builds green (`npm run build`), design detector clean, and
every tab was screenshot-verified at 1440×900 + 390×844 in light AND dark via the new
`scripts/finance-audit.mjs`.

1. **Migration `supabase/migrations/0019_finance_overhaul.sql` — ⚠️ WRITTEN BUT NOT
   APPLIED.** Parsa authorized `supabase db push --linked`, but the assistant's
   permission layer blocked the command twice, so **Parsa must run
   `npx supabase db push --linked` himself** (0019 is the only pending migration; CLI
   history was in sync at 0018). Until then the finance page shows zero
   cash/paid-out/receivables figures (it degrades, doesn't crash) and Collected on
   the cards disagrees with the table — both are the missing RPC, not bugs.
2. What shipped: `finance_case_rows()` gained `paid_out` + hospital/doctor/source/
   country; new `finance_payment_rows()` per-payment feed; three-tab Finance UI
   (Overview with vs-previous-period deltas and a Cash⇄Quoted chart toggle;
   Receivables & Payables with in-card stats and overdue badges; Breakdowns by
   operation/hospital/doctor/source/country); period filter (whole-calendar-month
   string math); planning cases excluded from quoted metrics by default; "All (in
   USD)" mode now uses **live ECB rates** via `getUsdRates()` (offline table is only
   the fallback and is labelled as such). Full detail in CLAUDE.md → "Recent work —
   2026-08-07 finance overhaul".
3. **Phantom-vertical-scrollbar bug fixed at the primitive level**: `TabBar` and the
   `Table` wrapper now pair `overflow-x-auto` with `overflow-y-hidden` (see Gotchas —
   Parsa hit this twice in one evening and it is now a standing rule).

## Previous status (2026-08-07, morning)


**This session (2026-08-07) — three asks from live use. Migrations `0016` and `0017` were
applied to the live Supabase project on 2026-08-07** (Parsa said "linked to supabase, feel free
to push" — `supabase db push --linked`; the CLI's migration history was in sync with the
hand-applied `0001`–`0015`). **The standing rule is still hand-applied migrations** — that was a
one-off explicit authorization, not a new default.
1. **Payments can be in any currency, with a stored conversion rate.** `0016` adds
   `payments.fx_rate` + `payments.amount_case`. Live rates from frankfurter.app prefill an
   editable field; the rate is frozen on the row so history never re-rates. Finance, the patient
   header chip, the payments cards and the case PDF all now count off-currency payments instead
   of silently dropping them. ⚠️ **This moved numbers** — case totals containing a
   previously-excluded payment changed. Verified in a browser: recording a USD payment on a EUR
   case fetched `1 USD = 0.86640097 EUR` live and previewed the converted total correctly.
2. **Quote labels are free text.** `0017` moves `quote_items.kind` off its enum; both Type and
   Description accept anything or nothing.
3. **"Done" on a case is now "Add dates to reminders."** `0018` adds `hospital` and `departure`
   reminder types; the button (`syncCaseReminders`) pushes all five case dates into the
   dashboard as seven reminders and is safe to re-run. `completeCase` was deleted — completing
   a case is the Status field on the case form. **Verified end-to-end in a browser:** 4
   reminders → 7 with the right types and dates, unchanged on a second run, and the Departure
   one renders on the dashboard with its new badge.
4. **Mobile pass at 390×844, screenshot-driven** via the new `scripts/mobile-audit.mjs`
   (Playwright devDependency). See CLAUDE.md for what changed; the short version is that tables
   used to compress instead of scrolling, dialogs ran off the bottom of the screen, and the
   instruction-image remove button was unreachable on touch.

⚠️ **Not yet checked on a real phone.** Playwright emulates a 390px viewport but is not a touch
device — worth Parsa spot-checking the tap targets and the horizontal table scroll on his own
handset. Also untested end-to-end: what happens when frankfurter.app is unreachable (the
fallback path is written and typed, but was not exercised).

## Previous status (2026-07-27)
The app is built and in real use on Vercel. Recent threads: auth overhaul (2026-07-13), a
performance pass (2026-07-13, migration `0011`), a UI/UX pass (2026-07-13), PDF resilience fixes,
structured directory contact fields (`0013`), and case comboboxes (2026-07-24).

**This session (2026-07-27) — three asks from live use. ⚠️ Migrations `0014` + `0015` are
written but NOT yet applied — Parsa applies them by hand, and the app breaks until he does
(the code reads `patient_files.category` and `cases.protocol_number`).**
1. **Patient files are categorised** — `Reports` / `Passport` / `Other`. `0014` adds
   `patient_files.category` (text + named check, defaults to `other` so old files land there) and a
   `(patient_id, category, created_at desc)` index. `files-tab.tsx` went from one flat list to
   grouped sections, each with **its own drop target** (so uploading never asks for a category) and
   a per-row `Select` to re-file a mistake. Empty sections show a hint instead of collapsing.
   `FILE_CATEGORIES` in `types.ts` drives the order.
2. **Cases have a protocol number** — `0015` adds `cases.protocol_number` + a `pg_trgm` GIN index
   (not partial — the planner can't prove `ilike '%q%'` implies `<> ''`). It heads the case form, becomes the `Ref` on the generated PDF (falling back to the
   case-id slice), and is matched by the command palette (a protocol hit deep-links to
   `?case=<id>` and outranks the plain patient row, since a numeric query can hit a phone too).
3. **The case PDF downloads as `<Full Name>.pdf`** — was `turkcure-wof-<slug>.pdf`. Uses RFC 5987
   `filename*=UTF-8''…` with a stripped-ASCII `filename=` fallback, which is what makes
   `Ayşe Çelik.pdf` work without the Latin-1 ByteString error. Instruction PDF unchanged.

**Previous session (2026-07-24) — three UI fixes, committed + pushed (`f91ba42`, `e26dd88`):**
1. **Custom scrollbars everywhere** — `globals.css` styles `::-webkit-scrollbar` (thin rounded-pill
   thumb, transparent track, token colours) + `scrollbar-width`/`scrollbar-color` for Firefox.
2. **No more scrollbar layout-snap** — `html { scrollbar-gutter: stable }` reserves the gutter
   permanently, so opening any overlay that locks `body` scroll (Dialog, mobile drawer, maximized
   board column) no longer shifts the page sideways. One CSS rule covers all three lock sites.
3. **Search-or-create comboboxes in Case details** — new shared `ComboBox` primitive
   (`components/ui/input.tsx`): portaled popover, keyboard nav, filter-as-you-type, inline
   "Create «query»" row, **auto-focuses its search input on open** (rAF after the portal mounts).
   - The five directory dropdowns (Operation, Doctor, Hospital, Hotel, Driver) use it id-valued,
     backed by `upsertDirectoryRow`; creating a row inserts + selects it instantly (local option
     state) then refreshes. Replaced the old separate "Add doctor" dialog (removed).
   - **Departure airport** (renamed from "Airport") and **Airport pickup** use `ComboBox` in the
     new **`freeText` mode** (submitted value = the typed/selected code, not an id), seeded with a
     curated Turkish-airport suggestion list but accepting any typed code.

⚠️ **Neither session was driven in a browser by the assistant** — both verified by `npm run build`
(types + lint green) and the impeccable design detector (2026-07-27: clean, zero findings on the
changed files). For 2026-07-27, worth Parsa applying `0014`/`0015` then confirming: files upload
into the right section and re-file via the row dropdown; a protocol number saves, shows as `Ref` on
the PDF, and is findable in Ctrl+K; and the PDF downloads as the patient's name — test one with
Turkish characters.

## File map (key files) — see CLAUDE.md for the fuller list
- `src/app/globals.css` — all design tokens + motion utilities + the new scrollbar rules.
- `src/components/ui/input.tsx` — `Input`/`Textarea`/`Select`/**`ComboBox`**/`Field`/`Label` and the
  `PopoverLayer` portal helper. ComboBox has both id-valued and `freeText` modes.
- `src/components/patients/case-tab.tsx` — the Case & Quote tab; case-detail form (now
  combobox-driven) + inline quote editor. `AIRPORT_SUGGESTIONS` lives here.
- `src/components/patients/patient-detail.tsx` — tab shell + `Directories` type.
- `src/lib/actions/directory.ts` — `upsertDirectoryRow` / `deleteDirectoryRow` (tables: countries,
  hospitals, doctors, hotels, drivers, operation_types, instruction_templates).
- `src/lib/actions/cases.ts` — `upsertCase`, quote-item actions. **`upsertCase` does not whitelist
  fields**; the allowlist is the `values` object in `case-tab.tsx`'s `onSaveCase`.
- `src/components/patients/files-tab.tsx` — categorised files (grouped sections, per-section
  upload, per-row re-file). Talks to Supabase from the browser; no server action.
- `src/lib/actions/search.ts` — command-palette `globalSearch` (patients, **case protocol
  numbers**, and the four directories).
- `src/lib/supabase/server.ts` — cookie + admin clients, cached `getProfile()`.
- `src/proxy.ts` — Next 16 middleware / auth gate (local JWT exp check).
- `src/lib/data/fx.ts` — server-only live FX (frankfurter.app) behind `unstable_cache` tag
  `"fx"`; `src/lib/actions/fx.ts` is the client bridge; `src/lib/fx.ts` stays pure + offline
  fallback. **The try/catch must stay outside the cached function.**
- `src/components/finance/` — `finance-view.tsx` (shell: toolbar + `?tab=` TabBar),
  `finance-shared.tsx` (types, period math, `Stat`, `Pager`), `finance-overview.tsx`,
  `finance-receivables.tsx`, `finance-breakdowns.tsx`, `finance-chart.tsx`
  (series-driven recharts, lazy). `src/lib/data/finance.ts` has both cached RPC reads.
- `scripts/mobile-audit.mjs` — Playwright phone-width sweep. `node scripts/mobile-audit.mjs
  --label after --out .mobile-audit/after` with `npm run dev` already running.
- `scripts/finance-audit.mjs` — finance-only sweep: every tab, phone + desktop,
  light + dark (forces theme via `localStorage.theme`), flags real vertical
  scrollbars, horizontal bleed and page micro-overflow. Output gitignored
  (`.finance-audit/`).
- `src/lib/pdf/case-doc.tsx` — the whole patient-facing case document: `loadCasesData` (batch,
  same-patient assertion), `CaseCover`, `PatientInfoSection`, `CaseBody` (per-case, takes
  `sectionPrefix`), `CompanySection`, `ConfirmationBlock`, `pdfFilenameHeaders`. Both PDF routes
  are thin shells over this.
- `src/components/patients/combined-pdf-dialog.tsx` — case picker for the multi-case PDF.
- `supabase/migrations/` — numbered `0001`…`0020`. `0001`–`0015` by hand, `0016`/`0017` via CLI
  on 2026-08-07, `0018` and **`0019` applied** (confirmed via `supabase migration list --linked`
  on 2026-08-12); **`0020` pending — Parsa runs `npx supabase db push --linked`.**

## Roadmap / next steps
No fixed phase plan — this is reshape-on-use. **← next: whatever Parsa reports from live usage.**
Standing candidates if asked:
- Turn airports into a real `airports` directory table (migration) if free-text isn't enough.
- Continue the pagination lever for perceived slowness (see the Perf memory).

## Deliberately partial — grows later (scope ledger)
| Area | What shipped now | Intended full shape | Grows in |
|---|---|---|---|
| Airport fields | `ComboBox` `freeText` mode over a curated static Turkish-airport list; any code typeable | A real `airports` directory table + migration, searchable/creatable like the other five | If asked |
| Case dropdowns | Search-or-create comboboxes over 5 directory tables; inline create + refresh | — (this is the intended shape) | Done |
| Custom scrollbars | WebKit + Firefox, token-coloured, gutter reserved on `html` | — | Done |

## Gotchas / open issues
- **NO VERTICAL SCROLLBARS on horizontal scrollers — standing rule from Parsa.**
  Any `overflow-x-auto` element (tab bars, table wrappers, chip rows, anything that
  scrolls sideways) MUST also set `overflow-y-hidden`. When overflow-x is
  non-visible the browser computes overflow-y as `auto`, and a single pixel of
  vertical overflow — an `-mb-px` child or fractional browser zoom is enough —
  manufactures a phantom vertical scrollbar. `TabBar` (`ui/tabs.tsx`) and `Table`
  (`ui/table.tsx`) are fixed; check this on every new sideways scroller before
  shipping, at 90%/110% zoom too.
- **`ComboBox` id vs freeText**: default mode submits the option **id**; `freeText` submits the
  **name/typed text**. The airport fields rely on `freeText`. Don't mix them up when reusing it.
- **Focusing anything inside a `PopoverLayer` needs a rAF.** The popover mounts in a portal and is
  positioned in a layout effect while hidden, so a `.focus()` in the same effect that sets
  `open` is a silent no-op — the element isn't focusable yet. `ComboBox` learned this in
  2026-07-24; `Select` had the same latent bug (you had to click a field twice before you could
  type in its search) and was fixed the same way on 2026-08-12: double `requestAnimationFrame`,
  focus on the first frame, retry on the second. Note `Select` only renders a search box above
  `SEARCH_THRESHOLD` (7) options, so short lists keep focus on the trigger by design.
- **Locally-created directory rows** live in the ComboBox's local option state until the next
  `router.refresh()` lands — that's deliberate so the new row shows its name immediately.
- **Migrations are hand-applied by default.** `0016`/`0017` were pushed via the CLI only because
  Parsa explicitly authorized it on 2026-08-07. Don't assume that carries forward.
- **`cases.currency` is now locked once off-currency payments exist** — their `fx_rate` was
  computed against the old target and no check constraint can reference another table, so
  `upsertCase` refuses the change with a message rather than silently corrupting the rates.
- **`"use server"` files may only export async functions.** `tsc --noEmit` will not tell you;
  only the dev server / `npm run build` will. Bit me once already this session.
- **`Table` has a `min-w` floor now.** A table that should fit a phone must opt out
  (`min-w-0 sm:min-w-[34rem]`) *and* hide its low-value columns, or it will scroll sideways.
- **`unstable_cache` staleness**: any new cached read needs its tag raised from every writer — the
  classic miss.
- **PDF routes**: non-ASCII patient names in the `Content-Disposition` filename were the source of
  past 500s (see the PDF memory) — not the render itself. The logic now lives once in
  `pdfFilenameHeaders` (`lib/pdf/case-doc.tsx`); both routes use it.
- **`wrap={false}` on a PDF section silently CLIPS anything taller than a page** — no overflow, no
  error, the content just isn't there. Fine for fixed-height tables; never put it on a section
  whose length grows with the data. Package Details wraps for exactly this reason, and a combined
  document stacks several of those on one flowing page.
- **Additional costs must never reach Finance.** `case_additional_costs` is separate from
  `quote_items` precisely because `finance_case_rows()` aggregates `quote_items.price`/`cost`. If
  a future change starts summing these into revenue or the package total, that's a regression,
  not a feature.
- **react-pdf mismeasures two things; both are invisible to `npm run build`.** Found on
  2026-08-12 by rasterizing PDFs and reading glyph coordinates back out of them.
  1. **A big `<Text>` and the `<Text>` under it collide** — a 19pt title left the next baseline
     9.7pt below it. `lineHeight`, a fixed-height wrapper `View` and `marginBottom` all did
     nothing. Use **one `<Text>` with nested `<Text>` children and a `\n`** instead of siblings.
  2. **`flexWrap: "wrap"` containers report ~one row of height**, so their contents spill over
     whatever follows. Use explicit non-wrapping columns. (This is what made Package Details
     overlap Payment Information.)
- **Don't draw text inside `<Svg>` in react-pdf.** Both wordmarks used hardcoded `x` offsets in a
  fixed viewBox; the offsets were measured against font metrics that don't match what renders, so
  the blue header wordmark clipped "Cure" entirely and shipped as "Turk" for months. Gradient
  fills on SVG text don't render either. Plain flex `<Text>` self-sizes and centres correctly.
- General ExxionOs handoff notes in context do **not** apply here (different repo, i18n/RTL rules,
  migration numbering, etc.).

## Running it
```bash
npm run dev      # Turbopack dev server
npm run build    # production build — the correctness gate (types + lint)
npm run start    # serve the production build
npm run lint     # eslint
```
Design detector: `node .claude/skills/impeccable/scripts/detect.mjs --json <files>`.
