"use client";
// Sourcing: one part at a time. Supplier, duty per unit, the tariff updates
// that touch it, quotes on file, and its open orders.
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { WorkspaceData } from "@/lib/contracts";
import { date, money, percent } from "@/lib/format";
import { AWARD, BASE_RATES, HEADINGS, ORDERS, PART_LIST, PARTS, QUOTES, productName } from "../catalog";
import { hts, supplierName, supplierPlace, SUPPLIERS } from "../names";
import { EmptyWorkspace, PageHead } from "../shell";
import { Dropdown, type Option } from "../ui";

/** Parts the change covers first (largest added duty), then the rest. */
export function partOptions(data: WorkspaceData, only: "all" | "covered" = "all"): Option[] {
  const scope = new Set(data.changes.flatMap(c => c.hts_scope));
  const added = (part: string) => data.exposure.lines.filter(l => l.part_no === part).reduce((t, l) => t + l.added_duty_usd, 0);
  const covered = PART_LIST.filter(p => scope.has(p.hts10.slice(0, 6))).sort((a, b) => added(b.part_no) - added(a.part_no));
  const other = PART_LIST.filter(p => !scope.has(p.hts10.slice(0, 6)));
  const option = (group: string) => (p: (typeof PART_LIST)[number]): Option =>
    ({ value: p.part_no, label: p.description, sub: `${p.part_no}, ${supplierName(p.supplier_id)}`, group });
  return [...covered.map(option("Covered by the change")), ...(only === "all" ? other.map(option("Other parts")) : [])];
}

export function PartPicker({ data, value, onChange, all, only = "all" }: {
  data: WorkspaceData; value: string; onChange: (part: string) => void; all?: string; only?: "all" | "covered";
}) {
  const options = useMemo(() => [...(all ? [{ value: "", label: all, sub: "Every covered part" }] : []), ...partOptions(data, only)], [data, all, only]);
  return <Dropdown label="Part" value={value} options={options} onChange={onChange} searchable className="ks-part-dd" />;
}

export function Parts({ data }: { data: WorkspaceData | null }) {
  const [partNo, setPartNo] = useState(AWARD.parts[AWARD.parts.length - 1]);
  useEffect(() => {
    const wanted = new URLSearchParams(window.location.search).get("part");
    if (wanted && PARTS[wanted]) setPartNo(wanted);
  }, []);
  if (!data) return <><PageHead title="Parts" /><EmptyWorkspace /></>;
  const part = PARTS[partNo];
  const hs6 = part.hts10.slice(0, 6);
  const changes = data.changes.filter(c => c.hts_scope.includes(hs6));
  const change = changes[0];
  const before = change ? change.old_rate : BASE_RATES[hs6] ?? 0;
  const after = change ? change.new_rate : before;
  const supplier = SUPPLIERS[part.supplier_id];
  const domestic = supplier?.country_code === "US";
  const dutyBefore = domestic ? 0 : part.unit_price_usd * before;
  const dutyAfter = domestic ? 0 : part.unit_price_usd * after;
  const yearlyAdded = (dutyAfter - dutyBefore) * part.annual_qty;
  const orders = ORDERS.filter(o => o.part_no === partNo).sort((a, b) => a.est_entry_date.localeCompare(b.est_entry_date));
  const lines = new Map(data.exposure.lines.filter(l => l.part_no === partNo).map(l => [`${l.po_id}-${l.line_no}`, l]));
  const quotes = QUOTES.filter(q => q.part_no === partNo);
  const inAward = AWARD.parts.includes(partNo);
  const setPart = (value: string) => {
    setPartNo(value);
    window.history.replaceState(null, "", `?part=${encodeURIComponent(value)}`);
  };

  return <div className="d-grid gap-4">
    <PageHead title={part.description} actions={<PartPicker data={data} value={partNo} onChange={setPart} />}>
      <span className="code">{part.part_no}</span>, HTS {hts(part.hts10)} ({HEADINGS[hs6] ?? "other"}). Used in {part.products.map(productName).join(", ")}.
    </PageHead>

    <section className="ks-kpis" aria-label="Part figures">
      <div className="ks-kpi"><div className="label">Unit price</div><div className="value">{money(part.unit_price_usd, 2)}</div><div className="sub">{supplierName(part.supplier_id)}</div></div>
      <div className="ks-kpi"><div className="label">Duty per unit</div>
        <div className="value">{money(dutyAfter, 2)}</div>
        <div className="sub">{domestic ? "Made in the US, no duty" : change ? `was ${money(dutyBefore, 2)} at ${percent(before)}` : `${percent(after)} rate`}</div></div>
      <div className="ks-kpi"><div className="label">Annual volume</div><div className="value">{part.annual_qty.toLocaleString("en-US")}</div><div className="sub">units a year</div></div>
      <div className="ks-kpi"><div className="label">Added cost per year</div><div className={`value ${yearlyAdded > 0 ? "accent" : ""}`}>{yearlyAdded > 0 ? `+${money(yearlyAdded)}` : money(0)}</div><div className="sub">{change ? `from ${date(change.effective_date)}` : "no tariff change"}</div></div>
    </section>

    <div className="ks-grid-2">
      <section className="card">
        <div className="card-header">Tariff updates for this part</div>
        {changes.length ? <ul className="ks-list">{changes.map(c => <li key={c.id} className="align-items-start">
          <span><span className="d-block fw-medium">{c.measure}</span>
            <span className="meta">{percent(c.old_rate)} to {percent(c.new_rate)} on the full customs value, effective {date(c.effective_date)}</span></span>
          <span className="chip chip-accent">+{percent(c.new_rate - c.old_rate)}</span>
        </li>)}</ul> : <div className="card-body text-soft">No tariff updates. The {percent(after)} rate for HTS {hts(hs6)} applies.</div>}
      </section>

      <section className="card">
        <div className="card-header">Suppliers</div>
        <ul className="ks-list">
          <li className="align-items-start">
            <span><span className="d-block fw-medium">{supplierName(part.supplier_id)}</span>
              <span className="meta">{supplierPlace(part.supplier_id)}. Current supplier. {domestic ? "Made in the US." : change ? `Section 232 at ${percent(after)}.` : after ? `MFN duty ${percent(after)}.` : "Duty free."}</span></span>
            <span className="text-end"><span className="d-block money fw-medium">{money(part.unit_price_usd + dutyAfter, 2)}</span><span className="meta">landed per unit</span></span>
          </li>
          {[...quotes].sort((a, b) => a.landed_unit_usd - b.landed_unit_usd).map(q => {
            const diff = -q.annual_saving_usd;
            return <li key={q.supplier_id} className="align-items-start">
              <span><span className="d-block fw-medium">{supplierName(q.supplier_id)}</span>
                <span className="meta">{supplierPlace(q.supplier_id)}. Quote {q.reference} at {money(q.unit_price_usd, 2)}. {q.duty_basis}.</span></span>
              <span className="text-end"><span className="d-block money fw-medium">{money(q.landed_unit_usd, 2)}</span>
                <span className="meta" style={{ color: diff < 0 ? "var(--good)" : "var(--bad)" }}>{diff < 0 ? "−" : "+"}{money(Math.abs(diff))} a year</span></span>
            </li>;
          })}
          {!quotes.length && <li><span className="meta">No other quotes on file.</span></li>}
        </ul>
        {inAward && <div className="card-footer"><Link className="link-arrow" href="/sourcing/decisions">Review the award decision <ArrowRight aria-hidden="true" className="lucide" /></Link></div>}
      </section>
    </div>

    <section className="card">
      <div className="card-header d-flex justify-content-between"><span>Open orders</span><span className="text-soft small">{orders.length} order lines</span></div>
      <div className="table-responsive"><table className="table align-middle">
        <thead><tr><th>Order line</th><th>Entry date</th><th>Port of entry</th><th className="money">Quantity</th><th className="money">Customs value</th><th className="money">Added duty</th></tr></thead>
        <tbody>{orders.map(o => {
          const line = lines.get(`${o.po_id}-${o.line_no}`);
          return <tr key={`${o.po_id}-${o.line_no}`}>
            <td className="code text-nowrap">{o.po_id} / {o.line_no}</td>
            <td className="text-nowrap">{date(o.est_entry_date)}</td>
            <td>{o.port ?? <span className="text-soft">Domestic</span>}</td>
            <td className="money">{o.qty.toLocaleString("en-US")}</td>
            <td className="money">{money(o.customs_value_usd)}</td>
            <td className={`money ${line ? "fw-medium" : "text-soft"}`} style={line ? { color: "var(--accent-ink)" } : undefined}>
              {line ? `+${money(line.added_duty_usd)}` : change && o.port && o.est_entry_date < change.effective_date ? "Enters before the change" : "–"}</td>
          </tr>;
        })}</tbody>
      </table></div>
    </section>
  </div>;
}
