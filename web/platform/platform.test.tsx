import React from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { PlatformPage } from "./page";
import { ROLES, roleById, roleOfStep } from "./roles";
import { hts } from "./names";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, replace: push }) }));

function as(role: string) {
  window.localStorage.setItem("keystone.role", role);
}
beforeEach(() => {
  window.localStorage.clear();
  sessionStorage.clear();
  push.mockClear();
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: false, media: query, addEventListener() {}, removeEventListener() {},
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it("gives each role its own steps, with no page shared between roles", () => {
  const paths = ROLES.flatMap(role => role.steps.map(step => step.path));
  expect(new Set(paths).size).toBe(paths.length);
  for (const role of ROLES) for (const step of role.steps) {
    expect(step.path.startsWith(`/${role.id}`)).toBe(true);
    expect(roleOfStep(step.id).id).toBe(role.id);
  }
  expect(roleById("sourcing").steps.map(s => s.label)).toEqual(["Overview", "Parts", "Supplier decisions", "Cost impact", "Supplier requests"]);
  expect(roleById("compliance").steps.map(s => s.label)).toEqual(["Overview", "Documents", "Evidence", "Duty bill"]);
  expect(roleById("analyst").steps.map(s => s.label)).toEqual(["Overview", "Lineage", "Calculations", "Audit log"]);
  expect(roleById("approver").steps.map(s => s.label)).toEqual(["Decision brief", "Decision history"]);
  expect(roleById("nobody").id).toBe("sourcing");
});

it("shows the step bar, the company and no live, refresh or footnote", async () => {
  render(<PlatformPage step="sourcing-overview" />);
  const nav = await screen.findByRole("navigation", { name: "Sourcing manager steps" });
  expect(within(nav).getAllByRole("link").map(a => a.textContent)).toEqual(["1Overview", "2Parts", "3Supplier decisions", "4Cost impact", "5Supplier requests"]);
  expect(within(nav).getByText("Overview").closest("a")?.getAttribute("aria-current")).toBe("step");
  expect(screen.getByText("Larkspur Mobile")).toBeTruthy();
  expect(screen.queryByText(/^Live$/)).toBeNull();
  expect(screen.queryByRole("button", { name: /refresh/i })).toBeNull();
  expect(screen.queryByText(/Illustrative/)).toBeNull();
  expect(window.localStorage.getItem("keystone.role")).toBe("sourcing");
});

it("switches role from the dropdown in the top bar", async () => {
  render(<PlatformPage step="sourcing-overview" />);
  fireEvent.click(await screen.findByRole("button", { name: "Viewing as: Maya Chen" }));
  const list = screen.getByRole("listbox", { name: "Viewing as" });
  expect(within(list).getAllByRole("option").map(o => o.textContent)).toEqual([
    "MCMaya ChenSourcing manager", "PRPriya RamanTrade compliance", "SOSam OkaforAnalyst", "EPElena ParkApprover"]);
  fireEvent.click(within(list).getByText("Sam Okafor"));
  expect(push).toHaveBeenCalledWith("/analyst");
});

it("shows one part at a time with its duty, quotes and orders", async () => {
  render(<PlatformPage step="sourcing-parts" />);
  expect(await screen.findByRole("heading", { name: "LPDDR5X memory, 12 GB" })).toBeTruthy();
  expect(screen.getByText("Section 232 semiconductors, rate increase")).toBeTruthy();
  expect(screen.getByText(/Quote Q-SRM-2611 at \$29.60. No duty with US fab proof./)).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: /^Part: / }));
  fireEvent.change(screen.getByLabelText("Search part"), { target: { value: "battery" } });
  fireEvent.click(screen.getByText("Lithium-ion battery, 4,000 mAh"));
  expect(screen.getByRole("heading", { name: "Lithium-ion battery, 4,000 mAh" })).toBeTruthy();
  expect(screen.getByText(/No tariff updates/)).toBeTruthy();
  expect(screen.getByText(/Chennai, India. Quote CCW-Q-2026-118 at \$7.10. MFN duty 3.4%./)).toBeTruthy();
  expect(screen.getByText("−$303,996 a year")).toBeTruthy();
});

it("lists cheaper international and US quotes on the sourcing overview", async () => {
  render(<PlatformPage step="sourcing-overview" />);
  const card = (await screen.findByText("Cheaper quotes on file")).closest(".card") as HTMLElement;
  const rows = within(card).getAllByRole("link");
  expect(rows[0].textContent).toContain("LPDDR5X memory, 12 GB from Snake River Memory");
  expect(within(card).getByText(/from Taoyuan Memory Technology/)).toBeTruthy();
  expect(within(card).getByText(/Kulim, Malaysia. \$3.31 landed against \$3.88 today. Section 232 at 25%./)).toBeTruthy();
});

it("groups the sourcing manager's cost impact by supplier", async () => {
  render(<PlatformPage step="sourcing-cost" />);
  const table = await screen.findByRole("table");
  const first = within(table).getAllByRole("row")[1];
  const supplier = within(first).getByRole("button", { name: "Hsinchu Advanced Silicon" });
  expect(within(first).getByText("Hsinchu, Taiwan")).toBeTruthy();
  const rows = within(table).getAllByRole("row").length;
  fireEvent.click(supplier);
  expect(within(table).getAllByRole("row").length).toBe(rows + 8);
});

it("gives trade compliance the duty bill by HTS heading", async () => {
  render(<PlatformPage step="compliance-duty" />);
  expect(await screen.findByRole("heading", { name: "Duty bill" })).toBeTruthy();
  expect(screen.getAllByText("8542.31").length).toBeGreaterThan(0);
  expect(screen.getByText("Processors and controllers")).toBeTruthy();
  expect(screen.getByText("+$2,410,809")).toBeTruthy();
  expect(screen.getAllByText(/Dallas\/Fort Worth, Texas/).length).toBeGreaterThan(0);
});

it("lets the analyst reconcile every line", async () => {
  render(<PlatformPage step="analyst-calculations" />);
  expect(await screen.findByText("Reconciles")).toBeTruthy();
  expect(screen.getAllByText("$2,155,600.00 × (25.00% − 10.00%) = $323,340.00")).toHaveLength(2);
});

it("gives the approver the Brief with a PDF download, and records the decision", async () => {
  render(<PlatformPage step="approver-brief" />);
  expect(await screen.findByRole("heading", { name: "LPDDR5X memory award: decision required" })).toBeTruthy();
  expect(screen.getByRole("img", { name: /rose from \$20,583,200 by \$2,806,800 to \$23,390,000/ })).toBeTruthy();
  expect(screen.getByRole("button", { name: /Download PDF/ })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Approve and send" }));
  expect(await screen.findByText("Request sent to Snake River Memory")).toBeTruthy();
  const events = JSON.parse(window.localStorage.getItem("keystone.phones.outcomes.v1") || "[]");
  expect(events[0].event).toMatchObject({ id: "AUD-0014", type: "action_sent", actor: "elena.park", entity_id: "ACT-0021" });
});

it("shows the approver the decision history", async () => {
  render(<PlatformPage step="approver-history" />);
  expect(await screen.findByRole("heading", { name: "Decision history" })).toBeTruthy();
  expect(screen.getByText("LPDDR5X memory award awarded to Hanul Semiconductor")).toBeTruthy();
  expect(screen.getByText("New rate takes effect")).toBeTruthy();
});

it("tells the decision story with names and the rule deltas", async () => {
  render(<PlatformPage step="sourcing-decisions" />);
  expect(await screen.findByText(/2 LPDDR5X memory parts were awarded to Hanul Semiconductor \(South Korea\)/)).toBeTruthy();
  expect(screen.getByText("−$3,364,000")).toBeTruthy();
  expect(screen.getByText("+$1,642,500")).toBeTruthy();
  expect(screen.getByText(/Switching to Snake River Memory saves \$3,364,000 a year, but only with proof the wafers were fabricated in the US/)).toBeTruthy();
});

it("names the supplier and lots on the evidence page", async () => {
  render(<PlatformPage step="compliance-evidence" />);
  expect(await screen.findByRole("heading", { name: "Snake River Memory" })).toBeTruthy();
  expect(screen.getByText(/lots SRM-2611-A and SRM-2611-B, from Boise, Idaho/)).toBeTruthy();
  expect(screen.getByText("Unreadable")).toBeTruthy();
  expect(screen.getByText("Missing")).toBeTruthy();
  expect(screen.getByRole("img", { name: "Highlighted source region" })).toBeTruthy();
});

it("formats HTS codes for people", () => {
  expect(hts("854231")).toBe("8542.31");
  expect(hts("8542320036")).toBe("8542.32.0036");
  expect(hts("not-a-code")).toBe("not-a-code");
});

it("keeps the source document beside the fields on Documents, with no zoom", async () => {
  render(<PlatformPage step="compliance-documents" />);
  const split = (await screen.findByText("What the bulletin says")).closest(".ks-split") as HTMLElement;
  expect(split.querySelector(".ks-pin")).toBeTruthy();
  fireEvent.click(within(split).getByRole("button", { name: /HTS headings/ }));
  expect(within(split).getByRole("button", { name: /HTS headings/ }).getAttribute("aria-pressed")).toBe("true");
  expect(within(split).getByText(/8542.31, 8542.32, 8542.39, 8523.51/, { selector: ".card-footer *, .card-footer" })).toBeTruthy();
  expect(screen.queryByText(/Zoom/)).toBeNull();
});
