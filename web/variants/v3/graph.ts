import type { ExposureLineage, LineageNode } from "@/lib/contracts";

export const kinds: LineageNode["kind"][] = ["bulletin", "change", "rate", "assumption", "decision", "part", "purchase_order", "product"];
export interface SourceGroup { kind: LineageNode["kind"]; rows: LineageNode[] }

export function displayGraph(graph: ExposureLineage, focusPart: string) {
  const selected = new Set<string>();
  function walk(id: string, direction: "source" | "target", visited: Set<string>) {
    if (visited.has(id)) return;
    visited.add(id);
    selected.add(id);
    for (const edge of graph.edges) {
      const from = direction === "source" ? edge.target : edge.source;
      if (from === id) walk(edge[direction], direction, visited);
    }
  }
  if (focusPart) {
    walk(focusPart, "source", new Set());
    walk(focusPart, "target", new Set());
  } else graph.nodes.forEach(node => selected.add(node.id));
  const nodes = graph.nodes.filter(node => selected.has(node.id));
  const byId = new Map(nodes.map(node => [node.id, node]));
  const groups: SourceGroup[] = kinds.map(kind => ({ kind, rows: nodes.filter(node => node.kind === kind) })).filter(group => group.rows.length);
  const edges = new Map<string, { source: string; target: string; kind: string }>();
  for (const edge of graph.edges) {
    const source = byId.get(edge.source)?.kind;
    const target = byId.get(edge.target)?.kind;
    if (source && target && source !== target) edges.set(`${source}:${target}:${edge.kind}`, { source, target, kind: edge.kind });
  }
  return { groups, edges: [...edges.values()] };
}
