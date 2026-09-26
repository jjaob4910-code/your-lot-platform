import { useMemo, useState, type FormEvent } from "react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip as ChartTooltip, XAxis, YAxis } from "recharts";
import { ArrowDownRight, ArrowUpRight, Coins, History, Paperclip, Pencil, Plus, Send, Trash2, Undo2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import type { DocFile } from "@/components/documents";
import { adminShare, maintShare, levyShare, type Levy } from "@/lib/fund-balance";

export type FinanceTx = {
  id: string; scheme_id: string; direction: string; fund: string; category: string | null;
  description: string; supplier: string | null; amount: number; occurred_on: string;
  status: string; work_order_id: string | null; notes: string | null; budget_line_item_id: string | null;
};
export type BudgetLineItem = { id: string; budget_id: string; scheme_id: string; fund: string; description: string; amount: number; cost_type: string; expected_month: number | null };
export type FinanceBudget = {
  id: string; financial_year: string; admin_fund_total: number; maintenance_fund_total: number;
  allocation_method: string | null; levy_due_date: string;
};
export type BudgetRevision = {
  id: string; budget_id: string; scheme_id: string; reason: string;
  previous_admin_fund_total: number; previous_maintenance_fund_total: number;
  previous_allocation_method: string; previous_levy_due_date: string; previous_line_items: DraftLineItemJson[];
  new_admin_fund_total: number; new_maintenance_fund_total: number;
  new_allocation_method: string; new_levy_due_date: string; new_line_items: DraftLineItemJson[];
  levies_recalculated: boolean; created_at: string;
};
type DraftLineItemJson = { fund: string; description: string; amount: number };
export type FinLot = { id: string; lot_number: number; owner_name: string | null; owner_email: string | null; entitlement_percent: number };

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
function StatusPill({ status }: { status: string }) {
  const tone = status === "Overdue" ? "bg-destructive/10 text-destructive"
    : status === "Paid" || status === "Complete" ? "bg-primary/10 text-primary"
    : "bg-secondary text-muted-foreground";
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-medium ${tone}`}>{status}</span>;
}

async function ensureFinanceFolder(schemeId: string) {
  const { data: found } = await supabase.from("document_folders").select("id").eq("scheme_id", schemeId).eq("name", FINANCE_FOLDER).maybeSingle();
  if (found?.id) return found.id as string;
  const { data, error } = await supabase.from("document_folders").insert({ scheme_id: schemeId, name: FINANCE_FOLDER, icon: "Coins", color: "amber" }).select("id").single();
  if (error) return null;
  return data.id as string;
}
export async function uploadFinanceDoc(schemeId: string, file: File, opts: { category: string; budget_line_item_id?: string; levy_id?: string; finance_transaction_id?: string }) {
  const folderId = await ensureFinanceFolder(schemeId);
  const path = `${schemeId}/${crypto.randomUUID()}-${file.name}`;
  const up = await supabase.storage.from("documents").upload(path, file);
  if (up.error) return { error: up.error.message };
  const { error } = await supabase.from("documents").insert({
    scheme_id: schemeId, name: file.name, category: opts.category, folder_id: folderId,
    storage_path: path, file_size: file.size, mime_type: file.type,
    budget_line_item_id: opts.budget_line_item_id ?? null, levy_id: opts.levy_id ?? null, finance_transaction_id: opts.finance_transaction_id ?? null,
  });
  return { error: error?.message };
}
async function openFinanceDoc(doc: DocFile) {
  if (!doc.storage_path) return;
  const { data, error } = await supabase.storage.from("documents").createSignedUrl(doc.storage_path, 600);
  if (error || !data) { toast("Could not open that file"); return; }
  window.open(data.signedUrl, "_blank", "noopener");
}

function reminderText(levy: Levy, status: string) {
  const who = levy.lots?.owner_name ?? "there";
  const year = levy.budgets?.financial_year ? ` for ${levy.budgets.financial_year}` : "";
  return status === "Overdue"
    ? `Hi ${who},\n\nA quick friendly note: the levy${year} for Lot ${levy.lots?.lot_number ?? ""} of ${money(Number(levy.amount))} was due on ${niceDate(levy.due_date)} and is still showing as unpaid on our records.\n\nIf you have already paid, please ignore this and let us know so we can update the books. Otherwise, whenever you get a chance is fine.\n\nThanks,\nYour owners corporation committee`
    : `Hi ${who},\n\nJust a friendly reminder that the levy${year} for Lot ${levy.lots?.lot_number ?? ""} of ${money(Number(levy.amount))} is due on ${niceDate(levy.due_date)}.\n\nNo action needed if it is already on its way.\n\nThanks,\nYour owners corporation committee`;
}

export const shareAmount = (method: string, entitlementPercent: number, lotCount: number, total: number) =>
  Math.round((method === "Equal" ? total / Math.max(1, lotCount) : (entitlementPercent / 100) * total) * 100) / 100;

export type DraftLine = { id: string; fund: "Admin" | "Maintenance"; costType: "Fixed" | "Variable"; description: string; amount: string; month: string; file: File | null };
export const emptyDraftLine = (): DraftLine => ({ id: crypto.randomUUID(), fund: "Admin", costType: "Variable", description: "", amount: "", month: "", file: null });
export const draftTotals = (lines: DraftLine[]) => ({
  admin: lines.filter(l => l.fund === "Admin").reduce((s, l) => s + (Number(l.amount) || 0), 0),
  maintenance: lines.filter(l => l.fund === "Maintenance").reduce((s, l) => s + (Number(l.amount) || 0), 0),
  fixed: lines.filter(l => l.costType === "Fixed").reduce((s, l) => s + (Number(l.amount) || 0), 0),
  variable: lines.filter(l => l.costType === "Variable").reduce((s, l) => s + (Number(l.amount) || 0), 0),
});
// Common owners-corporation costs to seed a scheme's very first budget with, so a first-time
// user only has to adjust amounts rather than think up a list of categories from scratch.
const STARTER_BUDGET_ROWS: [string, "Admin" | "Maintenance", "Fixed" | "Variable"][] = [
  ["Building insurance", "Admin", "Fixed"], ["Public liability insurance", "Admin", "Fixed"],
  ["Cleaning", "Admin", "Fixed"], ["Gardening & grounds", "Admin", "Fixed"],
  ["Common area electricity", "Admin", "Variable"], ["Water rates", "Admin", "Variable"],
  ["Pest control", "Admin", "Variable"], ["Fire safety compliance", "Admin", "Fixed"],
  ["Bank fees & admin", "Admin", "Fixed"], ["Repairs & maintenance", "Maintenance", "Variable"],
  ["Capital works contribution", "Maintenance", "Fixed"],
];
export const STARTER_BUDGET_LINES: DraftLine[] = STARTER_BUDGET_ROWS.map(([description, fund, costType]) => ({ id: crypto.randomUUID(), fund, costType, description, amount: "", month: "", file: null }));
const lineItemsToDraft = (items: { id: string; fund: string; description: string; amount: number; cost_type?: string; expected_month?: number | null }[]): DraftLine[] =>
  items.length ? items.map(i => ({ id: i.id, fund: i.fund === "Maintenance" ? "Maintenance" : "Admin", costType: i.cost_type === "Fixed" ? "Fixed" : "Variable", description: i.description, amount: String(i.amount), month: i.expected_month ? String(i.expected_month) : "", file: null })) : [emptyDraftLine()];
const jsonLineItemsToDraft = (items: DraftLineItemJson[]): DraftLine[] =>
  items.length ? items.map(i => ({ id: crypto.randomUUID(), fund: i.fund === "Maintenance" ? "Maintenance" : "Admin", costType: "Variable", description: i.description, amount: String(i.amount), month: "", file: null })) : [emptyDraftLine()];
// Starting point for a new year's budget: last year's lines (carried amounts, cleared months)
// to adjust, or the generic starter template if this scheme has never budgeted before.
export const draftLinesForNewBudget = (previousYearLineItems: BudgetLineItem[]): DraftLine[] =>
  previousYearLineItems.length
    ? previousYearLineItems.map(i => ({ id: crypto.randomUUID(), fund: i.fund === "Maintenance" ? "Maintenance" : "Admin", costType: i.cost_type === "Fixed" ? "Fixed" : "Variable", description: i.description, amount: String(i.amount), month: "", file: null }))
    : STARTER_BUDGET_LINES.map(l => ({ ...l, id: crypto.randomUUID() }));

const budgetChangeText = (financialYear: string, reason: string, prevAdmin: number, prevMaint: number, newAdmin: number, newMaint: number, recalculated: boolean) => [
  `Budget update for ${financialYear}`,
  ``,
  reason,
  ``,
  `Admin fund: ${money(prevAdmin)} → ${money(newAdmin)}`,
  `Maintenance fund: ${money(prevMaint)} → ${money(newMaint)}`,
  ``,
  recalculated
    ? "Levies still to be paid have been recalculated to reflect this. If you have already paid, you may hear from us separately about an adjustment to your amount."
    : "This does not change any levy amounts already issued.",
  ``,
  `Thanks,\nYour owners corporation committee`,
].join("\n");

const refundText = (levy: Levy, diff: number, financialYear: string) => {
  const who = levy.lots?.owner_name ?? "there";
  const lot = levy.lots?.lot_number ?? "";
  const reassessed = Number(levy.amount) + diff;
  return diff < 0
    ? `Hi ${who},\n\nFollowing a correction to the ${financialYear} budget, your paid levy for Lot ${lot} of ${money(Number(levy.amount))} has been reassessed at ${money(reassessed)}.\n\nYou are owed a refund of ${money(-diff)}. The committee will arrange this with you directly.\n\nThanks,\nYour owners corporation committee`
    : `Hi ${who},\n\nFollowing a correction to the ${financialYear} budget, your paid levy for Lot ${lot} of ${money(Number(levy.amount))} has been reassessed at ${money(reassessed)}.\n\nAn additional ${money(diff)} is now owing. The committee will follow up with you about this.\n\nThanks,\nYour owners corporation committee`;
};

// A spreadsheet-style editor: one row per cost, fund/type/month as dropdowns, amount
// as a plain number field, live subtotals per fund at the bottom. Used both for building
// a brand-new budget and for editing an existing one, so there's exactly one place a
// committee learns to fill in a cost — not a different tool for each situation.
export function LineItemsEditor({ lines, setLines, startYear, spentByLineId }: {
  lines: DraftLine[]; setLines: (lines: DraftLine[]) => void; startYear?: number | undefined;
  spentByLineId?: ((id: string) => number) | undefined;
}) {
  const update = (id: string, patch: Partial<DraftLine>) => setLines(lines.map(l => l.id === id ? { ...l, ...patch } : l));
  const remove = (id: string) => { if (lines.length > 1) setLines(lines.filter(l => l.id !== id)); };
  const totals = draftTotals(lines);
  const tracking = !!spentByLineId;

  return <div className="space-y-3">
    <p className="text-[11px] leading-5 text-muted-foreground">
      <span className="font-medium">Fixed</span> — a known, recurring cost (insurance, a cleaning contract). <span className="font-medium">Variable</span> — a one-off or estimated cost (a repair quote). <span className="font-medium">When</span> — the month you expect to pay it; leave blank if you're not sure yet.
    </p>
    <div className="overflow-x-auto rounded-2xl border border-border/70">
      <table className="w-full min-w-[820px] border-collapse text-[13px]">
        <thead>
          <tr className="border-b border-border/70 bg-secondary/40 text-left text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
            <th className="px-3 py-2.5">Description</th>
            <th className="px-3 py-2.5">Fund</th>
            <th className="px-3 py-2.5">Type</th>
            <th className="px-3 py-2.5">When</th>
            <th className="px-3 py-2.5 text-right">Budgeted</th>
            {tracking && <th className="px-3 py-2.5 text-right">Spent</th>}
            {tracking && <th className="px-3 py-2.5 text-right">Remaining</th>}
            <th className="w-[72px] px-3 py-2.5" />
          </tr>
        </thead>
        <tbody>
          {lines.map(line => {
            const spent = tracking ? spentByLineId(line.id) : 0;
            const remaining = (Number(line.amount) || 0) - spent;
            return <tr key={line.id} className="border-b border-border/60 last:border-0">
              <td className="px-3 py-2"><Input placeholder="What is it" value={line.description} onChange={e => update(line.id, { description: e.target.value })} className="h-9" /></td>
              <td className="px-3 py-2">
                <Select value={line.fund} onValueChange={(v) => update(line.id, { fund: v as "Admin" | "Maintenance" })}>
                  <SelectTrigger className="h-9 w-[110px]"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="Admin">Admin</SelectItem><SelectItem value="Maintenance">Maintenance</SelectItem></SelectContent>
                </Select>
              </td>
              <td className="px-3 py-2">
                <Select value={line.costType} onValueChange={(v) => update(line.id, { costType: v as "Fixed" | "Variable" })}>
                  <SelectTrigger className="h-9 w-[100px]"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="Fixed">Fixed</SelectItem><SelectItem value="Variable">Variable</SelectItem></SelectContent>
                </Select>
              </td>
              <td className="px-3 py-2">
                <Select value={line.month} onValueChange={(v) => update(line.id, { month: v })}>
                  <SelectTrigger className="h-9 w-[110px]"><SelectValue placeholder="Not yet" /></SelectTrigger>
                  <SelectContent>{FY_MONTHS.map(m => <SelectItem key={m} value={String(m)}>{startYear ? monthLabel(m, startYear) : monthName(m)}</SelectItem>)}</SelectContent>
                </Select>
              </td>
              <td className="px-3 py-2"><Input type="number" min="0" step="0.01" placeholder="0" value={line.amount} onChange={e => update(line.id, { amount: e.target.value })} className="h-9 text-right" /></td>
              {tracking && <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{money(spent)}</td>}
              {tracking && <td className={`px-3 py-2 text-right tabular-nums font-medium ${remaining < 0 ? "text-destructive" : ""}`}>{money(remaining)}</td>}
              <td className="px-3 py-2">
                <div className="flex items-center justify-end gap-0.5">
                  <Button asChild type="button" size="icon" variant="ghost" className="rounded-full" aria-label="Attach evidence of cost">
                    <label><Paperclip className="size-4" /><input type="file" className="hidden" onChange={e => { const f = e.target.files?.[0] ?? null; update(line.id, { file: f }); e.currentTarget.value = ""; }} /></label>
                  </Button>
                  <Button type="button" size="icon" variant="ghost" className="rounded-full text-muted-foreground" aria-label="Remove this line" onClick={() => remove(line.id)}><Trash2 className="size-4" /></Button>
                </div>
              </td>
            </tr>;
          })}
        </tbody>
        <tfoot>
          <tr className="border-t border-border/70 bg-secondary/30 text-[12px] font-medium">
            <td className="px-3 py-2.5" colSpan={2}>Admin fund subtotal</td>
            <td className="px-3 py-2.5 text-right tabular-nums" colSpan={tracking ? 5 : 3}>{money(totals.admin)}</td>
          </tr>
          <tr className="text-[12px] font-medium">
            <td className="px-3 py-2.5" colSpan={2}>Maintenance fund subtotal</td>
            <td className="px-3 py-2.5 text-right tabular-nums" colSpan={tracking ? 5 : 3}>{money(totals.maintenance)}</td>
          </tr>
          <tr className="border-t border-border/70 text-[13px] font-semibold">
            <td className="px-3 py-2.5" colSpan={2}>Total budget</td>
            <td className="px-3 py-2.5 text-right tabular-nums" colSpan={tracking ? 5 : 3}>{money(totals.admin + totals.maintenance)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
    {lines.some(l => l.file) && <div className="space-y-1">
      {lines.filter(l => l.file).map(l => <p key={l.id} className="text-[11px] text-muted-foreground">Attaching for "{l.description || "untitled line"}": {l.file!.name}</p>)}
    </div>}
    <Button type="button" variant="outline" size="sm" className="rounded-full" onClick={() => setLines([...lines, emptyDraftLine()])}><Plus className="size-3.5" />Add a line</Button>
  </div>;
}

export function InvoicePreview({ lots, method, total }: { lots: FinLot[]; method: string; total: number }) {
  if (lots.length === 0) return <p className="text-[12px] text-muted-foreground">Add your lots first and this will show what each one will be billed.</p>;
  return <div className="divide-y divide-border/60 rounded-2xl border border-border/70">
    {lots.map(l => <div key={l.id} className="flex items-center justify-between gap-4 px-4 py-2.5 text-[13px]">
      <span>Lot {l.lot_number}{l.owner_name ? ` · ${l.owner_name}` : ""}</span>
      <span className="font-medium tabular-nums">{money(shareAmount(method, l.entitlement_percent, lots.length, total))}</span>
    </div>)}
  </div>;
}

function TxDialog({ open, onOpenChange, schemeId, tx, defaultFund, lineItems, onSaved }: {
  open: boolean; onOpenChange: (v: boolean) => void; schemeId?: string | undefined; tx: FinanceTx | null;
  defaultFund?: string | undefined; lineItems: BudgetLineItem[]; onSaved: () => void;
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
              {matchableLines.map(l => <SelectItem key={l.id} value={l.id}>{l.description}{l.expected_month ? ` (${monthName(l.expected_month)})` : ""} — {money(l.amount)}</SelectItem>)}
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

// The budget-building form itself, with no opinion on how it's presented — used inline in the
// Budget tab as the main "start here" experience, and reused inside a Dialog for onboarding.
export function BudgetBuilderForm({ schemeId, lots, onCreated, onCancel, initialLines, submitLabel }: {
  schemeId?: string | undefined; lots: FinLot[]; onCreated: () => void; onCancel?: (() => void) | undefined;
  initialLines?: DraftLine[] | undefined; submitLabel?: string | undefined;
}) {
  const [lines, setLines] = useState<DraftLine[]>(initialLines && initialLines.length > 0 ? initialLines : [emptyDraftLine()]);
  const [method, setMethod] = useState("Entitlement");
  const [financialYear, setFinancialYear] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const totals = draftTotals(lines);
  const total = totals.admin + totals.maintenance;
  const startYear = financialYear.match(/\d{4}/) ? Number(financialYear.match(/\d{4}/)![0]) : undefined;

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!schemeId) return;
    const validLines = lines.filter(l => l.description.trim() !== "" && Number(l.amount) > 0);
    if (validLines.length === 0 || total <= 0) { toast("Add at least one line item with a description and an amount"); return; }
    setSubmitting(true);
    const { data: budget, error } = await supabase.from("budgets").insert({
      scheme_id: schemeId, financial_year: financialYear, admin_fund_total: totals.admin,
      maintenance_fund_total: totals.maintenance, allocation_method: method, levy_due_date: dueDate,
    }).select().single();
    if (error || !budget) { toast("Could not create the budget", { description: error?.message }); setSubmitting(false); return; }
    const failures: string[] = [];
    for (const line of validLines) {
      const { data: item, error: itemError } = await supabase.from("budget_line_items").insert({
        budget_id: budget.id as string, scheme_id: schemeId, fund: line.fund, cost_type: line.costType, description: line.description, amount: Number(line.amount),
        expected_month: line.month ? Number(line.month) : null,
      }).select().single();
      if (itemError || !item) { failures.push(line.description); continue; }
      if (line.file) {
        const up = await uploadFinanceDoc(schemeId, line.file, { category: "Budget line item", budget_line_item_id: item.id as string });
        if (up.error) failures.push(`${line.description} (evidence file)`);
      }
    }
    setSubmitting(false);
    onCreated();
    if (failures.length > 0) {
      toast("Budget created, but some items need attention", { description: `Could not save: ${failures.join(", ")}. The budget and levies were still created — add these manually from the budget's line items.` });
    } else {
      toast("Budget created", { description: method === "Equal" ? "Every lot was billed an equal share." : "Every lot was billed its entitlement share." });
    }
  };

  return <form onSubmit={submit} className="space-y-4">
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="space-y-2"><Label htmlFor="financial_year">Financial year</Label><Input id="financial_year" value={financialYear} onChange={e => setFinancialYear(e.target.value)} placeholder="2026/27" required /></div>
      <div className="space-y-2"><Label htmlFor="levy_due_date">Levy due date</Label><Input id="levy_due_date" type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} required /></div>
    </div>
    <div className="space-y-2">
      <Label>How it is split</Label>
      <Select value={method} onValueChange={setMethod}>
        <SelectTrigger><SelectValue /></SelectTrigger>
        <SelectContent><SelectItem value="Entitlement">By lot entitlement</SelectItem><SelectItem value="Equal">Equal share for every lot</SelectItem></SelectContent>
      </Select>
      <p className="text-[11px] leading-5 text-muted-foreground">{method === "Equal" ? "The total is divided evenly, so every lot pays the same amount." : "Each lot pays its entitlement percentage of the total."}</p>
    </div>
    <div className="space-y-2">
      <Label>Line items</Label>
      <LineItemsEditor lines={lines} setLines={setLines} startYear={startYear} />
      <p className="text-[11px] leading-5 text-muted-foreground">Admin fund — day-to-day running costs. Maintenance fund — savings for bigger repairs and works.</p>
    </div>
    {lots.length > 0 && total > 0 && <div className="space-y-2">
      <Label>Preview — what each lot will be billed</Label>
      <InvoicePreview lots={lots} method={method} total={total} />
    </div>}
    <div className="flex justify-end gap-2 pt-2">
      {onCancel && <Button type="button" variant="ghost" className="rounded-full" onClick={onCancel}>Cancel</Button>}
      <Button type="submit" className="rounded-full" disabled={submitting}>{submitting ? "Locking in…" : (submitLabel ?? "Lock in budget and issue levies")}</Button>
    </div>
  </form>;
}

export function CreateBudgetDialog({ open, onOpenChange, schemeId, lots, onCreated, initialLines }: {
  open: boolean; onOpenChange: (v: boolean) => void; schemeId?: string | undefined; lots: FinLot[]; onCreated: () => void;
  initialLines?: DraftLine[] | undefined;
}) {
  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-[640px]">
      <DialogHeader><DialogTitle className="font-display tracking-[-0.02em]">Create a budget</DialogTitle><DialogDescription>Break the year into line items, and Loty issues a notice to every lot from the totals.</DialogDescription></DialogHeader>
      <BudgetBuilderForm schemeId={schemeId} lots={lots} initialLines={initialLines} onCancel={() => onOpenChange(false)}
        onCreated={() => { onOpenChange(false); onCreated(); }} submitLabel="Create and issue notices" />
    </DialogContent>
  </Dialog>;
}

type EditOutcome = { adjustments: { levy: Levy; oldAmount: number; newAmount: number; diff: number }[]; recalculated: boolean };

function EditBudgetDialog({ open, onOpenChange, schemeId, budget, lots, levies, lineItems, revertFrom, onSaved }: {
  open: boolean; onOpenChange: (v: boolean) => void; schemeId?: string | undefined; budget: FinanceBudget;
  lots: FinLot[]; levies: Levy[]; lineItems: BudgetLineItem[]; revertFrom: BudgetRevision | null; onSaved: () => void;
}) {
  const originalLines = lineItems.filter(li => li.budget_id === budget.id);
  const [lines, setLines] = useState<DraftLine[]>(revertFrom ? jsonLineItemsToDraft(revertFrom.previous_line_items) : lineItemsToDraft(originalLines));
  const [method, setMethod] = useState(revertFrom ? revertFrom.previous_allocation_method : (budget.allocation_method ?? "Entitlement"));
  const [dueDate, setDueDate] = useState(revertFrom ? revertFrom.previous_levy_due_date : budget.levy_due_date);
  const [reason, setReason] = useState(revertFrom ? `Reverted to the version from ${niceDate(revertFrom.created_at)}` : "");
  const [recalculate, setRecalculate] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [outcome, setOutcome] = useState<EditOutcome | null>(null);
  const totals = draftTotals(lines);
  const total = totals.admin + totals.maintenance;
  const allOwnerEmails = lots.map(l => l.owner_email).filter((e): e is string => !!e);

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!schemeId) return;
    if (reason.trim() === "") { toast("Add a short reason for this change first"); return; }
    const validLines = lines.filter(l => l.description.trim() !== "" && Number(l.amount) > 0);
    if (validLines.length === 0) { toast("Add at least one line item"); return; }
    setSubmitting(true);

    const { error: revError } = await supabase.from("budget_revisions").insert({
      budget_id: budget.id, scheme_id: schemeId, reason,
      previous_admin_fund_total: budget.admin_fund_total, previous_maintenance_fund_total: budget.maintenance_fund_total,
      previous_allocation_method: budget.allocation_method ?? "Entitlement", previous_levy_due_date: budget.levy_due_date,
      previous_line_items: originalLines.map(li => ({ fund: li.fund, description: li.description, amount: li.amount })),
      new_admin_fund_total: totals.admin, new_maintenance_fund_total: totals.maintenance,
      new_allocation_method: method, new_levy_due_date: dueDate,
      new_line_items: validLines.map(l => ({ fund: l.fund, description: l.description, amount: Number(l.amount) })),
      levies_recalculated: recalculate,
    });
    if (revError) { toast("Could not record this change", { description: revError.message }); setSubmitting(false); return; }

    const { error: budgetError } = await supabase.from("budgets").update({
      admin_fund_total: totals.admin, maintenance_fund_total: totals.maintenance, allocation_method: method, levy_due_date: dueDate,
    }).eq("id", budget.id);
    if (budgetError) { toast("Could not update the budget", { description: budgetError.message }); setSubmitting(false); return; }

    const originalIds = new Set(originalLines.map(li => li.id));
    const draftIds = new Set(validLines.map(l => l.id));
    const failures: string[] = [];
    for (const li of originalLines) {
      if (!draftIds.has(li.id)) {
        const { error } = await supabase.from("budget_line_items").delete().eq("id", li.id);
        if (error) failures.push(li.description);
      }
    }
    for (const line of validLines) {
      if (originalIds.has(line.id)) {
        const { error } = await supabase.from("budget_line_items").update({ fund: line.fund, cost_type: line.costType, description: line.description, amount: Number(line.amount), expected_month: line.month ? Number(line.month) : null }).eq("id", line.id);
        if (error) { failures.push(line.description); continue; }
        if (line.file) {
          const up = await uploadFinanceDoc(schemeId, line.file, { category: "Budget line item", budget_line_item_id: line.id });
          if (up.error) failures.push(`${line.description} (evidence file)`);
        }
      } else {
        const { data: item, error } = await supabase.from("budget_line_items").insert({
          budget_id: budget.id, scheme_id: schemeId, fund: line.fund, cost_type: line.costType, description: line.description, amount: Number(line.amount),
          expected_month: line.month ? Number(line.month) : null,
        }).select().single();
        if (error || !item) { failures.push(line.description); continue; }
        if (line.file) {
          const up = await uploadFinanceDoc(schemeId, line.file, { category: "Budget line item", budget_line_item_id: item.id as string });
          if (up.error) failures.push(`${line.description} (evidence file)`);
        }
      }
    }

    const adjustments: EditOutcome["adjustments"] = [];
    if (recalculate) {
      const budgetLevies = levies.filter(l => l.budget_id === budget.id);
      for (const levy of budgetLevies) {
        const entitlement = Number(levy.lots?.entitlement_percent ?? 0);
        const newAmount = shareAmount(method, entitlement, budgetLevies.length, total);
        if (levy.status === "Paid") {
          const diff = Math.round((newAmount - Number(levy.amount)) * 100) / 100;
          if (diff !== 0) adjustments.push({ levy, oldAmount: Number(levy.amount), newAmount, diff });
        } else {
          const { error } = await supabase.from("levies").update({ amount: newAmount, due_date: dueDate }).eq("id", levy.id);
          if (error) failures.push(`Levy for Lot ${levy.lots?.lot_number ?? ""}`);
        }
      }
    }

    setSubmitting(false);
    if (failures.length > 0) toast("Some parts of this update need attention", { description: failures.join(", ") });
    onSaved();
    setOutcome({ adjustments, recalculated: recalculate });
  };

  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-[640px]">
      {outcome
        ? <>
            <DialogHeader><DialogTitle className="font-display tracking-[-0.02em]">Budget updated for {budget.financial_year}</DialogTitle>
              <DialogDescription>{outcome.recalculated ? "Unpaid levies were recalculated to match the correction." : "Existing levy amounts were left as they were."}</DialogDescription></DialogHeader>
            <div className="space-y-4">
              <Button asChild variant="outline" className="rounded-full">
                <a href={`mailto:?bcc=${encodeURIComponent(allOwnerEmails.join(","))}&subject=${encodeURIComponent(`Update to your ${budget.financial_year} levies`)}&body=${encodeURIComponent(budgetChangeText(budget.financial_year, reason, budget.admin_fund_total, budget.maintenance_fund_total, totals.admin, totals.maintenance, outcome.recalculated))}`}>Email all owners</a>
              </Button>
              {outcome.adjustments.length > 0 && <div className="space-y-2">
                <Label>Owners affected by the correction</Label>
                <div className="divide-y divide-border/60 rounded-2xl border border-border/70">
                  {outcome.adjustments.map(a => <div key={a.levy.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 text-[13px]">
                    <span>Lot {a.levy.lots?.lot_number ?? ""}{a.levy.lots?.owner_name ? ` · ${a.levy.lots.owner_name}` : ""}</span>
                    <span className={`font-medium ${a.diff < 0 ? "text-primary" : "text-destructive"}`}>{a.diff < 0 ? `Refund of ${money(-a.diff)}` : `Additional ${money(a.diff)} now owing`}</span>
                    <Button asChild size="sm" variant="ghost" className="rounded-full" disabled={!a.levy.lots?.owner_email}>
                      <a href={`mailto:${a.levy.lots?.owner_email}?subject=${encodeURIComponent(`An update to your ${budget.financial_year} levy`)}&body=${encodeURIComponent(refundText(a.levy, a.diff, budget.financial_year))}`}>Email this owner</a>
                    </Button>
                  </div>)}
                </div>
              </div>}
              <div className="flex justify-end pt-2"><Button className="rounded-full" onClick={() => onOpenChange(false)}>Close</Button></div>
            </div>
          </>
        : <>
            <DialogHeader><DialogTitle className="font-display tracking-[-0.02em]">Edit budget for {budget.financial_year}</DialogTitle>
              <DialogDescription>Every edit needs a reason and is kept in this budget's history.</DialogDescription></DialogHeader>
            <form onSubmit={submit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="reason">What changed and why</Label>
                <Textarea id="reason" rows={3} value={reason} onChange={e => setReason(e.target.value)} placeholder="e.g. The insurance quote came in lower than budgeted" required />
              </div>
              <div className="space-y-2"><Label htmlFor="levy_due_date_edit">Due date</Label><Input id="levy_due_date_edit" type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} required /></div>
              <div className="space-y-2">
                <Label>How it is split</Label>
                <Select value={method} onValueChange={setMethod}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="Entitlement">By lot entitlement</SelectItem><SelectItem value="Equal">Equal share for every lot</SelectItem></SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Line items</Label>
                <LineItemsEditor lines={lines} setLines={setLines} startYear={budgetStartYear(budget.financial_year)} />
              </div>
              <div className="rounded-2xl border border-border/70 bg-secondary/40 p-4 text-[13px]">
                <div className="flex justify-between"><span className="text-muted-foreground">Admin fund total</span><span className="font-medium tabular-nums">{money(totals.admin)}</span></div>
                <div className="mt-1.5 flex justify-between"><span className="text-muted-foreground">Maintenance fund total</span><span className="font-medium tabular-nums">{money(totals.maintenance)}</span></div>
                <div className="mt-3 flex justify-between border-t border-border/60 pt-3 text-[12px] text-muted-foreground"><span>Fixed costs</span><span className="tabular-nums">{money(totals.fixed)}</span></div>
                <div className="mt-1 flex justify-between text-[12px] text-muted-foreground"><span>Variable costs</span><span className="tabular-nums">{money(totals.variable)}</span></div>
              </div>
              {lots.length > 0 && total > 0 && <div className="space-y-2">
                <Label>Preview if recalculated — what each lot would be billed</Label>
                <InvoicePreview lots={lots} method={method} total={total} />
              </div>}
              <div className="flex items-center justify-between rounded-2xl border border-border/70 p-4">
                <div>
                  <p className="text-sm font-medium">Recalculate unpaid levies to match</p>
                  <p className="mt-1 text-[12px] text-muted-foreground">{recalculate ? "Levies not yet paid will update to the new totals. Paid levies are never changed — you'll see any refund or extra amount owing next." : "This is a record-only correction. No levy amounts will change."}</p>
                </div>
                <Switch checked={recalculate} onCheckedChange={setRecalculate} />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="ghost" className="rounded-full" onClick={() => onOpenChange(false)}>Cancel</Button>
                <Button type="submit" className="rounded-full" disabled={submitting}>{submitting ? "Saving…" : "Save changes"}</Button>
              </div>
            </form>
          </>}
    </DialogContent>
  </Dialog>;
}

function BudgetHistoryDialog({ open, onOpenChange, budget, revisions, onRevert }: {
  open: boolean; onOpenChange: (v: boolean) => void; budget: FinanceBudget | null; revisions: BudgetRevision[]; onRevert: (revision: BudgetRevision) => void;
}) {
  const rows = budget ? revisions.filter(r => r.budget_id === budget.id) : [];
  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="max-h-[88vh] overflow-y-auto">
      <DialogHeader><DialogTitle className="font-display tracking-[-0.02em]">History for {budget?.financial_year}</DialogTitle><DialogDescription>Every change made to this budget, most recent first.</DialogDescription></DialogHeader>
      {rows.length === 0
        ? <p className="py-8 text-center text-[13px] text-muted-foreground">No changes recorded yet.</p>
        : <div className="space-y-3">
            {rows.map(r => <div key={r.id} className="rounded-2xl border border-border/70 p-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-medium">{r.reason}</p>
                  <p className="mt-1 text-[12px] text-muted-foreground">{niceDate(r.created_at)} · {r.levies_recalculated ? "Levies recalculated" : "Record only"}</p>
                </div>
                <Button size="sm" variant="outline" className="rounded-full shrink-0" onClick={() => onRevert(r)}><Undo2 className="size-3.5" />Revert to this</Button>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-3 text-[12px]">
                <div><p className="text-muted-foreground">Admin fund</p><p className="font-medium">{money(r.previous_admin_fund_total)} → {money(r.new_admin_fund_total)}</p></div>
                <div><p className="text-muted-foreground">Maintenance fund</p><p className="font-medium">{money(r.previous_maintenance_fund_total)} → {money(r.new_maintenance_fund_total)}</p></div>
              </div>
            </div>)}
          </div>}
    </DialogContent>
  </Dialog>;
}

const effectiveLevyStatus = (levy: Levy) => (levy.status === "Pending" && daysUntil(levy.due_date) < 0 ? "Overdue" : levy.status);
const daysUntil = (date: string) => Math.ceil((new Date(date + "T00:00:00").getTime() - new Date(new Date().toDateString()).getTime()) / 86400000);

function LeviesTab({ levies, documents, isCommittee, schemeId, onPaid, onChanged }: {
  levies: Levy[]; documents: DocFile[];
  isCommittee: boolean; schemeId?: string | undefined; onPaid: (id: string) => void; onChanged: () => void;
}) {
  const [invoice, setInvoice] = useState<Levy | null>(null);
  const [reminder, setReminder] = useState<Levy | null>(null);
  const [showPaid, setShowPaid] = useState(false);

  const years = Array.from(new Set(levies.map(l => l.budgets?.financial_year ?? "Unallocated")));
  const [year, setYear] = useState("All years");
  const inYear = year === "All years" ? levies : levies.filter(l => (l.budgets?.financial_year ?? "Unallocated") === year);

  const paid = inYear.filter(l => l.status === "Paid");
  const unpaid = inYear.filter(l => l.status !== "Paid").sort((a, b) => a.due_date.localeCompare(b.due_date));
  const collected = paid.reduce((s, l) => s + Number(l.amount), 0);
  const owing = unpaid.reduce((s, l) => s + Number(l.amount), 0);
  const overdueCount = unpaid.filter(l => daysUntil(l.due_date) < 0).length;
  const soonCount = unpaid.filter(l => { const d = daysUntil(l.due_date); return d >= 0 && d <= 14; }).length;

  const lotsInBudget = (levy: Levy) => levies.filter(l => l.budgets?.financial_year === levy.budgets?.financial_year).length || 1;
  const isEqual = (levy: Levy) => levy.budgets?.allocation_method === "Equal";

  const attachProof = async (levy: Levy, file: File) => {
    if (!schemeId) return;
    const up = await uploadFinanceDoc(schemeId, file, { category: "Levy payment", levy_id: levy.id });
    if (up.error) { toast("Upload failed", { description: up.error }); return; }
    onChanged();
    toast("Payment proof filed under Finance in your documents");
  };
  const levyDocsFor = (id: string) => documents.filter(d => d.levy_id === id);

  const rows = showPaid ? [...unpaid, ...paid] : unpaid;

  return <div>
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="max-w-2xl">
        <h2 className="font-display text-xl tracking-[-0.02em]">Levies</h2>
        <p className="mt-2 text-[13px] leading-6 text-muted-foreground">Track exactly who still owes and how close they are to their due date. Budgets are set from the Budget tab, which is what raises these.</p>
      </div>
    </div>

    <div className="mt-6 flex flex-wrap items-center gap-2">
      {["All years", ...years].map(option =>
        <button key={option} type="button" onClick={() => setYear(option)}
          className={`rounded-full px-4 py-2 text-[12px] font-medium transition ${year === option ? "bg-primary text-primary-foreground" : "border border-border/70 bg-card text-muted-foreground hover:text-foreground"}`}>{option}</button>)}
      <button type="button" onClick={() => setShowPaid(v => !v)}
        className="ml-auto rounded-full border border-border/70 bg-card px-4 py-2 text-[12px] font-medium text-muted-foreground hover:text-foreground">
        {showPaid ? "Hide the lots that have paid" : `Show the ${paid.length} lots that have paid`}
      </button>
    </div>

    <div className="mt-5 grid gap-3 sm:grid-cols-3">
      {[["Paid", `${paid.length} of ${inYear.length}`, money(collected)],
        ["Still to pay", `${unpaid.length} of ${inYear.length}`, money(owing)],
        ["Needs attention", overdueCount ? `${overdueCount} overdue` : soonCount ? `${soonCount} due within 14 days` : "Nothing pressing", String(overdueCount + soonCount)]].map(([label, hint, value]) =>
        <div key={label} className="rounded-3xl border border-border/70 bg-card p-5">
          <p className="text-[11px] font-medium text-muted-foreground">{label}</p>
          <p className="mt-3 font-display text-2xl tracking-[-0.03em]">{value}</p>
          <p className="mt-2 text-[11px] text-muted-foreground/80">{hint}</p>
        </div>)}
    </div>

    <Card className="mt-5 overflow-hidden">
      <div className="divide-y divide-border/70">{rows.map(levy => {
        const status = effectiveLevyStatus(levy);
        const left = daysUntil(levy.due_date);
        const alert = status === "Paid" ? null
          : left < 0 ? { tone: "bg-destructive/10 text-destructive", text: `${Math.abs(left)} days overdue` }
          : left <= 14 ? { tone: "bg-primary text-primary-foreground", text: left === 0 ? "Due today" : `Due in ${left} days` }
          : { tone: "bg-secondary text-muted-foreground", text: `Due in ${left} days` };
        const docs = levyDocsFor(levy.id);
        return <div key={levy.id} className="flex flex-wrap items-center justify-between gap-4 px-7 py-5">
          <div className="min-w-0">
            <p className="text-sm font-medium">{levy.lots ? `Lot ${levy.lots.lot_number}${levy.lots.owner_name ? ` · ${levy.lots.owner_name}` : ""}` : "Your levy"}</p>
            <p className="mt-1 text-[12px] text-muted-foreground">
              {levy.budgets?.financial_year ? `${levy.budgets.financial_year} · ` : ""}Due {niceDate(levy.due_date)}
              {levy.status === "Paid" && levy.paid_at ? ` · Paid ${niceDate(levy.paid_at)}` : ""}
            </p>
            {docs.length > 0 && <div className="mt-2 flex flex-wrap gap-2">
              {docs.map(d => <button key={d.id} onClick={() => void openFinanceDoc(d)} className="rounded-full border border-border bg-secondary px-2.5 py-1 text-[11px] hover:bg-secondary/70">{d.name}</button>)}
            </div>}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <span className="font-display text-lg">{money(Number(levy.amount))}</span>
            {alert && <span className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${alert.tone}`}>{alert.text}</span>}
            <StatusPill status={status} />
            <Button size="sm" variant="ghost" className="rounded-full" onClick={() => setInvoice(levy)}>Invoice</Button>
            {isCommittee && <Button asChild size="icon" variant="ghost" className="rounded-full" aria-label="Attach payment proof">
              <label><Paperclip className="size-4" /><input type="file" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) void attachProof(levy, f); e.currentTarget.value = ""; }} /></label>
            </Button>}
            {isCommittee && status !== "Paid" && <Button size="sm" variant="ghost" className="rounded-full" onClick={() => setReminder(levy)}>Send a reminder</Button>}
            {isCommittee && status !== "Paid" && <Button size="sm" variant="outline" className="rounded-full" onClick={() => onPaid(levy.id)}>Mark paid</Button>}
          </div>
        </div>;
      })}
        {rows.length === 0 && <p className="px-7 py-10 text-center text-sm text-muted-foreground">{inYear.length ? "Everyone has paid. Nothing to chase." : "No levies raised yet."}</p>}
      </div>
    </Card>

    <Dialog open={!!invoice} onOpenChange={(o) => { if (!o) setInvoice(null); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="font-display tracking-[-0.02em]">Levy invoice</DialogTitle>
          <DialogDescription>{invoice?.budgets?.financial_year ? `Financial year ${invoice.budgets.financial_year}` : "How this amount was worked out."}</DialogDescription>
        </DialogHeader>
        {invoice && <div className="space-y-4 text-sm">
          <div className="rounded-2xl border border-border/70 p-4">
            <p className="font-medium">Lot {invoice.lots?.lot_number ?? ""}{invoice.lots?.owner_name ? ` · ${invoice.lots.owner_name}` : ""}</p>
            <p className="mt-1 text-[12px] text-muted-foreground">{invoice.lots?.owner_email ?? "No email on file"}</p>
          </div>
          <div className="space-y-2">
            {[["How it is split", isEqual(invoice) ? "Equal share for every lot" : "By lot entitlement"],
              [isEqual(invoice) ? "This lot's share" : "Lot entitlement", isEqual(invoice) ? `1 of ${lotsInBudget(invoice)} lots` : `${Number(invoice.lots?.entitlement_percent ?? 0)}%`],
              ["Admin fund share", money(adminShare(invoice))],
              ["Maintenance fund share", money(maintShare(invoice))],
              ["Due date", niceDate(invoice.due_date)],
              ["Status", effectiveLevyStatus(invoice)]].map(([k, v]) =>
              <div key={k} className="flex justify-between border-b border-border/60 pb-2 text-[13px]"><span className="text-muted-foreground">{k}</span><span className="font-medium">{v}</span></div>)}
            <div className="flex justify-between pt-2"><span className="font-medium">Total payable</span><span className="font-display text-xl">{money(Number(invoice.amount))}</span></div>
          </div>
          <p className="text-[11px] leading-5 text-muted-foreground">{isEqual(invoice) ? "The admin fund and the maintenance fund are divided evenly between every lot." : "Each lot pays its entitlement share of the admin fund and the maintenance fund for the year."}</p>
        </div>}
      </DialogContent>
    </Dialog>

    <Dialog open={!!reminder} onOpenChange={(o) => { if (!o) setReminder(null); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="font-display tracking-[-0.02em]">Send a friendly reminder</DialogTitle>
          <DialogDescription>A polite note, ready to send to the owner.</DialogDescription>
        </DialogHeader>
        {reminder && <div className="space-y-4">
          <p className="text-[12px] text-muted-foreground">To {reminder.lots?.owner_email ?? "no email on file for this lot"}</p>
          <Textarea readOnly rows={10} className="text-[13px]" value={reminderText(reminder, effectiveLevyStatus(reminder))} />
          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="ghost" className="rounded-full" onClick={() => {
              void navigator.clipboard.writeText(reminderText(reminder, effectiveLevyStatus(reminder)));
              toast("Reminder copied", { description: "Paste it wherever you like." });
            }}>Copy the message</Button>
            <Button type="button" className="rounded-full" disabled={!reminder.lots?.owner_email} onClick={() => {
              const subject = `Levy reminder for Lot ${reminder.lots?.lot_number ?? ""}`;
              window.location.href = `mailto:${reminder.lots?.owner_email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(reminderText(reminder, effectiveLevyStatus(reminder)))}`;
              setReminder(null);
              toast("Reminder ready", { description: "Your email app has it open." });
            }}>Open in email</Button>
          </div>
        </div>}
      </DialogContent>
    </Dialog>
  </div>;
}

export function FinanceSection({ transactions, budgets, lineItems, levies, revisions, lots, documents, isCommittee, schemeId, onMarkLevyPaid, onChanged }: {
  transactions: FinanceTx[]; budgets: FinanceBudget[]; lineItems: BudgetLineItem[]; levies: Levy[]; revisions: BudgetRevision[]; lots: FinLot[];
  documents: DocFile[]; isCommittee: boolean; schemeId?: string | undefined;
  onMarkLevyPaid: (id: string) => void; onChanged: () => void;
}) {
  const today = new Date();
  const currentFy = today.getMonth() >= 6 ? today.getFullYear() : today.getFullYear() - 1;
  const years = useMemo(() => {
    const set = new Set<number>([currentFy]);
    transactions.forEach(t => set.add(startYearOf(t.occurred_on)));
    budgets.forEach(b => set.add(budgetStartYear(b.financial_year)));
    return [...set].sort((a, b) => b - a);
  }, [transactions, budgets, currentFy]);
  const [view, setView] = useState<"Budget" | "Cashflow" | "Levies" | "Transactions">("Budget");
  const [year, setYear] = useState(currentFy);
  const [txOpen, setTxOpen] = useState(false);
  const [editing, setEditing] = useState<FinanceTx | null>(null);
  const [recordFund, setRecordFund] = useState<string | undefined>(undefined);
  const [forecastOpen, setForecastOpen] = useState(false);
  const [editingBudget, setEditingBudget] = useState<FinanceBudget | null>(null);
  const [revertFrom, setRevertFrom] = useState<BudgetRevision | null>(null);
  const [historyBudget, setHistoryBudget] = useState<FinanceBudget | null>(null);
  const [filter, setFilter] = useState("all");

  const inYear = (iso: string) => startYearOf(iso) === year;
  const yearTx = transactions.filter(t => inYear(t.occurred_on));
  const yearBudgets = budgets.filter(b => budgetStartYear(b.financial_year) === year);
  const yearLevies = levies.filter(l => (l.budgets ? budgetStartYear(l.budgets.financial_year) === year : inYear(l.due_date)));

  const budgeted = {
    Admin: yearBudgets.reduce((s, b) => s + Number(b.admin_fund_total), 0),
    Maintenance: yearBudgets.reduce((s, b) => s + Number(b.maintenance_fund_total), 0),
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

  // For a year with no budget yet: seed the builder from the closest earlier year's lines,
  // so a returning committee adjusts last year's numbers instead of starting from nothing.
  const priorBudget = budgets.filter(b => budgetStartYear(b.financial_year) < year)
    .sort((a, b) => budgetStartYear(b.financial_year) - budgetStartYear(a.financial_year))[0] ?? null;
  const priorLineItems = priorBudget ? lineItems.filter(li => li.budget_id === priorBudget.id) : [];

  const monthsElapsed = year === currentFy ? Math.min(12, Math.max(1, (today.getMonth() + 12 - 6) % 12 + 1)) : 12;
  const projectedSpend = totalOut / monthsElapsed * 12 + admin.committed + maintenance.committed;
  const projectedPosition = (totalIn + admin.owing + maintenance.owing) - projectedSpend;

  // Planned schedule: when each budgeted line falls due, plus the levy due date as the one
  // "money in" event, laid over a running balance for the rest of the financial year.
  const todayPos = FY_MONTHS.indexOf(new Date().getMonth() + 1);
  const isRemaining = (m: number) => year > currentFy ? true : year < currentFy ? false : FY_MONTHS.indexOf(m) >= todayPos;
  const firstRemaining = FY_MONTHS.find(isRemaining) ?? null;
  const scheduledLines = activeLineItems.filter((l): l is BudgetLineItem & { expected_month: number } => l.expected_month != null);
  const unscheduledLines = activeLineItems.filter(l => l.expected_month == null);
  const unscheduledTotal = unscheduledLines.reduce((s, l) => s + Number(l.amount), 0);
  const leviesToCollect = admin.owing + maintenance.owing;
  const committedOut = admin.committed + maintenance.committed;
  const fundsOnHand = admin.balance + maintenance.balance;
  const levyDueMonth = activeBudget ? new Date(activeBudget.levy_due_date).getMonth() + 1 : null;
  const levyMonth = levyDueMonth !== null && isRemaining(levyDueMonth) ? levyDueMonth : firstRemaining;
  const schedule = (() => {
    let running = fundsOnHand;
    return FY_MONTHS.map(m => {
      const live = isRemaining(m);
      const outAmt = scheduledLines.filter(l => l.expected_month === m).reduce((s, l) => s + Number(l.amount), 0) + (m === firstRemaining ? committedOut : 0);
      const inAmt = m === levyMonth ? leviesToCollect : 0;
      if (live) running += inAmt - outAmt;
      return { month: m, inAmt, outAmt, running, live };
    });
  })();
  const stillOut = committedOut + scheduledLines.filter(l => isRemaining(l.expected_month)).reduce((s, l) => s + Number(l.amount), 0) + unscheduledTotal;
  const projected = fundsOnHand + leviesToCollect - stillOut;

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

  const attach = async (tx: FinanceTx, file: File) => {
    if (!schemeId) return;
    const up = await uploadFinanceDoc(schemeId, file, { category: tx.category ?? "Finance", finance_transaction_id: tx.id });
    if (up.error) { toast("Upload failed", { description: up.error }); return; }
    onChanged(); toast("Filed under Finance in your documents");
  };

  const docsFor = (id: string) => documents.filter(d => d.finance_transaction_id === id);

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

  const tabs = ["Budget", "Cashflow", "Levies", "Transactions"] as const;

  return <div className="space-y-8">
    <PageHead eyebrow="Finance" title="Budget it, track it, see it through" blurb="Build the year's budget, watch spend against it as bills come in, and see the cashflow — all from one spreadsheet."
      action={<div className="flex flex-wrap items-center gap-2">
        <Select value={String(year)} onValueChange={v => setYear(Number(v))}>
          <SelectTrigger className="h-9 w-[150px] rounded-full text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>{years.map(y => <SelectItem key={y} value={String(y)}>{fyLabel(y)}</SelectItem>)}</SelectContent>
        </Select>
        {isCommittee && view === "Transactions" && <Button className="rounded-full" onClick={() => { setEditing(null); setRecordFund(undefined); setTxOpen(true); }}><Plus />Record money</Button>}
      </div>} />

    <div className="flex flex-wrap gap-2">
      {tabs.map(t => <button key={t} type="button" onClick={() => setView(t)}
        className={`rounded-full px-4 py-2 text-[12px] font-medium transition ${view === t ? "bg-primary text-primary-foreground" : "border border-border/70 bg-card text-muted-foreground hover:text-foreground"}`}>{t}</button>)}
    </div>

    {view === "Budget" && <Card className="p-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-2xl">
          <h2 className="font-display text-xl tracking-[-0.02em]">{activeBudget ? `Budget for ${activeBudget.financial_year}` : `Build your ${fyLabel(year)} budget`}</h2>
          <p className="mt-2 text-[13px] leading-6 text-muted-foreground">{activeBudget
            ? "Every line you budgeted, what's been spent against it so far, and what's left."
            : "We've started you off with the usual costs — adjust the amounts, add or remove lines, and say roughly when each one falls. Lock it in and Loty issues a levy notice to every lot."}</p>
        </div>
        {activeBudget && isCommittee && <div className="flex gap-2">
          <Button size="sm" variant="outline" className="rounded-full" onClick={() => setEditingBudget(activeBudget)}><Pencil className="size-3.5" />Edit budget</Button>
          <Button size="sm" variant="ghost" className="rounded-full" onClick={() => setHistoryBudget(activeBudget)}><History className="size-3.5" />History</Button>
        </div>}
      </div>
      <div className="mt-6">
        {activeBudget
          ? <BudgetTrackerTable lineItems={activeLineItems} spentAgainstLine={spentAgainstLine} startYear={year} />
          : <BudgetBuilderForm schemeId={schemeId} lots={lots} onCreated={onChanged} initialLines={draftLinesForNewBudget(priorLineItems)} />}
      </div>
    </Card>}

    {view === "Cashflow" && <>
    <div className="grid gap-4 lg:grid-cols-3">
      {([["Admin fund", "day-to-day running costs", admin], ["Maintenance fund", "savings for bigger repairs and works", maintenance]] as const).map(([label, subtitle, f]) => <Card key={label} className="p-6">
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
      <div className="border-b border-border/70 p-6">
        <h2 className="font-display text-xl tracking-[-0.02em]">Planned schedule</h2>
        <p className="mt-1 text-[13px] leading-6 text-muted-foreground">When your budgeted costs are due to land, and the running balance across the rest of {fyLabel(year)}.</p>
      </div>
      {!activeBudget
        ? <p className="p-10 text-center text-[13px] text-muted-foreground">Build a budget first and this fills in on its own.</p>
        : <div className="divide-y divide-border/60">
            {schedule.filter(t => t.inAmt > 0 || t.outAmt > 0 || t.live).map(t => <div key={t.month} className={`flex items-center gap-3 px-6 py-2.5 text-[12px] ${t.live ? "" : "opacity-45"}`}>
              <span className="w-20 shrink-0 text-muted-foreground">{monthLabel(t.month, year)}</span>
              <span className="w-24 shrink-0 text-right tabular-nums text-muted-foreground">{t.inAmt > 0 ? `+${money(t.inAmt)}` : "—"}</span>
              <span className="w-24 shrink-0 text-right tabular-nums text-muted-foreground">{t.outAmt > 0 ? `−${money(t.outAmt)}` : "—"}</span>
              <span className={`flex-1 text-right font-medium tabular-nums ${t.live && t.running < 0 ? "text-destructive" : ""}`}>{t.live ? money(t.running) : "passed"}</span>
            </div>)}
            {unscheduledTotal > 0 && <div className="flex items-center justify-between gap-3 bg-secondary/30 px-6 py-3 text-[12px]">
              <span className="text-muted-foreground">Not yet scheduled</span>
              <span className="font-medium tabular-nums">{money(unscheduledTotal)}</span>
            </div>}
            <div className="flex items-center justify-between gap-3 px-6 py-3.5 text-[13px] font-medium">
              <span>Projected at 30 June {year + 1}</span>
              <span className={projected < 0 ? "text-destructive" : ""}>{money(projected)}</span>
            </div>
          </div>}
      <p className="border-t border-border/60 px-6 py-4 text-[11px] leading-5 text-muted-foreground/80">Months already gone are greyed out. Set "When" on a budget line to have it show up here.</p>
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
    </>}

    {view === "Levies" && <LeviesTab levies={levies} documents={documents} isCommittee={isCommittee} schemeId={schemeId} onPaid={onMarkLevyPaid} onChanged={onChanged} />}

    {view === "Transactions" && <Card className="overflow-hidden">
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
                  {docsFor(t.id).map(d => <button key={d.id} onClick={() => void openFinanceDoc(d)} className="rounded-full border border-border bg-secondary px-2.5 py-1 text-[11px] hover:bg-secondary/70">{d.name}</button>)}
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
    </Card>}

    {txOpen && <TxDialog key={editing?.id ?? `new-${recordFund ?? "any"}`} open={txOpen} onOpenChange={setTxOpen} schemeId={schemeId}
      tx={editing} defaultFund={recordFund} lineItems={activeLineItems} onSaved={onChanged} />}

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

    {editingBudget && <EditBudgetDialog key={`${editingBudget.id}-${revertFrom?.id ?? "current"}`} open={!!editingBudget}
      onOpenChange={(o) => { if (!o) { setEditingBudget(null); setRevertFrom(null); } }} schemeId={schemeId} budget={editingBudget}
      lots={lots} levies={levies} lineItems={lineItems} revertFrom={revertFrom} onSaved={onChanged} />}

    <BudgetHistoryDialog open={!!historyBudget} onOpenChange={(o) => { if (!o) setHistoryBudget(null); }} budget={historyBudget} revisions={revisions}
      onRevert={(revision) => { setHistoryBudget(null); setRevertFrom(revision); setEditingBudget(historyBudget); }} />
  </div>;
}

function BudgetTrackerTable({ lineItems, spentAgainstLine, startYear }: {
  lineItems: BudgetLineItem[]; spentAgainstLine: (id: string) => number; startYear: number;
}) {
  const totalBudgeted = lineItems.reduce((s, l) => s + Number(l.amount), 0);
  const totalSpent = lineItems.reduce((s, l) => s + spentAgainstLine(l.id), 0);
  if (lineItems.length === 0) return <p className="py-8 text-center text-[13px] text-muted-foreground">No line items on this budget.</p>;
  return <div className="overflow-x-auto rounded-2xl border border-border/70">
    <table className="w-full min-w-[760px] border-collapse text-[13px]">
      <thead>
        <tr className="border-b border-border/70 bg-secondary/40 text-left text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
          <th className="px-3 py-2.5">Description</th>
          <th className="px-3 py-2.5">Fund</th>
          <th className="px-3 py-2.5">Type</th>
          <th className="px-3 py-2.5">When</th>
          <th className="px-3 py-2.5 text-right">Budgeted</th>
          <th className="px-3 py-2.5 text-right">Spent</th>
          <th className="px-3 py-2.5 text-right">Remaining</th>
        </tr>
      </thead>
      <tbody>
        {lineItems.map(li => {
          const spent = spentAgainstLine(li.id);
          const remaining = Number(li.amount) - spent;
          return <tr key={li.id} className="border-b border-border/60 last:border-0">
            <td className="px-3 py-2.5">{li.description}</td>
            <td className="px-3 py-2.5 text-muted-foreground">{li.fund}</td>
            <td className="px-3 py-2.5 text-muted-foreground">{li.cost_type}</td>
            <td className="px-3 py-2.5 text-muted-foreground">{li.expected_month ? monthLabel(li.expected_month, startYear) : "Not yet"}</td>
            <td className="px-3 py-2.5 text-right tabular-nums">{money(Number(li.amount))}</td>
            <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">{money(spent)}</td>
            <td className={`px-3 py-2.5 text-right tabular-nums font-medium ${remaining < 0 ? "text-destructive" : ""}`}>{money(remaining)}</td>
          </tr>;
        })}
      </tbody>
      <tfoot>
        <tr className="border-t border-border/70 bg-secondary/30 text-[13px] font-semibold">
          <td className="px-3 py-2.5" colSpan={4}>Total</td>
          <td className="px-3 py-2.5 text-right tabular-nums">{money(totalBudgeted)}</td>
          <td className="px-3 py-2.5 text-right tabular-nums">{money(totalSpent)}</td>
          <td className={`px-3 py-2.5 text-right tabular-nums ${totalBudgeted - totalSpent < 0 ? "text-destructive" : ""}`}>{money(totalBudgeted - totalSpent)}</td>
        </tr>
      </tfoot>
    </table>
  </div>;
}

