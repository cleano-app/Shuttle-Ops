-- vehicle_maintenance: build spec §30. Office/Admin only — cost/supplier
-- data, no driver access needed (drivers report defects; scheduling and
-- paying for the fix is an Office job).
create table if not exists vehicle_maintenance (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references vehicles(id),
  type text not null,
  scheduled_at date,
  completed_at date,
  mileage int,
  supplier text,
  cost numeric(10, 2),
  currency text check (currency in ('GBP', 'EUR')),
  notes text,
  document_path text,
  created_at timestamptz not null default now()
);

create index if not exists vehicle_maintenance_vehicle_idx on vehicle_maintenance (vehicle_id);

alter table vehicle_maintenance enable row level security;

create policy vehicle_maintenance_office_manage on vehicle_maintenance for all
  using (is_office())
  with check (is_office());

create policy vehicle_maintenance_dispatcher_read on vehicle_maintenance for select
  using (is_dispatcher());

grant select, insert, update, delete on public.vehicle_maintenance to authenticated;
grant select, insert, update, delete on public.vehicle_maintenance to service_role;
