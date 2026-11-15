"use client";
import { useMemo, useState } from "react";
import { ShieldCheck } from "lucide-react";
import type { WorkspaceData } from "@/lib/contracts";
import { verifyAudit } from "@/lib/audit";
import { actorName, sentence } from "../names";
import { EmptyWorkspace, PageHead } from "../shell";

const when = (iso: string) => new Intl.DateTimeFormat("en-US", {
  month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "UTC", timeZoneName: "short",
}).format(new Date(iso));

export function Audit({ data }: { data: WorkspaceData | null }) {
  const [result, setResult] = useState<{ valid: boolean; reason: string } | null>(null);
  const [query, setQuery] = useState("");
  const events = useMemo(() => [...(data?.audit ?? [])].sort((a, b) => b.occurred_at.localeCompare(a.occurred_at)), [data]);
  if (!data) return <><PageHead title="Audit log" /><EmptyWorkspace /></>;
  const q = query.trim().toLowerCase();
  const shown = events.filter(e => !q || `${actorName(e.actor)} ${e.type} ${e.entity_id}`.toLowerCase().includes(q));
  return <div className="d-grid gap-4">
    <PageHead title="Audit log"
      actions={<button className="btn btn-outline-primary" onClick={async () => setResult(await verifyAudit(data.audit))}>
        <ShieldCheck aria-hidden="true" className="lucide" />Verify the chain</button>}>
      Every system and user step, each hashed and linked to the one before.
    </PageHead>
    {result && <div className={`alert mb-0 ${result.valid ? "alert-success" : "alert-danger"}`} role="status">
      {result.valid ? `All ${data.audit.length} events are intact and in order.` : result.reason}</div>}
    <div className="card">
      <div className="card-header d-flex justify-content-between align-items-center flex-wrap gap-2">
        <span>{events.length} events</span>
        <input className="form-control form-control-sm w-auto" placeholder="Who, what or which record" aria-label="Filter events"
          value={query} onChange={event => setQuery(event.target.value)} />
      </div>
      <div className="table-responsive"><table className="table table-hover align-middle">
        <thead><tr><th>When</th><th>Who</th><th>What</th><th>Record</th><th>Fingerprint</th></tr></thead>
        <tbody>{shown.map(e => <tr key={e.id}>
          <td className="text-nowrap">{when(e.occurred_at)}</td>
          <td>{actorName(e.actor)}</td>
          <td>{sentence(e.type)}</td>
          <td className="code">{e.entity_id}</td>
          <td className="code text-soft" title={e.hash}>{e.hash.slice(0, 10)}…</td>
        </tr>)}</tbody>
      </table></div>
    </div>
  </div>;
}
