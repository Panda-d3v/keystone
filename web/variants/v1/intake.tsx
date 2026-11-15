"use client";
import { useState } from "react";
import type { Citation, IntakeDocument, WorkspaceData } from "@/lib/contracts";
import { date, percent, words } from "@/lib/format";
import { useFixtures } from "@/lib/data";
import sources from "@/lib/reference-sources.json";
import { SourceViewer } from "./source-viewer";

export function Intake({ data }: { data: WorkspaceData }) {
  const change = data.changes[0];
  const [field, setField] = useState("measure");
  if (!change) return <p>No changes received.</p>;
  const fields = [
    { key: "measure", label: "Measure", value: change.measure },
    { key: "hts_scope", label: "HTS scope", value: change.hts_scope.join(", ") },
    { key: "old_rate", label: "Previous rate", value: percent(change.old_rate) },
    { key: "new_rate", label: "New rate", value: percent(change.new_rate) },
    { key: "effective_date", label: "Effective date", value: date(change.effective_date) },
    { key: "basis", label: "Duty basis", value: words(change.basis) },
  ];
  const citations: Citation[] = change.field_citations?.[field] || change.citations;
  return <div className="stack">
    {data.documents?.length ? <ReceivedDocuments documents={data.documents} /> : useFixtures && <section className="panel">
      <div className="panel-header"><h2>Document queue</h2><span className="muted small">Provided demo documents</span></div>
      <div className="table-scroll"><table>
        <thead><tr><th>Document</th><th>Type</th><th>Source</th></tr></thead>
        <tbody>{Object.entries(sources).map(([id, source]) => <tr key={id}>
          <td>{source.title}</td><td>{source.kind}</td><td><a href={source.original} target="_blank" rel="noreferrer">Open original</a></td>
        </tr>)}</tbody>
      </table></div>
    </section>}
    <div className="document-split">
      <section className="panel">
        <div className="panel-header"><h2>Extracted change</h2><span className="code">{change.id}</span></div>
        <div className="field-list">{fields.map(item => <button
          key={item.key} className="source-field" aria-pressed={field === item.key}
          aria-label={`Inspect ${item.label.toLowerCase()} source`} onClick={() => setField(item.key)}>
          <span className="muted small">{item.label}</span><strong>{item.value}</strong><span className="small">View source</span>
        </button>)}</div>
      </section>
      <SourceViewer citation={citations[0] || null} />
    </div>
  </div>;
}

const KIND_LABEL: Record<IntakeDocument["kind"], string> = {
  bulletin: "Bulletin",
  supplier_document: "Supplier document",
  unknown: "Needs sorting",
};

/** What arrived, in plain words, and what a person still has to check. */
function ReceivedDocuments({ documents }: { documents: IntakeDocument[] }) {
  const toCheck = documents.filter(doc => doc.review.length).length;
  return <section className="panel" aria-labelledby="received-documents">
    <div className="panel-header">
      <h2 id="received-documents">Received documents</h2>
      <span className={`status ${toCheck ? "warn" : "good"}`}>{toCheck ? `${toCheck} to check` : "All read"}</span>
    </div>
    <ul className="received-list">{documents.map(doc => <li key={doc.doc_id} className="received-item">
      <div className="row spread">
        <span className="status">{KIND_LABEL[doc.kind]}</span>
        <span className="muted small">{doc.filename}</span>
      </div>
      <p>{doc.summary}</p>
      {doc.review.length > 0 && <ul className="received-review" aria-label={`To check for ${doc.filename}`}>
        {doc.review.map(note => <li key={note}>{note}</li>)}
      </ul>}
    </li>)}</ul>
  </section>;
}
