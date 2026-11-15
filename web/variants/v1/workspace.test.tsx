import React from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, render, screen, fireEvent, within, waitFor } from "@testing-library/react";
import ConsoleWorkspace from "./workspace";
vi.mock("./pdf-page", () => ({ default: () => <div aria-label="PDF page"/> }));
beforeEach(() => {
  sessionStorage.clear();
  vi.stubGlobal("ResizeObserver", class {
    observe() {}
    unobserve() {}
    disconnect() {}
  });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
it("renders each Console route from the real fixture", () => {
 for (const route of ["inbox", "exposure", "decisions", "evidence", "actions", "audit"] as const) {
   const result=render(<ConsoleWorkspace screen={route}/>);
   expect(result.getByRole("main")).toBeTruthy();
   expect(result.getByRole("navigation", {name:"Main navigation"})).toBeTruthy();
   expect(result.getAllByText("Fixture data")).toHaveLength(1);
   result.unmount();
 }
});
it("filters, sorts, pages, and opens the row behind a cost", () => {
 render(<ConsoleWorkspace screen="exposure"/>);
 expect(screen.getByText("$470,687")).toBeTruthy();
 expect(screen.getByText("$617,061")).toBeTruthy();
 fireEvent.click(screen.getByRole("button",{name:"Next"}));
 expect(screen.getByText("33 rows. Page 2 of 4.")).toBeTruthy();
 fireEvent.change(screen.getByRole("textbox",{name:"Filter orders"}),{target:{value:"PO-4504"}});
 expect(screen.getByText("1 rows. Page 1 of 1.")).toBeTruthy();
 expect(screen.queryByText("PO-4501 / 1")).toBeNull();
 fireEvent.click(screen.getByRole("button",{name:"Show detail for PO-4504"}));
 const detail=screen.getByRole("complementary",{name:"Order math"});
 expect(within(detail).getByText("$76,800.00")).toBeTruthy();
 fireEvent.click(within(detail).getByRole("button",{name:"Close"}));
 expect(screen.queryByRole("complementary",{name:"Order math"})).toBeNull();
 fireEvent.change(screen.getByRole("textbox",{name:"Filter orders"}),{target:{value:""}});
 fireEvent.click(screen.getByRole("button",{name:"Added duty"}));
 fireEvent.click(screen.getByRole("button",{name:"Added duty"}));
 const rows=screen.getAllByRole("row");
 expect(within(rows[1]).getByText("PO-4504 / 1")).toBeTruthy();
});
it("renders 12 audit events newest first and supports search", () => {
 render(<ConsoleWorkspace screen="audit"/>);
 expect(screen.getAllByRole("row")).toHaveLength(13);
 expect(within(screen.getAllByRole("row")[1]).getByText("action sent")).toBeTruthy();
 fireEvent.change(screen.getByRole("textbox",{name:"Filter events"}),{target:{value:"document_ingested"}});
 expect(screen.getAllByRole("row")).toHaveLength(2);
});

it("maps a selected extracted field to its exact cited region", () => {
  render(<ConsoleWorkspace screen="inbox"/>);
  fireEvent.click(screen.getByRole("button", { name: "Inspect hts scope source" }));
  const highlight = screen.getByRole("img", { name: "Highlighted source region" });
  expect(parseFloat(highlight.style.top)).toBeCloseTo(29.519);
  expect(screen.getByText(/Parts of pumps for liquids 25% 50%/)).toBeTruthy();
});
it("shows the refusal reason with a highlighted scan region", () => {
  render(<ConsoleWorkspace screen="evidence"/>);
  expect(screen.getByText("UK melt and pour is unreadable or below 85% confidence.")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Inspect uk melt and pour source" }));
  expect(parseFloat(screen.getByRole("img", { name: "Highlighted source region" }).style.top)).toBeCloseTo(28);
});
it("submits an edited request and keeps the returned draft approval state", async () => {
  render(<ConsoleWorkspace screen="actions"/>);
  const editor = screen.getByRole("textbox", { name: "Supplier request ACT-0001" });
  fireEvent.change(editor, { target: { value: "Please provide the missing origin declaration and a legible mill certificate." } });
  fireEvent.click(screen.getByRole("button", { name: "Submit request" }));
  await waitFor(() => expect(screen.getByText("D-2026-044")).toBeTruthy());
  expect(screen.getByText("Sourcing Manager")).toBeTruthy();
  expect(screen.getByText("Trade Compliance")).toBeTruthy();
  expect((editor as HTMLTextAreaElement).disabled).toBe(true);
  cleanup();
  render(<ConsoleWorkspace screen="decisions"/>);
  await waitFor(() => expect(screen.getByText("D-2026-044")).toBeTruthy());
  cleanup();
  render(<ConsoleWorkspace screen="actions"/>);
  await waitFor(() => expect((screen.getByRole("textbox", { name: "Supplier request ACT-0001" }) as HTMLTextAreaElement).value).toBe("Please provide the missing origin declaration and a legible mill certificate."));
});

it("uploads a bulletin and explains the next step", async () => {
  const { DocumentUpload } = await import("./document-upload");
  const reload = vi.fn();
  const request = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      change_ids: ["CE-0007"], evidence_doc_ids: [], review_doc_ids: [],
    }),
  });
  vi.stubGlobal("fetch", request);
  render(<DocumentUpload hasChange={false} onUploaded={reload} />);
  const file = new File(["Tariff bulletin"], "bulletin.pdf", { type: "application/pdf" });
  fireEvent.change(screen.getByLabelText("Choose a bulletin or supplier certificate"), {
    target: { files: [file] },
  });
  fireEvent.click(screen.getByRole("button", { name: "Upload document" }));
  expect(await screen.findByText(/Bulletin processed. Select Run impact/)).toBeTruthy();
  expect(request.mock.calls[0][0]).toMatch(/\/intake$/);
  expect(request.mock.calls[0][1].body.get("file")).toBe(file);
  expect(reload).toHaveBeenCalledOnce();
});
it("lists received documents in plain words with what to check", () => {
 render(<ConsoleWorkspace screen="inbox"/>);
 const list = screen.getByRole("region", {name: "Received documents"});
 expect(within(list).getByText("1 to check")).toBeTruthy();
 expect(within(list).getByText(/^Tariff bulletin HTA-2026-118: 4 HTS headings/)).toBeTruthy();
 expect(within(list).getByText(/unreadable \(5% confidence, 85% needed\)/)).toBeTruthy();
});
it("titles each action in plain words with why it matters", async () => {
 render(<ConsoleWorkspace screen="actions"/>);
 expect(await screen.findByRole("heading", {name: "Ask Sheffield Forge & Pattern Ltd for the melt-and-pour certificate and origin declaration"})).toBeTruthy();
 expect(screen.getByText(/would save \$49,690 a year, but only once we hold/)).toBeTruthy();
 expect(screen.getByText("$49,690 a year at stake")).toBeTruthy();
 expect(screen.queryByText(/request evidence/)).toBeNull();
});
