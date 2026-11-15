"use client";
import { useState } from "react";
import type { Citation, WorkspaceData } from "@/lib/contracts";
import { SourceViewer } from "@/variants/v1/source-viewer";
import type { Role } from "../roles";
import { supplierName, SUPPLIERS } from "../names";
import { EmptyWorkspace, PageHead } from "../shell";

const STATUS: Record<string, { label: string; chip: string }> = {
  checked: { label: "Proven", chip: "chip-good" },
  needs_review: { label: "Unreadable", chip: "chip-warn" },
  mismatch: { label: "Doesn't match", chip: "chip-bad" },
  missing: { label: "Missing", chip: "chip-neutral" },
};
const PASSPORT: Record<string, { label: string; chip: string }> = {
  verified: { label: "All proven", chip: "chip-good" },
  needs_review: { label: "Not proven yet", chip: "chip-warn" },
  missing: { label: "Documents missing", chip: "chip-neutral" },
};
/** What each requirement checks, said plainly. */
const MEANING: Record<string, string> = {
  "part-number": "The certificate names our part number.",
  "heat-batch": "Every heat we ordered is covered.",
  "certificate-origin": "The certificate states the country of origin.",
  "EV-UK-01": "The iron was melted and poured in the United Kingdom, which the lower UK rate requires.",
  "origin-declaration": "A signed origin declaration from the supplier.",
};

export function Evidence({ data, role }: { data: WorkspaceData | null; role: Role }) {
  const evidence = data?.evidence;
  const rows = evidence?.requirements ?? [];
  const first = rows.find(row => row.status !== "checked" && row.citations?.length) ?? rows.find(row => row.citations?.length);
  const [selected, setSelected] = useState<string | undefined>(first?.id);
  if (!data || !evidence) return <EmptyWorkspace />;
  const current = rows.find(row => row.id === selected);
  const citation: Citation | null = current?.citations?.[0] ?? null;
  const heats = [...new Set(evidence.items.map(item => item.batch_id).filter(Boolean))];
  const country = SUPPLIERS[evidence.supplier_id]?.country;
  const passport = PASSPORT[evidence.status] ?? { label: evidence.status, chip: "chip-neutral" };
  const open = rows.filter(row => row.status !== "checked").length;

  return <div>
    <PageHead eyebrow="Evidence passport" title={supplierName(evidence.supplier_id)}
      actions={<span className={`chip ${passport.chip} fs-6 px-3 py-1`}>{passport.label}</span>}>
      {country ? `${country}. ` : ""}Part <span className="code">{evidence.part_no}</span>{heats.length ? `, heats ${heats.join(" and ")}` : ""}.
      {" "}The lower UK rate applies only when every requirement below is proven.
    </PageHead>
    <div className="ks-split">
      <section className="card" aria-labelledby="needs">
        <div className="card-header d-flex justify-content-between"><span id="needs">What the lower rate needs</span><span className="text-soft small">{rows.length - open} of {rows.length} proven</span></div>
        <div>{rows.map(row => {
          const tag = STATUS[row.status] ?? { label: row.status, chip: "chip-neutral" };
          const hasSource = !!row.citations?.length;
          return <button key={row.id} type="button" className="ks-row" aria-pressed={selected === row.id}
            disabled={!hasSource} onClick={() => setSelected(row.id)} title={hasSource ? "Show on the document" : undefined}>
            <span className="d-flex justify-content-between gap-2"><span className="v">{row.label}</span><span className={`chip ${tag.chip}`}>{tag.label}</span></span>
            <span className="d-block k mt-1">{MEANING[row.id] ?? ""}</span>
            {row.status !== "checked" && row.reason && <span className="d-block small mt-1" style={{ color: "var(--warn)" }}>{row.reason}</span>}
          </button>;
        })}</div>
        {evidence.status !== "verified" && <div className="card-footer small text-soft">
          {role.pages.includes("actions") ? "Use Actions to ask the supplier for what's missing."
            : "The sourcing manager sends the supplier the request for what's missing."}
        </div>}
      </section>
      <div className="ks-pin">
        <p className="small text-soft mb-2">{citation ? `Showing: ${current?.label}. Select a requirement to see where it's read.` : "Select a requirement to see where it's read."}</p>
        <div className="legacy"><SourceViewer citation={citation} /></div>
      </div>
    </div>
  </div>;
}
