import { useMemo, useState, type FormEvent } from "react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip as ChartTooltip, XAxis, YAxis } from "recharts";
import { ArrowDownRight, ArrowUpRight, Calculator, Coins, FileText, Paperclip, Plus, Send, Trash2 } from "lucide-react";
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
  status: string; work_order_id: string | null; notes: string | null;
};
export type FinanceBudget = {
  id: string; financial_year: string; admin_fund_total: number; maintenance_fund_total: number;
  allocation_method: string | null; levy_due_date: string;
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

function TxDialog({ open, onOpenChange, schemeId, tx, onSaved }: {
  open: boolean; onOpenChange: (v: boolean) => void; schemeId?: string | undefined; tx: FinanceTx | null; onSaved: () => void;
}) {
  const [direction, setDirection] = useState(tx?.direction ?? "out");
  const [fund, setFund] = useState(tx?.fund ?? "Admin");
  const [category, setCategory] = useState(tx?.category ?? "");
  const [status, setStatus] = useState(tx?.status ?? "Paid");
  const categories = direction === "in" ? IN_CATEGORIES : OUT_CATEGORIES;

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
        <div className="space-y-2"><Label htmlFor="notes">Notes</Label><Textarea id="notes" name="notes" rows={3} defaultValue={tx?.notes ?? ""} placeholder="Anything the committee should remember" /></div>
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="ghost" className="rounded-full" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="submit" className="rounded-full">{tx ? "Save changes" : "Record it"}</Button>
        </div>
      </form>
    </DialogContent>
  </Dialog>;
}

export function FinanceSection({ transactions, budgets, levies, lots, documents, isCommittee, schemeId, onChanged }: {
  transactions: FinanceTx[]; budgets: FinanceBudget[]; levies: FinLevy[]; lots: FinLot[];
  documents: DocFile[]; isCommittee: boolean; schemeId?: string | undefined; onChanged: () => void;
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

  const docsFor = (id: string) => documents.filter(d => (d as DocFile & { finance_transaction_id?: string | null }).finance_transaction_id === id);

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
        {isCommittee && <Button className="rounded-full" onClick={() => { setEditing(null); setTxOpen(true); }}><Plus />Record money</Button>}
      </div>} />

    <div className="grid gap-4 lg:grid-cols-3">
      {([["Admin fund", admin], ["Maintenance fund", maintenance]] as const).map(([label, f]) => <Card key={label} className="p-6">
        <div className="flex items-center justify-between">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
          <Coins className="size-4 text-muted-foreground" />
        </div>
        <p className="mt-4 text-3xl font-medium tracking-[-0.03em] tabular-nums">{money(f.balance)}</p>
        <p className="mt-1 text-[12px] text-muted-foreground">Collected less spent this year</p>
        <div className="mt-5">
          <Row label="Budget" value={money(f.budget)} />
          <Row label="Collected" value={money(f.collected)} />
          <Row label="Still owing" value={money(f.owing)} tone={f.owing > 0 ? "text-destructive" : ""} />
          <Row label="Spent" value={money(f.spent)} />
          <Row label="Committed" value={money(f.committed)} />
          <Row label="Left in budget" value={money(f.remaining)} tone={f.remaining < 0 ? "text-destructive" : ""} />
        </div>
      </Card>)}

      <Card className="bg-primary p-6 text-primary-foreground">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] opacity-70">Forecast to 30 June {year + 1}</p>
        <p className="mt-4 text-3xl font-medium tracking-[-0.03em] tabular-nums">{money(projectedSpend)}</p>
        <p className="mt-1 text-[12px] opacity-80">Expected spend at the current run rate</p>
        <div className="mt-6 space-y-3 text-[13px]">
          <div className="flex justify-between opacity-90"><span>Projected {projectedPosition >= 0 ? "surplus" : "shortfall"}</span><span className="font-medium tabular-nums">{money(Math.abs(projectedPosition))}</span></div>
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
                <p className="mt-0.5 text-[12px] text-muted-foreground">{[niceDate(t.occurred_on), t.category, t.supplier, `${t.fund} fund`].filter(Boolean).join(" · ")}</p>
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

    {txOpen && <TxDialog key={editing?.id ?? "new"} open={txOpen} onOpenChange={setTxOpen} schemeId={schemeId} tx={editing} onSaved={onChanged} />}

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
