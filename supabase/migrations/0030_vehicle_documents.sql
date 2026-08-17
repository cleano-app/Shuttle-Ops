-- vehicle_documents: build spec §28 — MOT, insurance, servicing records,
-- safety inspections, tachograph details, general vehicle documents.
-- storage_path points into the fleet-photos bucket (0034); uploaded_by is
-- who actually uploaded the file, not necessarily who the document is
-- "for."
create table if not exists vehicle_documents (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references vehicles(id),
  doc_type text not null check (
    doc_type in ('mot', 'insurance', 'service', 'safety_inspection', 'tachograph', 'other')
  ),
  reference text,
  issued_at date,
  expires_at date,
  storage_path text,
  uploaded_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

create index if not exists vehicle_documents_vehicle_idx on vehicle_documents (vehicle_id);
create index if not exists vehicle_documents_expires_idx on vehicle_documents (expires_at);

alter table vehicle_documents enable row level security;

create policy vehicle_documents_dispatcher_manage on vehicle_documents for all
  using (is_dispatcher())
  with check (is_dispatcher());

grant select, insert, update, delete on public.vehicle_documents to authenticated;
grant select, insert, update, delete on public.vehicle_documents to service_role;
