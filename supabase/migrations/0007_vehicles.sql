-- vehicles: basic fleet record (build spec §27). Full compliance/documents/
-- checks/defects/maintenance (§28-30) are explicitly Phase 3 — only the
-- fields needed to assign a vehicle to a departure and snapshot its
-- capacity exist here.
create table if not exists vehicles (
  id uuid primary key default gen_random_uuid(),
  registration text not null unique,
  make_model text,
  seat_capacity int not null check (seat_capacity >= 0),
  hold_capacity_units int not null default 0 check (hold_capacity_units >= 0),
  wheelchair_capacity int not null default 0 check (wheelchair_capacity >= 0),
  current_mileage int,
  status text not null default 'available'
    check (status in ('available', 'assigned', 'maintenance', 'defect', 'accident', 'unavailable')),
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table vehicles enable row level security;

create policy vehicles_dispatcher_manage on vehicles for all
  using (is_dispatcher())
  with check (is_dispatcher());

grant select, insert, update, delete on public.vehicles to authenticated;
grant select, insert, update, delete on public.vehicles to service_role;
