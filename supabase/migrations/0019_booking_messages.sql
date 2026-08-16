-- booking_messages: the "SMS/email confirmations" line item from build spec
-- §39. Scoped to bookings/passengers, one row per send attempt (including
-- failed/skipped attempts) so there's always a record of what was tried,
-- not just what succeeded. status = 'skipped_not_configured' covers the SMS
-- provider stub (src/lib/sms/sendSms.ts) throwing until Twilio credentials
-- exist — a booking confirmation should never fail loudly just because SMS
-- isn't wired up yet.
create table if not exists booking_messages (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid references bookings(id) on delete cascade,
  passenger_id uuid references passengers(id),
  channel text not null check (channel in ('email', 'sms')),
  category text not null,
  recipient text not null,
  subject text,
  body text not null,
  status text not null check (status in ('sent', 'failed', 'skipped_not_configured')),
  provider_ref text,
  created_by_user_id uuid references profiles(id),
  created_at timestamptz not null default now()
);

create index if not exists booking_messages_booking_idx on booking_messages (booking_id);

alter table booking_messages enable row level security;

create policy booking_messages_office_manage on booking_messages for all
  using (is_office())
  with check (is_office());

grant select, insert, update, delete on public.booking_messages to authenticated;
grant select, insert, update, delete on public.booking_messages to service_role;
