"use client";
import { useMemo, useState } from "react";
import { Upload, X } from "lucide-react";
import type { Citation, IntakeDocument, WorkspaceData } from "@/lib/contracts";
import { date, percent, words } from "@/lib/format";
import { DocumentUpload } from "@/variants/v1/document-upload";
import { SourceViewer } from "@/variants/v1/source-viewer";
import { hts } from "../names";
import { PageHead } from "../shell";

const KIND: Record<IntakeDocument["kind"], { label: string; chip: string }> = {
  bulletin: { label: "Bulletin", chip: "chip-ink" },
  supplier_document: { label: "Supplier document", chip: "chip-neutral" },
  unknown: { label: "Needs sorting", chip: "chip-warn" },
};
const VIEWABLE = /^(application\/pdf|image\/)/;

export function Intake({ data, useFixtures, reload }: { data: WorkspaceData | null; useFixtures: boolean; reload: () => void }) {
  const change = data?.changes[0];
  const bulletinId = change?.citations[0]?.doc_id;
  const documents = useMemo(() => data?.documents ?? [], [data]);
  const [uploading, setUploading] = useState(false);
  const [docId, setDocId] = useState<string | undefined>(undefined);
  const [field, setField] = useState("measure");
  const selected = documents.find(doc => doc.doc_id === docId)
    ?? documents.find(doc => doc.doc_id === bulletinId) ?? documents[0];
  const showingBulletin = !!change && (!selected || selected.doc_id === bulletinId || selected.kind === "bulletin");

  const fields = change ? [
    { key: "measure", label: "Measure", value: change.measure },
    { key: "hts_scope", label: "Affected HTS headings", value: change.hts_scope.map(hts).join(", ") },
    { key: "old_rate", label: "Previous rate", value: percent(change.old_rate) },
    { key: "new_rate", label: "New rate", value: percent(change.new_rate) },
    { key: "effective_date", label: "Effective from", value: date(change.effective_date) },
    { key: "basis", label: "Charged on", value: words(change.basis) },
  ] : [];

  let citation: Citation | null = null;
  if (showingBulletin && change) citation = (change.field_citations?.[field] || change.citations)[0] ?? null;
  else if (selected && VIEWABLE.test(selected.media_type)) citation = { doc_id: selected.doc_id, page: 1, bbox: [0, 0, 0, 0] };

  return <div>
    <PageHead title="Documents"
      actions={!useFixtures && <button className="btn btn-primary" onClick={() => setUploading(!uploading)} aria-expanded={uploading}>
        {uploading ? <X aria-hidden="true" className="lucide" /> : <Upload aria-hidden="true" className="lucide" />}
        {uploading ? "Close" : "Upload a document"}</button>}>
      Bulletins and supplier certificates received, and what each one says.
    </PageHead>

    {uploading && <div className="legacy mb-4"><DocumentUpload onUploaded={() => { reload(); setUploading(false); }} hasChange={!!change} /></div>}
    {useFixtures && <div className="alert alert-light mb-4">Uploads go to the live API. This view shows the sample documents.</div>}

    <div className="ks-split">
      <div className="d-grid gap-3">
        {documents.length > 0 && <section className="card" aria-labelledby="received">
          <div className="card-header d-flex justify-content-between align-items-center">
            <span id="received">Received</span>
            {(() => { const n = documents.filter(d => d.review.length).length;
              return <span className={`chip ${n ? "chip-warn" : "chip-good"}`}>{n ? `${n} to check` : "All read"}</span>; })()}
          </div>
          <div>{documents.map(doc => <button key={doc.doc_id} type="button" className="ks-row"
            aria-pressed={selected?.doc_id === doc.doc_id} onClick={() => { setDocId(doc.doc_id); setField("measure"); }}>
            <span className="d-flex justify-content-between gap-2 mb-1">
              <span className={`chip ${KIND[doc.kind].chip}`}>{KIND[doc.kind].label}</span>
              {doc.review.length > 0 && <span className="chip chip-warn">Check</span>}
            </span>
            <span className="d-block small text-soft text-truncate" title={doc.filename}>{doc.filename}</span>
          </button>)}</div>
        </section>}

        {showingBulletin && change ? <section className="card" aria-labelledby="says">
          <div className="card-header d-flex justify-content-between"><span id="says">What the bulletin says</span><span className="code text-soft">{change.id}</span></div>
          <div>{fields.map(item => <button key={item.key} type="button" className="ks-row" aria-pressed={field === item.key}
            onClick={() => setField(item.key)} title="Show where the bulletin says this">
            <span className="d-block k">{item.label}</span><span className="d-block v">{item.value}</span>
          </button>)}</div>
        </section> : selected && <section className="card">
          <div className="card-header">{KIND[selected.kind].label}</div>
          <div className="card-body d-grid gap-2">
            <p className="mb-0">{selected.summary}</p>
            {selected.review.map(note => <div key={note} className="alert alert-warning mb-0 py-2 small">{note}</div>)}
          </div>
        </section>}
      </div>

      <div className="ks-pin">
        {showingBulletin && change && <p className="small text-soft mb-2">Select a field to highlight where the bulletin says it.</p>}
        {citation ? <div className="legacy"><SourceViewer citation={citation} /></div>
          : <div className="card"><div className="card-body text-soft">This document has no page to preview. Its attachments are listed on the left.</div></div>}
      </div>
    </div>
  </div>;
}
