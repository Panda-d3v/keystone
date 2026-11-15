"use client";
import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Check, Inbox, Layers, RefreshCw } from "lucide-react";
import type { AuditEvent, Citation, SendActionResponse, WorkspaceData } from "@/lib/contracts";
import { screens, routeFor, type Screen } from "@/lib/routes";
import { actionTitle, atStake, date, money, words } from "@/lib/format";
import { useWorkspace } from "@/lib/use-workspace";
import { submitAction, useSubmissions } from "@/lib/submissions";
import { useFixtures } from "@/lib/data";
import { verifyAudit } from "@/lib/audit";
import sources from "@/lib/reference-sources.json";
import "./triage.css";

export default function TriageWorkspace({ screen }: { screen: Screen }) {
  const workspace = useWorkspace();
  return <div className="triage">
    <header className="triage-header">
      <Link className="brand" href="/"><Layers aria-hidden="true" />Keystone</Link>
      <span>MeridianFlow</span>
      <div className="row"><span className="status">{workspace.useFixtures ? "Fixture data" : "Live API"}</span><button onClick={workspace.reload}><RefreshCw aria-hidden="true" />Refresh</button></div>
    </header>
    <nav className="triage-nav" aria-label="Triage sections">
      {screens.map(item => <Link href={routeFor(4, item.id)} key={item.id} aria-current={screen === item.id ? "page" : undefined}>{item.label}</Link>)}
      <Link href="/versions">Design versions</Link>
    </nav>
    {workspace.error ? <main className="triage-error"><p role="alert">{workspace.error}</p><button onClick={workspace.reload}>Retry</button></main>
      : !workspace.data ? <main className="triage-error">
        {workspace.loading ? <p role="status">Loading triage…</p> : <>
          <h1>Start with a tariff bulletin</h1>
          <p>Upload the bulletin in Intake to see which requests need review.</p>
          <Link href={routeFor(1, "inbox")}>Go to Intake</Link>
        </>}
      </main>
      : <TriageQueue data={workspace.data} screen={screen} />}
    <footer className="triage-footer">Illustrative scenario. Section 232 layer only. Other duty layers are outside this demo.</footer>
  </div>;
}

function TriageQueue({ data, screen }: { data: WorkspaceData; screen: Screen }) {
  const submissions = useSubmissions(data.audit);
  const [completed, setCompleted] = useState<Record<string, SendActionResponse>>({});
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submitting = useRef(false);
  const outcomes = new Map(submissions.map(item => [item.actionId, item.response]));
  Object.entries(completed).forEach(([id, result]) => outcomes.set(id, result));
  const queue = data.actions.filter(action => !outcomes.has(action.id));
  const visible = queue.filter(action => `${action.type} ${action.part_ids.join(" ")}`.toLowerCase().includes(query.toLowerCase()));
  const action = visible[Math.min(selectedIndex, Math.max(0, visible.length - 1))];
  const canSubmit = screen === "inbox" || screen === "actions";
  useEffect(() => {
    if (!useFixtures) {
      const ids = new Set(data.audit.map(event => event.id));
      setCompleted(previous => Object.fromEntries(Object.entries(previous).filter(([, result]) => ids.has(result.audit_event.id))));
    }
  }, [data.audit]);

  async function submitSelected() {
    if (!action || submitting.current || !canSubmit) return;
    const draft = drafts[action.id] ?? action.draft_email;
    if (!draft.trim()) return;
    submitting.current = true;
    setBusy(true);
    setError("");
    try {
      const result = await submitAction(action.id, draft);
      setCompleted(previous => ({ ...previous, [action.id]: result }));
      setSelectedIndex(0);
    } catch (error) {
      setError(error instanceof Error ? error.message : "The request could not be submitted.");
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest("input, textarea, select, [contenteditable=true]") || event.metaKey || event.ctrlKey || event.altKey) return;
      const key = event.key.toLowerCase();
      if (["j", "arrowdown", "k", "arrowup"].includes(key)) {
        event.preventDefault();
        const direction = key === "j" || key === "arrowdown" ? 1 : -1;
        setSelectedIndex(index => Math.max(0, Math.min(visible.length - 1, index + direction)));
      }
      if (key === "e" && canSubmit) {
        event.preventDefault();
        void submitSelected();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  });

  return <div className="triage-split">
    <aside className="triage-queue" aria-label="Requests needing action">
      <div className="triage-queue-heading"><div className="row spread"><h1>Triage</h1><span>{queue.length} open</span></div>
        <label className="stack small">Filter requests<input value={query} onChange={event => { setQuery(event.target.value); setSelectedIndex(0); }} placeholder="Part or request" /></label>
      </div>
      <div className="triage-items">{visible.map((item, index) => <button className="triage-item" key={item.id} onClick={() => setSelectedIndex(index)} aria-current={action?.id === item.id ? "true" : undefined}>
        <span className="row spread"><strong>{actionTitle(item)}</strong><span>{money(item.usd_at_stake)}</span></span>
        <span className="code">{item.part_ids.join(", ")}</span>
      </button>)}</div>
      {!queue.length && <div className="triage-empty"><Check aria-hidden="true" /><h2>Queue cleared</h2><p>Submitted requests are awaiting approval.</p></div>}
      {!!queue.length && !visible.length && <p className="panel-body">No matching requests.</p>}
      <div className="triage-shortcuts"><span><kbd>J</kbd> Next</span><span><kbd>K</kbd> Previous</span><span><kbd>E</kbd> Submit</span></div>
    </aside>
    <main className="triage-detail">
      {canSubmit ? <>
        {action && <section className="triage-request">
          <div className="row spread"><div><p className="code muted">{action.id}</p><h2>{actionTitle(action)}</h2></div><span className="status">{atStake(action.usd_at_stake)}</span></div>
          {action.why && <p>{action.why}</p>}
          <p className="code">{action.part_ids.join(", ")}</p>
          <div className="triage-evidence-summary">{data.evidence.requirements?.filter(row => row.status !== "checked").map(row => <div key={row.id}><strong>{row.label}</strong><p>{row.reason}</p></div>)}</div>
          <label className="stack">Supplier request<textarea value={drafts[action.id] ?? action.draft_email} onChange={event => setDrafts(previous => ({ ...previous, [action.id]: event.target.value }))} disabled={busy} /></label>
          {error && <p role="alert" className="negative">{error}</p>}
          <div className="row"><button className="primary" onClick={submitSelected} disabled={busy || !(drafts[action.id] ?? action.draft_email).trim()}>{busy ? "Submitting…" : "Submit request"}<kbd>E</kbd></button><Link href={routeFor(4, "evidence")}>Review evidence</Link></div>
        </section>}
        {Array.from(outcomes.entries()).map(([id, result]) => <TriageApproval key={id} result={result} />)}
        {!action && !outcomes.size && <div className="triage-empty"><Inbox aria-hidden="true" /><h2>Select a request</h2></div>}
      </> : screen === "exposure" ? <TriageExposure data={data} />
        : screen === "decisions" ? <TriageDecisions data={data} outcomes={Array.from(outcomes.values())} />
        : screen === "evidence" ? <TriageEvidence data={data} />
        : <TriageAudit events={data.audit} />}
    </main>
  </div>;
}

function TriageApproval({ result }: { result: SendActionResponse }) {
  return <section className="triage-result" role="status"><div className="row"><Check aria-hidden="true" /><h2>Draft decision <span className="code">{result.decision_id}</span></h2></div><p>{words(result.state)}</p><h3>Pending approvals</h3><ul>{result.pending_approvals.map(approver => <li key={approver.id}>{approver.name}</li>)}</ul></section>;
}
function TriageExposure({ data }: { data: WorkspaceData }) {
  const exposure = data.exposure;
  return <div className="stack"><h1>Exposure</h1><dl className="summary">
    <div><dt>Affected parts</dt><dd>{exposure.affected_parts}</dd></div><div><dt>Open PO lines</dt><dd>{exposure.open_po_lines}</dd></div>
    <div><dt>Added duty</dt><dd>{money(exposure.added_duty_usd)}</dd></div><div><dt>Annualized added duty</dt><dd>{money(exposure.annualized_added_duty_usd)}</dd></div>
  </dl><div className="panel table-scroll"><table><thead><tr><th>PO</th><th>Part</th><th>Entry</th><th className="money">Added duty</th><th>Calculation</th></tr></thead><tbody>{exposure.lines.map(line => <tr key={`${line.po_id}-${line.line_no}`}><td className="code">{line.po_id}</td><td className="code">{line.part_no}</td><td>{date(line.est_entry_date)}</td><td className="money">{money(line.added_duty_usd, 2)}</td><td><details><summary>Show math</summary><p>{line.math || "Calculation details unavailable."}</p></details></td></tr>)}</tbody></table></div></div>;
}
function TriageDecisions({ data, outcomes }: { data: WorkspaceData; outcomes: SendActionResponse[] }) {
  return <div className="stack"><h1>Decisions</h1>{data.decisions.map(decision => <section className="panel" key={decision.decision_id}><div className="panel-header"><h2 className="code">{decision.decision_id}</h2><span className="status bad">{words(decision.status)}</span></div><div className="panel-body stack"><p>{decision.reason}</p><dl className="key-value"><dt>Incumbent at new rate</dt><dd>{money(decision.incumbent_annual_usd)}</dd><dt>Alternative with proof</dt><dd>{money(decision.alternative_with_proof_annual_usd)}</dd><dt>Alternative without proof</dt><dd>{money(decision.alternative_without_proof_annual_usd)}</dd></dl><Link href={routeFor(4, "evidence")}>Inspect the evidence</Link></div></section>)}{outcomes.map(result => <TriageApproval key={result.decision_id} result={result} />)}</div>;
}
function TriageEvidence({ data }: { data: WorkspaceData }) {
  const [selected, setSelected] = useState<Citation | null>(null);
  const source = selected ? (sources as Record<string, { original: string }>)[selected.doc_id] : null;
  const base = (process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000").replace(/\/$/, "");
  const url = useFixtures ? source?.original : selected && `${base}/documents/${encodeURIComponent(selected.doc_id)}`;
  return <div className="stack"><h1>Evidence</h1><p className="code">{data.evidence.supplier_id} / {data.evidence.part_no}</p>
    <section className="triage-checklist">{data.evidence.requirements?.map(row => <article key={row.id}>
      <div className="row spread"><h2>{row.label}</h2><span className={`status ${row.status === "checked" ? "good" : "warn"}`}>{words(row.status)}</span></div>
      {row.reason && <p>{row.reason}</p>}{row.citations?.length ? <button onClick={() => setSelected(row.citations![0])}>View source</button> : null}
    </article>)}</section>
    {selected && <section className="panel"><div className="panel-header"><h2>Source evidence</h2>{url && <a className="button" href={`${url}#page=${selected.page}`} target="_blank" rel="noreferrer">Open original</a>}</div><div className="panel-body stack"><p className="code">{selected.doc_id}</p><p>Page {selected.page}</p>{selected.quote && <blockquote className="source-quote">{selected.quote}</blockquote>}
      {url && source?.original.endsWith(".jpg") && <div className="triage-scan"><img src={url} alt="Supplier certificate" /><div role="img" aria-label="Highlighted source region" style={{ left: `${selected.bbox[0] * 100}%`, top: `${selected.bbox[1] * 100}%`, width: `${(selected.bbox[2] - selected.bbox[0]) * 100}%`, height: `${(selected.bbox[3] - selected.bbox[1]) * 100}%` }} /></div>}
    </div></section>}
  </div>;
}
function TriageAudit({ events }: { events: AuditEvent[] }) {
  const [result, setResult] = useState("");
  async function verify() {
    setResult("Verifying…");
    try { const checked = await verifyAudit(events); setResult(`${checked.valid ? "Chain verified" : "Verification failed"}. ${checked.reason}`); }
    catch { setResult("Verification could not run in this browser."); }
  }
  return <div className="stack"><div className="row spread"><h1>Audit log</h1><button onClick={verify}>Verify audit chain</button></div>{result && <p role="status" className="notice">{result}</p>}<div className="panel table-scroll"><table><thead><tr><th>Time (UTC)</th><th>Event</th><th>Entity</th><th>Hash</th></tr></thead><tbody>{[...events].sort((a, b) => b.occurred_at.localeCompare(a.occurred_at)).map(event => <tr key={event.id}><td>{event.occurred_at.replace("T", " ").replace("Z", "")}</td><td>{words(event.type)}</td><td className="code">{event.entity_id}</td><td className="code">{event.hash.slice(0, 12)}</td></tr>)}</tbody></table></div></div>;
}
