import React from "react";
import { afterEach, expect, it } from "vitest";
import { cleanup, render, screen, fireEvent, within } from "@testing-library/react";
import ConsoleWorkspace from "./workspace";
afterEach(cleanup);
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
