-- routes: minimal record so departures.route_id has an FK target. Full
-- route templates and template stops (build spec §18) are Phase 2 — this
-- table intentionally carries no stop sequence of its own yet.
create table if not exists routes (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text unique,
  origin_area_id uuid references areas(id),
  destination_area_id uuid references areas(id),
  supports_return boolean not null default true,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table routes enable row level security;

create policy routes_select_authenticated on routes for select
  using (auth.uid() is not null);

create policy routes_dispatcher_manage on routes for all
  using (is_dispatcher())
  with check (is_dispatcher());

grant select on public.routes to authenticated;
grant insert, update, delete on public.routes to authenticated;
grant select, insert, update, delete on public.routes to service_role;
