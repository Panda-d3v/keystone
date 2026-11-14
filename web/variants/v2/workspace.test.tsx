import React from "react";
import { afterEach, beforeEach, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import EntryWorkspace from "./workspace";
beforeEach(() => sessionStorage.clear());
afterEach(cleanup);
it("renders all Entry Sheet routes from the shared fixtures", () => {
  for (const route of ["inbox", "exposure", "decisions", "evidence", "actions", "audit"] as const) {
    const result = render(<EntryWorkspace screen={route}/>);
    expect(result.getByRole("main")).toBeTruthy();
    if (route === "exposure") {
      expect(result.getAllByText("$470,687").length).toBeGreaterThan(0);
      expect(result.getAllByText("$617,061").length).toBeGreaterThan(0);
      expect(result.getAllByText("$76,800.00").length).toBeGreaterThan(0);
      expect(result.getByText("$153,600.00")).toBeTruthy();
    }
    result.unmount();
  }
});
it("opens the source for an extracted field", () => {
  render(<EntryWorkspace screen="inbox"/>);
  fireEvent.click(screen.getByRole("button",{name:"Inspect effective date"}));
  expect(screen.getByText(/The change applies to goods entered/)).toBeTruthy();
});
