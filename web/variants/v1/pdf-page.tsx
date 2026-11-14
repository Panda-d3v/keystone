"use client";
import { Document, Page, pdfjs } from "react-pdf";
pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();

export default function PdfPage({ url, page, width }: { url: string; page: number; width: number }) {
  return <Document file={url} loading={<p>Loading PDF…</p>} error={<p role="alert">The PDF could not be loaded. Try opening the original.</p>}>
    <Page pageNumber={page} width={width} renderTextLayer={false} renderAnnotationLayer={false}
      loading={<p>Rendering page…</p>} error={<p role="alert">This page is unavailable.</p>} />
  </Document>;
}
