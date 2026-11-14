"use client";
import { useState } from "react";
import type { Action, SendActionResponse, WorkspaceData } from "@/lib/contracts";
import { money, words } from "@/lib/format";
import { submitAction, useSubmissions } from "@/lib/submissions";

export function ApprovalResult({ result }: { result: SendActionResponse }) {
  return <section className="notice stack" role="status">
    <div><h3>Draft decision <span className="code">{result.decision_id}</span></h3><p>{words(result.state)}</p></div>
    <div><h3>Pending approvals</h3><ul>{result.pending_approvals.map(approver => <li key={approver.id}>{approver.name}</li>)}</ul></div>
    <p className="small">Recorded as audit event <span className="code">{result.audit_event.id}</span>.</p>
  </section>;
}
export function Actions({ data }: { data: WorkspaceData }) {
  const submissions = useSubmissions(data.audit);
  const currentIds = new Set(data.actions.map(action => action.id));
  return <div className="stack">
    {[...data.actions].sort((a, b) => a.rank - b.rank).map(action => <ActionEditor
      key={action.id} action={action} saved={submissions.find(item => item.actionId === action.id)?.response} />)}
    {submissions.filter(item => !currentIds.has(item.actionId)).map(item => <ApprovalResult key={item.actionId} result={item.response} />)}
    {!data.actions.length && !submissions.length && <p>No actions need review.</p>}
  </div>;
}
function ActionEditor({ action, saved }: { action: Action; saved?: SendActionResponse }) {
  const [draft, setDraft] = useState(action.draft_email);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<SendActionResponse | undefined>(saved);
  const [error, setError] = useState("");
  const accepted = result || saved;
  async function submit() {
    if (sending || accepted) return;
    setSending(true);
    setError("");
    try { setResult(await submitAction(action.id, draft)); }
    catch (error) { setError(error instanceof Error ? error.message : "The request could not be submitted."); }
    finally { setSending(false); }
  }
  return <section className="panel">
    <div className="panel-header"><h2>{action.rank}. {words(action.type)}</h2><span className="status">{money(action.usd_at_stake)} at stake</span></div>
    <div className="panel-body stack">
      <p className="code">{action.part_ids.join(", ")}</p>
      <label className="stack">Supplier request<textarea aria-label={`Supplier request ${action.id}`} value={draft} disabled={sending || !!accepted} onChange={event => setDraft(event.target.value)} /></label>
      {error && <p role="alert" className="negative">{error}</p>}
      {accepted ? <ApprovalResult result={accepted} /> : <div className="row"><button className="primary" disabled={sending || !draft.trim()} onClick={submit}>{sending ? "Submitting…" : "Submit request"}</button><span className="muted small">Creates a draft decision for approval.</span></div>}
    </div>
  </section>;
}
