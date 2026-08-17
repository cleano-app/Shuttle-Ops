-- disruption_events: build spec §36. Records the bulk re-accommodation
-- decision itself (vehicle off the road, crossing cancelled, driver
-- unavailable); the actual passenger moves happen via
-- allocate_booking_capacity() calls (one per moved passenger, run inside
-- the same disruption action) so every move still passes the full
-- capacity check on the target departure — no separate "disruption
-- capacity" bypass exists.
create table if not exists disruption_events (
  id uuid primary key default gen_random_uuid(),
  departure_id uuid not null references departures(id),
  type text not null check (type in ('vehicle_off_road', 'crossing_cancelled', 'driver_unavailable', 'other')),
  reason text not null,
  decided_by uuid not null references profiles(id),
  occurred_at timestamptz not null default now(),
  passengers_moved int not null default 0,
  passengers_unplaced int not null default 0,
  notes text
);

alter table disruption_events enable row level security;

create policy disruption_events_office_manage on disruption_events for all
  using (is_office())
  with check (is_office());

grant select, insert, update, delete on public.disruption_events to authenticated;
grant select, insert, update, delete on public.disruption_events to service_role;

-- waitlist: build spec §13. "When capacity frees, the system reruns the
-- full capacity check before making an offer" - the offer/convert logic
-- itself lives in application code (src/app/actions/waitlist.ts), calling
-- the same allocate_booking_capacity() function everything else does; this
-- table just tracks who's waiting and the state of any offer made to them.
create table if not exists waitlist (
  id uuid primary key default gen_random_uuid(),
  departure_id uuid not null references departures(id),
  passenger_id uuid not null references passengers(id),
  seats_wanted int not null default 1,
  luggage_estimate int not null default 0,
  wheelchair_requirement boolean not null default false,
  created_at timestamptz not null default now(),
  notified_at timestamptz,
  expires_at timestamptz,
  status text not null default 'waiting' check (status in ('waiting', 'offered', 'converted', 'lapsed'))
);

create index if not exists waitlist_departure_idx on waitlist (departure_id, status);

alter table waitlist enable row level security;

create policy waitlist_office_manage on waitlist for all
  using (is_office())
  with check (is_office());

grant select, insert, update, delete on public.waitlist to authenticated;
grant select, insert, update, delete on public.waitlist to service_role;
