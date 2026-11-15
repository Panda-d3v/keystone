"use client";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ChevronRight, ClipboardCheck, FileSearch, FileText, GitBranch, Home, Inbox, Layers, ListChecks,
  RefreshCw, Scale, ScrollText, TrendingUp,
} from "lucide-react";
import { PhoneWorkflow } from "./screens/phone-workflow";
import { useWorkspace } from "@/lib/use-workspace";
import type { WorkspaceData } from "@/lib/contracts";
import { DEFAULT_ROLE, PAGES, ROLES, ownerOf, pageLabel, roleById, type PageId, type Role, type RoleId } from "./roles";

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

/** The same header on every page: eyebrow, title, one line of context, actions. */
export function PageHead({ eyebrow, title, children, actions }: {
  eyebrow?: string; title: string; children?: ReactNode; actions?: ReactNode;
}) {
  return <header className="ks-page-head">
    <div>
      {eyebrow && <div className="eyebrow">{eyebrow}</div>}
      <h1 className="mb-0">{title}</h1>
      {children && <p>{children}</p>}
    </div>
    {actions && <div className="d-flex gap-2 flex-wrap ks-no-print">{actions}</div>}
  </header>;
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

  if (useFixtures) return <PhoneWorkflow page={page} role={role} onRole={setRole} />;

  const ctx: PlatformContext = { role, setRole: switchRole, data, reload, useFixtures };
  return <Ctx.Provider value={ctx}>
    <div className="ks ks-layout">
      <div className="ks-body">
        <header className="ks-topbar">
          <Link href="/" className="ks-brand phone-brand p-0" style={{ color: "var(--ink)" }}>
            <span className="ks-brand-mark"><Layers aria-hidden="true" className="lucide" /></span></Link>
          <div className="ks-crumbs"><span>Procurement</span><span aria-hidden="true">/</span><strong>{pageLabel(role, shown)}</strong></div>
          <div className="ms-auto d-flex align-items-center gap-2">
            <button className="btn btn-quiet btn-sm" onClick={reload} aria-label="Refresh data">
              <RefreshCw aria-hidden="true" className="lucide" /><span className="d-none d-md-inline">Refresh</span></button>
            <div className="ks-role">
              <span className="ks-avatar d-none d-sm-inline-flex" aria-hidden="true">{role.initials}</span>
              <label htmlFor="ks-role" className="visually-hidden">Viewing as</label>
              <select id="ks-role" className="form-select form-select-sm" value={role.id}
                onChange={event => switchRole(event.target.value as RoleId)}>
                {ROLES.map(item => <option key={item.id} value={item.id}>{item.person}, {item.label}</option>)}
              </select>
            </div>
          </div>
        </header>
        <main className="ks-main">
          <nav className="phone-steps ks-live-steps ks-no-print mb-4" aria-label="Main navigation">
            {role.pages.map(id => {
              const Icon = ICONS[id];
              return <Link key={id} href={PAGES[id].path} aria-current={id === shown ? "page" : undefined}>
                <Icon aria-hidden="true" className="lucide" />{pageLabel(role, id)}<ChevronRight aria-hidden="true" className="lucide ks-live-arrow" />
              </Link>;
            })}
          </nav>
          {error ? <div className="alert alert-warning d-flex justify-content-between align-items-center" role="alert">
            <span>{error}</span><button className="btn btn-sm btn-outline-secondary" onClick={reload}>Try again</button>
          </div> : !allowed ? <RoleGate page={shown} onSwitch={switchRole} />
            : loading && !data ? <p className="text-soft" role="status">Loading…</p>
            : children(ctx)}
        </main>
      </div>
    </div>
  </Ctx.Provider>;
}

function RoleGate({ page, onSwitch }: { page: PageId; onSwitch: (id: RoleId) => void }) {
  const owner = ownerOf(page);
  return <div className="card"><div className="card-body p-4">
    <div className="eyebrow">Not in this view</div>
    <h1 className="h3">{PAGES[page].label} belongs to the {owner?.label.toLowerCase()} view</h1>
    <p className="text-soft">{PAGES[page].description}. Switch roles to open it.</p>
    {owner && <button className="btn btn-primary" onClick={() => onSwitch(owner.id)}>View as {owner.person}, {owner.label}</button>}
  </div></div>;
}

/** Shown when the API has no tariff change yet. */
export function EmptyWorkspace() {
  return <div className="card"><div className="card-body p-4">
    <ClipboardCheck aria-hidden="true" className="lucide mb-2" />
    <h1 className="h3">No tariff changes yet</h1>
    <p className="text-soft mb-3">Upload a bulletin or forward the email in Intake. Keystone reads it, finds the affected orders and checks your supplier decisions.</p>
    <Link className="btn btn-primary" href="/intake">Go to Intake</Link>
  </div></div>;
}
