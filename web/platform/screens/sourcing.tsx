"use client";
// Sourcing manager: the award at risk, cost by supplier, and the requests to send.
import { Fragment, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, ChevronDown, ChevronRight } from "lucide-react";
import type { WorkspaceData } from "@/lib/contracts";
import { actionTitle, date, money } from "@/lib/format";
import { AWARD, PARTS, PRODUCTS, partName } from "../catalog";
import { supplierName, supplierPlace } from "../names";
import { changeHeadline, decisionStory } from "../story";
import { EmptyWorkspace, PageHead } from "../shell";

function bySupplier(data: WorkspaceData) {
  const groups = new Map<string, { supplier: string; lines: WorkspaceData["exposure"]["lines"]; added: number; value: number }>();
  for (const line of data.exposure.lines) {
    const g = groups.get(line.supplier_id) ?? { supplier: line.supplier_id, lines: [], added: 0, value: 0 };
    g.lines.push(line); g.added += line.added_duty_usd; g.value += line.customs_value_usd;
    groups.set(line.supplier_id, g);
  }
  return [...groups.values()].sort((a, b) => b.added - a.added);
}

const country = supplierPlace;

export function SourcingOverview({ data }: { data: WorkspaceData | null }) {
  if (!data) return <><PageHead title="Overview" /><EmptyWorkspace /></>;
  const change = data.changes[0];
  const decision = data.decisions[0];
  const story = decision ? decisionStory(decision, change, data.evidence) : null;
  const change0 = data.changes[0];
  const byPart = Object.values(PARTS)
    .filter(p => change0?.hts_scope.includes(p.hts10.slice(0, 6)))
    .map(p => ({ part: p, yearly: p.annual_qty * p.unit_price_usd * ((change0?.new_rate ?? 0) - (change0?.old_rate ?? 0)) }))
    .sort((a, b) => b.yearly - a.yearly).slice(0, 5);
  const requests = [...data.actions].sort((a, b) => a.rank - b.rank);

  return <div className="d-grid gap-4">
    <PageHead title="Overview">{change ? changeHeadline(change) : "No tariff change on file."}</PageHead>

    <section className="ks-kpis" aria-label="Exposure">
      <div className="ks-kpi"><div className="label">Added duty, open orders</div><div className="value accent">{money(data.exposure.added_duty_usd)}</div></div>
      <div className="ks-kpi"><div className="label">Per year at current builds</div><div className="value">{money(data.exposure.annualized_added_duty_usd)}</div></div>
      <div className="ks-kpi"><div className="label">Awards to review</div><div className="value">{data.decisions.filter(d => d.status === "broken").length}</div></div>
      <div className="ks-kpi"><div className="label">Supplier requests</div><div className="value">{requests.length}</div></div>
    </section>

    <div className="ks-grid-2">
      {story && decision && <section className="card">
        <div className="card-header d-flex justify-content-between"><span>Award at risk</span><span className="chip chip-bad">Needs review</span></div>
        <div className="card-body d-grid gap-3">
          <div><div className="fw-medium">{story.title}</div><div className="text-soft small">{story.incumbent}, awarded {date(AWARD.decided_on)}</div></div>
          <div className="d-flex justify-content-between"><span className="text-soft">Annual cost, now</span><span className="money fw-medium">{money(decision.incumbent_annual_usd)}</span></div>
          {story.increase != null && <div className="d-flex justify-content-between"><span className="text-soft">Increase</span><span className="money fw-medium" style={{ color: "var(--accent-ink)" }}>+{money(story.increase)}</span></div>}
          <div className="d-flex justify-content-between"><span className="text-soft">{story.alternative}, with US fab proof</span><span className="money fw-medium" style={{ color: "var(--good)" }}>{money(decision.alternative_with_proof_annual_usd)}</span></div>
          <Link className="link-arrow" href="/sourcing/decisions">Review the award <ArrowRight aria-hidden="true" className="lucide" /></Link>
        </div>
      </section>}

      <section className="card">
        <div className="card-header">Largest increases by part</div>
        <div className="ks-list">{byPart.map(({ part, yearly }) => <Link key={part.part_no} href={`/sourcing/parts?part=${part.part_no}`}>
          <span><span className="d-block fw-medium">{part.description}</span>
            <span className="meta">{part.part_no}, {supplierName(part.supplier_id)}</span></span>
          <span className="text-end"><span className="d-block money fw-medium">+{money(yearly)}</span><span className="meta">a year</span></span>
        </Link>)}</div>
        <div className="card-footer"><Link className="link-arrow" href="/sourcing/parts">All parts <ArrowRight aria-hidden="true" className="lucide" /></Link></div>
      </section>
    </div>

    {requests.length > 0 && <section className="card">
      <div className="card-header">Requests waiting to be sent</div>
      <div className="ks-list">{requests.map(a => <Link key={a.id} href="/sourcing/requests">
        <span><span className="d-block fw-medium">{actionTitle(a)}</span><span className="meta">{a.id}</span></span>
        <span className="chip chip-accent plain">{money(a.usd_at_stake)} a year</span>
      </Link>)}</div>
    </section>}
  </div>;
}

export function CostImpact({ data }: { data: WorkspaceData | null }) {
  const [open, setOpen] = useState<string | null>(null);
  const groups = useMemo(() => (data ? bySupplier(data) : []), [data]);
  if (!data) return <><PageHead title="Cost impact" /><EmptyWorkspace /></>;
  const exposure = data.exposure;
  const top = groups[0];

  return <div className="d-grid gap-4">
    <PageHead title="Cost impact">
      Added duty on open orders entering on or after {date(data.changes[0]?.effective_date ?? "2026-12-01")}, by supplier.
    </PageHead>

    <section className="ks-kpis three" aria-label="Totals">
      <div className="ks-kpi"><div className="label">Added duty, open orders</div><div className="value accent">{money(exposure.added_duty_usd)}</div><div className="sub">{exposure.open_po_lines} order lines, {groups.length} suppliers</div></div>
      <div className="ks-kpi"><div className="label">Per year at current builds</div><div className="value">{money(exposure.annualized_added_duty_usd)}</div><div className="sub">{exposure.affected_parts} parts in {PRODUCTS.length} phone models</div></div>
      {top && <div className="ks-kpi"><div className="label">Largest supplier impact</div><div className="value">{money(top.added)}</div><div className="sub">{supplierName(top.supplier)}</div></div>}
    </section>

    <section className="card">
      <div className="table-responsive"><table className="table align-middle">
        <thead><tr><th>Supplier</th><th>Country</th><th className="money">Order lines</th><th className="money">Customs value</th><th className="money">Added duty</th><th aria-label="Expand" /></tr></thead>
        <tbody>{groups.map(g => {
          const isOpen = open === g.supplier;
          return <Fragment key={g.supplier}>
            <tr onClick={() => setOpen(isOpen ? null : g.supplier)} style={{ cursor: "pointer" }}>
              <td><button type="button" className="btn btn-link p-0 text-reset fw-medium text-decoration-none" aria-expanded={isOpen}
                onClick={e => { e.stopPropagation(); setOpen(isOpen ? null : g.supplier); }}>{supplierName(g.supplier)}</button></td>
              <td className="text-soft">{country(g.supplier)}</td>
              <td className="money">{g.lines.length}</td>
              <td className="money">{money(g.value)}</td>
              <td className="money fw-medium" style={{ color: "var(--accent-ink)" }}>+{money(g.added)}</td>
              <td className="text-end text-soft">{isOpen ? <ChevronDown aria-hidden="true" className="lucide" /> : <ChevronRight aria-hidden="true" className="lucide" />}</td>
            </tr>
            {isOpen && g.lines.sort((a, b) => b.added_duty_usd - a.added_duty_usd).map(line => <tr key={`${line.po_id}-${line.line_no}`} style={{ background: "var(--canvas)" }}>
              <td className="ps-4" colSpan={2}><span className="d-block">{partName(line.part_no)}</span><span className="sub code">{line.po_id} / {line.line_no}, {line.part_no}</span></td>
              <td className="money text-soft">{date(line.est_entry_date)}</td>
              <td className="money">{money(line.customs_value_usd)}</td>
              <td className="money">+{money(line.added_duty_usd, 2)}</td>
              <td />
            </tr>)}
          </Fragment>;
        })}</tbody>
      </table></div>
    </section>
  </div>;
}
