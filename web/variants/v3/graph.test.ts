// @vitest-environment node
import { expect, it } from "vitest";
import fixture from "../../../contracts/fixtures/lineage.json";
import type { ExposureLineage } from "@/lib/contracts";
import { displayGraph } from "./graph";
const graph = fixture as ExposureLineage;
it("keeps every published source row in the aggregate exposure trace", () => {
  const view = displayGraph(graph, "");
  expect(view.groups.flatMap((group) => group.rows)).toHaveLength(
    graph.nodes.length,
  );
  expect(view.groups.find((group) => group.kind === "part")?.rows).toHaveLength(
    33,
  );
  expect(
    view.groups.find((group) => group.kind === "purchase_order")?.rows,
  ).toHaveLength(33);
});
it("traces MF-8413-005 through the published notice, decision, one PO and three products", () => {
  const view = displayGraph(graph, "part:MF-8413-005");
  expect(
    view.groups
      .find((group) => group.kind === "part")
      ?.rows.map((node) => node.label),
  ).toEqual(["MF-8413-005"]);
  expect(
    view.groups
      .find((group) => group.kind === "purchase_order")
      ?.rows.map((node) => node.id),
  ).toEqual(["purchase_order:PO-4504:1"]);
  expect(
    view.groups.find((group) => group.kind === "product")?.rows,
  ).toHaveLength(3);
  expect(view.groups.some((group) => group.kind === "bulletin")).toBe(true);
  expect(view.groups.some((group) => group.kind === "decision")).toBe(true);
});
