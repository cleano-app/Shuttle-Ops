-- bookings: build spec §9. One row per booking attempt (a group of
-- passengers travelling together on one departure); the individual
-- passenger rows and their capacity consumption live in booking_passengers
-- (0015).
create sequence if not exists booking_reference_seq;

create table if not exists bookings (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique
    default ('B-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('booking_reference_seq')::text, 6, '0')),
  trip_id uuid references trips(id) on delete cascade,
  departure_id uuid not null references departures(id),
  lead_passenger_id uuid not null references passengers(id),
  channel text not null default 'phone' check (channel in ('phone', 'office', 'online')),
  status text not null default 'provisional'
    check (status in ('provisional', 'deposit_pending', 'confirmed', 'travelled', 'cancelled', 'no_show', 'expired')),
  provisional_expires_at timestamptz,
  booked_by_user_id uuid references profiles(id),
  notes text,
  created_at timestamptz not null default now()
);

-- Resolves trips' forward reference to bookings (see 0013's comment).
alter table trips
  add constraint trips_outbound_booking_fk foreign key (outbound_booking_id) references bookings(id);
alter table trips
  add constraint trips_return_booking_fk foreign key (return_booking_id) references bookings(id);

create index if not exists bookings_departure_idx on bookings (departure_id);
create index if not exists bookings_status_idx on bookings (status);
create index if not exists bookings_trip_idx on bookings (trip_id);

alter table bookings enable row level security;

create policy bookings_office_manage on bookings for all
  using (is_office())
  with check (is_office());

grant select, insert, update, delete on public.bookings to authenticated;
grant select, insert, update, delete on public.bookings to service_role;
