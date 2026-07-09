# TurkCure — Internal Operations System

Internal system for the TurkCure health-tourism team: patient pipeline (lead → aftercare), providers (doctors, hospitals, hotels, drivers), quotes with hidden internal costs, payments in/out, reminders, patient-facing PDF, and an admin finance tracker.

**Stack:** Next.js 16 (App Router) · Supabase (Postgres, Auth, Storage) · Tailwind CSS v4 · @react-pdf/renderer · Recharts

## Setup

1. **Supabase**: create a project at [supabase.com](https://supabase.com), then run [supabase/migrations/0001_init.sql](supabase/migrations/0001_init.sql) in the SQL editor. It creates the schema, RLS policies, storage buckets, and seed data (countries, operation types, instruction templates).
2. **Disable public signups**: Dashboard → Authentication → Sign In / Up → turn off "Allow new users to sign up". Accounts are created from the in-app Settings page (admin only).
3. **First admin**: Dashboard → Authentication → Users → "Add user" (email + password). Then in the SQL editor: `update profiles set role = 'admin' where id = '<that user id>';`
4. **Env**: copy `.env.local.example` to `.env.local` and fill in the project URL, anon key, and service-role key (Settings → API).
5. `npm install && npm run dev` → http://localhost:3000

## Roles

- **Admin** — everything, including internal costs, margins, finance page, user management, deletions.
- **Agent** — day-to-day work; never sees internal costs or margins (enforced server-side, not just hidden in the UI).

The patient PDF (`/api/pdf/<caseId>`) only ever reads the cost-free `quote_items_public` view — prices only.
