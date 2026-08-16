-- trips: links outbound and return travel (build spec §9). Where both legs
-- are booked together, allocation is transactional — both succeed or
-- neither does (enforced by allocate_trip_capacity() in 0018, a single
-- Postgres function call spanning both legs).
--
-- outbound_booking_id/return_booking_id reference `bookings`, which doesn't
-- exist yet at this point in the migration order — the FK constraints are
-- added in 0014 once bookings does, to avoid a forward reference. The
-- columns themselves are plain uuid here so trips can be created before
-- either leg exists (allocate_trip_capacity() inserts the trip row first,
-- then updates these columns as each leg's booking is created).
create sequence if not exists trip_reference_seq;

create table if not exists trips (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique
    default ('T-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('trip_reference_seq')::text, 6, '0')),
  lead_passenger_id uuid not null references passengers(id),
  outbound_booking_id uuid,
  return_booking_id uuid,
  status text not null default 'provisional' check (status in ('provisional', 'confirmed', 'cancelled')),
  created_at timestamptz not null default now()
);

alter table trips enable row level security;

create policy trips_office_manage on trips for all
  using (is_office())
  with check (is_office());

grant select, insert, update, delete on public.trips to authenticated;
grant select, insert, update, delete on public.trips to service_role;
