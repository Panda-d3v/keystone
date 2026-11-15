// Who is using Keystone. Every role sees the same platform and the same
// screens; the role decides the landing page, the order of the menu, and the
// two specialist views (Lineage for analysts, the Brief for approvers).

export type PageId =
  | "home" | "intake" | "exposure" | "decisions" | "evidence" | "actions"
  | "lineage" | "brief" | "audit";

export type RoleId = "sourcing" | "compliance" | "analyst" | "approver";

export interface Role {
  id: RoleId;
  label: string;
  person: string;
  initials: string;
  focus: string;
  home: PageId;
  pages: PageId[];
}

export const ROLES: Role[] = [
  {
    id: "sourcing", label: "Sourcing manager", person: "Maya Chen", initials: "MC",
    focus: "Keep supplier decisions right when trade rules change.",
    home: "home", pages: ["home", "intake", "exposure", "decisions", "evidence", "actions", "audit"],
  },
  {
    id: "compliance", label: "Trade compliance", person: "Priya Raman", initials: "PR",
    focus: "Make sure every duty claim is backed by documents.",
    home: "home", pages: ["home", "intake", "evidence", "exposure", "actions", "audit"],
  },
  {
    id: "analyst", label: "Analyst", person: "Sam Okafor", initials: "SO",
    focus: "Trace every number back to the rows and rules behind it.",
    home: "home", pages: ["home", "exposure", "lineage", "decisions", "audit"],
  },
  {
    id: "approver", label: "Approver", person: "Elena Park", initials: "EP",
    focus: "Decide on supplier changes with the full case in one place.",
    home: "brief", pages: ["brief", "decisions", "evidence", "audit"],
  },
];

export const PAGES: Record<PageId, { label: string; path: string; description: string }> = {
  home: { label: "Home", path: "/", description: "What needs you today" },
  intake: { label: "Intake", path: "/intake", description: "Documents received and what they say" },
  exposure: { label: "Exposure", path: "/exposure", description: "Which orders cost more, and by how much" },
  decisions: { label: "Decisions", path: "/decisions", description: "Supplier choices that no longer hold" },
  evidence: { label: "Evidence", path: "/evidence", description: "Proof a supplier still owes us" },
  actions: { label: "Actions", path: "/actions", description: "Requests ready to send" },
  lineage: { label: "Lineage", path: "/lineage", description: "Trace a number to its sources" },
  brief: { label: "Brief", path: "/brief", description: "The case for a decision, on one page" },
  audit: { label: "Audit log", path: "/audit", description: "Every step, signed and chained" },
};

export const DEFAULT_ROLE: RoleId = "sourcing";

export function roleById(id: string | null | undefined): Role {
  return ROLES.find(role => role.id === id) ?? ROLES.find(role => role.id === DEFAULT_ROLE)!;
}

/** Which role owns a page that the current role does not see. */
export function ownerOf(page: PageId): Role | undefined {
  return ROLES.find(role => role.pages.includes(page));
}
