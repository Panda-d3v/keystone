// Plain-language names for the codes in the data. Everything here is wording,
// never a number.
import { AWARD, SUPPLIER_DIRECTORY } from "./catalog";

export const SUPPLIERS = SUPPLIER_DIRECTORY;
export const supplierName = (id: string) => SUPPLIERS[id]?.name ?? id;
export const supplierPlace = (id: string) => {
  const s = SUPPLIERS[id];
  return s ? (s.country_code === "US" ? s.city : `${s.city}, ${s.country}`) : "";
};

/** The awards in the scenario, keyed by decision id. */
export const AWARDS: Record<string, {
  title: string; decidedOn: string; incumbent: string; parts: string[]; partLabel: string; assumption: string;
}> = {
  [AWARD.decision_id]: {
    title: AWARD.title, decidedOn: AWARD.decided_on, incumbent: AWARD.incumbent,
    parts: AWARD.parts, partLabel: AWARD.part_label, assumption: AWARD.assumption,
  },
};

/** What the lower rate needs to be proven, in words. */
export const PROOF = "proof the wafers were fabricated in the US";

/** Who did what in the audit log. */
export const ACTORS: Record<string, string> = {
  A1: "Intake assistant",
  A2: "Bulletin reader",
  A3: "Evidence reader",
  A5: "Request drafter",
  T14: "Evidence rules",
  rules: "Duty rules",
  "maya.chen": "Maya Chen",
  "priya.raman": "Priya Raman",
  "sam.okafor": "Sam Okafor",
  "elena.park": "Elena Park",
};
export const actorName = (actor: string) => ACTORS[actor] ?? actor;

/** 854231 -> 8542.31 */
export const hts = (code: string) =>
  /^\d{6,10}$/.test(code) ? `${code.slice(0, 4)}.${code.slice(4, 6)}${code.length > 6 ? `.${code.slice(6)}` : ""}` : code;

export const sentence = (value: string) => value.charAt(0).toUpperCase() + value.slice(1).replaceAll("_", " ");
