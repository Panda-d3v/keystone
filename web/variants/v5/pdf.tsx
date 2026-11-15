import React from "react";
import {
  Document,
  Font,
  Link,
  Line,
  Page,
  Rect,
  StyleSheet,
  Svg,
  Text as SvgText,
  Text,
  View,
  pdf,
} from "@react-pdf/renderer";
import type { Citation, WorkspaceData } from "@/lib/contracts";
import { actionTitle, date, money, percent, words } from "@/lib/format";
import { referenceUrl } from "@/lib/reference";
import { readDeclines, readSubmissions } from "@/lib/submissions";
import { useFixtures } from "@/lib/data";
import { waterfallBars } from "./waterfall";

Font.register({
  family: "Brief body",
  src: "/fonts/source-sans-3-latin-400-normal.woff",
});
Font.register({
  family: "Brief heading",
  src: "/fonts/source-serif-4-latin-600-normal.woff",
});
const styles = StyleSheet.create({
  page: {
    paddingTop: 44,
    paddingHorizontal: 44,
    paddingBottom: 48,
    fontFamily: "Brief body",
    fontSize: 10.5,
    lineHeight: 1.5,
    color: "#1b3139",
  },
  masthead: { fontSize: 10, color: "#5a6f77", marginBottom: 20 },
  title: {
    fontFamily: "Brief heading",
    fontSize: 28,
    lineHeight: 1.15,
    marginBottom: 16,
  },
  heading: {
    fontFamily: "Brief heading",
    fontSize: 17,
    marginTop: 20,
    marginBottom: 10,
  },
  paragraph: { marginBottom: 10 },
  source: { fontSize: 9, color: "#016bc1", marginBottom: 12 },
  findingSource: { fontSize: 9, color: "#016bc1", marginTop: 3 },
  row: {
    flexDirection: "row",
    paddingVertical: 8,
    borderBottomWidth: 0.5,
    borderBottomColor: "#dcdad4",
  },
  cell: { width: "40%", paddingRight: 8 },
  amount: { width: "30%", textAlign: "right" },
  finding: {
    paddingVertical: 9,
    borderBottomWidth: 0.5,
    borderBottomColor: "#ebe9e4",
  },
  footer: {
    position: "absolute",
    bottom: 22,
    left: 44,
    right: 44,
    fontSize: 8,
    color: "#5a6f77",
  },
  chart: { marginVertical: 12, paddingVertical: 12, backgroundColor: "#f9f7f4" },
  chartText: { fontSize: 10, fontFamily: "Brief body" },
});
function absoluteSource(citation: Citation) {
  const source = referenceUrl(citation);
  return source ? new URL(source, window.location.origin).href : undefined;
}
export async function downloadBrief(data: WorkspaceData) {
  const auditIds = new Set(data.audit.map((event) => event.id));
  const submissions = readSubmissions().filter(
    (item) => useFixtures || auditIds.has(item.response.audit_event.id),
  );
  const declines = readDeclines().filter(
    (item) => useFixtures || auditIds.has(item.audit_event.id),
  );
  const change = data.changes[0];
  const document = (
    <Document title="MeridianFlow decision brief" author="Keystone">
      <Page size="A4" style={styles.page}>
        <Text style={styles.masthead}>
          Keystone / MeridianFlow procurement / {change.id}
        </Text>
        <Text style={styles.title}>The casing award needs review</Text>
        <Text style={styles.paragraph}>
          The tariff assumption behind the award has changed. The alternative’s
          advantage depends on evidence that still needs to be supplied.
        </Text>
        <Text style={styles.heading} minPresenceAhead={60}>
          What changed
        </Text>
        <Text style={styles.paragraph}>
          {change.measure} changes the applicable rate from{" "}
          {percent(change.old_rate)} to {percent(change.new_rate)}, effective{" "}
          {date(change.effective_date)}. The assessment basis is{" "}
          {words(change.basis)}.
        </Text>
        <Text style={styles.paragraph}>
          {data.exposure.affected_parts} parts across{" "}
          {data.exposure.open_po_lines} open order lines carry{" "}
          {money(data.exposure.added_duty_usd)} in added duty, or{" "}
          {money(data.exposure.annualized_added_duty_usd)} at current annual
          build rates.
        </Text>
        {change.citations[0] && (
          <Link style={styles.source} src={absoluteSource(change.citations[0])}>
            Bulletin {change.citations[0].doc_id}, page{" "}
            {change.citations[0].page}
          </Link>
        )}
        {data.decisions.map((decision) => {
          const bars = waterfallBars(decision);
          return (
            <View key={decision.decision_id}>
              <Text style={styles.heading} minPresenceAhead={145}>
                The award’s annual cost
              </Text>
              <Text style={styles.paragraph}>
                {decision.decision_id} is {words(decision.status)}. The
                incumbent’s modeled annual landed cost is{" "}
                {money(decision.incumbent_annual_usd)}.
              </Text>
              {bars && (
                <View style={styles.chart} wrap={false}>
                  <Svg width="100%" height={102} viewBox="0 0 500 102">
                    {bars.map((bar, index) => {
                      const y = 19 + index * 32;
                      const start = 132 + bar.bottom * 250;
                      const end = start + bar.height * 250;
                      return (
                        <React.Fragment key={bar.label}>
                          <SvgText x={12} y={y + 4} style={styles.chartText} fill="#1b3139">
                            {bar.label}
                          </SvgText>
                          <Rect x={132} y={y - 6} width={250} height={12} fill="#eeede9" />
                          <Rect x={start} y={y - 6} width={bar.height * 250} height={12}
                            fill={["#8a9aa0", "#c41300", "#1b3139"][index]} />
                          <Line x1={end} x2={end} y1={y - 9} y2={y + 9}
                            stroke="#5a6f77" strokeWidth={0.5} />
                          <SvgText x={485} y={y + 4} textAnchor="end" style={styles.chartText}
                            fill={index === 1 ? "#c41300" : "#1b3139"}>
                            {bar.value == null ? "Unavailable" : money(bar.value)}
                          </SvgText>
                        </React.Fragment>
                      );
                    })}
                  </Svg>
                </View>
              )}
              <Text style={styles.paragraph}>{decision.reason}</Text>
              <View style={styles.row}>
                <Text style={styles.cell}>Alternative</Text>
                <Text style={styles.amount}>Annual cost</Text>
                <Text style={styles.amount}>Against incumbent</Text>
              </View>
              <View style={styles.row}>
                <Text style={styles.cell}>With required proof</Text>
                <Text style={styles.amount}>
                  {money(decision.alternative_with_proof_annual_usd)}
                </Text>
                <Text style={styles.amount}>
                  {decision.alternative_with_proof_delta_usd == null
                    ? "Unavailable"
                    : money(decision.alternative_with_proof_delta_usd)}
                </Text>
              </View>
              <View style={styles.row}>
                <Text style={styles.cell}>Without required proof</Text>
                <Text style={styles.amount}>
                  {money(decision.alternative_without_proof_annual_usd)}
                </Text>
                <Text style={styles.amount}>
                  {decision.alternative_without_proof_delta_usd == null
                    ? "Unavailable"
                    : money(decision.alternative_without_proof_delta_usd)}
                </Text>
              </View>
            </View>
          );
        })}
        <Text style={styles.heading} minPresenceAhead={80}>
          What the supplier still needs to prove
        </Text>
        <Text style={styles.paragraph}>
          Supplier {data.evidence.supplier_id}, part {data.evidence.part_no}
        </Text>
        {data.evidence.requirements?.map((requirement) => (
          <View key={requirement.id} style={styles.finding} wrap={false}>
            <Text>
              {requirement.label} — {words(requirement.status)}
            </Text>
            {requirement.reason && <Text>{requirement.reason}</Text>}
            {[...new Map(requirement.citations?.map((citation) => [
              `${citation.doc_id}:${citation.page}`, citation,
            ])).values()].map((citation) => (
              <Link
                key={`${citation.doc_id}:${citation.page}`}
                style={styles.findingSource}
                src={absoluteSource(citation)}
              >
                {citation.doc_id}, page {citation.page}
              </Link>
            ))}
          </View>
        ))}
        <Text style={styles.heading} minPresenceAhead={70}>
          Decision on the supplier request
        </Text>
        <Text style={styles.paragraph}>
          Approving the request submits the edited draft for the returned
          approvers’ review.
        </Text>
        {data.actions
          .filter(
            (action) =>
              !submissions.some((item) => item.actionId === action.id) &&
              !declines.some((item) => item.action_id === action.id),
          )
          .map((action) => (
            <View key={action.id}>
              <Text>
                {actionTitle(action)}. {money(action.usd_at_stake)} a year at stake.
                Awaiting review.
              </Text>
              <Text style={styles.paragraph}>{action.draft_email}</Text>
            </View>
          ))}
        {submissions.map((item) => (
          <View key={item.actionId}>
            <Text style={styles.paragraph}>
              Draft decision {item.response.decision_id},{" "}
              {words(item.response.state)}. Pending approvals from{" "}
              {item.response.pending_approvals
                .map((approver) => approver.name)
                .join(" and ")}
              .
            </Text>
            <Text style={styles.paragraph}>{item.draftEmail}</Text>
          </View>
        ))}
        {declines.map((item) => (
          <Text key={item.action_id} style={styles.paragraph}>
            Request {item.action_id} declined. Audit event {item.audit_event.id}
            .
          </Text>
        ))}
        {!data.actions.length && !submissions.length && !declines.length && (
          <Text>No supplier request is awaiting review.</Text>
        )}
        <Text fixed style={styles.footer}>
          Illustrative MeridianFlow scenario. Section 232 layer only.
        </Text>
      </Page>
    </Document>
  );
  const blob = await pdf(document).toBlob();
  const url = URL.createObjectURL(blob);
  const anchor = window.document.createElement("a");
  anchor.href = url;
  anchor.download = `keystone-${change.id}-brief.pdf`;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
