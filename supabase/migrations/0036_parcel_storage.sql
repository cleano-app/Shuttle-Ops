-- parcel-proof bucket: delivery/collection proof photos. Objects stored
-- as `{parcel_id}/{filename}`. Private, same convention as fleet-photos
-- (0034) and Cleano Ops's job-photos.
insert into storage.buckets (id, name, public)
values ('parcel-proof', 'parcel-proof', false)
on conflict (id) do nothing;

create policy parcel_proof_insert on storage.objects
  for insert with check (
    bucket_id = 'parcel-proof'
    and (is_dispatcher() or is_driver())
  );

create policy parcel_proof_select on storage.objects
  for select using (
    bucket_id = 'parcel-proof'
    and is_dispatcher()
  );

create policy parcel_proof_delete on storage.objects
  for delete using (
    bucket_id = 'parcel-proof'
    and is_dispatcher()
  );
