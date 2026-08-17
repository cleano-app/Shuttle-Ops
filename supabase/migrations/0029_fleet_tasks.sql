-- fleet_tasks: build spec §28/§29 — "Automatic reminders create fleet
-- tasks" (document expiry) and "Defects automatically create a fleet
-- task" (§29). Created first, ahead of vehicle_documents/checks/defects,
-- since those all reference it.
--
-- No real cron/scheduled-job infrastructure exists in this app (leg_timings'
-- nightly recompute job is explicitly Phase 4, §39) — document-expiry task
-- creation is a lazy sweep instead, same pattern as Phase 1's stale-
-- provisional-booking expiry: computed when Office opens the fleet
-- dashboard (src/app/actions/fleetTasks.ts's checkDocumentExpiryReminders),
-- not a background job. Defect-triggered tasks ARE created immediately,
-- via database triggers on vehicle_checks/vehicle_defects (0031/0032) —
-- those don't need to wait for anyone to open a dashboard.
create table if not exists fleet_tasks (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references vehicles(id),
  task_type text not null check (task_type in ('document_expiry', 'defect', 'maintenance_due')),
  title text not null,
  description text,
  due_date date,
  status text not null default 'open' check (status in ('open', 'in_progress', 'resolved')),
  created_from text not null check (created_from in ('document_expiry_sweep', 'check_defect', 'manual_defect', 'maintenance_schedule')),
  source_document_id uuid,
  source_defect_id uuid,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references profiles(id)
);

create index if not exists fleet_tasks_vehicle_idx on fleet_tasks (vehicle_id);
create index if not exists fleet_tasks_status_idx on fleet_tasks (status);

alter table fleet_tasks enable row level security;

create policy fleet_tasks_dispatcher_manage on fleet_tasks for all
  using (is_dispatcher())
  with check (is_dispatcher());

grant select, insert, update, delete on public.fleet_tasks to authenticated;
grant select, insert, update, delete on public.fleet_tasks to service_role;
