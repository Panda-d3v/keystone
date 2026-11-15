"use client";

import { FileUp } from "lucide-react";
import styles from "./document-upload.module.css";
import { useId, useRef, useState, type FormEvent } from "react";
import { uploadDocument, type UploadResult } from "@/lib/data";

const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

function uploadSummary(result: UploadResult): string {
  const messages = [];
  if (result.change_ids.length) {
    messages.push("Bulletin processed. Select Run impact to review affected orders.");
  }
  if (result.evidence_doc_ids.length) {
    messages.push("Supplier evidence added. Open Evidence to review the requirements.");
  }
  if (result.review_doc_ids.length) {
    messages.push("Some details need review. Check the original document before relying on them.");
  }
  return messages.join(" ") || "No supported document was found. Upload a bulletin or a supplier certificate.";
}

export function DocumentUpload({
  hasChange,
  onUploaded,
}: {
  hasChange: boolean;
  onUploaded: () => void;
}) {
  const inputId = useId();
  const hintId = useId();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [confirmLink, setConfirmLink] = useState(false);
  const [supplierId, setSupplierId] = useState("");
  const [partNo, setPartNo] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [reviews, setReviews] = useState<NonNullable<UploadResult["document_reviews"]>>([]);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file || busy) return;
    setStatus("");
    setReviews([]);
    setError("");
    if (file.size > MAX_UPLOAD_BYTES) {
      setError("Choose a file of 20 MB or less.");
      return;
    }
    setBusy(true);
    try {
      const result = await uploadDocument(file, confirmLink
        ? { supplierId: supplierId.trim(), partNo: partNo.trim() }
        : undefined);
      setStatus(uploadSummary(result));
      setReviews(result.document_reviews || []);
      if (result.change_ids.length || result.evidence_doc_ids.length) {
        if (input.current) input.current.value = "";
        setFile(null);
        setConfirmLink(false);
        onUploaded();
      } else if (result.documents?.some(document => document.kind === "supplier_document")) {
        setConfirmLink(true);
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : "Upload failed. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return <section className={`panel ${styles.panel}`}>
    <div className="panel-header"><h2>Upload a document</h2></div>
    <form className={`panel-body ${styles.form}`} onSubmit={submit}>
      <p>{hasChange
        ? "Add a supplier certificate to check its supporting evidence."
        : "Upload the tariff bulletin email or PDF to see which orders are affected."}</p>
      <div className={styles.picker}>
        <span className={styles.icon}><FileUp aria-hidden="true" size={20} /></span>
        <label htmlFor={inputId} className={styles.label}>Choose a bulletin or supplier certificate</label>
        <span id={hintId} className={styles.hint}>Email (.eml), PDF, or image · Up to 20 MB</span>
        <input
          id={inputId}
          ref={input}
          type="file"
          className={styles.file}
          aria-describedby={hintId}
          accept=".eml,.pdf,.jpg,.jpeg,.png,.webp,.gif"
          disabled={busy}
          onChange={event => {
            setFile(event.currentTarget.files?.[0] || null);
            setStatus("");
            setReviews([]);
            setConfirmLink(false);
            setSupplierId("");
            setPartNo("");
            setError("");
          }}
        />
      </div>
      {file && <div className="stack">
        <label><input type="checkbox" checked={confirmLink} disabled={busy}
          onChange={event => setConfirmLink(event.currentTarget.checked)} /> Confirm supplier and part</label>
        {confirmLink && <>
          <p className="muted small">Use the IDs from your quote or order. Details the scan cannot support still need review.</p>
          <label className="stack">Supplier ID<input value={supplierId} disabled={busy} required
            onChange={event => setSupplierId(event.currentTarget.value)} /></label>
          <label className="stack">Part number<input value={partNo} disabled={busy} required
            onChange={event => setPartNo(event.currentTarget.value)} /></label>
        </>}
      </div>}
      <div className={styles.actions}>
        <button className={styles.submit} type="submit"
          disabled={!file || busy || (confirmLink && (!supplierId.trim() || !partNo.trim()))}>
          {busy ? "Reading document…" : confirmLink ? "Confirm and upload" : "Upload document"}
        </button>
      </div>
      {status && <p role="status">{status}</p>}
      {reviews.length > 0 && <ul className="stack" aria-label="Document review results">
        {reviews.map(item => <li key={item.doc_id}>
          <p>{item.summary}</p>
          {item.review.map(reason => <p className="muted small" key={reason}>{reason}</p>)}
        </li>)}
      </ul>}
      {error && <p role="alert" className="negative">{error}</p>}
    </form>
  </section>;
}
