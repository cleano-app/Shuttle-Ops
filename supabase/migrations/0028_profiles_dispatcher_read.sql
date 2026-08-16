-- Bug fix, caught by actually clicking through the Dispatch UI: 0001's
-- profiles_select policy only lets a user read their own row or (via
-- profiles_admin_all) an admin read everyone's. Office/Dispatcher had no
-- way to read any OTHER profile at all, so listDrivers()
-- (src/app/actions/driverAssignments.ts) came back empty under RLS for
-- an office/dispatcher session — the driver-assignment dropdown on the
-- Dispatch board was silently empty. Build spec §4 puts "drivers" inside
-- Office's own scope ("Capacity, bookings, waivers, cancellations,
-- dispatch, drivers, reconciliation"), so this was always meant to be
-- readable — profiles only carries role/display_name/phone, nothing
-- sensitive, so a broad dispatcher-read policy is a safe fix rather than
-- a narrower role-scoped one.
create policy profiles_dispatcher_read on profiles for select
  using (is_dispatcher());
