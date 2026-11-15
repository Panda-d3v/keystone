"use client";
import { useEffect, useState } from "react";
import { sendActionRequest, useFixtures } from "./data";
import declineFixture from "../../contracts/fixtures/decline_action.json";
import { apiRequest } from "./data";
import type {
  DeclineActionResponse,
  AuditEvent,
  SendActionResponse,
} from "./contracts";

export interface Submission {
  actionId: string;
  draftEmail: string;
  response: SendActionResponse;
}
const storageKey = `keystone-submissions:${useFixtures ? "fixture" : process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000"}`;
const changeEvent = "keystone-submissions-changed";

export function readSubmissions(): Submission[] {
  try {
    const value = JSON.parse(sessionStorage.getItem(storageKey) || "[]");
    if (!Array.isArray(value)) return [];
    return value.filter(
      (item) =>
        typeof item.actionId === "string" &&
        typeof item.draftEmail === "string" &&
        typeof item.response?.decision_id === "string" &&
        typeof item.response?.audit_event?.id === "string" &&
        Array.isArray(item.response?.pending_approvals),
    );
  } catch {
    return [];
  }
}
export function useSubmissions(audit: AuditEvent[]) {
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  useEffect(() => {
    const refresh = () =>
      setSubmissions(
        readSubmissions().filter(
          (item) =>
            useFixtures ||
            audit.some((event) => event.id === item.response.audit_event.id),
        ),
      );
    refresh();
    window.addEventListener(changeEvent, refresh);
    return () => window.removeEventListener(changeEvent, refresh);
  }, [audit]);
  return submissions;
}
export async function submitAction(
  actionId: string,
  draftEmail: string,
): Promise<SendActionResponse> {
  if (useFixtures && readDeclines().some((item) => item.action_id === actionId))
    throw new Error("This request was already declined.");
  const existing = readSubmissions();
  const previous = existing.find((item) => item.actionId === actionId);
  if (useFixtures && previous) {
    if (previous.draftEmail !== draftEmail)
      throw new Error(
        "This action was already submitted with a different draft.",
      );
    return previous.response;
  }
  const response = await sendActionRequest(actionId, draftEmail);
  try {
    sessionStorage.setItem(
      storageKey,
      JSON.stringify([
        ...existing.filter((item) => item.actionId !== actionId),
        { actionId, draftEmail, response },
      ]),
    );
    window.dispatchEvent(new Event(changeEvent));
  } catch {
    // Submission succeeded even if browser storage is unavailable. The caller still displays the result.
  }
  return response;
}

export function readDeclines(): DeclineActionResponse[] {
  try {
    const value = JSON.parse(
      sessionStorage.getItem(`${storageKey}:declines`) || "[]",
    );
    return Array.isArray(value)
      ? value.filter(
          (item) =>
            typeof item.action_id === "string" &&
            item.state === "declined" &&
            typeof item.audit_event?.id === "string",
        )
      : [];
  } catch {
    return [];
  }
}
export function useDeclines(audit?: AuditEvent[]) {
  const [declines, setDeclines] = useState<DeclineActionResponse[]>([]);
  useEffect(() => {
    const refresh = () =>
      setDeclines(
        readDeclines().filter(
          (item) =>
            useFixtures ||
            audit?.some((event) => event.id === item.audit_event.id),
        ),
      );
    refresh();
    window.addEventListener(changeEvent, refresh);
    return () => window.removeEventListener(changeEvent, refresh);
  }, [audit]);
  return declines;
}
export async function declineAction(
  actionId: string,
): Promise<DeclineActionResponse> {
  if (
    useFixtures &&
    readSubmissions().some((item) => item.actionId === actionId)
  )
    throw new Error("This request was already submitted for approval.");
  const existing = readDeclines();
  const previous = existing.find((item) => item.action_id === actionId);
  if (useFixtures && previous) return previous;
  const response = useFixtures
    ? ({
        ...structuredClone(declineFixture),
        action_id: actionId,
      } as DeclineActionResponse)
    : await apiRequest<DeclineActionResponse>(
        `/actions/${encodeURIComponent(actionId)}/decline`,
        { method: "POST" },
      );
  try {
    sessionStorage.setItem(
      `${storageKey}:declines`,
      JSON.stringify([
        ...existing.filter((item) => item.action_id !== actionId),
        response,
      ]),
    );
    window.dispatchEvent(new Event(changeEvent));
  } catch {
    /* The persisted response remains available to the caller. */
  }
  return response;
}
