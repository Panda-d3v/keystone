"use client";
// The platform's data: the Larkspur Mobile scenario plus what people did in
// this browser (requests submitted, approved or declined). Each of those is
// appended to the audit log with a real hash link, so "Verify the chain"
// still checks every event.
import { useCallback, useEffect, useMemo, useState } from "react";
import scenario from "./scenario/phones.json";
import { canonicalAuditPayload } from "@/lib/audit";
import type { AuditEvent, ExposureLineage, WorkspaceData } from "@/lib/contracts";

export type OutcomeKind = "submitted" | "approved" | "declined" | "award_approved" | "award_declined";
export interface Outcome { actionId: string; kind: OutcomeKind; draftEmail?: string; event: AuditEvent }

const KEY = "keystone.phones.outcomes.v1";
const CHANGED = "keystone-outcomes-changed";
const ACTOR: Record<OutcomeKind, [string, string]> = {
  submitted: ["maya.chen", "action_reviewed"],
  approved: ["elena.park", "action_sent"],
  declined: ["elena.park", "action_declined"],
  award_approved: ["elena.park", "decision_approved"],
  award_declined: ["elena.park", "decision_declined"],
};

export const baseWorkspace = scenario.workspace as WorkspaceData;
export const lineage = scenario.lineage as ExposureLineage;
export const sources = scenario.sources as Record<string, { title: string; kind: string; original: string; pages: string[] }>;

export function readOutcomes(): Outcome[] {
  try {
    const value = JSON.parse(window.localStorage.getItem(KEY) || "[]");
    return Array.isArray(value) ? value.filter(item => typeof item?.actionId === "string" && item?.event?.hash) : [];
  } catch { return []; }
}

export function applyOutcomes(base: WorkspaceData, outcomes: Outcome[]): WorkspaceData {
  const closed = new Set(outcomes.filter(o => o.kind !== "submitted").map(o => o.actionId));
  return { ...base, actions: base.actions.filter(a => !closed.has(a.id)), audit: [...base.audit, ...outcomes.map(o => o.event)] };
}

async function sha256(text: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, "0")).join("");
}

export async function recordOutcome(actionId: string, kind: OutcomeKind, draftEmail?: string): Promise<Outcome> {
  const existing = readOutcomes();
  const audit = applyOutcomes(baseWorkspace, existing).audit;
  if (existing.some(o => o.actionId === actionId && o.kind !== "submitted")) throw new Error("This was already decided.");
  if (kind === "submitted" && existing.some(o => o.actionId === actionId)) throw new Error("This request was already submitted.");
  const [actor, type] = ACTOR[kind];
  const draft: AuditEvent = {
    id: `AUD-${String(audit.length + 1).padStart(4, "0")}`, occurred_at: new Date().toISOString(),
    actor, type, entity_id: actionId, previous_hash: audit[audit.length - 1]?.hash ?? null, hash: "",
  };
  const event = { ...draft, hash: await sha256(canonicalAuditPayload(draft)) };
  const outcome: Outcome = { actionId, kind, draftEmail, event };
  try { window.localStorage.setItem(KEY, JSON.stringify([...existing, outcome])); } catch { /* storage blocked */ }
  window.dispatchEvent(new Event(CHANGED));
  return outcome;
}

export function resetOutcomes() {
  try { window.localStorage.removeItem(KEY); } catch { /* storage blocked */ }
  window.dispatchEvent(new Event(CHANGED));
}

export function usePlatformData() {
  const [outcomes, setOutcomes] = useState<Outcome[]>([]);
  useEffect(() => {
    const refresh = () => setOutcomes(readOutcomes());
    refresh();
    window.addEventListener(CHANGED, refresh);
    window.addEventListener("storage", refresh);
    return () => { window.removeEventListener(CHANGED, refresh); window.removeEventListener("storage", refresh); };
  }, []);
  const data = useMemo(() => applyOutcomes(baseWorkspace, outcomes), [outcomes]);
  const record = useCallback(recordOutcome, []);
  return { data, outcomes, record, reset: resetOutcomes };
}
