import { describe, it, expect } from "vitest";
import { trigramSimilarity, isLikelyDuplicate } from "./fuzzyMatch";

describe("trigramSimilarity", () => {
  it("returns 1 for identical strings", () => {
    expect(trigramSimilarity("22 Stamford Hill", "22 Stamford Hill")).toBeCloseTo(1, 5);
  });

  it("returns 0 for completely unrelated strings", () => {
    expect(trigramSimilarity("22 Stamford Hill", "9 Deurne")).toBeLessThan(0.2);
  });

  it("is case-insensitive", () => {
    const a = trigramSimilarity("22 Stamford Hill", "22 stamford hill");
    expect(a).toBeCloseTo(1, 5);
  });
});

describe("isLikelyDuplicate", () => {
  it("flags a near-identical address as a likely duplicate", () => {
    expect(
      isLikelyDuplicate(
        { line1: "22 Stamford Hill", postcode: "N16 6XB" },
        { line1: "22 Stamford Hill", postcode: "N16 6XB" }
      )
    ).toBe(true);
  });

  it("does not flag genuinely different addresses", () => {
    expect(
      isLikelyDuplicate(
        { line1: "22 Stamford Hill", postcode: "N16 6XB" },
        { line1: "Pelikaanstraat 1", postcode: "2018" }
      )
    ).toBe(false);
  });
});
