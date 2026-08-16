-- operational_stops / operational_stop_passengers: build spec §20.
-- Multiple requirements at one address group into a single stop - Office
-- confirms grouping, never automatic (grouping = simply pointing several
-- operational_stop_passengers rows, or several booking_passengers via a
-- shared address, at the same operational_stops row; there is no separate
-- "grouping" table).
--
-- RLS is dispatcher-only on both tables, deliberately with NO driver
-- policy - same deny-by-default convention as passengers/booking_passengers
-- in Phase 1. A driver's entire view of stops (which ones, in what order,
-- who's at each) comes exclusively through get_driver_stop_manifest() in
-- 0027, and driver status updates go exclusively through
-- record_stop_arrival()/record_stop_departure()/record_stop_problem() -
-- all security-definer, all scoped by driver_covers_stop(). This means a
-- compromised or buggy client can never read or write a stop outside the
-- driver's own assignment, regardless of what row-level grants exist,
-- because there simply are no direct grants for the driver role here.
create table if not exists operational_stops (
  id uuid primary key default gen_random_uuid(),
  departure_id uuid not null references departures(id) on delete cascade,
  departure_vehicle_id uuid references departure_vehicles(id),
  address_id uuid not null references addresses(id),
  stop_type text not null check (stop_type in ('pickup', 'dropoff', 'crossing', 'waypoint')),
  planned_sequence int not null default 0,
  planned_arrival_at timestamptz,
  actual_arrival_at timestamptz,
  actual_departure_at timestamptz,
  passengers_expected int not null default 0,
  luggage_expected int not null default 0,
  parcels_expected int not null default 0,
  locked boolean not null default false,
  driver_notes text,
  status text not null default 'pending' check (status in ('pending', 'arrived', 'completed', 'skipped', 'problem')),
  created_at timestamptz not null default now()
);

create index if not exists operational_stops_departure_idx on operational_stops (departure_id, planned_sequence);

create table if not exists operational_stop_passengers (
  id uuid primary key default gen_random_uuid(),
  operational_stop_id uuid not null references operational_stops(id) on delete cascade,
  booking_passenger_id uuid not null references booking_passengers(id) on delete cascade,
  role text not null check (role in ('pickup', 'dropoff')),
  boarded boolean not null default false,
  unique (operational_stop_id, booking_passenger_id, role)
);

create index if not exists operational_stop_passengers_stop_idx on operational_stop_passengers (operational_stop_id);
create index if not exists operational_stop_passengers_bp_idx on operational_stop_passengers (booking_passenger_id);

alter table operational_stops enable row level security;
alter table operational_stop_passengers enable row level security;

create policy operational_stops_dispatcher_manage on operational_stops for all
  using (is_dispatcher())
  with check (is_dispatcher());

create policy operational_stop_passengers_dispatcher_manage on operational_stop_passengers for all
  using (is_dispatcher())
  with check (is_dispatcher());

grant select, insert, update, delete on public.operational_stops to authenticated;
grant select, insert, update, delete on public.operational_stops to service_role;
grant select, insert, update, delete on public.operational_stop_passengers to authenticated;
grant select, insert, update, delete on public.operational_stop_passengers to service_role;
