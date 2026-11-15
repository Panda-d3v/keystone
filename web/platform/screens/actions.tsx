"use client";
// Sourcing: supplier requests drafted from the gaps. Maya submits them; the
// approver approves or declines on the Decision brief.
import { useState } from "react";
import { Send } from "lucide-react";
import type { Action, WorkspaceData } from "@/lib/contracts";
import { actionTitle, money } from "@/lib/format";
import { ACTION_SUPPLIERS } from "../catalog";
import { supplierName } from "../names";
import { EmptyWorkspace, PageHead, type PlatformContext } from "../shell";

const when = (iso: string) => new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(iso));

export function Actions({ data, outcomes, record }: { data: WorkspaceData | null } & Pick<PlatformContext, "outcomes" | "record">) {
  if (!data) return <><PageHead title="Supplier requests" /><EmptyWorkspace /></>;
  const decided = outcomes.filter(o => o.kind !== "submitted");
  return <div className="d-grid gap-4">
    <PageHead title="Supplier requests">Drafted from the evidence gaps and the cost impact, largest saving first. Edit the email, then submit it for approval.</PageHead>
    {[...data.actions].sort((a, b) => a.rank - b.rank).map(action =>
      <ActionCard key={action.id} action={action} submitted={outcomes.find(o => o.actionId === action.id && o.kind === "submitted")} record={record} />)}
    {decided.length > 0 && <section className="card">
      <div className="card-header">Decided</div>
      <ul className="ks-list">{decided.map(o => <li key={o.event.id}>
        <span><span className="d-block fw-medium">{o.actionId}, {supplierName(ACTION_SUPPLIERS[o.actionId] ?? "")}</span>
          <span className="meta">{o.kind === "approved" ? "Approved and sent" : "Declined"} by Elena Park, {when(o.event.occurred_at)}</span></span>
        <span className={`chip ${o.kind === "approved" ? "chip-good" : "chip-neutral"}`}>{o.kind === "approved" ? "Sent" : "Declined"}</span>
      </li>)}</ul>
    </section>}
    {!data.actions.length && !decided.length && <div className="card"><div className="card-body text-soft">Nothing needs a request right now.</div></div>}
  </div>;
}

function ActionCard({ action, submitted, record }: { action: Action; submitted?: PlatformContext["outcomes"][number] } & Pick<PlatformContext, "record">) {
  const [draft, setDraft] = useState(submitted?.draftEmail ?? action.draft_email);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const supplier = supplierName(ACTION_SUPPLIERS[action.id] ?? "");
  async function submit() {
    if (busy || submitted) return;
    setBusy(true); setError("");
    try { await record(action.id, "submitted", draft); }
    catch (err) { setError(err instanceof Error ? err.message : "The request could not be submitted."); }
    finally { setBusy(false); }
  }
  return <article className="card">
    <div className="card-header d-flex justify-content-between align-items-start gap-3 flex-wrap">
      <span>{actionTitle(action)}</span>
      <span className="chip chip-accent">{money(action.usd_at_stake)} a year at stake</span>
    </div>
    <div className="card-body d-grid gap-3">
      {action.why && <p className="mb-0">{action.why}</p>}
      <label className="form-label mb-0">
        <span className="small text-soft d-block mb-1">Email to {supplier}</span>
        <textarea className="form-control" rows={9} value={draft} disabled={busy || !!submitted}
          onChange={event => setDraft(event.target.value)} aria-label={`Supplier request ${action.id}`} />
      </label>
      {error && <div className="alert alert-danger mb-0" role="alert">{error}</div>}
      {submitted ? <div className="alert alert-info mb-0" role="status">
        <strong>Submitted {when(submitted.event.occurred_at)}.</strong> Waiting for Elena Park to approve. Recorded in the audit log as <span className="code">{submitted.event.id}</span>.
      </div> : <div className="d-flex align-items-center gap-3 flex-wrap">
        <button className="btn btn-primary" disabled={busy || !draft.trim()} onClick={submit}>
          <Send aria-hidden="true" className="lucide" />{busy ? "Submitting…" : "Submit for approval"}</button>
        <span className="small text-soft">Nothing goes to the supplier until the approver signs off.</span>
      </div>}
    </div>
  </article>;
}
