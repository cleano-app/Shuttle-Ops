-- tariffs: per-route/direction/category dual-currency pricing (build spec
-- §14/§34). direction/category nullable = "applies to all" (a fallback row
-- per route). Fare computation happens in TypeScript
-- (src/lib/tariffs/computeFare.ts), NOT in the capacity allocation function
-- (0018) — that keeps the DB function focused purely on capacity math, and
-- keeps pricing logic testable as plain unit tests. Prices are copied onto
-- booking_passengers at booking time (§14) — this table is never joined
-- against for historical bookings.
create table if not exists tariffs (
  id uuid primary key default gen_random_uuid(),
  route_id uuid not null references routes(id),
  direction text check (direction in ('outbound', 'return')),
  category text check (category in ('man', 'woman', 'boy', 'girl', 'infant')),
  base_fare_gbp numeric(10, 2) not null,
  base_fare_eur numeric(10, 2) not null,
  luggage_large_allowance int not null default 0,
  luggage_small_allowance int not null default 0,
  luggage_hand_allowance int not null default 1,
  luggage_additional_charge_gbp numeric(10, 2) not null default 0,
  luggage_additional_charge_eur numeric(10, 2) not null default 0,
  luggage_oversize_charge_gbp numeric(10, 2) not null default 0,
  luggage_oversize_charge_eur numeric(10, 2) not null default 0,
  capacity_units_per_large int not null default 1,
  capacity_units_per_small int not null default 1,
  capacity_units_per_oversize int not null default 2,
  effective_from date not null default current_date,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists tariffs_route_idx on tariffs (route_id);

alter table tariffs enable row level security;

create policy tariffs_dispatcher_read on tariffs for select
  using (is_dispatcher());

create policy tariffs_office_manage on tariffs for all
  using (is_office())
  with check (is_office());

grant select, insert, update, delete on public.tariffs to authenticated;
grant select, insert, update, delete on public.tariffs to service_role;
