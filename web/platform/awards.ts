// Award status after any decision recorded in this browser.
import { AWARDS_LIST, type Award } from "./catalog";
import type { Outcome } from "./store";

export interface AwardView extends Award { state: Award["status"]; recorded?: Outcome }

export function awardViews(outcomes: Outcome[]): AwardView[] {
  return AWARDS_LIST.map(award => {
    const recorded = outcomes.find(o => o.actionId === award.id && (o.kind === "award_approved" || o.kind === "award_declined"));
    return { ...award, state: recorded ? "decided" : award.status, recorded };
  });
}

export const STATE_LABEL: Record<Award["status"], [string, string]> = {
  open: ["Needs a decision", "chip-bad"],
  review: ["In review", "chip-warn"],
  decided: ["Decided", "chip-good"],
};
