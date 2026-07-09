-- The app has always offered GBP (src/lib/utils.ts CURRENCIES) but the
-- currency_code enum only had EUR/USD/TRY, so ANY payment or case saved with
-- GBP failed at the database — silently breaking payment recording. Add GBP.
--
-- NOTE: ALTER TYPE ... ADD VALUE cannot run inside a transaction block and the
-- new value is not usable until committed. Supabase runs each migration file in
-- its own transaction, so keep this ADD VALUE as the ONLY statement in this file
-- and put dependent DDL in 0006.
alter type currency_code add value if not exists 'GBP';
