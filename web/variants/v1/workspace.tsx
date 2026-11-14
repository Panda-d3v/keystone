"use client";
import React from "react";
import Link from "next/link";
import { useState } from "react";
import { Layers, Inbox, ChartNoAxesCombined, GitBranch, FileCheck2, ListChecks, History, Search, RefreshCw } from "lucide-react";
import { screens, routeFor, type Screen } from "@/lib/routes";
import { useWorkspace } from "@/lib/use-workspace";
import { money, percent, date, words } from "@/lib/format";
import type { WorkspaceData } from "@/lib/data";
const icons = [Inbox, ChartNoAxesCombined, GitBranch, FileCheck2, ListChecks, History];

export default function ConsoleWorkspace({ screen }: {screen: Screen}) {
  const { data, error, reload, useFixtures } = useWorkspace();
  const [dark, setDark] = useState(false);
  const [query, setQuery] = useState("");
  const label = screens.find(s => s.id === screen)!.label;
  return <div className="workspace" data-theme={dark ? "dark" : "light"}>
    <aside className="rail"><Link className="brand" href="/"><Layers aria-hidden="true"/>Keystone</Link>
      <nav aria-label="Main navigation">{screens.map((s,i) => { const Icon=icons[i]; return <Link key={s.id} href={routeFor(1,s.id)} aria-current={screen === s.id ? "page" : undefined}><Icon aria-hidden="true"/>{s.label}</Link>; })}</nav>
      <div className="rail-footer"><p className="small muted">Decision integrity for industrial procurement</p><Link href="/">Compare design versions</Link><span className="small muted">Console / Version 1</span></div>
    </aside>
    <div className="workspace-body"><header className="topbar"><div className="row"><strong>MeridianFlow</strong><span className="muted">Procurement workspace</span></div><div className="row"><span className="status">{useFixtures ? "Fixture data" : "Live API"}</span><button onClick={()=>setDark(!dark)}>{dark ? "Light theme" : "Dark theme"}</button><button onClick={reload}><RefreshCw aria-hidden="true"/>Refresh</button></div></header>
      <main id="main" className="main"><div><div className="breadcrumb">Workspace / {screen === "inbox" || screen === "audit" ? label : "Changes / CE-0007 / " + label}</div>
        <div className="page-header"><div><h1>{screen === "exposure" ? "A tariff change. A clear cost." : label}</h1><p>{screen === "inbox" ? "Review incoming documents and the facts extracted from them." : screen === "audit" ? "Follow the record behind every change and action." : "Illustrative bulletin HTA-2026-118"}</p></div>{screen === "inbox" && <Link className="button primary" href={routeFor(1,"exposure")}>Run impact</Link>}</div></div>
        {screen !== "inbox" && screen !== "audit" && <nav className="tabs" aria-label="Change sections">{screens.filter(s => s.id !== "inbox" && s.id !== "audit").map(s => <Link key={s.id} href={routeFor(1,s.id)} aria-current={s.id === screen ? "page" : undefined}>{s.label}</Link>)}</nav>}
        {error ? <div role="alert" className="notice"><p>{error}</p><button onClick={reload}>Retry</button></div> : !data ? <p role="status">Loading workspace…</p> : <>
          {screen === "exposure" && <Exposure data={data} query={query} setQuery={setQuery}/>}
          {screen === "inbox" && <Intake data={data}/>}
          {screen === "decisions" && <Decisions data={data}/>}
          {screen === "evidence" && <Evidence data={data}/>}
          {screen === "actions" && <Actions data={data}/>}
          {screen === "audit" && <Audit data={data}/>}
        </>}
      </main><footer className="scenario">Illustrative scenario. Section 232 layer only; not a duty determination. Other duty layers are outside this demo.</footer>
    </div>
  </div>;
}
function Intake({data}: {data: WorkspaceData}) {
 const change = data.changes[0];
 if (!change) return <p>No changes received.</p>;
 return <div className="split"><section className="panel"><div className="panel-header"><h2>Incoming documents</h2><span className="status">{change.id}</span></div><div className="panel-body stack"><h2>{change.measure}</h2><p>Structured change extracted from the shared bulletin.</p><dl className="key-value"><dt>HTS scope</dt><dd className="code">{change.hts_scope.join(", ")}</dd><dt>Rate</dt><dd>{percent(change.old_rate)} to {percent(change.new_rate)}</dd><dt>Effective date</dt><dd>{date(change.effective_date)}</dd><dt>Duty basis</dt><dd>{words(change.basis)}</dd></dl></div></section><aside className="panel"><div className="panel-header"><h2>Source record</h2></div><div className="panel-body stack">{change.citations.map((c,i) => <div key={i}><p className="code">{c.doc_id}</p><p>Page {c.page}</p><p className="muted small">Source preview unavailable.</p></div>)}</div></aside></div>;
}
function Exposure({data,query,setQuery}: {data: WorkspaceData; query: string; setQuery: (s:string)=>void}) {
 const [sort,setSort] = useState<"po_id" | "added_duty_usd">("po_id");
 const [descending,setDescending] = useState(false);
 const [page,setPage] = useState(0);
 const [selected,setSelected] = useState<WorkspaceData["exposure"]["lines"][number] | null>(null);
 const e=data.exposure;
 const rows=e.lines.filter(row=>`${row.po_id} ${row.part_no} ${row.supplier_id}`.toLowerCase().includes(query.toLowerCase())).sort((a,b)=>{ const n=sort === "added_duty_usd" ? a[sort]-b[sort] : a[sort].localeCompare(b[sort]); return descending ? -n:n; });
 const totalPages=Math.max(1, Math.ceil(rows.length / 10));
 const currentPage=Math.min(page,totalPages-1);
 function sortBy(key: typeof sort) {setSort(key);setDescending(sort === key ? !descending : false);setPage(0);}
 return <><dl className="summary"><div><dt>Affected parts</dt><dd>{e.affected_parts}</dd></div><div><dt>Open PO lines</dt><dd>{e.open_po_lines}</dd></div><div><dt>Added duty</dt><dd>{money(e.added_duty_usd)}</dd></div><div><dt>Annualized added duty</dt><dd>{money(e.annualized_added_duty_usd)}</dd></div></dl>
 <div className={selected ? "split" : "stack"}><section className="panel"><div className="panel-header"><div><h2>Orders affected</h2><p className="muted small">Entries on or after {date(data.changes[0].effective_date)}</p></div><label className="row"><Search aria-hidden="true"/><span className="small">Filter orders</span><input value={query} onChange={e=>{setQuery(e.target.value);setPage(0);}} placeholder="PO, part, or supplier"/></label></div>
 <div className="table-scroll"><table><thead><tr><th aria-sort={sort === "po_id" ? descending ? "descending" : "ascending" : "none"}><button onClick={()=>sortBy("po_id")}>Purchase order</button></th><th>Part</th><th>Supplier</th><th>Entry date</th><th className="money">Customs value</th><th className="money" aria-sort={sort === "added_duty_usd" ? descending ? "descending" : "ascending" : "none"}><button onClick={()=>sortBy("added_duty_usd")}>Added duty</button></th><th>Detail</th></tr></thead><tbody>{rows.slice(currentPage*10,currentPage*10+10).map(row=><tr key={`${row.po_id}-${row.line_no}`}><td className="code">{row.po_id} / {row.line_no}</td><td className="code">{row.part_no}</td><td>{row.supplier_id}</td><td>{date(row.est_entry_date)}</td><td className="money">{money(row.customs_value_usd,2)}</td><td className="money negative">{money(row.added_duty_usd,2)}</td><td><button aria-label={`Show detail for ${row.po_id}`} onClick={()=>setSelected(row)}>Show math</button></td></tr>)}{rows.length === 0 && <tr><td colSpan={7}>No matching orders.</td></tr>}</tbody></table></div>
 <div className="pagination row spread"><p className="muted small">{rows.length} rows. Page {currentPage+1} of {totalPages}.</p><div className="row"><button disabled={currentPage === 0} onClick={()=>setPage(currentPage-1)}>Previous</button><button disabled={currentPage+1 >= totalPages} onClick={()=>setPage(currentPage+1)}>Next</button></div></div></section>
 {selected && <aside className="panel" aria-label="Order math"><div className="panel-header"><h2>{selected.po_id}</h2><button onClick={()=>setSelected(null)}>Close</button></div><div className="panel-body stack"><p className="code">{selected.part_no}</p><dl className="key-value"><dt>Customs value</dt><dd>{money(selected.customs_value_usd,2)}</dd><dt>Added duty</dt><dd>{money(selected.added_duty_usd,2)}</dd></dl><p>Added duty = customs value × the change in the applicable rate. One metals duty per line.</p><p className="muted small">Values shown are from the recorded exposure rows. Detailed rule inputs are not available in this preview.</p></div></aside>}</div></>;
}
function Decisions({data}: {data: WorkspaceData}) {
 return <div className="stack">{data.decisions.map(d=><section className="panel" key={d.decision_id}><div className="panel-header"><div className="row"><h2>{d.decision_id}</h2><span className="status bad">{words(d.status)}</span></div><Link href={routeFor(1,"evidence")}>Review supporting evidence</Link></div><div className="panel-body stack"><p>{d.reason}</p><div className="table-scroll"><table><thead><tr><th>Sourcing option</th><th>Evidence condition</th><th className="money">Annual landed cost</th></tr></thead><tbody><tr><td>Incumbent</td><td>At new rate</td><td className="money">{money(d.incumbent_annual_usd)}</td></tr><tr><td>Alternative</td><td>With melt-and-pour proof</td><td className="money">{money(d.alternative_with_proof_annual_usd)}</td></tr><tr><td>Alternative</td><td>Without proof</td><td className="money">{money(d.alternative_without_proof_annual_usd)}</td></tr></tbody></table></div><p className="notice">The alternative’s lower rate depends on evidence. Resolve missing requirements before committing to a supplier change.</p></div></section>)}</div>;
}
function Evidence({data}: {data: WorkspaceData}) {
 const e=data.evidence;
 return <section className="panel"><div className="panel-header"><h2>Supplier-part passport</h2><span className="status warn">{words(e.status)}</span></div><div className="panel-body stack"><p><span className="code">{e.supplier_id}</span> / <span className="code">{e.part_no}</span></p><h3>Outstanding requirements</h3><ul>{e.missing_requirements.map(r=><li key={r}>{r}</li>)}</ul>{e.items.map(item=><div className="notice" key={item.doc_id}><h3>{words(item.kind)}</h3><p className="code">{item.doc_id}</p><p>Extraction confidence: {percent(item.confidence)}.</p>{Object.entries(item.fields).map(([key,value])=><p key={key}>{key === "melt_location" ? "Where the iron was melted" : words(key)}: {value === null ? "Not established by this document" : String(value)}</p>)}</div>)}<p className="muted small">No evidence value is treated as verified unless the rules service confirms it.</p></div></section>;
}
function Actions({data}: {data: WorkspaceData}) {
 return <div className="stack">{data.actions.map(a=><section className="panel" key={a.id}><div className="panel-header"><h2>{a.rank}. {words(a.type)}</h2><span className="status">{money(a.usd_at_stake)} at stake</span></div><div className="panel-body stack"><p className="code">{a.part_ids.join(", ")}</p><h3>Supplier request</h3><p>{a.draft_email}</p><p className="muted small">Supplier request prepared. Sending is not available in this preview.</p></div></section>)}</div>;
}
function Audit({data}: {data: WorkspaceData}) {
 const [filter,setFilter]=useState("");
 const events=[...data.audit].sort((a,b)=>b.occurred_at.localeCompare(a.occurred_at)).filter(e=>`${e.type} ${e.actor} ${e.entity_id}`.toLowerCase().includes(filter.toLowerCase()));
 return <section className="panel"><div className="panel-header"><h2>Audit events</h2><label className="row">Filter events<input value={filter} onChange={e=>setFilter(e.target.value)} placeholder="Type, actor, or entity"/></label></div><div className="table-scroll"><table><thead><tr><th>Event</th><th>Time (UTC)</th><th>Actor</th><th>Entity</th><th>Hash</th></tr></thead><tbody>{events.map(e=><tr key={e.id}><td>{words(e.type)}</td><td>{e.occurred_at.replace("T"," ").replace("Z","")}</td><td>{e.actor}</td><td className="code">{e.entity_id}</td><td><details><summary className="code">{e.hash.slice(0,12)}</summary><p className="code">{e.hash}</p><p className="code">Previous: {e.previous_hash ?? "Genesis"}</p></details></td></tr>)}{events.length === 0 && <tr><td colSpan={5}>No matching events.</td></tr>}</tbody></table></div></section>;
}
