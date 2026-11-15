import { expect, it } from "vitest";
import { actionTitle, atStake } from "./format";

it("prefers the drafted title and falls back to a readable type", () => {
  expect(actionTitle({ title: "Ask Sheffield for the origin declaration", type: "request_evidence" }))
    .toBe("Ask Sheffield for the origin declaration");
  expect(actionTitle({ title: null, type: "request_evidence" })).toBe("Request evidence");
  expect(actionTitle({ title: "  ", type: "review_award" })).toBe("Review award");
});

it("labels rule amounts as annual", () => {
  expect(atStake(49690)).toBe("$49,690 a year at stake");
});
