import type { DecisionCheck } from "@/lib/contracts";
export function waterfallBars(decision: DecisionCheck) {
  const before = decision.incumbent_before_annual_usd;
  if (before == null) return null;
  const after = decision.incumbent_annual_usd;
  const scale = Math.max(before, after, 1);
  return [
    {
      label: "Before the notice",
      value: before,
      bottom: 0,
      height: before / scale,
    },
    {
      label: "Added annual duty",
      value: decision.incumbent_delta_annual_usd ?? null,
      bottom: Math.min(before, after) / scale,
      height: Math.abs(after - before) / scale,
    },
    {
      label: "After the notice",
      value: after,
      bottom: 0,
      height: after / scale,
    },
  ];
}
