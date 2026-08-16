-- deposits: build spec §10 — commitment devices, accounted separately from
-- passenger contributions (never revenue unless retained). take_payments_ref
-- exists as a column but is never populated by a live integration in
-- Phase 1: live Take Payments is explicitly Phase 4 (§39), so deposits here
-- are recorded manually by Office (cash/bank transfer reference typed into
-- `method`/`notes`) via src/app/actions/deposits.ts.
create table if not exists deposits (
  id uuid primary key default gen_random_uuid(),
  booking_passenger_id uuid not null references booking_passengers(id) on delete cascade,
  amount numeric(10, 2) not null,
  currency text not null check (currency in ('GBP', 'EUR')),
  status text not null default 'required'
    check (status in ('required', 'pending', 'secured', 'released', 'retained', 'waived')),
  method text,
  take_payments_ref text,
  taken_by_user_id uuid references profiles(id),
  taken_at timestamptz,
  released_at timestamptz,
  retained_at timestamptz,
  retained_amount numeric(10, 2),
  reason_code text,
  decided_by_user_id uuid references profiles(id),
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists deposits_booking_passenger_idx on deposits (booking_passenger_id);

alter table deposits enable row level security;

create policy deposits_office_manage on deposits for all
  using (is_office())
  with check (is_office());

grant select, insert, update, delete on public.deposits to authenticated;
grant select, insert, update, delete on public.deposits to service_role;
