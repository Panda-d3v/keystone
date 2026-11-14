// @vitest-environment node
import { expect, it } from "vitest";
import events from "./fixtures/audit-test.json";
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
