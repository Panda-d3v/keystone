export const money = (value: number, digits = 0) => new Intl.NumberFormat("en-US", {style: "currency", currency: "USD", minimumFractionDigits: digits, maximumFractionDigits: digits}).format(value);
export const percent = (value: number) => new Intl.NumberFormat("en-US", {style: "percent", maximumFractionDigits: 1}).format(value);
export function date(value: string) {
  return new Intl.DateTimeFormat("en-US", {month: "short", day: "numeric", year: "numeric", timeZone: "UTC"}).format(new Date(value.length === 10 ? `${value}T00:00:00Z` : value));
}
export const words = (value: string) => value.replaceAll("_", " ");
