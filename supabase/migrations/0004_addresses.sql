-- addresses: entities, not free text (build spec §16 principle 8). Internal
-- fuzzy-match autocomplete via pg_trgm — no external address-validation API
-- (§2/§16). search_addresses() backs both the "type to find" autocomplete
-- and the higher-threshold "possible duplicate" warning shown client-side
-- in src/lib/addresses/fuzzyMatch.ts.
create extension if not exists pg_trgm;

create table if not exists addresses (
  id uuid primary key default gen_random_uuid(),
  line1 text not null,
  line2 text,
  city text,
  postcode text not null,
  country text not null default 'GB',
  area_id uuid references areas(id),
  formatted_address text,
  access_notes text,
  latitude numeric(9, 6),
  longitude numeric(9, 6),
  address_type text check (address_type in ('residential', 'fixed_point', 'business')),
  fixed_point_name text,
  active boolean not null default true,
  usage_count int not null default 0,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

create index if not exists addresses_trgm_idx
  on addresses using gin ((line1 || ' ' || postcode) gin_trgm_ops);
create index if not exists addresses_postcode_idx on addresses (postcode);

alter table addresses enable row level security;

create policy addresses_select_authenticated on addresses for select
  using (auth.uid() is not null);

create policy addresses_dispatcher_manage on addresses for all
  using (is_dispatcher())
  with check (is_dispatcher());

grant select on public.addresses to authenticated;
grant insert, update, delete on public.addresses to authenticated;
grant select, insert, update, delete on public.addresses to service_role;

-- Ranked fuzzy match: similarity threshold 0.15 is deliberately low (recall
-- over precision — the client shows a short list, the operator picks by
-- eye), ordered by similarity first then usage_count so genuinely common
-- addresses surface even with a slightly weaker text match.
create or replace function search_addresses(p_query text, p_limit int default 10)
returns setof addresses
language sql
stable
security definer
set search_path = public
as $$
  select *
  from addresses
  where active
    and similarity(line1 || ' ' || postcode, p_query) > 0.15
  order by similarity(line1 || ' ' || postcode, p_query) desc, usage_count desc
  limit p_limit;
$$;

grant execute on function search_addresses(text, int) to authenticated;
