// @vitest-environment node
import { expect, it } from "vitest";
import events from "./fixtures/audit-test.json";
import fixtureAudit from "../../contracts/fixtures/audit.json";
import { verifyAudit } from "./audit";
it("verifies Python-generated hashes with Unicode and microsecond timestamps", async () => {
  expect((await verifyAudit([...events].reverse())).valid).toBe(true);
});
it("detects edited content and missing chain links", async () => {
  const edited = structuredClone(events);
  edited[0].actor = "changed";
  expect((await verifyAudit(edited)).valid).toBe(false);
  expect((await verifyAudit([events[1]])).valid).toBe(false);
});

it("verifies every published audit fixture event", async () => {
  expect(fixtureAudit).toHaveLength(12);
  expect((await verifyAudit(fixtureAudit)).valid).toBe(true);
});
