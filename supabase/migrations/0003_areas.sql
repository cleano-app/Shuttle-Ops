-- areas: operational groupings addresses belong to (build spec §17), e.g.
-- Stamford Hill, Golders Green, Berchem, Wilrijk. running_order gives the
-- basic route sequence, set once by someone who knows the roads — used by
-- Phase 2 dispatch, not touched by Phase 1 booking logic itself.
create table if not exists areas (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  country text not null,
  running_order int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table areas enable row level security;

-- Broad authenticated read: every address form (booking console included)
-- needs to populate an area picker regardless of role.
create policy areas_select_authenticated on areas for select
  using (auth.uid() is not null);

create policy areas_dispatcher_manage on areas for all
  using (is_dispatcher())
  with check (is_dispatcher());

grant select on public.areas to authenticated;
grant insert, update, delete on public.areas to authenticated;
grant select, insert, update, delete on public.areas to service_role;
