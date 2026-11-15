// @vitest-environment node
import { expect, it } from "vitest";
import decisions from "../../../contracts/fixtures/decisions.json";
import { waterfallBars } from "./waterfall";
it("positions the duty increment between the two published annual totals", () => {
  const bars = waterfallBars(decisions[0])!;
  expect(bars[0].value).toBe(993800);
  expect(bars[2].value).toBe(1192560);
  expect(bars[1].bottom).toBeCloseTo(bars[0].height);
  expect(bars[0].height + bars[1].height).toBeCloseTo(bars[2].height);
});
