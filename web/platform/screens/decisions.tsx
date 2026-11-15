"use client";
// Sourcing: every supplier award, open and completed.
import { useState } from "react";
import Link from "next/link";
import type { WorkspaceData } from "@/lib/contracts";
import { date, money } from "@/lib/format";
import { AWARD, partName } from "../catalog";
import { awardViews, STATE_LABEL, type AwardView } from "../awards";
import { supplierName, supplierPlace } from "../names";
import { decisionStory } from "../story";
import { EmptyWorkspace, PageHead, type PlatformContext } from "../shell";

const signed = (value: number) => `${value < 0 ? "−" : "+"}${money(Math.abs(value))}`;
const TABS: { id: AwardView["state"]; label: string }[] = [
  { id: "open", label: "Needs a decision" }, { id: "review", label: "In review" }, { id: "decided", label: "Decided" },
];

export function Decisions({ data, outcomes }: { data: WorkspaceData | null } & Pick<PlatformContext, "outcomes">) {
  const [tab, setTab] = useState<AwardView["state"]>("open");
  if (!data) return <><PageHead title="Supplier decisions" /><EmptyWorkspace /></>;
  const awards = awardViews(outcomes);
  const shown = awards.filter(a => a.state === tab);
  return <div className="d-grid gap-4">
    <PageHead title="Supplier decisions" actions={<div className="ks-tabs" role="tablist" aria-label="Awards">
      {TABS.map(t => <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}>
        {t.label} <span className="count">{awards.filter(a => a.state === t.id).length}</span></button>)}
    </div>}>
      Supplier awards and what each costs at today&apos;s duty rates.
    </PageHead>
    {shown.map(a => a.id === AWARD.decision_id && a.state === "open"
      ? <MainAward key={a.id} data={data} />
      : <AwardCard key={a.id} award={a} />)}
    {!shown.length && <div className="card"><div className="card-body text-soft">Nothing here.</div></div>}
  </div>;
}

/** The award the tariff change broke, with the rule's three options. */
function MainAward({ data }: { data: WorkspaceData }) {
  const change = data.changes[0];
  const d = data.decisions[0];
  const s = decisionStory(d, change, data.evidence);
  return <article className="card">
    <div className="card-header d-flex justify-content-between align-items-center flex-wrap gap-2">
      <span>{s.title} <span className="code text-soft fw-normal ms-1">{d.decision_id}</span></span>
      <span className="chip chip-bad">Needs a decision</span>
    </div>
    <div className="card-body d-grid gap-4">
      <p className="mb-0 fs-6">{s.happened} <strong className="fw-medium">{s.broke}</strong></p>
      {s.before != null && s.increase != null && <div className="ks-kpis three">
        <div className="ks-kpi"><div className="label">Before the change</div><div className="value">{money(s.before)}</div><div className="sub">a year with {s.incumbent}</div></div>
        <div className="ks-kpi"><div className="label">Added duty</div><div className="value accent">+{money(s.increase)}</div><div className="sub">a year</div></div>
        <div className="ks-kpi"><div className="label">After the change</div><div className="value">{money(d.incumbent_annual_usd)}</div><div className="sub">a year with {s.incumbent}</div></div>
      </div>}
      <div className="table-responsive border rounded"><table className="table align-middle">
        <thead><tr><th>Option</th><th>Condition</th><th className="money">Annual landed cost</th><th className="money">Against today</th></tr></thead>
        <tbody>
          <tr><td>Stay with {s.incumbent}</td><td>At the new rate</td><td className="money">{money(d.incumbent_annual_usd)}</td><td className="money text-soft">–</td></tr>
          <tr><td>Switch to {s.alternative}</td><td>With US fab proof</td><td className="money">{money(d.alternative_with_proof_annual_usd)}</td>
            <td className="money fw-medium" style={{ color: s.withProof < 0 ? "var(--good)" : "var(--bad)" }}>{signed(s.withProof)}</td></tr>
          <tr><td>Switch to {s.alternative}</td><td>Without US fab proof</td><td className="money">{money(d.alternative_without_proof_annual_usd)}</td>
            <td className="money fw-medium" style={{ color: s.withoutProof < 0 ? "var(--good)" : "var(--bad)" }}>{signed(s.withoutProof)}</td></tr>
        </tbody>
      </table></div>
      <div className="alert alert-primary mb-0">{s.verdict}</div>
      <div className="d-flex gap-2 flex-wrap">
        <Link className="btn btn-primary" href="/sourcing/requests">Request the missing documents</Link>
        <Link className="btn btn-outline-secondary" href="/sourcing/cost-impact">See the affected orders</Link>
      </div>
    </div>
  </article>;
}

function AwardCard({ award: a }: { award: AwardView }) {
  const [label, chip] = STATE_LABEL[a.state];
  const delta = a.now_annual_usd - a.before_annual_usd;
  const saving = a.switch_annual_usd != null ? a.switch_annual_usd - a.now_annual_usd : null;
  const recorded = a.recorded;
  return <article className="card">
    <div className="card-header d-flex justify-content-between align-items-center flex-wrap gap-2">
      <span>{a.title} <span className="code text-soft fw-normal ms-1">{a.id}</span></span>
      <span className={`chip ${chip}`}>{label}</span>
    </div>
    <div className="card-body d-grid gap-3">
      <p className="mb-0">{a.part_label.charAt(0).toUpperCase() + a.part_label.slice(1)} ({a.parts.map(p => partName(p)).join(", ")}),
        awarded to {supplierName(a.incumbent)} ({supplierPlace(a.incumbent)}) on {date(a.awarded_on)}.
        {a.driver === "tariff" ? " Repriced for the Section 232 change." : " Cost review: a cheaper quote is on file."}</p>
      <div className="ks-kpis three">
        <div className="ks-kpi"><div className="label">Annual cost today</div><div className="value">{money(a.now_annual_usd)}</div><div className="sub">with {supplierName(a.incumbent)}</div></div>
        <div className="ks-kpi"><div className="label">Change from the duty</div><div className={`value ${delta > 0 ? "accent" : ""}`}>{delta > 0 ? `+${money(delta)}` : money(0)}</div><div className="sub">a year</div></div>
        <div className="ks-kpi"><div className="label">{a.alternative ? `Switch to ${supplierName(a.alternative)}` : "Alternative"}</div>
          <div className="value" style={saving != null ? { color: saving < 0 ? "var(--good)" : "var(--bad)" } : undefined}>{saving != null ? signed(saving) : "None qualified"}</div>
          <div className="sub">{a.alternative ? `a year, ${supplierPlace(a.alternative)}` : "before 2028"}</div></div>
      </div>
      {a.outcome && !recorded && <div className="alert alert-success mb-0"><strong>{a.outcome.decision}.</strong> {a.outcome.note} Decided by {a.outcome.by} on {date(a.outcome.on)}.</div>}
      {recorded && <div className="alert alert-success mb-0"><strong>{recorded.kind === "award_approved" ? `Approved: ${a.recommendation}` : "Declined. The award stays as it is."}</strong> Recorded by Elena Park as {recorded.event.id}.</div>}
      {a.state === "open" && !recorded && <div className="alert alert-primary mb-0">{a.recommendation} Waiting for the approver.</div>}
      {a.state === "review" && <div className="alert alert-warning mb-0">{a.next_step}</div>}
    </div>
  </article>;
}
