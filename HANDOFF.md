# TurkCure — Handoff

> Read this first when starting a fresh chat.
> **The canonical guide is [`CLAUDE.md`](CLAUDE.md)** — the full stack, conventions, architecture,
> and dated decision log live there. This file is the short "where are we, what's next" layer on
> top. Read both. Claude's persistent memory index lives per machine:
> `C:\Users\p.mansouri\.claude\projects\c--Users-p-mansouri-Desktop-kagu-TurkCure\memory\MEMORY.md`
> on the work PC, `C:\Users\MnS\.claude\projects\c--Users-MnS-Kagu-TurkCure\memory\MEMORY.md` on
> the home PC (may not exist yet where no memories have been saved).
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

## Current status (2026-08-20 — form drafts + UX sweep)

Client ask ("cache unsaved form input for 30 minutes") plus a full UX audit, executed in
four phases (full detail in CLAUDE.md → "Recent work — 2026-08-20"). `npm run build` green,
`npm test` green (7), and **browser-verified**: 19/19 draft checks (capture incl. portaled
popover picks, tab-switch/dialog-close/reload restore, TTL purge, discard, pristine-no-write,
Esc-keeps / Cancel-clears on the reminder dialog) + a Phase-2/3/4 Playwright sweep (horizon
select, Mine/Everyone, 3-option snooze, table sort order, ?view= persistence, tel/mailto
links, patient-page reminder create→DB→delete, palette landing pre-filtered).

- **Form drafts**: `lib/form-drafts.ts` + `lib/use-form-draft.ts` + `ui/draft-banner.tsx`.
  Silent restore + Discard banner (Parsa's pick). Wired into: case form, patient dialog,
  payment dialog, directory rows (incl. template markdown), reminder dialog, quote/extras
  add dialogs. Esc/backdrop keep the draft; Cancel discards; save clears. Dialog forms
  needed their bodies extracted into per-open inner components (Dialog unmounts children).
  Deliberately no dirty-close confirm on Dialog.
- **Quick wins**: clickable patient email/phone everywhere + WhatsApp on board cards;
  duplicate-patient warning on create (advisory); palette directory hits land pre-filtered
  (`?q=`/`&t=`); cron `payment:<uuid>` marker hidden on reminder rows; friendly error page
  + `global-error.tsx` + root `not-found.tsx`; finance CSV BOM; `?view=` persistence; dead
  `"partial"` status removed from TS.
- **Reminders**: shared `components/reminders/reminder-form.tsx`; dashboard Mine|Everyone
  (Mine default, unassigned always visible), assignee shown, snooze menu (1h/tomorrow/next
  week), live overdue clock, and a configurable 7–90 day horizon that **filters locally**
  over one 90-day fetch (instant, persisted in localStorage) with a "+N more beyond" line.
  ⚠️ Two same-day reversions on Parsa's feedback: the patient-page reminders card was
  removed (reminders are dashboard-only by design) and the `?days=` server-refetch horizon
  became the local one (`dashboard-content.tsx`; `horizon-select.tsx` deleted).
- **Structural**: true board column totals (RPC), patients table server-side sort
  (`?sort=`/`?dir=`), file previews in-app + 25 MB cap + uploader shown, status nudge chips
  (never automatic).
- **No new migrations.** `0022_money_ux.sql` was applied by Parsa on 2026-08-20 —
  **nothing is pending.**
- Deferred (next sessions): timestamped patient notes (needs a migration), finance-table
  sorting, reminder notifications. Plan file:
  `~/.claude/plans/throughout-the-entire-system-compressed-metcalfe.md`.

⚠️ Worth spot-checking live: drafts on a real phone, the payment dialog draft (verified by
code path, not driven), duplicate warning copy, and the Mine-default not hiding anything
the team expected to see.

## Previous status (2026-08-19 — money-UX rebuild)

The whole money experience was rebuilt around one **Money tab** per case (full detail in
CLAUDE.md → "Recent work — 2026-08-19 money-UX rebuild"). `npm run build` green, `npm test`
green (7 tests, 2 new).

- **Migration `0022_money_ux.sql` — applied by Parsa on 2026-08-20** (was pending when this
  section was written).
  It (a) relaxes the `case_additional_costs` DELETE policy so agent deletes stop silently
  no-opping (the 0020 policy was admin-only while the action used the cookie client — the
  optimistic UI reported success and the row came back on refresh), and (b) normalizes legacy
  `'partial'` payment rows. Until applied, everything works except agent deletes of additional
  costs — which were already broken.
- **Tabs renamed**: `Case | Money | Instructions | Files`. The quote + extras moved out of
  "Case & Quote" (now just **Case**, a full-width form) and merged with the old Payments tab
  into **Money**. Old `?tab=` deep links are remapped (`LEGACY_TABS` in `patient-detail.tsx`).
  `payments-tab.tsx` was deleted.
- **Money tab** (`src/components/patients/money/`): summary cards (Quoted · Paid · Outstanding
  · extras "billed separately" · admin Margin) fed by the same optimistic lists the tables edit;
  spreadsheet-style quote + extras tables (inline `EditableCell` editing, arrow-button reorder
  via new `reorderQuoteItems`/`reorderAdditionalCosts` actions, always-present ghost row that
  inserts once priced); payments with explicit edit buttons and a rebuilt dialog that stays open
  until the save resolves, stages the receipt until Save (no orphaned uploads on cancel), and
  warns on a likely-inverted manual FX rate.
- **PDF change (deliberate, user-approved)**: the "Deposit paid" line shows the original
  currency for off-currency deposits — `500 Euros (= 540 USD)` — via preformatted
  `CaseDocData.depositDisplay`, consumed verbatim by both `CaseBody` and `buildCaseDoc` so they
  can't drift. Same-currency cases print exactly as before; balance math unchanged.
- **Finance overview**: stat cards split into two labeled groups ("Quoted — by case month" vs
  "Cash — by paid date"); chart titled "· trailing 12 months".
- Decision recorded: quote lines and additional costs are **drafting data — agent-deletable by
  design**; deletes of payments/cases stay admin-only.

**2026-08-20 cleanup after first live use** (Parsa: "messy, format breaks on long titles"):
adds now go through **"Add item"/"Add cost" dialogs** with an "Add & another" button (ghost
rows removed — they read as broken data); inline click-to-edit stays for fixes but quieter;
reorder/delete appear on row hover (always visible below `md`); sections stack full width;
summary is four cards with admin cost/margin as a sub-line under Quoted. Also **the window no
longer scrolls in the app shell** — `MainScroller` (`src/components/shell/main-scroller.tsx`)
scrolls below the topbar (the window scrollbar used to cut through the sticky topbar's edge)
and resets scroll on pathname change; body-overflow scroll locks in overlays are now inert
no-ops, deliberately left in place.

⚠️ **Not driven in a browser by the assistant** — build + tests only (Parsa drove the first
iteration live on 2026-08-20, which prompted the cleanup). Worth spot-checking: the add
dialogs (incl. "Add & another"), inline edits (Enter/Tab/Esc), reorder persisting after
refresh, a payment save failure keeping the dialog open, an agent deleting an additional cost
(post-0022), scrolling on every page now that main owns it (esp. the board takeover and
mobile drawer), and the Money tab at 390×844.

## Previous status (2026-08-14 — editable case document)

The case PDF can now be **edited before download**. "Edit document" on a case opens a Tiptap
editor that looks like the document itself, with an Edit / PDF Preview toggle, Save, Reset,
Download and (admin) Finalize. `npm run build` green, `npm test` green (6 tests), and the whole
loop was driven in a real browser.

- **Migrations `0020` AND `0021` are APPLIED** (2026-08-14, `npx supabase db push --linked`).
  `0020` turned out to have been applied already; only `0021` was pending. **Nothing is
  outstanding.** The additional-costs feature is live too.
- **Architecture**: `src/lib/documents/blocks.ts` is a pure-JSON contract (no Tiptap, no react-pdf)
  shared by the editor and by `src/lib/pdf/editorDoc.tsx`, which renders that JSON through the
  primitives the generated PDF already uses. So an edited document and a generated one are one
  design system, and react-pdf was kept rather than replaced.
- **Proof it lines up**: the seeded document renders byte-identical to `/api/pdf/<id>` — all 4
  pages, every text item at the same y-coordinate. That comparison is the regression test to
  re-run whenever either renderer changes.
- **Preview is server-rendered** (`POST /api/pdf/draft/<caseId>`), not client-side, because the PDF
  fonts load from the filesystem. The preview is therefore the download, byte for byte.
- Nothing regresses for cases nobody edits: the plain "Download PDF" button and `/api/pdf/<id>`
  are untouched.

⚠️ **Not yet exercised:** Finalize (the DB lock is written and the trigger is applied, but no one
has finalized a real document), and the editor on a phone.

## Previous status (2026-08-12 — additional costs, multi-case PDF, wordmark fix)

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
- `src/lib/form-drafts.ts` / `src/lib/use-form-draft.ts` / `src/components/ui/draft-banner.tsx`
  — the 30-minute unsaved-input cache (2026-08-20). Capture via FormData snapshots +
  document-level click/keyup (popovers are portaled); restore via mount effect + formKey
  remount; `draft.value("name") ?? serverValue` on every field.
- `src/components/reminders/reminder-form.tsx` — shared reminder dialog form + `TYPE_META`
  (moved out of reminders-panel).
- `src/components/dashboard/dashboard-content.tsx` — client shell for the whole dashboard;
  owns the 7–90 day period (localStorage) and filters the server's fixed 90-day fetch
  locally. `dashboard/horizon.ts` holds the options in a plain module because RSC can't
  read non-component exports of a "use client" file.
- `src/app/globals.css` — all design tokens + motion utilities + the new scrollbar rules.
- `src/components/ui/input.tsx` — `Input`/`Textarea`/`Select`/**`ComboBox`**/`Field`/`Label` and the
  `PopoverLayer` portal helper. ComboBox has both id-valued and `freeText` modes.
- `src/components/patients/case-tab.tsx` — the Case tab: the case form alone (combobox-driven,
  full width). `AIRPORT_SUGGESTIONS` lives here. The quote editor moved out on 2026-08-19.
- `src/components/patients/money/` — the Money tab (2026-08-19): `money-tab.tsx` (shell; owns
  all three optimistic lists + a promise queue that serializes commits), `money-summary.tsx`,
  `quote-table.tsx` / `additional-costs-table.tsx` (spreadsheet-style, ghost row, arrow
  reorder), `payments-section.tsx`, `payment-dialog.tsx` (stays open through save; staged
  receipt upload). `payments-tab.tsx` no longer exists.
- `src/components/ui/editable-cell.tsx` — click-to-edit table cell (Enter/Tab commit, Esc
  cancel, native `<datalist>` suggestions — deliberately not ComboBox-in-cell).
- `src/components/patients/patient-detail.tsx` — tab shell + `Directories` type +
  `LEGACY_TABS` remap for pre-2026-08-19 `?tab=` links.
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
- `src/lib/documents/` — `blocks.ts` (the JSON contract; **never import Tiptap or react-pdf here**)
  and `buildCaseDoc.ts` (seeds a document from a case, mirroring `CaseBody`'s sections).
- `src/lib/pdf/editorDoc.tsx` — document JSON → react-pdf, through the same primitives as the
  generated PDF. `src/lib/pdf/company.ts` holds `COMPANY` with zero imports so client code can
  read it without dragging in `node:fs`.
- `src/components/documents/` — `DocumentEditorPage.tsx` (tab toggle, save/reset/finalize) and
  `editor/` (`extensions.ts`, `nodes.tsx`, `CaseDocEditor.tsx`, `editor.css`).
- `src/app/api/pdf/draft/[caseId]/route.tsx` — GET renders the stored draft (seeding if none),
  POST renders document JSON from the body. The POST backs the editor preview.
- `supabase/migrations/` — numbered `0001`…`0022`, **all applied** (`0001`–`0015` by hand,
  `0016`–`0021` via `npx supabase db push --linked`, `0022` by hand on 2026-08-20).

## Roadmap / next steps
**← next: whatever Parsa reports from live use of the 2026-08-20 UX sweep.** Then, from the
approved plan (deferred items):
1. Timestamped patient notes — append-only `patient_notes` table (migration, hand-applied)
   replacing the single overwritable textarea; keep the old column as a legacy note.
2. Finance per-case table sorting (client-side; data is already loaded).
3. Reminder notifications (email/push) — biggest missing feature, needs an infra decision.
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
- **Form drafts (2026-08-20)**: any NEW form that should survive navigation must wire
  `useFormDraft` — form `ref={draft.formRef}`, `key` composed with `draft.formKey`, every
  `defaultValue` wrapped `draft.value("name") ?? server`, `draft.clear()` on save/Cancel,
  `<DraftBanner draft={draft} />` at the top. Dialog-hosted forms need the hook in a
  component rendered INSIDE `<Dialog>` (children unmount on close; a hook outside reads a
  stale draft on reopen). Never cache passwords/Files (the hook drops them, but don't rely
  on it for new sensitive fields — use `exclude`). Drafts hold patient PII in localStorage,
  bounded only by the 30-min TTL.
- **RSC + "use client" exports**: a server component importing a non-component export
  (array/const) from a client module gets a client-reference proxy — `.includes` throws at
  runtime, the build stays green. Keep shared constants in plain modules
  (`dashboard/horizon.ts` is the example).
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
- **`useOptimisticList` rollback assumes non-overlapping mutations.** Inline cell editing makes
  rapid sequential commits easy, so `money-tab.tsx` serializes every mutate through a promise
  queue. Any new UI that fires optimistic mutations in quick succession needs the same.
- **The PDF "Deposit paid" line comes from `CaseDocData.depositDisplay` only** — preformatted
  once in `buildCaseData` (case-doc.tsx) and printed verbatim by both `CaseBody` and
  `buildCaseDoc`. Don't re-derive it in either consumer; that split is what the field exists to
  prevent. Balance math still runs on the numeric `deposit` (Σ `amount_case`).
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
- **Never use app theme tokens inside the document editor sheet.** The sheet is a white page in
  both themes, but `--color-primary-soft`, `text-muted` and `hover:text-foreground` invert in dark
  mode — which made focused fields dark-on-dark (you couldn't see what you typed) and "Add row"
  white-on-white on hover. `editor.css` owns literal `--doc-*` colours for everything on the
  sheet; use those. Check by reading computed styles in **both** themes.
- **Deep-clone Tiptap's `getJSON()` before it crosses a server action or gets stored.** It returns
  ProseMirror's own node objects; Next's server-action serializer drops what it doesn't recognise
  and **every `attrs` arrives as `{}`** — the document saves with its structure intact and all of
  its content gone. Nothing warns: the build passes, the editor looks right, and you only see it
  by reading the saved row. `JSON.parse(JSON.stringify(doc))` at both boundaries.
- **Tiptap fires `onUpdate` while it loads content**, so a dirty flag wired straight to it shows
  "Unsaved changes" on a document nobody has touched. Gate it behind `onCreate` + a rAF.
- **`lib/pdf/common.tsx` can never be reached from client code** — it imports `node:fs`/`node:path`
  to resolve the embedded fonts. That is also why the document preview renders on the server
  instead of using react-pdf's browser `BlobProvider`. Shared constants live in
  `lib/pdf/company.ts` instead.
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
npm test         # vitest — renders the PDF mapper through the real renderer
npm run start    # serve the production build
npm run lint     # eslint
```
Design detector: `node .claude/skills/impeccable/scripts/detect.mjs --json <files>`.
