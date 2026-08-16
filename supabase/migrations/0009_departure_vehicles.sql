-- departure_vehicles: vehicles assigned to a departure (build spec §7).
-- Capacity columns are a SNAPSHOT taken from `vehicles` at assignment time
-- by the server action (src/app/actions/vehicles.ts's
-- assignVehicleToDeparture) — never derived live from a join — so a later
-- edit to a vehicle's capacity doesn't retroactively change a departure
-- that already ran with the old numbers.
create table if not exists departure_vehicles (
  id uuid primary key default gen_random_uuid(),
  departure_id uuid not null references departures(id) on delete cascade,
  vehicle_id uuid not null references vehicles(id),
  seats_capacity int not null check (seats_capacity >= 0),
  hold_capacity_units int not null default 0 check (hold_capacity_units >= 0),
  wheelchair_capacity int not null default 0 check (wheelchair_capacity >= 0),
  sequence int not null default 0,
  created_at timestamptz not null default now(),
  unique (departure_id, vehicle_id)
);

alter table departure_vehicles enable row level security;

create policy departure_vehicles_dispatcher_manage on departure_vehicles for all
  using (is_dispatcher())
  with check (is_dispatcher());

grant select, insert, update, delete on public.departure_vehicles to authenticated;
grant select, insert, update, delete on public.departure_vehicles to service_role;
