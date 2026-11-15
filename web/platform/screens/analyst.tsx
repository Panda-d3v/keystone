"use client";
// Analyst: does every number reconcile, and where does it come from.
import { useEffect, useMemo, useState } from "react";
import { PartPicker } from "./parts";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { WorkspaceData } from "@/lib/contracts";
import { verifyAudit } from "@/lib/audit";
import { date, money, percent } from "@/lib/format";
import { COMPANY, partName } from "../catalog";
import { supplierName } from "../names";
import { EmptyWorkspace, PageHead } from "../shell";

function reconcile(data: WorkspaceData) {
  const sum = data.exposure.lines.reduce((total, line) => total + line.added_duty_usd, 0);
  return { sum, matches: Math.round(sum) === Math.round(data.exposure.added_duty_usd) };
}

export function AnalystOverview({ data }: { data: WorkspaceData | null }) {
  const [chain, setChain] = useState<{ valid: boolean; reason: string } | null>(null);
  useEffect(() => { if (data) verifyAudit(data.audit).then(setChain).catch(() => setChain(null)); }, [data]);
  if (!data) return <><PageHead title="Overview" /><EmptyWorkspace /></>;
  const { sum, matches } = reconcile(data);
  const docs = data.documents ?? [];
  const fields = Object.values(data.changes[0]?.field_citations ?? {});
  const cited = fields.length > 0 && fields.every(list => list.length > 0 && list.every(c => c.page >= 1 && c.bbox.length === 4));

  return <div className="d-grid gap-4">
    <PageHead title="Overview">Checks on the figures behind change {data.exposure.change_id}.</PageHead>

    <section className="ks-kpis" aria-label="Checks">
      <div className="ks-kpi"><div className="label">Added duty, open orders</div><div className="value">{money(data.exposure.added_duty_usd)}</div></div>
      <div className="ks-kpi"><div className="label">Sum of order lines</div><div className="value">{money(sum)}</div><div className="sub">{matches ? "Matches the total" : "Does not match"}</div></div>
      <div className="ks-kpi"><div className="label">Order lines</div><div className="value">{data.exposure.open_po_lines}</div></div>
      <div className="ks-kpi"><div className="label">Audit events</div><div className="value">{data.audit.length}</div><div className="sub">{chain ? (chain.valid ? "Chain intact" : "Chain broken") : "Checking"}</div></div>
    </section>

    <div className="ks-grid-2">
      <section className="card">
        <div className="card-header">Checks</div>
        <ul className="ks-list">
          <li><span>Order lines add up to the headline total</span><span className={`chip ${matches ? "chip-good" : "chip-bad"}`}>{matches ? "Pass" : "Fail"}</span></li>
          <li><span>Audit chain hashes link in order</span><span className={`chip ${chain?.valid ? "chip-good" : chain ? "chip-bad" : "chip-neutral"}`}>{chain ? (chain.valid ? "Pass" : "Fail") : "Running"}</span></li>
          <li><span>Each bulletin field cites a page and position</span><span className={`chip ${cited ? "chip-good" : "chip-bad"}`}>{cited ? "Pass" : "Fail"}</span></li>
        </ul>
      </section>
      <section className="card">
        <div className="card-header">Sources</div>
        <ul className="ks-list">
          {docs.map(d => <li key={d.doc_id}><span className="text-truncate" style={{ maxWidth: "22rem" }}>{d.filename}</span><span className="meta">{d.kind === "bulletin" ? "Bulletin" : d.kind === "supplier_document" ? "Supplier document" : "Unsorted"}</span></li>)}
          <li><span>{COMPANY.name} ERP extract: parts, purchase orders, bills of materials</span><span className="meta">ERP</span></li>
        </ul>
      </section>
    </div>

    <div className="d-flex gap-3 flex-wrap">
      <Link className="link-arrow" href="/analyst/lineage">Trace the total in Lineage <ArrowRight aria-hidden="true" className="lucide" /></Link>
      <Link className="link-arrow" href="/analyst/calculations">Open every calculation <ArrowRight aria-hidden="true" className="lucide" /></Link>
    </div>
  </div>;
}

export function Calculations({ data }: { data: WorkspaceData | null }) {
  const [part, setPart] = useState("");
  const rows = useMemo(() => data ? [...data.exposure.lines].sort((a, b) => b.added_duty_usd - a.added_duty_usd)
    .filter(l => !part || l.part_no === part) : [], [data, part]);
  if (!data) return <><PageHead title="Calculations" /><EmptyWorkspace /></>;
  const change = data.changes[0];
  const { sum, matches } = reconcile(data);

  return <div className="d-grid gap-4">
    <PageHead title="Calculations">Every order line with its inputs and formula.</PageHead>

    <section className="card"><div className="card-body d-grid gap-2">
      <div className="fw-medium">Formula</div>
      <div className="ks-math rounded p-3">
        added duty = customs value × (new rate − old rate){change ? ` = customs value × (${percent(change.new_rate)} − ${percent(change.old_rate)})` : ""}<br />
        applies to lines whose part is in the bulletin&apos;s HTS scope and that enter on or after {change ? date(change.effective_date) : "the effective date"}; parts made from US-fabricated wafers are not covered
      </div>
      <div className="d-flex justify-content-between flex-wrap gap-2 small">
        <span className="text-soft">Sum of {data.exposure.open_po_lines} lines: <span className="money fw-medium text-body">{money(sum, 2)}</span>, reported total {money(data.exposure.added_duty_usd)}</span>
        <span className={`chip ${matches ? "chip-good" : "chip-bad"}`}>{matches ? "Reconciles" : "Does not reconcile"}</span>
      </div>
    </div></section>

    <section className="card">
      <div className="card-header d-flex justify-content-between align-items-center flex-wrap gap-2">
        <span>Order lines</span>
        <PartPicker data={data} value={part} onChange={setPart} all="All covered parts" only="covered" />
      </div>
      <div className="table-responsive"><table className="table align-middle">
        <thead><tr><th>Order line</th><th>Part</th><th>Inputs and formula</th><th className="money">Added duty</th></tr></thead>
        <tbody>{rows.map(l => <tr key={`${l.po_id}-${l.line_no}`}>
          <td className="code text-nowrap">{l.po_id} / {l.line_no}</td>
          <td><span className="d-block">{partName(l.part_no)}</span><span className="sub">{supplierName(l.supplier_id)}</span></td>
          <td className="ks-math">{l.math || `${money(l.customs_value_usd, 2)} × rate change`}</td>
          <td className="money fw-medium">{money(l.added_duty_usd, 2)}</td>
        </tr>)}</tbody>
      </table></div>
    </section>
  </div>;
}
