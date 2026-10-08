// Shared levy data model and fund-balance math, used by the dashboard's Current Cash
// widget, the Finance section (fund balances, reporting), and the Actions workspace's
// Financial Statements preview — one source of truth instead of three drifting copies.
// Funds are a custom, per-scheme list (not a fixed Admin/Maintenance pair), so a levy's
// budget carries its fund split as a list of {fund_id, total} rows rather than two
// named columns.

export type BudgetFundTotal = { fund_id: string; total: number };
export type Levy = {
  id: string; lot_id: string; budget_id: string; amount: number; due_date: string; status: string; paid_at: string | null;
  notified_at: string | null; notified_amount: number | null; reminded_at?: string | null;
  /** An extra labelled charge (e.g. a cost added after levies were paid); when fund_id is set it belongs wholly to that fund. */
  label?: string | null; fund_id?: string | null;
  lots: { lot_number: number; owner_name: string | null; owner_email: string | null; entitlement_percent: number } | null;
  budgets: { financial_year: string; allocation_method: string | null; total_amount: number; budget_fund_totals: BudgetFundTotal[] } | null;
};
export type FundBudget = { financial_year: string; total_amount: number; budget_fund_totals: BudgetFundTotal[] };
// levy_id is set on money-in rows recorded automatically when a levy is marked paid.
// Those levies are already counted via their own paid status, so balances skip these
// rows to avoid counting the same payment twice.
export type FundTx = { direction: string; fund_id: string; status: string; amount: number; occurred_on: string; levy_id?: string | null };

export const currentFinancialYearStart = () => {
  const today = new Date();
  return today.getMonth() >= 6 ? today.getFullYear() : today.getFullYear() - 1;
};

/** The financial year (1 Jul – 30 Jun) a date falls in, as its starting calendar year. */
export const financialYearOf = (iso: string) => { const d = new Date(iso.length === 10 ? `${iso}T00:00:00` : iso); return d.getMonth() >= 6 ? d.getFullYear() : d.getFullYear() - 1; };
const startYearOf = financialYearOf;
export const budgetStartYear = (fy: string) => { const m = fy.match(/\d{4}/); return m ? Number(m[0]) : new Date().getFullYear(); };

// Splits a levy's own amount across its budget's funds, proportionally to each fund's
// share of the budget total it was raised against.
export function levyShareForFund(levy: Levy, fundId: string) {
  if (levy.fund_id) return levy.fund_id === fundId ? Number(levy.amount) : 0;
  const totals = levy.budgets?.budget_fund_totals ?? [];
  const grand = totals.reduce((s, t) => s + Number(t.total), 0);
  if (grand <= 0) return 0;
  const fundTotal = totals.find(t => t.fund_id === fundId)?.total ?? 0;
  return Number(levy.amount) * (Number(fundTotal) / grand);
}

// Splits a levy's amount into one row per fund it was raised against, rounded to cents,
// with any rounding remainder folded into the last row so the rows sum to levy.amount
// exactly — used to create one finance_transactions row per fund when a levy is paid.
export function splitLevyAcrossFunds(levy: Levy): { fund_id: string; amount: number }[] {
  if (levy.fund_id) return [{ fund_id: levy.fund_id, amount: Number(levy.amount) }];
  const totals = (levy.budgets?.budget_fund_totals ?? []).filter(t => Number(t.total) > 0);
  if (totals.length === 0) return [];
  const rounded = totals.map(t => ({ fund_id: t.fund_id, amount: Math.round(levyShareForFund(levy, t.fund_id) * 100) / 100 }));
  const remainder = Math.round((Number(levy.amount) - rounded.reduce((s, r) => s + r.amount, 0)) * 100) / 100;
  if (remainder !== 0) rounded[rounded.length - 1]!.amount = Math.round((rounded[rounded.length - 1]!.amount + remainder) * 100) / 100;
  return rounded;
}

// What each fund holds according to everything recorded in Loty, across all years:
// paid levies plus paid money in, less paid money out. There's no opening bank balance,
// so money held before the scheme started using Loty isn't included. Voided entries
// must already be filtered out by the caller.
export function recordedFundBalances(levies: Levy[], transactions: FundTx[]): Record<string, number> {
  const out: Record<string, number> = {};
  const add = (fundId: string, v: number) => { out[fundId] = (out[fundId] ?? 0) + v; };
  for (const l of levies) {
    if (l.status !== "Paid") continue;
    if (l.fund_id) { add(l.fund_id, Number(l.amount)); continue; }
    for (const t of l.budgets?.budget_fund_totals ?? []) add(t.fund_id, levyShareForFund(l, t.fund_id));
  }
  for (const t of transactions) {
    if (t.status !== "Paid") continue;
    if (t.direction === "in" && !t.levy_id) add(t.fund_id, Number(t.amount));
    if (t.direction === "out") add(t.fund_id, -Number(t.amount));
  }
  return out;
}

// Each fund's closing balance at the end of the year before `year`: everything recorded
// in earlier financial years, carried forward automatically. Voided entries must already
// be filtered out by the caller.
export function broughtForwardBalances(levies: Levy[], transactions: FundTx[], year: number): Record<string, number> {
  const earlierLevies = levies.filter(l => (l.budgets ? budgetStartYear(l.budgets.financial_year) : startYearOf(l.due_date)) < year);
  const earlierTx = transactions.filter(t => startYearOf(t.occurred_on) < year);
  return recordedFundBalances(earlierLevies, earlierTx);
}

