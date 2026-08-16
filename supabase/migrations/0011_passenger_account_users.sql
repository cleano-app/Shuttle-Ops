-- passenger_account_users: mirrors Cleano Ops's customer_account_users
-- exactly. No passenger-portal UI is built on top of this in Phase 1 (build
-- spec §39 scope) — the table exists now so a Passenger/Referrer account
-- overlap later needs no schema change, same rationale Cleano Ops used for
-- customer_id not being unique on its own join table.
create table if not exists passenger_account_users (
  id uuid primary key default gen_random_uuid(),
  passenger_id uuid not null references passengers(id) on delete cascade,
  user_id uuid not null unique references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table passenger_account_users enable row level security;

create policy passenger_account_users_self on passenger_account_users for select
  using (user_id = auth.uid());

create policy passenger_account_users_office_manage on passenger_account_users for all
  using (is_office())
  with check (is_office());

grant select on public.passenger_account_users to authenticated;
grant insert, update, delete on public.passenger_account_users to authenticated;
grant select, insert, update, delete on public.passenger_account_users to service_role;
