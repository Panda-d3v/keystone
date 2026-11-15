import React from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { PlatformPage } from "./page";
import { PAGES, ROLES, roleById } from "./roles";
import { hts } from "./names";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("@/variants/v1/pdf-page", () => ({ default: () => <div aria-label="PDF page" /> }));

vi.mock("@/lib/use-workspace", async (original) => {
  const module = await original<typeof import("@/lib/use-workspace")>();
  return { useWorkspace: () => ({ ...module.useWorkspace(), useFixtures: false }) };
});

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

it("gives every role one platform with its own menu and specialist view", () => {
  for (const role of ROLES) {
    expect(role.pages).toContain(role.home);
    expect(role.pages.length).toBeLessThanOrEqual(4);  // each role sees only what its job needs
  }
  // No two roles share the same menu.
  expect(new Set(ROLES.map(role => role.pages.join(","))).size).toBe(ROLES.length);
  expect(roleById("sourcing").pages).toEqual(["home", "decisions", "exposure", "actions"]);
  expect(roleById("compliance").pages).toEqual(["home", "intake", "evidence", "exposure"]);
  expect(roleById("analyst").pages).toEqual(["home", "lineage", "exposure", "audit"]);
  expect(roleById("approver").pages).toEqual(["brief", "audit"]);
  expect(ROLES.filter(role => role.pages.includes("lineage")).map(role => role.id)).toEqual(["analyst"]);
  expect(ROLES.filter(role => role.pages.includes("brief")).map(role => role.id)).toEqual(["approver"]);
  expect(roleById("nobody").id).toBe("sourcing");
  expect(Object.values(PAGES).every(page => page.path.startsWith("/"))).toBe(true);
});

it("greets the person and lists their next steps", async () => {
  render(<PlatformPage page="home" />);
  expect(await screen.findByRole("heading", { name: /, Maya$/ })).toBeTruthy();
  const steps = screen.getByText("Your next steps").closest(".card") as HTMLElement;
  expect(within(steps).getByText("Review the pump casing award")).toBeTruthy();
  expect(within(steps).getByText("It now costs $198,760 more a year.")).toBeTruthy();
  expect(screen.getAllByText("$470,687").length).toBeGreaterThan(0);
});

it("switches roles from the top bar and changes the menu", async () => {
  render(<PlatformPage page="home" />);
  const nav = await screen.findByRole("navigation", { name: "Main navigation" });
  expect(within(nav).queryByText("Lineage")).toBeNull();
  fireEvent.change(screen.getByLabelText("Viewing as"), { target: { value: "analyst" } });
  expect(within(nav).getByText("Lineage")).toBeTruthy();
  expect(await screen.findByText("Trace the $470,687")).toBeTruthy();
  expect(window.localStorage.getItem("keystone.role")).toBe("analyst");
});

it("explains when a page belongs to another role", async () => {
  render(<PlatformPage page="lineage" />);
  expect(await screen.findByRole("heading", { name: "Lineage belongs to the analyst view" })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "View as Sam Okafor, Analyst" }));
  expect(window.localStorage.getItem("keystone.role")).toBe("analyst");
});

it("lands the approver on the Brief", async () => {
  as("approver");
  render(<PlatformPage page="home" />);
  expect(await screen.findByRole("button", { name: "Approve request" })).toBeTruthy();
  const nav = screen.getByRole("navigation", { name: "Main navigation" });
  expect(within(nav).getByText("Brief").closest("a")?.getAttribute("aria-current")).toBe("page");
});

it("tells the decision story with names and the rule deltas", async () => {
  render(<PlatformPage page="decisions" />);
  expect(await screen.findByText(/5 pump casings were awarded to Ningbo Haitai Precision Casting \(China\)/)).toBeTruthy();
  expect(screen.getByText("−$49,690")).toBeTruthy();
  expect(screen.getByText("+$178,884")).toBeTruthy();
  expect(screen.getByText(/Switching to Sheffield Forge & Pattern saves \$49,690 a year, but only with melt-and-pour proof/)).toBeTruthy();
});

it("lists the largest added duty first, with supplier names", async () => {
  render(<PlatformPage page="exposure" />);
  const table = await screen.findByRole("table");
  const first = within(table).getAllByRole("row")[1];
  expect(within(first).getByText("PO-4504 / 1")).toBeTruthy();
  expect(within(first).getByText("Ningbo Haitai Precision Casting")).toBeTruthy();
  expect(within(table).queryByText("Previous duty")).toBeNull();
  fireEvent.click(within(first).getByRole("button", { name: "PO-4504 / 1" }));
  expect(within(table).getByText("$307,200.00 × (50.00% − 25.00%) = $76,800.00")).toBeTruthy();
});

it("shows trade compliance the duty bill", async () => {
  as("compliance");
  render(<PlatformPage page="exposure" />);
  expect(await screen.findByRole("heading", { name: "Duty bill" })).toBeTruthy();
  expect(screen.getByText("Duty by order line")).toBeTruthy();
  const nav = screen.getByRole("navigation", { name: "Main navigation" });
  expect(within(nav).getByText("Duty bill")).toBeTruthy();
  expect(within(nav).queryByText("Decisions")).toBeNull();
  expect(screen.getByText("Previous duty")).toBeTruthy();
  expect(screen.getByText("New duty")).toBeTruthy();
});

it("names the supplier and heats on the evidence page", async () => {
  as("compliance");
  render(<PlatformPage page="evidence" />);
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

it("gives the approver a native Brief with the waterfall and the decision", async () => {
  as("approver");
  render(<PlatformPage page="brief" />);
  expect(await screen.findByRole("heading", { name: "The pump casing award needs your decision" })).toBeTruthy();
  expect(screen.getByRole("img", { name: /rose from \$993,800 by \$198,760 to \$1,192,560/ })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Decline request" })).toBeTruthy();
  const nav = screen.getByRole("navigation", { name: "Main navigation" });
  expect(within(nav).getAllByRole("link").map(link => link.textContent)).toEqual(["Brief", "Audit log"]);
});

it("keeps the source document beside the fields on Intake", async () => {
  as("compliance");
  render(<PlatformPage page="intake" />);
  const split = (await screen.findByText("What the bulletin says")).closest(".ks-split") as HTMLElement;
  expect(split).toBeTruthy();
  expect(split.querySelector(".ks-pin")).toBeTruthy();
  fireEvent.click(within(split).getByRole("button", { name: /Affected HTS headings/ }));
  expect(within(split).getByRole("button", { name: /Affected HTS headings/ }).getAttribute("aria-pressed")).toBe("true");
});
