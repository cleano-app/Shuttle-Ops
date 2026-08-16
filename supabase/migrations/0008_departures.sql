-- departures: one live capacity pool per departure (build spec §6, core
-- principle 1). seats_released is Office-controlled; provisional/confirmed/
-- travelled counts are never stored here — always recalculated from
-- booking_passengers (see 0018's capacity function and the
-- departure_capacity_summary view in 0020).
--
-- crossing_cost is split into _gbp/_eur per §34's dual-currency rule: every
-- monetary field is independently set by hand, never converted.
create table if not exists departures (
  id uuid primary key default gen_random_uuid(),
  route_id uuid not null references routes(id),
  direction text not null check (direction in ('outbound', 'return')),
  depart_at timestamptz not null,
  arrive_estimate timestamptz,
  status text not null default 'draft'
    check (status in ('draft', 'published', 'boarding', 'departed', 'completed', 'cancelled')),
  seats_capacity int not null check (seats_capacity >= 0),
  seats_released int not null default 0 check (seats_released >= 0),
  hold_capacity_units int not null default 0 check (hold_capacity_units >= 0),
  parcel_units_reserved int not null default 0 check (parcel_units_reserved >= 0),
  wheelchair_capacity int not null default 0 check (wheelchair_capacity >= 0),
  crossing_reference text,
  crossing_passenger_limit int,
  crossing_cost_gbp numeric(10, 2),
  crossing_cost_eur numeric(10, 2),
  crossing_checkin_deadline timestamptz,
  notes text,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  check (seats_released <= seats_capacity)
);

create index if not exists departures_depart_at_idx on departures (depart_at);
create index if not exists departures_status_idx on departures (status);
create index if not exists departures_route_idx on departures (route_id);

alter table departures enable row level security;

-- Dispatcher (which includes Office/Admin via is_dispatcher()) manages
-- departures. No driver/passenger policy in Phase 1 — no driver route
-- screen or passenger portal exists yet to use one (build spec §39 phasing).
create policy departures_dispatcher_manage on departures for all
  using (is_dispatcher())
  with check (is_dispatcher());

grant select, insert, update, delete on public.departures to authenticated;
grant select, insert, update, delete on public.departures to service_role;
