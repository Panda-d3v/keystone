"use client";
import { Fragment, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Calculator, GitBranch } from "lucide-react";
import { apiRequest, useFixtures } from "@/lib/data";
import type { Exposure as ExposureData, WorkspaceData } from "@/lib/contracts";
import { date, money } from "@/lib/format";
import { pageLabel, type Role } from "../roles";
import { componentName, supplierName } from "../names";
import { EmptyWorkspace, PageHead } from "../shell";

const PAGE = 10;

export function Exposure({ data, role }: { data: WorkspaceData | null; role: Role }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [all, setAll] = useState(false);
  const [showTotals, setShowTotals] = useState(false);
  const [changeId, setChangeId] = useState("");
  const [result, setResult] = useState<ExposureData | null>(null);
  const [loadError, setLoadError] = useState("");
  const latest = data?.exposure;
  const selected = changeId || latest?.change_id;
  const exposure = latest?.change_id === selected ? latest : result?.change_id === selected ? result : null;
  useEffect(() => {
    if (useFixtures || !selected || selected === latest?.change_id) return;
    const controller = new AbortController();
    apiRequest<ExposureData>(`/changes/${encodeURIComponent(selected)}/exposure`, { signal: controller.signal })
      .then(value => { if (!controller.signal.aborted) setResult(value); })
      .catch(error => { if (!controller.signal.aborted) setLoadError(error.message); });
    return () => controller.abort();
  }, [selected, latest?.change_id]);
  const dutyBill = role.id === "compliance";
  const rows = useMemo(() => {
    if (!exposure) return [];
    const q = query.trim().toLowerCase();
    return [...exposure.lines]
      .sort((a, b) => b.added_duty_usd - a.added_duty_usd)
      .filter(line => !q || `${line.po_id} ${line.part_no} ${supplierName(line.supplier_id)}`.toLowerCase().includes(q));
  }, [exposure, query]);
  if (!data) return <EmptyWorkspace />;
  const visible = all ? rows : rows.slice(0, PAGE);
  const columns = dutyBill ? 8 : 6;
  const toggle = (key: string) => setOpen(open === key ? null : key);

  return <div className="d-grid gap-4">
    <PageHead eyebrow={selected && `Change ${selected}`} title={pageLabel(role, "exposure")}
      actions={<>
        {data.changes.length > 1 && !useFixtures && <div>
          <label htmlFor="duty-update" className="small">Tariff update</label>
          <select id="duty-update" className="form-select" value={selected} onChange={event => {
            setChangeId(event.target.value); setLoadError(""); setOpen(null);
          }}>
            {data.changes.map(change => <option value={change.id} key={change.id}>{change.measure.split(" (modeled")[0]}</option>)}
          </select>
        </div>}
        {role.pages.includes("lineage") && <Link className="btn btn-outline-primary align-self-end" href="/lineage">
          <GitBranch aria-hidden="true" className="lucide" />Trace in Lineage</Link>}
      </>}>
      {dutyBill ? "Previous and new duty for each affected order line."
        : "Orders entering on or after the change, largest added duty first."}
    </PageHead>
    {!exposure ? loadError ? <p role="alert">{loadError}</p> : <p role="status">Loading duty calculations…</p> : <>

    <section className="ks-kpis" aria-label="Totals">
      {[
        { label: "Parts affected", value: String(exposure.affected_parts) },
        { label: "Open order lines", value: String(exposure.open_po_lines) },
        { label: "Added duty, these orders", value: money(exposure.added_duty_usd), accent: true },
        { label: "Added duty per year", value: money(exposure.annualized_added_duty_usd) },
      ].map(kpi => <div className="ks-kpi" key={kpi.label}>
        <div className="label">{kpi.label}</div><div className={`value ${kpi.accent ? "accent" : ""}`}>{kpi.value}</div>
      </div>)}
    </section>

    <div>
      <button className="link-arrow" onClick={() => setShowTotals(!showTotals)} aria-expanded={showTotals}>
        <Calculator aria-hidden="true" className="lucide" />{showTotals ? "Hide the calculation" : "How these totals are calculated"}
      </button>
      {showTotals && <div className="ks-math border rounded p-3 mt-2">
        Added duty per order line = customs value × (new rate − old rate), on the full customs value; one metals duty per line.<br />
        Added duty on these orders = the sum over the {exposure.open_po_lines} lines below = {money(exposure.added_duty_usd)}.<br />
        Added duty per year = for each affected part, quantity per product × annual build units × unit price × rate change = {money(exposure.annualized_added_duty_usd)}.
      </div>}
    </div>

    <section className="card">
      <div className="card-header d-flex justify-content-between align-items-center flex-wrap gap-2">
        <span>{dutyBill ? "Duty by order line" : "Orders affected"}</span>
        <input className="form-control form-control-sm w-auto" aria-label="Filter orders"
          placeholder="Order, part or supplier" value={query} onChange={event => { setQuery(event.target.value); setAll(true); }} />
      </div>
      <div className="table-responsive">
        <table className="table table-hover align-middle">
          <thead><tr>
            <th>Order</th><th>Part</th><th>Supplier</th><th>Enters</th>
            <th className="money">Customs value</th>
            {dutyBill && <th className="money">Previous duty</th>}
            {dutyBill && <th className="money">New duty</th>}
            <th className="money">Added duty</th>
          </tr></thead>
          <tbody>
            {visible.map(line => {
              const key = `${line.po_id}-${line.line_no}`;
              return <Fragment key={key}>
                <tr onClick={() => toggle(key)} style={{ cursor: "pointer" }}>
                  <td><button type="button" className="btn btn-link p-0 code text-reset" aria-expanded={open === key}
                    onClick={event => { event.stopPropagation(); toggle(key); }}>{line.po_id} / {line.line_no}</button></td>
                  <td>{componentName(line.part_no)}</td>
                  <td>{supplierName(line.supplier_id)}</td>
                  <td className="text-nowrap">{date(line.est_entry_date)}</td>
                  <td className="money">{money(line.customs_value_usd)}</td>
                  {dutyBill && <td className="money">{line.old_duty_usd == null ? "–" : money(line.old_duty_usd)}</td>}
                  {dutyBill && <td className="money">{line.new_duty_usd == null ? "–" : money(line.new_duty_usd)}</td>}
                  <td className="money fw-medium" style={{ color: "var(--accent-ink)" }}>{money(line.added_duty_usd, 2)}</td>
                </tr>
                {open === key && <tr><td colSpan={columns} className="ks-math">
                  {line.math || `${money(line.customs_value_usd, 2)} customs value × rate change = ${money(line.added_duty_usd, 2)}`}
                </td></tr>}
              </Fragment>;
            })}
            {!rows.length && <tr><td colSpan={columns} className="text-soft">No orders match.</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="card-footer d-flex justify-content-between align-items-center small text-soft">
        <span>Showing {visible.length} of {rows.length}. Select an order to see its math.</span>
        {rows.length > PAGE && <button className="btn btn-quiet btn-sm" onClick={() => setAll(!all)}>{all ? "Show top 10" : "Show all"}</button>}
      </div>
    </section>
    </>}
  </div>;
}
