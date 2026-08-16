-- booking_passengers: build spec §9 — one row per travelling passenger on
-- a booking. This is the table the capacity allocation function (0018)
-- inserts into, and the one the notional_fare/contribution/sponsored/
-- subsidy CHECK constraint (§34) protects: "If it doesn't balance, the row
-- doesn't save."
--
-- pickup_address_snapshot/dropoff_address_snapshot preserve historical
-- integrity (§16): the address actually booked, captured at confirmation
-- time by src/lib/addresses/buildSnapshot.ts, alongside the live
-- pickup_address_id/dropoff_address_id FK. Editing or deactivating an
-- address later must never change what an existing booking shows.
create table if not exists booking_passengers (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references bookings(id) on delete cascade,
  passenger_id uuid not null references passengers(id),
  category text not null check (category in ('man', 'woman', 'boy', 'girl', 'infant')),
  -- Whether this passenger occupies a seat. False for an infant travelling
  -- on a lap. The man/woman/boy/girl-vs-infant restraint rule is
  -- jurisdiction/vehicle-dependent and explicitly unconfirmed pre-launch
  -- (build spec §40.2 item 1) — this flag exists precisely so that answer
  -- can be applied per-booking without a schema change.
  occupies_seat boolean not null default true,
  departure_vehicle_id uuid references departure_vehicles(id),
  pickup_address_id uuid references addresses(id),
  dropoff_address_id uuid references addresses(id),
  pickup_address_snapshot jsonb,
  dropoff_address_snapshot jsonb,
  mobility_needs text,
  wheelchair_space boolean not null default false,
  currency text not null check (currency in ('GBP', 'EUR')),
  notional_fare numeric(10, 2) not null default 0,
  contribution numeric(10, 2) not null default 0,
  sponsored numeric(10, 2) not null default 0,
  subsidy numeric(10, 2) not null default 0,
  sponsor_org_id uuid references organizations(id),
  deposit_required boolean not null default false,
  deposit_status text not null default 'not_required'
    check (deposit_status in ('not_required', 'required', 'pending', 'secured', 'released', 'retained', 'waived')),
  -- FK to waivers added in 0016 once that table exists (two-way reference,
  -- same pattern as trips -> bookings in 0013/0014).
  waiver_id uuid,
  luggage_large int not null default 0,
  luggage_small int not null default 0,
  luggage_hand int not null default 0,
  luggage_oversize int not null default 0,
  luggage_units_consumed int not null default 0,
  luggage_charge numeric(10, 2) not null default 0,
  boarded_at timestamptz,
  no_show boolean not null default false,
  status text not null default 'provisional'
    check (status in ('provisional', 'deposit_pending', 'confirmed', 'travelled', 'cancelled', 'no_show', 'expired')),
  created_at timestamptz not null default now(),
  -- Build spec §34, verbatim: the entire charitable-impact story rests on
  -- this balancing for every passenger, including free travellers.
  check (notional_fare = contribution + sponsored + subsidy)
);

create index if not exists booking_passengers_booking_idx on booking_passengers (booking_id);
create index if not exists booking_passengers_passenger_idx on booking_passengers (passenger_id);
create index if not exists booking_passengers_departure_vehicle_idx on booking_passengers (departure_vehicle_id);

alter table booking_passengers enable row level security;

-- Same deny-by-default rationale as passengers (0010): no dispatcher/driver
-- policy exists at all. A driver-scoped manifest read (name/category/
-- pickup/dropoff only, never vulnerability_notes/fares/deposits — those
-- live on `passengers` and this table respectively) is deferred to Phase 2,
-- once departures gain a driver-assignment column to scope "their assigned
-- departure" against. Adding a driver policy now would either be
-- meaninglessly unreachable (no driver UI exists to use it yet) or require
-- inventing scope columns ahead of the Phase 2 dispatch design.
create policy booking_passengers_office_manage on booking_passengers for all
  using (is_office())
  with check (is_office());

grant select, insert, update, delete on public.booking_passengers to authenticated;
grant select, insert, update, delete on public.booking_passengers to service_role;
