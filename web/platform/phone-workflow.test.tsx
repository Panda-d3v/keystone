import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { PhoneWorkflow } from "./screens/phone-workflow";
import { roleById } from "./roles";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

afterEach(() => {
  cleanup();
  localStorage.clear();
  history.replaceState(null, "", "/");
});

it("keeps decisions separate by component and carries them into the brief", () => {
  const { rerender } = render(<PhoneWorkflow page="decisions" role={roleById("sourcing")} onRole={vi.fn()} />);
  const processor = within(screen.getByRole("heading", { name: "Processor" }).closest("article")!);
  const memory = within(screen.getByRole("heading", { name: "LPDDR RAM" }).closest("article")!);
  fireEvent.click(processor.getByRole("button", { name: "Keep supplier" }));
  fireEvent.click(memory.getByRole("button", { name: "Choose alternative" }));
  expect(processor.getByText("Completed")).toBeTruthy();
  expect(memory.getByText("Evidence needed")).toBeTruthy();
  rerender(<PhoneWorkflow page="brief" role={roleById("approver")} onRole={vi.fn()} />);
  expect(screen.getByText("Keep Samsung.")).toBeTruthy();
  expect(screen.getByText(/Switch to Memory supplier B.*evidence still needed/)).toBeTruthy();
  expect(screen.getByText(/\$1,800,000 in modeled first-year savings/)).toBeTruthy();
  fireEvent.change(screen.getByLabelText("Tariff case"), { target: { value: "TC-102" } });
  expect(screen.getByText("Component decisions complete")).toBeTruthy();
});


it.each([
  ["sourcing", "Choose by component"],
  ["compliance", "Review tariff"],
  ["analyst", "Check costs"],
  ["approver", "Review brief"],
] as const)("starts the %s role on its own work", (role, label) => {
  render(<PhoneWorkflow page="home" role={roleById(role)} onRole={vi.fn()} />);
  const nav = screen.getByRole("navigation", { name: "Tariff workflow" });
  expect(within(nav).getByRole("link", { name: new RegExp(label) }).getAttribute("aria-current")).toBe("step");
});
