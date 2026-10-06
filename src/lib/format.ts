// One way to show money and dates across Loty. A missing value always reads "—".
// Date-only strings (YYYY-MM-DD) are read as local dates so they never shift a day.

type Maybe<T> = T | null | undefined;

const asDate = (v: string) => new Date(v.length === 10 ? `${v}T00:00:00` : v);

/** Whole dollars, e.g. "$6,350". */
export const money = (n: Maybe<number>) =>
  n === null || n === undefined ? "—" : Number(n).toLocaleString("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 });

/** Dollars and cents where amounts are exact (ledger entries, quotes, claims), e.g. "$1,234.50"; whole amounts drop the ".00". */
export const moneyCents = (n: Maybe<number>) =>
  n === null || n === undefined ? "—"
    : Number(n).toLocaleString("en-AU", { style: "currency", currency: "AUD", minimumFractionDigits: Number.isInteger(Number(n)) ? 0 : 2, maximumFractionDigits: 2 });

/** "30 Nov 2026". */
export const niceDate = (v: Maybe<string>) =>
  v ? asDate(v).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" }) : "—";

/** "Mon, 30 November 2026", for calendar detail. */
export const weekdayDate = (v: Maybe<string>) =>
  v ? asDate(v.slice(0, 10)).toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "long", year: "numeric" }) : "—";

/** "Monday, 30 November 2026", for formal documents. */
export const longDate = (v: Maybe<string>) =>
  v ? asDate(v.slice(0, 10)).toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "long", year: "numeric" }) : "—";

/** Whole days from today until the date (negative once it has passed). */
export const daysUntil = (date: string) =>
  Math.ceil((asDate(date.slice(0, 10)).getTime() - new Date(new Date().toDateString()).getTime()) / 86400000);
