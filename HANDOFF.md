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

## Current status (2026-07-24)
The app is built and in real use on Vercel. Recent threads: auth overhaul (2026-07-13), a
performance pass (2026-07-13, migration `0011`), a UI/UX pass (2026-07-13), PDF resilience fixes,
and structured directory contact fields (`0013`).

**This session (2026-07-24) — three UI fixes, committed + pushed (`f91ba42`, `e26dd88`):**
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

⚠️ **Not driven in a browser by the assistant** — verified by `npm run build` (types + lint green)
and the impeccable design detector (no NEW findings; pre-existing gradient-text / spring-easing
warnings are the documented, intentional house style). Worth Parsa opening a case and confirming:
the comboboxes focus-on-open, create a new doctor/hospital inline, and the airport fields accept
both a suggestion and a free-typed code.

## File map (key files) — see CLAUDE.md for the fuller list
- `src/app/globals.css` — all design tokens + motion utilities + the new scrollbar rules.
- `src/components/ui/input.tsx` — `Input`/`Textarea`/`Select`/**`ComboBox`**/`Field`/`Label` and the
  `PopoverLayer` portal helper. ComboBox has both id-valued and `freeText` modes.
- `src/components/patients/case-tab.tsx` — the Case & Quote tab; case-detail form (now
  combobox-driven) + inline quote editor. `AIRPORT_SUGGESTIONS` lives here.
- `src/components/patients/patient-detail.tsx` — tab shell + `Directories` type.
- `src/lib/actions/directory.ts` — `upsertDirectoryRow` / `deleteDirectoryRow` (tables: countries,
  hospitals, doctors, hotels, drivers, operation_types, instruction_templates).
- `src/lib/actions/cases.ts` — `upsertCase`, quote-item actions.
- `src/lib/supabase/server.ts` — cookie + admin clients, cached `getProfile()`.
- `src/proxy.ts` — Next 16 middleware / auth gate (local JWT exp check).
- `supabase/migrations/` — hand-applied SQL, numbered `0001`…`0013` (all applied per git history).

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
- **`ComboBox` id vs freeText**: default mode submits the option **id**; `freeText` submits the
  **name/typed text**. The airport fields rely on `freeText`. Don't mix them up when reusing it.
- **Locally-created directory rows** live in the ComboBox's local option state until the next
  `router.refresh()` lands — that's deliberate so the new row shows its name immediately.
- **Migrations are hand-applied.** `0013` was the last; nothing new added this session.
- **`unstable_cache` staleness**: any new cached read needs its tag raised from every writer — the
  classic miss.
- **PDF routes**: non-ASCII patient names in the `Content-Disposition` filename were the source of
  past 500s (see the PDF memory) — not the render itself.
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
