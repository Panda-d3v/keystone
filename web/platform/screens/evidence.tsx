"use client";
import { useEffect, useState } from "react";
import type { Citation, WorkspaceData } from "@/lib/contracts";
import { PASSPORTS, partName, passportId } from "../catalog";
import { supplierName, SUPPLIERS } from "../names";
import { DocViewer, Dropdown } from "../ui";
import { EmptyWorkspace, PageHead } from "../shell";

const STATUS: Record<string, { label: string; chip: string }> = {
  checked: { label: "Proven", chip: "chip-good" },
  needs_review: { label: "Unreadable", chip: "chip-warn" },
  mismatch: { label: "Doesn't match", chip: "chip-bad" },
  missing: { label: "Missing", chip: "chip-neutral" },
};
const PASSPORT: Record<string, { label: string; chip: string }> = {
  verified: { label: "Complete", chip: "chip-good" },
  needs_review: { label: "Not proven yet", chip: "chip-warn" },
  missing: { label: "Not received yet", chip: "chip-neutral" },
};
/** What each requirement checks, said plainly. */
const MEANING: Record<string, string> = {
  "part-number": "The certificate names our part number.",
  "lots": "Both qualification lots and the date code are listed.",
  "wafer-fab": "For chips, origin is where the wafer was fabricated. A US fab keeps the part out of the duty.",
  "assembly-site": "Where the part was packaged and tested.",
  "origin-declaration": "A signed declaration from the supplier that names the wafer fab.",
  "wafer-fab-foreign": "Where the wafer was fabricated. For chips, this is the country of origin.",
  "certificate-origin": "The country of origin stated on the supplier's certificate.",
  "un383": "Lithium battery transport test summary, needed for every shipment.",
};

export function Evidence({ data }: { data: WorkspaceData | null }) {
  const [key, setKey] = useState(passportId(PASSPORTS[0]));
  useEffect(() => {
    const wanted = new URLSearchParams(window.location.search).get("passport");
    if (wanted && PASSPORTS.some(p => passportId(p) === wanted)) setKey(wanted);
  }, []);
  const evidence = PASSPORTS.find(p => passportId(p) === key) ?? PASSPORTS[0];
  const rows = evidence?.requirements ?? [];
  const first = rows.find(row => row.status !== "checked" && row.citations?.length) ?? rows.find(row => row.citations?.length);
  const [picked, setSelected] = useState<string | undefined>(undefined);
  const selected = rows.some(r => r.id === picked) ? picked : first?.id;
  if (!data) return <><PageHead title="Evidence" /><EmptyWorkspace /></>;
  const choose = (value: string) => { setKey(value); setSelected(undefined); window.history.replaceState(null, "", `?passport=${value}`); };
  const current = rows.find(row => row.id === selected);
  const citation: Citation | null = current?.citations?.[0] ?? null;
  const lots = [...new Set(evidence.items.map(item => item.batch_id).filter(Boolean))];
  const country = SUPPLIERS[evidence.supplier_id]?.country;
  const passport = PASSPORT[evidence.status] ?? { label: evidence.status, chip: "chip-neutral" };
  const open = rows.filter(row => row.status !== "checked").length;

  return <div>
    <PageHead title={supplierName(evidence.supplier_id)}
      actions={<>
        <span className={`chip ${passport.chip} fs-6 px-3 py-1`}>{passport.label}</span>
        <Dropdown label="Evidence file" value={key} onChange={choose} className="ks-part-dd" align="end"
          options={PASSPORTS.map(p => ({ value: passportId(p), label: `${supplierName(p.supplier_id)}`, sub: `${partName(p.part_no)}, ${p.part_no}` }))} />
      </>}>
      {partName(evidence.part_no)} (<span className="code">{evidence.part_no}</span>){lots.length ? `, lots ${lots.join(" and ")}` : ""}, from {SUPPLIERS[evidence.supplier_id]?.city}{country && country !== "United States" ? `, ${country}` : ""}.
      {" "}{evidence.purpose}
    </PageHead>
    <div className="ks-split">
      <section className="card" aria-labelledby="needs">
        <div className="card-header d-flex justify-content-between"><span id="needs">Requirements</span><span className="text-soft small">{rows.length - open} of {rows.length} proven</span></div>
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
          The sourcing manager requests the missing documents from the supplier.
        </div>}
      </section>
      <div className="ks-pin">
        {citation ? <DocViewer citation={citation} /> : <div className="card"><div className="card-body text-soft">No document on file for this supplier and part yet.</div></div>}
      </div>
    </div>
  </div>;
}
