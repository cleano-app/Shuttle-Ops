-- fleet-photos bucket: vehicle document scans, defect photos. Private
-- bucket, objects stored as `{vehicle_id}/{filename}` — same convention
-- as Cleano Ops's job-photos bucket, policies check the vehicle_id path
-- segment via storage.foldername(name).
insert into storage.buckets (id, name, public)
values ('fleet-photos', 'fleet-photos', false)
on conflict (id) do nothing;

-- Broader than Cleano's job-photos insert policy (which scopes to the
-- assigned worker/team) - any driver can upload a defect photo for any
-- vehicle, not just one they're currently assigned to, since a driver
-- might spot damage on a vehicle in the yard between duties. Dispatcher
-- covers admin/office/dispatcher for document uploads (MOT certs etc.).
create policy fleet_photos_insert on storage.objects
  for insert with check (
    bucket_id = 'fleet-photos'
    and (is_dispatcher() or is_driver())
  );

create policy fleet_photos_select on storage.objects
  for select using (
    bucket_id = 'fleet-photos'
    and (is_dispatcher() or is_driver())
  );

create policy fleet_photos_delete on storage.objects
  for delete using (
    bucket_id = 'fleet-photos'
    and is_dispatcher()
  );
