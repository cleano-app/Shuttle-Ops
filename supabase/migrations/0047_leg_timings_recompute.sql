-- recompute_leg_timings: build spec §19's nightly recompute job. No real
-- cron/scheduled-job infrastructure exists in this app (documented as a
-- gap since Phase 2's leg_timings table was created) — this function does
-- the actual recompute work and is callable on demand (a button on the
-- fleet/reports screen, or a future scheduled trigger once real cron
-- exists), rather than shipping the aggregation logic with nowhere to run
-- it. Bucketing (3-hour time bands, e.g. "06-09") matches
-- src/lib/eta/estimateLegMinutes.ts's computeTimeBand() exactly, so
-- historical data recomputed here lines up with what the TS estimator
-- looks up.
create or replace function recompute_leg_timings()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  if not is_office() then
    raise using message = 'not_authorized';
  end if;

  with leg_samples as (
    select
      a1.area_id as from_area_id,
      a2.area_id as to_area_id,
      extract(dow from os2.actual_arrival_at)::int as day_of_week,
      (floor(extract(hour from os2.actual_arrival_at) / 3) * 3)::int as band_start,
      extract(epoch from (os2.actual_arrival_at - os1.actual_departure_at)) / 60.0 as minutes
    from operational_stops os1
    join operational_stops os2
      on os2.departure_id = os1.departure_id
      and os2.planned_sequence = os1.planned_sequence + 1
    join addresses a1 on a1.id = os1.address_id
    join addresses a2 on a2.id = os2.address_id
    where os1.actual_departure_at is not null
      and os2.actual_arrival_at is not null
      and a1.area_id is not null
      and a2.area_id is not null
      and os2.actual_arrival_at > os1.actual_departure_at
  ),
  aggregated as (
    select
      from_area_id,
      to_area_id,
      day_of_week,
      lpad(band_start::text, 2, '0') || '-' || lpad(((band_start + 3) % 24)::text, 2, '0') as time_band,
      count(*) as sample_count,
      percentile_cont(0.5) within group (order by minutes)::int as median_minutes
    from leg_samples
    group by from_area_id, to_area_id, day_of_week, band_start
  )
  insert into leg_timings (from_area_id, to_area_id, day_of_week, time_band, sample_count, median_minutes, last_updated)
  select from_area_id, to_area_id, day_of_week, time_band, sample_count, median_minutes, now()
  from aggregated
  on conflict (from_area_id, to_area_id, day_of_week, time_band)
  do update set
    sample_count = excluded.sample_count,
    median_minutes = excluded.median_minutes,
    last_updated = now();

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

grant execute on function recompute_leg_timings() to authenticated;
