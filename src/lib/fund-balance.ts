// Shared levy data model and fund-balance math, used by the dashboard's Current Cash
// widget, the Finance section (fund balances, reporting), and the Actions workspace's
// Financial Statements preview — one source of truth instead of three drifting copies.
// Funds are a custom, per-scheme list (not a fixed Admin/Maintenance pair), so a levy's
// budget carries its fund split as a list of {fund_id, total} rows rather than two
// named columns.

export type BudgetFundTotal = { fund_id: string; total: number };
export type Levy = {
  id: string; lot_id: string; budget_id: string; amount: number; due_date: string; status: string; paid_at: string | null;
  notified_at: string | null; notified_amount: number | null;
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

const startYearOf = (iso: string) => { const d = new Date(iso); return d.getMonth() >= 6 ? d.getFullYear() : d.getFullYear() - 1; };
export const budgetStartYear = (fy: string) => { const m = fy.match(/\d{4}/); return m ? Number(m[0]) : new Date().getFullYear(); };

// Splits a levy's own amount across its budget's funds, proportionally to each fund's
// share of the budget total it was raised against.
export function levyShareForFund(levy: Levy, fundId: string) {
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
    for (const t of l.budgets?.budget_fund_totals ?? []) add(t.fund_id, levyShareForFund(l, t.fund_id));
  }
  for (const t of transactions) {
    if (t.status !== "Paid") continue;
    if (t.direction === "in" && !t.levy_id) add(t.fund_id, Number(t.amount));
    if (t.direction === "out") add(t.fund_id, -Number(t.amount));
  }
  return out;
}

export function computeFundBalances(levies: Levy[], transactions: FundTx[], year: number) {
  const yearLevies = levies.filter(l => l.budgets ? budgetStartYear(l.budgets.financial_year) === year : startYearOf(l.due_date) === year);
  const yearTx = transactions.filter(t => startYearOf(t.occurred_on) === year);

  const fundIds = new Set<string>();
  yearLevies.forEach(l => l.budgets?.budget_fund_totals.forEach(t => fundIds.add(t.fund_id)));
  yearTx.forEach(t => fundIds.add(t.fund_id));

  const sum = (list: FundTx[]) => list.reduce((s, t) => s + Number(t.amount), 0);
  const byFund: Record<string, number> = {};
  for (const fundId of fundIds) {
    const collected = yearLevies.filter(l => l.status === "Paid").reduce((s, l) => s + levyShareForFund(l, fundId), 0)
      + sum(yearTx.filter(t => t.direction === "in" && t.fund_id === fundId && t.status === "Paid" && !t.levy_id));
    const spent = sum(yearTx.filter(t => t.direction === "out" && t.fund_id === fundId && t.status === "Paid"));
    byFund[fundId] = collected - spent;
  }
  const total = Object.values(byFund).reduce((s, v) => s + v, 0);
  return { total, byFund };
}
