import React from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { PlatformPage } from "./page";
import { ROLES, roleById, roleOfStep } from "./roles";
import { hts } from "./names";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, replace: push }) }));
vi.mock("@/variants/v1/pdf-page", () => ({ default: () => <div aria-label="PDF page" /> }));

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
  expect(roleById("sourcing").steps.map(s => s.label)).toEqual(["Overview", "Supplier decisions", "Cost impact", "Supplier requests"]);
  expect(roleById("compliance").steps.map(s => s.label)).toEqual(["Overview", "Documents", "Evidence", "Duty bill"]);
  expect(roleById("analyst").steps.map(s => s.label)).toEqual(["Overview", "Lineage", "Calculations", "Audit log"]);
  expect(roleById("approver").steps.map(s => s.label)).toEqual(["Decision brief", "Decision history"]);
  expect(roleById("nobody").id).toBe("sourcing");
});

it("shows the step bar for the role and no live or refresh controls", async () => {
  render(<PlatformPage step="sourcing-overview" />);
  const nav = await screen.findByRole("navigation", { name: "Sourcing manager steps" });
  expect(within(nav).getAllByRole("link").map(a => a.textContent)).toEqual(["1Overview", "2Supplier decisions", "3Cost impact", "4Supplier requests"]);
  expect(within(nav).getByText("Overview").closest("a")?.getAttribute("aria-current")).toBe("step");
  expect(screen.queryByText(/^Live$/)).toBeNull();
  expect(screen.queryByRole("button", { name: /refresh/i })).toBeNull();
  expect(window.localStorage.getItem("keystone.role")).toBe("sourcing");
});

it("switches role from the top bar to that role's first step", async () => {
  render(<PlatformPage step="sourcing-overview" />);
  fireEvent.change(await screen.findByLabelText("Viewing as"), { target: { value: "analyst" } });
  expect(push).toHaveBeenCalledWith("/analyst");
});

it("groups the sourcing manager's cost impact by supplier", async () => {
  render(<PlatformPage step="sourcing-cost" />);
  const table = await screen.findByRole("table");
  const first = within(table).getAllByRole("row")[1];
  const supplier = within(first).getByRole("button", { name: "Rajkot Sterling Castings" });
  expect(within(first).getByText("India")).toBeTruthy();
  const rows = within(table).getAllByRole("row").length;
  fireEvent.click(supplier);
  expect(supplier.getAttribute("aria-expanded")).toBe("true");
  expect(within(table).getAllByRole("row").length).toBe(rows + 10);
});

it("gives trade compliance the duty bill by HTS heading", async () => {
  render(<PlatformPage step="compliance-duty" />);
  expect(await screen.findByRole("heading", { name: "Duty bill" })).toBeTruthy();
  expect(screen.getAllByText("8413.91").length).toBeGreaterThan(0);
  expect(screen.getByText("Previous duty")).toBeTruthy();
  expect(screen.getByText(/Total added duty/)).toBeTruthy();
});

it("lets the analyst reconcile every line", async () => {
  render(<PlatformPage step="analyst-calculations" />);
  expect(await screen.findByText("Reconciles")).toBeTruthy();
  expect(screen.getByText("$307,200.00 × (50.00% − 25.00%) = $76,800.00")).toBeTruthy();
});

it("gives the approver the Brief with a PDF download", async () => {
  render(<PlatformPage step="approver-brief" />);
  expect(await screen.findByRole("heading", { name: /decision required$/ })).toBeTruthy();
  expect(screen.getByRole("img", { name: /rose from \$993,800 by \$198,760 to \$1,192,560/ })).toBeTruthy();
  expect(screen.getByRole("button", { name: /Download PDF/ })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Decline request" })).toBeTruthy();
});

it("shows the approver the decision history", async () => {
  render(<PlatformPage step="approver-history" />);
  expect(await screen.findByRole("heading", { name: "Decision history" })).toBeTruthy();
  expect(screen.getByText(/awarded to Ningbo Haitai/)).toBeTruthy();
  expect(screen.getByText("New rate takes effect")).toBeTruthy();
});

it("tells the decision story with names and the rule deltas", async () => {
  render(<PlatformPage step="sourcing-decisions" />);
  expect(await screen.findByText(/5 pump casings were awarded to Ningbo Haitai Precision Casting \(China\)/)).toBeTruthy();
  expect(screen.getByText("−$49,690")).toBeTruthy();
  expect(screen.getByText("+$178,884")).toBeTruthy();
  expect(screen.getByText(/Switching to Sheffield Forge & Pattern saves \$49,690 a year, but only with melt-and-pour proof/)).toBeTruthy();
});

it("names the supplier and heats on the evidence page", async () => {
  render(<PlatformPage step="compliance-evidence" />);
  expect(await screen.findByRole("heading", { name: "Sheffield Forge & Pattern" })).toBeTruthy();
  expect(screen.getByText(/United Kingdom\./)).toBeTruthy();
  expect(screen.getByText(/heats SF-24117 and SF-24121/)).toBeTruthy();
  expect(screen.getByText("Unreadable")).toBeTruthy();
  expect(screen.getByText("Missing")).toBeTruthy();
});

it("formats HTS codes for people", () => {
  expect(hts("841391")).toBe("8413.91");
  expect(hts("8413919095")).toBe("8413.91.9095");
  expect(hts("not-a-code")).toBe("not-a-code");
});

it("keeps the source document beside the fields on Intake", async () => {
  render(<PlatformPage step="compliance-documents" />);
  const split = (await screen.findByText("What the bulletin says")).closest(".ks-split") as HTMLElement;
  expect(split).toBeTruthy();
  expect(split.querySelector(".ks-pin")).toBeTruthy();
  fireEvent.click(within(split).getByRole("button", { name: /Affected HTS headings/ }));
  expect(within(split).getByRole("button", { name: /Affected HTS headings/ }).getAttribute("aria-pressed")).toBe("true");
});
