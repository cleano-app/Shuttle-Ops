// Pure helpers for the public booking-request flow (/book) and Office's
// "Create booking" on /office/requests. No React, no database — unit
// tested in request.test.ts.
import type { PassengerCategory } from "@/types/database";

export type Direction = "outbound" | "return";

export interface PartyCounts {
  men: number;
  women: number;
  boys: number;
  girls: number;
  infants: number;
}

export interface LuggageCounts {
  large: number;
  small: number;
  hand: number;
}

export const EMPTY_PARTY: PartyCounts = { men: 0, women: 0, boys: 0, girls: 0, infants: 0 };
export const EMPTY_LUGGAGE: LuggageCounts = { large: 0, small: 0, hand: 0 };

export const MAX_TRAVELLERS = 20;
export const FEW_SEATS = 4;

export const LANGUAGES: { value: string; label: string }[] = [
  { value: "en", label: "English" },
  { value: "yi", label: "Yiddish" },
  { value: "he", label: "Hebrew" },
  { value: "nl", label: "Dutch" },
];

export function travellerCount(p: PartyCounts): number {
  return p.men + p.women + p.boys + p.girls + p.infants;
}

/** Infants under 2 sit on a lap, so they don't take a seat. */
export function seatsNeeded(p: PartyCounts): number {
  return p.men + p.women + p.boys + p.girls;
}

export type SeatState = "open" | "few" | "full";

/** How a day card reads for this party: never the exact count. */
export function seatState(seatsLeft: number, needed: number): SeatState {
  const want = Math.max(1, needed);
  if (seatsLeft < want) return "full";
  if (seatsLeft - want < FEW_SEATS) return "few";
  return "open";
}

export function otherDirection(d: Direction): Direction {
  return d === "outbound" ? "return" : "outbound";
}

/** Digits only, for comparing phone numbers. */
export function phoneDigits(phone: string): string {
  return phone.replace(/\D/g, "");
}

export interface RequestInput {
  direction: Direction | null;
  outboundDepartureId: string | null;
  returnDepartureId: string | null;
  wantsReturn: boolean;
  party: PartyCounts;
  luggage: LuggageCounts;
  pickup: { line1: string; postcode: string; city: string };
  dropoff: { line1: string; postcode: string; city: string };
  mobilityNeeds: string;
  name: string;
  phone: string;
  email: string;
  language: string;
  notes: string;
}

/** Problems a customer can fix, in their words. Same rules the database
 * function enforces (submit_booking_request, 0063). */
export function requestProblems(r: RequestInput): string[] {
  const out: string[] = [];
  if (!r.direction || !r.outboundDepartureId) out.push("Choose the day you want to travel.");
  if (r.wantsReturn && !r.returnDepartureId) out.push("Choose a day for the return trip, or untick it.");
  const n = travellerCount(r.party);
  if (n < 1) out.push("Tell us who's travelling.");
  if (n > MAX_TRAVELLERS) out.push(`For more than ${MAX_TRAVELLERS} people, please call the office.`);
  if (n > 0 && r.party.men + r.party.women === 0) out.push("At least one adult needs to travel.");
  if (!r.pickup.line1.trim() || !r.pickup.postcode.trim()) out.push("Add the pick-up address and postcode.");
  if (!r.dropoff.line1.trim() || !r.dropoff.postcode.trim()) out.push("Add the drop-off address and postcode.");
  if (r.name.trim().length < 2) out.push("Add your name.");
  const digits = phoneDigits(r.phone);
  if (digits.length < 7 || digits.length > 16) out.push("Add a mobile number we can call.");
  if (r.email.trim() && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(r.email.trim())) out.push("That email doesn't look right.");
  return out;
}

/** Database refusal codes (submit_booking_request) as customer copy. */
export function submitErrorMessage(message: string | null | undefined): string {
  const m = message ?? "";
  if (m.includes("too_many_requests"))
    return "We've had a lot of requests from this number today. Please call the office and we'll sort it out.";
  if (m.includes("return_not_bookable"))
    return "That return trip can't be booked any more. Please go back and pick another day.";
  if (m.includes("departure_not_bookable"))
    return "That trip can't be booked any more. Please go back and pick another day.";
  if (m.includes("phone_required")) return "Add a mobile number we can call.";
  if (m.includes("name_required")) return "Add your name.";
  if (m.includes("email_invalid")) return "That email doesn't look right.";
  if (m.includes("party_size")) return `Between 1 and ${MAX_TRAVELLERS} people, please.`;
  if (m.includes("adult_required")) return "At least one adult needs to travel.";
  if (m.includes("pickup_required")) return "Add the pick-up address and postcode.";
  if (m.includes("dropoff_required")) return "Add the drop-off address and postcode.";
  return "Sorry — we couldn't send that just now. Please try again, or call the office.";
}

export interface PartyMember {
  name: string;
  category: PassengerCategory;
  lead: boolean;
  occupiesSeat: boolean;
}

/** Last word of a name: "Moshe Klein" -> "Klein". */
export function surnameOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return parts.length ? parts[parts.length - 1] : "Family";
}

/**
 * The passengers Office creates from a request. The contact is the lead
 * (a man if any men travel, else a woman); everyone else is
 * "<surname> family N" with their category, for Office to rename later.
 */
export function partyMembers(contactName: string, p: PartyCounts): PartyMember[] {
  const leadCategory: PassengerCategory = p.men > 0 ? "man" : "woman";
  const remaining: [PassengerCategory, number][] = [
    ["man", p.men - (leadCategory === "man" ? 1 : 0)],
    ["woman", p.women - (leadCategory === "woman" ? 1 : 0)],
    ["boy", p.boys],
    ["girl", p.girls],
    ["infant", p.infants],
  ];
  const surname = surnameOf(contactName);
  const out: PartyMember[] = [{ name: contactName.trim(), category: leadCategory, lead: true, occupiesSeat: true }];
  let n = 2;
  for (const [category, count] of remaining) {
    for (let i = 0; i < count; i++) {
      out.push({ name: `${surname} family ${n++}`, category, lead: false, occupiesSeat: category !== "infant" });
    }
  }
  return out;
}

/** "2 men · 1 woman · 3 boys" etc. */
export function partyText(p: PartyCounts): string {
  const parts: [number, string, string][] = [
    [p.men, "man", "men"],
    [p.women, "woman", "women"],
    [p.boys, "boy", "boys"],
    [p.girls, "girl", "girls"],
    [p.infants, "infant", "infants"],
  ];
  return parts
    .filter(([n]) => n > 0)
    .map(([n, one, many]) => `${n} ${n === 1 ? one : many}`)
    .join(" · ");
}

export function luggageText(l: LuggageCounts): string {
  const parts: [number, string][] = [
    [l.large, "large"],
    [l.small, "small"],
    [l.hand, "hand"],
  ];
  const s = parts.filter(([n]) => n > 0).map(([n, k]) => `${n} ${k}`);
  return s.length ? s.join(" · ") : "No luggage";
}
