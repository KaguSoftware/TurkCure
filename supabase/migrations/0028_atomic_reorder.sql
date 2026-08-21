-- 0028: make quote-item / additional-cost reordering atomic.
--
-- reorderQuoteItems/reorderAdditionalCosts used to issue N independent UPDATEs
-- under Promise.all — a partial failure (or two concurrent reorders) left the
-- list half-reordered with duplicate/gapped sort_order values while the client
-- rolled back completely. One statement can't half-apply.
--
-- quote_items can't go through a bare PostgREST upsert instead: description is
-- NOT NULL with no default, so the insert arm of ON CONFLICT would violate it.
--
-- reorder_quote_items is SECURITY DEFINER with execute revoked (same stance as
-- the finance RPCs in 0024): the table is admin-only under RLS but agents may
-- reorder, so the service-role client calls it and p_org is the fence — the
-- app passes the caller's own profile.org_id, never client input.
-- reorder_additional_costs is plain INVOKER: staff RLS on that table already
-- allows the update, so the cookie client calls it and RLS applies inside.
--
-- ⚠️ Apply by hand (npx supabase db push --linked). Until applied, the actions
-- detect the missing function and fall back to the old per-row updates.

create or replace function reorder_quote_items(p_org uuid, p_case uuid, p_ids uuid[])
returns void
language sql
security definer
set search_path = public
as $$
  update quote_items q
     set sort_order = u.ord - 1
    from unnest(p_ids) with ordinality as u(id, ord)
   where q.id = u.id
     and q.case_id = p_case
     and q.org_id = p_org;
$$;
revoke execute on function reorder_quote_items(uuid, uuid, uuid[]) from public, anon, authenticated;

create or replace function reorder_additional_costs(p_case uuid, p_ids uuid[])
returns void
language sql
as $$
  update case_additional_costs c
     set sort_order = u.ord - 1
    from unnest(p_ids) with ordinality as u(id, ord)
   where c.id = u.id
     and c.case_id = p_case;
$$;
