"use client";
// The two specialist views. Lineage reuses the React Flow graph, restyled to
// match. The Brief is built natively here so it looks like the rest of the
// platform; its PDF export still comes from the Brief version's renderer.
import { useState } from "react";
import { Check, Download, Printer, X } from "lucide-react";
import type { Action, DeclineActionResponse, SendActionResponse, WorkspaceData } from "@/lib/contracts";
import { actionTitle, money } from "@/lib/format";
import { useLineage } from "@/lib/use-lineage";
import { declineAction, submitAction, useDeclines, useSubmissions } from "@/lib/submissions";
import { LineageContent } from "@/variants/v3/workspace";
import { supplierName } from "../names";
import { changeHeadline, decisionStory } from "../story";
import { EmptyWorkspace, PageHead } from "../shell";

export function Lineage({ data }: { data: WorkspaceData | null }) {
  const lineage = useLineage(data?.changes[0]?.id || "CE-0007", data);
  if (!data) return <EmptyWorkspace />;
  return <div>
    <PageHead eyebrow={`Change ${data.exposure.change_id}`} title="Lineage">
      Select the {money(data.exposure.added_duty_usd)} total or any step to light up the path behind it:
      bulletin, rates, assumptions, decisions, parts, orders and products.
    </PageHead>
    <section className="ks-kpis mb-3" aria-label="Totals">
      <div className="ks-kpi"><div className="label">Added duty, open orders</div><div className="value accent">{money(data.exposure.added_duty_usd)}</div></div>
      <div className="ks-kpi"><div className="label">Added duty per year</div><div className="value">{money(data.exposure.annualized_added_duty_usd)}</div></div>
      <div className="ks-kpi"><div className="label">Order lines</div><div className="value">{data.exposure.open_po_lines}</div></div>
      <div className="ks-kpi"><div className="label">Parts</div><div className="value">{data.exposure.affected_parts}</div></div>
    </section>
    <div className="card"><div className="card-body">
      {lineage.error ? <div className="alert alert-warning mb-0">{lineage.error}</div>
        : !lineage.data ? <p className="text-soft mb-0" role="status">Loading the trace…</p>
        : <div className="legacy lineage-app"><LineageContent screen="exposure" data={data} graph={lineage.data} showPanel={false} /></div>}
    </div></div>
  </div>;
}

const signed = (value: number) => `${value < 0 ? "−" : "+"}${money(Math.abs(value))}`;
const REQUIREMENT_CHIP: Record<string, [string, string]> = {
  checked: ["Proven", "chip-good"], needs_review: ["Unreadable", "chip-warn"],
  mismatch: ["Doesn't match", "chip-bad"], missing: ["Missing", "chip-neutral"],
};

export function Brief({ data }: { data: WorkspaceData | null }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  if (!data) return <EmptyWorkspace />;
  const change = data.changes[0];
  const decision = data.decisions[0];
  const story = decision ? decisionStory(decision, change, data.evidence) : null;
  const action = [...data.actions].sort((a, b) => a.rank - b.rank)[0];

  async function exportPdf() {
    if (!data || busy) return;
    setBusy(true); setError("");
    try { const { downloadBriefPdf } = await import("../brief-pdf"); await downloadBriefPdf(data); }
    catch (err) { setError(err instanceof Error ? err.message : "The PDF could not be generated."); }
    finally { setBusy(false); }
  }

  return <div className="ks-brief">
    <PageHead eyebrow={`Decision brief · ${change?.id ?? ""}`}
      title={story ? `The ${story.title.toLowerCase()} needs your decision` : "Decision brief"}
      actions={<>
        <button className="btn btn-quiet" onClick={exportPdf} disabled={busy}><Download aria-hidden="true" className="lucide" />{busy ? "Preparing…" : "Download PDF"}</button>
        <button className="btn btn-quiet" onClick={() => window.print()}><Printer aria-hidden="true" className="lucide" />Print</button>
      </>}>
      {story ? `${story.broke} ${story.verdict}` : "No supplier decision is affected."}
    </PageHead>
    {error && <div className="alert alert-danger" role="alert">{error}</div>}

    <div className="ks-brief-grid">
    <div>
    {change && <section aria-labelledby="b-changed">
      <div className="eyebrow">01 · What changed</div>
      <h2 id="b-changed">{changeHeadline(change)}</h2>
      <p className="mb-0">It reaches {data.exposure.affected_parts} parts across {data.exposure.open_po_lines} open order lines: {money(data.exposure.added_duty_usd)} in added duty on those orders and {money(data.exposure.annualized_added_duty_usd)} a year at current build rates. Rules computed every figure.</p>
    </section>}

    {story && decision && <section aria-labelledby="b-cost">
      <div className="eyebrow">02 · The award&apos;s annual cost</div>
      <h2 id="b-cost">{story.happened}</h2>
      {story.before != null && story.increase != null && <Bridge before={story.before} increase={story.increase} after={decision.incumbent_annual_usd} supplier={story.incumbent} />}
      <div className="table-responsive border rounded mt-5"><table className="table align-middle">
        <thead><tr><th>Option</th><th className="money">Annual landed cost</th><th className="money">Against today</th></tr></thead>
        <tbody>
          <tr><td>Stay with {story.incumbent}</td><td className="money">{money(decision.incumbent_annual_usd)}</td><td className="money text-soft">–</td></tr>
          <tr><td>Switch to {story.alternative}, with proof</td><td className="money">{money(decision.alternative_with_proof_annual_usd)}</td>
            <td className="money fw-medium" style={{ color: story.withProof < 0 ? "var(--good)" : "var(--bad)" }}>{signed(story.withProof)}</td></tr>
          <tr><td>Switch to {story.alternative}, without proof</td><td className="money">{money(decision.alternative_without_proof_annual_usd)}</td>
            <td className="money fw-medium" style={{ color: story.withoutProof < 0 ? "var(--good)" : "var(--bad)" }}>{signed(story.withoutProof)}</td></tr>
        </tbody>
      </table></div>
    </section>}

    <section aria-labelledby="b-proof">
      <div className="eyebrow">03 · What the supplier still has to prove</div>
      <h2 id="b-proof">{supplierName(data.evidence.supplier_id)}, part <span className="code">{data.evidence.part_no}</span></h2>
      <ul className="list-unstyled mb-0 border rounded bg-white">
        {(data.evidence.requirements ?? []).map(row => {
          const [label, chip] = REQUIREMENT_CHIP[row.status] ?? [row.status, "chip-neutral"];
          return <li key={row.id} className="d-flex justify-content-between gap-3 px-3 py-3 border-bottom">
            <span>{row.label}{row.status !== "checked" && row.reason && <span className="d-block small text-soft">{row.reason}</span>}</span>
            <span className={`chip ${chip} align-self-start`}>{label}</span>
          </li>;
        })}
      </ul>
    </section>

    </div>

    <aside className="ks-brief-aside" aria-label="Your decision">
      {story && decision && <div className="card"><div className="card-body">
        <div className="eyebrow">At a glance</div>
        <div className="ks-glance">
          {story.increase != null && <div><span>Award cost since the change</span><span className="amount" style={{ color: "var(--accent-ink)" }}>+{money(story.increase)}/yr</span></div>}
          <div><span>Switch to {story.alternative}, with proof</span><span className="amount" style={{ color: story.withProof < 0 ? "var(--good)" : "var(--bad)" }}>{signed(story.withProof)}/yr</span></div>
          <div><span>Switch without proof</span><span className="amount" style={{ color: story.withoutProof < 0 ? "var(--good)" : "var(--bad)" }}>{signed(story.withoutProof)}/yr</span></div>
        </div>
      </div></div>}
      {action ? <Decide action={action} audit={data.audit} supplier={supplierName(data.evidence.supplier_id)} />
        : <DecisionRecorded audit={data.audit} />}
    </aside>
    </div>
  </div>;
}

/** Before + added duty = after, as three aligned rows on one scale. */
function Bridge({ before, increase, after, supplier }: { before: number; increase: number; after: number; supplier: string }) {
  const max = Math.max(before + increase, after);
  const pct = (v: number) => `${(v / max) * 100}%`;
  return <figure className="mb-0">
    <div className="ks-bridge" role="img"
      aria-label={`Annual cost rose from ${money(before)} by ${money(increase)} to ${money(after)}`}>
      <span className="step">Before the change</span>
      <div className="track"><div className="bar before" style={{ left: 0, width: pct(before) }} /><div className="guide" style={{ left: pct(before) }} /></div>
      <span className="value">{money(before)}</span>

      <span className="step">Added duty</span>
      <div className="track"><div className="bar increase" style={{ left: pct(before), width: pct(increase) }} /><div className="guide" style={{ left: pct(before) }} /><div className="guide" style={{ left: pct(before + increase) }} /></div>
      <span className="value increase">+{money(increase)}</span>

      <span className="step">After the change</span>
      <div className="track"><div className="bar after" style={{ left: 0, width: pct(after) }} /><div className="guide" style={{ left: pct(after) }} /></div>
      <span className="value">{money(after)}</span>
    </div>
    <figcaption className="ks-bridge-note">Annual landed cost of the award with {supplier}. The red step is the added duty from the new rate.</figcaption>
  </figure>;
}

function Decide({ action, audit, supplier }: { action: Action; audit: WorkspaceData["audit"]; supplier: string }) {
  const submissions = useSubmissions(audit);
  const declines = useDeclines(audit);
  const saved = submissions.find(item => item.actionId === action.id);
  const declinedSaved = declines.find(item => item.action_id === action.id);
  const [draft, setDraft] = useState(action.draft_email);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [approved, setApproved] = useState<SendActionResponse | undefined>(undefined);
  const [declined, setDeclined] = useState<DeclineActionResponse | undefined>(undefined);
  const done = approved ?? saved?.response;
  const refused = declined ?? declinedSaved;

  async function run(kind: "approve" | "decline") {
    if (busy || done || refused) return;
    setBusy(true); setError("");
    try {
      if (kind === "approve") setApproved(await submitAction(action.id, draft));
      else setDeclined(await declineAction(action.id));
    } catch (err) { setError(err instanceof Error ? err.message : "That didn't go through."); }
    finally { setBusy(false); }
  }

  return <div className="card"><div className="card-body ks-decide d-grid">
    <div className="eyebrow mb-0">Your decision</div>
    <div className="d-flex justify-content-between gap-2 flex-wrap">
      <h2 className="mb-0 fs-6">{actionTitle(action)}</h2>
      <span className="chip chip-accent align-self-start">{money(action.usd_at_stake)} a year at stake</span>
    </div>
    {action.why && <p className="mb-0">{action.why}</p>}
    <details className="ks-email">
      <summary>Review and edit the email to {supplier}</summary>
      <textarea className="form-control mt-2" rows={10} aria-label={`Email to ${supplier}`} value={done ? saved?.draftEmail ?? draft : draft}
        disabled={busy || !!done || !!refused} onChange={event => setDraft(event.target.value)} />
    </details>
    {error && <div className="alert alert-danger mb-0" role="alert">{error}</div>}
    {done ? <div className="alert alert-success mb-0" role="status"><strong>Approved.</strong> Draft decision <span className="code">{done.decision_id}</span> is waiting for {done.pending_approvals.map(p => p.name).join(" and ")}.</div>
      : refused ? <div className="alert alert-light mb-0" role="status"><strong>Declined.</strong> The request was removed from the queue and recorded in the audit log.</div>
      : <div className="d-flex gap-2 flex-wrap">
        <button className="btn btn-primary" disabled={busy || !draft.trim()} onClick={() => run("approve")}><Check aria-hidden="true" className="lucide" />Approve request</button>
        <button className="btn btn-outline-secondary" disabled={busy} onClick={() => run("decline")}><X aria-hidden="true" className="lucide" />Decline request</button>
      </div>}
  </div></div>;
}

/** After the request is approved or declined it leaves the open queue; the
 *  audit trail still says what happened, so the approver sees the outcome. */
function DecisionRecorded({ audit }: { audit: WorkspaceData["audit"] }) {
  const last = [...audit].filter(e => e.type === "action_sent" || e.type === "action_declined")
    .sort((a, b) => b.occurred_at.localeCompare(a.occurred_at))[0];
  if (!last) return null;
  const approved = last.type === "action_sent";
  const when = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "UTC", timeZoneName: "short" })
    .format(new Date(last.occurred_at));
  return <div className="card"><div className="card-body ks-decide d-grid">
    <div className="eyebrow mb-0">Your decision</div>
    <h2 className="mb-0 fs-6">{approved ? "Request approved" : "Request declined"}</h2>
    <p className="mb-0">{approved
      ? `The supplier request ${last.entity_id} was approved on ${when} and is waiting for the sourcing manager and trade compliance to sign off.`
      : `The supplier request ${last.entity_id} was declined on ${when} and removed from the queue.`}</p>
    <span className={`chip ${approved ? "chip-good" : "chip-neutral"} justify-self-start`}>Recorded in the audit log</span>
  </div></div>;
}

