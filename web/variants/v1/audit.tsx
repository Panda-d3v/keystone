"use client";
import { useEffect, useRef, useState } from "react";
import type { WorkspaceData } from "@/lib/contracts";
import { words } from "@/lib/format";
import { verifyAudit } from "@/lib/audit";

export function Audit({ data }: { data: WorkspaceData }) {
  const [query, setQuery] = useState("");
  const [eventType, setEventType] = useState("");
  const [verification, setVerification] = useState<{ valid: boolean; reason: string } | null>(null);
  const [verifying, setVerifying] = useState(false);
  const currentAudit = useRef(data.audit);
  useEffect(() => {
    currentAudit.current = data.audit;
    setVerification(null);
    setVerifying(false);
  }, [data.audit]);
  const events = [...data.audit].sort((a, b) => b.occurred_at.localeCompare(a.occurred_at)).filter(event =>
    (!eventType || event.type === eventType) && `${event.type} ${event.actor} ${event.entity_id}`.toLowerCase().includes(query.toLowerCase()),
  );
  async function checkChain() {
    setVerifying(true);
    const checkedAudit = data.audit;
    try {
      const result = await verifyAudit(checkedAudit);
      if (currentAudit.current === checkedAudit) setVerification(result);
    }
    catch { setVerification({ valid: false, reason: "Verification could not run in this browser." }); }
    finally { setVerifying(false); }
  }
  function exportEvents() {
    const url = URL.createObjectURL(new Blob([JSON.stringify(events, null, 2)], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "keystone-audit.json";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return <div className="stack">
    <div className="row spread"><div className="row"><button onClick={checkChain} disabled={verifying}>{verifying ? "Verifying…" : "Verify audit chain"}</button><span className="muted small">{data.audit.length} events</span></div><button onClick={exportEvents}>Export filtered events</button></div>
    {verification && <div role="status" className={`notice ${verification.valid ? "positive" : "negative"}`}><strong>{verification.valid ? "Chain verified" : "Verification failed"}</strong><p>{verification.reason}</p></div>}
    <section className="panel">
      <div className="panel-header"><h2>Audit events</h2><div className="row">
        <label>Event type <select value={eventType} onChange={event => setEventType(event.target.value)}><option value="">All types</option>{Array.from(new Set(data.audit.map(event => event.type))).sort().map(type => <option key={type} value={type}>{words(type)}</option>)}</select></label>
        <label className="row">Filter events<input value={query} onChange={event => setQuery(event.target.value)} placeholder="Type, actor, or entity" /></label>
      </div></div>
      <div className="table-scroll"><table><thead><tr><th>Event</th><th>Time (UTC)</th><th>Actor</th><th>Entity</th><th>Hash</th></tr></thead>
        <tbody>{events.map(event => <tr key={event.id}>
          <td>{words(event.type)}</td><td>{event.occurred_at.replace("T", " ").replace("Z", "")}</td><td>{event.actor}</td><td className="code">{event.entity_id}</td>
          <td><details><summary className="code">{event.hash.slice(0, 12)}</summary><p className="code">{event.hash}</p><p className="code">Previous {event.previous_hash || "Genesis"}</p></details></td>
        </tr>)}{!events.length && <tr><td colSpan={5}>No matching events.</td></tr>}</tbody>
      </table></div>
    </section>
  </div>;
}
