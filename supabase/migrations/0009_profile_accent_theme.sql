-- Per-user accent theme, replacing the hardcoded THEME_OVERRIDES in the app layout.
alter table profiles
  add column accent_theme text not null default 'default'
  check (accent_theme in ('default', 'violet', 'emerald', 'amber'));

-- Preserve the previously hardcoded override.
update profiles set accent_theme = 'violet'
where id = (select id from auth.users where lower(email) = 'yacjamili@gmail.com');
