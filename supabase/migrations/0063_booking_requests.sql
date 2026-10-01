-- Public booking REQUESTS (owner, 1 Oct 2026: "a customer self booking
-- like bin booking, same style"). A stranger fills in /book with no
-- account; what they send is a request, never a booking. Nothing here
-- touches capacity, fares or deposits: Office reads the request, phones
-- the customer, and turns it into a real provisional booking through the
-- same allocate_trip_capacity() path as a phone booking (spec §1: money
-- decisions stay human, deposits are taken by Office).
--
-- Security: the table has RLS on and NO grant at all to anon, and only
-- Office (is_office()) policies for authenticated. The public page writes
-- through submit_booking_request(), a security-definer function that
-- validates everything and rate-limits, and returns only the reference.

create sequence if not exists booking_request_reference_seq;

create table if not exists booking_requests (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique
    default ('R-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('booking_request_reference_seq')::text, 6, '0')),
  status text not null default 'pending'
    check (status in ('pending', 'converted', 'waitlisted', 'declined', 'cancelled')),
  outbound_departure_id uuid not null references departures(id),
  return_departure_id uuid references departures(id),
  men int not null default 0 check (men between 0 and 20),
  women int not null default 0 check (women between 0 and 20),
  boys int not null default 0 check (boys between 0 and 20),
  girls int not null default 0 check (girls between 0 and 20),
  infants int not null default 0 check (infants between 0 and 20),
  luggage_large int not null default 0 check (luggage_large between 0 and 60),
  luggage_small int not null default 0 check (luggage_small between 0 and 60),
  luggage_hand int not null default 0 check (luggage_hand between 0 and 60),
  pickup_line1 text not null,
  pickup_postcode text not null,
  pickup_city text,
  dropoff_line1 text not null,
  dropoff_postcode text not null,
  dropoff_city text,
  mobility_needs text,
  contact_name text not null,
  contact_phone text not null,
  -- digits only, for the per-phone rate limit
  contact_phone_digits text not null,
  contact_email text,
  preferred_language text check (preferred_language in ('en', 'yi', 'he', 'nl')),
  notes text,
  created_at timestamptz not null default now(),
  handled_by uuid references profiles(id),
  handled_at timestamptz,
  converted_booking_reference text,
  decline_reason text,
  -- Filled in by Office's "Create booking" as it goes, so a retry after a
  -- capacity failure reuses the same passengers/addresses instead of
  -- creating duplicates.
  lead_passenger_id uuid references passengers(id),
  passenger_ids uuid[],
  pickup_address_id uuid references addresses(id),
  dropoff_address_id uuid references addresses(id),
  check (men + women + boys + girls + infants between 1 and 20)
);

create index if not exists booking_requests_status_idx on booking_requests (status, created_at);
create index if not exists booking_requests_phone_idx on booking_requests (contact_phone_digits, created_at);

alter table booking_requests enable row level security;

create policy booking_requests_office_select on booking_requests for select
  using (is_office());

create policy booking_requests_office_update on booking_requests for update
  using (is_office())
  with check (is_office());

revoke all on public.booking_requests from anon;
revoke all on public.booking_requests from authenticated;
grant select, update on public.booking_requests to authenticated;
grant select, insert, update, delete on public.booking_requests to service_role;
revoke all on sequence booking_request_reference_seq from anon, authenticated;

-- The only way in from the public page. Validates the whole request,
-- rate-limits, and returns just the reference.
create or replace function submit_booking_request(p jsonb)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_out departures%rowtype;
  v_ret departures%rowtype;
  v_ret_id uuid;
  v_direction text;
  v_men int; v_women int; v_boys int; v_girls int; v_infants int;
  v_large int; v_small int; v_hand int;
  v_name text; v_phone text; v_digits text; v_email text; v_lang text;
  v_p1 text; v_ppc text; v_pcity text; v_d1 text; v_dpc text; v_dcity text;
  v_mobility text; v_notes text;
  v_ref text;
begin
  if p is null or jsonb_typeof(p) <> 'object' then
    raise using message = 'invalid_request';
  end if;

  -- Rate limits first, cheapest refusal.
  if (select count(*) from booking_requests where created_at > now() - interval '1 hour') >= 30 then
    raise using message = 'too_many_requests';
  end if;

  v_name := left(btrim(coalesce(p->>'contact_name', '')), 120);
  v_phone := left(btrim(coalesce(p->>'contact_phone', '')), 40);
  v_digits := regexp_replace(v_phone, '\D', '', 'g');
  v_email := nullif(left(btrim(coalesce(p->>'contact_email', '')), 200), '');
  v_lang := nullif(btrim(coalesce(p->>'preferred_language', '')), '');

  if length(v_name) < 2 then raise using message = 'name_required'; end if;
  if length(v_digits) < 7 or length(v_digits) > 16 then raise using message = 'phone_required'; end if;
  if v_email is not null and v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise using message = 'email_invalid';
  end if;
  if v_lang is not null and v_lang not in ('en', 'yi', 'he', 'nl') then v_lang := null; end if;

  if (select count(*) from booking_requests
      where contact_phone_digits = v_digits and status = 'pending'
        and created_at > now() - interval '1 day') >= 5 then
    raise using message = 'too_many_requests';
  end if;

  begin
    v_men := coalesce((p->>'men')::int, 0);
    v_women := coalesce((p->>'women')::int, 0);
    v_boys := coalesce((p->>'boys')::int, 0);
    v_girls := coalesce((p->>'girls')::int, 0);
    v_infants := coalesce((p->>'infants')::int, 0);
    v_large := coalesce((p->>'luggage_large')::int, 0);
    v_small := coalesce((p->>'luggage_small')::int, 0);
    v_hand := coalesce((p->>'luggage_hand')::int, 0);
  exception when others then
    raise using message = 'invalid_request';
  end;
  if least(v_men, v_women, v_boys, v_girls, v_infants, v_large, v_small, v_hand) < 0 then
    raise using message = 'invalid_request';
  end if;
  if v_men + v_women + v_boys + v_girls + v_infants not between 1 and 20 then
    raise using message = 'party_size';
  end if;
  if v_men + v_women = 0 then raise using message = 'adult_required'; end if;
  if greatest(v_large, v_small, v_hand) > 60 then raise using message = 'too_much_luggage'; end if;

  v_p1 := left(btrim(coalesce(p->>'pickup_line1', '')), 200);
  v_ppc := upper(left(btrim(coalesce(p->>'pickup_postcode', '')), 20));
  v_pcity := nullif(left(btrim(coalesce(p->>'pickup_city', '')), 100), '');
  v_d1 := left(btrim(coalesce(p->>'dropoff_line1', '')), 200);
  v_dpc := upper(left(btrim(coalesce(p->>'dropoff_postcode', '')), 20));
  v_dcity := nullif(left(btrim(coalesce(p->>'dropoff_city', '')), 100), '');
  if v_p1 = '' or v_ppc = '' then raise using message = 'pickup_required'; end if;
  if v_d1 = '' or v_dpc = '' then raise using message = 'dropoff_required'; end if;
  v_mobility := nullif(left(btrim(coalesce(p->>'mobility_needs', '')), 1000), '');
  v_notes := nullif(left(btrim(coalesce(p->>'notes', '')), 1000), '');

  -- Departures: published (or boarding), in the future, right direction.
  v_direction := p->>'direction';
  if v_direction not in ('outbound', 'return') then raise using message = 'invalid_request'; end if;
  begin
    select * into v_out from departures where id = (p->>'outbound_departure_id')::uuid;
    v_ret_id := nullif(p->>'return_departure_id', '')::uuid;
  exception when others then
    raise using message = 'departure_not_bookable';
  end;
  if v_out.id is null or v_out.status not in ('published', 'boarding') or v_out.depart_at <= now()
     or v_out.direction <> v_direction then
    raise using message = 'departure_not_bookable';
  end if;
  if v_ret_id is not null then
    select * into v_ret from departures where id = v_ret_id;
    if v_ret.id is null or v_ret.status not in ('published', 'boarding') or v_ret.depart_at <= now()
       or v_ret.direction = v_direction or v_ret.route_id <> v_out.route_id
       or v_ret.depart_at <= v_out.depart_at then
      raise using message = 'return_not_bookable';
    end if;
  end if;

  insert into booking_requests (
    outbound_departure_id, return_departure_id,
    men, women, boys, girls, infants,
    luggage_large, luggage_small, luggage_hand,
    pickup_line1, pickup_postcode, pickup_city,
    dropoff_line1, dropoff_postcode, dropoff_city,
    mobility_needs, contact_name, contact_phone, contact_phone_digits, contact_email,
    preferred_language, notes
  ) values (
    v_out.id, v_ret_id,
    v_men, v_women, v_boys, v_girls, v_infants,
    v_large, v_small, v_hand,
    v_p1, v_ppc, v_pcity,
    v_d1, v_dpc, v_dcity,
    v_mobility, v_name, v_phone, v_digits, v_email,
    v_lang, v_notes
  )
  returning reference into v_ref;

  return v_ref;
end;
$$;

revoke all on function submit_booking_request(jsonb) from public;
grant execute on function submit_booking_request(jsonb) to anon, authenticated;
