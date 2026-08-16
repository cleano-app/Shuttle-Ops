-- route_templates / route_template_stops: build spec §18. Dispatcher
-- applies a standard template to a new departure (materializing
-- operational_stops rows, 0024) rather than building the stop sequence
-- from scratch each time. default_offset_minutes is a rough same-day
-- estimate; leg_timings (0021) supersedes it once real history exists.
create table if not exists route_templates (
  id uuid primary key default gen_random_uuid(),
  route_id uuid not null references routes(id),
  direction text not null check (direction in ('outbound', 'return')),
  name text not null,
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists route_template_stops (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references route_templates(id) on delete cascade,
  address_id uuid references addresses(id),
  area_id uuid references areas(id),
  sequence int not null default 0,
  default_offset_minutes int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists route_template_stops_template_idx on route_template_stops (template_id);

alter table route_templates enable row level security;
alter table route_template_stops enable row level security;

create policy route_templates_select on route_templates for select
  using (is_dispatcher());
create policy route_templates_manage on route_templates for all
  using (is_dispatcher())
  with check (is_dispatcher());

create policy route_template_stops_select on route_template_stops for select
  using (is_dispatcher());
create policy route_template_stops_manage on route_template_stops for all
  using (is_dispatcher())
  with check (is_dispatcher());

grant select, insert, update, delete on public.route_templates to authenticated;
grant select, insert, update, delete on public.route_templates to service_role;
grant select, insert, update, delete on public.route_template_stops to authenticated;
grant select, insert, update, delete on public.route_template_stops to service_role;
