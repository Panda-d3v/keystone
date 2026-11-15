"use client";
// Shared controls: a dropdown that replaces native selects, and a document
// viewer that shows the cited page with the field highlighted.
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { Check, ChevronDown, ExternalLink, Search } from "lucide-react";
import type { Citation } from "@/lib/contracts";
import { sources } from "./store";

export interface Option { value: string; label: string; sub?: string; icon?: ReactNode; group?: string }

/** A listbox dropdown with keyboard support and optional search. */
export function Dropdown({ label, value, options, onChange, searchable = false, align = "start", className = "", footer, renderButton }: {
  label: string; value: string; options: Option[]; onChange: (value: string) => void;
  searchable?: boolean; align?: "start" | "end"; className?: string; footer?: ReactNode;
  renderButton?: (selected: Option | undefined) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const list = useId();
  const selected = options.find(o => o.value === value);
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? options.filter(o => `${o.label} ${o.sub ?? ""} ${o.value}`.toLowerCase().includes(q)) : options;
  }, [options, query]);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", close);
    setActive(Math.max(0, shown.findIndex(o => o.value === value)));
    if (searchable) setTimeout(() => search.current?.focus(), 0);
    return () => document.removeEventListener("mousedown", close);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function choose(option: Option | undefined) {
    if (!option) return;
    onChange(option.value); setOpen(false); setQuery(""); button.current?.focus();
  }
  function onKey(event: React.KeyboardEvent) {
    if (!open) {
      if (["ArrowDown", "Enter", " "].includes(event.key)) { event.preventDefault(); setOpen(true); }
      return;
    }
    if (event.key === "Escape") { event.preventDefault(); setOpen(false); button.current?.focus(); }
    else if (event.key === "ArrowDown") { event.preventDefault(); setActive(i => Math.min(shown.length - 1, i + 1)); }
    else if (event.key === "ArrowUp") { event.preventDefault(); setActive(i => Math.max(0, i - 1)); }
    else if (event.key === "Enter") { event.preventDefault(); choose(shown[active]); }
  }

  let lastGroup: string | undefined;
  return <div className={`ks-dd ${className}`} ref={root} onKeyDown={onKey}>
    <button ref={button} type="button" className="ks-dd-button" aria-haspopup="listbox" aria-expanded={open}
      aria-label={`${label}: ${selected?.label ?? "none"}`} onClick={() => setOpen(!open)}>
      {renderButton ? renderButton(selected) : <>
        {selected?.icon}
        <span className="ks-dd-text"><span className="ks-dd-label">{selected?.label ?? label}</span>
          {selected?.sub && <span className="ks-dd-sub">{selected.sub}</span>}</span>
      </>}
      <ChevronDown aria-hidden="true" className={`lucide ks-dd-chevron ${open ? "open" : ""}`} />
    </button>
    {open && <div className={`ks-dd-menu ${align === "end" ? "end" : ""}`}>
      {searchable && <div className="ks-dd-search"><Search aria-hidden="true" className="lucide" />
        <input ref={search} value={query} onChange={e => { setQuery(e.target.value); setActive(0); }}
          placeholder="Search" aria-label={`Search ${label.toLowerCase()}`} aria-controls={list} /></div>}
      <ul role="listbox" id={list} aria-label={label}>
        {shown.map((option, index) => {
          const heading = option.group && option.group !== lastGroup ? option.group : undefined;
          lastGroup = option.group;
          return <li key={option.value} role="presentation">
            {heading && <div className="ks-dd-group">{heading}</div>}
            <div role="option" aria-selected={option.value === value} className={`ks-dd-option ${index === active ? "active" : ""}`}
              onMouseEnter={() => setActive(index)} onMouseDown={e => e.preventDefault()} onClick={() => choose(option)}>
              {option.icon}
              <span className="ks-dd-text"><span className="ks-dd-label">{option.label}</span>{option.sub && <span className="ks-dd-sub">{option.sub}</span>}</span>
              {option.value === value && <Check aria-hidden="true" className="lucide ks-dd-check" />}
            </div>
          </li>;
        })}
        {!shown.length && <li className="ks-dd-empty">No matches</li>}
      </ul>
      {footer && <div className="ks-dd-footer">{footer}</div>}
    </div>}
  </div>;
}

/** The cited page with the cited field outlined. Fits the column; no zoom. */
export function DocViewer({ citation, title }: { citation: Citation | null; title?: string }) {
  const source = citation ? sources[citation.doc_id] : undefined;
  const page = citation && source ? source.pages[citation.page - 1] : undefined;
  const box = citation?.bbox;
  const valid = box?.length === 4 && box[2] > box[0] && box[3] > box[1];
  return <section className="card ks-doc" aria-label="Source document">
    <div className="card-header d-flex justify-content-between align-items-center gap-2">
      <span className="text-truncate">{title ?? source?.title ?? "Source document"}</span>
      {source && <a className="link-arrow small" href={source.original} target="_blank" rel="noreferrer">Open original <ExternalLink aria-hidden="true" className="lucide" /></a>}
    </div>
    {!citation ? <div className="card-body text-soft">Select a field to see where it is read.</div>
      : !page ? <div className="card-body text-soft">This document has no page to preview.</div>
      : <div className="ks-doc-page">
        <img src={page} alt={`${source?.title ?? citation.doc_id}, page ${citation.page}`} />
        {valid && box && <div role="img" aria-label="Highlighted source region" className="ks-doc-mark" style={{
          left: `calc(${box[0] * 100}% - 4px)`, top: `calc(${box[1] * 100}% - 3px)`,
          width: `calc(${(box[2] - box[0]) * 100}% + 8px)`, height: `calc(${(box[3] - box[1]) * 100}% + 6px)`,
        }} />}
      </div>}
    {citation?.quote && <div className="card-footer small"><span className="text-soft">Reads: </span>“{citation.quote}”</div>}
  </section>;
}
