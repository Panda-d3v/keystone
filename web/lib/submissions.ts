"use client";
import { useEffect, useState } from "react";
import { sendActionRequest, useFixtures } from "./data";
import type { AuditEvent, SendActionResponse } from "./contracts";

export interface Submission {
  actionId: string;
  draftEmail: string;
  response: SendActionResponse;
}
const storageKey = `keystone-submissions:${useFixtures ? "fixture" : process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000"}`;
const changeEvent = "keystone-submissions-changed";

function readSubmissions(): Submission[] {
  try {
    const value = JSON.parse(sessionStorage.getItem(storageKey) || "[]");
    if (!Array.isArray(value)) return [];
    return value.filter(item => typeof item.actionId === "string" && typeof item.draftEmail === "string"
      && typeof item.response?.decision_id === "string" && typeof item.response?.audit_event?.id === "string"
      && Array.isArray(item.response?.pending_approvals));
  } catch {
    return [];
  }
}
export function useSubmissions(audit: AuditEvent[]) {
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  useEffect(() => {
    const refresh = () => setSubmissions(readSubmissions().filter(item =>
      useFixtures || audit.some(event => event.id === item.response.audit_event.id),
    ));
    refresh();
    window.addEventListener(changeEvent, refresh);
    return () => window.removeEventListener(changeEvent, refresh);
  }, [audit]);
  return submissions;
}
export async function submitAction(actionId: string, draftEmail: string): Promise<SendActionResponse> {
  const existing = readSubmissions();
  const previous = existing.find(item => item.actionId === actionId);
  if (useFixtures && previous) {
    if (previous.draftEmail !== draftEmail) throw new Error("This action was already submitted with a different draft.");
    return previous.response;
  }
  const response = await sendActionRequest(actionId, draftEmail);
  try {
    sessionStorage.setItem(storageKey, JSON.stringify([
      ...existing.filter(item => item.actionId !== actionId), { actionId, draftEmail, response },
    ]));
    window.dispatchEvent(new Event(changeEvent));
  } catch {
    // Submission succeeded even if browser storage is unavailable. The caller still displays the result.
  }
  return response;
}
