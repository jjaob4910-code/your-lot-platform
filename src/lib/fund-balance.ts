// Standalone "how much cash is on hand right now" calculation, used by the dashboard's
// Current Cash widget. Deliberately not imported from finance.tsx — that component owns a
// much larger, year-selectable version of this same math entangled with its own local state,
// and duplicating this one pure calculation here is safer than refactoring a working,
// already-tested component for an unrelated feature.

export type FundLevy = {
  amount: number; status: string; due_date: string;
  budgets: { financial_year: string; admin_fund_total: number; maintenance_fund_total: number; allocation_method: string | null } | null;
};
export type FundBudget = { financial_year: string; admin_fund_total: number; maintenance_fund_total: number };
export type FundTx = { direction: string; fund: string; status: string; amount: number; occurred_on: string };

export const currentFinancialYearStart = () => {
  const today = new Date();
  return today.getMonth() >= 6 ? today.getFullYear() : today.getFullYear() - 1;
};

const startYearOf = (iso: string) => { const d = new Date(iso); return d.getMonth() >= 6 ? d.getFullYear() : d.getFullYear() - 1; };
const budgetStartYear = (fy: string) => { const m = fy.match(/\d{4}/); return m ? Number(m[0]) : new Date().getFullYear(); };

export function computeFundBalances(levies: FundLevy[], budgets: FundBudget[], transactions: FundTx[], year: number) {
  const yearLevies = levies.filter(l => l.budgets ? budgetStartYear(l.budgets.financial_year) === year : startYearOf(l.due_date) === year);
  const yearTx = transactions.filter(t => startYearOf(t.occurred_on) === year);

  const levyShare = (fund: "Admin" | "Maintenance", l: FundLevy) => {
    const admin = Number(l.budgets?.admin_fund_total ?? 0), maint = Number(l.budgets?.maintenance_fund_total ?? 0);
    const total = admin + maint;
    if (total <= 0) return fund === "Admin" ? Number(l.amount) : 0;
    return Number(l.amount) * ((fund === "Admin" ? admin : maint) / total);
  };
  const sum = (list: FundTx[]) => list.reduce((s, t) => s + Number(t.amount), 0);
  const balanceFor = (fund: "Admin" | "Maintenance") => {
    const collected = yearLevies.filter(l => l.status === "Paid").reduce((s, l) => s + levyShare(fund, l), 0)
      + sum(yearTx.filter(t => t.direction === "in" && t.fund === fund && t.status === "Paid"));
    const spent = sum(yearTx.filter(t => t.direction === "out" && t.fund === fund && t.status === "Paid"));
    return collected - spent;
  };
  const admin = balanceFor("Admin"), maintenance = balanceFor("Maintenance");
  return { admin, maintenance, total: admin + maintenance };
}
