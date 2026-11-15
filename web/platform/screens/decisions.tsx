"use client";
import Link from "next/link";
import type { WorkspaceData } from "@/lib/contracts";
import { money } from "@/lib/format";
import { decisionStory } from "../story";
import { EmptyWorkspace, PageHead } from "../shell";

const signed = (value: number) => `${value < 0 ? "−" : "+"}${money(Math.abs(value))}`;

export function Decisions({ data }: { data: WorkspaceData | null }) {
  if (!data) return <><PageHead title="Supplier decisions" /><EmptyWorkspace /></>;
  const change = data.changes[0];
  return <div className="d-grid gap-4">
    <PageHead title="Supplier decisions">Awards priced on a rate that has since changed, with each option at the new rate.</PageHead>
    {!data.decisions.length && <div className="card"><div className="card-body">No decisions are affected.</div></div>}
    {data.decisions.map(d => {
      const s = decisionStory(d, change, data.evidence);
      const broken = d.status === "broken";
      return <article className="card" key={d.decision_id}>
        <div className="card-header d-flex justify-content-between align-items-center flex-wrap gap-2">
          <span>{s.title} <span className="code text-soft fw-normal ms-1">{d.decision_id}</span></span>
          <span className={`chip ${broken ? "chip-bad" : "chip-good"}`}>{broken ? "Needs review" : "Still holds"}</span>
        </div>
        <div className="card-body d-grid gap-4">
          <p className="mb-0 fs-6">{s.happened} <strong className="fw-medium">{s.broke}</strong></p>

          {s.before != null && s.increase != null && <div className="ks-kpis three">
            <div className="ks-kpi"><div className="label">Before the change</div><div className="value">{money(s.before)}</div><div className="small text-soft">a year with {s.incumbent}</div></div>
            <div className="ks-kpi"><div className="label">Added duty</div><div className="value accent">+{money(s.increase)}</div><div className="small text-soft">a year</div></div>
            <div className="ks-kpi"><div className="label">After the change</div><div className="value">{money(d.incumbent_annual_usd)}</div><div className="small text-soft">a year with {s.incumbent}</div></div>
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
    })}
  </div>;
}
