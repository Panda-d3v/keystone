"use client";
import React, { useRef, useState } from "react";
import Link from "next/link";
import { Layers, Printer, RefreshCw } from "lucide-react";
import { useWorkspace } from "@/lib/use-workspace";
import { routeFor, screens, type Screen } from "@/lib/routes";
import type { Action, Citation, SendActionResponse, WorkspaceData } from "@/lib/contracts";
import { actionTitle, atStake, date, money, percent, words } from "@/lib/format";
import { referenceUrl } from "@/lib/reference";
import { submitAction, useSubmissions, type Submission } from "@/lib/submissions";
import { verifyAudit } from "@/lib/audit";
import "./entry.css";

export default function EntryWorkspace({ screen }: { screen: Screen }) {
  const { data, error, loading, reload, useFixtures } = useWorkspace();
  return <div className="entry-sheet">
    <header className="entry-top"><Link className="brand" href="/"><Layers aria-hidden="true"/>Keystone</Link><div className="row"><span className="status">{useFixtures ? "Fixture data" : "Live API"}</span><button onClick={reload}><RefreshCw aria-hidden="true"/>Refresh</button><button onClick={() => window.print()}><Printer aria-hidden="true"/>Print sheet</button></div></header>
    <main className="entry-paper">
      <div className="entry-heading"><div><h1>Entry sheet</h1><p>MeridianFlow procurement</p></div><div><p className="code">{data?.changes[0]?.id || "Change pending"}</p><Link href="/versions">Compare versions</Link></div></div>
      <nav className="entry-tabs" aria-label="Entry sheet sections">{screens.map(item => <Link href={routeFor(2, item.id)} key={item.id} aria-current={item.id === screen ? "page" : undefined}>{item.id === "exposure" ? "Duty bill" : item.label}</Link>)}</nav>
      {error ? <div className="entry-section" role="alert"><p>{error}</p><button onClick={reload}>Retry</button></div>
        : !data ? <section className="entry-section">
          {loading ? <p role="status">Loading entry sheet…</p> : <>
            <h2>Start with a tariff bulletin</h2>
            <p>Upload the bulletin in Intake to see the previous and revised duty bills.</p>
            <Link href={routeFor(1, "inbox")}>Go to Intake</Link>
          </>}
        </section>
        : <EntryContent screen={screen} data={data}/>}
      <footer className="entry-scenario">Illustrative MeridianFlow scenario. Section 232 layer only. Other duty layers are outside this demo.</footer>
    </main>
  </div>;
}

function EntryContent({ screen, data }: { screen: Screen; data: WorkspaceData }) {
  const change = data.changes[0];
  const [citation, setCitation] = useState<Citation | null>(null);
  const fields = change ? [
    { label: "Change reference", key: "measure", value: change.measure },
    { label: "Effective date", key: "effective_date", value: date(change.effective_date) },
    { label: "Affected headings", key: "hts_scope", value: change.hts_scope.join(", ") },
    { label: "Previous rate", key: "old_rate", value: percent(change.old_rate) },
    { label: "Revised rate", key: "new_rate", value: percent(change.new_rate) },
    { label: "Assessment basis", key: "basis", value: words(change.basis) },
  ] : [];
  return <>
    <div className="entry-fields">{fields.map((field, index) => <button className={field.key === "new_rate" ? "entry-field changed" : "entry-field"} key={field.key} aria-label={`Inspect ${field.label.toLowerCase()}`} onClick={() => setCitation(change.field_citations?.[field.key]?.[0] || null)}>
      <span className="entry-field-label">{index + 1}. {field.label}</span><strong>{field.value}</strong>
    </button>)}</div>
    {citation && <section className="entry-source" aria-label="Field source"><div className="row spread"><h2>Source record</h2><button onClick={() => setCitation(null)}>Close</button></div><p className="code">{citation.doc_id}, page {citation.page}</p>{citation.quote && <blockquote>{citation.quote}</blockquote>}{referenceUrl(citation) && <a href={referenceUrl(citation)} target="_blank" rel="noreferrer">Open cited page</a>}</section>}
    {screen === "inbox" && <section className="entry-section"><h2>Review the notice</h2><p>Select a numbered field to inspect its supporting sentence. The revised rate applies to the article’s full customs value.</p><div className="row"><Link className="button primary" href={routeFor(2, "exposure")}>Review duty bill</Link><Link href={routeFor(2, "evidence")}>Review evidence requirements</Link></div></section>}
    {screen === "exposure" && <DutyBill data={data}/>}
    {screen === "decisions" && <EntryDecisions data={data}/>}
    {screen === "evidence" && <EntryEvidence data={data} onSource={setCitation}/>}
    {screen === "actions" && <EntryActions data={data}/>}
    {screen === "audit" && <EntryAudit data={data}/>}
  </>;
}

function DutyBill({ data }: { data: WorkspaceData }) {
  const exposure = data.exposure;
  const [filter, setFilter] = useState("");
  const rows = exposure.lines.map((line, index) => ({ line, entryNumber: index + 1 })).filter(({ line }) => `${line.po_id} ${line.part_no}`.toLowerCase().includes(filter.toLowerCase()));
  return <section>
    <div className="entry-section row spread"><div><h2>Duty bill</h2><p>{exposure.affected_parts} affected parts. {exposure.open_po_lines} qualifying PO lines.</p></div><label>Find a PO or part <input value={filter} onChange={event => setFilter(event.target.value)}/></label></div>
    <div className="entry-table-scroll"><table><thead><tr><th>Line</th><th>PO / part</th><th>Entry date</th><th className="money">Customs value</th><th className="money">Previous duty</th><th className="money changed">Revised duty</th><th className="money">Added duty</th></tr></thead><tbody>
      {rows.map(({ line, entryNumber }) => <tr key={`${line.po_id}-${line.line_no}`}><td>{entryNumber}</td><td><span className="code">{line.po_id}</span><br/><span className="code">{line.part_no}</span><details><summary>Show math</summary><p>{line.math || "Calculation details unavailable."}</p></details></td><td>{date(line.est_entry_date)}</td><td className="money">{money(line.customs_value_usd, 2)}</td><td className="money">{line.old_duty_usd == null ? "Unavailable" : money(line.old_duty_usd, 2)}</td><td className="money changed">{line.new_duty_usd == null ? "Unavailable" : money(line.new_duty_usd, 2)}</td><td className="money">{money(line.added_duty_usd, 2)}</td></tr>)}
      {!rows.length && <tr><td colSpan={7}>No matching entry lines.</td></tr>}
    </tbody></table></div>
    <div className="entry-bill-footer"><div><span>Added duty on all qualifying lines</span><strong>{money(exposure.added_duty_usd)}</strong></div><div><span>Annualized at current build rates</span><strong>{money(exposure.annualized_added_duty_usd)}</strong></div></div>
  </section>;
}
function EntryDecisions({ data }: { data: WorkspaceData }) {
  const submissions = useSubmissions(data.audit);
  return <section className="entry-section stack"><h2>Decision review</h2>{data.decisions.map(decision => <article className="entry-decision stack" key={decision.decision_id}>
    <div className="row spread"><h3 className="code">{decision.decision_id}</h3><span className="status bad">{words(decision.status)}</span></div><p>{decision.reason}</p>
    <div className="entry-table-scroll"><table><thead><tr><th>Option</th><th className="money">Annual landed cost</th><th className="money">Change against incumbent</th></tr></thead><tbody>
      <tr><td>Incumbent before change</td><td className="money">{decision.incumbent_before_annual_usd == null ? "Unavailable" : money(decision.incumbent_before_annual_usd)}</td><td/></tr>
      <tr><td>Incumbent after change</td><td className="money changed">{money(decision.incumbent_annual_usd)}</td><td/></tr>
      <tr><td>Alternative with proof</td><td className="money">{money(decision.alternative_with_proof_annual_usd)}</td><td className="money positive">{decision.alternative_with_proof_delta_usd == null ? "Unavailable" : money(decision.alternative_with_proof_delta_usd)}</td></tr>
      <tr><td>Alternative without proof</td><td className="money">{money(decision.alternative_without_proof_annual_usd)}</td><td className="money negative">{decision.alternative_without_proof_delta_usd == null ? "Unavailable" : `+${money(decision.alternative_without_proof_delta_usd)}`}</td></tr>
    </tbody></table></div><Link href={routeFor(2, "evidence")}>Check the alternative’s evidence</Link>
  </article>)}{submissions.map(item => <EntryApproval key={item.actionId} result={item.response}/>)}</section>;
}
function EntryEvidence({ data, onSource }: { data: WorkspaceData; onSource: (citation: Citation) => void }) {
  return <section className="entry-section stack"><h2>Supporting documentation</h2><p className="code">{data.evidence.supplier_id} / {data.evidence.part_no}</p><div className="entry-table-scroll"><table><thead><tr><th>Requirement</th><th>Status</th><th>Finding</th><th>Source</th></tr></thead><tbody>{data.evidence.requirements?.map(row => <tr key={row.id}><td>{row.label}<br/><small className="code">{row.id}</small></td><td><span className={`status ${row.status === "checked" ? "good" : "warn"}`}>{words(row.status)}</span></td><td>{row.reason || "Requirement satisfied."}</td><td>{row.citations?.length ? <button onClick={() => onSource(row.citations![0])}>Inspect source</button> : "Awaiting document"}</td></tr>)}</tbody></table></div><Link className="button" href={routeFor(2, "actions")}>Prepare supplier request</Link></section>;
}
function EntryApproval({ result }: { result: SendActionResponse }) {
  return <section className="entry-approval" role="status"><h3>Draft decision <span className="code">{result.decision_id}</span></h3><p>{words(result.state)}</p><h3>Pending approvals</h3><ul>{result.pending_approvals.map(approver => <li key={approver.id}>{approver.name}</li>)}</ul></section>;
}
function EntryActions({ data }: { data: WorkspaceData }) {
  const submissions = useSubmissions(data.audit);
  return <section className="entry-section stack"><h2>Supplier requests</h2>{data.actions.map(action => <EntryRequest key={action.id} action={action} saved={submissions.find(item => item.actionId === action.id)}/>)}{submissions.filter(item => !data.actions.some(action => action.id === item.actionId)).map(item => <EntryApproval key={item.actionId} result={item.response}/>)}{!data.actions.length && !submissions.length && <p>No requests need review.</p>}</section>;
}
function EntryRequest({ action, saved }: { action: Action; saved?: Submission }) {
  const [draft, setDraft] = useState(action.draft_email);
  const [result, setResult] = useState<SendActionResponse>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const guard = useRef(false);
  const accepted = result || saved?.response;
  async function submit() {
    if (guard.current || accepted) return;
    guard.current = true; setBusy(true); setError("");
    try { setResult(await submitAction(action.id, draft)); }
    catch (error) { setError(error instanceof Error ? error.message : "Submission failed."); }
    finally { guard.current = false; setBusy(false); }
  }
  return <article className="entry-decision stack"><div className="row spread"><h3>{actionTitle(action)}</h3><strong>{atStake(action.usd_at_stake)}</strong></div>{action.why && <p>{action.why}</p>}<p className="code">{action.part_ids.join(", ")}</p><label className="stack">Supplier request<textarea value={accepted ? saved?.draftEmail ?? draft : draft} disabled={!!accepted || busy} onChange={event => setDraft(event.target.value)}/></label>{error && <p role="alert" className="negative">{error}</p>}{accepted ? <EntryApproval result={accepted}/> : <button className="primary" disabled={busy || !draft.trim()} onClick={submit}>{busy ? "Submitting…" : "Submit request"}</button>}</article>;
}
function EntryAudit({ data }: { data: WorkspaceData }) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  async function verify() {
    try { const result = await verifyAudit(data.audit); setStatus(`${result.valid ? "Chain verified" : "Verification failed"}. ${result.reason}`); }
    catch { setStatus("Verification could not run in this browser."); }
  }
  return <section className="entry-section stack"><div className="row spread"><h2>Audit record</h2><button onClick={verify}>Verify audit chain</button></div>{status && <p role="status">{status}</p>}<label>Filter audit records <input value={query} onChange={event => setQuery(event.target.value)}/></label><div className="entry-table-scroll"><table><thead><tr><th>Time (UTC)</th><th>Event</th><th>Entity</th><th>Hash</th></tr></thead><tbody>{[...data.audit].sort((a, b) => b.occurred_at.localeCompare(a.occurred_at)).filter(event => `${event.type} ${event.entity_id}`.includes(query)).map(event => <tr key={event.id}><td>{event.occurred_at.replace("T", " ").replace("Z", "")}</td><td>{words(event.type)}</td><td className="code">{event.entity_id}</td><td className="code">{event.hash.slice(0, 12)}</td></tr>)}</tbody></table></div></section>;
}
