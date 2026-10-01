-- Booking lifecycle gaps found walking the Office flow end to end
-- (2026-10-01):
--
-- 1. provisional_expires_at was never set (0014 has no default and the
--    capacity functions don't write it), so the lazy expiry sweep in
--    actions/bookings.ts never expired anything and unsecured holds kept
--    their capacity for ever. Set it on insert from
--    app_settings.provisional_expiry_hours, and backfill open holds.
-- 2. There was no configured deposit amount anywhere, so Office had no
--    figure to take. Fixed GBP/EUR defaults, set by hand like tariffs
--    (spec §34: no FX).
-- 3. bookings.status never followed its passengers: confirming every
--    passenger left the booking "provisional" (and so still expirable).
--    A trigger keeps the booking row in step with its passenger rows.
-- 4. Nothing ever set "travelled", so reconciliation always showed 0.
--    When a departure reaches completed, confirmed passengers the driver
--    marked boarded become travelled.

alter table app_settings
  add column if not exists default_deposit_gbp numeric(10,2) not null default 20,
  add column if not exists default_deposit_eur numeric(10,2) not null default 20;

create or replace function set_provisional_expiry()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.provisional_expires_at is null
     and new.status in ('provisional', 'deposit_pending') then
    new.provisional_expires_at := now() + make_interval(
      hours => coalesce((select provisional_expiry_hours from app_settings where id), 48)
    );
  end if;
  return new;
end;
$$;

drop trigger if exists bookings_set_provisional_expiry on bookings;
create trigger bookings_set_provisional_expiry
  before insert on bookings
  for each row execute function set_provisional_expiry();

update bookings b
   set provisional_expires_at = b.created_at + make_interval(
         hours => coalesce((select provisional_expiry_hours from app_settings where id), 48))
 where b.provisional_expires_at is null
   and b.status in ('provisional', 'deposit_pending');

-- Booking status follows its passengers. Precedence: any passenger still
-- unsecured keeps the booking open; otherwise the "best" settled state
-- wins (travelled > confirmed > no_show), and a booking whose passengers
-- were all cancelled/expired takes that state.
create or replace function sync_booking_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking_id uuid := coalesce(new.booking_id, old.booking_id);
  v_status text;
begin
  select case
    when bool_or(status = 'provisional') then 'provisional'
    when bool_or(status = 'deposit_pending') then 'deposit_pending'
    when bool_or(status = 'travelled') then 'travelled'
    when bool_or(status = 'confirmed') then 'confirmed'
    when bool_or(status = 'no_show') then 'no_show'
    when bool_or(status = 'cancelled') then 'cancelled'
    when bool_or(status = 'expired') then 'expired'
  end
  into v_status
  from booking_passengers
  where booking_id = v_booking_id;

  if v_status is not null then
    update bookings set status = v_status
     where id = v_booking_id and status is distinct from v_status;
  end if;
  return null;
end;
$$;

drop trigger if exists booking_passengers_sync_booking_status on booking_passengers;
create trigger booking_passengers_sync_booking_status
  after update of status on booking_passengers
  for each row
  when (old.status is distinct from new.status)
  execute function sync_booking_status();

create or replace function mark_travelled_on_completion()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'completed' and old.status is distinct from 'completed' then
    update booking_passengers bp
       set status = 'travelled'
      from bookings b
     where b.id = bp.booking_id
       and b.departure_id = new.id
       and bp.status = 'confirmed'
       and bp.boarded_at is not null;
  end if;
  return new;
end;
$$;

drop trigger if exists departures_mark_travelled on departures;
create trigger departures_mark_travelled
  after update of status on departures
  for each row execute function mark_travelled_on_completion();

revoke all on function set_provisional_expiry() from public, anon, authenticated;
revoke all on function sync_booking_status() from public, anon, authenticated;
revoke all on function mark_travelled_on_completion() from public, anon, authenticated;
