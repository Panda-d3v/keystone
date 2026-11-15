// Four roles, four separate workspaces. No page is shared: each role works
// through its own steps, shown as a step bar in the order the job is done.

export type RoleId = "sourcing" | "compliance" | "analyst" | "approver";

export type StepId =
  | "sourcing-overview" | "sourcing-parts" | "sourcing-decisions" | "sourcing-cost" | "sourcing-requests"
  | "compliance-overview" | "compliance-documents" | "compliance-evidence" | "compliance-duty"
  | "analyst-overview" | "analyst-lineage" | "analyst-calculations" | "analyst-audit"
  | "approver-brief" | "approver-history";

export interface Step {
  id: StepId;
  label: string;
  path: string;
}

export interface Role {
  id: RoleId;
  label: string;
  person: string;
  initials: string;
  steps: Step[];
}

const step = (id: StepId, label: string, path: string): Step => ({ id, label, path });

export const ROLES: Role[] = [
  {
    id: "sourcing", label: "Sourcing manager", person: "Maya Chen", initials: "MC",
    steps: [
      step("sourcing-overview", "Overview", "/sourcing"),
      step("sourcing-parts", "Parts", "/sourcing/parts"),
      step("sourcing-decisions", "Supplier decisions", "/sourcing/decisions"),
      step("sourcing-cost", "Cost impact", "/sourcing/cost-impact"),
      step("sourcing-requests", "Supplier requests", "/sourcing/requests"),
    ],
  },
  {
    id: "compliance", label: "Trade compliance", person: "Priya Raman", initials: "PR",
    steps: [
      step("compliance-overview", "Overview", "/compliance"),
      step("compliance-documents", "Documents", "/compliance/documents"),
      step("compliance-evidence", "Evidence", "/compliance/evidence"),
      step("compliance-duty", "Duty bill", "/compliance/duty-bill"),
    ],
  },
  {
    id: "analyst", label: "Analyst", person: "Sam Okafor", initials: "SO",
    steps: [
      step("analyst-overview", "Overview", "/analyst"),
      step("analyst-lineage", "Lineage", "/analyst/lineage"),
      step("analyst-calculations", "Calculations", "/analyst/calculations"),
      step("analyst-audit", "Audit log", "/analyst/audit"),
    ],
  },
  {
    id: "approver", label: "Approver", person: "Elena Park", initials: "EP",
    steps: [
      step("approver-brief", "Decision brief", "/approver"),
      step("approver-history", "Decision history", "/approver/history"),
    ],
  },
];

export const DEFAULT_ROLE: RoleId = "sourcing";

export function roleById(id: string | null | undefined): Role {
  return ROLES.find(role => role.id === id) ?? ROLES.find(role => role.id === DEFAULT_ROLE)!;
}

export function roleOfStep(stepId: StepId): Role {
  return ROLES.find(role => role.steps.some(s => s.id === stepId))!;
}
