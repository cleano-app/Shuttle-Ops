"use client";

import { useState } from "react";
import { AddressAutocomplete, type AreaOption } from "@/components/office/AddressAutocomplete";

const field = "w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm";
const label = "mb-1 block text-sm font-medium text-slate-700";

/** Address search + type + optional time for adding a stop by hand. Sits
 * inside an <ActionForm>; the chosen address travels as `address_id`. */
export function AddStopFields({ areas }: { areas: AreaOption[] }) {
  const [addressId, setAddressId] = useState("");
  const [addressText, setAddressText] = useState("");

  return (
    <div className="grid w-full gap-3 sm:grid-cols-[minmax(0,1fr)_10rem_12rem_auto] sm:items-end">
      <div className="min-w-0">
        <AddressAutocomplete
          label="Address"
          value={addressText}
          areas={areas}
          onSelect={(a) => {
            setAddressId(a.id);
            setAddressText(a.fixed_point_name ? `${a.fixed_point_name} — ${a.line1}` : a.line1);
          }}
          placeholder="Search address, postcode or fixed point..."
        />
        <input type="hidden" name="address_id" value={addressId} />
      </div>
      <div>
        <label className={label} htmlFor="add-stop-type">
          Type
        </label>
        <select id="add-stop-type" name="stop_type" defaultValue="waypoint" className={field}>
          <option value="pickup">Pickup</option>
          <option value="dropoff">Drop-off</option>
          <option value="crossing">Crossing</option>
          <option value="waypoint">Waypoint</option>
        </select>
      </div>
      <div>
        <label className={label} htmlFor="add-stop-time">
          Planned arrival (UK)
        </label>
        <input id="add-stop-time" type="datetime-local" name="planned_arrival_at" className={field} />
      </div>
      <button
        type="submit"
        disabled={!addressId}
        className="rounded bg-brand-dark px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        Add stop
      </button>
    </div>
  );
}

export interface DriverOption {
  id: string;
  display_name: string;
}
export interface VehicleOption {
  id: string;
  registration: string;
  status: string;
}
export interface StopOption {
  sequence: number;
  label: string;
}

/** Driver/vehicle/segment picker. The override reason box appears only
 * when the chosen vehicle isn't available (build spec §27: Admin override
 * with a recorded reason). */
export function AssignDriverFields({
  drivers,
  vehicles,
  stops,
  isAdmin,
}: {
  drivers: DriverOption[];
  vehicles: VehicleOption[];
  stops: StopOption[];
  isAdmin: boolean;
}) {
  const [vehicleId, setVehicleId] = useState(vehicles.find((v) => v.status === "available")?.id ?? vehicles[0]?.id ?? "");
  const vehicle = vehicles.find((v) => v.id === vehicleId);
  const blocked = vehicle && vehicle.status !== "available";

  return (
    <div className="grid w-full gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <div>
        <label className={label} htmlFor="assign-driver">
          Driver
        </label>
        <select id="assign-driver" name="driver_id" required className={field} defaultValue="">
          <option value="" disabled>
            Choose a driver
          </option>
          {drivers.map((d) => (
            <option key={d.id} value={d.id}>
              {d.display_name}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className={label} htmlFor="assign-vehicle">
          Vehicle
        </label>
        <select
          id="assign-vehicle"
          name="vehicle_id"
          required
          className={field}
          value={vehicleId}
          onChange={(e) => setVehicleId(e.target.value)}
        >
          {vehicles.map((v) => (
            <option key={v.id} value={v.id}>
              {v.registration}
              {v.status !== "available" ? ` (${v.status})` : ""}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className={label} htmlFor="assign-role">
          Role
        </label>
        <select id="assign-role" name="role" defaultValue="driver" className={field}>
          <option value="driver">Driver</option>
          <option value="co_driver">Co-driver</option>
        </select>
      </div>
      <div>
        <label className={label} htmlFor="assign-from">
          From stop
        </label>
        <select id="assign-from" name="from_stop_sequence" defaultValue="" className={field}>
          <option value="">Start of the route</option>
          {stops.map((s) => (
            <option key={`f-${s.sequence}`} value={s.sequence}>
              {s.label}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className={label} htmlFor="assign-to">
          To stop
        </label>
        <select id="assign-to" name="to_stop_sequence" defaultValue="" className={field}>
          <option value="">End of the route</option>
          {stops.map((s) => (
            <option key={`t-${s.sequence}`} value={s.sequence}>
              {s.label}
            </option>
          ))}
        </select>
      </div>
      {blocked && (
        <div className="sm:col-span-2 lg:col-span-3">
          <label className={label} htmlFor="assign-override">
            Override reason - vehicle is {vehicle.status}
          </label>
          <textarea
            id="assign-override"
            name="override_reason"
            rows={2}
            required={isAdmin}
            className={field}
            placeholder="Why this vehicle is safe to use for this run"
          />
          {!isAdmin && (
            <p className="mt-1 text-xs text-amber-text">Only an Admin can assign an unavailable vehicle.</p>
          )}
        </div>
      )}
      <div className="flex items-end">
        <button type="submit" className="rounded bg-brand-dark px-4 py-2 text-sm font-medium text-white">
          Assign
        </button>
      </div>
    </div>
  );
}
