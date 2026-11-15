// The downloadable Brief. Same story, numbers and look as the on-screen
// Brief: DM Sans / DM Mono, teal-navy ink, red-orange accent, mono eyebrows,
// the before / added / after bridge, options, proof and the request.
import React from "react";
import { Document, Font, Link, Page, StyleSheet, Text, View, pdf } from "@react-pdf/renderer";
import type { WorkspaceData } from "@/lib/contracts";
import { actionTitle, money } from "@/lib/format";
import { COMPANY } from "./catalog";
import { baseWorkspace, readOutcomes, sources } from "./store";
import { ACTION_SUPPLIERS } from "./catalog";
import { supplierName } from "./names";
import { changeHeadline, decisionStory } from "./story";

let fontsRegistered = false;
/** Fonts come from /fonts in the browser; tests pass the public/fonts folder. */
export function registerBriefFonts(base = "/fonts") {
  if (fontsRegistered) return;
  fontsRegistered = true;
  Font.register({ family: "DM Sans", fonts: [
    { src: `${base}/dm-sans-latin-400-normal.woff`, fontWeight: 400 },
    { src: `${base}/dm-sans-latin-500-normal.woff`, fontWeight: 500 },
  ] });
  Font.register({ family: "DM Mono", fonts: [
    { src: `${base}/dm-mono-latin-400-normal.woff`, fontWeight: 400 },
    { src: `${base}/dm-mono-latin-500-normal.woff`, fontWeight: 500 },
  ] });
  Font.registerHyphenationCallback(word => [word]);
}

const C = {
  ink: "#1b3139", soft: "#5a6f77", faint: "#8a9aa0", canvas: "#f9f7f4", rule: "#dcdad4", ruleSoft: "#ebe9e4",
  accent: "#eb1600", accentInk: "#c41300", accentSoft: "#fdeceb", good: "#0f7b4f", goodSoft: "#e6f4ec",
  warn: "#9a5b00", warnSoft: "#fbf1df", bad: "#b42318", neutral: "#eeede9", before: "#8fa4aa",
};

const s = StyleSheet.create({
  page: { fontFamily: "DM Sans", fontSize: 10, color: C.ink, backgroundColor: C.canvas, paddingTop: 0, paddingBottom: 54, paddingHorizontal: 0, lineHeight: 1.45 },
  band: { backgroundColor: C.ink, paddingVertical: 14, paddingHorizontal: 44, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  brand: { flexDirection: "row", alignItems: "center" },
  mark: { width: 16, height: 16, backgroundColor: C.accent, marginRight: 8 },
  brandText: { color: "#ffffff", fontSize: 12, fontWeight: 500 },
  bandMeta: { color: "#c9d4d7", fontFamily: "DM Mono", fontSize: 8, letterSpacing: 0.6 },
  body: { paddingHorizontal: 44, paddingTop: 28 },
  eyebrow: { fontFamily: "DM Mono", fontSize: 8, letterSpacing: 0.8, color: C.accentInk, textTransform: "uppercase", marginBottom: 6 },
  title: { fontSize: 22, fontWeight: 500, lineHeight: 1.2, marginBottom: 8 },
  lede: { fontSize: 11, color: C.soft, marginBottom: 18, maxWidth: 470 },
  glance: { flexDirection: "row", borderWidth: 1, borderColor: C.rule, backgroundColor: "#ffffff", marginBottom: 6 },
  glanceCell: { flex: 1, paddingVertical: 10, paddingHorizontal: 12, borderLeftWidth: 1, borderLeftColor: C.ruleSoft },
  glanceFirst: { borderLeftWidth: 0 },
  label: { fontFamily: "DM Mono", fontSize: 7, letterSpacing: 0.7, color: C.soft, textTransform: "uppercase", marginBottom: 4 },
  glanceValue: { fontSize: 15, fontWeight: 500 },
  section: { borderTopWidth: 1, borderTopColor: C.rule, paddingTop: 18, marginTop: 20 },
  h2: { fontSize: 13, fontWeight: 500, lineHeight: 1.35, marginBottom: 6 },
  p: { fontSize: 10, marginBottom: 4 },
  source: { fontSize: 8.5, color: "#016bc1", marginTop: 4 },
  bridge: { marginTop: 12 },
  bridgeRow: { flexDirection: "row", alignItems: "center", marginBottom: 9 },
  bridgeStep: { width: 92, fontSize: 9, color: C.soft },
  track: { flex: 1, height: 16, position: "relative", backgroundColor: "#f1efea" },
  bar: { position: "absolute", top: 0, bottom: 0 },
  bridgeValue: { width: 82, textAlign: "right", fontSize: 10, fontWeight: 500 },
  caption: { fontSize: 8.5, color: C.soft, marginTop: 2 },
  table: { borderWidth: 1, borderColor: C.rule, backgroundColor: "#ffffff", marginTop: 14 },
  th: { flexDirection: "row", backgroundColor: C.canvas, borderBottomWidth: 1, borderBottomColor: C.rule, paddingVertical: 6, paddingHorizontal: 10 },
  tr: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: C.ruleSoft, paddingVertical: 7, paddingHorizontal: 10 },
  thText: { fontFamily: "DM Mono", fontSize: 7, letterSpacing: 0.7, color: C.soft, textTransform: "uppercase" },
  colOption: { flex: 3 }, colMoney: { flex: 1.4, textAlign: "right" },
  proofRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", paddingVertical: 7, paddingHorizontal: 10, borderBottomWidth: 1, borderBottomColor: C.ruleSoft },
  chip: { fontSize: 8, fontWeight: 500, paddingVertical: 2, paddingHorizontal: 6 },
  request: { backgroundColor: "#ffffff", borderWidth: 1, borderColor: C.rule, padding: 14, marginTop: 10 },
  email: { fontSize: 9, backgroundColor: C.canvas, borderWidth: 1, borderColor: C.ruleSoft, padding: 10, marginTop: 8, lineHeight: 1.5 },
  status: { fontSize: 9.5, marginTop: 10, padding: 8 },
  footer: { position: "absolute", bottom: 22, fontSize: 7.5, color: C.faint, fontFamily: "DM Mono" },
});

const signed = (v: number) => `${v < 0 ? "−" : "+"}${money(Math.abs(v))}`;
const tone = (v: number) => (v < 0 ? C.good : C.bad);
const CHIP: Record<string, [string, string, string]> = {
  checked: ["Proven", C.goodSoft, C.good],
  needs_review: ["Unreadable", C.warnSoft, C.warn],
  mismatch: ["Doesn't match", C.accentSoft, C.bad],
  missing: ["Missing", C.neutral, C.soft],
};

export function BriefDocument({ data }: { data: WorkspaceData }) {
  const browser = typeof window !== "undefined";
  const change = data.changes[0];
  const decision = data.decisions[0];
  const story = decision ? decisionStory(decision, change, data.evidence) : null;
  const action = [...baseWorkspace.actions].sort((a, b) => a.rank - b.rank)[0];
  const outcomes = browser && action ? readOutcomes().filter(o => o.actionId === action.id) : [];
  const approved = outcomes.find(o => o.kind === "approved");
  const declined = outcomes.find(o => o.kind === "declined");
  const citation = change?.citations[0];
  const sourceUrl = citation ? sources[citation.doc_id]?.original : undefined;
  const absolute = sourceUrl && browser ? new URL(sourceUrl, window.location.origin).href : sourceUrl;
  const max = story?.before != null && story.increase != null && decision
    ? Math.max(story.before + story.increase, decision.incumbent_annual_usd) : 1;
  const pct = (v: number) => `${(v / max) * 100}%`;

  return <Document title="Keystone decision brief" author="Keystone">
    <Page size="A4" style={s.page}>
      <View style={s.band} fixed>
        <View style={s.brand}><View style={s.mark} /><Text style={s.brandText}>Keystone</Text></View>
        <Text style={s.bandMeta}>{COMPANY.name} decision brief, {change?.id ?? ""}</Text>
      </View>

      <View style={s.body}>
        <Text style={s.eyebrow}>Decision brief, change {change?.id ?? ""}</Text>
        <Text style={s.title}>{story ? `${story.title}: decision required` : "Decision brief"}</Text>
        {story && <Text style={s.lede}>{`${story.lede} ${story.verdict}`.trim()}</Text>}

        {story && <View style={s.glance} wrap={false}>
          {story.increase != null && <View style={[s.glanceCell, s.glanceFirst]}>
            <Text style={s.label}>Award cost since the change</Text>
            <Text style={[s.glanceValue, { color: C.accentInk }]}>+{money(story.increase)}/yr</Text></View>}
          <View style={s.glanceCell}><Text style={s.label}>Switch, with US fab proof</Text>
            <Text style={[s.glanceValue, { color: tone(story.withProof) }]}>{signed(story.withProof)}/yr</Text></View>
          <View style={s.glanceCell}><Text style={s.label}>Switch, without proof</Text>
            <Text style={[s.glanceValue, { color: tone(story.withoutProof) }]}>{signed(story.withoutProof)}/yr</Text></View>
        </View>}

        {change && <View style={s.section} wrap={false}>
          <Text style={s.eyebrow}>What changed</Text>
          <Text style={s.h2}>{changeHeadline(change)}</Text>
          <Text style={s.p}>It reaches {data.exposure.affected_parts} parts across {data.exposure.open_po_lines} open order lines: {money(data.exposure.added_duty_usd)} in added duty on those orders and {money(data.exposure.annualized_added_duty_usd)} a year at current build rates.</Text>
          {absolute && citation && <Link style={s.source} src={absolute}>Source: bulletin {citation.doc_id}, page {citation.page}</Link>}
        </View>}

        {story && decision && <View style={s.section} wrap={false}>
          <Text style={s.eyebrow}>Annual cost of the award</Text>
          <Text style={s.h2}>{story.happened}</Text>
          {story.before != null && story.increase != null && <View style={s.bridge}>
            <View style={s.bridgeRow}><Text style={s.bridgeStep}>Before the change</Text>
              <View style={s.track}><View style={[s.bar, { left: 0, width: pct(story.before), backgroundColor: C.before }]} /></View>
              <Text style={s.bridgeValue}>{money(story.before)}</Text></View>
            <View style={s.bridgeRow}><Text style={s.bridgeStep}>Added duty</Text>
              <View style={s.track}><View style={[s.bar, { left: pct(story.before), width: pct(story.increase), backgroundColor: C.accent }]} /></View>
              <Text style={[s.bridgeValue, { color: C.accentInk }]}>+{money(story.increase)}</Text></View>
            <View style={s.bridgeRow}><Text style={s.bridgeStep}>After the change</Text>
              <View style={s.track}><View style={[s.bar, { left: 0, width: pct(decision.incumbent_annual_usd), backgroundColor: C.ink }]} /></View>
              <Text style={s.bridgeValue}>{money(decision.incumbent_annual_usd)}</Text></View>
            <Text style={s.caption}>Annual landed cost of the award with {story.incumbent}. The red step is the added duty from the new rate.</Text>
          </View>}
          <View style={s.table}>
            <View style={s.th}><Text style={[s.thText, s.colOption]}>Option</Text><Text style={[s.thText, s.colMoney]}>Annual landed cost</Text><Text style={[s.thText, s.colMoney]}>Against today</Text></View>
            <View style={s.tr}><Text style={s.colOption}>Stay with {story.incumbent}</Text><Text style={s.colMoney}>{money(decision.incumbent_annual_usd)}</Text><Text style={[s.colMoney, { color: C.soft }]}>–</Text></View>
            <View style={s.tr}><Text style={s.colOption}>Switch to {story.alternative}, with US fab proof</Text><Text style={s.colMoney}>{money(decision.alternative_with_proof_annual_usd)}</Text><Text style={[s.colMoney, { color: tone(story.withProof), fontWeight: 500 }]}>{signed(story.withProof)}</Text></View>
            <View style={[s.tr, { borderBottomWidth: 0 }]}><Text style={s.colOption}>Switch to {story.alternative}, without proof</Text><Text style={s.colMoney}>{money(decision.alternative_without_proof_annual_usd)}</Text><Text style={[s.colMoney, { color: tone(story.withoutProof), fontWeight: 500 }]}>{signed(story.withoutProof)}</Text></View>
          </View>
        </View>}

        <View style={s.section} wrap={false}>
          <Text style={s.eyebrow}>Outstanding supplier evidence</Text>
          <Text style={s.h2}>{supplierName(data.evidence.supplier_id)}, part {data.evidence.part_no}</Text>
          <View style={[s.table, { marginTop: 8 }]}>
            {(data.evidence.requirements ?? []).map((row, i, all) => {
              const [label, bg, fg] = CHIP[row.status] ?? [row.status, C.neutral, C.soft];
              return <View key={row.id} style={[s.proofRow, i === all.length - 1 ? { borderBottomWidth: 0 } : {}]}>
                <View style={{ flex: 1, paddingRight: 10 }}>
                  <Text>{row.label}</Text>
                  {row.status !== "checked" && row.reason && <Text style={{ fontSize: 8.5, color: C.soft, marginTop: 2 }}>{row.reason}</Text>}
                </View>
                <Text style={[s.chip, { backgroundColor: bg, color: fg }]}>{label}</Text>
              </View>;
            })}
          </View>
        </View>

        {action && <View style={s.section}>
          <Text style={s.eyebrow}>Decision</Text>
          <View style={s.request} wrap={false}>
            <Text style={s.h2}>{actionTitle(action)}</Text>
            <Text style={[s.chip, { backgroundColor: C.accentSoft, color: C.accentInk, alignSelf: "flex-start", marginBottom: 6 }]}>{money(action.usd_at_stake)} a year at stake</Text>
            {action.why && <Text style={s.p}>{action.why}</Text>}
            <Text style={[s.label, { marginTop: 8 }]}>Email to {supplierName(ACTION_SUPPLIERS[action.id] ?? "")}</Text>
            <Text style={s.email}>{approved?.draftEmail ?? action.draft_email}</Text>
            {approved ? <Text style={[s.status, { backgroundColor: C.goodSoft, color: C.good }]}>Approved and sent to {supplierName(ACTION_SUPPLIERS[action.id] ?? "")}. Recorded in the audit log as {approved.event.id}.</Text>
              : declined ? <Text style={[s.status, { backgroundColor: C.neutral, color: C.soft }]}>Declined. The request was removed from the queue and recorded in the audit log.</Text>
              : <Text style={[s.status, { backgroundColor: C.warnSoft, color: C.warn }]}>Awaiting your approval.</Text>}
          </View>
        </View>}
      </View>

    </Page>
  </Document>;
}

export async function downloadBriefPdf(data: WorkspaceData): Promise<void> {
  registerBriefFonts();
  const blob = await pdf(<BriefDocument data={data} />).toBlob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `keystone-decision-brief-${data.changes[0]?.id ?? "brief"}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
