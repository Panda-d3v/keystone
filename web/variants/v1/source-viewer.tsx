"use client";
import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import type { Citation } from "@/lib/contracts";
import { useFixtures } from "@/lib/data";
import sources from "@/lib/reference-sources.json";

const PdfPage = dynamic(() => import("./pdf-page"), { ssr: false });

interface Source {
  title: string;
  original: string;
  pages: string[];
}
export function SourceViewer({ citation }: { citation: Citation | null }) {
  const [zoom, setZoom] = useState(100);
  const container = useRef<HTMLElement>(null);
  const [width, setWidth] = useState(600);
  const [liveSource, setLiveSource] = useState<{ docId: string; url: string; pdf: boolean } | null>(null);
  useEffect(() => {
    if (!container.current) return;
    const observer = new ResizeObserver(entries => setWidth(entries[0].contentRect.width));
    observer.observe(container.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (useFixtures || !citation) return;
    const controller = new AbortController();
    let objectUrl = "";
    const base = (process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000").replace(/\/$/, "");
    const docId = citation.doc_id;
    fetch(`${base}/documents/${encodeURIComponent(docId)}`, { signal: controller.signal })
      .then(response => { if (!response.ok) throw new Error("Source unavailable"); return response.blob(); })
      .then(blob => {
        if (controller.signal.aborted) return;
        if (!blob.type.startsWith("image/") && blob.type !== "application/pdf") throw new Error("Unsupported source type");
        objectUrl = URL.createObjectURL(blob);
        setLiveSource({ docId, url: objectUrl, pdf: blob.type === "application/pdf" });
      }).catch(error => { if (error.name !== "AbortError") setLiveSource(null); });
    return () => { controller.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [citation?.doc_id]);
  const [failed, setFailed] = useState("");
  const source = citation ? (sources as Record<string, Source>)[citation.doc_id] : undefined;
  const currentLive = liveSource?.docId === citation?.doc_id ? liveSource : null;
  const pdf = useFixtures ? !!source?.original.endsWith(".pdf") : !!currentLive?.pdf;
  const page = useFixtures
    ? citation && (pdf ? source?.original : source?.pages[citation.page - 1])
    : currentLive?.url;
  const original = useFixtures ? source?.original : currentLive?.url;
  const box = citation?.bbox;
  const validBox = box?.length === 4 && box.every(value => Number.isFinite(value) && value >= 0 && value <= 1)
    && box[2] > box[0] && box[3] > box[1];
  return <section ref={container} className="panel source-viewer" aria-label="Document source">
    <div className="panel-header">
      <h2>Source document</h2>
      {original && <a className="button" href={original} target="_blank" rel="noreferrer">Open original</a>}
    </div>
    {!citation ? <p className="panel-body muted">Select a field to inspect its source.</p> : <>
      <div className="panel-body stack">
        <p className="code">{citation.doc_id}</p>
        <div className="row spread">
          <span>Page {citation.page}</span>
          <label>Zoom <select value={zoom} onChange={event => setZoom(Number(event.target.value))}>
            <option value={100}>100%</option><option value={150}>150%</option><option value={200}>200%</option>
          </select></label>
        </div>
        {citation.quote && <blockquote className="source-quote">{citation.quote}</blockquote>}
      </div>
      {page && failed !== page ? <div className="source-scroll">
        <div className="source-page" style={{ width: `${zoom}%` }}>
          {pdf ? <PdfPage url={page} page={citation.page} width={width * zoom / 100} />
            : <img src={page} alt={`${source?.title || citation.doc_id}, page ${citation.page}`} onError={() => setFailed(page)} />}
          {validBox && <div role="img" aria-label="Highlighted source region" className="source-highlight" style={{
            left: `${box[0] * 100}%`, top: `${box[1] * 100}%`,
            width: `${(box[2] - box[0]) * 100}%`, height: `${(box[3] - box[1]) * 100}%`,
          }} />}
        </div>
      </div> : <p className="panel-body notice">The cited page is unavailable in this workspace.</p>}
    </>}
  </section>;
}
