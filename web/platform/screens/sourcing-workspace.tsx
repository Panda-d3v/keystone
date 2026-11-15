"use client";

import { useEffect, useState } from "react";
import { apiRequest } from "@/lib/data";
import type { DecisionCheck, Exposure, WorkspaceData } from "@/lib/contracts";
import { date, money, percent } from "@/lib/format";
import { componentName, supplierName } from "../names";

export function SourcingWorkspace({ data, page, part, onPart }: {
  data: WorkspaceData;
  page: "home" | "decisions" | "exposure";
  part: string;
  onPart: (part: string) => void;
}) {
  const [otherExposures, setOtherExposures] = useState<Exposure[]>([]);
  const [changeId, setChangeId] = useState("");
  const [catalogError, setCatalogError] = useState("");
  const [comparison, setComparison] = useState<{ key: string; decisions: DecisionCheck[] }>();
  const [comparisonError, setComparisonError] = useState("");
  const [awardId, setAwardId] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    setCatalogError("");
    Promise.all(data.changes.filter(change => change.id !== data.exposure.change_id)
      .map(change => apiRequest<Exposure>(`/changes/${encodeURIComponent(change.id)}/exposure`, { signal: controller.signal })))
      .then(results => { if (!controller.signal.aborted) setOtherExposures(results); })
      .catch(error => { if (!controller.signal.aborted) setCatalogError(error.message); });
    return () => controller.abort();
  }, [data.changes, data.exposure.change_id]);

  const exposureByChange = new Map([data.exposure, ...otherExposures].map(item => [item.change_id, item]));
  const parts = [...new Set([...exposureByChange.values()].flatMap(item => item.lines.map(line => line.part_no)))];
  const selectedPart = part || parts[0];
  const relevant = data.changes.filter(change => exposureByChange.get(change.id)?.lines.some(line => line.part_no === selectedPart));
  const change = relevant.find(item => item.id === changeId) ?? relevant[0];
  const lines = change ? exposureByChange.get(change.id)?.lines.filter(line => line.part_no === selectedPart) ?? [] : [];
  const key = change && selectedPart ? new URLSearchParams({ change_id: change.id, part_no: selectedPart }).toString() : "";

  useEffect(() => {
    if (page !== "decisions" || !key) return;
    const controller = new AbortController();
    setComparisonError("");
    apiRequest<DecisionCheck[]>(`/decisions?${key}`, { signal: controller.signal })
      .then(decisions => { if (!controller.signal.aborted) setComparison({ key, decisions }); })
      .catch(error => { if (!controller.signal.aborted) setComparisonError(error.message); });
    return () => controller.abort();
  }, [page, key]);

  const awards = comparison?.key === key ? comparison.decisions : undefined;
  const award = awards?.find(item => item.decision_id === awardId) ?? awards?.[0];
  const addedDuty = lines.reduce((total, line) => total + line.added_duty_usd, 0);

  return <div className="d-grid gap-4">
    <header>
      <h1 className="mb-1">
        {selectedPart ? <select className="ks-component-title" aria-label="Component" value={selectedPart}
          onChange={event => { onPart(event.target.value); setChangeId(""); setAwardId(""); }}>
          {!parts.includes(selectedPart) && <option value={selectedPart}>{componentName(selectedPart)}</option>}
          {parts.map(id => <option key={id} value={id}>{componentName(id)}</option>)}
        </select> : "Components"}
      </h1>
      {selectedPart && <span className="code text-soft">{selectedPart}</span>}
    </header>
    {catalogError && <p role="alert" className="mb-0">Some tariff updates could not be loaded. {catalogError}</p>}
    {!change ? <p role="status">No affected orders are available for this component yet.</p> : <>
      {page !== "home" && relevant.length > 1 && <label className="w-auto">Tariff update
        <select className="form-select" value={change.id} onChange={event => setChangeId(event.target.value)}>
          {relevant.map(item => <option key={item.id} value={item.id}>{item.measure}</option>)}
        </select>
      </label>}
      {page === "home" && <div className="ks-component-overview">
        <section className="card" aria-labelledby="sourcing-tariffs">
          <h2 className="card-header" id="sourcing-tariffs">Tariff updates for this component</h2>
          <div className="list-group list-group-flush">
            {relevant.map(item => <button key={item.id} type="button" className="list-group-item list-group-item-action text-start"
              aria-pressed={item.id === change.id} onClick={() => setChangeId(item.id)}>
              <strong>{item.measure.split(" (modeled")[0]}</strong><span className="d-block small text-soft">Effective {date(item.effective_date)}</span>
            </button>)}
          </div>
        </section>
        <section className="card"><div className="card-body">
          <h2>{money(addedDuty, 2)} in added duty</h2>
          <p className="mb-0 text-soft">{percent(change.old_rate)} → {percent(change.new_rate)} · {lines.length} affected order {lines.length === 1 ? "line" : "lines"}</p>
        </div></section>
      </div>}
      {page === "decisions" && <section className="card">
        <div className="card-header d-flex align-items-center justify-content-between gap-2 flex-wrap">
          <h2 className="mb-0">Supplier options</h2>
          {awards && awards.length > 1 && <select className="form-select w-auto" aria-label="Supplier award" value={award?.decision_id}
            onChange={event => setAwardId(event.target.value)}>
            {awards.map(item => <option key={item.decision_id}>{item.decision_id}</option>)}
          </select>}
        </div>
        {comparisonError ? <p className="card-body mb-0" role="alert">{comparisonError}</p> : !award ?
          <p className="card-body mb-0" role="status">{awards ? "There is no individual supplier award for this component." : "Loading supplier options…"}</p>
          : <div className="card-body">
            <p className="text-soft">{award.status === "broken" ? "The current award needs review after this tariff update." : award.reason}</p>
            <div className="table-responsive"><table className="table align-middle">
              <thead><tr><th>Option</th><th className="text-end">Annual landed cost</th><th className="text-end">Change from current</th></tr></thead>
              <tbody>
                <tr><th scope="row">Stay with current supplier</th><td className="text-end">{money(award.incumbent_annual_usd)}</td><td className="text-end">—</td></tr>
                <tr><th scope="row">{award.alternative_with_proof_annual_usd === award.alternative_without_proof_annual_usd ? "Switch to alternative supplier" : "Switch with required proof"}</th>
                  <td className="text-end">{money(award.alternative_with_proof_annual_usd)}</td><td className="text-end">{money(award.alternative_with_proof_annual_usd - award.incumbent_annual_usd)}</td></tr>
                {award.alternative_with_proof_annual_usd !== award.alternative_without_proof_annual_usd &&
                  <tr><th scope="row">Switch without required proof</th><td className="text-end">{money(award.alternative_without_proof_annual_usd)}</td>
                    <td className="text-end">{money(award.alternative_without_proof_annual_usd - award.incumbent_annual_usd)}</td></tr>}
              </tbody>
            </table></div>
          </div>}
      </section>}
      {page === "exposure" && <section className="card">
        <div className="card-header"><h2 className="mb-0">Affected orders · {money(addedDuty, 2)} in added duty</h2></div>
        <div className="table-responsive"><table className="table align-middle">
          <thead><tr><th>Order</th><th>Supplier</th><th>Entry date</th><th className="text-end">Added duty</th></tr></thead>
          <tbody>{lines.map(line => <tr key={`${line.po_id}-${line.line_no}`}>
            <th scope="row">{line.po_id} / {line.line_no}</th><td>{supplierName(line.supplier_id)}</td>
            <td>{date(line.est_entry_date)}</td><td className="text-end">{money(line.added_duty_usd, 2)}</td>
          </tr>)}</tbody>
        </table></div>
      </section>}
    </>}
  </div>;
}
