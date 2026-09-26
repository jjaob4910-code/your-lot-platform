// Shared levy data model and fund-balance math, used by the dashboard's Current Cash
// widget, the Finance section (fund balances, reporting), and the Actions workspace's
// Financial Statements preview — one source of truth instead of three drifting copies.

export type Levy = {
  id: string; lot_id: string; budget_id: string; amount: number; due_date: string; status: string; paid_at: string | null;
  lots: { lot_number: number; owner_name: string | null; owner_email: string | null; entitlement_percent: number } | null;
  budgets: { financial_year: string; admin_fund_total: number; maintenance_fund_total: number; allocation_method: string | null } | null;
};
export type FundBudget = { financial_year: string; admin_fund_total: number; maintenance_fund_total: number };
export type FundTx = { direction: string; fund: string; status: string; amount: number; occurred_on: string };

export const currentFinancialYearStart = () => {
  const today = new Date();
  return today.getMonth() >= 6 ? today.getFullYear() : today.getFullYear() - 1;
};

const startYearOf = (iso: string) => { const d = new Date(iso); return d.getMonth() >= 6 ? d.getFullYear() : d.getFullYear() - 1; };
export const budgetStartYear = (fy: string) => { const m = fy.match(/\d{4}/); return m ? Number(m[0]) : new Date().getFullYear(); };

// Splits a levy's own amount between the admin and maintenance funds, proportionally
// to the two funds' share of the budget total it was raised against.
export function levyShare(fund: "Admin" | "Maintenance", levy: Levy) {
  const admin = Number(levy.budgets?.admin_fund_total ?? 0), maint = Number(levy.budgets?.maintenance_fund_total ?? 0);
  const total = admin + maint;
  if (total <= 0) return fund === "Admin" ? Number(levy.amount) : 0;
  return Number(levy.amount) * ((fund === "Admin" ? admin : maint) / total);
}
export const adminShare = (levy: Levy) => levyShare("Admin", levy);
export const maintShare = (levy: Levy) => levyShare("Maintenance", levy);

export function computeFundBalances(levies: Levy[], budgets: FundBudget[], transactions: FundTx[], year: number) {
  const yearLevies = levies.filter(l => l.budgets ? budgetStartYear(l.budgets.financial_year) === year : startYearOf(l.due_date) === year);
  const yearTx = transactions.filter(t => startYearOf(t.occurred_on) === year);

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
