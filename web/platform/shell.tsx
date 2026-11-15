"use client";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ClipboardCheck, FileSearch, FileText, GitBranch, Home, Inbox, Layers, ListChecks,
  RefreshCw, Scale, ScrollText, TrendingUp,
} from "lucide-react";
import { useWorkspace } from "@/lib/use-workspace";
import type { WorkspaceData } from "@/lib/contracts";
import { DEFAULT_ROLE, PAGES, ROLES, ownerOf, roleById, type PageId, type Role, type RoleId } from "./roles";

const ICONS: Record<PageId, typeof Home> = {
  home: Home, intake: Inbox, exposure: TrendingUp, decisions: Scale, evidence: FileSearch,
  actions: ListChecks, lineage: GitBranch, brief: FileText, audit: ScrollText,
};
const STORAGE_KEY = "keystone.role";

export interface PlatformContext {
  role: Role;
  setRole: (id: RoleId) => void;
  data: WorkspaceData | null;
  reload: () => void;
  useFixtures: boolean;
}
const Ctx = createContext<PlatformContext | null>(null);
export function usePlatform(): PlatformContext {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("usePlatform must be used inside <Shell>");
  return ctx;
}

/** Role chosen by ?as=, then the viewer's last choice, then the default. */
function useRole(): [Role, (id: RoleId) => void] {
  const [id, setId] = useState<RoleId>(DEFAULT_ROLE);
  useEffect(() => {
    const fromUrl = new URLSearchParams(window.location.search).get("as");
    let stored: string | null = null;
    try { stored = window.localStorage.getItem(STORAGE_KEY); } catch { /* private mode */ }
    const chosen = roleById(fromUrl || stored).id;
    setId(chosen);
    // A role picked by link (e.g. a demo URL with ?as=approver) sticks for the next page too.
    if (fromUrl) try { window.localStorage.setItem(STORAGE_KEY, chosen); } catch { /* private mode */ }
  }, []);
  const choose = useCallback((next: RoleId) => {
    setId(next);
    try { window.localStorage.setItem(STORAGE_KEY, next); } catch { /* private mode */ }
  }, []);
  return [roleById(id), choose];
}

export function Shell({ page, children }: { page: PageId; children: (ctx: PlatformContext) => ReactNode }) {
  const { data, error, loading, reload, useFixtures } = useWorkspace();
  const [role, setRole] = useRole();
  const router = useRouter();
  // The approver's home is the Brief; everyone else starts on Home.
  const shown: PageId = page === "home" ? role.home : page;
  const allowed = role.pages.includes(shown);

  function switchRole(next: RoleId) {
    const nextRole = roleById(next);
    setRole(next);
    if (page !== "home" && !nextRole.pages.includes(page)) router.push(PAGES[nextRole.home].path);
  }

  const ctx: PlatformContext = { role, setRole: switchRole, data, reload, useFixtures };
  return <Ctx.Provider value={ctx}>
    <div className="ks">
      <header className="ks-topbar d-flex align-items-center gap-3 px-3 px-md-4">
        <Link href="/" className="ks-brand"><Layers aria-hidden="true" className="lucide" />Keystone</Link>
        <span className="text-soft d-none d-lg-inline">MeridianFlow procurement</span>
        <div className="ms-auto d-flex align-items-center gap-2 gap-md-3">
          <span className={`badge rounded-pill d-none d-sm-inline ${useFixtures ? "text-bg-light border" : "text-bg-success"}`}>
            {useFixtures ? "Sample data" : "Live"}
          </span>
          <button className="btn btn-sm btn-outline-secondary d-inline-flex align-items-center gap-1" onClick={reload}>
            <RefreshCw aria-hidden="true" className="lucide" /><span className="d-none d-md-inline">Refresh</span>
          </button>
          <div className="d-flex align-items-center gap-2">
            <span className="ks-avatar d-none d-sm-inline-flex" aria-hidden="true">{role.initials}</span>
            <div className="d-flex flex-column">
              <label htmlFor="ks-role" className="small text-soft lh-1 mb-1">Viewing as</label>
              <select id="ks-role" className="form-select form-select-sm ks-role-select" value={role.id}
                onChange={event => switchRole(event.target.value as RoleId)}>
                {ROLES.map(item => <option key={item.id} value={item.id}>{item.person}, {item.label}</option>)}
              </select>
            </div>
          </div>
        </div>
      </header>
      <nav className="ks-mobile-nav nav" aria-label="Sections">
        {role.pages.map(id => <Link key={id} href={PAGES[id].path}
          className={`nav-link ${id === shown ? "active" : ""}`} aria-current={id === shown ? "page" : undefined}>
          {PAGES[id].label}</Link>)}
      </nav>
      <div className="d-flex">
        <aside className="ks-sidebar p-3">
          <p className="small text-soft mb-2 px-2">{role.label}</p>
          <nav className="nav flex-column gap-1" aria-label="Main navigation">
            {role.pages.map(id => {
              const Icon = ICONS[id];
              return <Link key={id} href={PAGES[id].path} className={`nav-link ${id === shown ? "active" : ""}`}
                aria-current={id === shown ? "page" : undefined}>
                <Icon aria-hidden="true" className="lucide" />{PAGES[id].label}
              </Link>;
            })}
          </nav>
          <hr />
          <p className="small text-soft px-2 mb-0">{role.focus}</p>
        </aside>
        <main className="ks-main">
          {error ? <div className="alert alert-warning d-flex justify-content-between align-items-center" role="alert">
            <span>{error}</span><button className="btn btn-sm btn-outline-dark" onClick={reload}>Try again</button>
          </div> : !allowed ? <RoleGate page={shown} onSwitch={switchRole} />
            : loading && !data ? <p className="text-soft" role="status">Loading…</p>
            : children(ctx)}
          <p className="ks-banner mt-5 mb-0 ks-no-print">
            Illustrative MeridianFlow scenario. Section 232 layer only; not a duty determination.
          </p>
        </main>
      </div>
    </div>
  </Ctx.Provider>;
}

function RoleGate({ page, onSwitch }: { page: PageId; onSwitch: (id: RoleId) => void }) {
  const owner = ownerOf(page);
  return <div className="card"><div className="card-body p-4">
    <h1 className="h4">{PAGES[page].label} is in the {owner?.label.toLowerCase()} view</h1>
    <p className="text-soft">{PAGES[page].description}. Switch roles to open it.</p>
    {owner && <button className="btn btn-primary" onClick={() => onSwitch(owner.id)}>View as {owner.person}, {owner.label}</button>}
  </div></div>;
}

/** Shown when the API has no tariff change yet. */
export function EmptyWorkspace() {
  return <div className="card"><div className="card-body p-4">
    <ClipboardCheck aria-hidden="true" className="lucide mb-2 text-primary" />
    <h1 className="h4">No tariff changes yet</h1>
    <p className="text-soft mb-3">Upload a bulletin or forward the email in Intake. Keystone reads it, finds the affected orders and checks your supplier decisions.</p>
    <Link className="btn btn-primary" href="/intake">Go to Intake</Link>
  </div></div>;
}
