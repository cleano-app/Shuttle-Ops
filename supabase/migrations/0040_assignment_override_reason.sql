-- Build spec §27: "An unavailable vehicle cannot be assigned to new work
-- without Admin override and a recorded reason." These columns are where
-- that reason actually gets recorded — enforced in the application layer
-- (src/app/actions/vehicles.ts's assertVehicleAssignable(), called from
-- both assignVehicleToDeparture and driverAssignments.assignDriver), not
-- a DB constraint, since "is this vehicle unavailable" requires a live
-- lookup against vehicles.status that a CHECK constraint can't express.
alter table departure_vehicles add column if not exists override_reason text;
alter table driver_assignments add column if not exists override_reason text;
