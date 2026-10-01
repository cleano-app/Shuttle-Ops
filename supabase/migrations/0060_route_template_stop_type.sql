-- Route template stops remember what kind of stop they are.
--
-- applyTemplateToDeparture() used to materialise every template stop as a
-- "waypoint", so a template saved from a real departure lost its crossing
-- stop - and the crossing check-in warning (§20, "matters more than route
-- optimisation") only projects to a stop of type 'crossing'. Saving the
-- type lets "Save current stop order as template" round-trip faithfully
-- and lets "Generate/Update stops" drop the template's crossing stop
-- between pickups and drop-offs.

alter table route_template_stops
  add column if not exists stop_type text not null default 'waypoint'
    check (stop_type in ('pickup', 'dropoff', 'crossing', 'waypoint'));
