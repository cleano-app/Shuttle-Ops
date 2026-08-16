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
    };
  };
}
