import { describe, expect, it } from "vitest";
import {
  EMPTY_LUGGAGE,
  EMPTY_PARTY,
  partyMembers,
  partyText,
  requestProblems,
  seatState,
  seatsNeeded,
  submitErrorMessage,
  surnameOf,
  travellerCount,
  type RequestInput,
} from "./request";

const valid: RequestInput = {
  direction: "outbound",
  outboundDepartureId: "d1",
  returnDepartureId: null,
  wantsReturn: false,
  party: { ...EMPTY_PARTY, men: 1, women: 1, infants: 1 },
  luggage: EMPTY_LUGGAGE,
  pickup: { line1: "1 High St", postcode: "N16 1AA", city: "London" },
  dropoff: { line1: "2 Lange Kievitstraat", postcode: "2018", city: "Antwerp" },
  mobilityNeeds: "",
  name: "Moshe Klein",
  phone: "07700 900000",
  email: "",
  language: "en",
  notes: "",
};

describe("party counts", () => {
  it("infants don't take a seat", () => {
    expect(travellerCount(valid.party)).toBe(3);
    expect(seatsNeeded(valid.party)).toBe(2);
  });
  it("partyText leaves zeros out", () => {
    expect(partyText({ ...EMPTY_PARTY, men: 2, girls: 1 })).toBe("2 men · 1 girl");
  });
});

describe("seatState", () => {
  it("full when the party doesn't fit", () => {
    expect(seatState(2, 3)).toBe("full");
    expect(seatState(0, 0)).toBe("full");
  });
  it("few when little would be left", () => {
    expect(seatState(5, 2)).toBe("few");
    expect(seatState(20, 2)).toBe("open");
  });
});

describe("requestProblems", () => {
  it("accepts a complete request", () => {
    expect(requestProblems(valid)).toEqual([]);
  });
  it("needs an adult, a phone, and the return day when ticked", () => {
    const p = requestProblems({
      ...valid,
      party: { ...EMPTY_PARTY, boys: 1 },
      phone: "12",
      wantsReturn: true,
    });
    expect(p.join(" ")).toMatch(/adult/);
    expect(p.join(" ")).toMatch(/mobile/);
    expect(p.join(" ")).toMatch(/return/);
  });
  it("caps the party at 20", () => {
    expect(requestProblems({ ...valid, party: { ...EMPTY_PARTY, men: 21 } }).join(" ")).toMatch(/20/);
  });
});

describe("partyMembers", () => {
  it("makes the contact the lead and names the rest after the family", () => {
    const m = partyMembers("Moshe Klein", { men: 1, women: 1, boys: 1, girls: 0, infants: 1 });
    expect(m.map((x) => [x.name, x.category, x.occupiesSeat])).toEqual([
      ["Moshe Klein", "man", true],
      ["Klein family 2", "woman", true],
      ["Klein family 3", "boy", true],
      ["Klein family 4", "infant", false],
    ]);
  });
  it("leads with a woman when no men travel", () => {
    const m = partyMembers("Rivka Gross", { men: 0, women: 2, boys: 0, girls: 0, infants: 0 });
    expect(m[0].category).toBe("woman");
    expect(m).toHaveLength(2);
  });
  it("surnameOf", () => {
    expect(surnameOf("  Klein ")).toBe("Klein");
    expect(surnameOf("")).toBe("Family");
  });
});

describe("submitErrorMessage", () => {
  it("maps database codes to plain words", () => {
    expect(submitErrorMessage("too_many_requests")).toMatch(/call the office/);
    expect(submitErrorMessage("departure_not_bookable")).toMatch(/another day/);
    expect(submitErrorMessage("boom")).toMatch(/try again/);
  });
});
