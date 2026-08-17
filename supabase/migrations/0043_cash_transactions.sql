-- cash_transactions: build spec §26. "Driver cash must never exist only
-- as a note or a handover balance." GBP and EUR are tracked as separate
-- rows (never netted, per §26) - a single transaction is always one
-- currency.
--
-- Direct driver RLS insert for their own transactions (same ownership-
-- only pattern as driver_duty_events/vehicle_checks) - booking_id/
-- parcel_id are opaque references here, not a route to reading the
-- underlying passenger/parcel row (booking_passengers/parcels stay
-- dispatcher-only RLS regardless), so recording "I collected £20 against
-- booking X" doesn't leak anything a driver couldn't already see on their
-- own manifest.
create table if not exists cash_transactions (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid not null references profiles(id),
  departure_id uuid references departures(id),
  booking_id uuid references bookings(id),
  parcel_id uuid references parcels(id),
  transaction_type text not null check (
    transaction_type in (
      'passenger_contribution', 'deposit', 'luggage_charge', 'parcel_payment',
      'cash_refund', 'driver_to_driver_handover', 'driver_to_office_handover', 'opening_float'
    )
  ),
  currency text not null check (currency in ('GBP', 'EUR')),
  amount numeric(10, 2) not null,
  received_from text,
  received_at timestamptz not null default now(),
  handed_over_to uuid references profiles(id),
  handed_over_at timestamptz,
  reconciled_by uuid references profiles(id),
  reconciled_at timestamptz,
  notes text
);

create index if not exists cash_transactions_departure_idx on cash_transactions (departure_id);
create index if not exists cash_transactions_driver_idx on cash_transactions (driver_id);
create index if not exists cash_transactions_unreconciled_idx on cash_transactions (departure_id) where reconciled_at is null;

alter table cash_transactions enable row level security;

create policy cash_transactions_office_manage on cash_transactions for all
  using (is_office())
  with check (is_office());

create policy cash_transactions_driver_select_own on cash_transactions for select
  using (is_driver() and driver_id = auth.uid());

create policy cash_transactions_driver_insert on cash_transactions for insert
  with check (is_driver() and driver_id = auth.uid());

grant select, insert, update, delete on public.cash_transactions to authenticated;
grant select, insert, update, delete on public.cash_transactions to service_role;

-- Build spec §26: "Unreconciled cash blocks a departure from reaching
-- completed." A plain boolean function so the TS status-transition action
-- (transitionDepartureStatus) can check it with one call rather than
-- duplicating the query - and so the rule is enforced the same way
-- regardless of which code path tries the transition.
create or replace function departure_has_unreconciled_cash(p_departure_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from cash_transactions
    where departure_id = p_departure_id and reconciled_at is null
  );
$$;

grant execute on function departure_has_unreconciled_cash(uuid) to authenticated;
