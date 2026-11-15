"use client";
import { useState } from "react";
import Link from "next/link";
import type { Citation, WorkspaceData } from "@/lib/contracts";
import { SourceViewer } from "@/variants/v1/source-viewer";
import type { Role } from "../roles";
import { supplierName, SUPPLIERS } from "../names";
import { EmptyWorkspace } from "../shell";

const STATUS: Record<string, { label: string; tone: string }> = {
  checked: { label: "Proven", tone: "text-bg-success" },
  needs_review: { label: "Unreadable", tone: "text-bg-warning" },
  mismatch: { label: "Doesn't match", tone: "text-bg-danger" },
  missing: { label: "Missing", tone: "text-bg-secondary" },
};
const PASSPORT: Record<string, { label: string; tone: string }> = {
  verified: { label: "All proven", tone: "text-bg-success" },
  needs_review: { label: "Not proven yet", tone: "text-bg-warning" },
  missing: { label: "Documents missing", tone: "text-bg-secondary" },
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
  const passport = PASSPORT[evidence.status] ?? { label: evidence.status, tone: "text-bg-light" };

  return <div className="d-grid gap-4">
    <div className="d-flex justify-content-between align-items-end flex-wrap gap-2">
      <div><h1 className="mb-1">Evidence</h1>
        <p className="text-soft mb-0">{supplierName(evidence.supplier_id)}{country ? ` (${country})` : ""}, part <span className="code">{evidence.part_no}</span>{heats.length ? `, heats ${heats.join(" and ")}` : ""}.</p></div>
      <span className={`badge fs-6 ${passport.tone}`}>{passport.label}</span>
    </div>
    <div className="row g-4">
      <div className="col-lg-5">
        <div className="card h-100">
          <div className="card-header">What the lower rate needs</div>
          <div className="list-group list-group-flush">
            {rows.map(row => {
              const tag = STATUS[row.status] ?? { label: row.status, tone: "text-bg-light" };
              const hasSource = !!row.citations?.length;
              return <div key={row.id} className={`list-group-item py-3 ${selected === row.id ? "bg-primary-subtle" : ""}`}>
                <div className="d-flex justify-content-between gap-2">
                  <strong>{row.label}</strong><span className={`badge ${tag.tone}`}>{tag.label}</span>
                </div>
                <div className="small text-soft">{MEANING[row.id] ?? ""}</div>
                {row.status !== "checked" && row.reason && <div className="small mt-1">{row.reason}</div>}
                {hasSource && <button className="btn btn-link btn-sm px-0" onClick={() => setSelected(row.id)} aria-pressed={selected === row.id}>
                  Show on the document</button>}
              </div>;
            })}
          </div>
          {role.pages.includes("actions") && evidence.status !== "verified" && <div className="card-footer bg-white">
            <Link href="/actions" className="btn btn-primary btn-sm">Ask the supplier for what&apos;s missing</Link>
          </div>}
        </div>
      </div>
      <div className="col-lg-7"><div className="legacy h-100"><SourceViewer citation={citation} /></div></div>
    </div>
  </div>;
}
