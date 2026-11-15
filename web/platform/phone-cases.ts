export const workflow = [
  { id: "intake", label: "Documents" },
  { id: "exposure", label: "Check costs" },
  { id: "decisions", label: "Choose by component" },
  { id: "actions", label: "Follow up" },
  { id: "brief", label: "Review brief" },
] as const;

export type Choice = "keep" | "switch";

export interface Component {
  id: string;
  name: string;
  supplier: string;
  alternative: string;
  volume: number;
  unitValue: number;
  alternativeUnitCost: number;
  qualificationCost: number;
  verified: boolean;
  decision?: Choice;
}

interface PhoneCase {
  id: string;
  title: string;
  product: string;
  previousRate: number;
  rate: number;
  effective: string;
  components: Component[];
}

export const phoneCases: PhoneCase[] = [
  {
    id: "TC-101", title: "Semiconductor duty increase", product: "Galaxy flagship",
    previousRate: 0, rate: 0.10, effective: "January 1, 2027",
    components: [
      { id: "AP-101", name: "Processor", supplier: "Samsung", alternative: "Alternative processor platform", volume: 1_000_000, unitValue: 40, alternativeUnitCost: 42, qualificationCost: 3_000_000, verified: false },
      { id: "RAM-101", name: "LPDDR RAM", supplier: "Samsung", alternative: "Memory supplier B", volume: 1_000_000, unitValue: 18, alternativeUnitCost: 18.70, qualificationCost: 150_000, verified: false },
      { id: "UFS-101", name: "UFS storage", supplier: "Samsung", alternative: "Storage supplier C", volume: 1_000_000, unitValue: 30, alternativeUnitCost: 31, qualificationCost: 200_000, verified: true, decision: "switch" },
    ],
  },
  {
    id: "TC-102", title: "Display module duty increase", product: "Galaxy midrange",
    previousRate: 0.05, rate: 0.15, effective: "February 1, 2027",
    components: [
      { id: "OLED-201", name: "OLED display", supplier: "Display supplier A", alternative: "Display supplier B", volume: 600_000, unitValue: 22, alternativeUnitCost: 24, qualificationCost: 350_000, verified: true, decision: "keep" },
      { id: "DDIC-201", name: "Display driver", supplier: "Display supplier A", alternative: "Driver supplier C", volume: 600_000, unitValue: 4, alternativeUnitCost: 4.2, qualificationCost: 60_000, verified: true, decision: "switch" },
    ],
  },
  {
    id: "TC-103", title: "Battery assembly duty increase", product: "Galaxy foldable",
    previousRate: 0, rate: 0.08, effective: "March 1, 2027",
    components: [
      { id: "BAT-301", name: "Battery pack", supplier: "Battery supplier A", alternative: "Battery supplier B", volume: 250_000, unitValue: 24, alternativeUnitCost: 24.65, qualificationCost: 100_000, verified: true },
      { id: "PMIC-301", name: "Power controller", supplier: "Battery supplier A", alternative: "Power supplier C", volume: 250_000, unitValue: 5, alternativeUnitCost: 5.30, qualificationCost: 45_000, verified: false, decision: "keep" },
    ],
  },
];

export function costs(component: Component, tariff: PhoneCase) {
  const addedDuty = component.unitValue * (tariff.rate - tariff.previousRate);
  const keep = component.unitValue * (1 + tariff.rate);
  const savings = Math.round((keep - component.alternativeUnitCost) * component.volume - component.qualificationCost);
  return { addedDuty, keep, savings };
}
