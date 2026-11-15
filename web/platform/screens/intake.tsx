"use client";
import { useState } from "react";
import type { Citation, IntakeDocument, WorkspaceData } from "@/lib/contracts";
import { date, percent, words } from "@/lib/format";
import { DocumentUpload } from "@/variants/v1/document-upload";
import { SourceViewer } from "@/variants/v1/source-viewer";
import { hts } from "../names";

const KIND: Record<IntakeDocument["kind"], { label: string; tone: string }> = {
  bulletin: { label: "Bulletin", tone: "text-bg-primary" },
  supplier_document: { label: "Supplier document", tone: "text-bg-info" },
  unknown: { label: "Needs sorting", tone: "text-bg-warning" },
};

export function Intake({ data, useFixtures, reload }: { data: WorkspaceData | null; useFixtures: boolean; reload: () => void }) {
  const change = data?.changes[0];
  const [field, setField] = useState("measure");
  const fields = change ? [
    { key: "measure", label: "Measure", value: change.measure },
    { key: "hts_scope", label: "Affected HTS headings", value: change.hts_scope.map(hts).join(", ") },
    { key: "old_rate", label: "Previous rate", value: percent(change.old_rate) },
    { key: "new_rate", label: "New rate", value: percent(change.new_rate) },
    { key: "effective_date", label: "Effective from", value: date(change.effective_date) },
    { key: "basis", label: "Charged on", value: words(change.basis) },
  ] : [];
  const citations: Citation[] = change ? change.field_citations?.[field] || change.citations : [];

  return <div className="d-grid gap-4">
    <div><h1 className="mb-1">Intake</h1><p className="text-soft mb-0">Documents received, what they say, and what a person still needs to check.</p></div>

    {useFixtures
      ? <div className="alert alert-light border mb-0">Uploads go to the live API. This view shows the sample documents.</div>
      : <div className="legacy"><DocumentUpload onUploaded={reload} hasChange={!!change} /></div>}

    {!!data?.documents?.length && <ReceivedDocuments documents={data.documents} />}

    {change && <div className="row g-4">
      <div className="col-lg-5">
        <div className="card h-100">
          <div className="card-header d-flex justify-content-between">
            <span>What the bulletin says</span><span className="code text-soft">{change.id}</span>
          </div>
          <div className="list-group list-group-flush">
            {fields.map(item => <button key={item.key} type="button" aria-pressed={field === item.key}
              className="list-group-item list-group-item-action ks-field py-3" onClick={() => setField(item.key)}>
              <span className="d-block small text-soft">{item.label}</span>
              <strong className="d-block">{item.value}</strong>
              <span className="small text-primary">Show where it says this</span>
            </button>)}
          </div>
        </div>
      </div>
      <div className="col-lg-7">
        <div className="legacy h-100"><SourceViewer citation={citations[0] || null} /></div>
      </div>
    </div>}
  </div>;
}

function ReceivedDocuments({ documents }: { documents: IntakeDocument[] }) {
  const toCheck = documents.filter(doc => doc.review.length).length;
  return <section className="card" aria-labelledby="received">
    <div className="card-header d-flex justify-content-between align-items-center">
      <span id="received">Received documents</span>
      <span className={`badge rounded-pill ${toCheck ? "text-bg-warning" : "text-bg-success"}`}>{toCheck ? `${toCheck} to check` : "All read"}</span>
    </div>
    <ul className="list-group list-group-flush">
      {documents.map(doc => <li key={doc.doc_id} className="list-group-item py-3">
        <div className="d-flex justify-content-between gap-3 flex-wrap mb-1">
          <span className={`badge ${KIND[doc.kind].tone}`}>{KIND[doc.kind].label}</span>
          <span className="small text-soft">{doc.filename}</span>
        </div>
        <p className="mb-1">{doc.summary}</p>
        {doc.review.map(note => <div key={note} className="small text-warning-emphasis">{note}</div>)}
      </li>)}
    </ul>
  </section>;
}
