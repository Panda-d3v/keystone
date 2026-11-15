"use client";
// Trade compliance: what arrived, whether the proof holds, and the duty bill.
import { Fragment, useMemo } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { WorkspaceData } from "@/lib/contracts";
import { date, money, percent } from "@/lib/format";
import { PARTS, partName } from "../catalog";
import { hts, supplierName } from "../names";
import { EmptyWorkspace, PageHead } from "../shell";

const STATUS: Record<string, [string, string]> = {
  checked: ["Proven", "chip-good"], needs_review: ["Unreadable", "chip-warn"],
  mismatch: ["Doesn't match", "chip-bad"], missing: ["Missing", "chip-neutral"],
};
const HEADINGS: Record<string, string> = {
  "841391": "Parts of pumps for liquids",
  "848130": "Check (non-return) valves",
  "848180": "Other taps, cocks and valves",
  "848330": "Bearing housings; plain shaft bearings",
};

function byHeading(data: WorkspaceData) {
  const groups = new Map<string, { heading: string; lines: WorkspaceData["exposure"]["lines"]; old: number; next: number; added: number }>();
  for (const line of data.exposure.lines) {
    const heading = (PARTS[line.part_no]?.hts10 ?? "").slice(0, 6) || "other";
    const g = groups.get(heading) ?? { heading, lines: [], old: 0, next: 0, added: 0 };
    g.lines.push(line); g.old += line.old_duty_usd ?? 0; g.next += line.new_duty_usd ?? 0; g.added += line.added_duty_usd;
    groups.set(heading, g);
  }
  return [...groups.values()].sort((a, b) => a.heading.localeCompare(b.heading));
}

export function ComplianceOverview({ data }: { data: WorkspaceData | null }) {
  if (!data) return <><PageHead title="Overview" /><EmptyWorkspace /></>;
  const docs = data.documents ?? [];
  const toCheck = docs.filter(d => d.review.length);
  const rows = data.evidence.requirements ?? [];
  const proven = rows.filter(r => r.status === "checked").length;
  const headings = byHeading(data);

  return <div className="d-grid gap-4">
    <PageHead title="Overview">Documents received, evidence on file, and the duty owed under the new rate.</PageHead>

    <section className="ks-kpis" aria-label="Status">
      <div className="ks-kpi"><div className="label">Documents received</div><div className="value">{docs.length}</div></div>
      <div className="ks-kpi"><div className="label">Need a person</div><div className={`value ${toCheck.length ? "accent" : ""}`}>{toCheck.length}</div></div>
      <div className="ks-kpi"><div className="label">UK requirements proven</div><div className="value">{proven} of {rows.length}</div></div>
      <div className="ks-kpi"><div className="label">Added duty, entry lines</div><div className="value">{money(data.exposure.added_duty_usd)}</div></div>
    </section>

    <div className="ks-grid-2">
      <section className="card">
        <div className="card-header">Needs a person</div>
        {toCheck.length ? <div className="ks-list">{toCheck.map(d => <Link key={d.doc_id} href="/compliance/documents">
          <span><span className="d-block fw-medium text-truncate" style={{ maxWidth: "22rem" }}>{d.filename}</span><span className="meta">{d.review[0]}</span></span>
          <span className="chip chip-warn">Check</span>
        </Link>)}</div> : <div className="card-body text-soft">Every document was read.</div>}
      </section>

      <section className="card">
        <div className="card-header d-flex justify-content-between"><span>{supplierName(data.evidence.supplier_id)}, {data.evidence.part_no}</span>
          <span className={`chip ${data.evidence.status === "verified" ? "chip-good" : "chip-warn"}`}>{data.evidence.status === "verified" ? "UK rate supported" : "UK rate not supported"}</span></div>
        <ul className="ks-list">{rows.map(r => {
          const [label, chip] = STATUS[r.status] ?? [r.status, "chip-neutral"];
          return <li key={r.id}><span>{r.label}</span><span className={`chip ${chip}`}>{label}</span></li>;
        })}</ul>
        <div className="card-footer"><Link className="link-arrow" href="/compliance/evidence">Open the evidence <ArrowRight aria-hidden="true" className="lucide" /></Link></div>
      </section>
    </div>

    <section className="card">
      <div className="card-header">Duty by HTS heading</div>
      <div className="table-responsive"><table className="table align-middle">
        <thead><tr><th>Heading</th><th className="money">Entry lines</th><th className="money">Previous duty</th><th className="money">New duty</th><th className="money">Added</th></tr></thead>
        <tbody>{headings.map(h => <tr key={h.heading}>
          <td><span className="d-block code">{hts(h.heading)}</span><span className="sub">{HEADINGS[h.heading] ?? ""}</span></td>
          <td className="money">{h.lines.length}</td><td className="money">{money(h.old)}</td><td className="money">{money(h.next)}</td>
          <td className="money fw-medium" style={{ color: "var(--accent-ink)" }}>+{money(h.added)}</td>
        </tr>)}</tbody>
      </table></div>
      <div className="card-footer"><Link className="link-arrow" href="/compliance/duty-bill">Open the duty bill <ArrowRight aria-hidden="true" className="lucide" /></Link></div>
    </section>
  </div>;
}

export function DutyBill({ data }: { data: WorkspaceData | null }) {
  const groups = useMemo(() => (data ? byHeading(data) : []), [data]);
  if (!data) return <><PageHead title="Duty bill" /><EmptyWorkspace /></>;
  const change = data.changes[0];
  let entry = 0;
  return <div className="d-grid gap-4">
    <PageHead title="Duty bill">
      {change ? `Section 232 duty per entry line at ${percent(change.old_rate)} and ${percent(change.new_rate)}, on the full customs value, for entries from ${date(change.effective_date)}.` : "Duty per entry line."}
    </PageHead>
    <section className="card">
      <div className="table-responsive"><table className="table align-middle">
        <thead><tr><th>Line</th><th>Part</th><th>Supplier</th><th>Entry date</th><th className="money">Customs value</th><th className="money">Previous duty</th><th className="money">New duty</th><th className="money">Added</th></tr></thead>
        <tbody>{groups.map(g => <Fragment key={g.heading}>
          <tr style={{ background: "var(--canvas)" }}>
            <td colSpan={5}><span className="code fw-medium">{hts(g.heading)}</span> <span className="text-soft ms-2">{HEADINGS[g.heading] ?? ""}</span></td>
            <td className="money text-soft">{money(g.old)}</td><td className="money text-soft">{money(g.next)}</td>
            <td className="money fw-medium" style={{ color: "var(--accent-ink)" }}>+{money(g.added)}</td>
          </tr>
          {g.lines.sort((a, b) => a.est_entry_date.localeCompare(b.est_entry_date)).map(line => {
            entry += 1;
            return <tr key={`${line.po_id}-${line.line_no}`}>
              <td className="text-soft">{entry}</td>
              <td><span className="d-block">{partName(line.part_no)}</span><span className="sub code">{line.po_id} / {line.line_no}, HTS {hts(PARTS[line.part_no]?.hts10 ?? "")}</span></td>
              <td>{supplierName(line.supplier_id)}</td>
              <td className="text-nowrap">{date(line.est_entry_date)}</td>
              <td className="money">{money(line.customs_value_usd)}</td>
              <td className="money">{line.old_duty_usd == null ? "–" : money(line.old_duty_usd)}</td>
              <td className="money">{line.new_duty_usd == null ? "–" : money(line.new_duty_usd)}</td>
              <td className="money">+{money(line.added_duty_usd, 2)}</td>
            </tr>;
          })}
        </Fragment>)}</tbody>
        <tfoot><tr>
          <td colSpan={7} className="fw-medium">Total added duty, {data.exposure.open_po_lines} entry lines</td>
          <td className="money fw-medium" style={{ color: "var(--accent-ink)" }}>+{money(data.exposure.added_duty_usd)}</td>
        </tr></tfoot>
      </table></div>
    </section>
  </div>;
}
