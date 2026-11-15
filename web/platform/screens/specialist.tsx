"use client";
// The two specialist views. Lineage reuses the React Flow graph, restyled to
// match. The Brief is built natively here so it looks like the rest of the
// platform; its PDF export still comes from the Brief version's renderer.
import { useEffect, useState } from "react";
import { Check, Download, Printer, X } from "lucide-react";
import type { Action, WorkspaceData } from "@/lib/contracts";
import { actionTitle, money, percent } from "@/lib/format";
import { LineageContent } from "@/variants/v3/workspace";
import { ACTION_SUPPLIERS, AWARD, AWARDS_LIST, partName } from "../catalog";
import { awardViews, STATE_LABEL, type AwardView } from "../awards";
import { Dropdown } from "../ui";
import { date } from "@/lib/format";
import { PROOF, supplierName, supplierPlace } from "../names";
import { changeHeadline, decisionStory } from "../story";
import { baseWorkspace, lineage } from "../store";
import { EmptyWorkspace, PageHead, type PlatformContext } from "../shell";
import { PartPicker } from "./parts";

export function Lineage({ data }: { data: WorkspaceData | null }) {
  const [part, setPart] = useState("");
  if (!data) return <><PageHead title="Lineage" /><EmptyWorkspace /></>;
  return <div>
    <PageHead title="Lineage" actions={<PartPicker data={data} value={part} onChange={setPart} all="All covered parts" only="covered" />}>
      How the {money(data.exposure.added_duty_usd)} on open orders traces back to the bulletin, through rates, the award, parts, orders and phones. Select a step to see its records.
    </PageHead>
    <section className="ks-kpis mb-3" aria-label="Totals">
      <div className="ks-kpi"><div className="label">Added duty, open orders</div><div className="value accent">{money(data.exposure.added_duty_usd)}</div></div>
      <div className="ks-kpi"><div className="label">Added duty per year</div><div className="value">{money(data.exposure.annualized_added_duty_usd)}</div></div>
      <div className="ks-kpi"><div className="label">Order lines</div><div className="value">{data.exposure.open_po_lines}</div></div>
      <div className="ks-kpi"><div className="label">Parts</div><div className="value">{data.exposure.affected_parts}</div></div>
    </section>
    <div className="card"><div className="card-body">
      <div className="legacy lineage-app"><LineageContent screen="exposure" data={data} graph={lineage} showPanel={false} part={part ? `part:${part}` : ""} fixed /></div>
    </div></div>
  </div>;
}

const signed = (value: number) => `${value < 0 ? "−" : "+"}${money(Math.abs(value))}`;
const REQUIREMENT_CHIP: Record<string, [string, string]> = {
  checked: ["Proven", "chip-good"], needs_review: ["Unreadable", "chip-warn"],
  mismatch: ["Doesn't match", "chip-bad"], missing: ["Missing", "chip-neutral"],
};

const GROUP: Record<AwardView["state"], string> = { open: "Waiting for you", review: "In review", decided: "Decided" };

/** Approver: pick a brief. Open ones first, then in review, then decided. */
export function Brief(props: { data: WorkspaceData | null } & Pick<PlatformContext, "outcomes" | "record">) {
  const [id, setId] = useState(AWARD.decision_id);
  useEffect(() => {
    const wanted = new URLSearchParams(window.location.search).get("brief");
    if (wanted && awardViews([]).some(a => a.id === wanted)) setId(wanted);
  }, []);
  const order = { open: 0, review: 1, decided: 2 };
  const awards = awardViews(props.outcomes).sort((a, b) => order[a.state] - order[b.state]);
  const award = awards.find(a => a.id === id) ?? awards[0];
  const choose = (value: string) => { setId(value); window.history.replaceState(null, "", `?brief=${value}`); };
  return <div>
    <div className="ks-brief-switch ks-no-print">
      <span className="small text-soft">{awards.filter(a => a.state === "open").length} waiting for you, {awards.filter(a => a.state === "decided").length} decided</span>
      <Dropdown label="Brief" value={award.id} onChange={choose} className="ks-part-dd" align="end"
        options={awards.map(a => ({ value: a.id, label: a.title, sub: `${a.id}, ${STATE_LABEL[a.state][0].toLowerCase()}`, group: GROUP[a.state] }))} />
    </div>
    {award.id === AWARD.decision_id ? <MainBrief {...props} /> : <AwardBrief award={award} record={props.record} />}
  </div>;
}

function MainBrief({ data, outcomes, record }: { data: WorkspaceData | null } & Pick<PlatformContext, "outcomes" | "record">) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  if (!data) return <><PageHead title="Decision brief" /><EmptyWorkspace /></>;
  const change = data.changes[0];
  const decision = data.decisions[0];
  const story = decision ? decisionStory(decision, change, data.evidence) : null;
  const action = [...data.actions].filter(a => a.part_ids.some(id => AWARD.parts.includes(id))).sort((a, b) => a.rank - b.rank)[0];

  async function exportPdf() {
    if (!data || busy) return;
    setBusy(true); setError("");
    try { const { downloadBriefPdf } = await import("../brief-pdf"); await downloadBriefPdf(data); }
    catch (err) { setError(err instanceof Error ? err.message : "The PDF could not be generated."); }
    finally { setBusy(false); }
  }

  return <div className="ks-brief">
    <PageHead title={story ? `${story.title}: decision required` : "Decision brief"}
      actions={<>
        <button className="btn btn-quiet" onClick={exportPdf} disabled={busy}><Download aria-hidden="true" className="lucide" />{busy ? "Preparing…" : "Download PDF"}</button>
        <button className="btn btn-quiet" onClick={() => window.print()}><Printer aria-hidden="true" className="lucide" />Print</button>
      </>}>
      {story ? `${story.lede} ${story.verdict}`.trim() : "No supplier decision is affected."}
    </PageHead>
    {error && <div className="alert alert-danger" role="alert">{error}</div>}

    <div className="ks-brief-grid">
    <div>
    {change && <section aria-labelledby="b-changed">
      <div className="eyebrow">What changed</div>
      <h2 id="b-changed">{changeHeadline(change)}</h2>
      <p className="mb-0">It reaches {data.exposure.affected_parts} parts across {data.exposure.open_po_lines} open order lines: {money(data.exposure.added_duty_usd)} in added duty on those orders and {money(data.exposure.annualized_added_duty_usd)} a year at current build rates.</p>
    </section>}

    {story && decision && <section aria-labelledby="b-cost">
      <div className="eyebrow">Annual cost of the award</div>
      <h2 id="b-cost">{story.happened}</h2>
      {story.before != null && story.increase != null && <Bridge before={story.before} increase={story.increase} after={decision.incumbent_annual_usd} supplier={story.incumbent} />}
      <div className="table-responsive border rounded mt-5"><table className="table align-middle">
        <thead><tr><th>Option</th><th className="money">Annual landed cost</th><th className="money">Against today</th></tr></thead>
        <tbody>
          <tr><td>Stay with {story.incumbent}</td><td className="money">{money(decision.incumbent_annual_usd)}</td><td className="money text-soft">–</td></tr>
          <tr><td>Switch to {story.alternative}, with US fab proof</td><td className="money">{money(decision.alternative_with_proof_annual_usd)}</td>
            <td className="money fw-medium" style={{ color: story.withProof < 0 ? "var(--good)" : "var(--bad)" }}>{signed(story.withProof)}</td></tr>
          <tr><td>Switch to {story.alternative}, without proof</td><td className="money">{money(decision.alternative_without_proof_annual_usd)}</td>
            <td className="money fw-medium" style={{ color: story.withoutProof < 0 ? "var(--good)" : "var(--bad)" }}>{signed(story.withoutProof)}</td></tr>
        </tbody>
      </table></div>
    </section>}

    <section aria-labelledby="b-proof">
      <div className="eyebrow">Outstanding supplier evidence</div>
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
        <div className="eyebrow">Summary</div>
        <div className="ks-glance">
          {story.increase != null && <div><span>Award cost since the change</span><span className="amount" style={{ color: "var(--accent-ink)" }}>+{money(story.increase)}/yr</span></div>}
          <div><span>Switch to {story.alternative}, with US fab proof</span><span className="amount" style={{ color: story.withProof < 0 ? "var(--good)" : "var(--bad)" }}>{signed(story.withProof)}/yr</span></div>
          <div><span>Switch without proof</span><span className="amount" style={{ color: story.withoutProof < 0 ? "var(--good)" : "var(--bad)" }}>{signed(story.withoutProof)}/yr</span></div>
        </div>
      </div></div>}
      {action ? <Decide key={action.id} action={action} outcomes={outcomes} record={record} />
        : <DecisionRecorded outcomes={outcomes} audit={data.audit} />}
    </aside>
    </div>
  </div>;
}

/** A brief for any other award: costs, checks and the decision. */
function AwardBrief({ award: a, record }: { award: AwardView } & Pick<PlatformContext, "record">) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const delta = a.now_annual_usd - a.before_annual_usd;
  const saving = a.switch_annual_usd != null ? a.switch_annual_usd - a.now_annual_usd : null;
  const [label, chip] = STATE_LABEL[a.state];
  async function decide(kind: "award_approved" | "award_declined") {
    setBusy(true); setError("");
    try { await record(a.id, kind); } catch (err) { setError(err instanceof Error ? err.message : "That didn't go through."); }
    finally { setBusy(false); }
  }
  const outcome = a.recorded
    ? { decision: a.recorded.kind === "award_approved" ? "Approved" : "Declined", by: "Elena Park", on: a.recorded.event.occurred_at,
        note: a.recorded.kind === "award_approved" ? a.recommendation : "The award stays as it is." }
    : a.outcome;
  return <div className="ks-brief">
    <PageHead title={a.state === "decided" ? `${a.title}: decided` : a.state === "review" ? `${a.title}: in review` : `${a.title}: decision required`}
      actions={<button className="btn btn-quiet" onClick={() => window.print()}><Printer aria-hidden="true" className="lucide" />Print or save as PDF</button>}>
      {a.recommendation}
    </PageHead>
    <div className="ks-brief-grid">
      <div>
        <section>
          <div className="eyebrow">{a.driver === "tariff" ? "What changed" : "Why this is under review"}</div>
          <h2>{a.part_label.charAt(0).toUpperCase() + a.part_label.slice(1)} ({a.parts.map(partName).join(", ")}) were awarded to {supplierName(a.incumbent)} ({supplierPlace(a.incumbent)}) on {date(a.awarded_on)}.</h2>
          <p>{a.driver === "tariff" ? `The Section 232 semiconductor duty rises from 10% to 25% on Jan 1, 2027, which adds ${money(delta)} a year to this award.` : `No tariff change affects this award. ${a.alternative ? `${supplierName(a.alternative)} quoted a lower price.` : ""}`}</p>
          {delta > 0 && <Bridge before={a.before_annual_usd} increase={delta} after={a.now_annual_usd} supplier={supplierName(a.incumbent)} />}
        </section>
        <section>
          <div className="eyebrow">Options</div>
          <div className="table-responsive border rounded"><table className="table align-middle">
            <thead><tr><th>Option</th><th className="money">Annual landed cost</th><th className="money">Against today</th></tr></thead>
            <tbody>
              <tr><td>Stay with {supplierName(a.incumbent)}</td><td className="money">{money(a.now_annual_usd)}</td><td className="money text-soft">–</td></tr>
              {a.alternative && a.switch_annual_usd != null && saving != null ? <tr><td>Switch to {supplierName(a.alternative)}</td><td className="money">{money(a.switch_annual_usd)}</td>
                <td className="money fw-medium" style={{ color: saving < 0 ? "var(--good)" : "var(--bad)" }}>{signed(saving)}</td></tr>
                : <tr><td colSpan={3} className="text-soft">No other supplier is qualified for these parts.</td></tr>}
            </tbody>
          </table></div>
        </section>
        <section>
          <div className="eyebrow">Checks</div>
          <ul className="list-unstyled mb-0 border rounded bg-white">
            {a.checks.map(c => { const [l, ch] = REQUIREMENT_CHIP[c.status] ?? [c.status, "chip-neutral"];
              return <li key={c.label} className="d-flex justify-content-between gap-3 px-3 py-3 border-bottom"><span>{c.label}</span><span className={`chip ${ch}`}>{l === "Unreadable" ? "Needs review" : l === "Doesn't match" ? "Failed" : l}</span></li>; })}
          </ul>
        </section>
      </div>
      <aside className="ks-brief-aside" aria-label="Decision">
        <div className="card"><div className="card-body ks-decide d-grid">
          <div className="d-flex justify-content-between align-items-center"><div className="eyebrow mb-0">Decision</div><span className={`chip ${chip}`}>{label}</span></div>
          {outcome ? <>
            <h2 className="mb-0 fs-6">{outcome.decision}</h2>
            <p className="mb-0">{outcome.note}</p>
            <span className="small text-soft">By {outcome.by}, {date(outcome.on)}</span>
          </> : a.state === "review" ? <>
            <h2 className="mb-0 fs-6">Not ready for a decision</h2>
            <p className="mb-0">{a.next_step}</p>
          </> : <>
            <h2 className="mb-0 fs-6">{a.recommendation}</h2>
            {saving != null && <span className="chip chip-accent justify-self-start">{money(Math.abs(saving))} a year</span>}
            {error && <div className="alert alert-danger mb-0" role="alert">{error}</div>}
            <div className="d-flex gap-2 flex-wrap">
              <button className="btn btn-primary" disabled={busy} onClick={() => decide("award_approved")}><Check aria-hidden="true" className="lucide" />Approve</button>
              <button className="btn btn-outline-secondary" disabled={busy} onClick={() => decide("award_declined")}><X aria-hidden="true" className="lucide" />Decline</button>
            </div>
          </>}
        </div></div>
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

function Decide({ action, outcomes, record }: { action: Action } & Pick<PlatformContext, "outcomes" | "record">) {
  const submitted = outcomes.find(o => o.actionId === action.id && o.kind === "submitted");
  const supplier = supplierName(ACTION_SUPPLIERS[action.id] ?? "");
  const [draft, setDraft] = useState(submitted?.draftEmail ?? action.draft_email);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function run(kind: "approved" | "declined") {
    if (busy) return;
    setBusy(true); setError("");
    try { await record(action.id, kind, draft); }
    catch (err) { setError(err instanceof Error ? err.message : "That didn't go through."); setBusy(false); }
  }

  return <div className="card"><div className="card-body ks-decide d-grid">
    <div className="eyebrow mb-0">Your decision</div>
    <div className="d-flex justify-content-between gap-2 flex-wrap">
      <h2 className="mb-0 fs-6">{actionTitle(action)}</h2>
      <span className="chip chip-accent align-self-start">{money(action.usd_at_stake)} a year at stake</span>
    </div>
    {action.why && <p className="mb-0">{action.why}</p>}
    {submitted && <span className="chip chip-good justify-self-start">Submitted by Maya Chen</span>}
    <details className="ks-email">
      <summary>Review and edit the email to {supplier}</summary>
      <textarea className="form-control mt-2" rows={10} aria-label={`Email to ${supplier}`} value={draft}
        disabled={busy} onChange={event => setDraft(event.target.value)} />
    </details>
    {error && <div className="alert alert-danger mb-0" role="alert">{error}</div>}
    <div className="d-flex gap-2 flex-wrap">
      <button className="btn btn-primary" disabled={busy || !draft.trim()} onClick={() => run("approved")}><Check aria-hidden="true" className="lucide" />Approve and send</button>
      <button className="btn btn-outline-secondary" disabled={busy} onClick={() => run("declined")}><X aria-hidden="true" className="lucide" />Decline</button>
    </div>
  </div></div>;
}

/** Once the request is approved or declined it leaves the open queue; the
 *  audit trail still says what happened, so the approver sees the outcome. */
function DecisionRecorded({ outcomes, audit }: Pick<PlatformContext, "outcomes"> & { audit: WorkspaceData["audit"] }) {
  const last = [...outcomes].filter(o => o.kind !== "submitted").sort((a, b) => b.event.occurred_at.localeCompare(a.event.occurred_at))[0];
  if (!last) return null;
  const approved = last.kind === "approved";
  const when = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
    .format(new Date(last.event.occurred_at));
  const supplier = supplierName(ACTION_SUPPLIERS[last.actionId] ?? "");
  return <div className="card"><div className="card-body ks-decide d-grid">
    <div className="eyebrow mb-0">Your decision</div>
    <h2 className="mb-0 fs-6">{approved ? `Request sent to ${supplier}` : "Request declined"}</h2>
    <p className="mb-0">{approved
      ? `You approved ${last.actionId} on ${when}. The sourcing manager follows up when ${supplier} replies.`
      : `You declined ${last.actionId} on ${when}. It was removed from the queue.`}</p>
    <span className={`chip ${approved ? "chip-good" : "chip-neutral"} justify-self-start`}>Recorded as {last.event.id} of {audit.length} audit events</span>
  </div></div>;
}

/** Approver: the decision's history, from the award to today. */
export function DecisionHistory({ data }: { data: WorkspaceData | null }) {
  if (!data) return <><PageHead title="Decision history" /><EmptyWorkspace /></>;
  const change = data.changes[0];
  const decision = data.decisions[0];
  const story = decision ? decisionStory(decision, change, data.evidence) : null;
  const fmt = (iso: string) => new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(iso));
  const events: { when: string; what: string; detail: string }[] = [];
  if (story) events.push({ when: AWARD.decided_on, what: `${story.title} awarded to ${story.incumbent}`, detail: `${AWARD.part_label}, priced on ${AWARD.assumption}.` });
  for (const e of data.audit) {
    if (e.type === "change_extracted") events.push({ when: e.occurred_at, what: `Tariff change ${e.entity_id} recorded`, detail: change ? changeHeadline(change) : "" });
    if (e.type === "evidence_refused") events.push({ when: e.occurred_at, what: `${supplierName(e.entity_id)} certificate not accepted`, detail: `The scan is unreadable where the wafer fab is printed, so there is no ${PROOF} yet.` });
    if (e.type === "action_drafted") events.push({ when: e.occurred_at, what: `Supplier request ${e.entity_id} drafted`, detail: baseWorkspace.actions.find(a => a.id === e.entity_id)?.title ?? `To ${supplierName(ACTION_SUPPLIERS[e.entity_id] ?? "")}` });
    if (e.type === "action_reviewed") events.push({ when: e.occurred_at, what: `Request ${e.entity_id} submitted for approval`, detail: "By Maya Chen, sourcing manager." });
    if (e.type === "action_sent") events.push({ when: e.occurred_at, what: `Request ${e.entity_id} approved and sent`, detail: `By Elena Park, to ${supplierName(ACTION_SUPPLIERS[e.entity_id] ?? "")}.` });
    if (e.type === "action_declined") events.push({ when: e.occurred_at, what: `Request ${e.entity_id} declined`, detail: "By Elena Park. Removed from the queue." });
    if (e.type === "decision_approved" || e.type === "decision_declined") {
      const a = AWARDS_LIST.find(x => x.id === e.entity_id);
      events.push({ when: e.occurred_at, what: `${a?.title ?? e.entity_id} ${e.type === "decision_approved" ? "approved" : "declined"}`, detail: e.type === "decision_approved" ? `By Elena Park. ${a?.recommendation ?? ""}` : "By Elena Park. The award stays as it is." });
    }
  }
  for (const a of AWARDS_LIST) {
    if (a.id === AWARD.decision_id) continue;
    events.push({ when: a.awarded_on, what: `${a.title} awarded to ${supplierName(a.incumbent)}`, detail: `${a.part_label.charAt(0).toUpperCase() + a.part_label.slice(1)}.` });
    if (a.outcome) events.push({ when: a.outcome.on, what: `${a.title}: ${a.outcome.decision.toLowerCase()}`, detail: `By ${a.outcome.by}. ${a.outcome.note}` });
  }
  if (change) events.push({ when: change.effective_date, what: "New rate takes effect", detail: `${percent(change.new_rate)} on the full customs value.` });
  events.sort((a, b) => b.when.localeCompare(a.when));
  return <div className="d-grid gap-4">
    <PageHead title="Decision history">Every supplier award and decision, newest first.</PageHead>
    <section className="card"><ul className="ks-list">
      {events.map((e, i) => <li key={i} className="align-items-start">
        <span className="d-flex gap-4"><span className="meta text-nowrap" style={{ width: "6.5rem" }}>{fmt(e.when)}</span>
          <span><span className="d-block fw-medium">{e.what}</span><span className="meta">{e.detail}</span></span></span>
      </li>)}
    </ul></section>
  </div>;
}

