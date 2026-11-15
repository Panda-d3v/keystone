"use client";
import { useState } from "react";
import { Send } from "lucide-react";
import type { Action, SendActionResponse, WorkspaceData } from "@/lib/contracts";
import { actionTitle, money } from "@/lib/format";
import { submitAction, useSubmissions, type Submission } from "@/lib/submissions";
import { supplierName } from "../names";
import { EmptyWorkspace } from "../shell";

export function Actions({ data }: { data: WorkspaceData | null }) {
  const submissions = useSubmissions(data?.audit ?? []);
  if (!data) return <EmptyWorkspace />;
  const current = new Set(data.actions.map(action => action.id));
  const done = submissions.filter(item => !current.has(item.actionId));
  return <div className="d-grid gap-4">
    <div><h1 className="mb-1">Actions</h1>
      <p className="text-soft mb-0">Requests drafted from the evidence gaps, ranked by dollars at stake. Edit before you submit.</p></div>
    {[...data.actions].sort((a, b) => a.rank - b.rank).map(action =>
      <ActionCard key={action.id} action={action} saved={submissions.find(item => item.actionId === action.id)}
        supplier={supplierName(data.evidence.supplier_id)} />)}
    {done.map(item => <Approval key={item.actionId} result={item.response} />)}
    {!data.actions.length && !done.length && <div className="card"><div className="card-body text-soft">Nothing needs a request right now.</div></div>}
  </div>;
}

function ActionCard({ action, saved, supplier }: { action: Action; saved?: Submission; supplier: string }) {
  const [draft, setDraft] = useState(action.draft_email);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<SendActionResponse | undefined>(saved?.response);
  const accepted = result ?? saved?.response;
  async function submit() {
    if (busy || accepted) return;
    setBusy(true); setError("");
    try { setResult(await submitAction(action.id, draft)); }
    catch (err) { setError(err instanceof Error ? err.message : "The request could not be submitted."); }
    finally { setBusy(false); }
  }
  return <article className="card">
    <div className="card-header d-flex justify-content-between align-items-start gap-3 flex-wrap">
      <span>{actionTitle(action)}</span>
      <span className="badge rounded-pill text-bg-primary">{money(action.usd_at_stake)} a year at stake</span>
    </div>
    <div className="card-body d-grid gap-3">
      {action.why && <p className="mb-0">{action.why}</p>}
      <label className="form-label mb-0">
        <span className="small text-soft d-block mb-1">Email to {supplier}</span>
        <textarea className="form-control" rows={10} value={accepted ? saved?.draftEmail ?? draft : draft}
          disabled={busy || !!accepted} onChange={event => setDraft(event.target.value)} aria-label={`Supplier request ${action.id}`} />
      </label>
      {error && <div className="alert alert-danger mb-0" role="alert">{error}</div>}
      {accepted ? <Approval result={accepted} /> : <div className="d-flex align-items-center gap-3 flex-wrap">
        <button className="btn btn-primary d-inline-flex gap-2 align-items-center" disabled={busy || !draft.trim()} onClick={submit}>
          <Send aria-hidden="true" className="lucide" />{busy ? "Submitting…" : "Submit for approval"}</button>
        <span className="small text-soft">Creates a draft decision; the approvers review it before anything is sent.</span>
      </div>}
    </div>
  </article>;
}

function Approval({ result }: { result: SendActionResponse }) {
  return <div className="alert alert-success mb-0" role="status">
    <strong>Submitted.</strong> Draft decision <span className="code">{result.decision_id}</span> is waiting for{" "}
    {result.pending_approvals.map(item => item.name).join(" and ")}. Recorded in the audit log as <span className="code">{result.audit_event.id}</span>.
  </div>;
}
