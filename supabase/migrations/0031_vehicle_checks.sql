-- vehicle_checks: build spec §29 — driver mobile walkaround (tyres,
-- lights, mirrors, windscreen, fluids, body damage, seatbelts, doors,
-- safety equipment, other configurable items — stored as the `items`
-- jsonb blob, one entry per checklist item, rather than a fixed column
-- per item, so the checklist itself can change without a migration).
--
-- Direct driver RLS insert (not routed through a security-definer
-- function like the Phase 2 stop actions) — a vehicle check carries no
-- passenger data, only vehicle condition, so there's nothing here that
-- needs the narrower scoping driver_covers_stop() enforces. Same
-- ownership-only pattern as driver_duty_events (0026).
create table if not exists vehicle_checks (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references vehicles(id),
  driver_id uuid not null references profiles(id),
  departure_id uuid references departures(id),
  check_type text not null check (check_type in ('pre_trip', 'post_trip')),
  completed_at timestamptz not null default now(),
  items jsonb not null default '[]'::jsonb,
  result text not null check (result in ('pass', 'advisory_defect', 'critical_defect')),
  signature text,
  notes text
);

create index if not exists vehicle_checks_vehicle_idx on vehicle_checks (vehicle_id, completed_at);

alter table vehicle_checks enable row level security;

create policy vehicle_checks_dispatcher_manage on vehicle_checks for all
  using (is_dispatcher())
  with check (is_dispatcher());

create policy vehicle_checks_driver_select_own on vehicle_checks for select
  using (is_driver() and driver_id = auth.uid());

create policy vehicle_checks_driver_insert on vehicle_checks for insert
  with check (is_driver() and driver_id = auth.uid());

grant select, insert on public.vehicle_checks to authenticated;
grant select, insert, update, delete on public.vehicle_checks to service_role;

-- Build spec §29: "A critical defect immediately marks the vehicle OUT OF
-- SERVICE, blocks assignment to any departure, and alerts Office." The
-- vehicle-status update and fleet task creation happen automatically via
-- this trigger — not left for Office to notice on their own — because a
-- driver's own RLS grant on `vehicles` is nonexistent (dispatcher-only,
-- 0007_vehicles.sql), so nothing else would flip vehicles.status when a
-- driver reports a critical defect. security definer lets the trigger
-- bypass that RLS deliberately, for this one automatic side effect only.
-- "Alerts Office" itself (a notification) is not implemented here — the
-- fleet_tasks row with status='open' is what Office's dashboard surfaces;
-- a push/email alert is a UI-layer addition, not required for the data
-- model to be correct.
create or replace function handle_vehicle_check_result()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.result = 'critical_defect' then
    update vehicles set status = 'defect' where id = new.vehicle_id;

    insert into fleet_tasks (vehicle_id, task_type, title, description, due_date, created_from)
    values (
      new.vehicle_id,
      'defect',
      'Critical defect from walkaround check',
      coalesce(new.notes, 'Critical defect flagged during a ' || new.check_type || ' check.'),
      current_date,
      'check_defect'
    );
  end if;
  return new;
end;
$$;

create trigger vehicle_checks_after_insert
  after insert on vehicle_checks
  for each row execute function handle_vehicle_check_result();
