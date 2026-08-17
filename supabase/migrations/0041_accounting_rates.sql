-- accounting_rates: build spec §34. Admin sets a fixed internal rate
-- periodically, used ONLY to consolidate reporting into one currency — it
-- never affects what a passenger is charged (every fare/deposit/parcel
-- price is independently set per currency, no live FX, per §34's own
-- dual-currency rule). Every consolidated report states the rate used, so
-- effective_to (nullable = still current) lets reports pick the rate that
-- was actually in force for a given historical period.
create table if not exists accounting_rates (
  id uuid primary key default gen_random_uuid(),
  effective_from date not null,
  effective_to date,
  gbp_per_eur numeric(10, 6) not null,
  set_by_user_id uuid not null references profiles(id),
  note text,
  created_at timestamptz not null default now()
);

create index if not exists accounting_rates_effective_idx on accounting_rates (effective_from);

alter table accounting_rates enable row level security;

create policy accounting_rates_dispatcher_read on accounting_rates for select
  using (is_dispatcher());
create policy accounting_rates_admin_manage on accounting_rates for all
  using (is_admin())
  with check (is_admin());

grant select, insert, update, delete on public.accounting_rates to authenticated;
grant select, insert, update, delete on public.accounting_rates to service_role;
