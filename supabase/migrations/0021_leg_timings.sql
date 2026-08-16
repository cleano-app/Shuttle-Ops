-- leg_timings: historical operational ETA (build spec §19). No live traffic
-- API — this table is fed by completed journeys via a nightly recompute
-- job, which is explicitly Phase 4 ("leg-timing history job" in §39's
-- Phase 4 list). Phase 2 ships the table and a read path that ALWAYS falls
-- back to the route template's default_offset_minutes when no history
-- exists yet (sample_count = 0 for every row until Phase 4's job runs) —
-- per §19: "Where history is insufficient, fall back to the route
-- template's default timings and show it as an estimate."
--
-- Must never be presented as live traffic information (§19) — enforced in
-- the UI layer (src/lib/eta/estimateLegMinutes.ts labels its output
-- accordingly), not something the schema itself can guarantee.
create table if not exists leg_timings (
  id uuid primary key default gen_random_uuid(),
  from_area_id uuid not null references areas(id),
  to_area_id uuid not null references areas(id),
  day_of_week int not null check (day_of_week between 0 and 6),
  time_band text not null,
  sample_count int not null default 0 check (sample_count >= 0),
  median_minutes int,
  last_updated timestamptz not null default now(),
  unique (from_area_id, to_area_id, day_of_week, time_band)
);

alter table leg_timings enable row level security;

create policy leg_timings_dispatcher_read on leg_timings for select
  using (is_dispatcher());

create policy leg_timings_office_manage on leg_timings for all
  using (is_office())
  with check (is_office());

grant select, insert, update, delete on public.leg_timings to authenticated;
grant select, insert, update, delete on public.leg_timings to service_role;
