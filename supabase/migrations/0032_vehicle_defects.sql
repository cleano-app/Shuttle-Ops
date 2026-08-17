-- vehicle_defects: build spec §30 — a defect can also be reported
-- directly (not just discovered during a walkaround check), e.g. Office
-- fields a phone call about damage, or a driver spots something between
-- checks. reported_by is deliberately broad (any staff role, via
-- is_dispatcher() covering admin/office/dispatcher, plus drivers for their
-- own reports) since anyone might be the one to notice.
create table if not exists vehicle_defects (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references vehicles(id),
  reported_by uuid not null references profiles(id),
  reported_at timestamptz not null default now(),
  severity text not null check (severity in ('minor', 'major', 'critical')),
  description text not null,
  photo_path text,
  status text not null default 'open' check (status in ('open', 'in_progress', 'resolved')),
  assigned_to uuid references profiles(id),
  resolved_at timestamptz,
  resolution_note text
);

create index if not exists vehicle_defects_vehicle_idx on vehicle_defects (vehicle_id);
create index if not exists vehicle_defects_status_idx on vehicle_defects (status);

alter table vehicle_defects enable row level security;

create policy vehicle_defects_dispatcher_manage on vehicle_defects for all
  using (is_dispatcher())
  with check (is_dispatcher());

create policy vehicle_defects_driver_select_own on vehicle_defects for select
  using (is_driver() and reported_by = auth.uid());

create policy vehicle_defects_driver_insert on vehicle_defects for insert
  with check (is_driver() and reported_by = auth.uid());

grant select, insert on public.vehicle_defects to authenticated;
grant select, insert, update, delete on public.vehicle_defects to service_role;

-- Same automatic out-of-service behaviour as critical vehicle_checks
-- (0031's trigger) — a defect reported directly at 'critical' severity
-- must have the same effect as one discovered on a walkaround, not a
-- weaker one just because of which screen it came from.
create or replace function handle_vehicle_defect_severity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.severity = 'critical' then
    update vehicles set status = 'defect' where id = new.vehicle_id;

    insert into fleet_tasks (vehicle_id, task_type, title, description, due_date, created_from, source_defect_id)
    values (
      new.vehicle_id,
      'defect',
      'Critical defect reported',
      new.description,
      current_date,
      'manual_defect',
      new.id
    );
  end if;
  return new;
end;
$$;

create trigger vehicle_defects_after_insert
  after insert on vehicle_defects
  for each row execute function handle_vehicle_defect_severity();
