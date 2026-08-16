// Historical integrity (build spec §16): "Changing a passenger's saved
// address must never change an existing booking." This pure function
// builds the jsonb snapshot captured onto booking_passengers.
// pickup_address_snapshot / dropoff_address_snapshot at confirmation time,
// alongside the live pickup_address_id/dropoff_address_id FK. Manifests
// and departure history read the snapshot, never a live join, so an
// address being edited, merged or deactivated later can't retroactively
// change what a manifest shows.

export interface AddressLike {
  id: string;
  line1: string;
  line2: string | null;
  city: string | null;
  postcode: string;
  country: string;
  formatted_address: string | null;
  access_notes: string | null;
  fixed_point_name: string | null;
}

export interface AddressSnapshot {
  address_id: string;
  line1: string;
  line2: string | null;
  city: string | null;
  postcode: string;
  country: string;
  formatted_address: string | null;
  access_notes: string | null;
  fixed_point_name: string | null;
  snapshotted_at: string;
}

export function buildAddressSnapshot(address: AddressLike): AddressSnapshot {
  return {
    address_id: address.id,
    line1: address.line1,
    line2: address.line2,
    city: address.city,
    postcode: address.postcode,
    country: address.country,
    formatted_address: address.formatted_address,
    access_notes: address.access_notes,
    fixed_point_name: address.fixed_point_name,
    snapshotted_at: new Date().toISOString(),
  };
}
