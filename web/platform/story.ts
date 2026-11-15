// Sentences built from rule outputs. No arithmetic beyond picking the
// differences the decision rule already returns.
import type { ChangeEvent, DecisionCheck, EvidenceStatus, WorkspaceData } from "@/lib/contracts";
import { date, money, percent } from "@/lib/format";
import { AWARDS, hts, PROOF, supplierName, SUPPLIERS } from "./names";

export function changeHeadline(change: ChangeEvent): string {
  const codes = change.hts_scope.map(hts);
  const heading = codes.length === 1 ? "heading" : "headings";
  return `${codes.length} HTS ${heading} (${codes.join(", ")}) move from ${percent(change.old_rate)} to ${percent(change.new_rate)} on the full customs value, starting ${date(change.effective_date)}.`;
}

export interface DecisionStory {
  title: string;
  happened: string;
  broke: string;
  lede: string;
  incumbent: string;
  alternative: string;
  before?: number | null;
  increase?: number | null;
  withProof: number;
  withoutProof: number;
  verdict: string;
}

/** The alternative is the supplier whose evidence passport backs the switch. */
export function decisionStory(d: DecisionCheck, change: ChangeEvent | undefined, evidence: EvidenceStatus | undefined): DecisionStory {
  const award = AWARDS[d.decision_id];
  const incumbent = award ? supplierName(award.incumbent) : "the current supplier";
  const country = award ? SUPPLIERS[award.incumbent]?.country : undefined;
  const alternative = evidence ? supplierName(evidence.supplier_id) : "the alternative supplier";
  const withProof = d.alternative_with_proof_delta_usd ?? d.alternative_with_proof_annual_usd - d.incumbent_annual_usd;
  const withoutProof = d.alternative_without_proof_delta_usd ?? d.alternative_without_proof_annual_usd - d.incumbent_annual_usd;
  const rate = change ? `${percent(change.new_rate)}` : "the new rate";
  return {
    title: award?.title ?? `Decision ${d.decision_id}`,
    happened: award
      ? `On ${date(award.decidedOn)}, ${award.partLabel} were awarded to ${incumbent}${country ? ` (${country})` : ""}, assuming ${award.assumption}.`
      : d.reason,
    broke: d.status === "broken"
      ? `That assumption no longer holds: the duty is now ${rate}${change ? ` from ${date(change.effective_date)}` : ""}.`
      : "The award's assumptions still hold.",
    lede: d.status === "broken" && change
      ? `The award was priced at ${percent(change.old_rate)} duty; from ${date(change.effective_date)} it is ${rate}.`
      : "",
    incumbent,
    alternative,
    before: d.incumbent_before_annual_usd,
    increase: d.incumbent_delta_annual_usd,
    withProof,
    withoutProof,
    verdict: withProof < 0 && withoutProof > 0
      ? `Switching to ${alternative} saves ${money(-withProof)} a year, but only with ${PROOF}. Without it, the switch costs ${money(withoutProof)} more.`
      : withProof < 0
        ? `Switching to ${alternative} saves ${money(-withProof)} a year.`
        : `${incumbent} is still the cheapest documented option.`,
  };
}

export function openChecks(data: WorkspaceData): { documents: number; requirements: number } {
  return {
    documents: data.documents?.filter(doc => doc.review.length).length ?? 0,
    requirements: data.evidence.requirements?.filter(row => row.status !== "checked").length ?? 0,
  };
}
