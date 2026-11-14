import { describe, expect, it } from "vitest";
import { fixtureData } from "./data";
import { routeFor, versions, screens } from "./routes";
import { money, percent } from "./format";

describe("shared T00 fixtures", () => {
  it("preserves the API exposure totals and complete rows", () => {
    expect(fixtureData.exposure.added_duty_usd).toBe(470687);
    expect(fixtureData.exposure.annualized_added_duty_usd).toBe(617061);
    expect(fixtureData.exposure.lines).toHaveLength(33);
    expect(Math.round(fixtureData.exposure.lines.reduce((sum, line) => sum + line.added_duty_usd, 0))).toBe(470687);
  });
  it("retains evidence uncertainty and audit history", () => {
    expect(fixtureData.evidence.items[0].fields.melt_location).toBeNull();
    expect(fixtureData.evidence.items[0].fields.melt_location_confidence).toBe(0.42);
    expect(fixtureData.audit).toHaveLength(12);
  });
});
it("maps all 5 versions to 6 real routes", () => {
  expect(versions.map(v => v.id)).toEqual([1, 2, 3, 4, 5]);
  for (const version of versions) {
    expect(screens.map(s => routeFor(version.id, s.id))).toHaveLength(6);
    expect(routeFor(version.id, "inbox")).toBe(`/${version.id}/inbox`);
    expect(routeFor(version.id, "audit")).toBe(`/${version.id}/audit`);
  }
});
it("formats values without replacing source precision", () => {
  expect(money(470686.75)).toBe("$470,687");
  expect(money(470686.75, 2)).toBe("$470,686.75");
  expect(percent(0.25)).toBe("25%");
});
