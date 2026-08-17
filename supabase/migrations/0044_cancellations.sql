-- cancellations: build spec §11. "Cancellation consequences are always
-- discretionary" / "The system may suggest an outcome based on notice
-- given, but never executes it." suggested_outcome is computed and stored
-- by application code (src/lib/cancellations/suggestOutcome.ts, a pure
-- function so it's unit-testable) at the moment the cancellation is
-- logged; decided_outcome/decided_by_user_id/decided_at stay null until
-- Office actually decides - nothing in this schema or any trigger ever
-- fills those in automatically.
create table if not exists cancellations (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references bookings(id),
  booking_passenger_id uuid references booking_passengers(id),
  cancelled_at timestamptz not null default now(),
  notice_hours numeric(8, 2),
  reason_text text,
  reason_code text,
  requested_via text check (requested_via in ('phone', 'office', 'online', 'no_show')),
  suggested_outcome text,
  decided_outcome text,
  decided_by_user_id uuid references profiles(id),
  decided_at timestamptz,
  deposit_action text check (deposit_action in ('release', 'retain', 'waive', 'no_deposit')),
  retained_amount numeric(10, 2),
  fare_action text check (fare_action in ('refund', 'charge', 'no_charge')),
  charged_amount numeric(10, 2),
  decision_note text
);

create index if not exists cancellations_booking_idx on cancellations (booking_id);

alter table cancellations enable row level security;

create policy cancellations_office_manage on cancellations for all
  using (is_office())
  with check (is_office());

grant select, insert, update, delete on public.cancellations to authenticated;
grant select, insert, update, delete on public.cancellations to service_role;
