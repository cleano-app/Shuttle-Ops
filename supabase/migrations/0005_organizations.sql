-- organizations: minimal placeholder for referrer and sponsor bodies.
-- Referrer login/portal is an explicitly later phase (build spec §4), and
-- sponsorship reporting is Phase 4, but passengers.referrer_org_id and
-- booking_passengers.sponsor_org_id (§8/§9) need an FK target now so those
-- columns don't require a later breaking migration.
create table if not exists organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  org_type text not null check (org_type in ('referrer', 'sponsor')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table organizations enable row level security;

create policy organizations_dispatcher_read on organizations for select
  using (is_dispatcher());

create policy organizations_office_manage on organizations for all
  using (is_office())
  with check (is_office());

grant select, insert, update, delete on public.organizations to authenticated;
grant select, insert, update, delete on public.organizations to service_role;
