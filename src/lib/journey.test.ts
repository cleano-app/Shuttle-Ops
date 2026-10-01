import { describe, expect, it } from "vitest";
import { journeyLabel } from "./journey";

describe("journeyLabel", () => {
  it("reads the route forwards for outbound and backwards for return", () => {
    expect(journeyLabel("London ⇄ Antwerp", "outbound")).toBe("London → Antwerp");
    expect(journeyLabel("London ⇄ Antwerp", "return")).toBe("Antwerp → London");
  });
  it("keeps hyphenated place names whole", () => {
    expect(journeyLabel("Stamford-Hill - Antwerp", "return")).toBe("Antwerp → Stamford-Hill");
  });
  it("falls back when the name has no two ends", () => {
    expect(journeyLabel("Shuttle", "outbound")).toBe("Shuttle · outbound");
  });
});
