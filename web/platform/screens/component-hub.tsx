"use client";

import { useEffect, useMemo, useState } from "react";
import { apiRequest } from "@/lib/data";
import type { Citation, Exposure, WorkspaceData } from "@/lib/contracts";
import { actionTitle, date, money, percent } from "@/lib/format";
import { SourceViewer } from "@/variants/v1/source-viewer";
import type { Role } from "../roles";
import { Lineage } from "./specialist";

export function ComponentHub({ data, role }: { data: WorkspaceData; role: Role }) {
  const [changeId, setChangeId] = useState(data.changes[0]?.id);
  const [part, setPart] = useState("");
  const [loaded, setLoaded] = useState<Exposure | null>(null);
  const [failure, setFailure] = useState("");
  const [source, setSource] = useState<Citation | null>(null);
  const change = data.changes.find(item => item.id === changeId) ?? data.changes[0];
  const id = change?.id;
  const exposure = data.exposure.change_id === id ? data.exposure : loaded?.change_id === id ? loaded : null;
  useEffect(() => {
    if (!id || id === data.exposure.change_id) return;
    const controller = new AbortController();
    apiRequest<Exposure>(`/changes/${encodeURIComponent(id)}/exposure`, { signal: controller.signal })
      .then(result => { if (!controller.signal.aborted) setLoaded(result); })
      .catch(error => { if (!controller.signal.aborted) setFailure(error.message); });
    return () => controller.abort();
  }, [id, data.exposure]);

  const parts = [...new Set(exposure?.lines.map(line => line.part_no))].sort();
  const selectedPart = parts.includes(part) ? part : parts[0];
  const lines = exposure?.lines.filter(line => line.part_no === selectedPart) ?? [];
  const scopedGraph = useMemo(() => change && exposure ? { ...data, changes: [change], exposure } : null, [change, exposure, data]);
  if (!change) return null;

  const documents = [
    ...change.citations,
    ...Object.values(change.field_citations ?? {}).flat(),
    ...data.evidence.items.filter(item => item.part_no === selectedPart)
      .flatMap(item => item.bbox_refs.length ? item.bbox_refs : [{ doc_id: item.doc_id, page: 1, bbox: [] }]),
  ].filter((item, index, all) => all.findIndex(other => other.doc_id === item.doc_id && other.page === item.page) === index);

  function selectChange(value: string) {
    setChangeId(value);
    setSource(null);
    setFailure("");
  }

  return <div className="d-grid gap-4">
    <section className="card" aria-labelledby="recent-tariffs">
      <div className="card-header" id="recent-tariffs">Latest tariff updates</div>
      <div className="list-group list-group-flush">
        {data.changes.slice(0, 5).map(item => <button key={item.id} type="button"
          aria-pressed={item.id === id} className="list-group-item list-group-item-action text-start"
          onClick={() => selectChange(item.id)}>
          <strong>{item.measure}</strong><span className="d-block small text-soft">{item.id} · Effective {date(item.effective_date)}</span>
        </button>)}
      </div>
    </section>
    <header className="ks-page-head mb-0">
      <div>
        <h1>{selectedPart ?? "Affected components"}</h1>
        <p>{change.measure} · {percent(change.old_rate)} → {percent(change.new_rate)}</p>
      </div>
      <div className="d-flex gap-2 flex-wrap">
        <div><label htmlFor="hub-part">Component</label><select id="hub-part" className="form-select" value={selectedPart ?? ""} onChange={event => { setPart(event.target.value); setSource(null); }}>
          {!parts.length && <option value="">No affected order lines</option>}
          {parts.map(value => <option key={value}>{value}</option>)}
        </select></div>
        <div><label htmlFor="hub-update">Tariff update</label><select id="hub-update" className="form-select" value={id} onChange={event => selectChange(event.target.value)}>
          {data.changes.map(item => <option key={item.id} value={item.id}>{item.id}</option>)}
        </select></div>
      </div>
    </header>
    {failure ? <p role="alert">{failure}</p> : !exposure ? <p role="status">Loading affected orders…</p> :
      <div className="card"><div className="card-body">
        <h2>{money(lines.reduce((total, line) => total + line.added_duty_usd, 0), 2)} in added duty on {lines.length} open order lines</h2>
        {lines.map(line => <details key={`${line.po_id}-${line.line_no}`}>
          <summary>{line.po_id} / {line.line_no} · {money(line.added_duty_usd, 2)}</summary>
          <p className="small">{line.math ?? `Customs value: ${money(line.customs_value_usd, 2)}.`}</p>
        </details>)}
      </div></div>}
    {data.actions.some(action => selectedPart && action.part_ids.includes(selectedPart)) && <section className="card">
      <div className="card-header">Follow-ups for this component</div>
      <ul className="list-group list-group-flush">
        {data.actions.filter(action => selectedPart && action.part_ids.includes(selectedPart)).map(action => <li className="list-group-item" key={action.id}>
          <strong>{actionTitle(action)}</strong>{action.why && <p className="small text-soft mb-0">{action.why}</p>}
        </li>)}
      </ul>
    </section>}
    <section className="ks-split" aria-label="Documents">
      <div className="card"><div className="card-body">
        <h2>Documents</h2>
        <p className="text-soft">Open the bulletin or supporting evidence to check the source values.</p>
        {Object.entries(change.field_citations ?? {}).map(([field, citations]) => citations[0] &&
          <button className="btn btn-quiet btn-sm me-2 mb-2" key={field} type="button" onClick={() => setSource(citations[0])}>
            {field.replaceAll("_", " ")}
          </button>)}
        {documents.length ? documents.map(item => <button key={`${item.doc_id}-${item.page}`} type="button"
          className="ks-row" onClick={() => setSource(item)}
          aria-pressed={(source ?? documents[0])?.doc_id === item.doc_id && (source ?? documents[0])?.page === item.page}>
          {data.documents?.find(doc => doc.doc_id === item.doc_id)?.filename ?? item.doc_id} · Page {item.page}
        </button>) : <p>No cited documents are available for this update.</p>}
      </div></div>
      <div className="legacy"><SourceViewer citation={source ?? documents[0] ?? null} /></div>
    </section>
    {role.id === "analyst" && scopedGraph && <Lineage data={scopedGraph} />}
  </div>;
}
