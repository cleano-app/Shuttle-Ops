-- Driver pay fields on profiles: build spec §25's three pay models
-- (hourly/per_trip/per_day) plus a per-driver rate — same convention as
-- Cleano Ops's profiles.payment_type/pay_rate for workers. Nullable: a
-- driver with no rate set yet just can't have a suggested amount computed
-- until Office sets one, rather than defaulting to a wrong number.
alter table profiles add column if not exists pay_type text check (pay_type in ('hourly', 'per_trip', 'per_day'));
alter table profiles add column if not exists pay_rate numeric(10, 2);

-- driver_expenses: build spec §25.
create table if not exists driver_expenses (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid not null references profiles(id),
  departure_id uuid references departures(id),
  type text not null check (type in ('fuel', 'toll', 'crossing', 'parking', 'meal', 'other')),
  amount numeric(10, 2) not null,
  currency text not null check (currency in ('GBP', 'EUR')),
  receipt_storage_path text,
  approved_by uuid references profiles(id),
  approved_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists driver_expenses_driver_idx on driver_expenses (driver_id);

alter table driver_expenses enable row level security;

create policy driver_expenses_office_manage on driver_expenses for all
  using (is_office())
  with check (is_office());

create policy driver_expenses_driver_select_own on driver_expenses for select
  using (is_driver() and driver_id = auth.uid());

create policy driver_expenses_driver_insert on driver_expenses for insert
  with check (is_driver() and driver_id = auth.uid());

grant select, insert, update, delete on public.driver_expenses to authenticated;
grant select, insert, update, delete on public.driver_expenses to service_role;

-- driver_pay_statements: build spec §25. "Statement, not invoice" - no
-- invoice wording, no VAT lines, self-employed drivers issue their own
-- invoices to the charity. total_hours/total_trips/base_pay are the
-- SUGGESTED figures computed from duty log data; Office approves the
-- final `total` (which may differ via `adjustments`) - the suggestion is
-- never auto-paid.
create table if not exists driver_pay_statements (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid not null references profiles(id),
  period_start date not null,
  period_end date not null,
  total_hours numeric(6, 2) not null default 0,
  total_trips int not null default 0,
  base_pay numeric(10, 2) not null default 0,
  adjustments numeric(10, 2) not null default 0,
  expenses_reimbursed numeric(10, 2) not null default 0,
  total numeric(10, 2) not null default 0,
  status text not null default 'draft' check (status in ('draft', 'approved', 'paid')),
  approved_by uuid references profiles(id),
  generated_at timestamptz not null default now()
);

create index if not exists driver_pay_statements_driver_idx on driver_pay_statements (driver_id, period_start);

alter table driver_pay_statements enable row level security;

create policy driver_pay_statements_office_manage on driver_pay_statements for all
  using (is_office())
  with check (is_office());

create policy driver_pay_statements_driver_select_own on driver_pay_statements for select
  using (is_driver() and driver_id = auth.uid());

grant select, insert, update, delete on public.driver_pay_statements to authenticated;
grant select, insert, update, delete on public.driver_pay_statements to service_role;
