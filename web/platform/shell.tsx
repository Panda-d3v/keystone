"use client";
import { useEffect, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Layers, RotateCcw } from "lucide-react";
import type { WorkspaceData } from "@/lib/contracts";
import { COMPANY } from "./catalog";
import { ROLES, roleById, type Role, type RoleId, type StepId } from "./roles";
import { usePlatformData, type OutcomeKind, type Outcome } from "./store";
import { Dropdown } from "./ui";

const STORAGE_KEY = "keystone.role";

export interface PlatformContext {
  role: Role;
  data: WorkspaceData | null;
  outcomes: Outcome[];
  record: (actionId: string, kind: OutcomeKind, draftEmail?: string) => Promise<Outcome>;
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
  const { data, outcomes, record, reset } = usePlatformData();
  const router = useRouter();
  const role = roleById(roleId);
  useEffect(() => rememberRole(role.id), [role.id]);

  return <div className="ks">
    <header className="ks-topbar">
      <Link href={role.steps[0].path} className="ks-brand">
        <span className="ks-brand-mark"><Layers aria-hidden="true" className="lucide" /></span>Keystone
      </Link>
      <span className="ks-workspace">{COMPANY.name}</span>
      <div className="ms-auto ks-role">
        <Dropdown label="Viewing as" value={role.id} align="end" className="ks-role-dd"
          options={ROLES.map(item => ({ value: item.id, label: item.person, sub: item.label,
            icon: <span className="ks-avatar" aria-hidden="true">{item.initials}</span> }))}
          onChange={id => router.push(roleById(id).steps[0].path)}
          footer={<button type="button" className="ks-dd-action" onClick={reset}><RotateCcw aria-hidden="true" className="lucide" />Reset demo decisions</button>} />
      </div>
    </header>

    <div className="ks-frame">
      <nav className="ks-steps ks-no-print" aria-label={`${role.label} steps`}>
        {role.steps.map((s, index) => <Link key={s.id} href={s.path} className={s.id === stepId ? "active" : ""}
          aria-current={s.id === stepId ? "step" : undefined}>
          <span className="n">{index + 1}</span><span>{s.label}</span>
        </Link>)}
      </nav>

      <main>{children({ role, data, outcomes, record })}</main>
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
