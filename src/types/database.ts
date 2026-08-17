// Hand-written to match supabase/migrations/*.sql, same convention as
// Cleano Ops's src/types/database.ts. Once the Supabase CLI is linked, this
// can be regenerated with:
//   npx supabase gen types typescript --project-id <ref> > src/types/database.ts

export type StaffRole = "admin" | "office" | "dispatcher" | "driver";

export type PassengerCategory = "man" | "woman" | "boy" | "girl" | "infant";

export type Currency = "GBP" | "EUR";

export type AddressType = "residential" | "fixed_point" | "business";

export type OrgType = "referrer" | "sponsor";

export type VehicleStatus =
  | "available"
  | "assigned"
  | "maintenance"
  | "defect"
  | "accident"
  | "unavailable";

export type DepartureDirection = "outbound" | "return";

export type DepartureStatus =
  | "draft"
  | "published"
  | "boarding"
  | "departed"
  | "completed"
  | "cancelled";

export type BookingChannel = "phone" | "office" | "online";

export type BookingStatus =
  | "provisional"
  | "deposit_pending"
  | "confirmed"
  | "travelled"
  | "cancelled"
  | "no_show"
  | "expired";

export type TripStatus = "provisional" | "confirmed" | "cancelled";

export type DepositStatus =
  | "not_required"
  | "required"
  | "pending"
  | "secured"
  | "released"
  | "retained"
  | "waived";

/** deposits.status has no "not_required" state - a deposit row only exists
 * once one is actually required. */
export type DepositRowStatus = Exclude<DepositStatus, "not_required">;

export type CreatedVia = "phone" | "office" | "online";

export type MessageChannel = "email" | "sms";

export type MessageStatus = "sent" | "failed" | "skipped_not_configured";

/** Failure codes raised by allocate_booking_capacity() / surfaced verbatim
 * in Supabase's error.message. `no_parcel_capacity` is reserved for Phase 3
 * (parcels table doesn't exist yet) - included here for forward
 * compatibility, never actually thrown in Phase 1. */
export type CapacityFailureCode =
  | "no_seats"
  | "crossing_limit_reached"
  | "no_hold_capacity"
  | "no_parcel_capacity"
  | "no_wheelchair_space"
  | "unsecured_cap_reached"
  | "no_vehicle_capacity"
  | "not_authorized"
  | "departure_not_found"
  | "departure_not_bookable";

/** One element of the jsonb array passed as
 * allocate_booking_capacity()'s p_booking_passengers / nested inside
 * allocate_trip_capacity()'s p_outbound/p_return. Field names match
 * booking_passengers columns exactly - the SQL function reads them via
 * `->>'field_name'`. */
export interface BookingPassengerInput {
  passenger_id: string;
  category: PassengerCategory;
  occupies_seat: boolean;
  departure_vehicle_id?: string | null;
  pickup_address_id?: string | null;
  dropoff_address_id?: string | null;
  pickup_address_snapshot?: Record<string, unknown> | null;
  dropoff_address_snapshot?: Record<string, unknown> | null;
  mobility_needs?: string | null;
  wheelchair_space?: boolean;
  currency: Currency;
  notional_fare: number;
  contribution: number;
  sponsored: number;
  subsidy: number;
  sponsor_org_id?: string | null;
  deposit_required?: boolean;
  deposit_status?: DepositStatus;
  luggage_large?: number;
  luggage_small?: number;
  luggage_hand?: number;
  luggage_oversize?: number;
  luggage_units_consumed?: number;
  luggage_charge?: number;
  status?: BookingStatus;
}

export interface AllocateBookingLeg {
  departure_id: string;
  channel: BookingChannel;
  booking_passengers: BookingPassengerInput[];
  notes?: string | null;
  override_reason?: string | null;
}

export interface AllocateBookingResult {
  booking_id: string;
  reference: string;
}

export interface AllocateTripResult {
  trip_id: string;
  reference: string;
  outbound: AllocateBookingResult;
  return: AllocateBookingResult | null;
}

// --- Phase 2 (Dispatch) ---

export type StopType = "pickup" | "dropoff" | "crossing" | "waypoint";
export type StopStatus = "pending" | "arrived" | "completed" | "skipped" | "problem";
export type StopPassengerRole = "pickup" | "dropoff";
export type DriverAssignmentRole = "driver" | "co_driver";
export type DriverAssignmentStatus = "assigned" | "accepted" | "declined" | "completed";
export type DutyEventType = "start" | "arrived" | "break" | "fuel" | "border" | "handover" | "end";

/** Return shape of get_driver_assignments() — one entry per active
 * assignment, joined with just enough departure/route/vehicle info for
 * the driver app's own list, per build spec §31 (driver sees their
 * assigned vehicle/departure/segment, nothing else). */
export interface DriverAssignmentSummary {
  assignment_id: string;
  departure_id: string;
  direction: DepartureDirection;
  depart_at: string;
  departure_status: DepartureStatus;
  route_name: string;
  vehicle_id: string;
  vehicle_registration: string;
  from_stop_sequence: number | null;
  to_stop_sequence: number | null;
  assignment_status: DriverAssignmentStatus;
  crossing_reference: string | null;
  crossing_checkin_deadline: string | null;
}

/** One passenger's safe fields within get_driver_stop_manifest()'s output
 * — never vulnerability_notes, fares, or deposit_status (build spec §4). */
export interface DriverManifestPassenger {
  operational_stop_passenger_id: string;
  role: StopPassengerRole;
  boarded: boolean;
  full_name: string;
  phone: string | null;
  category: PassengerCategory;
  mobility_needs: string | null;
  wheelchair_space: boolean;
  luggage_large: number;
  luggage_small: number;
  luggage_hand: number;
  luggage_oversize: number;
  no_show: boolean;
}

export interface DriverManifestStop {
  stop_id: string;
  address: {
    line1: string;
    postcode: string;
    fixed_point_name: string | null;
    access_notes: string | null;
    latitude: number | null;
    longitude: number | null;
  };
  stop_type: StopType;
  planned_sequence: number;
  planned_arrival_at: string | null;
  actual_arrival_at: string | null;
  actual_departure_at: string | null;
  status: StopStatus;
  locked: boolean;
  driver_notes: string | null;
  passengers: DriverManifestPassenger[];
  parcels: DriverManifestParcel[];
}

/** One parcel's safe fields within get_driver_stop_manifest()'s output —
 * contact_name/contact_phone are already resolved to whichever side
 * (sender for collection, recipient for delivery) is relevant at this
 * specific stop, per 0038's comment. */
export interface DriverManifestParcel {
  operational_stop_parcel_id: string;
  parcel_id: string;
  reference: string;
  role: "collection" | "delivery";
  contact_name: string;
  contact_phone: string | null;
  size_category: ParcelSizeCategory;
  quantity: number;
  description: string | null;
  special_instructions: string | null;
  status: ParcelStatus;
}

/** Return shape of get_driver_stop_manifest(p_departure_id). */
export interface DriverStopManifest {
  stops: DriverManifestStop[];
}

// --- Phase 3 (Fleet & parcels) ---

export type FleetTaskType = "document_expiry" | "defect" | "maintenance_due";
export type FleetTaskStatus = "open" | "in_progress" | "resolved";
export type FleetTaskCreatedFrom = "document_expiry_sweep" | "check_defect" | "manual_defect" | "maintenance_schedule";
export type VehicleDocType = "mot" | "insurance" | "service" | "safety_inspection" | "tachograph" | "other";
export type VehicleCheckType = "pre_trip" | "post_trip";
export type VehicleCheckResult = "pass" | "advisory_defect" | "critical_defect";
export type DefectSeverity = "minor" | "major" | "critical";
export type DefectStatus = "open" | "in_progress" | "resolved";
export type ParcelSizeCategory = "small" | "medium" | "large" | "oversize";
export type ParcelPaymentStatus = "pending" | "paid" | "refunded";
export type ParcelStatus =
  | "booked"
  | "collection_due"
  | "collected"
  | "onboard"
  | "delivery_due"
  | "delivered"
  | "cancelled"
  | "failed_collection"
  | "failed_delivery";
export type OperationalStopParcelRole = "collection" | "delivery";

export interface ParcelBookingInput {
  sender_name: string;
  sender_phone?: string | null;
  sender_address_id?: string | null;
  recipient_name: string;
  recipient_phone?: string | null;
  recipient_address_id?: string | null;
  quantity?: number;
  size_category: ParcelSizeCategory;
  units_consumed?: number;
  description?: string | null;
  special_instructions?: string | null;
  prohibited_items_declared: boolean;
  price: number;
  currency: Currency;
  created_by?: string | null;
}

export interface AllocateParcelResult {
  parcel_id: string;
  reference: string;
}

// Relationships is always [] here — this project doesn't rely on
// supabase-js's foreign-table embedding, so every table gets an empty
// array instead of repeating the field by hand below (same helper as
// Cleano Ops's database.ts).
type WithEmptyRelationships<T> = {
  [K in keyof T]: T[K] & { Relationships: [] };
};

interface TablesRaw {
  profiles: {
    Row: {
      id: string;
      role: StaffRole;
      display_name: string;
      phone: string | null;
      created_at: string;
    };
    Insert: {
      id: string;
      role: StaffRole;
      display_name: string;
      phone?: string | null;
      created_at?: string;
    };
    Update: {
      id?: string;
      role?: StaffRole;
      display_name?: string;
      phone?: string | null;
      created_at?: string;
    };
  };
  app_settings: {
    Row: {
      id: boolean;
      unsecured_provisional_cap_pct: number;
      provisional_expiry_hours: number;
      updated_at: string;
    };
    Insert: {
      id?: boolean;
      unsecured_provisional_cap_pct?: number;
      provisional_expiry_hours?: number;
      updated_at?: string;
    };
    Update: {
      id?: boolean;
      unsecured_provisional_cap_pct?: number;
      provisional_expiry_hours?: number;
      updated_at?: string;
    };
  };
  areas: {
    Row: {
      id: string;
      name: string;
      country: string;
      running_order: number;
      active: boolean;
      created_at: string;
    };
    Insert: {
      id?: string;
      name: string;
      country: string;
      running_order?: number;
      active?: boolean;
      created_at?: string;
    };
    Update: {
      id?: string;
      name?: string;
      country?: string;
      running_order?: number;
      active?: boolean;
      created_at?: string;
    };
  };
  addresses: {
    Row: {
      id: string;
      line1: string;
      line2: string | null;
      city: string | null;
      postcode: string;
      country: string;
      area_id: string | null;
      formatted_address: string | null;
      access_notes: string | null;
      latitude: number | null;
      longitude: number | null;
      address_type: AddressType | null;
      fixed_point_name: string | null;
      active: boolean;
      usage_count: number;
      created_by: string | null;
      created_at: string;
    };
    Insert: {
      id?: string;
      line1: string;
      line2?: string | null;
      city?: string | null;
      postcode: string;
      country?: string;
      area_id?: string | null;
      formatted_address?: string | null;
      access_notes?: string | null;
      latitude?: number | null;
      longitude?: number | null;
      address_type?: AddressType | null;
      fixed_point_name?: string | null;
      active?: boolean;
      usage_count?: number;
      created_by?: string | null;
      created_at?: string;
    };
    Update: {
      id?: string;
      line1?: string;
      line2?: string | null;
      city?: string | null;
      postcode?: string;
      country?: string;
      area_id?: string | null;
      formatted_address?: string | null;
      access_notes?: string | null;
      latitude?: number | null;
      longitude?: number | null;
      address_type?: AddressType | null;
      fixed_point_name?: string | null;
      active?: boolean;
      usage_count?: number;
      created_by?: string | null;
      created_at?: string;
    };
  };
  organizations: {
    Row: {
      id: string;
      name: string;
      org_type: OrgType;
      active: boolean;
      created_at: string;
    };
    Insert: {
      id?: string;
      name: string;
      org_type: OrgType;
      active?: boolean;
      created_at?: string;
    };
    Update: {
      id?: string;
      name?: string;
      org_type?: OrgType;
      active?: boolean;
      created_at?: string;
    };
  };
  routes: {
    Row: {
      id: string;
      name: string;
      code: string | null;
      origin_area_id: string | null;
      destination_area_id: string | null;
      supports_return: boolean;
      active: boolean;
      created_at: string;
    };
    Insert: {
      id?: string;
      name: string;
      code?: string | null;
      origin_area_id?: string | null;
      destination_area_id?: string | null;
      supports_return?: boolean;
      active?: boolean;
      created_at?: string;
    };
    Update: {
      id?: string;
      name?: string;
      code?: string | null;
      origin_area_id?: string | null;
      destination_area_id?: string | null;
      supports_return?: boolean;
      active?: boolean;
      created_at?: string;
    };
  };
  vehicles: {
    Row: {
      id: string;
      registration: string;
      make_model: string | null;
      seat_capacity: number;
      hold_capacity_units: number;
      wheelchair_capacity: number;
      current_mileage: number | null;
      status: VehicleStatus;
      notes: string | null;
      active: boolean;
      created_at: string;
    };
    Insert: {
      id?: string;
      registration: string;
      make_model?: string | null;
      seat_capacity: number;
      hold_capacity_units?: number;
      wheelchair_capacity?: number;
      current_mileage?: number | null;
      status?: VehicleStatus;
      notes?: string | null;
      active?: boolean;
      created_at?: string;
    };
    Update: {
      id?: string;
      registration?: string;
      make_model?: string | null;
      seat_capacity?: number;
      hold_capacity_units?: number;
      wheelchair_capacity?: number;
      current_mileage?: number | null;
      status?: VehicleStatus;
      notes?: string | null;
      active?: boolean;
      created_at?: string;
    };
  };
  departures: {
    Row: {
      id: string;
      route_id: string;
      direction: DepartureDirection;
      depart_at: string;
      arrive_estimate: string | null;
      status: DepartureStatus;
      seats_capacity: number;
      seats_released: number;
      hold_capacity_units: number;
      parcel_units_reserved: number;
      wheelchair_capacity: number;
      crossing_reference: string | null;
      crossing_passenger_limit: number | null;
      crossing_cost_gbp: number | null;
      crossing_cost_eur: number | null;
      crossing_checkin_deadline: string | null;
      notes: string | null;
      created_by: string | null;
      created_at: string;
      vehicle_duty_id: string | null;
    };
    Insert: {
      id?: string;
      route_id: string;
      direction: DepartureDirection;
      depart_at: string;
      arrive_estimate?: string | null;
      status?: DepartureStatus;
      seats_capacity: number;
      seats_released?: number;
      hold_capacity_units?: number;
      parcel_units_reserved?: number;
      wheelchair_capacity?: number;
      crossing_reference?: string | null;
      crossing_passenger_limit?: number | null;
      crossing_cost_gbp?: number | null;
      crossing_cost_eur?: number | null;
      crossing_checkin_deadline?: string | null;
      notes?: string | null;
      created_by?: string | null;
      created_at?: string;
      vehicle_duty_id?: string | null;
    };
    Update: {
      id?: string;
      route_id?: string;
      direction?: DepartureDirection;
      depart_at?: string;
      arrive_estimate?: string | null;
      status?: DepartureStatus;
      seats_capacity?: number;
      seats_released?: number;
      hold_capacity_units?: number;
      parcel_units_reserved?: number;
      wheelchair_capacity?: number;
      crossing_reference?: string | null;
      crossing_passenger_limit?: number | null;
      crossing_cost_gbp?: number | null;
      crossing_cost_eur?: number | null;
      crossing_checkin_deadline?: string | null;
      notes?: string | null;
      created_by?: string | null;
      created_at?: string;
      vehicle_duty_id?: string | null;
    };
  };
  departure_vehicles: {
    Row: {
      id: string;
      departure_id: string;
      vehicle_id: string;
      seats_capacity: number;
      hold_capacity_units: number;
      wheelchair_capacity: number;
      sequence: number;
      created_at: string;
      override_reason: string | null;
    };
    Insert: {
      id?: string;
      departure_id: string;
      vehicle_id: string;
      seats_capacity: number;
      hold_capacity_units?: number;
      wheelchair_capacity?: number;
      sequence?: number;
      created_at?: string;
      override_reason?: string | null;
    };
    Update: {
      id?: string;
      departure_id?: string;
      vehicle_id?: string;
      seats_capacity?: number;
      hold_capacity_units?: number;
      wheelchair_capacity?: number;
      sequence?: number;
      created_at?: string;
      override_reason?: string | null;
    };
  };
  passengers: {
    Row: {
      id: string;
      auth_user_id: string | null;
      full_name: string;
      phone: string | null;
      email: string | null;
      preferred_language: string | null;
      category: PassengerCategory;
      date_of_birth: string | null;
      age: number | null;
      is_vulnerable: boolean;
      vulnerability_notes: string | null;
      mobility_needs: string | null;
      default_pickup_address_id: string | null;
      default_dropoff_address_id: string | null;
      emergency_contact_name: string | null;
      emergency_contact_phone: string | null;
      deposit_waiver_standing: boolean;
      referrer_org_id: string | null;
      no_show_count: number;
      late_cancel_count: number;
      created_via: CreatedVia;
      created_at: string;
    };
    Insert: {
      id?: string;
      auth_user_id?: string | null;
      full_name: string;
      phone?: string | null;
      email?: string | null;
      preferred_language?: string | null;
      category: PassengerCategory;
      date_of_birth?: string | null;
      age?: number | null;
      is_vulnerable?: boolean;
      vulnerability_notes?: string | null;
      mobility_needs?: string | null;
      default_pickup_address_id?: string | null;
      default_dropoff_address_id?: string | null;
      emergency_contact_name?: string | null;
      emergency_contact_phone?: string | null;
      deposit_waiver_standing?: boolean;
      referrer_org_id?: string | null;
      no_show_count?: number;
      late_cancel_count?: number;
      created_via?: CreatedVia;
      created_at?: string;
    };
    Update: {
      id?: string;
      auth_user_id?: string | null;
      full_name?: string;
      phone?: string | null;
      email?: string | null;
      preferred_language?: string | null;
      category?: PassengerCategory;
      date_of_birth?: string | null;
      age?: number | null;
      is_vulnerable?: boolean;
      vulnerability_notes?: string | null;
      mobility_needs?: string | null;
      default_pickup_address_id?: string | null;
      default_dropoff_address_id?: string | null;
      emergency_contact_name?: string | null;
      emergency_contact_phone?: string | null;
      deposit_waiver_standing?: boolean;
      referrer_org_id?: string | null;
      no_show_count?: number;
      late_cancel_count?: number;
      created_via?: CreatedVia;
      created_at?: string;
    };
  };
  passenger_account_users: {
    Row: {
      id: string;
      passenger_id: string;
      user_id: string;
      created_at: string;
    };
    Insert: {
      id?: string;
      passenger_id: string;
      user_id: string;
      created_at?: string;
    };
    Update: {
      id?: string;
      passenger_id?: string;
      user_id?: string;
      created_at?: string;
    };
  };
  tariffs: {
    Row: {
      id: string;
      route_id: string;
      direction: DepartureDirection | null;
      category: PassengerCategory | null;
      base_fare_gbp: number;
      base_fare_eur: number;
      luggage_large_allowance: number;
      luggage_small_allowance: number;
      luggage_hand_allowance: number;
      luggage_additional_charge_gbp: number;
      luggage_additional_charge_eur: number;
      luggage_oversize_charge_gbp: number;
      luggage_oversize_charge_eur: number;
      capacity_units_per_large: number;
      capacity_units_per_small: number;
      capacity_units_per_oversize: number;
      effective_from: string;
      active: boolean;
      created_at: string;
    };
    Insert: {
      id?: string;
      route_id: string;
      direction?: DepartureDirection | null;
      category?: PassengerCategory | null;
      base_fare_gbp: number;
      base_fare_eur: number;
      luggage_large_allowance?: number;
      luggage_small_allowance?: number;
      luggage_hand_allowance?: number;
      luggage_additional_charge_gbp?: number;
      luggage_additional_charge_eur?: number;
      luggage_oversize_charge_gbp?: number;
      luggage_oversize_charge_eur?: number;
      capacity_units_per_large?: number;
      capacity_units_per_small?: number;
      capacity_units_per_oversize?: number;
      effective_from?: string;
      active?: boolean;
      created_at?: string;
    };
    Update: {
      id?: string;
      route_id?: string;
      direction?: DepartureDirection | null;
      category?: PassengerCategory | null;
      base_fare_gbp?: number;
      base_fare_eur?: number;
      luggage_large_allowance?: number;
      luggage_small_allowance?: number;
      luggage_hand_allowance?: number;
      luggage_additional_charge_gbp?: number;
      luggage_additional_charge_eur?: number;
      luggage_oversize_charge_gbp?: number;
      luggage_oversize_charge_eur?: number;
      capacity_units_per_large?: number;
      capacity_units_per_small?: number;
      capacity_units_per_oversize?: number;
      effective_from?: string;
      active?: boolean;
      created_at?: string;
    };
  };
  trips: {
    Row: {
      id: string;
      reference: string;
      lead_passenger_id: string;
      outbound_booking_id: string | null;
      return_booking_id: string | null;
      status: TripStatus;
      created_at: string;
    };
    Insert: {
      id?: string;
      reference?: string;
      lead_passenger_id: string;
      outbound_booking_id?: string | null;
      return_booking_id?: string | null;
      status?: TripStatus;
      created_at?: string;
    };
    Update: {
      id?: string;
      reference?: string;
      lead_passenger_id?: string;
      outbound_booking_id?: string | null;
      return_booking_id?: string | null;
      status?: TripStatus;
      created_at?: string;
    };
  };
  bookings: {
    Row: {
      id: string;
      reference: string;
      trip_id: string | null;
      departure_id: string;
      lead_passenger_id: string;
      channel: BookingChannel;
      status: BookingStatus;
      provisional_expires_at: string | null;
      booked_by_user_id: string | null;
      notes: string | null;
      created_at: string;
    };
    Insert: {
      id?: string;
      reference?: string;
      trip_id?: string | null;
      departure_id: string;
      lead_passenger_id: string;
      channel?: BookingChannel;
      status?: BookingStatus;
      provisional_expires_at?: string | null;
      booked_by_user_id?: string | null;
      notes?: string | null;
      created_at?: string;
    };
    Update: {
      id?: string;
      reference?: string;
      trip_id?: string | null;
      departure_id?: string;
      lead_passenger_id?: string;
      channel?: BookingChannel;
      status?: BookingStatus;
      provisional_expires_at?: string | null;
      booked_by_user_id?: string | null;
      notes?: string | null;
      created_at?: string;
    };
  };
  booking_passengers: {
    Row: {
      id: string;
      booking_id: string;
      passenger_id: string;
      category: PassengerCategory;
      occupies_seat: boolean;
      departure_vehicle_id: string | null;
      pickup_address_id: string | null;
      dropoff_address_id: string | null;
      pickup_address_snapshot: Record<string, unknown> | null;
      dropoff_address_snapshot: Record<string, unknown> | null;
      mobility_needs: string | null;
      wheelchair_space: boolean;
      currency: Currency;
      notional_fare: number;
      contribution: number;
      sponsored: number;
      subsidy: number;
      sponsor_org_id: string | null;
      deposit_required: boolean;
      deposit_status: DepositStatus;
      waiver_id: string | null;
      luggage_large: number;
      luggage_small: number;
      luggage_hand: number;
      luggage_oversize: number;
      luggage_units_consumed: number;
      luggage_charge: number;
      boarded_at: string | null;
      no_show: boolean;
      status: BookingStatus;
      created_at: string;
    };
    Insert: {
      id?: string;
      booking_id: string;
      passenger_id: string;
      category: PassengerCategory;
      occupies_seat?: boolean;
      departure_vehicle_id?: string | null;
      pickup_address_id?: string | null;
      dropoff_address_id?: string | null;
      pickup_address_snapshot?: Record<string, unknown> | null;
      dropoff_address_snapshot?: Record<string, unknown> | null;
      mobility_needs?: string | null;
      wheelchair_space?: boolean;
      currency: Currency;
      notional_fare?: number;
      contribution?: number;
      sponsored?: number;
      subsidy?: number;
      sponsor_org_id?: string | null;
      deposit_required?: boolean;
      deposit_status?: DepositStatus;
      waiver_id?: string | null;
      luggage_large?: number;
      luggage_small?: number;
      luggage_hand?: number;
      luggage_oversize?: number;
      luggage_units_consumed?: number;
      luggage_charge?: number;
      boarded_at?: string | null;
      no_show?: boolean;
      status?: BookingStatus;
      created_at?: string;
    };
    Update: {
      id?: string;
      booking_id?: string;
      passenger_id?: string;
      category?: PassengerCategory;
      occupies_seat?: boolean;
      departure_vehicle_id?: string | null;
      pickup_address_id?: string | null;
      dropoff_address_id?: string | null;
      pickup_address_snapshot?: Record<string, unknown> | null;
      dropoff_address_snapshot?: Record<string, unknown> | null;
      mobility_needs?: string | null;
      wheelchair_space?: boolean;
      currency?: Currency;
      notional_fare?: number;
      contribution?: number;
      sponsored?: number;
      subsidy?: number;
      sponsor_org_id?: string | null;
      deposit_required?: boolean;
      deposit_status?: DepositStatus;
      waiver_id?: string | null;
      luggage_large?: number;
      luggage_small?: number;
      luggage_hand?: number;
      luggage_oversize?: number;
      luggage_units_consumed?: number;
      luggage_charge?: number;
      boarded_at?: string | null;
      no_show?: boolean;
      status?: BookingStatus;
      created_at?: string;
    };
  };
  waivers: {
    Row: {
      id: string;
      booking_passenger_id: string;
      reason_code: string;
      notes: string | null;
      granted_by_user_id: string;
      granted_at: string;
    };
    Insert: {
      id?: string;
      booking_passenger_id: string;
      reason_code: string;
      notes?: string | null;
      granted_by_user_id: string;
      granted_at?: string;
    };
    Update: {
      id?: string;
      booking_passenger_id?: string;
      reason_code?: string;
      notes?: string | null;
      granted_by_user_id?: string;
      granted_at?: string;
    };
  };
  deposits: {
    Row: {
      id: string;
      booking_passenger_id: string;
      amount: number;
      currency: Currency;
      status: DepositRowStatus;
      method: string | null;
      take_payments_ref: string | null;
      taken_by_user_id: string | null;
      taken_at: string | null;
      released_at: string | null;
      retained_at: string | null;
      retained_amount: number | null;
      reason_code: string | null;
      decided_by_user_id: string | null;
      notes: string | null;
      created_at: string;
    };
    Insert: {
      id?: string;
      booking_passenger_id: string;
      amount: number;
      currency: Currency;
      status?: DepositRowStatus;
      method?: string | null;
      take_payments_ref?: string | null;
      taken_by_user_id?: string | null;
      taken_at?: string | null;
      released_at?: string | null;
      retained_at?: string | null;
      retained_amount?: number | null;
      reason_code?: string | null;
      decided_by_user_id?: string | null;
      notes?: string | null;
      created_at?: string;
    };
    Update: {
      id?: string;
      booking_passenger_id?: string;
      amount?: number;
      currency?: Currency;
      status?: DepositRowStatus;
      method?: string | null;
      take_payments_ref?: string | null;
      taken_by_user_id?: string | null;
      taken_at?: string | null;
      released_at?: string | null;
      retained_at?: string | null;
      retained_amount?: number | null;
      reason_code?: string | null;
      decided_by_user_id?: string | null;
      notes?: string | null;
      created_at?: string;
    };
  };
  booking_messages: {
    Row: {
      id: string;
      booking_id: string | null;
      passenger_id: string | null;
      channel: MessageChannel;
      category: string;
      recipient: string;
      subject: string | null;
      body: string;
      status: MessageStatus;
      provider_ref: string | null;
      created_by_user_id: string | null;
      created_at: string;
    };
    Insert: {
      id?: string;
      booking_id?: string | null;
      passenger_id?: string | null;
      channel: MessageChannel;
      category: string;
      recipient: string;
      subject?: string | null;
      body: string;
      status: MessageStatus;
      provider_ref?: string | null;
      created_by_user_id?: string | null;
      created_at?: string;
    };
    Update: {
      id?: string;
      booking_id?: string | null;
      passenger_id?: string | null;
      channel?: MessageChannel;
      category?: string;
      recipient?: string;
      subject?: string | null;
      body?: string;
      status?: MessageStatus;
      provider_ref?: string | null;
      created_by_user_id?: string | null;
      created_at?: string;
    };
  };
  leg_timings: {
    Row: {
      id: string;
      from_area_id: string;
      to_area_id: string;
      day_of_week: number;
      time_band: string;
      sample_count: number;
      median_minutes: number | null;
      last_updated: string;
    };
    Insert: {
      id?: string;
      from_area_id: string;
      to_area_id: string;
      day_of_week: number;
      time_band: string;
      sample_count?: number;
      median_minutes?: number | null;
      last_updated?: string;
    };
    Update: {
      id?: string;
      from_area_id?: string;
      to_area_id?: string;
      day_of_week?: number;
      time_band?: string;
      sample_count?: number;
      median_minutes?: number | null;
      last_updated?: string;
    };
  };
  route_templates: {
    Row: {
      id: string;
      route_id: string;
      direction: DepartureDirection;
      name: string;
      notes: string | null;
      active: boolean;
      created_at: string;
    };
    Insert: {
      id?: string;
      route_id: string;
      direction: DepartureDirection;
      name: string;
      notes?: string | null;
      active?: boolean;
      created_at?: string;
    };
    Update: {
      id?: string;
      route_id?: string;
      direction?: DepartureDirection;
      name?: string;
      notes?: string | null;
      active?: boolean;
      created_at?: string;
    };
  };
  route_template_stops: {
    Row: {
      id: string;
      template_id: string;
      address_id: string | null;
      area_id: string | null;
      sequence: number;
      default_offset_minutes: number;
      created_at: string;
    };
    Insert: {
      id?: string;
      template_id: string;
      address_id?: string | null;
      area_id?: string | null;
      sequence?: number;
      default_offset_minutes?: number;
      created_at?: string;
    };
    Update: {
      id?: string;
      template_id?: string;
      address_id?: string | null;
      area_id?: string | null;
      sequence?: number;
      default_offset_minutes?: number;
      created_at?: string;
    };
  };
  vehicle_duties: {
    Row: {
      id: string;
      vehicle_id: string;
      duty_date: string;
      start_odometer: number | null;
      end_odometer: number | null;
      notes: string | null;
      created_at: string;
    };
    Insert: {
      id?: string;
      vehicle_id: string;
      duty_date: string;
      start_odometer?: number | null;
      end_odometer?: number | null;
      notes?: string | null;
      created_at?: string;
    };
    Update: {
      id?: string;
      vehicle_id?: string;
      duty_date?: string;
      start_odometer?: number | null;
      end_odometer?: number | null;
      notes?: string | null;
      created_at?: string;
    };
  };
  driver_assignments: {
    Row: {
      id: string;
      departure_id: string;
      vehicle_id: string;
      driver_id: string;
      role: DriverAssignmentRole;
      from_stop_sequence: number | null;
      to_stop_sequence: number | null;
      assigned_by: string | null;
      assigned_at: string;
      accepted_at: string | null;
      status: DriverAssignmentStatus;
      created_at: string;
      override_reason: string | null;
    };
    Insert: {
      id?: string;
      departure_id: string;
      vehicle_id: string;
      driver_id: string;
      role?: DriverAssignmentRole;
      from_stop_sequence?: number | null;
      to_stop_sequence?: number | null;
      assigned_by?: string | null;
      assigned_at?: string;
      accepted_at?: string | null;
      status?: DriverAssignmentStatus;
      created_at?: string;
      override_reason?: string | null;
    };
    Update: {
      id?: string;
      departure_id?: string;
      vehicle_id?: string;
      driver_id?: string;
      role?: DriverAssignmentRole;
      from_stop_sequence?: number | null;
      to_stop_sequence?: number | null;
      assigned_by?: string | null;
      assigned_at?: string;
      accepted_at?: string | null;
      status?: DriverAssignmentStatus;
      created_at?: string;
      override_reason?: string | null;
    };
  };
  operational_stops: {
    Row: {
      id: string;
      departure_id: string;
      departure_vehicle_id: string | null;
      address_id: string;
      stop_type: StopType;
      planned_sequence: number;
      planned_arrival_at: string | null;
      actual_arrival_at: string | null;
      actual_departure_at: string | null;
      passengers_expected: number;
      luggage_expected: number;
      parcels_expected: number;
      locked: boolean;
      driver_notes: string | null;
      status: StopStatus;
      created_at: string;
    };
    Insert: {
      id?: string;
      departure_id: string;
      departure_vehicle_id?: string | null;
      address_id: string;
      stop_type: StopType;
      planned_sequence?: number;
      planned_arrival_at?: string | null;
      actual_arrival_at?: string | null;
      actual_departure_at?: string | null;
      passengers_expected?: number;
      luggage_expected?: number;
      parcels_expected?: number;
      locked?: boolean;
      driver_notes?: string | null;
      status?: StopStatus;
      created_at?: string;
    };
    Update: {
      id?: string;
      departure_id?: string;
      departure_vehicle_id?: string | null;
      address_id?: string;
      stop_type?: StopType;
      planned_sequence?: number;
      planned_arrival_at?: string | null;
      actual_arrival_at?: string | null;
      actual_departure_at?: string | null;
      passengers_expected?: number;
      luggage_expected?: number;
      parcels_expected?: number;
      locked?: boolean;
      driver_notes?: string | null;
      status?: StopStatus;
      created_at?: string;
    };
  };
  operational_stop_passengers: {
    Row: {
      id: string;
      operational_stop_id: string;
      booking_passenger_id: string;
      role: StopPassengerRole;
      boarded: boolean;
    };
    Insert: {
      id?: string;
      operational_stop_id: string;
      booking_passenger_id: string;
      role: StopPassengerRole;
      boarded?: boolean;
    };
    Update: {
      id?: string;
      operational_stop_id?: string;
      booking_passenger_id?: string;
      role?: StopPassengerRole;
      boarded?: boolean;
    };
  };
  handovers: {
    Row: {
      id: string;
      departure_id: string;
      vehicle_id: string;
      stop_id: string | null;
      from_driver_id: string;
      to_driver_id: string;
      occurred_at: string | null;
      odometer: number | null;
      fuel_level: string | null;
      cash_float_gbp: number | null;
      cash_float_eur: number | null;
      passenger_count_confirmed: number | null;
      parcel_count_confirmed: number | null;
      keys_transferred: boolean;
      notes: string | null;
      from_signature: string | null;
      to_signature: string | null;
      created_at: string;
    };
    Insert: {
      id?: string;
      departure_id: string;
      vehicle_id: string;
      stop_id?: string | null;
      from_driver_id: string;
      to_driver_id: string;
      occurred_at?: string | null;
      odometer?: number | null;
      fuel_level?: string | null;
      cash_float_gbp?: number | null;
      cash_float_eur?: number | null;
      passenger_count_confirmed?: number | null;
      parcel_count_confirmed?: number | null;
      keys_transferred?: boolean;
      notes?: string | null;
      from_signature?: string | null;
      to_signature?: string | null;
      created_at?: string;
    };
    Update: {
      id?: string;
      departure_id?: string;
      vehicle_id?: string;
      stop_id?: string | null;
      from_driver_id?: string;
      to_driver_id?: string;
      occurred_at?: string | null;
      odometer?: number | null;
      fuel_level?: string | null;
      cash_float_gbp?: number | null;
      cash_float_eur?: number | null;
      passenger_count_confirmed?: number | null;
      parcel_count_confirmed?: number | null;
      keys_transferred?: boolean;
      notes?: string | null;
      from_signature?: string | null;
      to_signature?: string | null;
      created_at?: string;
    };
  };
  driver_duty_events: {
    Row: {
      id: string;
      driver_id: string;
      vehicle_id: string | null;
      departure_id: string | null;
      event_type: DutyEventType;
      event_at: string;
      client_occurred_at: string | null;
      client_id: string;
      odometer: number | null;
      note: string | null;
      created_at: string;
    };
    Insert: {
      id?: string;
      driver_id: string;
      vehicle_id?: string | null;
      departure_id?: string | null;
      event_type: DutyEventType;
      event_at?: string;
      client_occurred_at?: string | null;
      client_id: string;
      odometer?: number | null;
      note?: string | null;
      created_at?: string;
    };
    Update: {
      id?: string;
      driver_id?: string;
      vehicle_id?: string | null;
      departure_id?: string | null;
      event_type?: DutyEventType;
      event_at?: string;
      client_occurred_at?: string | null;
      client_id?: string;
      odometer?: number | null;
      note?: string | null;
      created_at?: string;
    };
  };
  fleet_tasks: {
    Row: {
      id: string;
      vehicle_id: string;
      task_type: FleetTaskType;
      title: string;
      description: string | null;
      due_date: string | null;
      status: FleetTaskStatus;
      created_from: FleetTaskCreatedFrom;
      source_document_id: string | null;
      source_defect_id: string | null;
      created_at: string;
      resolved_at: string | null;
      resolved_by: string | null;
    };
    Insert: {
      id?: string;
      vehicle_id: string;
      task_type: FleetTaskType;
      title: string;
      description?: string | null;
      due_date?: string | null;
      status?: FleetTaskStatus;
      created_from: FleetTaskCreatedFrom;
      source_document_id?: string | null;
      source_defect_id?: string | null;
      created_at?: string;
      resolved_at?: string | null;
      resolved_by?: string | null;
    };
    Update: {
      id?: string;
      vehicle_id?: string;
      task_type?: FleetTaskType;
      title?: string;
      description?: string | null;
      due_date?: string | null;
      status?: FleetTaskStatus;
      created_from?: FleetTaskCreatedFrom;
      source_document_id?: string | null;
      source_defect_id?: string | null;
      created_at?: string;
      resolved_at?: string | null;
      resolved_by?: string | null;
    };
  };
  vehicle_documents: {
    Row: {
      id: string;
      vehicle_id: string;
      doc_type: VehicleDocType;
      reference: string | null;
      issued_at: string | null;
      expires_at: string | null;
      storage_path: string | null;
      uploaded_by: string | null;
      created_at: string;
    };
    Insert: {
      id?: string;
      vehicle_id: string;
      doc_type: VehicleDocType;
      reference?: string | null;
      issued_at?: string | null;
      expires_at?: string | null;
      storage_path?: string | null;
      uploaded_by?: string | null;
      created_at?: string;
    };
    Update: {
      id?: string;
      vehicle_id?: string;
      doc_type?: VehicleDocType;
      reference?: string | null;
      issued_at?: string | null;
      expires_at?: string | null;
      storage_path?: string | null;
      uploaded_by?: string | null;
      created_at?: string;
    };
  };
  vehicle_checks: {
    Row: {
      id: string;
      vehicle_id: string;
      driver_id: string;
      departure_id: string | null;
      check_type: VehicleCheckType;
      completed_at: string;
      items: unknown;
      result: VehicleCheckResult;
      signature: string | null;
      notes: string | null;
    };
    Insert: {
      id?: string;
      vehicle_id: string;
      driver_id: string;
      departure_id?: string | null;
      check_type: VehicleCheckType;
      completed_at?: string;
      items?: unknown;
      result: VehicleCheckResult;
      signature?: string | null;
      notes?: string | null;
    };
    Update: {
      id?: string;
      vehicle_id?: string;
      driver_id?: string;
      departure_id?: string | null;
      check_type?: VehicleCheckType;
      completed_at?: string;
      items?: unknown;
      result?: VehicleCheckResult;
      signature?: string | null;
      notes?: string | null;
    };
  };
  vehicle_defects: {
    Row: {
      id: string;
      vehicle_id: string;
      reported_by: string;
      reported_at: string;
      severity: DefectSeverity;
      description: string;
      photo_path: string | null;
      status: DefectStatus;
      assigned_to: string | null;
      resolved_at: string | null;
      resolution_note: string | null;
    };
    Insert: {
      id?: string;
      vehicle_id: string;
      reported_by: string;
      reported_at?: string;
      severity: DefectSeverity;
      description: string;
      photo_path?: string | null;
      status?: DefectStatus;
      assigned_to?: string | null;
      resolved_at?: string | null;
      resolution_note?: string | null;
    };
    Update: {
      id?: string;
      vehicle_id?: string;
      reported_by?: string;
      reported_at?: string;
      severity?: DefectSeverity;
      description?: string;
      photo_path?: string | null;
      status?: DefectStatus;
      assigned_to?: string | null;
      resolved_at?: string | null;
      resolution_note?: string | null;
    };
  };
  vehicle_maintenance: {
    Row: {
      id: string;
      vehicle_id: string;
      type: string;
      scheduled_at: string | null;
      completed_at: string | null;
      mileage: number | null;
      supplier: string | null;
      cost: number | null;
      currency: Currency | null;
      notes: string | null;
      document_path: string | null;
      created_at: string;
    };
    Insert: {
      id?: string;
      vehicle_id: string;
      type: string;
      scheduled_at?: string | null;
      completed_at?: string | null;
      mileage?: number | null;
      supplier?: string | null;
      cost?: number | null;
      currency?: Currency | null;
      notes?: string | null;
      document_path?: string | null;
      created_at?: string;
    };
    Update: {
      id?: string;
      vehicle_id?: string;
      type?: string;
      scheduled_at?: string | null;
      completed_at?: string | null;
      mileage?: number | null;
      supplier?: string | null;
      cost?: number | null;
      currency?: Currency | null;
      notes?: string | null;
      document_path?: string | null;
      created_at?: string;
    };
  };
  parcel_tariffs: {
    Row: {
      id: string;
      route_id: string;
      size_category: ParcelSizeCategory;
      price_gbp: number;
      price_eur: number;
      capacity_units: number;
      active: boolean;
      created_at: string;
    };
    Insert: {
      id?: string;
      route_id: string;
      size_category: ParcelSizeCategory;
      price_gbp: number;
      price_eur: number;
      capacity_units?: number;
      active?: boolean;
      created_at?: string;
    };
    Update: {
      id?: string;
      route_id?: string;
      size_category?: ParcelSizeCategory;
      price_gbp?: number;
      price_eur?: number;
      capacity_units?: number;
      active?: boolean;
      created_at?: string;
    };
  };
  parcels: {
    Row: {
      id: string;
      reference: string;
      departure_id: string;
      departure_vehicle_id: string | null;
      sender_name: string;
      sender_phone: string | null;
      sender_address_id: string | null;
      recipient_name: string;
      recipient_phone: string | null;
      recipient_address_id: string | null;
      quantity: number;
      size_category: ParcelSizeCategory;
      units_consumed: number;
      description: string | null;
      special_instructions: string | null;
      prohibited_items_declared: boolean;
      price: number;
      currency: Currency;
      payment_status: ParcelPaymentStatus;
      payment_ref: string | null;
      status: ParcelStatus;
      collected_at: string | null;
      delivered_at: string | null;
      proof_photo_path: string | null;
      proof_signature_name: string | null;
      failure_reason: string | null;
      created_by: string | null;
      created_at: string;
    };
    Insert: {
      id?: string;
      reference?: string;
      departure_id: string;
      departure_vehicle_id?: string | null;
      sender_name: string;
      sender_phone?: string | null;
      sender_address_id?: string | null;
      recipient_name: string;
      recipient_phone?: string | null;
      recipient_address_id?: string | null;
      quantity?: number;
      size_category: ParcelSizeCategory;
      units_consumed?: number;
      description?: string | null;
      special_instructions?: string | null;
      prohibited_items_declared: boolean;
      price?: number;
      currency: Currency;
      payment_status?: ParcelPaymentStatus;
      payment_ref?: string | null;
      status?: ParcelStatus;
      collected_at?: string | null;
      delivered_at?: string | null;
      proof_photo_path?: string | null;
      proof_signature_name?: string | null;
      failure_reason?: string | null;
      created_by?: string | null;
      created_at?: string;
    };
    Update: {
      id?: string;
      reference?: string;
      departure_id?: string;
      departure_vehicle_id?: string | null;
      sender_name?: string;
      sender_phone?: string | null;
      sender_address_id?: string | null;
      recipient_name?: string;
      recipient_phone?: string | null;
      recipient_address_id?: string | null;
      quantity?: number;
      size_category?: ParcelSizeCategory;
      units_consumed?: number;
      description?: string | null;
      special_instructions?: string | null;
      prohibited_items_declared?: boolean;
      price?: number;
      currency?: Currency;
      payment_status?: ParcelPaymentStatus;
      payment_ref?: string | null;
      status?: ParcelStatus;
      collected_at?: string | null;
      delivered_at?: string | null;
      proof_photo_path?: string | null;
      proof_signature_name?: string | null;
      failure_reason?: string | null;
      created_by?: string | null;
      created_at?: string;
    };
  };
  operational_stop_parcels: {
    Row: {
      id: string;
      operational_stop_id: string;
      parcel_id: string;
      role: OperationalStopParcelRole;
    };
    Insert: {
      id?: string;
      operational_stop_id: string;
      parcel_id: string;
      role: OperationalStopParcelRole;
    };
    Update: {
      id?: string;
      operational_stop_id?: string;
      parcel_id?: string;
      role?: OperationalStopParcelRole;
    };
  };
}

export interface Database {
  public: {
    Tables: WithEmptyRelationships<TablesRaw>;
    Views: {
      departure_capacity_summary: {
        Row: {
          departure_id: string;
          seats_capacity: number;
          seats_released: number;
          hold_capacity_units: number;
          wheelchair_capacity: number;
          crossing_passenger_limit: number | null;
          seats_used: number;
          crossing_headcount: number;
          hold_used: number;
          wheelchair_used: number;
          unsecured_count: number;
          men: number;
          women: number;
          boys: number;
          girls: number;
          infants: number;
          luggage_units_used: number;
          parcel_units_used: number;
          parcel_count: number;
        };
        Relationships: [];
      };
    };
    Functions: {
      search_addresses: {
        Args: { p_query: string; p_limit?: number };
        Returns: TablesRaw["addresses"]["Row"][];
      };
      allocate_booking_capacity: {
        Args: {
          p_departure_id: string;
          p_lead_passenger_id: string;
          p_channel: BookingChannel;
          p_booking_passengers: BookingPassengerInput[];
          p_notes?: string | null;
          p_override_reason?: string | null;
          p_booked_by_user_id?: string | null;
          p_trip_id?: string | null;
        };
        Returns: AllocateBookingResult;
      };
      allocate_trip_capacity: {
        Args: {
          p_lead_passenger_id: string;
          p_outbound: AllocateBookingLeg;
          p_return?: AllocateBookingLeg | null;
          p_booked_by_user_id?: string | null;
        };
        Returns: AllocateTripResult;
      };
      get_driver_assignments: {
        Args: Record<string, never>;
        Returns: DriverAssignmentSummary[];
      };
      get_driver_stop_manifest: {
        Args: { p_departure_id: string };
        Returns: DriverStopManifest;
      };
      record_stop_arrival: {
        Args: {
          p_stop_id: string;
          p_client_id: string;
          p_odometer?: number | null;
          p_note?: string | null;
        };
        Returns: { status: string };
      };
      record_stop_departure: {
        Args: { p_stop_id: string };
        Returns: { status: string };
      };
      record_stop_problem: {
        Args: { p_stop_id: string; p_note: string };
        Returns: { status: string };
      };
      record_passenger_boarded: {
        Args: {
          p_operational_stop_passenger_id: string;
          p_boarded?: boolean;
          p_no_show?: boolean;
        };
        Returns: { status: string };
      };
      respond_to_driver_assignment: {
        Args: { p_assignment_id: string; p_accept: boolean };
        Returns: { status: DriverAssignmentStatus };
      };
      create_handover: {
        Args: {
          p_departure_id: string;
          p_vehicle_id: string;
          p_to_driver_id: string;
          p_stop_id?: string | null;
          p_odometer?: number | null;
          p_fuel_level?: string | null;
          p_cash_float_gbp?: number | null;
          p_cash_float_eur?: number | null;
          p_passenger_count_confirmed?: number | null;
          p_parcel_count_confirmed?: number | null;
          p_keys_transferred?: boolean;
          p_notes?: string | null;
          p_signature?: string | null;
        };
        Returns: { handover_id: string };
      };
      confirm_handover: {
        Args: { p_handover_id: string; p_signature: string };
        Returns: { status: string };
      };
      allocate_parcel_capacity: {
        Args: {
          p_departure_id: string;
          p_parcel: ParcelBookingInput;
          p_override_reason?: string | null;
        };
        Returns: AllocateParcelResult;
      };
      record_parcel_collected: {
        Args: { p_operational_stop_parcel_id: string; p_client_id: string };
        Returns: { status: string };
      };
      record_parcel_delivered: {
        Args: {
          p_operational_stop_parcel_id: string;
          p_signature_name?: string | null;
          p_proof_photo_path?: string | null;
        };
        Returns: { status: string };
      };
      record_parcel_failed: {
        Args: { p_operational_stop_parcel_id: string; p_reason: string };
        Returns: { status: string };
      };
    };
  };
}
