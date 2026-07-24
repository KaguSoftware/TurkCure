-- Structured contact fields for the hospital/doctor directory.
-- The business cards carry email, phone and website distinctly; keeping them in
-- their own columns makes them clickable (mailto/tel/href) and searchable,
-- instead of buried in the free-text `contact` blob. `contact` is retained for
-- address / fax / anything that doesn't fit a dedicated column.
-- (Hand-applied — the owner runs this.)

alter table hospitals add column if not exists email   text not null default '';
alter table hospitals add column if not exists website text not null default '';

alter table doctors   add column if not exists email   text not null default '';
alter table doctors   add column if not exists phone   text not null default '';
