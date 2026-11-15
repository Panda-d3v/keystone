"use client";
import { Shell } from "./shell";
import type { PageId } from "./roles";
import { Home } from "./screens/home";
import { Intake } from "./screens/intake";
import { Exposure } from "./screens/exposure";
import { Decisions } from "./screens/decisions";
import { Evidence } from "./screens/evidence";
import { Actions } from "./screens/actions";
import { Audit } from "./screens/audit";
import { Brief, Lineage } from "./screens/specialist";

/** One platform, one shell; the role decides the menu and the landing page. */
export function PlatformPage({ page }: { page: PageId }) {
  return <Shell page={page}>{({ role, data, reload, useFixtures }) => {
    const shown = page === "home" ? role.home : page;
    switch (shown) {
      case "home": return <Home data={data} role={role} />;
      case "intake": return <Intake data={data} useFixtures={useFixtures} reload={reload} />;
      case "exposure": return <Exposure data={data} role={role} />;
      case "decisions": return <Decisions data={data} role={role} />;
      case "evidence": return <Evidence data={data} role={role} />;
      case "actions": return <Actions data={data} />;
      case "lineage": return <Lineage data={data} />;
      case "brief": return <Brief data={data} reload={reload} />;
      case "audit": return <Audit data={data} />;
    }
  }}</Shell>;
}
