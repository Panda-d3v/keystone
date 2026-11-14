"use client";
import { useState } from "react";
import type { Citation, WorkspaceData } from "@/lib/contracts";
import { percent, words } from "@/lib/format";
import { SourceViewer } from "./source-viewer";

export function Evidence({ data }: { data: WorkspaceData }) {
  const evidence = data.evidence;
  const requirements = evidence.requirements || [];
  const initial = requirements.find(row => row.status === "needs_review")?.citations?.[0]
    || evidence.items[0]?.bbox_refs[0] || null;
  const [citation, setCitation] = useState<Citation | null>(initial);
  return <div className="document-split">
    <section className="panel">
      <div className="panel-header"><h2>Supplier-part passport</h2><span className="status warn">{words(evidence.status)}</span></div>
      <div className="panel-body stack">
        <p><span className="code">{evidence.supplier_id}</span> / <span className="code">{evidence.part_no}</span></p>
        <p>Evidence must establish every required field with at least 85% confidence.</p>
      </div>
      {requirements.length ? <div className="requirement-list">{requirements.map(row => <article className="requirement" key={row.id}>
        <div className="row spread"><h3>{row.label}</h3><span className={`status ${row.status === "checked" ? "good" : row.status === "needs_review" ? "warn" : "bad"}`}>{words(row.status)}</span></div>
        <p className="code muted">{row.id}</p>
        {row.reason && <p>{row.reason}</p>}
        {!!row.citations?.length && <button onClick={() => setCitation(row.citations![0])}>Inspect {row.label.toLowerCase()} source</button>}
      </article>)}</div> : <div className="panel-body"><h3>Outstanding requirements</h3><ul>{evidence.missing_requirements.map(row => <li key={row}>{row}</li>)}</ul></div>}
      <div className="panel-body stack">{evidence.items.map(item => <details key={`${item.doc_id}-${item.batch_id}`}>
        <summary>{words(item.kind)} {item.batch_id && <span className="code">{item.batch_id}</span>}</summary>
        <p>Extraction confidence {percent(item.confidence)}</p>
        <dl className="key-value">{Object.entries(item.fields).map(([field, value]) => <div className="evidence-field" key={field}>
          <dt>{field === "melt_location" ? "Where the iron was melted" : words(field)}</dt>
          <dd>{value === null ? "Not established by this document" : String(value)}</dd>
        </div>)}</dl>
      </details>)}</div>
    </section>
    <SourceViewer citation={citation} />
  </div>;
}
