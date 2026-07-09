-- Drivers: support multiple vehicles per driver.
-- Migrate the single `vehicle` text column into a `vehicles` text[] array.
alter table drivers add column if not exists vehicles text[] not null default '{}';

update drivers
  set vehicles = array[vehicle]
  where vehicle is not null and vehicle <> '' and cardinality(vehicles) = 0;

alter table drivers drop column if exists vehicle;

-- Reminders: any staff member should be able to delete a reminder assigned to
-- them (or their own creations), not only admins. The original policy restricted
-- DELETE to is_admin(), which silently blocked agents. Widen it to admins plus
-- the assignee. (Reminders have no created_by column; assigned_to is the owner.)
drop policy if exists "reminders delete" on reminders;
create policy "reminders delete" on reminders for delete to authenticated
  using (is_admin() or assigned_to = auth.uid());
