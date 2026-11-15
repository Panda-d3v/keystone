"use client";
// Trade compliance: what arrived, whether the proof holds, and the duty bill.
import { Fragment, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { WorkspaceData } from "@/lib/contracts";
import { date, money, percent } from "@/lib/format";
import { HEADINGS, ORDERS, PARTS, PASSPORTS, WORKLIST, partName, passportId, type WorkItem } from "../catalog";
import { PartPicker } from "./parts";
import { hts, supplierName } from "../names";
import { EmptyWorkspace, PageHead } from "../shell";

const STATUS: Record<string, [string, string]> = {
  checked: ["Proven", "chip-good"], needs_review: ["Unreadable", "chip-warn"],
  mismatch: ["Doesn't match", "chip-bad"], missing: ["Missing", "chip-neutral"],
};

function byHeading(data: WorkspaceData, part = "") {
  const groups = new Map<string, { heading: string; lines: WorkspaceData["exposure"]["lines"]; old: number; next: number; added: number }>();
  for (const line of data.exposure.lines) {
    if (part && line.part_no !== part) continue;
    const heading = (PARTS[line.part_no]?.hts10 ?? "").slice(0, 6) || "other";
    const g = groups.get(heading) ?? { heading, lines: [], old: 0, next: 0, added: 0 };
    g.lines.push(line); g.old += line.old_duty_usd ?? 0; g.next += line.new_duty_usd ?? 0; g.added += line.added_duty_usd;
    groups.set(heading, g);
  }
  return [...groups.values()].sort((a, b) => a.heading.localeCompare(b.heading));
}

const QUEUE: { id: WorkItem["status"]; label: string }[] = [
  { id: "open", label: "Needs a person" }, { id: "later", label: "Later" }, { id: "done", label: "Done" },
];
const short = (iso: string) => new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(`${iso}T00:00:00Z`));

export function ComplianceOverview({ data }: { data: WorkspaceData | null }) {
  const [tab, setTab] = useState<WorkItem["status"]>("open");
  if (!data) return <><PageHead title="Overview" /><EmptyWorkspace /></>;
  const docs = data.documents ?? [];
  const headings = byHeading(data);
  const count = (status: WorkItem["status"]) => WORKLIST.filter(w => w.status === status).length;
  const items = WORKLIST.filter(w => w.status === tab).sort((a, b) => tab === "done" ? b.due.localeCompare(a.due) : a.due.localeCompare(b.due));
  const proven = PASSPORTS.filter(p => p.status === "verified").length;

  return <div className="d-grid gap-4">
    <PageHead title="Overview">The work behind change {data.changes[0]?.id}: {data.exposure.affected_parts} covered parts, {data.exposure.open_po_lines} entry lines, {PASSPORTS.length} supplier evidence files.</PageHead>

    <section className="ks-kpis" aria-label="Status">
      <div className="ks-kpi"><div className="label">Needs a person</div><div className={`value ${count("open") ? "accent" : ""}`}>{count("open")}</div><div className="sub">{count("later")} more later</div></div>
      <div className="ks-kpi"><div className="label">Documents received</div><div className="value">{docs.length}</div><div className="sub">{docs.filter(d => d.review.length).length} to check</div></div>
      <div className="ks-kpi"><div className="label">Evidence files complete</div><div className="value">{proven} of {PASSPORTS.length}</div><div className="sub">by supplier and part</div></div>
      <div className="ks-kpi"><div className="label">Added duty, entry lines</div><div className="value">{money(data.exposure.added_duty_usd)}</div><div className="sub">from {date(data.changes[0]?.effective_date ?? "")}</div></div>
    </section>

    <section className="card">
      <div className="card-header d-flex justify-content-between align-items-center flex-wrap gap-2">
        <span>Work queue</span>
        <div className="ks-tabs" role="tablist" aria-label="Work queue">
          {QUEUE.map(q => <button key={q.id} type="button" role="tab" aria-selected={tab === q.id} onClick={() => setTab(q.id)}>
            {q.label} <span className="count">{count(q.id)}</span></button>)}
        </div>
      </div>
      <div className="ks-list" role="tabpanel" aria-label={QUEUE.find(q => q.id === tab)?.label}>{items.map(w => <Link key={w.id} href={w.href} className="align-items-start">
        <span className="d-flex gap-3 align-items-start">
          <span className={`ks-dot ${w.status}`} aria-hidden="true" />
          <span><span className="d-block fw-medium">{w.title}</span>
            <span className="meta d-block">{w.detail}</span>
            <span className="meta d-block mt-1">{w.kind}{w.part_no ? `, ${partName(w.part_no)}` : ""}{w.supplier_id ? `, ${supplierName(w.supplier_id)}` : ""}</span></span>
        </span>
        <span className={`chip ${w.status === "open" ? "chip-warn" : w.status === "later" ? "chip-neutral" : "chip-good"} plain text-nowrap`}>
          {w.status === "done" ? `Done ${short(w.due)}` : `Due ${short(w.due)}`}</span>
      </Link>)}</div>
    </section>

    <div className="ks-grid-2">
      <section className="card">
        <div className="card-header">Evidence by supplier and part</div>
        <div className="ks-list">{PASSPORTS.map(pp => <Link key={passportId(pp)} href={`/compliance/evidence?passport=${passportId(pp)}`}>
          <span><span className="d-block fw-medium">{supplierName(pp.supplier_id)}, {partName(pp.part_no)}</span><span className="meta">{pp.purpose}</span></span>
          <span className={`chip ${pp.status === "verified" ? "chip-good" : pp.status === "needs_review" ? "chip-warn" : "chip-neutral"}`}>
            {pp.status === "verified" ? "Complete" : pp.status === "needs_review" ? "Needs review" : "Not yet"}</span>
        </Link>)}</div>
      </section>

      <section className="card">
        <div className="card-header">Duty by HTS heading</div>
        <div className="table-responsive"><table className="table align-middle">
          <thead><tr><th>Heading</th><th className="money">Lines</th><th className="money">Added</th></tr></thead>
          <tbody>{headings.map(h => <tr key={h.heading}>
            <td><span className="d-block code">{hts(h.heading)}</span><span className="sub">{HEADINGS[h.heading] ?? ""}</span></td>
            <td className="money">{h.lines.length}</td>
            <td className="money fw-medium" style={{ color: "var(--accent-ink)" }}>+{money(h.added)}</td>
          </tr>)}</tbody>
        </table></div>
        <div className="card-footer"><Link className="link-arrow" href="/compliance/duty-bill">Open the duty bill <ArrowRight aria-hidden="true" className="lucide" /></Link></div>
      </section>
    </div>
  </div>;
}

const port = (line: { po_id: string; line_no: number }) =>
  ORDERS.find(o => o.po_id === line.po_id && o.line_no === line.line_no)?.port ?? "";

export function DutyBill({ data }: { data: WorkspaceData | null }) {
  const [part, setPart] = useState("");
  const groups = useMemo(() => (data ? byHeading(data, part) : []), [data, part]);
  if (!data) return <><PageHead title="Duty bill" /><EmptyWorkspace /></>;
  const change = data.changes[0];
  let entry = 0;
  return <div className="d-grid gap-4">
    <PageHead title="Duty bill" actions={<PartPicker data={data} value={part} onChange={setPart} all="All covered parts" only="covered" />}>
      {change ? `Section 232 duty per entry line at ${percent(change.old_rate)} and ${percent(change.new_rate)} of the full customs value, for goods entered from ${date(change.effective_date)}.` : "Duty per entry line."}
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
              <td><span className="d-block">{partName(line.part_no)}</span><span className="sub"><span className="code">{line.po_id} / {line.line_no}</span>, HTS {hts(PARTS[line.part_no]?.hts10 ?? "")}, {port(line)}</span></td>
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
          <td colSpan={7} className="fw-medium">Total added duty, {groups.reduce((n, g) => n + g.lines.length, 0)} entry lines</td>
          <td className="money fw-medium" style={{ color: "var(--accent-ink)" }}>+{money(groups.reduce((t, g) => t + g.added, 0))}</td>
        </tr></tfoot>
      </table></div>
    </section>
  </div>;
}
