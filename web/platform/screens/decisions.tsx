"use client";
import Link from "next/link";
import type { WorkspaceData } from "@/lib/contracts";
import { money } from "@/lib/format";
import type { Role } from "../roles";
import { decisionStory } from "../story";
import { EmptyWorkspace } from "../shell";

const signed = (value: number) => `${value < 0 ? "−" : "+"}${money(Math.abs(value))}`;

export function Decisions({ data, role }: { data: WorkspaceData | null; role: Role }) {
  if (!data) return <EmptyWorkspace />;
  const change = data.changes[0];
  return <div className="d-grid gap-4">
    <div><h1 className="mb-1">Decisions</h1>
      <p className="text-soft mb-0">Supplier choices whose reasons changed, and what each option costs now.</p></div>
    {!data.decisions.length && <div className="card"><div className="card-body">No decisions are affected.</div></div>}
    {data.decisions.map(d => {
      const s = decisionStory(d, change, data.evidence);
      const broken = d.status === "broken";
      return <article className="card" key={d.decision_id}>
        <div className="card-header d-flex justify-content-between align-items-center flex-wrap gap-2">
          <span>{s.title} <span className="code text-soft fw-normal">{d.decision_id}</span></span>
          <span className={`badge rounded-pill ${broken ? "text-bg-danger" : "text-bg-success"}`}>{broken ? "Needs review" : "Still holds"}</span>
        </div>
        <div className="card-body d-grid gap-3">
          <p className="mb-0 fs-6">{s.happened} <strong>{s.broke}</strong></p>

          {s.before != null && s.increase != null && <div className="row g-3 text-center">
            <div className="col-12 col-md-4"><div className="border rounded p-3 h-100"><div className="small text-soft">Before the change</div><div className="fs-5 fw-semibold">{money(s.before)}</div><div className="small text-soft">a year with {s.incumbent}</div></div></div>
            <div className="col-12 col-md-4"><div className="border rounded p-3 h-100 border-danger-subtle bg-danger-subtle"><div className="small text-danger-emphasis">Added duty</div><div className="fs-5 fw-semibold text-danger-emphasis">+{money(s.increase)}</div><div className="small text-danger-emphasis">a year</div></div></div>
            <div className="col-12 col-md-4"><div className="border rounded p-3 h-100"><div className="small text-soft">After the change</div><div className="fs-5 fw-semibold">{money(d.incumbent_annual_usd)}</div><div className="small text-soft">a year with {s.incumbent}</div></div></div>
          </div>}

          <div className="table-responsive"><table className="table align-middle">
            <thead><tr><th>Option</th><th>Condition</th><th className="money">Annual landed cost</th><th className="money">Against today</th></tr></thead>
            <tbody>
              <tr><td>Stay with {s.incumbent}</td><td>At the new rate</td><td className="money">{money(d.incumbent_annual_usd)}</td><td className="money text-soft">–</td></tr>
              <tr><td>Switch to {s.alternative}</td><td>With melt-and-pour proof</td><td className="money">{money(d.alternative_with_proof_annual_usd)}</td>
                <td className={`money fw-semibold ${s.withProof < 0 ? "text-success" : "text-danger"}`}>{signed(s.withProof)}</td></tr>
              <tr><td>Switch to {s.alternative}</td><td>Without proof</td><td className="money">{money(d.alternative_without_proof_annual_usd)}</td>
                <td className={`money fw-semibold ${s.withoutProof < 0 ? "text-success" : "text-danger"}`}>{signed(s.withoutProof)}</td></tr>
            </tbody>
          </table></div>

          <div className="alert alert-primary mb-0">{s.verdict}</div>
          <div className="d-flex gap-2 flex-wrap">
            {role.pages.includes("evidence") && <Link className="btn btn-outline-primary" href="/evidence">Check {s.alternative}&apos;s proof</Link>}
            {role.pages.includes("actions") && <Link className="btn btn-primary" href="/actions">Request the missing documents</Link>}
            {role.pages.includes("brief") && <Link className="btn btn-primary" href="/brief">Open the decision brief</Link>}
          </div>
        </div>
      </article>;
    })}
  </div>;
}
