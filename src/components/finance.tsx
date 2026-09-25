import { useMemo, useState, type FormEvent } from "react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip as ChartTooltip, XAxis, YAxis } from "recharts";
import { ArrowDownRight, ArrowUpRight, Calculator, Coins, FileText, Paperclip, Pencil, Plus, Send, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import type { DocFile } from "@/components/documents";

export type FinanceTx = {
  id: string; scheme_id: string; direction: string; fund: string; category: string | null;
  description: string; supplier: string | null; amount: number; occurred_on: string;
  status: string; work_order_id: string | null; notes: string | null; budget_line_item_id: string | null;
};
export type FinanceLineItem = { id: string; budget_id: string; fund: string; cost_type: string; description: string; amount: number };
export type FinanceBudget = {
  id: string; financial_year: string; admin_fund_total: number; maintenance_fund_total: number;
  allocation_method: string | null; levy_due_date: string;
};
export type ForecastLine = {
  id: string; scheme_id: string; financial_year: string; direction: string; fund: string;
  category: string | null; label: string; amount: number; expected_month: number; notes: string | null;
};
type FinLevy = {
  id: string; amount: number; due_date: string; status: string; paid_at: string | null;
  lots: { lot_number: number; owner_name: string | null; owner_email: string | null; entitlement_percent: number } | null;
  budgets: { financial_year: string; admin_fund_total: number; maintenance_fund_total: number; allocation_method: string | null } | null;
};
type FinLot = { id: string; lot_number: number; owner_name: string | null; owner_email: string | null; entitlement_percent: number };

const FINANCE_FOLDER = "Finance";
const FUNDS = ["Admin", "Maintenance"] as const;
const OUT_CATEGORIES = ["Repairs and maintenance", "Cleaning", "Gardening", "Utilities", "Insurance", "Professional fees", "Bank and admin", "Capital works", "Other"];
const IN_CATEGORIES = ["Levy contribution", "Interest", "Reimbursement", "Fee or fine", "Other"];
const STATUSES = ["Paid", "Approved", "Planned"];

const money = (n: number) => n.toLocaleString("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 });
const money2 = (n: number) => n.toLocaleString("en-AU", { style: "currency", currency: "AUD", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const niceDate = (v: string) => new Date(v).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
const startYearOf = (iso: string) => { const d = new Date(iso); return d.getMonth() >= 6 ? d.getFullYear() : d.getFullYear() - 1; };
const fyLabel = (startYear: number) => `${startYear}/${String(startYear + 1).slice(2)}`;
const budgetStartYear = (fy: string) => { const m = fy.match(/\d{4}/); return m ? Number(m[0]) : new Date().getFullYear(); };
const FY_MONTHS = [7, 8, 9, 10, 11, 12, 1, 2, 3, 4, 5, 6];
const monthName = (m: number) => new Date(2000, m - 1, 1).toLocaleDateString("en-AU", { month: "short" });
const monthLabel = (m: number, startYear: number) => `${monthName(m)} ${m >= 7 ? startYear : startYear + 1}`;

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`rounded-[26px] border border-border/70 bg-card ${className}`}>{children}</div>;
}
function PageHead({ eyebrow, title, blurb, action }: { eyebrow: string; title: string; blurb: string; action?: React.ReactNode }) {
  return <div className="flex flex-wrap items-end justify-between gap-4">
    <div className="max-w-2xl">
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">{eyebrow}</p>
      <h1 className="mt-4 text-4xl font-medium tracking-[-0.035em] sm:text-5xl">{title}</h1>
      <p className="mt-5 text-[15px] leading-7 text-muted-foreground">{blurb}</p>
    </div>
    {action}
  </div>;
}
function Row({ label, value, tone = "" }: { label: string; value: string; tone?: string }) {
  return <div className="flex items-baseline justify-between gap-4 border-t border-border/60 py-2 first:border-0 first:pt-0">
    <span className="text-[12px] text-muted-foreground">{label}</span>
    <span className={`text-[13px] font-medium tabular-nums ${tone}`}>{value}</span>
  </div>;
}

function TxDialog({ open, onOpenChange, schemeId, tx, defaultFund, lineItems, onSaved }: {
  open: boolean; onOpenChange: (v: boolean) => void; schemeId?: string | undefined; tx: FinanceTx | null;
  defaultFund?: string | undefined; lineItems: FinanceLineItem[]; onSaved: () => void;
}) {
  const [direction, setDirection] = useState(tx?.direction ?? "out");
  const [fund, setFund] = useState(tx?.fund ?? defaultFund ?? "Admin");
  const [category, setCategory] = useState(tx?.category ?? "");
  const [status, setStatus] = useState(tx?.status ?? "Paid");
  const [budgetLineItemId, setBudgetLineItemId] = useState(tx?.budget_line_item_id ?? "");
  const categories = direction === "in" ? IN_CATEGORIES : OUT_CATEGORIES;
  const matchableLines = lineItems.filter(l => l.fund === fund);

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!schemeId) return;
    const form = new FormData(e.currentTarget);
    const text = (k: string) => { const v = String(form.get(k) ?? "").trim(); return v === "" ? null : v; };
    const payload = {
      scheme_id: schemeId, direction, fund, status,
      category: category === "" ? null : category,
      description: String(form.get("description") ?? "").trim(),
      supplier: text("supplier"),
      amount: Number(text("amount") ?? 0) || 0,
      occurred_on: text("occurred_on") ?? new Date().toISOString().slice(0, 10),
      notes: text("notes"),
      budget_line_item_id: direction === "out" && budgetLineItemId !== "" ? budgetLineItemId : null,
    };
    if (payload.description === "") { toast("Give it a short description first"); return; }
    const { error } = tx
      ? await supabase.from("finance_transactions").update(payload).eq("id", tx.id)
      : await supabase.from("finance_transactions").insert(payload);
    if (error) { toast("Could not save that", { description: error.message }); return; }
    onOpenChange(false); onSaved(); toast(tx ? "Entry updated" : "Entry recorded");
  };

  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-[560px]">
      <DialogHeader>
        <DialogTitle className="font-display tracking-[-0.02em]">{tx ? "Edit entry" : "Record money in or out"}</DialogTitle>
        <DialogDescription>Every payment and receipt you record here feeds your fund balances and your forecast.</DialogDescription>
      </DialogHeader>
      <form onSubmit={submit} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Direction</Label>
            <Select value={direction} onValueChange={v => { setDirection(v); setCategory(""); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="out">Money out</SelectItem><SelectItem value="in">Money in</SelectItem></SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Fund</Label>
            <Select value={fund} onValueChange={setFund}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{FUNDS.map(f => <SelectItem key={f} value={f}>{f} fund</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </div>
        <div className="space-y-2"><Label htmlFor="description">What was it</Label><Input id="description" name="description" defaultValue={tx?.description ?? ""} placeholder="Gutter clean, front block" required /></div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Category</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger><SelectValue placeholder="Choose one" /></SelectTrigger>
              <SelectContent>{categories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-2"><Label htmlFor="supplier">{direction === "in" ? "Received from" : "Paid to"}</Label><Input id="supplier" name="supplier" defaultValue={tx?.supplier ?? ""} placeholder="Supplier or person" /></div>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-2"><Label htmlFor="amount">Amount</Label><Input id="amount" name="amount" type="number" min="0" step="0.01" defaultValue={tx?.amount ?? ""} required /></div>
          <div className="space-y-2"><Label htmlFor="occurred_on">Date</Label><Input id="occurred_on" name="occurred_on" type="date" defaultValue={tx?.occurred_on ?? new Date().toISOString().slice(0, 10)} /></div>
          <div className="space-y-2">
            <Label>Status</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </div>
        {direction === "out" && <div className="space-y-2">
          <Label>Match to budget line (optional)</Label>
          <Select value={budgetLineItemId} onValueChange={setBudgetLineItemId}>
            <SelectTrigger><SelectValue placeholder="Not budgeted" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="">Not budgeted</SelectItem>
              {matchableLines.map(l => <SelectItem key={l.id} value={l.id}>{l.description} ({money(l.amount)})</SelectItem>)}
            </SelectContent>
          </Select>
          <p className="text-[11px] leading-5 text-muted-foreground">Matching this to a budget line lets Finance track spend against what was planned. Leave as "Not budgeted" for a cost that wasn't forecast — it'll be flagged for the AGM.</p>
        </div>}
        <div className="space-y-2"><Label htmlFor="notes">Notes</Label><Textarea id="notes" name="notes" rows={3} defaultValue={tx?.notes ?? ""} placeholder="Anything the committee should remember" /></div>
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="ghost" className="rounded-full" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="submit" className="rounded-full">{tx ? "Save changes" : "Record it"}</Button>
        </div>
      </form>
    </DialogContent>
  </Dialog>;
}

function BudgetDialog({ open, onOpenChange, budget, fyName, hasLevies, onGoToLevies, onSaved }: {
  open: boolean; onOpenChange: (v: boolean) => void; budget: FinanceBudget | null; fyName: string;
  hasLevies: boolean; onGoToLevies?: (() => void) | undefined; onSaved: () => void;
}) {
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!budget) return;
    const form = new FormData(e.currentTarget);
    const payload = {
      admin_fund_total: Number(form.get("admin_fund_total") ?? 0) || 0,
      maintenance_fund_total: Number(form.get("maintenance_fund_total") ?? 0) || 0,
    };
    const { error } = await supabase.from("budgets").update(payload).eq("id", budget.id);
    if (error) { toast("Could not update the budget", { description: error.message }); return; }
    onOpenChange(false); onSaved(); toast("Fund budgets updated");
  };

  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="sm:max-w-[520px]">
      <DialogHeader>
        <DialogTitle className="font-display tracking-[-0.02em]">Fund budgets for {fyName}</DialogTitle>
        <DialogDescription>What each fund is meant to raise and spend across the year.</DialogDescription>
      </DialogHeader>
      {budget
        ? <form onSubmit={submit} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2"><Label htmlFor="admin_fund_total">Admin fund</Label><Input id="admin_fund_total" name="admin_fund_total" type="number" min="0" step="0.01" defaultValue={Number(budget.admin_fund_total)} required /></div>
              <div className="space-y-2"><Label htmlFor="maintenance_fund_total">Maintenance fund</Label><Input id="maintenance_fund_total" name="maintenance_fund_total" type="number" min="0" step="0.01" defaultValue={Number(budget.maintenance_fund_total)} required /></div>
            </div>
            {hasLevies && <p className="rounded-[18px] border border-border/70 bg-secondary/40 p-4 text-[12px] leading-5 text-muted-foreground">
              Levy notices already issued for {fyName} keep the amounts they were raised at. Changing these totals updates your fund tracking and forecast, not invoices that have already gone out.
            </p>}
            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="ghost" className="rounded-full" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button type="submit" className="rounded-full">Save totals</Button>
            </div>
          </form>
        : <div className="space-y-4">
            <p className="text-[13px] leading-6 text-muted-foreground">There is no budget for {fyName} yet. Budgets are created over in Levies, because setting one raises a levy notice against every lot.</p>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" className="rounded-full" onClick={() => onOpenChange(false)}>Close</Button>
              {onGoToLevies && <Button className="rounded-full" onClick={() => { onOpenChange(false); onGoToLevies(); }}>Go to Levies</Button>}
            </div>
          </div>}
    </DialogContent>
  </Dialog>;
}

function LineDialog({ open, onOpenChange, schemeId, line, financialYear, startYear, onSaved }: {
  open: boolean; onOpenChange: (v: boolean) => void; schemeId?: string | undefined; line: ForecastLine | null;
  financialYear: string; startYear: number; onSaved: () => void;
}) {
  const [direction, setDirection] = useState(line?.direction ?? "out");
  const [fund, setFund] = useState(line?.fund ?? "Admin");
  const [category, setCategory] = useState(line?.category ?? "");
  const [month, setMonth] = useState(String(line?.expected_month ?? 7));
  const categories = direction === "in" ? IN_CATEGORIES : OUT_CATEGORIES;

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!schemeId) return;
    const form = new FormData(e.currentTarget);
    const notes = String(form.get("notes") ?? "").trim();
    const payload = {
      scheme_id: schemeId, financial_year: financialYear, direction, fund,
      category: category === "" ? null : category,
      label: String(form.get("label") ?? "").trim(),
      amount: Number(String(form.get("amount") ?? "0")) || 0,
      expected_month: Number(month),
      notes: notes === "" ? null : notes,
    };
    if (payload.label === "") { toast("Give the line a short name first"); return; }
    const { error } = line
      ? await supabase.from("budget_forecast_lines").update(payload).eq("id", line.id)
      : await supabase.from("budget_forecast_lines").insert(payload);
    if (error) { toast("Could not save that line", { description: error.message }); return; }
    onOpenChange(false); onSaved(); toast(line ? "Line updated" : "Added to the plan");
  };

  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-[560px]">
      <DialogHeader>
        <DialogTitle className="font-display tracking-[-0.02em]">{line ? "Edit a planned line" : "Add to the plan"}</DialogTitle>
        <DialogDescription>What you expect to happen, which fund it comes from, and the month you expect it.</DialogDescription>
      </DialogHeader>
      <form onSubmit={submit} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Direction</Label>
            <Select value={direction} onValueChange={v => { setDirection(v); setCategory(""); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="out">Money out</SelectItem><SelectItem value="in">Money in</SelectItem></SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Fund</Label>
            <Select value={fund} onValueChange={setFund}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{FUNDS.map(f => <SelectItem key={f} value={f}>{f} fund</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </div>
        <div className="space-y-2"><Label htmlFor="label">What is it</Label><Input id="label" name="label" defaultValue={line?.label ?? ""} placeholder="Building insurance renewal" required /></div>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-2">
            <Label>Category</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger><SelectValue placeholder="Choose one" /></SelectTrigger>
              <SelectContent>{categories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-2"><Label htmlFor="amount">Amount</Label><Input id="amount" name="amount" type="number" min="0" step="0.01" defaultValue={line?.amount ?? ""} required /></div>
          <div className="space-y-2">
            <Label>Expected</Label>
            <Select value={month} onValueChange={setMonth}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{FY_MONTHS.map(m => <SelectItem key={m} value={String(m)}>{monthLabel(m, startYear)}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </div>
        <div className="space-y-2"><Label htmlFor="notes">Notes</Label><Textarea id="notes" name="notes" rows={3} defaultValue={line?.notes ?? ""} placeholder="How you arrived at the number" /></div>
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="ghost" className="rounded-full" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="submit" className="rounded-full">{line ? "Save changes" : "Add it"}</Button>
        </div>
      </form>
    </DialogContent>
  </Dialog>;
}

export function FinanceSection({ transactions, budgets, forecastLines, lineItems, levies, lots, documents, isCommittee, schemeId, goTo, onChanged }: {
  transactions: FinanceTx[]; budgets: FinanceBudget[]; forecastLines: ForecastLine[]; lineItems: FinanceLineItem[]; levies: FinLevy[]; lots: FinLot[];
  documents: DocFile[]; isCommittee: boolean; schemeId?: string | undefined;
  goTo?: ((s: string) => void) | undefined; onChanged: () => void;
}) {
  const today = new Date();
  const currentFy = today.getMonth() >= 6 ? today.getFullYear() : today.getFullYear() - 1;
  const years = useMemo(() => {
    const set = new Set<number>([currentFy]);
    transactions.forEach(t => set.add(startYearOf(t.occurred_on)));
    budgets.forEach(b => set.add(budgetStartYear(b.financial_year)));
    return [...set].sort((a, b) => b - a);
  }, [transactions, budgets, currentFy]);
  const [year, setYear] = useState(currentFy);
  const [txOpen, setTxOpen] = useState(false);
  const [editing, setEditing] = useState<FinanceTx | null>(null);
  const [recordFund, setRecordFund] = useState<string | undefined>(undefined);
  const [budgetOpen, setBudgetOpen] = useState(false);
  const [invoicesOpen, setInvoicesOpen] = useState(false);
  const [forecastOpen, setForecastOpen] = useState(false);
  const [calcOpen, setCalcOpen] = useState(false);
  const [filter, setFilter] = useState("all");

  const inYear = (iso: string) => startYearOf(iso) === year;
  const yearTx = transactions.filter(t => inYear(t.occurred_on));
  const yearBudgets = budgets.filter(b => budgetStartYear(b.financial_year) === year);
  const yearLevies = levies.filter(l => (l.budgets ? budgetStartYear(l.budgets.financial_year) === year : inYear(l.due_date)));

  const budgeted = {
    Admin: yearBudgets.reduce((s, b) => s + Number(b.admin_fund_total), 0),
    Maintenance: yearBudgets.reduce((s, b) => s + Number(b.maintenance_fund_total), 0),
  };
  const levyShare = (fund: "Admin" | "Maintenance", l: FinLevy) => {
    const admin = Number(l.budgets?.admin_fund_total ?? 0), maint = Number(l.budgets?.maintenance_fund_total ?? 0);
    const total = admin + maint;
    if (total <= 0) return fund === "Admin" ? Number(l.amount) : 0;
    return Number(l.amount) * ((fund === "Admin" ? admin : maint) / total);
  };
  const sum = (list: FinanceTx[]) => list.reduce((s, t) => s + Number(t.amount), 0);
  const perFund = (fund: "Admin" | "Maintenance") => {
    const paidLevies = yearLevies.filter(l => l.status === "Paid");
    const collected = paidLevies.reduce((s, l) => s + levyShare(fund, l), 0)
      + sum(yearTx.filter(t => t.direction === "in" && t.fund === fund && t.status === "Paid"));
    const owing = yearLevies.filter(l => l.status !== "Paid").reduce((s, l) => s + levyShare(fund, l), 0);
    const spent = sum(yearTx.filter(t => t.direction === "out" && t.fund === fund && t.status === "Paid"));
    const committed = sum(yearTx.filter(t => t.direction === "out" && t.fund === fund && t.status !== "Paid"));
    return { collected, owing, spent, committed, budget: budgeted[fund], remaining: budgeted[fund] - spent - committed, balance: collected - spent };
  };
  const admin = perFund("Admin"), maintenance = perFund("Maintenance");
  const totalIn = admin.collected + maintenance.collected;
  const totalOut = admin.spent + maintenance.spent;
  const totalBudget = budgeted.Admin + budgeted.Maintenance;

  const activeBudget = yearBudgets[0] ?? null;
  const yearLines = forecastLines.filter(l => budgetStartYear(l.financial_year) === year);

  // Budget-vs-actual, per line item — surfaces anything paid that either wasn't
  // budgeted for at all, or has pushed a specific line past what it budgeted,
  // so it can be flagged for the AGM rather than only seen as a fund-wide total.
  const activeLineItems = activeBudget ? lineItems.filter(li => li.budget_id === activeBudget.id) : [];
  const paidOutTx = yearTx.filter(t => t.direction === "out" && t.status === "Paid");
  const spentAgainstLine = (lineId: string) => sum(paidOutTx.filter(t => t.budget_line_item_id === lineId));
  const overBudgetLines = activeLineItems
    .map(li => ({ line: li, spent: spentAgainstLine(li.id), over: spentAgainstLine(li.id) - Number(li.amount) }))
    .filter(x => x.over > 0);
  const unbudgetedTx = paidOutTx.filter(t => !t.budget_line_item_id);
  const needsReporting = unbudgetedTx.length > 0 || overBudgetLines.length > 0;

  const monthsElapsed = year === currentFy ? Math.min(12, Math.max(1, (today.getMonth() + 12 - 6) % 12 + 1)) : 12;
  const projectedSpend = totalOut / monthsElapsed * 12 + admin.committed + maintenance.committed;
  const projectedPosition = (totalIn + admin.owing + maintenance.owing) - projectedSpend;

  const chartData = useMemo(() => {
    const months = Array.from({ length: 12 }, (_, i) => (6 + i) % 12);
    return months.map(m => {
      const label = new Date(2000, m, 1).toLocaleDateString("en-AU", { month: "short" });
      const matches = (iso: string) => { const d = new Date(iso); return d.getMonth() === m && startYearOf(iso) === year; };
      const inAmt = yearLevies.filter(l => l.paid_at && matches(l.paid_at)).reduce((s, l) => s + Number(l.amount), 0)
        + sum(yearTx.filter(t => t.direction === "in" && t.status === "Paid" && matches(t.occurred_on)));
      const outAmt = sum(yearTx.filter(t => t.direction === "out" && t.status === "Paid" && matches(t.occurred_on)));
      return { month: label, In: Math.round(inAmt), Out: Math.round(outAmt) };
    });
  }, [yearTx, yearLevies, year]);

  const visible = yearTx
    .filter(t => filter === "all" || (filter === "in" && t.direction === "in") || (filter === "out" && t.direction === "out") || filter === t.fund)
    .sort((a, b) => b.occurred_on.localeCompare(a.occurred_on));

  const remove = async (id: string) => {
    const { error } = await supabase.from("finance_transactions").delete().eq("id", id);
    if (error) { toast("Could not remove that", { description: error.message }); return; }
    onChanged(); toast("Entry removed");
  };

  const ensureFolder = async () => {
    if (!schemeId) return null;
    const { data: found } = await supabase.from("document_folders").select("id").eq("scheme_id", schemeId).eq("name", FINANCE_FOLDER).maybeSingle();
    if (found?.id) return found.id as string;
    const { data, error } = await supabase.from("document_folders").insert({ scheme_id: schemeId, name: FINANCE_FOLDER, icon: "Coins", color: "amber" }).select("id").single();
    if (error) { toast("Could not create the Finance folder", { description: error.message }); return null; }
    return data.id as string;
  };

  const attach = async (tx: FinanceTx, file: File) => {
    if (!schemeId) return;
    const folderId = await ensureFolder();
    const path = `${schemeId}/${crypto.randomUUID()}-${file.name}`;
    const up = await supabase.storage.from("documents").upload(path, file);
    if (up.error) { toast("Upload failed", { description: up.error.message }); return; }
    const { error } = await supabase.from("documents").insert({
      scheme_id: schemeId, name: file.name, category: tx.category ?? "Finance", folder_id: folderId,
      storage_path: path, file_size: file.size, mime_type: file.type, finance_transaction_id: tx.id,
    });
    if (error) { toast("Could not save the file", { description: error.message }); return; }
    onChanged(); toast("Filed under Finance in your documents");
  };

  const openDoc = async (doc: DocFile) => {
    if (!doc.storage_path) return;
    const { data, error } = await supabase.storage.from("documents").createSignedUrl(doc.storage_path, 600);
    if (error || !data) { toast("Could not open that file"); return; }
    window.open(data.signedUrl, "_blank", "noopener");
  };

  const docsFor = (id: string) => documents.filter(d => d.finance_transaction_id === id);

  const unpaid = yearLevies.filter(l => l.status !== "Paid");
  const invoiceText = (l: FinLevy) => [
    `Levy notice ${l.budgets?.financial_year ?? fyLabel(year)}`,
    `Lot ${l.lots?.lot_number ?? ""} ${l.lots?.owner_name ?? ""}`.trim(),
    `Amount due: ${money2(Number(l.amount))}`,
    `Due date: ${niceDate(l.due_date)}`,
    `Allocation: ${l.budgets?.allocation_method === "Equal" ? "Equal share for every lot" : `By lot entitlement (${l.lots?.entitlement_percent ?? 0}%)`}`,
    `Admin fund: ${money2(levyShare("Admin", l))}`,
    `Maintenance fund: ${money2(levyShare("Maintenance", l))}`,
  ].join("\n");

  const forecastText = [
    `Financial update ${fyLabel(year)}`,
    ``,
    `Budget for the year: ${money(totalBudget)}`,
    `Money in so far: ${money(totalIn)}`,
    `Money out so far: ${money(totalOut)}`,
    `Still to be collected: ${money(admin.owing + maintenance.owing)}`,
    `Committed but not yet paid: ${money(admin.committed + maintenance.committed)}`,
    ``,
    `Admin fund balance: ${money(admin.balance)} (budget ${money(admin.budget)})`,
    `Maintenance fund balance: ${money(maintenance.balance)} (budget ${money(maintenance.budget)})`,
    ``,
    `At this rate we expect to spend ${money(projectedSpend)} by the end of the year, leaving a projected ${projectedPosition >= 0 ? "surplus" : "shortfall"} of ${money(Math.abs(projectedPosition))}.`,
  ].join("\n");

  return <div className="space-y-8">
    <PageHead eyebrow="Finance" title="Where your money sits" blurb="Fund balances, what is coming in against what is going out, and a forecast you can take to the next meeting."
      action={<div className="flex flex-wrap items-center gap-2">
        <Select value={String(year)} onValueChange={v => setYear(Number(v))}>
          <SelectTrigger className="h-9 w-[150px] rounded-full text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>{years.map(y => <SelectItem key={y} value={String(y)}>{fyLabel(y)}</SelectItem>)}</SelectContent>
        </Select>
        {isCommittee && <Button className="rounded-full" onClick={() => { setEditing(null); setRecordFund(undefined); setTxOpen(true); }}><Plus />Record money</Button>}
      </div>} />

    <div className="grid gap-4 lg:grid-cols-3">
      {([["Admin fund", "day-to-day running costs", "Admin", admin], ["Maintenance fund", "savings for bigger repairs and works", "Maintenance", maintenance]] as const).map(([label, subtitle, fundKey, f]) => <Card key={label} className="p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground/80">{subtitle}</p>
          </div>
          <Coins className="size-4 text-muted-foreground" />
        </div>
        <p className="mt-4 text-3xl font-medium tracking-[-0.03em] tabular-nums">{money(f.balance)}</p>
        <p className="mt-1 text-[12px] text-muted-foreground">Collected less spent this year</p>
        <div className="mt-5">
          <Row label="Budget" value={money(f.budget)} />
          <Row label="Collected" value={money(f.collected)} />
          <Row label="Still owing" value={money(f.owing)} tone={f.owing > 0 ? "text-destructive" : ""} />
          <Row label="Spent" value={money(f.spent)} />
          <Row label="Already committed" value={money(f.committed)} />
          <Row label="Remaining budget" value={money(f.remaining)} tone={f.remaining < 0 ? "text-destructive" : ""} />
        </div>
        <p className="mt-3 text-[11px] leading-5 text-muted-foreground/80">"Already committed" is work quoted or approved but not yet paid — it's set aside from the remaining budget so it isn't spent twice.</p>
        {isCommittee && <div className="mt-5 flex flex-wrap gap-2">
          <Button size="sm" variant="outline" className="rounded-full" onClick={() => { setEditing(null); setRecordFund(fundKey); setTxOpen(true); }}><Plus />Money in or out</Button>
          <Button size="sm" variant="ghost" className="rounded-full" onClick={() => setBudgetOpen(true)}><Pencil />Adjust budget</Button>
        </div>}
      </Card>)}

      <Card className="bg-primary p-6 text-primary-foreground">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] opacity-70">Forecast to 30 June {year + 1}</p>
        <p className="mt-4 text-3xl font-medium tracking-[-0.03em] tabular-nums">{money(projectedSpend)}</p>
        <p className="mt-1 text-[12px] opacity-80">Expected spend at the current run rate</p>
        <div className="mt-6 space-y-3 text-[13px]">
          <div className="flex justify-between opacity-90"><span>{projectedPosition >= 0 ? "Surplus" : "Shortfall"} at this rate</span><span className="font-medium tabular-nums">{money(Math.abs(projectedPosition))}</span></div>
          <div className="flex justify-between opacity-90"><span>Against budget</span><span className="font-medium tabular-nums">{money(totalBudget - projectedSpend)}</span></div>
          <div className="flex justify-between opacity-90"><span>Months counted</span><span className="font-medium tabular-nums">{monthsElapsed} of 12</span></div>
        </div>
        <div className="mt-6 flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" className="rounded-full" onClick={() => setForecastOpen(true)}><Send />Send forecast</Button>
          <Button size="sm" variant="secondary" className="rounded-full" onClick={() => setCalcOpen(true)}><Calculator />Levy planner</Button>
        </div>
      </Card>
    </div>

    <Card className="p-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="font-display text-xl tracking-[-0.02em]">Money in against money out</h2>
          <p className="mt-1 text-[13px] text-muted-foreground">Levy payments received and bills paid, month by month across {fyLabel(year)}.</p>
        </div>
        <div className="flex gap-6 text-[12px]">
          <span className="flex items-center gap-2"><ArrowUpRight className="size-3.5" />In {money(totalIn)}</span>
          <span className="flex items-center gap-2"><ArrowDownRight className="size-3.5" />Out {money(totalOut)}</span>
        </div>
      </div>
      <div className="mt-6 h-[280px]">
        {chartData.some(d => d.In > 0 || d.Out > 0)
          ? <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="month" tickLine={false} axisLine={false} fontSize={11} />
                <YAxis tickLine={false} axisLine={false} fontSize={11} tickFormatter={v => money(Number(v))} width={70} />
                <ChartTooltip formatter={(v: number | string) => money(Number(v))} contentStyle={{ borderRadius: 14, border: "1px solid var(--border)", background: "var(--card)" }} />
                <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="In" fill="var(--primary)" radius={[6, 6, 0, 0]} />
                <Bar dataKey="Out" fill="var(--muted-foreground)" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          : <div className="flex h-full items-center justify-center rounded-[20px] border border-dashed border-border text-[13px] text-muted-foreground">Nothing recorded for this year yet. Record a payment and it will show here.</div>}
      </div>
    </Card>

    {needsReporting && <Card className="overflow-hidden border-destructive/30">
      <div className="border-b border-destructive/20 bg-destructive/5 px-6 py-4">
        <h2 className="font-display text-lg tracking-[-0.02em]">Needs reporting to the AGM</h2>
        <p className="mt-1 text-[13px] text-muted-foreground">Spending that wasn't in the budget, or that went over what a line item planned for — call these out when you report back to owners.</p>
      </div>
      <div className="divide-y divide-border/60">
        {overBudgetLines.map(({ line, spent, over }) => <div key={line.id} className="flex flex-wrap items-center justify-between gap-3 px-6 py-3.5">
          <div><p className="text-[13px] font-medium">{line.description}</p><p className="mt-0.5 text-[12px] text-muted-foreground">Budgeted {money(Number(line.amount))} · Spent {money(spent)}</p></div>
          <span className="text-[13px] font-medium tabular-nums text-destructive">{money(over)} over</span>
        </div>)}
        {unbudgetedTx.map(t => <div key={t.id} className="flex flex-wrap items-center justify-between gap-3 px-6 py-3.5">
          <div><p className="text-[13px] font-medium">{t.description}</p><p className="mt-0.5 text-[12px] text-muted-foreground">{niceDate(t.occurred_on)} · {t.fund} fund · not budgeted</p></div>
          <span className="text-[13px] font-medium tabular-nums">{money2(Number(t.amount))}</span>
        </div>)}
      </div>
    </Card>}

    <BudgetPlan lines={yearLines} year={year} fyName={activeBudget?.financial_year ?? fyLabel(year)} currentFy={currentFy}
      schemeId={schemeId} isCommittee={isCommittee} budget={activeBudget}
      fundsOnHand={admin.balance + maintenance.balance} leviesToCollect={admin.owing + maintenance.owing}
      committedOut={admin.committed + maintenance.committed} lots={lots} onChanged={onChanged} />

    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/70 p-6">
        <div>
          <h2 className="font-display text-xl tracking-[-0.02em]">Money movements</h2>
          <p className="mt-1 text-[13px] text-muted-foreground">Every expense and receipt, with the paperwork attached to it.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={filter} onValueChange={setFilter}>
            <SelectTrigger className="h-9 w-[160px] rounded-full text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Everything</SelectItem>
              <SelectItem value="in">Money in</SelectItem>
              <SelectItem value="out">Money out</SelectItem>
              <SelectItem value="Admin">Admin fund</SelectItem>
              <SelectItem value="Maintenance">Maintenance fund</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" className="rounded-full" onClick={() => setInvoicesOpen(true)}><FileText />Invoices</Button>
        </div>
      </div>
      {visible.length === 0
        ? <p className="p-10 text-center text-[13px] text-muted-foreground">Nothing recorded for {fyLabel(year)} yet.</p>
        : <div className="divide-y divide-border/60">
            {visible.map(t => <div key={t.id} className="flex flex-wrap items-center gap-4 px-6 py-4">
              <span className={`grid size-8 shrink-0 place-items-center rounded-full ${t.direction === "in" ? "bg-primary/10 text-primary" : "bg-secondary text-muted-foreground"}`}>
                {t.direction === "in" ? <ArrowUpRight className="size-4" /> : <ArrowDownRight className="size-4" />}
              </span>
              <div className="min-w-[180px] flex-1">
                <p className="text-sm font-medium">{t.description}</p>
                <p className="mt-0.5 text-[12px] text-muted-foreground">{[niceDate(t.occurred_on), t.category, t.supplier, `${t.fund} fund`].filter(Boolean).join(" · ")}
                  {t.direction === "out" && t.status === "Paid" && !t.budget_line_item_id && <span className="ml-1.5 text-destructive">· not budgeted</span>}</p>
                {docsFor(t.id).length > 0 && <div className="mt-2 flex flex-wrap gap-2">
                  {docsFor(t.id).map(d => <button key={d.id} onClick={() => void openDoc(d)} className="rounded-full border border-border bg-secondary px-2.5 py-1 text-[11px] hover:bg-secondary/70">{d.name}</button>)}
                </div>}
              </div>
              <span className={`rounded-full border border-border px-2.5 py-1 text-[11px] ${t.status === "Paid" ? "text-muted-foreground" : "text-foreground"}`}>{t.status}</span>
              <span className="w-28 text-right text-sm font-medium tabular-nums">{t.direction === "in" ? "+" : "−"}{money2(Number(t.amount))}</span>
              {isCommittee && <div className="flex items-center gap-1">
                <Button asChild size="icon" variant="ghost" className="rounded-full" aria-label="Attach a receipt">
                  <label><Paperclip className="size-4" /><input type="file" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) void attach(t, f); e.currentTarget.value = ""; }} /></label>
                </Button>
                <Button size="sm" variant="ghost" className="rounded-full text-xs" onClick={() => { setEditing(t); setTxOpen(true); }}>Edit</Button>
                <Button size="icon" variant="ghost" className="rounded-full text-muted-foreground" aria-label="Remove entry" onClick={() => void remove(t.id)}><Trash2 className="size-4" /></Button>
              </div>}
            </div>)}
          </div>}
    </Card>

    {txOpen && <TxDialog key={editing?.id ?? `new-${recordFund ?? "any"}`} open={txOpen} onOpenChange={setTxOpen} schemeId={schemeId}
      tx={editing} defaultFund={recordFund} lineItems={activeLineItems} onSaved={onChanged} />}

    {budgetOpen && <BudgetDialog key={activeBudget?.id ?? "no-budget"} open={budgetOpen} onOpenChange={setBudgetOpen}
      budget={activeBudget} fyName={activeBudget?.financial_year ?? fyLabel(year)} hasLevies={yearLevies.length > 0}
      onGoToLevies={goTo ? () => goTo("Levies") : undefined} onSaved={onChanged} />}

    <Dialog open={invoicesOpen} onOpenChange={setInvoicesOpen}>
      <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-[620px]">
        <DialogHeader>
          <DialogTitle className="font-display tracking-[-0.02em]">Invoices for {fyLabel(year)}</DialogTitle>
          <DialogDescription>A levy notice for every lot that still owes money, with the fund breakdown spelled out.</DialogDescription>
        </DialogHeader>
        {unpaid.length === 0
          ? <p className="py-8 text-center text-[13px] text-muted-foreground">Every lot is up to date. Nothing to invoice.</p>
          : <div className="space-y-3">
              {unpaid.map(l => <div key={l.id} className="rounded-[18px] border border-border/70 p-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium">Lot {l.lots?.lot_number} {l.lots?.owner_name ? `· ${l.lots.owner_name}` : ""}</p>
                    <p className="mt-0.5 text-[12px] text-muted-foreground">Due {niceDate(l.due_date)} · Admin {money2(levyShare("Admin", l))} · Maintenance {money2(levyShare("Maintenance", l))}</p>
                  </div>
                  <span className="text-sm font-medium tabular-nums">{money2(Number(l.amount))}</span>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" className="rounded-full" onClick={() => { void navigator.clipboard.writeText(invoiceText(l)); toast("Invoice copied"); }}>Copy invoice</Button>
                  {l.lots?.owner_email && <Button asChild size="sm" variant="ghost" className="rounded-full">
                    <a href={`mailto:${l.lots.owner_email}?subject=${encodeURIComponent(`Levy notice ${l.budgets?.financial_year ?? fyLabel(year)}`)}&body=${encodeURIComponent(invoiceText(l))}`}>Email it</a>
                  </Button>}
                </div>
              </div>)}
            </div>}
      </DialogContent>
    </Dialog>

    <Dialog open={forecastOpen} onOpenChange={setForecastOpen}>
      <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle className="font-display tracking-[-0.02em]">Financial update for owners</DialogTitle>
          <DialogDescription>Ready to paste into an email or drop into your meeting papers.</DialogDescription>
        </DialogHeader>
        <pre className="whitespace-pre-wrap rounded-[18px] border border-border/70 bg-secondary/40 p-4 text-[13px] leading-6">{forecastText}</pre>
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="outline" className="rounded-full" onClick={() => { void navigator.clipboard.writeText(forecastText); toast("Update copied"); }}>Copy</Button>
          <Button asChild className="rounded-full">
            <a href={`mailto:${lots.map(l => l.owner_email).filter(Boolean).join(",")}?subject=${encodeURIComponent(`Financial update ${fyLabel(year)}`)}&body=${encodeURIComponent(forecastText)}`}>Email all owners</a>
          </Button>
        </div>
      </DialogContent>
    </Dialog>

    <LevyPlanner open={calcOpen} onOpenChange={setCalcOpen} lots={lots} defaultTarget={totalBudget} />
  </div>;
}

function BudgetPlan({ lines, year, fyName, currentFy, schemeId, isCommittee, budget, fundsOnHand, leviesToCollect, committedOut, lots, onChanged }: {
  lines: ForecastLine[]; year: number; fyName: string; currentFy: number; schemeId?: string | undefined;
  isCommittee: boolean; budget: FinanceBudget | null; fundsOnHand: number; leviesToCollect: number;
  committedOut: number; lots: FinLot[]; onChanged: () => void;
}) {
  const [lineOpen, setLineOpen] = useState(false);
  const [editing, setEditing] = useState<ForecastLine | null>(null);
  const [reportOpen, setReportOpen] = useState(false);

  const todayPos = FY_MONTHS.indexOf(new Date().getMonth() + 1);
  const isRemaining = (m: number) => year > currentFy ? true : year < currentFy ? false : FY_MONTHS.indexOf(m) >= todayPos;
  const firstRemaining = FY_MONTHS.find(isRemaining) ?? null;

  const sumL = (list: ForecastLine[]) => list.reduce((t, l) => t + Number(l.amount), 0);
  const outLines = lines.filter(l => l.direction !== "in");
  const inLines = lines.filter(l => l.direction === "in");
  const plannedOut = sumL(outLines);
  const plannedIn = sumL(inLines);

  // Levies still owing land in the month they fall due, or straight away if that month has passed.
  const levyDueMonth = budget ? new Date(budget.levy_due_date).getMonth() + 1 : null;
  const levyMonth = levyDueMonth !== null && isRemaining(levyDueMonth) ? levyDueMonth : firstRemaining;

  const timeline = (() => {
    let running = fundsOnHand;
    return FY_MONTHS.map(m => {
      const live = isRemaining(m);
      const inAmt = sumL(inLines.filter(l => l.expected_month === m)) + (m === levyMonth ? leviesToCollect : 0);
      const outAmt = sumL(outLines.filter(l => l.expected_month === m)) + (m === firstRemaining ? committedOut : 0);
      if (live) running += inAmt - outAmt;
      return { month: m, inAmt, outAmt, running, live };
    });
  })();

  const stillIn = leviesToCollect + sumL(inLines.filter(l => isRemaining(l.expected_month)));
  const stillOut = committedOut + sumL(outLines.filter(l => isRemaining(l.expected_month)));
  const projected = fundsOnHand + stillIn - stillOut;

  const fundTotals = FUNDS.map(f => ({
    fund: f,
    out: sumL(outLines.filter(l => l.fund === f)),
    moneyIn: sumL(inLines.filter(l => l.fund === f)),
    lines: lines.filter(l => l.fund === f).sort((a, b) => FY_MONTHS.indexOf(a.expected_month) - FY_MONTHS.indexOf(b.expected_month)),
  }));

  const removeLine = async (id: string) => {
    const { error } = await supabase.from("budget_forecast_lines").delete().eq("id", id);
    if (error) { toast("Could not remove that line", { description: error.message }); return; }
    onChanged(); toast("Line removed");
  };

  const applyToBudget = async () => {
    if (!budget) return;
    const admin = fundTotals.find(f => f.fund === "Admin")?.out ?? 0;
    const maintenance = fundTotals.find(f => f.fund === "Maintenance")?.out ?? 0;
    const { error } = await supabase.from("budgets").update({ admin_fund_total: admin, maintenance_fund_total: maintenance }).eq("id", budget.id);
    if (error) { toast("Could not update the budget", { description: error.message }); return; }
    onChanged();
    toast("Fund budgets set from the plan", { description: `Admin ${money(admin)} · Maintenance ${money(maintenance)}` });
  };

  const reportText = [
    `Budget plan ${fyName}`,
    `Prepared ${niceDate(new Date().toISOString().slice(0, 10))}`,
    ``,
    `WHAT WE PLAN TO SPEND`,
    ...fundTotals.flatMap(f => [
      ``,
      `${f.fund} fund — ${money2(f.out)}`,
      ...f.lines.filter(l => l.direction !== "in").map(l => `  ${monthLabel(l.expected_month, year)} · ${l.label}${l.category ? ` (${l.category})` : ""} · ${money2(Number(l.amount))}`),
      ...(f.lines.filter(l => l.direction !== "in").length === 0 ? [`  Nothing planned yet`] : []),
    ]),
    ``,
    `Total planned spend: ${money2(plannedOut)}`,
    ``,
    `WHAT WE EXPECT TO RECEIVE`,
    `  Levies still to be collected: ${money2(leviesToCollect)}`,
    ...inLines.map(l => `  ${monthLabel(l.expected_month, year)} · ${l.label} · ${money2(Number(l.amount))}`),
    `Total expected income: ${money2(leviesToCollect + plannedIn)}`,
    ``,
    `WHEN IT HAPPENS`,
    ...timeline.filter(t => t.inAmt > 0 || t.outAmt > 0).map(t =>
      `  ${monthLabel(t.month, year)} · in ${money2(t.inAmt)} · out ${money2(t.outAmt)} · balance ${money2(t.running)}`),
    ``,
    `WHERE WE LAND`,
    `  Funds on hand today: ${money2(fundsOnHand)}`,
    `  Still to come in: ${money2(stillIn)}`,
    `  Still to go out: ${money2(stillOut)}`,
    `  Projected at 30 June ${year + 1}: ${money2(projected)}`,
    ``,
    projected >= 0
      ? `On these numbers the funds stay in surplus through to the end of the financial year.`
      : `On these numbers the funds fall short by ${money2(Math.abs(projected))} before the end of the financial year, so the committee needs to either raise levies or defer some of the work above.`,
  ].join("\n");

  const summary: [string, string, string][] = [
    ["Funds on hand today", money(fundsOnHand), "Collected less spent"],
    ["Still to come in", money(stillIn), "Levies owing and planned income"],
    ["Still to go out", money(stillOut), "Planned and committed spend"],
    ["Projected at 30 June " + (year + 1), money(projected), projected >= 0 ? "In surplus" : "Short on these numbers"],
  ];

  return <Card className="overflow-hidden">
    <div className="flex flex-wrap items-end justify-between gap-3 border-b border-border/70 p-6">
      <div className="max-w-xl">
        <h2 className="font-display text-xl tracking-[-0.02em]">Budget plan for {fyName}</h2>
        <p className="mt-1 text-[13px] leading-6 text-muted-foreground">Break the year into the things you expect to pay for, say when each one falls, and see what is left at 30 June.</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {isCommittee && budget && lines.length > 0 && <Button variant="outline" size="sm" className="rounded-full" onClick={() => void applyToBudget()}><Calculator />Set fund budgets</Button>}
        {lines.length > 0 && <Button variant="outline" size="sm" className="rounded-full" onClick={() => setReportOpen(true)}><Send />Report for owners</Button>}
        {isCommittee && <Button size="sm" className="rounded-full" onClick={() => { setEditing(null); setLineOpen(true); }}><Plus />Add a line</Button>}
      </div>
    </div>

    <div className="grid border-b border-border/70 sm:grid-cols-2 xl:grid-cols-4">
      {summary.map(([label, value, hint], i) => <div key={label} className={`p-6 ${i > 0 ? "border-border/60 sm:border-l" : ""}`}>
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
        <p className={`mt-3 text-2xl font-medium tracking-[-0.03em] tabular-nums ${label.startsWith("Projected") && projected < 0 ? "text-destructive" : ""}`}>{value}</p>
        <p className="mt-1 text-[11px] text-muted-foreground/80">{hint}</p>
      </div>)}
    </div>

    {lines.length === 0
      ? <div className="p-10 text-center">
          <p className="text-[13px] text-muted-foreground">Nothing planned for {fyName} yet.</p>
          {isCommittee && <Button variant="outline" size="sm" className="mt-4 rounded-full" onClick={() => { setEditing(null); setLineOpen(true); }}><Plus />Add your first line</Button>}
        </div>
      : <div className="grid xl:grid-cols-12">
          <div className="xl:col-span-7">
            {fundTotals.map(f => <div key={f.fund} className="border-b border-border/60 last:border-0">
              <div className="flex items-center justify-between gap-4 bg-secondary/30 px-6 py-3">
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{f.fund} fund</p>
                <p className="text-[12px] tabular-nums text-muted-foreground">{money(f.out)} planned out{f.moneyIn > 0 ? ` · ${money(f.moneyIn)} in` : ""}</p>
              </div>
              {f.lines.length === 0
                ? <p className="px-6 py-5 text-[12px] text-muted-foreground">Nothing planned from this fund.</p>
                : <div className="divide-y divide-border/60">
                    {f.lines.map(l => <div key={l.id} className="flex flex-wrap items-center gap-3 px-6 py-3.5">
                      <span className={`grid size-7 shrink-0 place-items-center rounded-full ${l.direction === "in" ? "bg-primary/10 text-primary" : "bg-secondary text-muted-foreground"}`}>
                        {l.direction === "in" ? <ArrowUpRight className="size-3.5" /> : <ArrowDownRight className="size-3.5" />}
                      </span>
                      <div className="min-w-[150px] flex-1">
                        <p className="text-[13px] font-medium">{l.label}</p>
                        <p className="mt-0.5 text-[11px] text-muted-foreground">{[monthLabel(l.expected_month, year), l.category].filter(Boolean).join(" · ")}</p>
                      </div>
                      <span className="w-24 text-right text-[13px] font-medium tabular-nums">{l.direction === "in" ? "+" : "−"}{money2(Number(l.amount))}</span>
                      {isCommittee && <div className="flex items-center gap-1">
                        <Button size="sm" variant="ghost" className="rounded-full text-xs" onClick={() => { setEditing(l); setLineOpen(true); }}>Edit</Button>
                        <Button size="icon" variant="ghost" className="rounded-full text-muted-foreground" aria-label={`Remove ${l.label}`} onClick={() => void removeLine(l.id)}><Trash2 className="size-4" /></Button>
                      </div>}
                    </div>)}
                  </div>}
            </div>)}
          </div>

          <div className="border-border/60 xl:col-span-5 xl:border-l">
            <div className="flex items-center justify-between gap-4 bg-secondary/30 px-6 py-3">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Month by month</p>
              <p className="text-[11px] text-muted-foreground">Running balance</p>
            </div>
            <div className="divide-y divide-border/60">
              {timeline.map(t => <div key={t.month} className={`flex items-center gap-3 px-6 py-2.5 text-[12px] ${t.live ? "" : "opacity-45"}`}>
                <span className="w-20 shrink-0 text-muted-foreground">{monthLabel(t.month, year)}</span>
                <span className="w-20 shrink-0 text-right tabular-nums text-muted-foreground">{t.inAmt > 0 ? `+${money(t.inAmt)}` : "—"}</span>
                <span className="w-20 shrink-0 text-right tabular-nums text-muted-foreground">{t.outAmt > 0 ? `−${money(t.outAmt)}` : "—"}</span>
                <span className={`flex-1 text-right font-medium tabular-nums ${t.live && t.running < 0 ? "text-destructive" : ""}`}>{t.live ? money(t.running) : "passed"}</span>
              </div>)}
            </div>
            <p className="px-6 py-4 text-[11px] leading-5 text-muted-foreground/80">Months already gone are greyed out — the running balance starts from what you hold today and only counts what is still ahead of you.</p>
          </div>
        </div>}

    {lineOpen && <LineDialog key={editing?.id ?? "new-line"} open={lineOpen} onOpenChange={setLineOpen} schemeId={schemeId}
      line={editing} financialYear={fyName} startYear={year} onSaved={onChanged} />}

    <Dialog open={reportOpen} onOpenChange={setReportOpen}>
      <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-[620px]">
        <DialogHeader>
          <DialogTitle className="font-display tracking-[-0.02em]">Budget report for owners</DialogTitle>
          <DialogDescription>The whole plan written out, ready for your meeting papers or an email to owners.</DialogDescription>
        </DialogHeader>
        <pre className="whitespace-pre-wrap rounded-[18px] border border-border/70 bg-secondary/40 p-4 text-[12px] leading-6">{reportText}</pre>
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="outline" className="rounded-full" onClick={() => { void navigator.clipboard.writeText(reportText); toast("Report copied"); }}>Copy</Button>
          <Button asChild className="rounded-full">
            <a href={`mailto:${lots.map(l => l.owner_email).filter(Boolean).join(",")}?subject=${encodeURIComponent(`Budget plan ${fyName}`)}&body=${encodeURIComponent(reportText)}`}>Email all owners</a>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  </Card>;
}

function LevyPlanner({ open, onOpenChange, lots, defaultTarget }: {
  open: boolean; onOpenChange: (v: boolean) => void; lots: FinLot[]; defaultTarget: number;
}) {
  const [target, setTarget] = useState(String(defaultTarget || 0));
  const [method, setMethod] = useState("Entitlement");
  const [instalments, setInstalments] = useState("4");
  const total = Number(target) || 0;
  const per = Math.max(1, Number(instalments) || 1);
  const shareFor = (lot: FinLot) => method === "Equal" ? total / Math.max(1, lots.length) : total * (Number(lot.entitlement_percent) / 100);

  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-[600px]">
      <DialogHeader>
        <DialogTitle className="font-display tracking-[-0.02em]">Levy planner</DialogTitle>
        <DialogDescription>Work out what each lot pays before you commit to a budget.</DialogDescription>
      </DialogHeader>
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-2"><Label htmlFor="target">Amount to raise</Label><Input id="target" type="number" min="0" value={target} onChange={e => setTarget(e.target.value)} /></div>
        <div className="space-y-2">
          <Label>Allocation</Label>
          <Select value={method} onValueChange={setMethod}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="Entitlement">By lot entitlement</SelectItem><SelectItem value="Equal">Equal share</SelectItem></SelectContent>
          </Select>
        </div>
        <div className="space-y-2"><Label htmlFor="inst">Instalments</Label><Input id="inst" type="number" min="1" max="12" value={instalments} onChange={e => setInstalments(e.target.value)} /></div>
      </div>
      {lots.length === 0
        ? <p className="py-8 text-center text-[13px] text-muted-foreground">Add your lots first and this will work out each share.</p>
        : <div className="mt-2 divide-y divide-border/60 rounded-[18px] border border-border/70">
            {lots.map(l => <div key={l.id} className="flex items-center justify-between gap-4 px-4 py-2.5 text-[13px]">
              <span>Lot {l.lot_number}{l.owner_name ? ` · ${l.owner_name}` : ""}</span>
              <span className="text-muted-foreground">{method === "Equal" ? "Equal share" : `${l.entitlement_percent}%`}</span>
              <span className="tabular-nums">{money2(shareFor(l))} <span className="text-muted-foreground">/ yr</span></span>
              <span className="tabular-nums font-medium">{money2(shareFor(l) / per)} <span className="font-normal text-muted-foreground">each</span></span>
            </div>)}
          </div>}
    </DialogContent>
  </Dialog>;
}
