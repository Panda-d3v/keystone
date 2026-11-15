"use client";
// The two specialist views, reused from the design versions the team liked:
// the React Flow lineage graph (analyst) and the one-page Brief (approver).
import { useState } from "react";
import { Download, Printer } from "lucide-react";
import type { WorkspaceData } from "@/lib/contracts";
import { money } from "@/lib/format";
import { useLineage } from "@/lib/use-lineage";
import { LineageContent } from "@/variants/v3/workspace";
import { BriefContent } from "@/variants/v5/workspace";
import { EmptyWorkspace } from "../shell";

export function Lineage({ data }: { data: WorkspaceData | null }) {
  const lineage = useLineage(data?.changes[0]?.id || "CE-0007", data);
  if (!data) return <EmptyWorkspace />;
  return <div className="d-grid gap-3">
    <div><h1 className="mb-1">Lineage</h1>
      <p className="text-soft mb-0">Select the {money(data.exposure.added_duty_usd)} total or any step to light up the path behind it: bulletin, rates, assumptions, decisions, parts, orders and products.</p></div>
    <div className="card"><div className="card-body">
      {lineage.error ? <div className="alert alert-warning mb-0">{lineage.error}</div>
        : !lineage.data ? <p className="text-soft mb-0" role="status">Loading the trace…</p>
        : <div className="legacy lineage-app"><LineageContent screen="exposure" data={data} graph={lineage.data} showPanel={false} /></div>}
    </div></div>
  </div>;
}

export function Brief({ data, reload }: { data: WorkspaceData | null; reload: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  if (!data) return <EmptyWorkspace />;
  async function exportPdf() {
    if (!data || busy) return;
    setBusy(true); setError("");
    try { const { downloadBrief } = await import("@/variants/v5/pdf"); await downloadBrief(data); }
    catch (err) { setError(err instanceof Error ? err.message : "The PDF could not be generated."); }
    finally { setBusy(false); }
  }
  return <div className="d-grid gap-3">
    <div className="d-flex justify-content-end gap-2 ks-no-print">
      <button className="btn btn-outline-secondary d-inline-flex gap-2 align-items-center" onClick={exportPdf} disabled={busy}>
        <Download aria-hidden="true" className="lucide" />{busy ? "Preparing PDF…" : "Download PDF"}</button>
      <button className="btn btn-outline-secondary d-inline-flex gap-2 align-items-center" onClick={() => window.print()}>
        <Printer aria-hidden="true" className="lucide" />Print</button>
    </div>
    {error && <div className="alert alert-danger" role="alert">{error}</div>}
    <div className="card"><div className="card-body p-0">
      <div className="legacy brief-app"><main className="brief-paper"><BriefContent data={data} reload={reload} /></main></div>
    </div></div>
  </div>;
}
