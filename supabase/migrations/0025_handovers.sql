-- handovers: build spec §23. "Both drivers confirm." Creation and
-- confirmation both go through security-definer functions in 0027
-- (create_handover / confirm_handover), not direct table writes — a raw
-- RLS policy letting either driver UPDATE the row would let the FROM
-- driver forge the TO driver's signature (or vice versa), which defeats
-- the point of a record meant to establish exactly who was responsible
-- when. Drivers get read-only access to handovers they're a party to;
-- Office/Dispatcher can read and manage everything.
create table if not exists handovers (
  id uuid primary key default gen_random_uuid(),
  departure_id uuid not null references departures(id) on delete cascade,
  vehicle_id uuid not null references vehicles(id),
  stop_id uuid references operational_stops(id),
  from_driver_id uuid not null references profiles(id),
  to_driver_id uuid not null references profiles(id),
  occurred_at timestamptz,
  odometer int,
  fuel_level text,
  cash_float_gbp numeric(10, 2),
  cash_float_eur numeric(10, 2),
  passenger_count_confirmed int,
  parcel_count_confirmed int,
  keys_transferred boolean not null default false,
  notes text,
  from_signature text,
  to_signature text,
  created_at timestamptz not null default now()
);

create index if not exists handovers_departure_idx on handovers (departure_id);

alter table handovers enable row level security;

create policy handovers_dispatcher_manage on handovers for all
  using (is_dispatcher())
  with check (is_dispatcher());

create policy handovers_driver_select_own on handovers for select
  using (is_driver() and (from_driver_id = auth.uid() or to_driver_id = auth.uid()));

grant select, insert, update, delete on public.handovers to authenticated;
grant select, insert, update, delete on public.handovers to service_role;
