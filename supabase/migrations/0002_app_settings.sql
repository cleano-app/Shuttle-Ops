-- app_settings: singleton row for operational configuration. Same pattern
-- as Cleano Ops's app_settings (0060_billing_entities_contacts_sites.sql) —
-- `id boolean primary key default true check (id)` makes a second row
-- structurally impossible.
--
-- unsecured_provisional_cap_pct: build spec §6 principle 6 — cap unsecured
-- provisional capacity at a configurable share, initially 30%. Read by the
-- capacity allocation function (0018).
-- provisional_expiry_hours: how long an unsecured provisional booking holds
-- capacity before the lazy expiry sweep (bookings.ts's
-- expireStaleProvisionalBookings) releases it.
create table if not exists app_settings (
  id boolean primary key default true check (id),
  unsecured_provisional_cap_pct int not null default 30
    check (unsecured_provisional_cap_pct between 0 and 100),
  provisional_expiry_hours int not null default 48
    check (provisional_expiry_hours > 0),
  updated_at timestamptz not null default now()
);

insert into app_settings (id) values (true) on conflict (id) do nothing;

alter table app_settings enable row level security;

create policy app_settings_dispatcher_read on app_settings for select
  using (is_dispatcher());

create policy app_settings_admin_write on app_settings for all
  using (is_admin())
  with check (is_admin());

grant select, insert, update, delete on public.app_settings to authenticated;
grant select, insert, update, delete on public.app_settings to service_role;
