import sources from "./reference-sources.json";
import { useFixtures } from "./data";
import type { Citation } from "./contracts";

export function referenceUrl(citation: Citation): string | undefined {
  if (useFixtures) {
    const source = (sources as Record<string, { original: string }>)[citation.doc_id];
    return source ? `${source.original}#page=${citation.page}` : undefined;
  }
  const base = (process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000").replace(/\/$/, "");
  return `${base}/documents/${encodeURIComponent(citation.doc_id)}#page=${citation.page}`;
}
