"use client";
import { useEffect, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Layers } from "lucide-react";
import { useWorkspace } from "@/lib/use-workspace";
import type { WorkspaceData } from "@/lib/contracts";
import { ROLES, roleById, type Role, type RoleId, type StepId } from "./roles";

const STORAGE_KEY = "keystone.role";

export interface PlatformContext {
  role: Role;
  data: WorkspaceData | null;
  reload: () => void;
  useFixtures: boolean;
}

export function rememberRole(id: RoleId) {
  try { window.localStorage.setItem(STORAGE_KEY, id); } catch { /* private mode */ }
}
export function rememberedRole(): RoleId {
  try { return roleById(window.localStorage.getItem(STORAGE_KEY)).id; } catch { return roleById(null).id; }
}

/** Title, one factual line, optional actions. Same on every page. */
export function PageHead({ title, children, actions }: { title: string; children?: ReactNode; actions?: ReactNode }) {
  return <header className="ks-page-head">
    <div>
      <h1 className="mb-0">{title}</h1>
      {children && <p>{children}</p>}
    </div>
    {actions && <div className="d-flex gap-2 flex-wrap ks-no-print">{actions}</div>}
  </header>;
}

export function Shell({ roleId, stepId, children }: {
  roleId: RoleId; stepId: StepId; children: (ctx: PlatformContext) => ReactNode;
}) {
  const { data, error, loading, reload, useFixtures } = useWorkspace();
  const router = useRouter();
  const role = roleById(roleId);
  useEffect(() => rememberRole(role.id), [role.id]);

  return <div className="ks">
    <header className="ks-topbar">
      <Link href={role.steps[0].path} className="ks-brand">
        <span className="ks-brand-mark"><Layers aria-hidden="true" className="lucide" /></span>Keystone
      </Link>
      <span className="ks-workspace">MeridianFlow</span>
      <div className="ms-auto ks-role">
        <span className="ks-avatar d-none d-sm-inline-flex" aria-hidden="true">{role.initials}</span>
        <label htmlFor="ks-role" className="visually-hidden">Viewing as</label>
        <select id="ks-role" className="form-select form-select-sm" value={role.id}
          onChange={event => router.push(roleById(event.target.value).steps[0].path)}>
          {ROLES.map(item => <option key={item.id} value={item.id}>{item.person}, {item.label}</option>)}
        </select>
      </div>
    </header>

    <div className="ks-frame">
      <nav className="ks-steps ks-no-print" aria-label={`${role.label} steps`}>
        {role.steps.map((s, index) => <Link key={s.id} href={s.path} className={s.id === stepId ? "active" : ""}
          aria-current={s.id === stepId ? "step" : undefined}>
          <span className="n">{index + 1}</span><span>{s.label}</span>
        </Link>)}
      </nav>

      <main>
        {error ? <div className="alert alert-warning d-flex justify-content-between align-items-center" role="alert">
          <span>{error}</span><button className="btn btn-sm btn-outline-secondary" onClick={reload}>Try again</button>
        </div> : loading && !data ? <p className="text-soft" role="status">Loading…</p>
          : children({ role, data, reload, useFixtures })}
      </main>
      <p className="ks-footnote ks-no-print">Illustrative MeridianFlow scenario. Section 232 layer only; not a duty determination.</p>
    </div>
  </div>;
}

/** Shown when the API has no tariff change yet. */
export function EmptyWorkspace({ action }: { action?: ReactNode }) {
  return <div className="card"><div className="card-body p-4">
    <h2 className="mb-2">No tariff change on file</h2>
    <p className="text-soft mb-0">Trade compliance uploads the bulletin under Documents. Figures appear here once it is read.</p>
    {action && <div className="mt-3">{action}</div>}
  </div></div>;
}
