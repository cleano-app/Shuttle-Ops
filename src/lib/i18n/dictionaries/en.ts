// Canonical key list — every other dictionary in this folder must define
// exactly these keys (checked by src/lib/i18n/dictionaries/index.test.ts).
const en = {
  // App / nav
  app_name: "Shuttle Ops",
  nav_dashboard: "Dashboard",
  nav_book: "Book a trip",
  nav_bookings: "My bookings",
  nav_addresses: "Saved addresses",
  nav_parcels: "Parcels",
  nav_profile: "Profile",
  nav_sign_out: "Sign out",
  nav_referred: "Referred passengers",
  nav_sponsored: "Sponsored bookings",
  nav_refer: "Refer a passenger",

  // Auth
  auth_sign_in: "Sign in",
  auth_sign_up: "Sign up",
  auth_email: "Email",
  auth_password: "Password",
  auth_full_name: "Full name",
  auth_phone: "Phone",
  auth_forgot_password: "Forgot password?",
  auth_no_account: "Don't have an account?",
  auth_have_account: "Already have an account?",
  auth_check_email: "Check your email to confirm your account, then sign in.",
  auth_preferred_language: "Preferred language",
  auth_reset_title: "Reset password",
  auth_reset_instructions: "Enter your email and we'll send a reset link.",
  auth_reset_send: "Send reset link",
  auth_reset_sent: "If that email has an account, a reset link is on its way.",
  auth_new_password_title: "Set a new password",
  auth_new_password: "New password",
  auth_new_password_save: "Save password",

  // Dashboard / bookings
  dashboard_welcome: "Welcome back",
  dashboard_upcoming: "Upcoming departures",
  bookings_none: "You have no bookings yet.",
  bookings_reference: "Reference",
  bookings_status: "Status",
  bookings_request_cancel: "Request cancellation",
  bookings_cancel_reason: "Why are you cancelling?",
  bookings_cancel_submit: "Send cancellation request",

  // Booking flow
  book_departure: "Departure",
  book_outbound: "Outbound",
  book_return: "Return (optional)",
  book_seats_available: "seats available",
  book_hold_available: "luggage space available",
  book_wheelchair_available: "wheelchair space available",
  book_category: "Traveller type",
  book_pickup: "Pickup address",
  book_dropoff: "Drop-off address",
  book_luggage_large: "Large bags",
  book_luggage_small: "Small bags",
  book_luggage_hand: "Hand luggage",
  book_luggage_oversize: "Oversize items",
  book_wheelchair_needed: "Wheelchair space needed",
  book_notes: "Notes for the office",
  book_submit: "Reserve",
  book_deposit_notice:
    "Your seat is provisional until a deposit is received. The office will be in touch with payment details — online card payment isn't available yet.",

  // Addresses
  addresses_none: "No saved addresses yet.",
  addresses_add: "Add an address",
  addresses_search: "Search existing addresses",
  addresses_new: "Or enter a new address",
  addresses_label: "Label (e.g. Home)",
  addresses_line1: "Address line 1",
  addresses_line2: "Address line 2",
  addresses_city: "Town/City",
  addresses_postcode: "Postcode",
  addresses_save: "Save address",
  addresses_delete: "Remove",

  // Parcels
  parcels_none: "No parcels booked yet.",
  parcels_book: "Book a parcel",
  parcels_recipient_name: "Recipient name",
  parcels_recipient_phone: "Recipient phone",
  parcels_size: "Parcel size",
  parcels_description: "Description",
  parcels_prohibited_declared: "I confirm this parcel contains nothing prohibited",
  parcels_submit: "Book parcel",

  // Profile
  profile_title: "My profile",
  profile_save: "Save changes",
  profile_mobility_needs: "Mobility needs",
  profile_emergency_contact_name: "Emergency contact name",
  profile_emergency_contact_phone: "Emergency contact phone",

  // Referrer
  referrer_dashboard_title: "Referrer dashboard",
  referrer_refer_title: "Refer a new passenger",
  referrer_sponsor_title: "Sponsored bookings",
  referrer_no_referred: "No passengers referred yet.",
  referrer_no_sponsored: "No sponsored bookings yet.",

  // Common
  common_save: "Save",
  common_cancel: "Cancel",
  common_loading: "Loading…",
  common_error_generic: "Something went wrong. Please try again.",
  common_required: "required",
} satisfies Record<string, string>;

export default en;
export type DictionaryKey = keyof typeof en;
