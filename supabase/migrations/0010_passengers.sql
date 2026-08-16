-- passengers: build spec §8. vulnerability_notes must be restricted to
-- Office/Admin, excluded from exports, access-logged. The RLS policy below
-- is deliberately the ONLY policy on this table — no dispatcher or driver
-- policy exists at all, which is what actually enforces the restriction:
-- with no policy granting them any row, dispatcher/driver selects return
-- zero rows (RLS is deny-by-default), so nobody outside Office/Admin can
-- read ANY column, not just vulnerability_notes. This avoids needing
-- column-level Postgres grants. Full read-audit-logging is Phase 2
-- hardening (not implemented here) — the row-level restriction is the
-- Phase 1-critical part and ships now.
create table if not exists passengers (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid references auth.users(id),
  full_name text not null,
  phone text,
  email text,
  preferred_language text,
  category text not null check (category in ('man', 'woman', 'boy', 'girl', 'infant')),
  date_of_birth date,
  age int,
  is_vulnerable boolean not null default false,
  vulnerability_notes text,
  mobility_needs text,
  default_pickup_address_id uuid references addresses(id),
  default_dropoff_address_id uuid references addresses(id),
  emergency_contact_name text,
  emergency_contact_phone text,
  deposit_waiver_standing boolean not null default false,
  referrer_org_id uuid references organizations(id),
  no_show_count int not null default 0,
  late_cancel_count int not null default 0,
  created_via text not null default 'phone',
  created_at timestamptz not null default now()
);

-- Trigram index on full_name for the same fuzzy-lookup UX as addresses —
-- the booking console needs "type a name, see matches" (build spec §32).
create index if not exists passengers_full_name_trgm_idx
  on passengers using gin (full_name gin_trgm_ops);

alter table passengers enable row level security;

create policy passengers_office_only on passengers for all
  using (is_office())
  with check (is_office());

grant select, insert, update, delete on public.passengers to authenticated;
grant select, insert, update, delete on public.passengers to service_role;
