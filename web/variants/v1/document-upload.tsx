"use client";

import { useRef, useState, type FormEvent } from "react";
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
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file || busy) return;
    setStatus("");
    setError("");
    if (file.size > MAX_UPLOAD_BYTES) {
      setError("Choose a file of 20 MB or less.");
      return;
    }
    setBusy(true);
    try {
      const result = await uploadDocument(file);
      setStatus(uploadSummary(result));
      if (input.current) input.current.value = "";
      setFile(null);
      if (result.change_ids.length || result.evidence_doc_ids.length) onUploaded();
    } catch (error) {
      setError(error instanceof Error ? error.message : "Upload failed. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return <section className="panel">
    <div className="panel-header"><h2>Upload a document</h2></div>
    <form className="panel-body stack" onSubmit={submit}>
      <p>{hasChange
        ? "Add a supplier certificate to check its supporting evidence."
        : "Upload the tariff bulletin email or PDF to see which orders are affected."}</p>
      <label className="stack">
        <span>Choose a bulletin or supplier certificate</span>
        <input
          ref={input}
          type="file"
          accept=".eml,.pdf,.jpg,.jpeg,.png,.webp,.gif"
          disabled={busy}
          onChange={event => {
            setFile(event.currentTarget.files?.[0] || null);
            setStatus("");
            setError("");
          }}
        />
      </label>
      <div className="row">
        <button className="primary" type="submit" disabled={!file || busy}>
          {busy ? "Reading document…" : "Upload document"}
        </button>
        <span className="muted small">Email, PDF, or image. Up to 20 MB.</span>
      </div>
      {status && <p role="status">{status}</p>}
      {error && <p role="alert" className="negative">{error}</p>}
    </form>
  </section>;
}
