"use client";

import { useEffect, useState } from "react";
import { Check, ChevronRight, Circle, Layers } from "lucide-react";
import Link from "next/link";
import { money, percent } from "@/lib/format";
import { costs, phoneCases, workflow, type Choice } from "../phone-cases";
import { ROLES, type PageId, type Role, type RoleId } from "../roles";

const storageKey = "keystone.phone-decisions.v1";

export function PhoneWorkflow({ page, role, onRole }: {
  page: PageId;
  role: Role;
  onRole: (role: RoleId) => void;
}) {
  const [caseId, setCaseId] = useState(phoneCases[0].id);
  const [choices, setChoices] = useState<Record<string, Choice>>({});
  const [saveError, setSaveError] = useState(false);
  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    setCaseId(query.get("case") ?? phoneCases[0].id);
    try {
      const stored = JSON.parse(localStorage.getItem(storageKey) ?? "{}");
      setChoices(Object.fromEntries(Object.entries(stored ?? {}).filter(
        ([, value]) => value === "keep" || value === "switch",
      )) as Record<string, Choice>);
    } catch { /* Start with seeded decisions. */ }
  }, [page]);

  const tariff = phoneCases.find(item => item.id === caseId) ?? phoneCases[0];
  const step = workflow.find(item => item.id === page)
    ?? workflow[page === "evidence" ? 3 : page === "lineage" ? 1 : page === "audit" || (page === "home" && role.id === "approver") ? 4 : 0];
  const href = (id: string) => `/${id}?case=${tariff.id}`;
  const entries = tariff.components.map(component => {
    const choice = choices[component.id] ?? component.decision;
    const complete = choice === "keep" || (choice === "switch" && component.verified);
    return { component, choice, complete, ...costs(component, tariff) };
  });
  const complete = entries.filter(entry => entry.complete).length;
  const ready = complete === entries.length;
  const projected = entries.reduce((total, entry) =>
    total + (entry.choice === "switch" && entry.complete ? entry.savings : 0), 0);
  const scope = entries.map(({ component }) => `${component.name} (${component.id})`).join(", ");
  const bulletin = `Sample tariff bulletin ${tariff.id}
${tariff.title}
Effective ${tariff.effective}
Duty: ${percent(tariff.previousRate)} to ${percent(tariff.rate)} of customs value
Scope: ${scope}
`;
  const next = workflow[workflow.indexOf(step) + 1];

  function choose(id: string, value: Choice) {
    const updated = { ...choices, [id]: value };
    try {
      localStorage.setItem(storageKey, JSON.stringify(updated));
      setSaveError(false);
      setChoices(updated);
    } catch {
      setSaveError(true);
    }
  }

  return <div className="ks phone-workspace">
    <header className="ks-topbar ks-no-print">
      <Link href="/" className="ks-brand phone-brand"><span className="ks-brand-mark"><Layers aria-hidden="true" /></span>Keystone</Link>
      <div className="ms-auto d-flex align-items-center gap-2">
        <span className="chip chip-neutral d-none d-sm-inline-flex">Sample data</span>
        <label className="visually-hidden" htmlFor="phone-role">Viewing as</label>
        <select className="form-select form-select-sm" id="phone-role" value={role.id}
          onChange={event => onRole(event.target.value as RoleId)}>
          {ROLES.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
        </select>
      </div>
    </header>
    <main className="ks-main phone-main">
      <header className="ks-page-head">
        <div><div className="eyebrow">Smartphone sourcing · {tariff.id}</div>
          <h1>{tariff.title}</h1><p>{tariff.product} · {complete} of {entries.length} component decisions complete</p></div>
        <div className="ks-no-print"><label htmlFor="phone-case" className="small fw-medium">Tariff case</label>
          <select id="phone-case" className="form-select" value={tariff.id} onChange={event => {
            setCaseId(event.target.value);
            const url = new URL(window.location.href);
            url.searchParams.set("case", event.target.value);
            window.history.replaceState(null, "", url);
          }}>
            {phoneCases.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}
          </select></div>
      </header>
      <nav aria-label="Tariff workflow" className="phone-steps ks-no-print">
        {workflow.map((item, index) => {
          const done = index < 2 || (index < 4 && ready);
          const Icon = done ? Check : Circle;
          return <Link key={item.id} href={href(item.id)} aria-current={step.id === item.id ? "step" : undefined}>
            <Icon aria-label={done ? "Complete" : undefined} aria-hidden={!done} className="lucide" />
            {item.label}<ChevronRight aria-hidden="true" className="lucide phone-chevron" />
          </Link>;
        })}
      </nav>
      <section className="phone-section" aria-labelledby="phone-stage">
        <div className="d-flex align-items-center justify-content-between gap-3 flex-wrap">
          <h2 id="phone-stage" className="mb-0">{step.label}</h2>
          {step.id === "brief" && <button className="btn btn-quiet ks-no-print" onClick={() => window.print()}>Print or save PDF</button>}
        </div>
        {step.id === "intake" && <article className="card"><div className="card-body">
          <div className="eyebrow">Sample tariff bulletin · {tariff.id}</div>
          <h3 className="h5 mt-2">{tariff.title}</h3>
          <p>Effective {tariff.effective}, modeled duty on the listed components rises from {percent(tariff.previousRate)} to {percent(tariff.rate)} of customs value.</p>
          <p><strong>Scope:</strong> {scope}.</p>
          <a download={`${tariff.id}-sample-bulletin.txt`} href={`data:text/plain;charset=utf-8,${encodeURIComponent(bulletin)}`}>Download sample bulletin</a>
        </div></article>}
        {step.id === "brief" && <p className="mb-0"><strong>{ready ? "Component decisions complete" : "Open items remain"}</strong> · {money(projected)} in modeled first-year savings from confirmed switches.</p>}
        {saveError && <p role="alert">The decision could not be saved in this browser.</p>}
        {step.id !== "intake" && <div className="phone-components">
          {entries.map(({ component, choice, complete, addedDuty, keep, savings }) => (
            <article className="card" key={component.id}><div className="card-body d-grid gap-3">
              <div className="d-flex justify-content-between align-items-start gap-2">
                <div><div className="eyebrow">{component.id}</div><h3 className="h5 mb-0">{component.name}</h3></div>
                <span className={`chip ${complete ? "chip-good" : "chip-warn"}`}>{complete ? "Completed" : choice ? "Evidence needed" : "In review"}</span>
              </div>
              <p className="mb-0">{component.supplier} · {component.volume.toLocaleString("en-US")} units/year</p>
              {step.id === "exposure" && <details><summary><strong>{money(Math.round(addedDuty * component.volume))}</strong> added duty per year</summary>
                <p className="mb-0 small">{money(component.unitValue, 2)} customs value per unit × {percent(tariff.rate - tariff.previousRate)} added duty × {component.volume.toLocaleString("en-US")} units.</p></details>}
              {step.id === "decisions" && <>
                <dl className="phone-options mb-0">
                  <div><dt>Keep {component.supplier}</dt><dd>{money(keep, 2)} per unit with modeled duty</dd></div>
                  <div><dt>Switch to {component.alternative}</dt><dd>{money(component.alternativeUnitCost, 2)} per unit with 0% modeled duty if origin qualifies</dd></div>
                </dl>
                <p className="mb-0"><strong>{money(Math.abs(savings))}</strong> {savings >= 0 ? "saved" : "extra cost"} in year one after {money(component.qualificationCost)} qualification cost.</p>
                {component.name === "Processor" && <p className="small text-soft mb-0">A different processor requires board, firmware, thermal, and carrier validation before launch.</p>}
                {role.id === "sourcing" && <div className="d-flex gap-2 flex-wrap" aria-label={`${component.name} decision`}>
                  <button className={`btn ${choice === "keep" ? "btn-primary" : "btn-quiet"}`} aria-pressed={choice === "keep"} onClick={() => choose(component.id, "keep")}>Keep supplier</button>
                  <button className={`btn ${choice === "switch" ? "btn-primary" : "btn-quiet"}`} aria-pressed={choice === "switch"} onClick={() => choose(component.id, "switch")}>Choose alternative</button>
                </div>}
              </>}
              {step.id === "actions" && <details open={!complete}><summary>{choice === "keep" ? "Retain the current purchase plan" : component.verified ? "Review the supplier evidence pack" : "Request origin and qualification records"}</summary>
                <p className="mb-0 small">{choice === "keep" ? "Sourcing recorded a decision to keep the incumbent." : component.verified
                  ? `${component.alternative} provided a sample site-origin declaration, capacity quote and qualification sign-off.`
                  : `Ask ${component.alternative} for a site-origin declaration, available volume and qualification dates.`}</p>
              </details>}
              {step.id === "brief" && <p className="mb-0">{choice === "keep" ? `Keep ${component.supplier}.` : choice === "switch" ? `Switch to ${component.alternative}.` : "Sourcing decision pending."}
                {choice === "switch" && !complete && " Origin and qualification evidence still needed."}</p>}
            </div></article>
          ))}
        </div>}
        {next && <div className="ks-no-print"><Link className="btn btn-primary" href={href(next.id)}>Next: {next.label}</Link></div>}
      </section>
    </main>
  </div>;
}
