-- Replaces the RLS-policy-based passenger cancellation-request path added
-- in 0050 with a narrow security-definer function, matching this app's
-- dominant pattern (driver functions, Phase 4 disruption/waitlist,
-- everything else in this Phase 5 portal) instead of opening `bookings`
-- table RLS to the passenger role.
--
-- Why the RLS approach didn't work: cancellations_passenger_insert's WITH
-- CHECK ran an EXISTS subquery against `bookings` — but RLS subqueries
-- execute under the CALLING role's own privileges, not the table owner's,
-- and `bookings` has no SELECT policy for a passenger at all. The check
-- always evaluated to false, and the insert was rejected even for a
-- passenger's own booking (caught by tests/integration/phase5.test.ts).
-- Opening a `bookings` SELECT policy would have fixed the immediate bug
-- but also exposed bookings.notes (Office-authored) directly — an RPC
-- avoids that entirely.
drop policy if exists cancellations_passenger_insert on cancellations;
drop policy if exists cancellations_passenger_select on cancellations;

create or replace function request_cancellation_online(
  p_booking_id uuid,
  p_reason_text text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_passenger_id uuid;
  v_depart_at timestamptz;
  v_notice_hours numeric;
  v_cancellation_id uuid;
begin
  select passenger_id into v_passenger_id from passenger_account_users where user_id = auth.uid();
  if v_passenger_id is null then
    raise using message = 'not_linked';
  end if;

  if not exists (select 1 from bookings where id = p_booking_id and lead_passenger_id = v_passenger_id) then
    raise using message = 'not_authorized';
  end if;

  select d.depart_at into v_depart_at
  from bookings b join departures d on d.id = b.departure_id
  where b.id = p_booking_id;
  v_notice_hours := extract(epoch from (v_depart_at - now())) / 3600;

  insert into cancellations (booking_id, notice_hours, reason_text, requested_via)
  values (p_booking_id, v_notice_hours, p_reason_text, 'online')
  returning id into v_cancellation_id;

  return v_cancellation_id;
end;
$$;

grant execute on function request_cancellation_online(uuid, text) to authenticated;

create or replace function list_my_cancellation_requests() returns table(
  id uuid,
  booking_id uuid,
  cancelled_at timestamptz,
  notice_hours numeric,
  reason_text text,
  requested_via text,
  decided_outcome text,
  decision_note text
)
language sql
stable
security definer
set search_path = public
as $$
  select c.id, c.booking_id, c.cancelled_at, c.notice_hours, c.reason_text, c.requested_via, c.decided_outcome, c.decision_note
  from cancellations c
  join bookings b on b.id = c.booking_id
  join passenger_account_users pau on pau.passenger_id = b.lead_passenger_id
  where pau.user_id = auth.uid()
  order by c.cancelled_at desc;
$$;

grant execute on function list_my_cancellation_requests() to authenticated;
