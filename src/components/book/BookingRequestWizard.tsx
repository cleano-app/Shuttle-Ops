"use client";

import { useMemo, useState } from "react";
import { Journey } from "@/components/Journey";
import { LogoMark } from "@/components/shell/Logo";
import { journeyEnds } from "@/lib/places";
import { submitBookingRequest } from "@/app/actions/bookingRequests";
import {
  EMPTY_LUGGAGE,
  EMPTY_PARTY,
  LANGUAGES,
  MAX_TRAVELLERS,
  luggageText,
  otherDirection,
  partyText,
  seatState,
  seatsNeeded,
  travellerCount,
  type Direction,
  type LuggageCounts,
  type PartyCounts,
  type RequestInput,
} from "./request";
import type { PublicDay } from "./types";

// The public booking REQUEST flow, in the style of Cleano's bin booking
// wizard: one question per screen, big tappable cards, − n + steppers,
// progress dots, a sticky continue button. What it sends is a request —
// Office phones back to confirm and take the deposit (spec: money
// decisions stay human), so nothing here promises a seat.

type Step = 1 | 2 | 3 | 4 | 5 | 6 | 7;
const STEPS = 7;

const inputClass =
  "min-h-12 w-full rounded-control border-[1.5px] border-border bg-white px-3.5 py-3 text-base font-medium text-navy placeholder:font-normal placeholder:text-faint focus:border-teal focus:outline-none";
const labelClass = "mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted";
const primaryButton =
  "flex min-h-12 w-full items-center justify-center gap-2 rounded-button bg-teal px-5 text-base font-semibold text-white shadow disabled:bg-border disabled:text-white disabled:shadow-none";
const h1Class = "text-[22px] font-semibold leading-tight tracking-tight text-navy";
const leadClass = "mt-1.5 text-sm text-muted";

interface Address {
  line1: string;
  postcode: string;
  city: string;
}
const EMPTY_ADDRESS: Address = { line1: "", postcode: "", city: "" };

export function BookingRequestWizard({
  days,
  initialDepartureId = null,
}: {
  days: PublicDay[];
  /** From the public timetable's "Book" button: journey and day already chosen. */
  initialDepartureId?: string | null;
}) {
  const preset = days.find((d) => d.id === initialDepartureId) ?? null;
  const [step, setStep] = useState<Step>(preset ? 3 : 1);
  const [direction, setDirection] = useState<Direction | null>(preset ? preset.direction : null);
  const [outboundId, setOutboundId] = useState<string | null>(preset ? preset.id : null);
  const [wantsReturn, setWantsReturn] = useState(false);
  const [returnId, setReturnId] = useState<string | null>(null);
  const [party, setParty] = useState<PartyCounts>(EMPTY_PARTY);
  const [luggage, setLuggage] = useState<LuggageCounts>(EMPTY_LUGGAGE);
  const [pickup, setPickup] = useState<Address>(EMPTY_ADDRESS);
  const [dropoff, setDropoff] = useState<Address>(EMPTY_ADDRESS);
  const [mobility, setMobility] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [language, setLanguage] = useState("en");
  const [notes, setNotes] = useState("");

  const [pending, setPending] = useState(false);
  const [problems, setProblems] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [reference, setReference] = useState<string | null>(null);

  // The journeys on offer, from the departures themselves. With one route
  // that's the two directions; a direction with nothing scheduled still
  // shows, greyed, so the customer knows it exists.
  const routeName = days[0]?.routeName ?? "London ⇄ Antwerp";
  const journeys = useMemo(
    () =>
      (["outbound", "return"] as Direction[]).map((d) => ({
        direction: d,
        count: days.filter((x) => x.direction === d).length,
      })),
    [days]
  );

  const outbound = days.find((d) => d.id === outboundId) ?? null;
  const returnDay = days.find((d) => d.id === returnId) ?? null;
  const ends = direction ? journeyEnds(routeName, direction) : null;
  const from = ends?.[0] ?? "pick-up";
  const to = ends?.[1] ?? "drop-off";
  const needed = seatsNeeded(party);
  const total = travellerCount(party);

  function chooseDirection(d: Direction) {
    if (d !== direction) {
      setOutboundId(null);
      setReturnId(null);
      // Addresses swap ends with the journey.
      setPickup(dropoff);
      setDropoff(pickup);
    }
    setDirection(d);
    setStep(2);
  }

  const canContinue: Record<Step, boolean> = {
    1: !!direction,
    2: !!outboundId && (!wantsReturn || !!returnId),
    3: total >= 1 && total <= MAX_TRAVELLERS && party.men + party.women > 0,
    4: true,
    5: !!(pickup.line1.trim() && pickup.postcode.trim() && dropoff.line1.trim() && dropoff.postcode.trim()),
    6: name.trim().length >= 2 && phone.replace(/\D/g, "").length >= 7,
    7: !pending,
  };

  async function send() {
    setPending(true);
    setProblems([]);
    setError(null);
    const input: RequestInput = {
      direction,
      outboundDepartureId: outboundId,
      returnDepartureId: wantsReturn ? returnId : null,
      wantsReturn,
      party,
      luggage,
      pickup,
      dropoff,
      mobilityNeeds: mobility,
      name,
      phone,
      email,
      language,
      notes,
    };
    try {
      const res = await submitBookingRequest(input);
      if (res.problems?.length) setProblems(res.problems);
      else if (res.error) setError(res.error);
      else if (res.ok && res.reference) setReference(res.reference);
    } catch {
      setError("Sorry — we couldn't send that just now. Please check your connection and try again.");
    } finally {
      setPending(false);
    }
  }

  if (reference) {
    return (
      <div className="flex min-h-[100dvh] flex-col">
        <FlowHeader step={STEPS} onBack={null} />
        <div className="flex flex-1 flex-col px-5 py-6">
          <div className="mb-4 grid h-13 w-13 place-items-center rounded-full bg-green">
            <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="h-6 w-6">
              <path d="M5 12.5l4.5 4.5L19 7.5" />
            </svg>
          </div>
          <h1 className="text-2xl font-semibold leading-tight text-navy">Thank you, {name.trim().split(/\s+/)[0]}!</h1>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            We&apos;ve got your request. We&apos;ll call you on{" "}
            <span className="font-semibold text-navy">{phone.trim()}</span> to confirm and take the deposit.
          </p>
          <div className="mt-5 rounded-card bg-green-bg p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-green">Your reference</p>
            <p className="mt-1 font-mono text-2xl font-semibold text-navy">{reference}</p>
            <p className="mt-1.5 text-[13px] text-navy">Quote it if you call us.</p>
          </div>
          <div className="mt-4 space-y-2">
            {outbound && <TripSummary day={outbound} />}
            {wantsReturn && returnDay && <TripSummary day={returnDay} />}
          </div>
          <p className="mt-4 rounded-card bg-amber-bg px-3.5 py-3 text-[13.5px] leading-relaxed text-amber-text">
            <strong className="font-semibold">This isn&apos;t a confirmed seat yet.</strong> Your places are held only once
            we&apos;ve spoken and the deposit is taken.
          </p>
          {email.trim() && (
            <p className="mt-3 text-[13px] text-muted">
              We&apos;ll also send a note to <span className="font-semibold text-navy">{email.trim()}</span>.
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-[100dvh] flex-col">
      <FlowHeader step={step} onBack={step > 1 ? () => setStep((s) => (s - 1) as Step) : null} />
      <div className="flex flex-1 flex-col px-5 pb-6 pt-5">
        {step === 1 && (
          <section>
            <h1 className={h1Class}>Where are you travelling?</h1>
            <p className={leadClass}>Door to door, by minibus. Tell us what you need and we&apos;ll call you back.</p>
            <a href="/timetable" className="mt-2 inline-block text-sm font-medium text-brand-dark underline">
              See the timetable and Jewish calendar
            </a>
            {days.length === 0 && (
              <p className="mt-4 rounded-card bg-amber-bg px-4 py-3 text-sm text-amber-text">
                There are no trips open for booking just now. Please call the office and we&apos;ll help.
              </p>
            )}
            <div className="mt-5 space-y-3">
              {journeys.map((j) => {
                const selected = direction === j.direction;
                return (
                  <button
                    key={j.direction}
                    type="button"
                    disabled={j.count === 0}
                    onClick={() => chooseDirection(j.direction)}
                    className={`flex w-full flex-col items-start gap-2 rounded-card border-2 px-4 py-5 text-left transition disabled:opacity-50 ${
                      selected ? "border-teal bg-teal-bg/40" : "border-border bg-white active:bg-press"
                    }`}
                  >
                    <Journey routeName={routeName} direction={j.direction} size="lg" />
                    <span className="text-sm text-muted">
                      {j.count === 0 ? "No trips scheduled yet" : `${j.count} ${j.count === 1 ? "trip" : "trips"} coming up`}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {step === 2 && direction && (
          <section>
            <h1 className={h1Class}>Which day?</h1>
            <p className={leadClass}>
              <Journey routeName={routeName} direction={direction} size="sm" /> · times are UK time
            </p>
            <DayList
              days={days.filter((d) => d.direction === direction)}
              selectedId={outboundId}
              needed={needed}
              onSelect={(id) => {
                setOutboundId(id);
                setReturnId(null);
              }}
            />

            <label
              className={`mt-5 flex items-start gap-3 rounded-card border-2 px-4 py-3.5 ${
                wantsReturn ? "border-teal bg-teal-bg/40" : "border-border bg-white"
              }`}
            >
              <input
                type="checkbox"
                checked={wantsReturn}
                onChange={(e) => {
                  setWantsReturn(e.target.checked);
                  if (!e.target.checked) setReturnId(null);
                }}
                className="mt-0.5 h-5 w-5 accent-[#ec6b1e]"
              />
              <span>
                <span className="block text-base font-semibold text-navy">Return trip too</span>
                <span className="block text-xs text-muted">Book the way back at the same time.</span>
              </span>
            </label>

            {wantsReturn && (
              <div className="mt-4">
                <p className="mb-2 text-sm font-semibold text-navy">
                  Coming back: <Journey routeName={routeName} direction={otherDirection(direction)} size="sm" />
                </p>
                {!outbound ? (
                  <p className="text-sm text-muted">Pick your outward day first.</p>
                ) : (
                  <DayList
                    days={days.filter(
                      (d) => d.direction === otherDirection(direction) && d.departAt > outbound.departAt
                    )}
                    selectedId={returnId}
                    needed={needed}
                    onSelect={setReturnId}
                    empty="No return trips scheduled after that day yet. Untick this and mention it in your notes — we'll sort it on the phone."
                  />
                )}
              </div>
            )}
          </section>
        )}

        {step === 3 && (
          <section>
            <h1 className={h1Class}>Who&apos;s travelling?</h1>
            <p className={leadClass}>Count everyone, including you.</p>
            <ul className="mt-5 space-y-2">
              <QtyRow label="Men" value={party.men} onChange={(n) => setParty({ ...party, men: n })} />
              <QtyRow label="Women" value={party.women} onChange={(n) => setParty({ ...party, women: n })} />
              <QtyRow label="Boys" value={party.boys} onChange={(n) => setParty({ ...party, boys: n })} />
              <QtyRow label="Girls" value={party.girls} onChange={(n) => setParty({ ...party, girls: n })} />
              <QtyRow
                label="Infants"
                hint="Under 2, on a lap"
                value={party.infants}
                onChange={(n) => setParty({ ...party, infants: n })}
              />
            </ul>
            <p className="mt-3 text-center text-sm text-muted">
              {total === 0
                ? "Nobody yet"
                : `${total} ${total === 1 ? "person" : "people"}${total > needed ? ` · ${needed} ${needed === 1 ? "seat" : "seats"}` : ""}`}
            </p>
            {total > MAX_TRAVELLERS && (
              <p className="mt-2 text-center text-sm text-red">For more than {MAX_TRAVELLERS}, please call the office.</p>
            )}
            {total > 0 && party.men + party.women === 0 && (
              <p className="mt-2 text-center text-sm text-red">At least one adult needs to travel.</p>
            )}
          </section>
        )}

        {step === 4 && (
          <section>
            <h1 className={h1Class}>Any luggage?</h1>
            <p className={leadClass}>For the whole party. A rough count is fine.</p>
            <ul className="mt-5 space-y-2">
              <QtyRow
                label="Large suitcases"
                hint="Checked-in size"
                value={luggage.large}
                max={60}
                onChange={(n) => setLuggage({ ...luggage, large: n })}
              />
              <QtyRow
                label="Small suitcases"
                hint="Cabin size"
                value={luggage.small}
                max={60}
                onChange={(n) => setLuggage({ ...luggage, small: n })}
              />
              <QtyRow
                label="Hand luggage"
                hint="Bags you keep with you"
                value={luggage.hand}
                max={60}
                onChange={(n) => setLuggage({ ...luggage, hand: n })}
              />
            </ul>
          </section>
        )}

        {step === 5 && (
          <section>
            <h1 className={h1Class}>Where do we pick you up?</h1>
            <p className={leadClass}>And where should we take you?</p>
            <AddressFields title={`Pick-up in ${from}`} prefix="pickup" value={pickup} onChange={setPickup} />
            <AddressFields title={`Drop-off in ${to}`} prefix="dropoff" value={dropoff} onChange={setDropoff} />
            {wantsReturn && (
              <p className="mt-2 text-xs text-muted">On the way back we pick up from the drop-off address and bring you home.</p>
            )}
            <div className="mt-6">
              <label htmlFor="mobility" className={labelClass}>
                Wheelchair or mobility needs
              </label>
              <textarea
                id="mobility"
                rows={3}
                maxLength={1000}
                value={mobility}
                onChange={(e) => setMobility(e.target.value)}
                placeholder="E.g. a folding wheelchair, help with steps (leave blank if none)"
                className={inputClass}
              />
            </div>
          </section>
        )}

        {step === 6 && (
          <section>
            <h1 className="text-[22px] font-bold leading-tight tracking-tight">
              <span className="block text-brand-dark">Nearly there.</span>
              <span className="block text-brand-light">Who should we call?</span>
            </h1>
            <Field id="name" label="Your name" value={name} onChange={setName} autoComplete="name" maxLength={120} />
            <Field
              id="phone"
              label="Mobile number"
              type="tel"
              value={phone}
              onChange={setPhone}
              autoComplete="tel"
              inputMode="tel"
              maxLength={40}
              hint="We'll call this number to confirm."
            />
            <Field
              id="email"
              label="Email (optional)"
              type="email"
              value={email}
              onChange={setEmail}
              autoComplete="email"
              maxLength={200}
            />
            <div className="mt-5">
              <p className={labelClass}>Preferred language</p>
              <div className="grid grid-cols-2 gap-2">
                {LANGUAGES.map((l) => (
                  <button
                    key={l.value}
                    type="button"
                    onClick={() => setLanguage(l.value)}
                    aria-pressed={language === l.value}
                    className={`min-h-12 rounded-control border-2 px-3 text-sm font-semibold text-navy ${
                      language === l.value ? "border-teal bg-teal-bg/40" : "border-border bg-white"
                    }`}
                  >
                    {l.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="mt-5">
              <label htmlFor="notes" className={labelClass}>
                Anything else? (optional)
              </label>
              <textarea
                id="notes"
                rows={3}
                maxLength={1000}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className={inputClass}
              />
            </div>
          </section>
        )}

        {step === 7 && direction && (
          <section>
            <h1 className={h1Class}>Check and send</h1>
            <p className={leadClass}>We&apos;ll call you to confirm and take the deposit — nothing is charged now.</p>
            <dl className="mt-5 divide-y divide-hairline rounded-card border-2 border-border bg-white">
              <ReviewRow label="Going" onEdit={() => setStep(2)}>
                {outbound && <TripSummary day={outbound} bare />}
              </ReviewRow>
              {wantsReturn && returnDay && (
                <ReviewRow label="Coming back" onEdit={() => setStep(2)}>
                  <TripSummary day={returnDay} bare />
                </ReviewRow>
              )}
              <ReviewRow label="Travelling" onEdit={() => setStep(3)}>
                {partyText(party)}
              </ReviewRow>
              <ReviewRow label="Luggage" onEdit={() => setStep(4)}>
                {luggageText(luggage)}
              </ReviewRow>
              <ReviewRow label="Pick-up" onEdit={() => setStep(5)}>
                {[pickup.line1, pickup.city, pickup.postcode].filter((x) => x.trim()).join(", ")}
              </ReviewRow>
              <ReviewRow label="Drop-off" onEdit={() => setStep(5)}>
                {[dropoff.line1, dropoff.city, dropoff.postcode].filter((x) => x.trim()).join(", ")}
              </ReviewRow>
              {mobility.trim() && (
                <ReviewRow label="Mobility" onEdit={() => setStep(5)}>
                  {mobility}
                </ReviewRow>
              )}
              <ReviewRow label="Contact" onEdit={() => setStep(6)}>
                {name} · {phone}
                {email.trim() ? ` · ${email}` : ""} · {LANGUAGES.find((l) => l.value === language)?.label}
              </ReviewRow>
              {notes.trim() && (
                <ReviewRow label="Notes" onEdit={() => setStep(6)}>
                  {notes}
                </ReviewRow>
              )}
            </dl>
            {problems.length > 0 && (
              <ul role="alert" className="mt-4 list-disc space-y-1 rounded-card border border-red bg-white p-4 ps-8 text-sm text-red">
                {problems.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            )}
            {error && (
              <p role="alert" className="mt-4 rounded-card border border-red bg-white p-4 text-sm text-red">
                {error}
              </p>
            )}
          </section>
        )}
      </div>

      {/* Sticky continue: always under the thumb. Step 1 moves on by
          tapping a journey card, so it only appears once one is chosen. */}
      {!(step === 1 && !direction) && (
        <div className="sticky bottom-0 z-10 border-t border-hairline bg-white/95 px-5 pb-[max(env(safe-area-inset-bottom),12px)] pt-3 backdrop-blur">
          <button
            type="button"
            disabled={!canContinue[step]}
            onClick={() => (step === 7 ? void send() : setStep((s) => (s + 1) as Step))}
            className={primaryButton}
          >
            {step === 7 ? (pending ? "Sending…" : "Send my request") : "Continue"}
          </button>
        </div>
      )}
    </div>
  );
}

function FlowHeader({ step, onBack }: { step: number; onBack: (() => void) | null }) {
  return (
    <header className="sticky top-0 z-10 flex h-13 flex-none items-center gap-2.5 border-b border-hairline bg-white px-4">
      <button
        type="button"
        onClick={onBack ?? undefined}
        aria-label="Back"
        className={`-ml-2.5 grid h-11 w-11 flex-none place-items-center rounded-control text-navy ${onBack ? "" : "invisible"}`}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="h-5 w-5">
          <path d="M15 18l-6-6 6-6" />
        </svg>
      </button>
      <span className="flex items-center gap-1.5">
        <LogoMark className="h-6 w-6 rounded-[7px] text-[14px]" />
        <span className="text-[17px] font-bold tracking-tight text-brand-dark">Book a seat</span>
      </span>
      <span className="ml-auto flex flex-none gap-1.5" aria-label={`Step ${step} of ${STEPS}`}>
        {Array.from({ length: STEPS }, (_, i) => i + 1).map((n) => (
          <span
            key={n}
            className={`h-1.5 rounded-full transition-all ${
              n === step ? "w-[17px] bg-brand-dark" : n < step ? "w-1.5 bg-brand-light" : "w-1.5 bg-hairline"
            }`}
          />
        ))}
      </span>
    </header>
  );
}

function DayList({
  days,
  selectedId,
  needed,
  onSelect,
  empty = "No trips scheduled in the next few weeks. Please call the office.",
}: {
  days: PublicDay[];
  selectedId: string | null;
  needed: number;
  onSelect: (id: string) => void;
  empty?: string;
}) {
  if (days.length === 0) return <p className="mt-4 rounded-card bg-page px-4 py-4 text-sm text-muted">{empty}</p>;
  return (
    <ul className="mt-4 space-y-2">
      {days.map((d) => {
        const state = seatState(d.seatsLeft, needed);
        const selected = d.id === selectedId;
        return (
          <li key={d.id}>
            <button
              type="button"
              onClick={() => onSelect(d.id)}
              aria-pressed={selected}
              className={`flex w-full items-center gap-3 rounded-card border-2 px-4 py-3 text-left ${
                selected ? "border-teal bg-teal-bg/40" : "border-border bg-white active:bg-press"
              }`}
            >
              <span className="w-14 flex-none text-center">
                <span className="block text-[11px] font-semibold uppercase tracking-wide text-muted">{d.weekday.slice(0, 3)}</span>
                <span className="block text-xl font-semibold leading-tight text-navy">{d.date.split(" ")[0]}</span>
                <span className="block text-[11px] font-semibold uppercase text-muted">{d.date.split(" ")[1]}</span>
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-base font-semibold text-navy">
                  {d.weekday} · {d.time}
                </span>
                <span className="block text-xs text-muted">{d.hebrew}</span>
                {d.holiday && (
                  <span className="mt-1 inline-block rounded bg-amber-bg px-1.5 py-0.5 text-[11px] font-semibold text-amber-text">
                    {d.holiday}
                  </span>
                )}
              </span>
              <span className="flex-none text-right">
                {state === "full" ? (
                  <span className="block max-w-[6.5rem] text-xs font-semibold leading-snug text-red">Full — join waiting list</span>
                ) : state === "few" ? (
                  <span className="block text-xs font-semibold text-amber-text">Few seats left</span>
                ) : (
                  <span className="block text-xs font-semibold text-green">Seats free</span>
                )}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function QtyRow({
  label,
  hint,
  value,
  onChange,
  max = MAX_TRAVELLERS,
}: {
  label: string;
  hint?: string;
  value: number;
  onChange: (n: number) => void;
  max?: number;
}) {
  return (
    <li
      className={`flex items-center gap-3 rounded-control border-2 px-4 py-2.5 ${
        value > 0 ? "border-teal bg-teal-bg/40" : "border-border bg-white"
      }`}
    >
      <span className="min-w-0 flex-1">
        <span className="block text-base font-semibold text-navy">{label}</span>
        {hint && <span className="block text-xs text-muted">{hint}</span>}
      </span>
      <span className="flex items-center gap-1">
        <button
          type="button"
          aria-label={`One fewer: ${label}`}
          onClick={() => onChange(Math.max(0, value - 1))}
          disabled={value === 0}
          className="h-11 w-11 rounded-control border border-border bg-white text-xl text-navy disabled:opacity-40"
        >
          −
        </button>
        <span className="w-8 text-center text-lg font-semibold tabular-nums text-navy" aria-live="polite">
          {value}
        </span>
        <button
          type="button"
          aria-label={`One more: ${label}`}
          onClick={() => onChange(Math.min(max, value + 1))}
          disabled={value >= max}
          className="h-11 w-11 rounded-control border border-teal bg-teal-bg text-xl text-teal-text disabled:opacity-40"
        >
          +
        </button>
      </span>
    </li>
  );
}

function AddressFields({
  title,
  prefix,
  value,
  onChange,
}: {
  title: string;
  prefix: string;
  value: Address;
  onChange: (a: Address) => void;
}) {
  return (
    <fieldset className="mt-6">
      <legend className="mb-2 text-base font-semibold text-navy">{title}</legend>
      <div className="space-y-2">
        <label htmlFor={`${prefix}-line1`} className="sr-only">
          House number and street
        </label>
        <input
          id={`${prefix}-line1`}
          value={value.line1}
          onChange={(e) => onChange({ ...value, line1: e.target.value })}
          placeholder="House number and street"
          maxLength={200}
          className={inputClass}
        />
        <div className="grid grid-cols-2 gap-2">
          <label htmlFor={`${prefix}-postcode`} className="sr-only">
            Postcode
          </label>
          <input
            id={`${prefix}-postcode`}
            value={value.postcode}
            onChange={(e) => onChange({ ...value, postcode: e.target.value })}
            placeholder="Postcode"
            maxLength={20}
            autoCapitalize="characters"
            className={inputClass}
          />
          <label htmlFor={`${prefix}-city`} className="sr-only">
            Town or city
          </label>
          <input
            id={`${prefix}-city`}
            value={value.city}
            onChange={(e) => onChange({ ...value, city: e.target.value })}
            placeholder="Town / city"
            maxLength={100}
            className={inputClass}
          />
        </div>
      </div>
    </fieldset>
  );
}

function Field({
  id,
  label,
  value,
  onChange,
  type = "text",
  hint,
  ...rest
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  hint?: string;
  autoComplete?: string;
  inputMode?: "tel" | "email" | "text";
  maxLength?: number;
}) {
  return (
    <div className="mt-5">
      <label htmlFor={id} className={labelClass}>
        {label}
      </label>
      <input id={id} type={type} value={value} onChange={(e) => onChange(e.target.value)} className={inputClass} {...rest} />
      {hint && <p className="mt-1.5 text-xs text-muted">{hint}</p>}
    </div>
  );
}

function ReviewRow({ label, onEdit, children }: { label: string; onEdit: () => void; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 px-4 py-3">
      <div className="min-w-0 flex-1">
        <dt className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</dt>
        <dd className="mt-0.5 break-words text-sm text-navy">{children}</dd>
      </div>
      <button type="button" onClick={onEdit} className="min-h-9 text-sm font-semibold text-teal underline">
        Change
      </button>
    </div>
  );
}

function TripSummary({ day, bare = false }: { day: PublicDay; bare?: boolean }) {
  const body = (
    <>
      <Journey routeName={day.routeName} direction={day.direction} size="sm" />
      <span className="block text-sm text-navy">
        {day.weekday} {day.date} · {day.time}
      </span>
      <span className="block text-xs text-muted">
        {day.hebrew}
        {day.holiday ? ` · ${day.holiday}` : ""}
      </span>
    </>
  );
  if (bare) return <span className="block">{body}</span>;
  return <div className="rounded-card border-2 border-border bg-white px-4 py-3">{body}</div>;
}
