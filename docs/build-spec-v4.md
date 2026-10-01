# Shuttle Ops — Build Spec v4

**Purpose:** Booking, dispatch, routing, driver, vehicle and charitable subsidy management for a London ⇄ Antwerp passenger and parcel shuttle.

**Owner:** Gavriel Pappenheim
**Status:** v4 — supersedes v3. For Claude Code implementation.

**Foundational idea:** a departure is not a number of seats. It is a **moving capacity** — people + luggage + parcels — travelling through a sequence of collection and delivery addresses, in a specific compliant vehicle with assigned drivers, producing a complete operational and financial record.

---

## 1. Core principles

1. **One departure, one live capacity pool.** Phone, online and office all draw from the same availability.
2. **Released capacity is immediately bookable** on every channel until booked out or Office closes the departure.
3. **Provisional before confirmed.** Confirmation normally requires the deposit or an approved deposit waiver.
4. **Deposits are commitment devices, not fare.** Accounted separately from passenger contributions.
5. **Vulnerable passengers can have the deposit waived** by Office. A standing waiver is clearly visible so passengers do not repeatedly explain their circumstances.
6. **Cap unsecured provisional capacity** at a configurable share, initially 30%. A waived deposit counts as secured.
7. **Capacity is multi-dimensional:** seats, luggage/hold units, wheelchair spaces, parcel units.
8. **Addresses are entities**, not uncontrolled text fields.
9. **Minimum sensitive data.** No passport numbers or ID scans at this stage.
10. **No external mapping/routing APIs.** The system builds its own address book, route templates and historical timings.
11. **Money decisions stay human.** Cancellation outcomes, waivers, deposit retention and exceptional charges are Office decisions.
12. **Driver responsibility must always be traceable** — who drove, when, where responsibility changed, mileage and hours, and what each driver is due.
13. **Fleet compliance is a core module**, designed generically enough to port back into Cleano Ops.

---

## 2. Stack

- **Frontend/backend:** Next.js App Router on Vercel
- **Database/auth/storage:** Supabase — separate project from Cleano Ops
- **Payments:** Take Payments — MOTO for phone, hosted fields for web
- **Telephony/SMS:** Twilio or Aircall
- **Maps/routing/address lookup:** none
- **Navigation:** tapping an address opens the driver's own maps app via a device deep link

The Shuttle database stays separate from Cleano because beneficiary information should not sit in the commercial cleaning database.

---

## 3. Reuse with Cleano Ops

| Cleano Ops | Shuttle Ops | Direction |
|---|---|---|
| Manager / Worker / Customer roles + RLS | Office / Driver / Passenger | Copy pattern |
| Job lifecycle | Departure lifecycle | Copy pattern |
| Worker time tracking | Driver duty log | Copy + offline queue |
| Worker statements | Driver pay statements | Copy |
| Messages hub | Confirmations, reminders, waitlist alerts | Copy |
| Take Payments | Deposits and contributions | Same integration |
| Photo capture | Delivery proof, checks, defects | Copy |
| To-do module | Callbacks, fleet tasks, reviews | Copy |
| — | **Fleet & vehicle compliance** | **Build here → port to Cleano** |

Fleet tables must avoid shuttle-specific assumptions wherever possible.

---

## 4. Roles

| Role | Scope |
|---|---|
| Admin | Settings, tariffs, deposits, users, exports, accounting |
| Office | Capacity, bookings, waivers, cancellations, dispatch, drivers, reconciliation |
| Dispatcher | Routing, stops, vehicle and driver assignments |
| Driver | Own assigned work, stops, checks, expenses, cash |
| Passenger | Own bookings and saved addresses |
| Referrer | Beneficiary bookings and sponsorship — later phase |

Drivers never see vulnerability notes, fares, deposits or the wider passenger database.

---

## 5. Passenger categories

Every travelling passenger has one operational category:

```
man | woman | boy | girl | infant
```

**Infant** = under 2 years old. DOB and/or age recorded separately where useful.

No allocated seat numbers. Every departure shows composition clearly:

```
7 men · 5 women · 2 boys · 1 girl · 2 infants
```

Infants are included in any capacity or safety calculation where legally or operationally required. `booking_passengers` therefore carries `occupies_seat (bool)` — an infant on a lap does not consume a seat, an infant in a child seat does. **The rule differs by vehicle type and jurisdiction and must be confirmed before launch** (§40.2); the flag exists so the answer can be applied without a schema change.

---

## 6. Departures

**`departures`**
```
id, route_id, direction, depart_at, arrive_estimate, status,
seats_capacity, seats_released,
hold_capacity_units, parcel_units_reserved, wheelchair_capacity,
crossing_reference, crossing_passenger_limit, crossing_cost, crossing_checkin_deadline,
notes, created_by
```

```
draft → published → boarding → departed → completed
                  ↘ cancelled
```

Office controls `seats_released`. Live provisional, confirmed and travelled counts are **always recalculated from bookings**, never read from a stored counter.

---

## 7. Vehicles assigned to departures

A departure may use one or more vehicles where operationally required.

**`departure_vehicles`**
```
id, departure_id, vehicle_id, seats_capacity, hold_capacity_units, wheelchair_capacity, sequence
```

Capacity values are snapshotted from the vehicle at assignment.

Dispatch shows per-vehicle load:
```
Vehicle A   8 passengers · 12 luggage units · 2 parcels
Vehicle B   7 passengers ·  9 luggage units · 4 parcels
```

**Rebalancing.** `booking_passengers.departure_vehicle_id` and `parcels.departure_vehicle_id` are **nullable**. Null means "this departure runs one vehicle, no assignment needed" — the single-vehicle case stays simple, exactly as intended. Assignment only becomes meaningful when a second vehicle is added, at which point Office drags passengers and parcels between vehicles and the per-vehicle capacity check applies. Families and linked bookings warn before being split across vehicles.

---

## 8. Passengers

**`passengers`**
```
id, auth_user_id, full_name, phone, email, preferred_language,
category, date_of_birth, age,
is_vulnerable, vulnerability_notes, mobility_needs,
default_pickup_address_id, default_dropoff_address_id,
emergency_contact_name, emergency_contact_phone,
deposit_waiver_standing, referrer_org_id,
no_show_count, late_cancel_count, created_via, created_at
```

Either DOB or age may be used. `vulnerability_notes` restricted to Office/Admin, excluded from exports, access-logged. No passport or ID-document table.

---

## 9. Trips and bookings

**`trips`** — links outbound and return travel
```
id, reference, lead_passenger_id, outbound_booking_id, return_booking_id, status, created_at
```

Where both legs are booked together, allocation is **transactional: both succeed or neither does.**

**`bookings`**
```
id, reference, trip_id, departure_id, lead_passenger_id, channel, status,
provisional_expires_at, booked_by_user_id, notes, created_at
```

**`booking_passengers`**
```
id, booking_id, passenger_id, category, occupies_seat,
departure_vehicle_id (nullable),
pickup_address_id, dropoff_address_id, mobility_needs, wheelchair_space,
currency, notional_fare, contribution, sponsored, subsidy, sponsor_org_id,
deposit_required, deposit_status, waiver_id,
luggage_large, luggage_small, luggage_hand, luggage_oversize,
luggage_units_consumed, luggage_charge,
boarded_at, no_show
```

Pickup and drop-off are per passenger.

```
provisional → deposit_pending → confirmed → travelled
            ↘ cancelled | no_show | expired
```

---

## 10. Deposits

**`deposits`**
```
id, booking_passenger_id, amount, currency, status, method,
take_payments_ref, taken_by_user_id, taken_at,
released_at, retained_at, retained_amount,
reason_code, decided_by_user_id, notes
```

```
required → pending → secured → released | retained | waived
```

**Rules**
- Waived deposit counts as secured.
- Deposit is separate from passenger contribution and is not revenue unless retained.
- Retention requires an Office decision, a reason and a named decision-maker.
- Standing waivers auto-apply.
- No automated vulnerability assessment. No automatic deposit retention.

**Confirm with Take Payments** whether pre-authorisation/release is supported, or whether deposits must be charge-then-refund. Charge/refund means card fees both ways and a multi-day refund lag on beneficiaries' money.

---

## 11. Cancellation

Cancellation consequences are always discretionary.

**`cancellations`**
```
id, booking_id, booking_passenger_id, cancelled_at, notice_hours,
reason_text, reason_code, requested_via,
suggested_outcome, decided_outcome, decided_by_user_id, decided_at,
deposit_action, retained_amount, fare_action, charged_amount, decision_note
```

The system may **suggest** an outcome based on notice given, but never executes it.

Passengers with waived deposit or fare are not automatically charged. Instead: increment no-show/late-cancel count, create a review task after a configurable threshold, Office decides.

---

## 12. Capacity allocation

All allocation passes through one database function, inside a transaction with the departure row locked.

Checks, in order:
1. Released passenger seats (excluding non-seat-occupying infants)
2. Crossing passenger limit
3. Hold/luggage capacity
4. Parcel allocation
5. Wheelchair spaces
6. Unsecured provisional cap
7. Per-vehicle capacity where a departure runs more than one vehicle

Usage is **recalculated from source rows** before allocating.

Failure codes: `no_seats`, `crossing_limit_reached`, `no_hold_capacity`, `no_parcel_capacity`, `no_wheelchair_space`, `unsecured_cap_reached`, `no_vehicle_capacity`.

Office may override luggage, parcel, wheelchair and per-vehicle warnings with a recorded reason where safe and appropriate. **Office may never oversell passenger seats or the booked crossing limit.**

---

## 13. Waitlist

**`waitlist`**
```
id, departure_id, passenger_id, seats_wanted, luggage_estimate,
wheelchair_requirement, created_at, notified_at, expires_at, status
```

```
waiting → offered → converted
        ↘ lapsed
```

When capacity frees, the system **reruns the full capacity check before making an offer**. A free seat does not mean the waitlisted passenger fits — their luggage or wheelchair requirement may not. If they don't fit, skip to the next entry and leave the first waiting.

---

## 14. Luggage

Each passenger booking records large suitcases, small suitcases, hand luggage, oversized/special items, notes.

Tariffs determine included allowance, additional charge, oversized charge, and capacity units consumed. **Prices and weightings are copied onto the booking at booking time** — historical bookings never change when tariffs change.

```
Seats: 13 / 16

Hold:  22 / 26 units
   Luggage: 18
   Parcels:  4
```

Office gets a clear capacity warning before confirming additional luggage.

---

## 15. Parcels

Parcels share physical hold capacity with passenger luggage.

**`parcels`**
```
id, reference, departure_id, departure_vehicle_id (nullable),
sender_name, sender_phone, sender_address_id,
recipient_name, recipient_phone, recipient_address_id,
quantity, size_category, units_consumed, description, special_instructions,
prohibited_items_declared, price, currency, payment_status, payment_ref,
status, collected_at, delivered_at,
proof_photo_path, proof_signature_name, failure_reason, created_by
```

```
booked → collection_due → collected → onboard → delivery_due → delivered
       ↘ cancelled | failed_collection | failed_delivery
```

A prohibited-items declaration is required.

---

## 16. Addresses

**`addresses`**
```
id, line1, line2, city, postcode, country, area_id,
formatted_address, access_notes, latitude, longitude,
address_type, fixed_point_name, active, usage_count, created_by, created_at
```

No external validation API.

**Internal autocomplete.** As Office types: fuzzy-match existing addresses (trigram index on `line1 || postcode`), prioritise by `usage_count`, detect likely duplicates, show passenger defaults, pin regular fixed points near the top. In a community operation the same addresses recur constantly, so hit rate climbs quickly and manual entry becomes the exception.

**Historical integrity.** Changing a passenger's saved address must never change an existing booking. At confirmation, the address actually booked is preserved — implemented as a **booking-time snapshot** (`booking_passengers.pickup_address_snapshot jsonb`) alongside the live `address_id`. Manifests and departure history always show the address actually used. Snapshot is simpler than versioned address records and survives an address being edited, merged or deactivated.

---

## 17. Areas and routing

**`areas`** — `id, name, country, running_order, active`

Examples: Stamford Hill · Golders Green · Hendon · Berchem · Wilrijk · Deurne

Every address belongs to an operational area. `running_order` provides the basic route sequence — set once by someone who knows the roads.

---

## 18. Route templates

**`route_templates`** — `id, route_id, direction, name, notes, active`
**`route_template_stops`** — `id, template_id, address_id, area_id, sequence, default_offset_minutes`

Dispatcher applies a standard template to a new departure. Real passenger and parcel addresses slot into the appropriate areas. Office drags exceptional stops into position.

---

## 19. Historical operational ETA

No live traffic or routing API.

**`leg_timings`** — `id, from_area_id, to_area_id, day_of_week, time_band, sample_count, median_minutes, last_updated`

Completed journeys feed actual timings back in. A nightly job recomputes medians. The result is a **historical operational ETA based on the shuttle's own previous journeys** — after a few months this is more accurate for these specific runs than any generic API, because it reflects your vans, your stops and your loading times.

**It must never be presented as live traffic information.** Label it as such in the UI. Where history is insufficient, fall back to the route template's default timings and show it as an estimate.

---

## 20. Operational stops and dispatch

**`operational_stops`**
```
id, departure_id, departure_vehicle_id (nullable), address_id, stop_type,
planned_sequence, planned_arrival_at, actual_arrival_at, actual_departure_at,
passengers_expected, luggage_expected, parcels_expected,
locked, driver_notes, status
```

Join tables associate passengers and parcels with each stop. Multiple requirements at one address group into a single stop — Office confirms grouping, never automatic.

Office can: drag stops · group/ungroup · add/remove · lock positions · change addresses · recalculate historical ETA · view luggage and parcel load · view vehicle load.

**The system warns when projected arrival risks missing the crossing check-in deadline.** This warning matters more than route optimisation — missing check-in is the failure that ruins a day.

---

## 21. Crossing information

Operational information. Store: booking reference, passenger limit, cost, check-in deadline, crossing time and status where useful.

Visible only to Office/Dispatcher and assigned drivers. **Passengers never see crossing booking information.**

Driver view shows prominently:
```
Crossing check-in: 11:30
Reference: XXXXX
```

Dispatch warns Office and drivers if historical ETA suggests check-in may be missed.

---

## 22. Driver assignments and responsibility

**`driver_assignments`**
```
id, departure_id, vehicle_id, driver_id, role,
from_stop_sequence, to_stop_sequence,
assigned_by, assigned_at, accepted_at, status
```

An assignment means: **Driver X drove Vehicle Y from Stop A through Stop B.**

Supports one driver for the whole journey, two-driver operation, mid-route changeovers, and different drivers on outbound and return legs.

**`vehicle_duties`** chains a vehicle's day across departures:
```
id, vehicle_id, duty_date, start_odometer, end_odometer, notes
```
with `departures.vehicle_duty_id`. A van running London→Antwerp in the morning and Antwerp→London in the evening is one duty across two departures — this is what makes mileage, availability and driver hours carry across both legs instead of being double-counted.

---

## 23. Driver handovers

**`handovers`**
```
id, departure_id, vehicle_id, stop_id, from_driver_id, to_driver_id, occurred_at,
odometer, fuel_level, cash_float_gbp, cash_float_eur,
passenger_count_confirmed, parcel_count_confirmed, keys_transferred,
notes, from_signature, to_signature
```

Both drivers confirm. The record establishes exactly where and when responsibility changed, vehicle mileage, passengers and parcels handed over, cash handed over, and who was responsible before and after.

---

## 24. Driver duty log

Events: `start | arrived | break | fuel | border | handover | end`

Each records `driver_id, vehicle_id, departure_id, event_type, event_at, odometer, note`.

**Offline-first is required.** The app updates immediately and syncs when connectivity returns — the M20, the port, the tunnel and the Belgian motorway all drop signal. Actions queue locally with client-generated UUIDs and timestamps. **Driver actions are authoritative** for operational events; the server never overwrites them. Office plan changes arrive as a notification, not a silent overwrite. Visible sync indicator.

---

## 25. Driver pay

Every driver finishes a duty with a clear financial record.

```
Driver: Moshe
London collections → Folkestone
4h 35m · 126 miles

Driver pay:      £120
Expenses:        £ 28
Cash collected:  £ 15

Handover: David at Folkestone
```

Pay models supported: hourly · per trip · per day · manually adjusted amount.

The system calculates a **suggested** amount from recorded duty information. **Office approves the final amount.**

**`driver_pay_statements`**
```
id, driver_id, period_start, period_end, total_hours, total_trips,
base_pay, adjustments, expenses_reimbursed, total, status, approved_by, generated_at
```

Weekly statements follow the Cleano Ops pattern: Sunday–Saturday week, paid the following Friday. **Statement, not invoice** — no invoice wording, no VAT lines. Self-employed drivers issue their own invoices to the charity.

**`driver_expenses`** — `id, driver_id, departure_id, type (fuel|toll|crossing|parking|meal|other), amount, currency, receipt_storage_path, approved_by, approved_at`

---

## 26. Cash ledger

Driver cash must never exist only as a note or a handover balance.

**`cash_transactions`**
```
id, driver_id, departure_id, booking_id, parcel_id, transaction_type,
currency, amount, received_from, received_at,
handed_over_to, handed_over_at, reconciled_by, reconciled_at, notes
```

Transaction types: passenger contribution · deposit · luggage charge · parcel payment · cash refund · driver-to-driver handover · driver-to-office handover · opening float.

GBP and EUR tracked separately, never netted.

Every driver's duty shows:
```
Opening cash
+ Cash collected
− Cash refunded / paid out
− Cash handed over
= Expected closing cash
```

Office reconciliation records actual cash and any discrepancy. **Unreconciled cash blocks a departure from reaching `completed`.**

---

## 27. Fleet and vehicle compliance

Major module, reusable by Cleano Ops.

**`vehicles`**
```
id, registration, make_model, seat_capacity, hold_capacity_units,
wheelchair_capacity, current_mileage, status, notes, active
```

Status: `available | assigned | maintenance | defect | accident | unavailable`

An unavailable vehicle cannot be assigned to new work without Admin override and a recorded reason.

---

## 28. Vehicle documents and compliance

Track: MOT · insurance · servicing · safety inspections · tachograph details where applicable · vehicle documents · mileage-based maintenance · expiry dates.

**`vehicle_documents`** — `id, vehicle_id, doc_type, reference, issued_at, expires_at, storage_path, uploaded_by`

Automatic reminders create fleet tasks. Default 30/14/7 days before expiry, configurable, and mileage-based triggers as well as date-based.

---

## 29. Daily vehicle checks

Driver mobile walkaround: tyres · lights · mirrors · windscreen · fluids · body damage · seatbelts · doors · safety equipment · other configurable items.

Result: `pass | advisory_defect | critical_defect`

**`vehicle_checks`** — `id, vehicle_id, driver_id, departure_id, check_type (pre_trip|post_trip), completed_at, items (jsonb), result, signature, notes`

Defects automatically create a fleet task. A critical defect immediately marks the vehicle **OUT OF SERVICE**, blocks assignment to any departure, and alerts Office so the run can be re-crewed.

---

## 30. Vehicle defects and maintenance

**`vehicle_defects`**
```
id, vehicle_id, reported_by, reported_at, severity, description,
photo_path, status, assigned_to, resolved_at, resolution_note
```

**`vehicle_maintenance`**
```
id, vehicle_id, type, scheduled_at, completed_at, mileage,
supplier, cost, currency, notes, document_path
```

This architecture ports to Cleano Ops.

---

## 31. Driver app

Driver sees only their assigned vehicle, departure and segment.

```
NEXT STOP
22 Stamford Hill              ETA 08:17

Collect
  · Mr A
  · Mrs B
  · 1 infant
  · 3 suitcases
  · Parcel SHP-1934

[ Navigate ]  [ Arrived ]  [ Collected ]  [ Problem ]
```

**Navigate** opens the address in the device's own navigation app. After completing a stop, the next assigned stop appears.

Driver records: boarded · absent · luggage collected · parcel collected · parcel delivered · delay · problem · stop completed.

Crossing information shown prominently when relevant.

Driver never sees: vulnerability notes, fares, deposits, other segments, other departures, or contact details beyond the current stop.

---

## 32. Phone Booking Console

One-screen operator workflow — the operator is talking to someone while using it, so no wizards and no page transitions.

**Caller:** passenger · previous trips · no-show count · standing waiver · preferred language · mobility needs · default addresses

**Departure:** direction and date · available seats · composition · hold capacity · parcel capacity · provisional capacity · status

**Booking:** passengers · `man | woman | boy | girl | infant` · pickup address · drop-off address · luggage · mobility requirements · contribution · deposit · waiver

One action provisionally reserves the required capacity.

---

## 33. Automated out-of-hours booking

Deliberately simple. It may: identify direction · offer available departures · ask passenger quantity · provisionally hold capacity · send confirmation SMS · create an Office callback task.

Office later confirms: passenger identities and categories · pickup and drop-off · luggage · mobility requirements · deposit · waiver.

**No automated card payment. No automated waiver assessment. No automated money decisions.**

DTMF keypad, not speech recognition — elderly voices, strong accents and road noise defeat ASR, and a misheard booking is worse than none. Human-recorded prompts, language pre-menu, **press 0 works at every prompt**. Departure within 12 hours routes to on-call rather than booking.

---

## 34. Fare, sponsorship and charitable subsidy

Four separate concepts:

```
notional journey value
− passenger contribution
− external sponsorship
= charity-funded subsidy
```

Deposit is separate.

| | |
|---|---|
| Notional value | £80 |
| Passenger contribution | £20 |
| External sponsorship | £30 |
| **Charity subsidy** | **£30** |
| Deposit | £20 refundable |

**Database constraint:** `notional_fare = contribution + sponsored + subsidy`. If it doesn't balance, the row doesn't save. `notional_fare` is populated on **every** passenger including free travellers — the entire charitable-impact story rests on it.

### Currency
Fixed dual pricing, **no live FX**. Every tariff row carries independently set `_gbp` and `_eur` amounts, both entered by hand — the EUR price is its own decision, set to a round, sayable number, not a conversion. Every booking, deposit, payment and parcel stores the currency actually transacted.

**`accounting_rates`** — `id, effective_from, effective_to, gbp_per_eur, set_by_user_id, note`

Admin sets a fixed internal rate periodically, used **only** to consolidate reporting into one currency. It never affects what a passenger is charged. Every consolidated report states the rate used.

---

## 35. Departure reconciliation

Every completed departure gets an operational and financial reconciliation.

```
LONDON → ANTWERP · Tuesday 12 May · 2 vehicles

PASSENGERS
  Capacity  18      Released  16
  Confirmed 16      Travelled 15      No-show 1
  7 men · 5 women · 1 boy · 1 girl · 1 infant

LOAD
  Suitcases 23      Parcels 4
  Hold used 22 / 26 units

CROSSING
  Limit 16 · Booked 16 · Check-in 11:30 · Met ✓

DRIVERS
  Moshe   London collections → Folkestone   4h 35m · 126 mi   £120
  David   Folkestone → Antwerp delivery     5h 10m · 148 mi   £135
  Handover: Folkestone 11:05 · odometer 84,312 · both confirmed ✓

INCOME
  Passenger contributions      £320
  External sponsorship         £180
  Luggage charges              £ 45
  Parcel income                £120 / €40
  Deposits retained            £ 20

COSTS
  Driver pay                   £255
  Driver expenses              £ 48
  Fuel                         £ ---
  Crossing                     £ ---
  Tolls / parking              £ ---
  Other                        £ ---
  TOTAL                        £ ---

CASH
  Float out    £100 / €50
  Collected    £ 15 / €180
  Handed in    £115 / €230
  Variance     £  0 / €  0   ✓ reconciled

RESULT
  Notional value delivered     £1,280
  Cost recovery                   38 %
  Cost per passenger travelled  £ ---
  Net charitable cost           £  700
```

Roll up by month, route, funder and referrer org.

**Standing reports:** subsidy delivered by month · distinct beneficiaries reached · trips per beneficiary · unmet demand · waitlist conversion rate · deposit retention rate · no-show and late-cancel rates · cancellation outcomes by operator (consistency check) · cash variance by driver · driver cost per passenger.

These are the figures trustees, the Charity Commission annual return and every grant application will ask for. Capture from departure one — reconstructing them later is miserable.

---

## 36. Disruption and re-accommodation

When you cancel a departure — vehicle off the road, crossing cancelled, driver unavailable — Office needs one action, not sixteen.

Select the affected departure, choose a target departure, and move passengers, luggage and parcels across in bulk. The move runs the **full capacity check** on the target; anyone who doesn't fit is flagged for a personal call rather than silently dropped. Everyone moved is auto-notified by SMS in their language. Anyone not re-accommodated goes onto the waitlist for the target departure automatically.

**`disruption_events`** — `id, departure_id, type, reason, decided_by, occurred_at, passengers_moved, passengers_unplaced, notes`

---

## 37. Fallback manifest

A nightly job generates a **printable PDF per departure** for the following day: stop sequence, passengers per stop with phone numbers, categories, luggage counts, parcels, driver segment bounds, vehicle, crossing reference and check-in time.

Emailed to Office and assigned drivers the evening before.

If Supabase, Vercel or a driver's phone is unavailable at 6am, the run still happens off paper. Low effort, and the only thing standing between a bad morning and a cancelled departure.

---

## 38. Call logging

**`call_logs`** — `id, from_number, matched_passenger_id, operator_id, started_at, duration, channel, outcome, notes`

Outcomes: `booked` · `provisional_created` · `waitlisted` · `no_capacity` · `abandoned_at_menu` · `pressed_zero` · `urgent_routed` · `enquiry_only`

`no_capacity` and `abandoned_at_menu` are the two most valuable metrics in the system — unmet demand, and whether the automated line actually works for this passenger base. Review monthly and adjust prompts and capacity accordingly.

---

## 39. Build priority

**Phase 1 — Operational core**
Departures · vehicles (basic) · released capacity · passengers and categories including infants · addresses with fuzzy match, areas and booking-time snapshot · pickup/drop-off · luggage capture and dual-currency tariffs · provisional bookings · deposits · waivers · confirmed bookings · return trips · capacity allocation function · Office Booking Console · SMS/email confirmations

**Phase 2 — Dispatch**
Operational stops · grouping · area running order · route templates · manual reorder and locking · crossing details and check-in warning · multi-vehicle and load rebalancing · driver assignments, segments and handovers · driver duty log · driver route screen · boarding and collection · **offline sync** · fallback manifest PDF

**Phase 3 — Fleet and parcels**
Vehicle status and compliance · documents and expiry reminders · walkaround checks · defects and out-of-service blocking · maintenance · parcel bookings · parcel pricing and hold capacity · collection and delivery with proof
→ *Fleet architecture ports to Cleano Ops*

**Phase 4 — Money and automation**
Take Payments live · deposit capture, release and retention · **cash ledger and reconciliation** · driver expenses, suggested pay and approved statements · cancellation decisions and reporting · departure reconciliation · subsidy reporting · accounting rate · leg-timing history job · disruption and re-accommodation · automated out-of-hours line · call logging · waitlist

**Phase 5 — Public and self-service**
Online booking · passenger account · saved addresses · luggage selection · deposit payment · cancellation requests · parcel booking · multi-language UI (English, Yiddish, Hebrew, Dutch) · referrer portal and sponsorship

**Deferred until core is stable** (same pattern as Cleano Ops):
1. Rate limiting on API routes; WAF once public traffic exists
2. Full RLS hardening review — especially driver ↔ passenger separation
3. Supabase backup/retention tier confirmation, plus periodic export to Dropbox as an independent backup

---

## 40. Backlog and open questions

### 40.1 Deferred by decision
- **Escorts and carers** travelling free alongside a disabled passenger — needs an explicit link between the two booking rows, not just a fare class.
- **Unaccompanied minors.** The category model includes boys and girls, so children will travel. Before any child travels without a parent, this needs documented guardian consent, a named responsible adult at each end, and a handover record at both. Not a launch blocker, but it must be settled before the first unaccompanied child is carried, not after.
- **Driver device data hygiene** — auto-purge of cached passenger data on departure completion, plus remote wipe.

### 40.2 To confirm before launch
1. **Infant seating and restraint rules** for the vehicle class in both the UK and Belgium — whether an infant may travel on a lap, and what restraint is required. This sets `occupies_seat` and affects the legal seat count.
2. **Carrier passenger information requirements.** Passport capture is deliberately excluded, which removes the highest-risk data in the system. But confirm with the ferry/tunnel operator what they require before Phase 2 goes live. If they do require it, add a minimal encrypted table with restricted RLS and an automatic purge job — the manifest export slot in §37 is already there.
3. **Take Payments** — MOTO MID for the second entity, and pre-authorisation capability for deposits.

### 40.3 Needs professional advice — I'm not a lawyer or accountant
1. **PSV operator licence and international authorisation** for a regular scheduled UK ⇄ Belgium service. Charging anything usually rules out the lighter permit regimes.
2. **Section 19/22 permits** — restrictive on who may be carried and what may be charged.
3. **Charity structure** — CIO vs charitable company, trustees, Charity Commission registration. Determines whether waived and sponsored amounts report as charitable expenditure.
4. **Parcel service as trading income.** Likely non-primary-purpose trading — may need a trading subsidiary, and has different VAT treatment from passenger transport. Resolve before Phase 3.
5. **Deposits as held funds.** A charity holding refundable deposits from beneficiaries has reporting and safeguarding implications; write and publish the retention policy.
6. **Safeguarding.** Written policy, driver DBS checks (store status and expiry on `drivers`), incident procedure.
7. **Insurance** — passenger liability, cross-border cover, goods-in-transit for parcels, volunteer vs paid driver distinction.
8. **Drivers' hours and tachograph** rules for international passenger work. The duty log supports the legal record; it does not replace it.
9. **Euro cash** collected abroad by self-employed drivers on behalf of a charity — confirm treatment with the accountant.
10. **GDPR** — UK↔EU transfer basis, privacy notice in English/Yiddish/Dutch, retention schedule, anonymise-don't-delete on erasure requests so subsidy reporting survives.

### 40.4 Design decisions still open
- Does `category` drive a seating rule, or is it reporting only?
- Is `dispatcher` a distinct role at launch, or the same person as Office?
- Grouping radius default, and whether it varies by area.
- Late-cancel / no-show threshold that triggers a standing-waiver review.

---

## 41. Naming

Short, professional, single-word — matching Cleano and Estbury. To check for availability: **Shuttra · Vanto · Carrio · Passar · Bridgen · Overo**. Working title in code: `shuttle-ops`.