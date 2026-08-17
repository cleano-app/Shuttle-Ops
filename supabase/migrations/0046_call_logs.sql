-- call_logs: build spec §38. The automated out-of-hours line itself (§33)
-- needs a real Twilio/Aircall account and phone number this project
-- doesn't have yet - not buildable/testable without that, and stays a
-- documented gap (same treatment as live Take Payments). This table and
-- the office-side logging action exist regardless, since Office logs
-- ordinary phone bookings' outcomes manually today, and the same outcomes
-- ('no_capacity', 'abandoned_at_menu' etc.) apply once the automated line
-- exists — §38 calls these "the two most valuable metrics in the system,"
-- worth capturing from day one rather than only once a phone system is
-- wired up.
create table if not exists call_logs (
  id uuid primary key default gen_random_uuid(),
  from_number text,
  matched_passenger_id uuid references passengers(id),
  operator_id uuid references profiles(id),
  started_at timestamptz not null default now(),
  duration int,
  channel text not null default 'phone' check (channel in ('phone', 'automated')),
  outcome text not null check (
    outcome in ('booked', 'provisional_created', 'waitlisted', 'no_capacity', 'abandoned_at_menu', 'pressed_zero', 'urgent_routed', 'enquiry_only')
  ),
  notes text
);

create index if not exists call_logs_outcome_idx on call_logs (outcome);

alter table call_logs enable row level security;

create policy call_logs_office_manage on call_logs for all
  using (is_office())
  with check (is_office());

grant select, insert, update, delete on public.call_logs to authenticated;
grant select, insert, update, delete on public.call_logs to service_role;
