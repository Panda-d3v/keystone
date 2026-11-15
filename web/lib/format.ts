export const money = (value: number, digits = 0) => new Intl.NumberFormat("en-US", {style: "currency", currency: "USD", minimumFractionDigits: digits, maximumFractionDigits: digits}).format(value);
export const percent = (value: number) => new Intl.NumberFormat("en-US", {style: "percent", maximumFractionDigits: 1}).format(value);
export function date(value: string) {
  return new Intl.DateTimeFormat("en-US", {month: "short", day: "numeric", year: "numeric", timeZone: "UTC"}).format(new Date(value.length === 10 ? `${value}T00:00:00Z` : value));
}
export const words = (value: string) => value.replaceAll("_", " ");
/** Plain-language action heading from A5, falling back to the action type. */
export const actionTitle = (action: { title?: string | null; type: string }) =>
  action.title?.trim() || sentence(words(action.type));
/** Dollars at stake are annual amounts from the decision rules. */
export const atStake = (value: number) => `${money(value)} a year at stake`;
const sentence = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);
