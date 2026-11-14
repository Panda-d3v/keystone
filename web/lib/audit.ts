import type { AuditEvent } from "./contracts";

// Match api.audit.log.event_hash, including Python's UTC timestamp and ASCII JSON encoding.
export function canonicalAuditPayload(event: AuditEvent): string {
  const fraction = event.occurred_at.match(/\.(\d+)/)?.[1] ?? "";
  const utcSeconds = new Date(event.occurred_at).toISOString().slice(0, 19);
  const microseconds = fraction.padEnd(6, "0").slice(0, 6);
  const occurredAt = `${utcSeconds}${Number(microseconds) ? `.${microseconds}` : ""}+00:00`;
  const payload = {
    actor: event.actor,
    entity_id: event.entity_id,
    id: event.id,
    occurred_at: occurredAt,
    previous_hash: event.previous_hash,
    type: event.type,
  };
  return JSON.stringify(payload).replace(/[\u007f-\uffff]/g, character =>
    `\\u${character.charCodeAt(0).toString(16).padStart(4, "0")}`,
  );
}

export async function verifyAudit(events: AuditEvent[]): Promise<{ valid: boolean; reason: string }> {
  if (!events.length) return { valid: true, reason: "The audit log is empty." };
  const byHash = new Map(events.map(event => [event.hash, event]));
  const children = new Map<string, AuditEvent>();
  const genesis = events.filter(event => event.previous_hash === null);
  if (genesis.length !== 1 || byHash.size !== events.length) {
    return { valid: false, reason: "The audit chain has duplicate hashes or an invalid starting event." };
  }
  for (const event of events) {
    if (!event.previous_hash) continue;
    if (!byHash.has(event.previous_hash) || children.has(event.previous_hash)) {
      return { valid: false, reason: "The audit chain has a missing link or a fork." };
    }
    children.set(event.previous_hash, event);
  }
  let current: AuditEvent | undefined = genesis[0];
  let visited = 0;
  while (current) {
    const bytes = new TextEncoder().encode(canonicalAuditPayload(current));
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    const calculated = Array.from(new Uint8Array(digest), value => value.toString(16).padStart(2, "0")).join("");
    if (calculated !== current.hash) return { valid: false, reason: `Content hash mismatch at ${current.id}.` };
    visited += 1;
    if (visited > events.length) return { valid: false, reason: "The audit chain contains a cycle." };
    current = children.get(current.hash);
  }
  return visited === events.length
    ? { valid: true, reason: "Every event hash and previous link matches." }
    : { valid: false, reason: "The audit chain contains disconnected events." };
}
