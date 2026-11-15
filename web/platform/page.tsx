"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Shell, rememberedRole } from "./shell";
import { roleById, roleOfStep, type StepId } from "./roles";
import { SourcingOverview, CostImpact } from "./screens/sourcing";
import { ComplianceOverview, DutyBill } from "./screens/compliance";
import { AnalystOverview, Calculations } from "./screens/analyst";
import { Intake } from "./screens/intake";
import { Decisions } from "./screens/decisions";
import { Evidence } from "./screens/evidence";
import { Actions } from "./screens/actions";
import { Audit } from "./screens/audit";
import { Brief, DecisionHistory, Lineage } from "./screens/specialist";

/** One platform; each step belongs to exactly one role. */
export function PlatformPage({ step }: { step: StepId }) {
  const role = roleOfStep(step);
  return <Shell roleId={role.id} stepId={step}>{({ data, reload, useFixtures }) => {
    switch (step) {
      case "sourcing-overview": return <SourcingOverview data={data} />;
      case "sourcing-decisions": return <Decisions data={data} />;
      case "sourcing-cost": return <CostImpact data={data} />;
      case "sourcing-requests": return <Actions data={data} />;
      case "compliance-overview": return <ComplianceOverview data={data} />;
      case "compliance-documents": return <Intake data={data} useFixtures={useFixtures} reload={reload} />;
      case "compliance-evidence": return <Evidence data={data} />;
      case "compliance-duty": return <DutyBill data={data} />;
      case "analyst-overview": return <AnalystOverview data={data} />;
      case "analyst-lineage": return <Lineage data={data} />;
      case "analyst-calculations": return <Calculations data={data} />;
      case "analyst-audit": return <Audit data={data} />;
      case "approver-brief": return <Brief data={data} />;
      case "approver-history": return <DecisionHistory data={data} />;
    }
  }}</Shell>;
}

/** "/" sends people to the first step of the role they last used. */
export function RoleRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace(roleById(rememberedRole()).steps[0].path); }, [router]);
  return null;
}
