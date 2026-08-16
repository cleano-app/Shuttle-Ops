-- driver_duty_events: the duty log (build spec §24). Append-only event
-- stream, same event-sourced shape as Cleano Ops's worker_time_events,
-- extended with border/handover events for the cross-Channel leg.
--
-- Offline-first (§24 is explicit about this): the driver app queues
-- actions locally with a client-generated UUID and syncs when
-- connectivity returns. client_id is that UUID and carries a UNIQUE
-- constraint so replaying a queued action after reconnect is a harmless
-- no-op, not a duplicate row. client_occurred_at (when the driver's device
-- actually recorded the action) is stored separately from event_at (when
-- the server received it) to detect clock drift/late sync, matching
-- Cleano's worker_time_events client_occurred_at column.
--
-- "Driver actions are authoritative; the server never overwrites them" -
-- this table has no UPDATE/DELETE policy for drivers at all (append-only
-- from their side); only Office/Admin can correct a bad row, and even then
-- via a plain UPDATE they'd have to justify outside the system (no
-- automated correction path in Phase 2).
create table if not exists driver_duty_events (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid not null references profiles(id),
  vehicle_id uuid references vehicles(id),
  departure_id uuid references departures(id),
  event_type text not null check (event_type in ('start', 'arrived', 'break', 'fuel', 'border', 'handover', 'end')),
  event_at timestamptz not null default now(),
  client_occurred_at timestamptz,
  client_id uuid not null unique,
  odometer int,
  note text,
  created_at timestamptz not null default now()
);

create index if not exists driver_duty_events_driver_idx on driver_duty_events (driver_id, event_at);
create index if not exists driver_duty_events_departure_idx on driver_duty_events (departure_id);

alter table driver_duty_events enable row level security;

create policy driver_duty_events_dispatcher_manage on driver_duty_events for all
  using (is_dispatcher())
  with check (is_dispatcher());

create policy driver_duty_events_driver_own on driver_duty_events for select
  using (is_driver() and driver_id = auth.uid());

create policy driver_duty_events_driver_insert on driver_duty_events for insert
  with check (is_driver() and driver_id = auth.uid());

grant select, insert on public.driver_duty_events to authenticated;
grant update, delete on public.driver_duty_events to authenticated;
grant select, insert, update, delete on public.driver_duty_events to service_role;
