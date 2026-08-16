-- waivers: build spec §10/§11 — a deposit or fare waiver granted by Office,
-- always tied to a named decision-maker. Standing waivers themselves live
-- on passengers.deposit_waiver_standing (0010) and auto-apply at booking
-- time; this table records the specific waiver instance granted for a
-- given booking_passengers row (whether standing or one-off).
create table if not exists waivers (
  id uuid primary key default gen_random_uuid(),
  booking_passenger_id uuid not null references booking_passengers(id) on delete cascade,
  reason_code text not null,
  notes text,
  granted_by_user_id uuid not null references profiles(id),
  granted_at timestamptz not null default now()
);

-- Resolves booking_passengers' forward reference to waivers (see 0015's
-- comment) — same two-way-reference pattern as trips/bookings.
alter table booking_passengers
  add constraint booking_passengers_waiver_fk foreign key (waiver_id) references waivers(id);

alter table waivers enable row level security;

create policy waivers_office_manage on waivers for all
  using (is_office())
  with check (is_office());

grant select, insert, update, delete on public.waivers to authenticated;
grant select, insert, update, delete on public.waivers to service_role;
