-- parcel_tariffs: dual-currency pricing by size category (build spec §15
-- Phase 3 scope: "parcel pricing and hold capacity"), same independently-
-- set-per-currency convention as passenger `tariffs` (§34) — no live FX,
-- no conversion between _gbp and _eur.
create table if not exists parcel_tariffs (
  id uuid primary key default gen_random_uuid(),
  route_id uuid not null references routes(id),
  size_category text not null check (size_category in ('small', 'medium', 'large', 'oversize')),
  price_gbp numeric(10, 2) not null,
  price_eur numeric(10, 2) not null,
  capacity_units int not null default 1,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table parcel_tariffs enable row level security;

create policy parcel_tariffs_dispatcher_read on parcel_tariffs for select
  using (is_dispatcher());
create policy parcel_tariffs_office_manage on parcel_tariffs for all
  using (is_office())
  with check (is_office());

grant select, insert, update, delete on public.parcel_tariffs to authenticated;
grant select, insert, update, delete on public.parcel_tariffs to service_role;

-- parcels: build spec §15. Shares physical hold capacity with passenger
-- luggage — departures.hold_capacity_units covers both, enforced together
-- in allocate_booking_capacity() (updated in 0037 to stop treating the
-- parcel check as a no-op now that this table exists). units_consumed is
-- copied from parcel_tariffs.capacity_units at booking time, same
-- copy-on-booking rule as passenger luggage (§14): a later tariff change
-- must never alter an already-booked parcel's numbers.
create sequence if not exists parcel_reference_seq;

create table if not exists parcels (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique
    default ('P-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('parcel_reference_seq')::text, 6, '0')),
  departure_id uuid not null references departures(id),
  departure_vehicle_id uuid references departure_vehicles(id),
  sender_name text not null,
  sender_phone text,
  sender_address_id uuid references addresses(id),
  recipient_name text not null,
  recipient_phone text,
  recipient_address_id uuid references addresses(id),
  quantity int not null default 1 check (quantity > 0),
  size_category text not null check (size_category in ('small', 'medium', 'large', 'oversize')),
  units_consumed int not null default 1,
  description text,
  special_instructions text,
  prohibited_items_declared boolean not null default false,
  price numeric(10, 2) not null default 0,
  currency text not null check (currency in ('GBP', 'EUR')),
  payment_status text not null default 'pending' check (payment_status in ('pending', 'paid', 'refunded')),
  payment_ref text,
  status text not null default 'booked' check (
    status in ('booked', 'collection_due', 'collected', 'onboard', 'delivery_due', 'delivered', 'cancelled', 'failed_collection', 'failed_delivery')
  ),
  collected_at timestamptz,
  delivered_at timestamptz,
  proof_photo_path text,
  proof_signature_name text,
  failure_reason text,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  -- Build spec §15: "A prohibited-items declaration is required" — the
  -- booking simply cannot be created without it, enforced the same blunt
  -- way as the notional_fare balance check on booking_passengers.
  check (prohibited_items_declared = true)
);

create index if not exists parcels_departure_idx on parcels (departure_id);
create index if not exists parcels_status_idx on parcels (status);

alter table parcels enable row level security;

-- Dispatcher-only, same deny-by-default convention as booking_passengers -
-- a driver's view of "which parcels am I collecting/delivering" comes
-- through get_driver_stop_manifest() (extended in 0038), not raw table
-- access, since parcels carry recipient/sender contact details.
create policy parcels_dispatcher_manage on parcels for all
  using (is_dispatcher())
  with check (is_dispatcher());

grant select, insert, update, delete on public.parcels to authenticated;
grant select, insert, update, delete on public.parcels to service_role;

-- operational_stop_parcels: the parcel equivalent of Phase 2's
-- operational_stop_passengers (§20: "Join tables associate passengers and
-- parcels with each stop").
create table if not exists operational_stop_parcels (
  id uuid primary key default gen_random_uuid(),
  operational_stop_id uuid not null references operational_stops(id) on delete cascade,
  parcel_id uuid not null references parcels(id) on delete cascade,
  role text not null check (role in ('collection', 'delivery')),
  unique (operational_stop_id, parcel_id, role)
);

create index if not exists operational_stop_parcels_stop_idx on operational_stop_parcels (operational_stop_id);
create index if not exists operational_stop_parcels_parcel_idx on operational_stop_parcels (parcel_id);

alter table operational_stop_parcels enable row level security;

create policy operational_stop_parcels_dispatcher_manage on operational_stop_parcels for all
  using (is_dispatcher())
  with check (is_dispatcher());

grant select, insert, update, delete on public.operational_stop_parcels to authenticated;
grant select, insert, update, delete on public.operational_stop_parcels to service_role;
