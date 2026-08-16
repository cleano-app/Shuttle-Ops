# Shuttle Ops

Booking, dispatch, routing, driver, vehicle and charitable subsidy management
for a London ⇄ Antwerp passenger and parcel shuttle. Standalone Next.js +
Supabase app, separate project from Cleano Ops (beneficiary data must not sit
alongside commercial cleaning records) — see `docs/build-spec-v4.md` for the
full spec this implements against.

Working title only: `shuttle-ops`. Naming/branding is still open (spec §41).

## Phase 1 scope ("Operational core")

Departures · vehicles (basic) · released capacity · passengers and categories
including infants · addresses with fuzzy match, areas and booking-time
snapshot · pickup/drop-off · luggage capture and dual-currency tariffs ·
provisional bookings · deposits · waivers · confirmed bookings · return trips ·
capacity allocation function · Office Booking Console · SMS/email
confirmations.

Later phases (dispatch, fleet compliance, cash/money automation, public
self-service) are not built yet — see the Phase 1 implementation plan for the
full deferred list and reasons.

## Setup

1. Create a Supabase project for Shuttle Ops (separate from Cleano Ops's).
2. Copy `.env.local.example` to `.env.local` and fill in the Supabase URL/keys
   plus `SUPABASE_DB_PASSWORD` (Dashboard → Settings → Database).
3. `npm install`
4. `npm run db:migrate` — applies `supabase/migrations/*.sql` in order via the
   Supabase session pooler.
5. `npm run db:seed` — creates placeholder dev accounts for each staff role
   (admin/office/dispatcher/driver) at `@shuttleops.dev` addresses.
6. `npm run db:seed-demo` — adds demo areas/route/vehicles/tariffs/departure/
   passengers so the Booking Console has something to work with.
7. `npm run dev`

## Testing

- `npm test` — fast unit suite (pure logic + component tests), no DB needed.
- `npm run test:integration` — capacity-allocation function and RLS policy
  tests; needs a real (disposable, non-dev) Postgres connection.
