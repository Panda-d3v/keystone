export type Version = 1 | 2 | 3 | 4 | 5;
export type Screen = "inbox" | "exposure" | "decisions" | "evidence" | "actions" | "audit";
export const versions: {id: Version; name: string; audience: string; description: string}[] = [
  {id: 1, name: "Console", audience: "Sourcing manager", description: "A daily workspace with a tabbed change page, dense tables, and a details panel."},
  {id: 2, name: "Entry Sheet", audience: "Trade compliance", description: "A customs-style entry sheet with numbered fields and a duty bill."},
  {id: 3, name: "Lineage", audience: "Analyst", description: "Follow the path from a bulletin to rates, decisions, parts, orders, and products."},
  {id: 4, name: "Triage", audience: "Buyer", description: "Clear an action queue with a split view and keyboard shortcuts."},
  {id: 5, name: "Brief", audience: "Approver", description: "Read the case in one page, from changed assumptions to the decision."},
];
export const screens: {id: Screen; label: string}[] = [
  {id: "inbox", label: "Intake"}, {id: "exposure", label: "Exposure"},
  {id: "decisions", label: "Decisions"}, {id: "evidence", label: "Evidence"},
  {id: "actions", label: "Actions"}, {id: "audit", label: "Audit log"},
];
export function routeFor(version: Version, screen: Screen, changeId = "CE-0007") {
  if (screen === "inbox" || screen === "audit") return `/${version}/${screen}`;
  return `/${version}/changes/${encodeURIComponent(changeId)}${screen === "exposure" ? "" : `/${screen}`}`;
}
