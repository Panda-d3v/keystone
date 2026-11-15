// Plain-language names for the codes the API returns. Supplier names and the
// award context come from the demo seed (keystone-demo-pack: suppliers.csv,
// decisions.csv); everything else is wording, never a number.

export const SUPPLIERS: Record<string, { name: string; country: string; city: string }> = {
  S001: { name: "Ningbo Haitai Precision Casting", country: "China", city: "Ningbo" },
  S002: { name: "Taizhou Jinhong Pump Parts", country: "China", city: "Taizhou" },
  S003: { name: "Rajkot Sterling Castings", country: "India", city: "Rajkot" },
  S004: { name: "Coimbatore Flowtech Components", country: "India", city: "Coimbatore" },
  S005: { name: "Monterrey Aceros Industriales", country: "Mexico", city: "Monterrey" },
  S006: { name: "Queretaro Motores Electricos", country: "Mexico", city: "Queretaro" },
  S007: { name: "Sheffield Forge & Pattern", country: "United Kingdom", city: "Sheffield" },
  S008: { name: "Schweinfurt Lagertechnik", country: "Germany", city: "Schweinfurt" },
  S009: { name: "Taichung Fastener Industrial", country: "Taiwan", city: "Taichung" },
  S010: { name: "Ohio Valley Foundry", country: "United States", city: "Mansfield" },
  S011: { name: "Busan Seal Systems", country: "South Korea", city: "Busan" },
  S012: { name: "Hai Phong Mechanical", country: "Vietnam", city: "Hai Phong" },
};

export const supplierName = (id: string) => SUPPLIERS[id]?.name ?? id;

/** The awards in the demo seed, keyed by decision id. */
export const AWARDS: Record<string, {
  title: string; decidedOn: string; owner: string; incumbent: string;
  parts: string[]; partLabel: string; assumption: string;
}> = {
  "D-2026-031": {
    title: "Pump casing award",
    decidedOn: "2026-04-20",
    owner: "Sourcing manager",
    incumbent: "S001",
    parts: ["MF-8413-001", "MF-8413-002", "MF-8413-003", "MF-8413-004", "MF-8413-005"],
    partLabel: "5 pump casings",
    assumption: "a 25% Section 232 duty on the full customs value",
  },
};

/** Who did what in the audit log, in words. */
export const ACTORS: Record<string, string> = {
  A1: "Intake assistant",
  A2: "Bulletin reader",
  A3: "Evidence reader",
  A4: "Record matcher",
  A5: "Request drafter",
  T14: "Evidence rules",
  "demo-user": "You",
};
export const actorName = (actor: string) => ACTORS[actor] ?? actor;

/** 841391 -> 8413.91 */
export const hts = (code: string) =>
  /^\d{6,10}$/.test(code) ? `${code.slice(0, 4)}.${code.slice(4, 6)}${code.length > 6 ? `.${code.slice(6)}` : ""}` : code;

export const sentence = (value: string) => value.charAt(0).toUpperCase() + value.slice(1).replaceAll("_", " ");
