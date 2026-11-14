import changes from "../../contracts/fixtures/changes.json";
import exposure from "../../contracts/fixtures/exposure.json";
import decisions from "../../contracts/fixtures/decisions.json";
import evidence from "../../contracts/fixtures/evidence.json";
import actions from "../../contracts/fixtures/actions.json";
import audit from "../../contracts/fixtures/audit.json";
import sendAction from "../../contracts/fixtures/send_action.json";

import type { WorkspaceData, SendActionResponse } from "./contracts";
export type { WorkspaceData } from "./contracts";

export const fixtureData: WorkspaceData = { changes, exposure, decisions, evidence, actions, audit };
export const useFixtures = process.env.NEXT_PUBLIC_USE_FIXTURES !== "false";
const base = (process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000").replace(/\/$/, "");

export async function apiRequest<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${base}${path}`, { ...options, cache: "no-store" });
  if (!response.ok) {
    const detail = await response.json().catch(() => null);
    const message = typeof detail?.detail === "string" ? detail.detail : "Please retry or check the API connection.";
    throw new Error(`Request failed (${response.status}). ${message}`);
  }
  return response.json();
}
export async function loadWorkspace(signal?: AbortSignal): Promise<WorkspaceData> {
  if (useFixtures) return structuredClone(fixtureData);
  const options = { signal };
  const [changes, exposure, decisions, evidence, actions, audit] = await Promise.all([
    apiRequest<WorkspaceData["changes"]>("/changes", options),
    apiRequest<WorkspaceData["exposure"]>("/changes/CE-0007/exposure", options),
    apiRequest<WorkspaceData["decisions"]>("/decisions", options),
    apiRequest<WorkspaceData["evidence"]>("/evidence/S007/MF-8413-005", options),
    apiRequest<WorkspaceData["actions"]>("/actions", options),
    apiRequest<WorkspaceData["audit"]>("/audit", options),
  ]);
  return { changes, exposure, decisions, evidence, actions, audit };
}
export async function sendActionRequest(id: string, draftEmail: string): Promise<SendActionResponse> {
  if (!draftEmail.trim()) throw new Error("Enter a supplier request before submitting.");
  if (useFixtures) return structuredClone(sendAction);
  return apiRequest(`/actions/${encodeURIComponent(id)}/send`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ draft_email: draftEmail }),
  });
}
