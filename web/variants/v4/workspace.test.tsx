import React from "react";
import { afterEach, beforeEach, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import TriageWorkspace from "./workspace";

beforeEach(() => sessionStorage.clear());
afterEach(cleanup);

it("clears the request queue using only keyboard submission", async () => {
  render(<TriageWorkspace screen="inbox" />);
  expect(screen.getByRole("textbox", { name: "Supplier request" })).toBeTruthy();
  fireEvent.keyDown(document, { key: "j" });
  fireEvent.keyDown(document, { key: "k" });
  fireEvent.keyDown(document, { key: "e" });
  await waitFor(() => expect(screen.getByText("Queue cleared")).toBeTruthy());
  expect(screen.getByText("D-2026-044")).toBeTruthy();
});

it("preserves letter entry while editing the request", () => {
  render(<TriageWorkspace screen="actions" />);
  const editor = screen.getByRole("textbox", { name: "Supplier request" });
  fireEvent.keyDown(editor, { key: "e" });
  expect(screen.queryByText("Queue cleared")).toBeNull();
});

it("renders each route and the shared exposure totals", () => {
  for (const route of ["inbox", "exposure", "decisions", "evidence", "actions", "audit"] as const) {
    const result = render(<TriageWorkspace screen={route} />);
    expect(result.getByRole("main")).toBeTruthy();
    if (route === "exposure") {
      expect(result.getByText("$470,687")).toBeTruthy();
      expect(result.getByText("$617,061")).toBeTruthy();
    }
    result.unmount();
  }
});
