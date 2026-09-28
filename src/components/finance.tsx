import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { ArrowDownRight, ArrowUpRight, Coins, History, Paperclip, Plus, Send, Settings2, Trash2, Undo2 } from "lucide-react";
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
import { computeFundBalances, currentFinancialYearStart, levyShareForFund, splitLevyAcrossFunds, type Levy } from "@/lib/fund-balance";
import type { BudgetFund } from "@/components/overview";
import {
  currentTaskFor, ensureStandardWidget, publishActionDocument, urgencyTone,
  type ActionDraft, type ComplianceWidget, type Task,
} from "@/lib/action-publish";

export type { BudgetFund } from "@/components/overview";

export type FinanceTx = {
  id: string; scheme_id: string; direction: string; fund_id: string; category: string | null;
  description: string; supplier: string | null; amount: number; occurred_on: string;
  status: string; work_order_id: string | null; notes: string | null; budget_line_item_id: string | null; levy_id: string | null;
};
export type BudgetLineItem = {
  id: string; budget_id: string; scheme_id: string; fund_id: string; description: string; amount: number;
  cost_type: string; occurrence: string; expected_month: number | null;
};
export type FinanceBudget = {
  id: string; financial_year: string; total_amount: number; budget_fund_totals: { fund_id: string; total: number }[];
  allocation_method: string | null; levy_due_date: string;
};
export type BudgetRevision = {
  id: string; budget_id: string; scheme_id: string; reason: string;
  previous_total: number; previous_fund_totals: Record<string, number>;
  previous_allocation_method: string; previous_levy_due_date: string; previous_line_items: DraftLineItemJson[];
  new_total: number; new_fund_totals: Record<string, number>;
  new_allocation_method: string; new_levy_due_date: string; new_line_items: DraftLineItemJson[];
  levies_recalculated: boolean; created_at: string;
};
type DraftLineItemJson = { fund: string; description: string; amount: number };
export type FinanceView = "Budget" | "Levies" | "Cashflow";
export type FinLot = { id: string; lot_number: number; owner_name: string | null; owner_email: string | null; entitlement_percent: number };

const FINANCE_FOLDER = "Finance";
export const OCCURRENCES = ["Weekly", "Fortnightly", "Monthly", "Annually"] as const;
export type Occurrence = (typeof OCCURRENCES)[number];
export const OCCURRENCE_MULTIPLIER: Record<Occurrence, number> = { Weekly: 52, Fortnightly: 26, Monthly: 12, Annually: 1 };
export const annualAmount = (perOccurrenceAmount: number, occurrence: Occurrence) => perOccurrenceAmount * OCCURRENCE_MULTIPLIER[occurrence];
// Inverse of annualAmount — the stored line-item amount is always annual, so this recovers
// the per-occurrence figure to redisplay in the editor when opening an existing line.
const perOccurrenceAmount = (storedAnnualAmount: number, occurrence: Occurrence) => storedAnnualAmount / OCCURRENCE_MULTIPLIER[occurrence];
const OUT_CATEGORIES = ["Repairs and maintenance", "Cleaning", "Gardening", "Utilities", "Insurance", "Professional fees", "Bank and admin", "Capital works", "Other"];
const IN_CATEGORIES = ["Levy contribution", "Interest", "Reimbursement", "Fee or fine", "Other"];
const STATUSES = ["Paid", "Approved", "Planned"];

const money = (n: number) => n.toLocaleString("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 });
const money2 = (n: number) => n.toLocaleString("en-AU", { style: "currency", currency: "AUD", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const niceDate = (v: string) => new Date(v).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
const startYearOf = (iso: string) => { const d = new Date(iso); return d.getMonth() >= 6 ? d.getFullYear() : d.getFullYear() - 1; };
const fyLabel = (startYear: number) => `${startYear}/${String(startYear + 1).slice(2)}`;
export const budgetStartYear = (fy: string) => { const m = fy.match(/\d{4}/); return m ? Number(m[0]) : new Date().getFullYear(); };
const FY_MONTHS = [7, 8, 9, 10, 11, 12, 1, 2, 3, 4, 5, 6];
const monthName = (m: number) => new Date(2000, m - 1, 1).toLocaleDateString("en-AU", { month: "short" });
const monthLabel = (m: number, startYear: number) => `${monthName(m)} ${m >= 7 ? startYear : startYear + 1}`;
const fundName = (funds: BudgetFund[], fundId: string) => funds.find(f => f.id === fundId)?.name ?? "Unknown fund";

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

// Bootstrap helper: a brand-new scheme has no custom funds yet, so give it the
// familiar Admin + Maintenance pair to start from — mirrors ensureStandardWidgets's
// "create the defaults once, only if nothing exists yet" pattern.
export async function ensureDefaultFunds(schemeId: string, existingFundCount: number) {
  if (existingFundCount > 0) return false;
  const { error } = await supabase.from("budget_funds").insert([
    { scheme_id: schemeId, name: "Admin", sort_order: 0 },
    { scheme_id: schemeId, name: "Maintenance", sort_order: 1 },
  ]);
  if (error) throw error;
  return true;
}

function reminderText(levy: Levy, status: string) {
  const who = levy.lots?.owner_name ?? "there";
  const year = levy.budgets?.financial_year ? ` for ${levy.budgets.financial_year}` : "";
  return status === "Overdue"
    ? `Hi ${who},\n\nA quick friendly note: the levy${year} for Lot ${levy.lots?.lot_number ?? ""} of ${money(Number(levy.amount))} was due on ${niceDate(levy.due_date)} and is still showing as unpaid on our records.\n\nIf you have already paid, please ignore this and let us know so we can update the books. Otherwise, whenever you get a chance is fine.\n\nThanks,\nYour owners corporation committee`
    : `Hi ${who},\n\nJust a friendly reminder that the levy${year} for Lot ${levy.lots?.lot_number ?? ""} of ${money(Number(levy.amount))} is due on ${niceDate(levy.due_date)}.\n\nNo action needed if it is already on its way.\n\nThanks,\nYour owners corporation committee`;
}

// A levy is "sent" purely from the Levies tab (never automatically from a budget save):
// posting an in-app Notice for the owner's lot, plus a mailto for the committee to also
// send a real email, and snapshotting the amount at send time so a later budget-driven
// recalculation can be flagged as "amount changed since sent" (see isLevyStale).
export function levySendText(levy: Levy, funds: BudgetFund[]): { title: string; message: string } {
  const year = levy.budgets?.financial_year ? ` for ${levy.budgets.financial_year}` : "";
  const lot = levy.lots?.lot_number ?? "";
  const breakdown = funds.map(f => `${f.name}: ${money(levyShareForFund(levy, f.id))}`).join(" · ");
  return {
    title: `Levy issued${year} — Lot ${lot}`,
    message: `Your levy${year} for Lot ${lot} is ${money(Number(levy.amount))}, due ${niceDate(levy.due_date)}.${breakdown ? `\n\n${breakdown}` : ""}`,
  };
}
export function isLevyStale(levy: Levy): boolean {
  return levy.notified_at != null && levy.notified_amount != null && Number(levy.notified_amount) !== Number(levy.amount);
}
// A single levy gets a specific, accurate mailto (one real amount). Bulk sends can't
// carry a different amount per recipient in one mailto body, so the bulk email stays
// generic — the accurate number always lives in each owner's in-app Notice instead.
export function levyMailto(levies: Levy[]): string {
  if (levies.length === 1) {
    const levy = levies[0]!;
    const { title, message } = levySendText(levy, []);
    return levy.lots?.owner_email ? `mailto:${levy.lots.owner_email}?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(message)}` : "";
  }
  const emails = levies.map(l => l.lots?.owner_email).filter((e): e is string => !!e);
  const year = levies[0]?.budgets?.financial_year ? ` for ${levies[0].budgets.financial_year}` : "";
  const subject = `Levies issued${year}`;
  const body = `Your levy${year} is now available to view.\n\nCheck your dashboard for your exact amount and due date.\n\nThanks,\nYour owners corporation committee`;
  return emails.length ? `mailto:?bcc=${encodeURIComponent(emails.join(","))}&subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}` : "";
}
export async function sendLevies(levies: Levy[], funds: BudgetFund[], schemeId: string): Promise<{ failures: string[] }> {
  const failures: string[] = [];
  const byLot = new Map<string, Levy>();
  for (const levy of levies) if (levy.lot_id) byLot.set(levy.lot_id, levy);
  const noticeRows = [...byLot.values()].map(levy => {
    const { title, message } = levySendText(levy, funds);
    return { scheme_id: schemeId, lot_id: levy.lot_id, levy_id: levy.id, title, message };
  });
  if (noticeRows.length > 0) {
    const { error } = await supabase.from("notices").insert(noticeRows);
    if (error) failures.push(`Could not post the notice${noticeRows.length === 1 ? "" : "s"}: ${error.message}`);
  }
  const now = new Date().toISOString();
  for (const levy of levies) {
    const { error } = await supabase.from("levies").update({ notified_at: now, notified_amount: levy.amount }).eq("id", levy.id);
    if (error) failures.push(`Could not mark Lot ${levy.lots?.lot_number ?? "?"} as sent: ${error.message}`);
  }
  return { failures };
}

export const shareAmount = (method: string, entitlementPercent: number, lotCount: number, total: number) =>
  Math.round((method === "Equal" ? total / Math.max(1, lotCount) : (entitlementPercent / 100) * total) * 100) / 100;

const FINANCIAL_STATEMENTS_WIDGET = { key: "financial_statements", label: "Financial Statements", detail: "Prepare the annual financial statements: what came in, what went out." };

function financialStatementsPreview(budgets: FinanceBudget[], levies: Levy[], finance: FinanceTx[], funds: BudgetFund[]) {
  const year = currentFinancialYearStart();
  const budget = budgets.find(b => b.financial_year.match(/\d{4}/)?.[0] === String(year));
  const balances = computeFundBalances(levies, finance, year);
  const paidTx = finance.filter(t => t.status === "Paid" && new Date(t.occurred_on).getFullYear() >= year);
  const spent = paidTx.filter(t => t.direction === "out").reduce((s, t) => s + Number(t.amount), 0);
  const collected = paidTx.filter(t => t.direction === "in").reduce((s, t) => s + Number(t.amount), 0);
  const fundNameFor = (id: string) => funds.find(f => f.id === id)?.name ?? "Fund";
  const budgetedByFund = budget
    ? budget.budget_fund_totals.map(t => `${fundNameFor(t.fund_id)} ${money(t.total)}`).join(" · ")
    : null;
  const balanceByFund = Object.entries(balances.byFund).map(([id, v]) => `${fundNameFor(id)} ${money(v)}`).join(" · ");
  return [
    `Financial year: ${budget?.financial_year ?? `${year}/${year + 1}`}`,
    budget ? `Budgeted: ${budgetedByFund}` : "No budget set for this year yet.",
    `Money in: ${money(collected)}`, `Money out: ${money(spent)}`,
    `Fund balances: ${balanceByFund}${balanceByFund ? " · " : ""}Total ${money(balances.total)}`,
  ].join("\n");
}

function FinanceObligationCard({ budgets, levies, transactions, funds, isCommittee, schemeId, tasks, complianceWidgets, actionDrafts, onChanged }: {
  budgets: FinanceBudget[]; levies: Levy[]; transactions: FinanceTx[]; funds: BudgetFund[]; isCommittee: boolean; schemeId?: string | undefined;
  tasks: Task[]; complianceWidgets: ComplianceWidget[]; actionDrafts: ActionDraft[]; onChanged: () => void;
}) {
  const bootstrapped = useRef(false);
  useEffect(() => {
    if (!schemeId || bootstrapped.current) return;
    bootstrapped.current = true;
    void ensureStandardWidget(schemeId, complianceWidgets, FINANCIAL_STATEMENTS_WIDGET).then(created => { if (created) onChanged(); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schemeId]);

  const widget = complianceWidgets.find(w => w.standard_key === "financial_statements");
  const task = widget ? currentTaskFor(widget, tasks) : undefined;
  const draft = actionDrafts.find(d => d.standard_key === "financial_statements") ?? null;
  const tone = urgencyTone(task?.due_date, task?.status === "Complete");
  const previewText = financialStatementsPreview(budgets, levies, transactions, funds);

  const [content, setContent] = useState(draft?.content ?? "");
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);

  if (!isCommittee) return null;

  const saveDraft = async () => {
    if (!schemeId) return;
    setSaving(true);
    const { error } = draft
      ? await supabase.from("action_drafts").update({ content }).eq("id", draft.id)
      : await supabase.from("action_drafts").insert({ scheme_id: schemeId, standard_key: "financial_statements", content });
    setSaving(false);
    if (error) { toast("Could not save the draft", { description: error.message }); return; }
    onChanged(); toast("Draft saved");
  };

  const publish = async () => {
    if (!schemeId || !widget) return;
    setPublishing(true);
    const text = [previewText, content.trim() ? `\n\nCommittee notes:\n${content.trim()}` : ""].join("");
    try {
      await publishActionDocument(schemeId, widget, task?.id ?? null, text);
      onChanged();
      toast("Published", { description: "Filed in Documents and marked complete." });
    } catch (err) {
      toast("Could not publish", { description: (err as Error).message });
    } finally { setPublishing(false); }
  };

  return <Card className="p-6">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <p className="text-sm font-medium">Financial Statements</p>
      <span className={`text-[12px] ${tone.className}`}>{tone.label}</span>
    </div>
    <details className="mt-3">
      <summary className="cursor-pointer text-[12px] text-muted-foreground">Preview</summary>
      <pre className="mt-2 max-h-52 overflow-y-auto whitespace-pre-wrap rounded-2xl border border-border/70 bg-secondary/40 p-3 text-[12px] leading-6">{previewText}</pre>
    </details>
    <div className="mt-3 space-y-2">
      <Label htmlFor="finance_obligation_notes" className="text-[11px]">Committee notes (optional)</Label>
      <Textarea id="finance_obligation_notes" rows={3} value={content} onChange={e => setContent(e.target.value)} placeholder="Anything to add before this goes out" />
    </div>
    <div className="mt-3 flex flex-wrap justify-end gap-2">
      <Button type="button" size="sm" variant="outline" className="rounded-full" disabled={saving} onClick={() => void saveDraft()}>{saving ? "Saving…" : "Save draft"}</Button>
      <Button type="button" size="sm" className="rounded-full" disabled={publishing} onClick={() => void publish()}>{publishing ? "Publishing…" : "Publish"}</Button>
    </div>
  </Card>;
}

export type DraftLine = {
  id: string; fundId: string; costType: "Fixed" | "Variable"; occurrence: Occurrence;
  description: string; amount: string; month: string; file: File | null;
};
export const emptyDraftLine = (defaultFundId = ""): DraftLine => ({ id: crypto.randomUUID(), fundId: defaultFundId, costType: "Variable", occurrence: "Annually", description: "", amount: "", month: "", file: null });
export const draftTotals = (lines: DraftLine[], funds: BudgetFund[]) => {
  const byFund: Record<string, number> = {};
  for (const f of funds) byFund[f.id] = 0;
  for (const l of lines) {
    const annual = annualAmount(Number(l.amount) || 0, l.occurrence);
    byFund[l.fundId] = (byFund[l.fundId] ?? 0) + annual;
  }
  return {
    byFund,
    total: lines.reduce((s, l) => s + annualAmount(Number(l.amount) || 0, l.occurrence), 0),
    fixed: lines.filter(l => l.costType === "Fixed").reduce((s, l) => s + annualAmount(Number(l.amount) || 0, l.occurrence), 0),
    variable: lines.filter(l => l.costType === "Variable").reduce((s, l) => s + annualAmount(Number(l.amount) || 0, l.occurrence), 0),
  };
};
// Common owners-corporation costs to seed a scheme's very first budget with, so a first-time
// user only has to adjust amounts rather than think up a list of categories from scratch.
// Named by fund NAME (matched against the scheme's actual funds at build time) since the
// starter list predates any particular scheme's fund ids.
const STARTER_BUDGET_ROWS: [string, "Admin" | "Maintenance", "Fixed" | "Variable"][] = [
  ["Building insurance", "Admin", "Fixed"], ["Public liability insurance", "Admin", "Fixed"],
  ["Cleaning", "Admin", "Fixed"], ["Gardening & grounds", "Admin", "Fixed"],
  ["Common area electricity", "Admin", "Variable"], ["Water rates", "Admin", "Variable"],
  ["Pest control", "Admin", "Variable"], ["Fire safety compliance", "Admin", "Fixed"],
  ["Bank fees & admin", "Admin", "Fixed"], ["Repairs & maintenance", "Maintenance", "Variable"],
  ["Capital works contribution", "Maintenance", "Fixed"],
];
export const starterBudgetLines = (funds: BudgetFund[]): DraftLine[] => {
  const idFor = (name: string) => funds.find(f => f.name === name)?.id ?? funds[0]?.id ?? "";
  return STARTER_BUDGET_ROWS.map(([description, fund, costType]) => ({ id: crypto.randomUUID(), fundId: idFor(fund), costType, occurrence: "Annually" as Occurrence, description, amount: "", month: "", file: null }));
};
const lineItemsToDraft = (items: BudgetLineItem[], funds: BudgetFund[]): DraftLine[] =>
  items.length ? items.map(i => {
    const occurrence = (OCCURRENCES as readonly string[]).includes(i.occurrence) ? (i.occurrence as Occurrence) : "Annually";
    return { id: i.id, fundId: i.fund_id, costType: i.cost_type === "Fixed" ? "Fixed" : "Variable", occurrence, description: i.description, amount: String(perOccurrenceAmount(Number(i.amount), occurrence)), month: i.expected_month ? String(i.expected_month) : "", file: null };
  })
    : [emptyDraftLine(funds[0]?.id)];
const jsonLineItemsToDraft = (items: DraftLineItemJson[], funds: BudgetFund[]): DraftLine[] =>
  items.length ? items.map(i => ({ id: crypto.randomUUID(), fundId: funds.find(f => f.name === i.fund)?.id ?? funds[0]?.id ?? "", costType: "Variable", occurrence: "Annually" as Occurrence, description: i.description, amount: String(i.amount), month: "", file: null }))
    : [emptyDraftLine(funds[0]?.id)];
// Starting point for a new year's budget: last year's lines (carried amounts, cleared months)
// to adjust, or the generic starter template if this scheme has never budgeted before.
export const draftLinesForNewBudget = (previousYearLineItems: BudgetLineItem[], funds: BudgetFund[]): DraftLine[] =>
  previousYearLineItems.length
    ? previousYearLineItems.map(i => {
        const occurrence = (OCCURRENCES as readonly string[]).includes(i.occurrence) ? (i.occurrence as Occurrence) : "Annually";
        return { id: crypto.randomUUID(), fundId: i.fund_id, costType: i.cost_type === "Fixed" ? "Fixed" : "Variable", occurrence, description: i.description, amount: String(perOccurrenceAmount(Number(i.amount), occurrence)), month: "", file: null };
      })
    : starterBudgetLines(funds).map(l => ({ ...l, id: crypto.randomUUID() }));

const budgetChangeText = (financialYear: string, reason: string, funds: BudgetFund[], prevTotals: Record<string, number>, newTotals: Record<string, number>, recalculated: boolean) => [
  `Budget update for ${financialYear}`,
  ``,
  reason,
  ``,
  ...funds.map(f => `${f.name} fund: ${money(prevTotals[f.name] ?? 0)} → ${money(newTotals[f.name] ?? 0)}`),
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

// A spreadsheet-style editor: one row per cost, fund/type/occurrence/month as dropdowns,
// amount as a plain number field, live subtotals per fund at the bottom. Used both for
// building a brand-new budget and for editing an existing one. Renders as a stacked-card
// layout below `sm` and a table at `sm` and up — two layouts, gated purely by Tailwind
// breakpoints, so it never overflows on desktop nor gets cramped on mobile.
export function LineItemsEditor({ lines, setLines, funds, startYear, spentByLineId }: {
  lines: DraftLine[]; setLines: (lines: DraftLine[]) => void; funds: BudgetFund[]; startYear?: number | undefined;
  spentByLineId?: ((id: string) => number) | undefined;
}) {
  const update = (id: string, patch: Partial<DraftLine>) => setLines(lines.map(l => l.id === id ? { ...l, ...patch } : l));
  const remove = (id: string) => { if (lines.length > 1) setLines(lines.filter(l => l.id !== id)); };
  const totals = draftTotals(lines, funds);
  const tracking = !!spentByLineId;

  const FundSelect = ({ line }: { line: DraftLine }) => (
    <Select value={line.fundId} onValueChange={(v) => update(line.id, { fundId: v })}>
      <SelectTrigger className="h-9 w-full sm:w-[130px]"><SelectValue placeholder="Choose a fund" /></SelectTrigger>
      <SelectContent>{funds.map(f => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}</SelectContent>
    </Select>
  );
  const TypeSelect = ({ line }: { line: DraftLine }) => (
    <Select value={line.costType} onValueChange={(v) => update(line.id, { costType: v as "Fixed" | "Variable" })}>
      <SelectTrigger className="h-9 w-full sm:w-[100px]"><SelectValue /></SelectTrigger>
      <SelectContent><SelectItem value="Fixed">Fixed</SelectItem><SelectItem value="Variable">Variable</SelectItem></SelectContent>
    </Select>
  );
  const OccurrenceSelect = ({ line }: { line: DraftLine }) => (
    <Select value={line.occurrence} onValueChange={(v) => update(line.id, { occurrence: v as Occurrence })}>
      <SelectTrigger className="h-9 w-full sm:w-[110px]"><SelectValue /></SelectTrigger>
      <SelectContent>{OCCURRENCES.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
    </Select>
  );
  const MonthSelect = ({ line }: { line: DraftLine }) => (
    <Select value={line.month} onValueChange={(v) => update(line.id, { month: v })}>
      <SelectTrigger className="h-9 w-full sm:w-[110px]"><SelectValue placeholder="Not yet" /></SelectTrigger>
      <SelectContent>{FY_MONTHS.map(m => <SelectItem key={m} value={String(m)}>{startYear ? monthLabel(m, startYear) : monthName(m)}</SelectItem>)}</SelectContent>
    </Select>
  );
  const AmountField = ({ line }: { line: DraftLine }) => {
    const annual = annualAmount(Number(line.amount) || 0, line.occurrence);
    return <div>
      <Input type="number" min="0" step="0.01" placeholder="0" value={line.amount} onChange={e => update(line.id, { amount: e.target.value })} className="h-9 text-right" />
      {line.occurrence !== "Annually" && Number(line.amount) > 0 && <p className="mt-1 text-right text-[11px] text-muted-foreground">= {money(annual)}/yr</p>}
    </div>;
  };
  const AttachRemove = ({ line }: { line: DraftLine }) => (
    <div className="flex items-center justify-end gap-0.5">
      <Button asChild type="button" size="icon" variant="ghost" className="rounded-full" aria-label="Attach evidence of cost">
        <label><Paperclip className="size-4" /><input type="file" className="hidden" onChange={e => { const f = e.target.files?.[0] ?? null; update(line.id, { file: f }); e.currentTarget.value = ""; }} /></label>
      </Button>
      <Button type="button" size="icon" variant="ghost" className="rounded-full text-muted-foreground" aria-label="Remove this line" onClick={() => remove(line.id)}><Trash2 className="size-4" /></Button>
    </div>
  );

  return <div className="space-y-3">
    <p className="text-[11px] leading-5 text-muted-foreground">
      <span className="font-medium">Fixed</span> — a known, recurring cost (insurance, a cleaning contract). <span className="font-medium">Variable</span> — a one-off or estimated cost (a repair quote). Type the amount per occurrence and we'll work out the annual figure that gets budgeted. <span className="font-medium">When</span> — the month you expect to pay it; leave blank if you're not sure yet.
    </p>

    {/* Mobile: stacked cards, one per line item */}
    <div className="space-y-3 sm:hidden">
      {lines.map(line => {
        const spent = tracking ? spentByLineId(line.id) : 0;
        const remaining = annualAmount(Number(line.amount) || 0, line.occurrence) - spent;
        return <div key={line.id} className="space-y-3 rounded-2xl border border-border/70 p-3">
          <div className="flex items-start justify-between gap-2">
            <Input placeholder="What is it" value={line.description} onChange={e => update(line.id, { description: e.target.value })} className="h-9 flex-1" />
            <AttachRemove line={line} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <FundSelect line={line} />
            <TypeSelect line={line} />
            <OccurrenceSelect line={line} />
            <MonthSelect line={line} />
          </div>
          <div>
            <Label className="text-[11px] text-muted-foreground">Amount per {line.occurrence.toLowerCase()}</Label>
            <div className="mt-1"><AmountField line={line} /></div>
          </div>
          {tracking && <div className="flex justify-between border-t border-border/60 pt-2 text-[12px]">
            <span className="text-muted-foreground">Spent {money(spent)}</span>
            <span className={`font-medium tabular-nums ${remaining < 0 ? "text-destructive" : ""}`}>Remaining {money(remaining)}</span>
          </div>}
        </div>;
      })}
    </div>

    {/* Desktop / tablet: full spreadsheet table */}
    <div className="hidden overflow-x-auto rounded-2xl border border-border/70 sm:block">
      <table className="w-full min-w-[920px] border-collapse text-[13px]">
        <thead>
          <tr className="border-b border-border/70 bg-secondary/40 text-left text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
            <th className="px-3 py-2.5">Description</th>
            <th className="px-3 py-2.5">Fund</th>
            <th className="px-3 py-2.5">Type</th>
            <th className="px-3 py-2.5">Occurrence</th>
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
            const annual = annualAmount(Number(line.amount) || 0, line.occurrence);
            const remaining = annual - spent;
            return <tr key={line.id} className="border-b border-border/60 last:border-0">
              <td className="px-3 py-2"><Input placeholder="What is it" value={line.description} onChange={e => update(line.id, { description: e.target.value })} className="h-9" /></td>
              <td className="px-3 py-2"><FundSelect line={line} /></td>
              <td className="px-3 py-2"><TypeSelect line={line} /></td>
              <td className="px-3 py-2"><OccurrenceSelect line={line} /></td>
              <td className="px-3 py-2"><MonthSelect line={line} /></td>
              <td className="px-3 py-2"><AmountField line={line} /></td>
              {tracking && <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{money(spent)}</td>}
              {tracking && <td className={`px-3 py-2 text-right tabular-nums font-medium ${remaining < 0 ? "text-destructive" : ""}`}>{money(remaining)}</td>}
              <td className="px-3 py-2"><AttachRemove line={line} /></td>
            </tr>;
          })}
        </tbody>
        <tfoot>
          {funds.map(f => <tr key={f.id} className="border-t border-border/70 bg-secondary/30 text-[12px] font-medium first:border-t">
            <td className="px-3 py-2.5" colSpan={3}>{f.name} fund subtotal</td>
            <td className="px-3 py-2.5 text-right tabular-nums" colSpan={tracking ? 5 : 3}>{money(totals.byFund[f.id] ?? 0)}</td>
          </tr>)}
          <tr className="border-t border-border/70 text-[13px] font-semibold">
            <td className="px-3 py-2.5" colSpan={3}>Total budget</td>
            <td className="px-3 py-2.5 text-right tabular-nums" colSpan={tracking ? 5 : 3}>{money(totals.total)}</td>
          </tr>
        </tfoot>
      </table>
    </div>

    {lines.some(l => l.file) && <div className="space-y-1">
      {lines.filter(l => l.file).map(l => <p key={l.id} className="text-[11px] text-muted-foreground">Attaching for "{l.description || "untitled line"}": {l.file!.name}</p>)}
    </div>}
    <Button type="button" variant="outline" size="sm" className="rounded-full" onClick={() => setLines([...lines, emptyDraftLine(funds[0]?.id)])}><Plus className="size-3.5" />Add a line</Button>
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

// Committee-only dialog to rename, add or delete this scheme's custom funds. Deleting a
// fund still referenced by a line item, transaction or budget total is blocked at the
// database level (ON DELETE RESTRICT); we catch that and explain it plainly.
function ManageFundsDialog({ open, onOpenChange, schemeId, funds, onChanged }: {
  open: boolean; onOpenChange: (v: boolean) => void; schemeId?: string | undefined; funds: BudgetFund[]; onChanged: () => void;
}) {
  const [names, setNames] = useState<Record<string, string>>({});
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);
  const nameFor = (f: BudgetFund) => names[f.id] ?? f.name;

  const rename = async (f: BudgetFund) => {
    const value = (names[f.id] ?? f.name).trim();
    if (value === "" || value === f.name) return;
    const { error } = await supabase.from("budget_funds").update({ name: value }).eq("id", f.id);
    if (error) { toast("Could not rename that fund", { description: error.message }); return; }
    onChanged(); toast("Fund renamed");
  };
  const add = async () => {
    if (!schemeId || newName.trim() === "") return;
    setBusy(true);
    const { error } = await supabase.from("budget_funds").insert({ scheme_id: schemeId, name: newName.trim(), sort_order: funds.length });
    setBusy(false);
    if (error) { toast("Could not add that fund", { description: error.message }); return; }
    setNewName(""); onChanged(); toast("Fund added");
  };
  const remove = async (f: BudgetFund) => {
    const { error } = await supabase.from("budget_funds").delete().eq("id", f.id);
    if (error) {
      const inUse = error.code === "23503" || /foreign key/i.test(error.message);
      toast(inUse ? "That fund is still in use" : "Could not remove that fund", {
        description: inUse ? "It's used by a budget line, a transaction or a past budget total, so it can't be deleted. Move those to another fund first." : error.message,
      });
      return;
    }
    onChanged(); toast("Fund removed");
  };

  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="max-h-[85vh] overflow-y-auto">
      <DialogHeader><DialogTitle className="font-display tracking-[-0.02em]">Manage funds</DialogTitle><DialogDescription>Your scheme's own list of funds — rename them, add more, or remove ones you don't use.</DialogDescription></DialogHeader>
      <div className="space-y-3">
        {funds.map(f => <div key={f.id} className="flex items-center gap-2">
          <Input value={nameFor(f)} onChange={e => setNames(n => ({ ...n, [f.id]: e.target.value }))} onBlur={() => void rename(f)} className="h-9" />
          <Button type="button" size="icon" variant="ghost" className="rounded-full text-muted-foreground shrink-0" aria-label={`Remove ${f.name}`} onClick={() => void remove(f)}><Trash2 className="size-4" /></Button>
        </div>)}
        {funds.length === 0 && <p className="text-[12px] text-muted-foreground">No funds yet — add your first one below.</p>}
        <div className="flex items-center gap-2 border-t border-border/60 pt-3">
          <Input value={newName} onChange={e => setNewName(e.target.value)} placeholder="e.g. Sinking Fund" className="h-9" onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); void add(); } }} />
          <Button type="button" size="sm" className="rounded-full shrink-0" disabled={busy || newName.trim() === ""} onClick={() => void add()}><Plus className="size-3.5" />Add</Button>
        </div>
      </div>
      <div className="flex justify-end pt-2"><Button type="button" variant="ghost" className="rounded-full" onClick={() => onOpenChange(false)}>Done</Button></div>
    </DialogContent>
  </Dialog>;
}

function TxDialog({ open, onOpenChange, schemeId, tx, funds, defaultFundId, lineItems, onSaved }: {
  open: boolean; onOpenChange: (v: boolean) => void; schemeId?: string | undefined; tx: FinanceTx | null; funds: BudgetFund[];
  defaultFundId?: string | undefined; lineItems: BudgetLineItem[]; onSaved: () => void;
}) {
  const [direction, setDirection] = useState(tx?.direction ?? "out");
  const [fundId, setFundId] = useState(tx?.fund_id ?? defaultFundId ?? funds[0]?.id ?? "");
  const [category, setCategory] = useState(tx?.category ?? "");
  const [status, setStatus] = useState(tx?.status ?? "Paid");
  const [budgetLineItemId, setBudgetLineItemId] = useState(tx?.budget_line_item_id ?? "");
  const categories = direction === "in" ? IN_CATEGORIES : OUT_CATEGORIES;
  const matchableLines = lineItems.filter(l => l.fund_id === fundId);

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!schemeId) return;
    if (fundId === "") { toast("Choose a fund first"); return; }
    const form = new FormData(e.currentTarget);
    const text = (k: string) => { const v = String(form.get(k) ?? "").trim(); return v === "" ? null : v; };
    const payload = {
      scheme_id: schemeId, direction, fund_id: fundId, status,
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
            <Select value={fundId} onValueChange={setFundId}>
              <SelectTrigger><SelectValue placeholder="Choose a fund" /></SelectTrigger>
              <SelectContent>{funds.map(f => <SelectItem key={f.id} value={f.id}>{f.name} fund</SelectItem>)}</SelectContent>
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
export function BudgetBuilderForm({ schemeId, lots, funds, onCreated, onCancel, initialLines, submitLabel }: {
  schemeId?: string | undefined; lots: FinLot[]; funds: BudgetFund[]; onCreated: () => void; onCancel?: (() => void) | undefined;
  initialLines?: DraftLine[] | undefined; submitLabel?: string | undefined;
}) {
  const [lines, setLines] = useState<DraftLine[]>(initialLines && initialLines.length > 0 ? initialLines : [emptyDraftLine(funds[0]?.id)]);
  const [method, setMethod] = useState("Entitlement");
  const [financialYear, setFinancialYear] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const totals = draftTotals(lines, funds);
  const startYear = financialYear.match(/\d{4}/) ? Number(financialYear.match(/\d{4}/)![0]) : undefined;

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!schemeId) return;
    const validLines = lines.filter(l => l.description.trim() !== "" && Number(l.amount) > 0 && l.fundId !== "");
    if (validLines.length === 0 || totals.total <= 0) { toast("Add at least one line item with a description and an amount"); return; }
    setSubmitting(true);
    const { data: budget, error } = await supabase.from("budgets").insert({
      scheme_id: schemeId, financial_year: financialYear, total_amount: totals.total, allocation_method: method, levy_due_date: dueDate,
    }).select().single();
    if (error || !budget) { toast("Could not create the budget", { description: error?.message }); setSubmitting(false); return; }
    const failures: string[] = [];
    for (const f of funds) {
      const { error: totalError } = await supabase.from("budget_fund_totals").insert({ budget_id: budget.id as string, fund_id: f.id, total: totals.byFund[f.id] ?? 0 });
      if (totalError) failures.push(`${f.name} fund total`);
    }
    for (const line of validLines) {
      const { data: item, error: itemError } = await supabase.from("budget_line_items").insert({
        budget_id: budget.id as string, scheme_id: schemeId, fund_id: line.fundId, cost_type: line.costType,
        occurrence: line.occurrence, description: line.description, amount: annualAmount(Number(line.amount), line.occurrence),
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
      <LineItemsEditor lines={lines} setLines={setLines} funds={funds} startYear={startYear} />
    </div>
    {lots.length > 0 && totals.total > 0 && <div className="space-y-2">
      <Label>Preview — what each lot will be billed</Label>
      <InvoicePreview lots={lots} method={method} total={totals.total} />
    </div>}
    <div className="flex justify-end gap-2 pt-2">
      {onCancel && <Button type="button" variant="ghost" className="rounded-full" onClick={onCancel}>Cancel</Button>}
      <Button type="submit" className="rounded-full" disabled={submitting}>{submitting ? "Locking in…" : (submitLabel ?? "Lock in budget and issue levies")}</Button>
    </div>
  </form>;
}

export function CreateBudgetDialog({ open, onOpenChange, schemeId, lots, funds, onCreated, initialLines }: {
  open: boolean; onOpenChange: (v: boolean) => void; schemeId?: string | undefined; lots: FinLot[]; funds: BudgetFund[]; onCreated: () => void;
  initialLines?: DraftLine[] | undefined;
}) {
  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-[640px]">
      <DialogHeader><DialogTitle className="font-display tracking-[-0.02em]">Create a budget</DialogTitle><DialogDescription>Break the year into line items, and Loty issues a notice to every lot from the totals.</DialogDescription></DialogHeader>
      <BudgetBuilderForm schemeId={schemeId} lots={lots} funds={funds} initialLines={initialLines} onCancel={() => onOpenChange(false)}
        onCreated={() => { onOpenChange(false); onCreated(); }} submitLabel="Create and issue notices" />
    </DialogContent>
  </Dialog>;
}

type EditOutcome = { adjustments: { levy: Levy; oldAmount: number; newAmount: number; diff: number }[]; recalculated: boolean };

// The single, always-live budget editor: the same component builds a brand-new budget for a
// year with none yet, and edits/tracks an existing one — never a separate "edit" step. When
// `budget` is set it also shows spend-vs-budget inline and a required change reason.
function BudgetEditorForm({ schemeId, budget, lots, funds, levies, lineItems, spentAgainstLine, priorLineItems, financialYearHint, revertFrom, onSaved, onOpenHistory }: {
  schemeId?: string | undefined; budget: FinanceBudget | null; lots: FinLot[]; funds: BudgetFund[]; levies: Levy[]; lineItems: BudgetLineItem[];
  spentAgainstLine: (id: string) => number; priorLineItems: BudgetLineItem[]; financialYearHint: string; revertFrom: BudgetRevision | null;
  onSaved: () => void; onOpenHistory: () => void;
}) {
  const isEdit = !!budget;
  const originalLines = budget ? lineItems.filter(li => li.budget_id === budget.id) : [];
  const [lines, setLines] = useState<DraftLine[]>(() =>
    revertFrom ? jsonLineItemsToDraft(revertFrom.previous_line_items, funds)
    : isEdit ? lineItemsToDraft(originalLines, funds)
    : draftLinesForNewBudget(priorLineItems, funds));
  const [method, setMethod] = useState(revertFrom ? revertFrom.previous_allocation_method : (budget?.allocation_method ?? "Entitlement"));
  const [financialYear, setFinancialYear] = useState(budget?.financial_year ?? financialYearHint);
  const [dueDate, setDueDate] = useState(revertFrom ? revertFrom.previous_levy_due_date : (budget?.levy_due_date ?? ""));
  const [reason, setReason] = useState(revertFrom ? `Reverted to the version from ${niceDate(revertFrom.created_at)}` : "");
  const [recalculate, setRecalculate] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [outcome, setOutcome] = useState<EditOutcome | null>(null);
  const totals = draftTotals(lines, funds);
  const startYear = financialYear.match(/\d{4}/) ? Number(financialYear.match(/\d{4}/)![0]) : undefined;
  const allOwnerEmails = lots.map(l => l.owner_email).filter((e): e is string => !!e);
  const prevFundTotals = budget ? Object.fromEntries(budget.budget_fund_totals.map(t => [fundName(funds, t.fund_id), t.total])) : {};

  const spentByLineId = isEdit ? spentAgainstLine : undefined;

  const submitNew = async () => {
    if (!schemeId) return;
    const validLines = lines.filter(l => l.description.trim() !== "" && Number(l.amount) > 0 && l.fundId !== "");
    if (validLines.length === 0 || totals.total <= 0) { toast("Add at least one line item with a description and an amount"); return; }
    setSubmitting(true);
    const { data: newBudget, error } = await supabase.from("budgets").insert({
      scheme_id: schemeId, financial_year: financialYear, total_amount: totals.total, allocation_method: method, levy_due_date: dueDate,
    }).select().single();
    if (error || !newBudget) { toast("Could not create the budget", { description: error?.message }); setSubmitting(false); return; }
    const failures: string[] = [];
    for (const f of funds) {
      const { error: totalError } = await supabase.from("budget_fund_totals").insert({ budget_id: newBudget.id as string, fund_id: f.id, total: totals.byFund[f.id] ?? 0 });
      if (totalError) failures.push(`${f.name} fund total`);
    }
    for (const line of validLines) {
      const { data: item, error: itemError } = await supabase.from("budget_line_items").insert({
        budget_id: newBudget.id as string, scheme_id: schemeId, fund_id: line.fundId, cost_type: line.costType,
        occurrence: line.occurrence, description: line.description, amount: annualAmount(Number(line.amount), line.occurrence),
        expected_month: line.month ? Number(line.month) : null,
      }).select().single();
      if (itemError || !item) { failures.push(line.description); continue; }
      if (line.file) {
        const up = await uploadFinanceDoc(schemeId, line.file, { category: "Budget line item", budget_line_item_id: item.id as string });
        if (up.error) failures.push(`${line.description} (evidence file)`);
      }
    }
    setSubmitting(false);
    onSaved();
    if (failures.length > 0) {
      toast("Budget created, but some items need attention", { description: `Could not save: ${failures.join(", ")}. Add these manually from the budget's line items.` });
    } else {
      toast("Budget created", { description: method === "Equal" ? "Every lot was billed an equal share." : "Every lot was billed its entitlement share." });
    }
  };

  const submitEdit = async () => {
    if (!schemeId || !budget) return;
    if (reason.trim() === "") { toast("Add a short reason for this change first"); return; }
    const validLines = lines.filter(l => l.description.trim() !== "" && Number(l.amount) > 0 && l.fundId !== "");
    if (validLines.length === 0) { toast("Add at least one line item"); return; }
    setSubmitting(true);

    const { error: revError } = await supabase.from("budget_revisions").insert({
      budget_id: budget.id, scheme_id: schemeId, reason,
      previous_total: budget.total_amount, previous_fund_totals: prevFundTotals,
      previous_allocation_method: budget.allocation_method ?? "Entitlement", previous_levy_due_date: budget.levy_due_date,
      previous_line_items: originalLines.map(li => ({ fund: fundName(funds, li.fund_id), description: li.description, amount: li.amount })),
      new_total: totals.total, new_fund_totals: Object.fromEntries(funds.map(f => [f.name, totals.byFund[f.id] ?? 0])),
      new_allocation_method: method, new_levy_due_date: dueDate,
      new_line_items: validLines.map(l => ({ fund: fundName(funds, l.fundId), description: l.description, amount: annualAmount(Number(l.amount), l.occurrence) })),
      levies_recalculated: recalculate,
    });
    if (revError) { toast("Could not record this change", { description: revError.message }); setSubmitting(false); return; }

    const { error: budgetError } = await supabase.from("budgets").update({
      total_amount: totals.total, allocation_method: method, levy_due_date: dueDate,
    }).eq("id", budget.id);
    if (budgetError) { toast("Could not update the budget", { description: budgetError.message }); setSubmitting(false); return; }

    const failures: string[] = [];
    for (const f of funds) {
      const { error: totalError } = await supabase.from("budget_fund_totals")
        .upsert({ budget_id: budget.id, fund_id: f.id, total: totals.byFund[f.id] ?? 0 }, { onConflict: "budget_id,fund_id" });
      if (totalError) failures.push(`${f.name} fund total`);
    }

    const originalIds = new Set(originalLines.map(li => li.id));
    const draftIds = new Set(validLines.map(l => l.id));
    for (const li of originalLines) {
      if (!draftIds.has(li.id)) {
        const { error } = await supabase.from("budget_line_items").delete().eq("id", li.id);
        if (error) failures.push(li.description);
      }
    }
    for (const line of validLines) {
      const annual = annualAmount(Number(line.amount), line.occurrence);
      if (originalIds.has(line.id)) {
        const { error } = await supabase.from("budget_line_items").update({ fund_id: line.fundId, cost_type: line.costType, occurrence: line.occurrence, description: line.description, amount: annual, expected_month: line.month ? Number(line.month) : null }).eq("id", line.id);
        if (error) { failures.push(line.description); continue; }
        if (line.file) {
          const up = await uploadFinanceDoc(schemeId, line.file, { category: "Budget line item", budget_line_item_id: line.id });
          if (up.error) failures.push(`${line.description} (evidence file)`);
        }
      } else {
        const { data: item, error } = await supabase.from("budget_line_items").insert({
          budget_id: budget.id, scheme_id: schemeId, fund_id: line.fundId, cost_type: line.costType, occurrence: line.occurrence, description: line.description, amount: annual,
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
        const newAmount = shareAmount(method, entitlement, budgetLevies.length, totals.total);
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

  const submit = (e: FormEvent<HTMLFormElement>) => { e.preventDefault(); void (isEdit ? submitEdit() : submitNew()); };

  // Post-save outcome — shown inline in place of the form, never a blocking modal.
  if (outcome && budget) {
    return <div className="space-y-4">
      <div>
        <h2 className="font-display text-xl tracking-[-0.02em]">Budget updated for {budget.financial_year}</h2>
        <p className="mt-1 text-[13px] text-muted-foreground">{outcome.recalculated ? "Unpaid levies were recalculated to match the correction." : "Existing levy amounts were left as they were."}</p>
      </div>
      <Button asChild variant="outline" className="rounded-full">
        <a href={`mailto:?bcc=${encodeURIComponent(allOwnerEmails.join(","))}&subject=${encodeURIComponent(`Update to your ${budget.financial_year} levies`)}&body=${encodeURIComponent(budgetChangeText(budget.financial_year, reason, funds, prevFundTotals, Object.fromEntries(funds.map(f => [f.name, totals.byFund[f.id] ?? 0])), outcome.recalculated))}`}>Email all owners</a>
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
      <div className="flex justify-end pt-2"><Button className="rounded-full" onClick={() => setOutcome(null)}>Done</Button></div>
    </div>;
  }

  return <form onSubmit={submit} className="space-y-4">
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="max-w-2xl">
        <h2 className="font-display text-xl tracking-[-0.02em]">{isEdit ? `Budget for ${budget!.financial_year}` : `Build your ${financialYearHint} budget`}</h2>
        <p className="mt-2 text-[13px] leading-6 text-muted-foreground">{isEdit
          ? "Every line you budgeted, what's been spent against it so far, and what's left. Every edit needs a reason and is kept in this budget's history."
          : "We've started you off with the usual costs — adjust the amounts, add or remove lines, and say roughly when each one falls. Lock it in and Loty issues a levy notice to every lot."}</p>
      </div>
      {isEdit && <Button type="button" size="sm" variant="ghost" className="rounded-full" onClick={onOpenHistory}><History className="size-3.5" />History</Button>}
    </div>

    {isEdit && <div className="space-y-2">
      <Label htmlFor="reason">What changed and why</Label>
      <Textarea id="reason" rows={3} value={reason} onChange={e => setReason(e.target.value)} placeholder="e.g. The insurance quote came in lower than budgeted" required />
    </div>}

    <div className="grid gap-4 sm:grid-cols-2">
      <div className="space-y-2"><Label htmlFor="financial_year">Financial year</Label><Input id="financial_year" value={financialYear} onChange={e => setFinancialYear(e.target.value)} placeholder="2026/27" required disabled={isEdit} /></div>
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
      <LineItemsEditor lines={lines} setLines={setLines} funds={funds} startYear={startYear} spentByLineId={spentByLineId} />
    </div>
    {isEdit && <div className="rounded-2xl border border-border/70 bg-secondary/40 p-4 text-[13px]">
      {funds.map(f => <div key={f.id} className="flex justify-between border-b border-border/50 pb-1.5 pt-1.5 first:pt-0 last:border-0"><span className="text-muted-foreground">{f.name} fund total</span><span className="font-medium tabular-nums">{money(totals.byFund[f.id] ?? 0)}</span></div>)}
      <div className="mt-2 flex justify-between border-t border-border/60 pt-3 text-[12px] text-muted-foreground"><span>Fixed costs</span><span className="tabular-nums">{money(totals.fixed)}</span></div>
      <div className="mt-1 flex justify-between text-[12px] text-muted-foreground"><span>Variable costs</span><span className="tabular-nums">{money(totals.variable)}</span></div>
    </div>}
    {lots.length > 0 && totals.total > 0 && <div className="space-y-2">
      <Label>{isEdit ? "Preview if recalculated — what each lot would be billed" : "Preview — what each lot will be billed"}</Label>
      <InvoicePreview lots={lots} method={method} total={totals.total} />
    </div>}
    {isEdit && <div className="flex items-center justify-between rounded-2xl border border-border/70 p-4">
      <div>
        <p className="text-sm font-medium">Recalculate unpaid levies to match</p>
        <p className="mt-1 text-[12px] text-muted-foreground">{recalculate ? "Levies not yet paid will update to the new totals. Paid levies are never changed — you'll see any refund or extra amount owing next." : "This is a record-only correction. No levy amounts will change."}</p>
      </div>
      <Switch checked={recalculate} onCheckedChange={setRecalculate} />
    </div>}
    <div className="flex justify-end gap-2 pt-2">
      <Button type="submit" className="rounded-full" disabled={submitting}>{submitting ? "Saving…" : (isEdit ? "Save changes" : "Lock in budget and issue levies")}</Button>
    </div>
  </form>;
}

function BudgetHistoryDialog({ open, onOpenChange, budget, funds, revisions, onRevert }: {
  open: boolean; onOpenChange: (v: boolean) => void; budget: FinanceBudget | null; funds: BudgetFund[]; revisions: BudgetRevision[]; onRevert: (revision: BudgetRevision) => void;
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
                {funds.map(f => <div key={f.id}><p className="text-muted-foreground">{f.name} fund</p><p className="font-medium">{money(r.previous_fund_totals[f.name] ?? 0)} → {money(r.new_fund_totals[f.name] ?? 0)}</p></div>)}
                <div><p className="text-muted-foreground">Total</p><p className="font-medium">{money(r.previous_total)} → {money(r.new_total)}</p></div>
              </div>
            </div>)}
          </div>}
    </DialogContent>
  </Dialog>;
}

const effectiveLevyStatus = (levy: Levy) => (levy.status === "Pending" && daysUntil(levy.due_date) < 0 ? "Overdue" : levy.status);
const daysUntil = (date: string) => Math.ceil((new Date(date + "T00:00:00").getTime() - new Date(new Date().toDateString()).getTime()) / 86400000);

function LeviesTab({ levies, funds, documents, isCommittee, schemeId, onPaid, onChanged }: {
  levies: Levy[]; funds: BudgetFund[]; documents: DocFile[];
  isCommittee: boolean; schemeId?: string | undefined; onPaid: (id: string, paidAt: string) => void; onChanged: () => void;
}) {
  const [invoice, setInvoice] = useState<Levy | null>(null);
  const [reminder, setReminder] = useState<Levy | null>(null);
  const [showPaid, setShowPaid] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sending, setSending] = useState<Levy[] | null>(null);
  const [markingPaid, setMarkingPaid] = useState<Levy | null>(null);

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
  const sendable = rows.filter(l => l.status !== "Paid");
  const toggleSelected = (id: string) => setSelected(prev => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  const selectedLevies = sendable.filter(l => selected.has(l.id));

  return <div>
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="max-w-2xl">
        <h2 className="font-display text-xl tracking-[-0.02em]">Levies</h2>
        <p className="mt-2 text-[13px] leading-6 text-muted-foreground">Track exactly who still owes and how close they are to their due date. Budgets are set from the Budget tab, which is what raises these.</p>
      </div>
      {isCommittee && selectedLevies.length > 0 && <Button size="sm" className="rounded-full" onClick={() => setSending(selectedLevies)}>
        <Send className="size-3.5" />Send {selectedLevies.length} {selectedLevies.length === 1 ? "levy" : "levies"}
      </Button>}
    </div>

    <div className="mt-6 flex flex-wrap items-center gap-2">
      {["All years", ...years].map(option =>
        <button key={option} type="button" onClick={() => setYear(option)}
          className={`rounded-full px-4 py-2 text-[12px] font-medium transition ${year === option ? "bg-primary text-primary-foreground" : "border border-border/70 bg-card text-muted-foreground hover:text-foreground"}`}>{option}</button>)}
      {isCommittee && sendable.length > 0 && <button type="button" onClick={() => setSelected(new Set(sendable.map(l => l.id)))}
        className="rounded-full border border-border/70 bg-card px-4 py-2 text-[12px] font-medium text-muted-foreground hover:text-foreground">
        Select all pending
      </button>}
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
        const stale = isLevyStale(levy);
        const sendState = status === "Paid" ? null
          : stale ? { tone: "bg-amber-100 text-amber-800", text: "Amount changed since sent — resend" }
          : levy.notified_at ? { tone: "bg-secondary text-muted-foreground", text: `Sent ${niceDate(levy.notified_at)}` }
          : { tone: "bg-secondary text-muted-foreground", text: "Not sent yet" };
        return <div key={levy.id} className="flex flex-wrap items-center justify-between gap-4 px-7 py-5">
          <div className="flex min-w-0 items-start gap-3">
            {isCommittee && status !== "Paid" && <input type="checkbox" className="mt-1 size-4 shrink-0 rounded border-border" checked={selected.has(levy.id)} onChange={() => toggleSelected(levy.id)} aria-label={`Select levy for Lot ${levy.lots?.lot_number ?? ""}`} />}
            <div className="min-w-0">
              <p className="text-sm font-medium">{levy.lots ? `Lot ${levy.lots.lot_number}${levy.lots.owner_name ? ` · ${levy.lots.owner_name}` : ""}` : "Your levy"}</p>
              <p className="mt-1 text-[12px] text-muted-foreground">
                {levy.budgets?.financial_year ? `${levy.budgets.financial_year} · ` : ""}Due {niceDate(levy.due_date)}
                {levy.status === "Paid" && levy.paid_at ? ` · Paid ${niceDate(levy.paid_at)}` : ""}
              </p>
              {sendState && <p className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${sendState.tone}`}>{sendState.text}</p>}
              {docs.length > 0 && <div className="mt-2 flex flex-wrap gap-2">
                {docs.map(d => <button key={d.id} onClick={() => void openFinanceDoc(d)} className="rounded-full border border-border bg-secondary px-2.5 py-1 text-[11px] hover:bg-secondary/70">{d.name}</button>)}
              </div>}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <span className="font-display text-lg">{money(Number(levy.amount))}</span>
            {alert && <span className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${alert.tone}`}>{alert.text}</span>}
            <StatusPill status={status} />
            <Button size="sm" variant="ghost" className="rounded-full" onClick={() => setInvoice(levy)}>Invoice</Button>
            {isCommittee && <Button asChild size="icon" variant="ghost" className="rounded-full" aria-label="Attach payment proof">
              <label><Paperclip className="size-4" /><input type="file" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) void attachProof(levy, f); e.currentTarget.value = ""; }} /></label>
            </Button>}
            {isCommittee && status !== "Paid" && <Button size="sm" variant={stale ? "default" : "ghost"} className="rounded-full" onClick={() => setSending([levy])}>{levy.notified_at ? "Re-send" : "Send"}</Button>}
            {isCommittee && status !== "Paid" && <Button size="sm" variant="ghost" className="rounded-full" onClick={() => setReminder(levy)}>Send a reminder</Button>}
            {isCommittee && status !== "Paid" && <Button size="sm" variant="outline" className="rounded-full" onClick={() => setMarkingPaid(levy)}>Mark paid</Button>}
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
              [isEqual(invoice) ? "This lot's share" : "Lot entitlement", isEqual(invoice) ? `1 of ${lotsInBudget(invoice)} lots` : `${Number(invoice.lots?.entitlement_percent ?? 0)}%`]]
              .map(([k, v]) => <div key={k} className="flex justify-between border-b border-border/60 pb-2 text-[13px]"><span className="text-muted-foreground">{k}</span><span className="font-medium">{v}</span></div>)}
            {funds.map(f => <div key={f.id} className="flex justify-between border-b border-border/60 pb-2 text-[13px]"><span className="text-muted-foreground">{f.name} fund share</span><span className="font-medium">{money(levyShareForFund(invoice, f.id))}</span></div>)}
            {[["Due date", niceDate(invoice.due_date)], ["Status", effectiveLevyStatus(invoice)]].map(([k, v]) =>
              <div key={k} className="flex justify-between border-b border-border/60 pb-2 text-[13px]"><span className="text-muted-foreground">{k}</span><span className="font-medium">{v}</span></div>)}
            <div className="flex justify-between pt-2"><span className="font-medium">Total payable</span><span className="font-display text-xl">{money(Number(invoice.amount))}</span></div>
          </div>
          <p className="text-[11px] leading-5 text-muted-foreground">{isEqual(invoice) ? "Each fund is divided evenly between every lot." : "Each lot pays its entitlement share of each fund for the year."}</p>
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

    {schemeId && <SendLevyDialog levies={sending} funds={funds} schemeId={schemeId} onOpenChange={(o) => { if (!o) setSending(null); }}
      onSent={() => { setSending(null); setSelected(new Set()); onChanged(); }} />}
    <MarkPaidDialog levy={markingPaid} funds={funds} onOpenChange={(o) => { if (!o) setMarkingPaid(null); }}
      onConfirm={(paidAt) => { onPaid(markingPaid!.id, paidAt); setMarkingPaid(null); }} />
  </div>;
}

function SendLevyDialog({ levies, funds, schemeId, onOpenChange, onSent }: {
  levies: Levy[] | null; funds: BudgetFund[]; schemeId: string; onOpenChange: (v: boolean) => void; onSent: () => void;
}) {
  const [sending, setSending] = useState(false);
  const list = levies ?? [];
  const mailto = list.length > 0 ? levyMailto(list) : "";

  const confirm = async () => {
    setSending(true);
    const { failures } = await sendLevies(list, funds, schemeId);
    setSending(false);
    if (failures.length > 0) { toast("Some levies could not be sent", { description: failures.join(" ") }); }
    onSent();
    if (mailto) window.location.href = mailto;
    toast(failures.length > 0 ? "Notices posted, with some issues" : "Levies sent", { description: mailto ? "Your email app should also open." : "No owner email on file to open a mailto." });
  };

  return <Dialog open={!!levies} onOpenChange={onOpenChange}>
    <DialogContent>
      <DialogHeader>
        <DialogTitle className="font-display tracking-[-0.02em]">Send {list.length === 1 ? "this levy" : `${list.length} levies`}</DialogTitle>
        <DialogDescription>Posts a notice each owner sees on their dashboard, and opens an email ready to send.</DialogDescription>
      </DialogHeader>
      <div className="max-h-64 space-y-2 overflow-y-auto">
        {list.map(l => <div key={l.id} className="flex items-center justify-between rounded-2xl border border-border/70 px-4 py-2.5 text-[13px]">
          <span>Lot {l.lots?.lot_number ?? "?"}{l.lots?.owner_name ? ` · ${l.lots.owner_name}` : ""}</span>
          <span className="font-medium tabular-nums">{money(Number(l.amount))} · due {niceDate(l.due_date)}</span>
        </div>)}
      </div>
      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="ghost" className="rounded-full" onClick={() => onOpenChange(false)}>Cancel</Button>
        <Button type="button" className="rounded-full" disabled={sending || list.length === 0} onClick={() => void confirm()}>{sending ? "Sending…" : "Post notice(s) + open email"}</Button>
      </div>
    </DialogContent>
  </Dialog>;
}

function MarkPaidDialog({ levy, funds, onOpenChange, onConfirm }: {
  levy: Levy | null; funds: BudgetFund[]; onOpenChange: (v: boolean) => void; onConfirm: (paidAt: string) => void;
}) {
  const [paidAt, setPaidAt] = useState(() => new Date().toISOString().slice(0, 10));
  return <Dialog open={!!levy} onOpenChange={(o) => { if (o && levy) setPaidAt(new Date().toISOString().slice(0, 10)); onOpenChange(o); }}>
    <DialogContent>
      <DialogHeader>
        <DialogTitle className="font-display tracking-[-0.02em]">Mark this levy paid</DialogTitle>
        <DialogDescription>Records the payment date and files it against Finance so Cashflow reflects it.</DialogDescription>
      </DialogHeader>
      {levy && <div className="space-y-4">
        <div className="space-y-2"><Label htmlFor="paid_at">Payment date</Label><Input id="paid_at" type="date" value={paidAt} onChange={e => setPaidAt(e.target.value)} /></div>
        <div className="space-y-2">
          <Label>Transactions to be recorded</Label>
          {splitLevyAcrossFunds(levy).map(s => <div key={s.fund_id} className="flex justify-between border-b border-border/60 py-2 text-[13px]">
            <span className="text-muted-foreground">{funds.find(f => f.id === s.fund_id)?.name ?? "Fund"}</span>
            <span className="font-medium">{money(s.amount)}</span>
          </div>)}
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" className="rounded-full" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="button" className="rounded-full" onClick={() => onConfirm(paidAt)}>Mark paid</Button>
        </div>
      </div>}
    </DialogContent>
  </Dialog>;
}

export function FinanceSection({ transactions, budgets, lineItems, levies, revisions, lots, funds, documents, isCommittee, schemeId, tasks, complianceWidgets, actionDrafts, onMarkLevyPaid, onChanged, view, onViewChange }: {
  transactions: FinanceTx[]; budgets: FinanceBudget[]; lineItems: BudgetLineItem[]; levies: Levy[]; revisions: BudgetRevision[]; lots: FinLot[];
  funds: BudgetFund[]; documents: DocFile[]; isCommittee: boolean; schemeId?: string | undefined;
  tasks?: Task[]; complianceWidgets?: ComplianceWidget[]; actionDrafts?: ActionDraft[];
  onMarkLevyPaid: (id: string, paidAt: string) => void; onChanged: () => void;
  view: FinanceView; onViewChange: (v: FinanceView) => void;
}) {
  const today = new Date();
  const currentFy = today.getMonth() >= 6 ? today.getFullYear() : today.getFullYear() - 1;
  const years = useMemo(() => {
    const set = new Set<number>([currentFy]);
    transactions.forEach(t => set.add(startYearOf(t.occurred_on)));
    budgets.forEach(b => set.add(budgetStartYear(b.financial_year)));
    return [...set].sort((a, b) => b - a);
  }, [transactions, budgets, currentFy]);
  const setView = onViewChange;
  const [year, setYear] = useState(currentFy);
  const [txOpen, setTxOpen] = useState(false);
  const [editing, setEditing] = useState<FinanceTx | null>(null);
  const [recordFundId, setRecordFundId] = useState<string | undefined>(undefined);
  const [forecastOpen, setForecastOpen] = useState(false);
  const [historyBudget, setHistoryBudget] = useState<FinanceBudget | null>(null);
  const [revertFrom, setRevertFrom] = useState<BudgetRevision | null>(null);
  const [manageFundsOpen, setManageFundsOpen] = useState(false);
  const [filter, setFilter] = useState("all");

  const inYear = (iso: string) => startYearOf(iso) === year;
  const yearTx = transactions.filter(t => inYear(t.occurred_on));
  const yearBudgets = budgets.filter(b => budgetStartYear(b.financial_year) === year);
  const yearLevies = levies.filter(l => (l.budgets ? budgetStartYear(l.budgets.financial_year) === year : inYear(l.due_date)));

  const sum = (list: FinanceTx[]) => list.reduce((s, t) => s + Number(t.amount), 0);

  const budgetedByFund: Record<string, number> = {};
  for (const f of funds) budgetedByFund[f.id] = yearBudgets.reduce((s, b) => s + Number(b.budget_fund_totals.find(t => t.fund_id === f.id)?.total ?? 0), 0);

  const perFund = (fundId: string) => {
    const paidLevies = yearLevies.filter(l => l.status === "Paid");
    const collected = paidLevies.reduce((s, l) => s + levyShareForFund(l, fundId), 0)
      + sum(yearTx.filter(t => t.direction === "in" && t.fund_id === fundId && t.status === "Paid" && !t.levy_id));
    const owing = yearLevies.filter(l => l.status !== "Paid").reduce((s, l) => s + levyShareForFund(l, fundId), 0);
    const spent = sum(yearTx.filter(t => t.direction === "out" && t.fund_id === fundId && t.status === "Paid"));
    const committed = sum(yearTx.filter(t => t.direction === "out" && t.fund_id === fundId && t.status !== "Paid"));
    const budget = budgetedByFund[fundId] ?? 0;
    return { collected, owing, spent, committed, budget, remaining: budget - spent - committed, balance: collected - spent };
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- perFund closes over yearLevies/yearTx/budgetedByFund, already listed
  const fundStats = useMemo(() => Object.fromEntries(funds.map(f => [f.id, perFund(f.id)])), [funds, yearLevies, yearTx, budgetedByFund]);
  const totalIn = Object.values(fundStats).reduce((s, f) => s + f.collected, 0);
  const totalOut = Object.values(fundStats).reduce((s, f) => s + f.spent, 0);
  const totalOwing = Object.values(fundStats).reduce((s, f) => s + f.owing, 0);
  const totalCommitted = Object.values(fundStats).reduce((s, f) => s + f.committed, 0);
  const totalBalance = Object.values(fundStats).reduce((s, f) => s + f.balance, 0);
  const totalBudget = Object.values(budgetedByFund).reduce((s, v) => s + v, 0);

  const activeBudget = yearBudgets[0] ?? null;

  // Per-fund projected year-end position: same run-rate logic as the scheme-wide
  // projectedSpend/projectedPosition below, but netted against this fund's own
  // budget rather than the scheme total — shown directly on each fund's card
  // instead of only a single scheme-wide forecast dialog.
  const fundProjected = (fundId: string) => {
    const stat = fundStats[fundId];
    if (!stat) return { projectedSpend: 0, position: 0 };
    const projectedSpend = stat.spent / monthsElapsed * 12 + stat.committed;
    const position = stat.budget - projectedSpend; // >=0 surplus (under budget), <0 shortfall (over budget)
    return { projectedSpend, position };
  };

  // Budget-vs-actual, per line item — surfaces anything paid that either wasn't
  // budgeted for at all, or has pushed a specific line past what it budgeted.
  // Cashflow no longer renders an "AGM reporting" card for this (simplified down
  // to fund summary + ledger); the natural future home is the Actions/Compliance
  // Financial Statements preview in dashboard.tsx, so this stays computed here
  // rather than being deleted, ready to be threaded through when that lands.
  const activeLineItems = activeBudget ? lineItems.filter(li => li.budget_id === activeBudget.id) : [];
  const paidOutTx = yearTx.filter(t => t.direction === "out" && t.status === "Paid");
  const spentAgainstLine = (lineId: string) => sum(paidOutTx.filter(t => t.budget_line_item_id === lineId));

  // For a year with no budget yet: seed the builder from the closest earlier year's lines,
  // so a returning committee adjusts last year's numbers instead of starting from nothing.
  const priorBudget = budgets.filter(b => budgetStartYear(b.financial_year) < year)
    .sort((a, b) => budgetStartYear(b.financial_year) - budgetStartYear(a.financial_year))[0] ?? null;
  const priorLineItems = priorBudget ? lineItems.filter(li => li.budget_id === priorBudget.id) : [];

  const monthsElapsed = year === currentFy ? Math.min(12, Math.max(1, (today.getMonth() + 12 - 6) % 12 + 1)) : 12;
  const projectedSpend = totalOut / monthsElapsed * 12 + totalCommitted;
  const projectedPosition = (totalIn + totalOwing) - projectedSpend;

  const visible = yearTx
    .filter(t => filter === "all" || (filter === "in" && t.direction === "in") || (filter === "out" && t.direction === "out") || filter === t.fund_id)
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
    `Still to be collected: ${money(totalOwing)}`,
    `Committed but not yet paid: ${money(totalCommitted)}`,
    ``,
    ...funds.map(f => `${f.name} fund balance: ${money(fundStats[f.id]?.balance ?? 0)} (budget ${money(fundStats[f.id]?.budget ?? 0)})`),
    ``,
    `At this rate we expect to spend ${money(projectedSpend)} by the end of the year, leaving a projected ${projectedPosition >= 0 ? "surplus" : "shortfall"} of ${money(Math.abs(projectedPosition))}.`,
  ].join("\n");

  const tabs = ["Budget", "Levies", "Cashflow"] as const;

  return <div className="space-y-8">
    <PageHead eyebrow="Finance" title="Budget it, track it, see it through" blurb="Build the year's budget, watch spend against it as bills come in, and see the cashflow — all from one spreadsheet."
      action={<div className="flex flex-wrap items-center gap-2">
        <Select value={String(year)} onValueChange={v => setYear(Number(v))}>
          <SelectTrigger className="h-9 w-[150px] rounded-full text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>{years.map(y => <SelectItem key={y} value={String(y)}>{fyLabel(y)}</SelectItem>)}</SelectContent>
        </Select>
        {isCommittee && view === "Cashflow" && <Button className="rounded-full" onClick={() => { setEditing(null); setRecordFundId(undefined); setTxOpen(true); }}><Plus />Record money</Button>}
      </div>} />

    {isCommittee && <FinanceObligationCard budgets={budgets} levies={levies} transactions={transactions} funds={funds} isCommittee={isCommittee} schemeId={schemeId}
      tasks={tasks ?? []} complianceWidgets={complianceWidgets ?? []} actionDrafts={actionDrafts ?? []} onChanged={onChanged}/>}

    <div className="flex flex-wrap items-center gap-2">
      {tabs.map(t => <button key={t} type="button" onClick={() => setView(t)}
        className={`rounded-full px-4 py-2 text-[12px] font-medium transition ${view === t ? "bg-primary text-primary-foreground" : "border border-border/70 bg-card text-muted-foreground hover:text-foreground"}`}>{t}</button>)}
      {isCommittee && view === "Budget" && <Button size="sm" variant="ghost" className="ml-auto rounded-full" onClick={() => setManageFundsOpen(true)}><Settings2 className="size-3.5" />Manage funds</Button>}
    </div>

    {/* The Budget tab is always the live, editable spreadsheet — building a brand-new budget
       and editing an existing one are the same view, never a separate modal step. */}
    {view === "Budget" && <Card className="p-6">
      <BudgetEditorForm schemeId={schemeId} budget={activeBudget} lots={lots} funds={funds} levies={levies} lineItems={lineItems}
        spentAgainstLine={spentAgainstLine} priorLineItems={priorLineItems} financialYearHint={fyLabel(year)}
        revertFrom={revertFrom} onSaved={() => { setRevertFrom(null); onChanged(); }} onOpenHistory={() => setHistoryBudget(activeBudget)} />
    </Card>}

    {view === "Levies" && <LeviesTab levies={levies} funds={funds} documents={documents} isCommittee={isCommittee} schemeId={schemeId} onPaid={onMarkLevyPaid} onChanged={onChanged} />}

    {/* Cashflow is one system: the chunk of money in each fund, then the ledger of what
       moves in and out of it — no separate tab to flip to for the transactions that
       actually explain the numbers above. */}
    {view === "Cashflow" && <>
    <div className="flex flex-wrap items-center justify-end gap-2">
      <Button size="sm" variant="outline" className="rounded-full" onClick={() => setForecastOpen(true)}><Send className="size-3.5" />Send forecast</Button>
    </div>

    <div className="grid gap-4 lg:grid-cols-3">
      {funds.map(f => { const stat = fundStats[f.id]; if (!stat) return null; const fp = fundProjected(f.id); return <Card key={f.id} className="p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{f.name} fund</p>
          </div>
          <Coins className="size-4 text-muted-foreground" />
        </div>
        <p className="mt-4 text-3xl font-medium tracking-[-0.03em] tabular-nums">{money(stat.balance)}</p>
        <p className="mt-1 text-[12px] text-muted-foreground">Collected less spent this year</p>
        <div className="mt-5">
          <Row label="Budget" value={money(stat.budget)} />
          <Row label="Collected" value={money(stat.collected)} />
          <Row label="Still owing" value={money(stat.owing)} tone={stat.owing > 0 ? "text-destructive" : ""} />
          <Row label="Spent" value={money(stat.spent)} />
          <Row label="Already committed" value={money(stat.committed)} />
          <Row label="Remaining budget" value={money(stat.remaining)} tone={stat.remaining < 0 ? "text-destructive" : ""} />
          <Row label="Projected year-end" value={money(Math.abs(fp.position))} tone={fp.position < 0 ? "text-destructive" : ""} />
        </div>
        <p className="mt-3 text-[11px] leading-5 text-muted-foreground/80">{fp.position >= 0 ? "Surplus" : "Shortfall"} at this rate, {monthsElapsed} of 12 months counted.</p>
      </Card>;})}
    </div>

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
              {funds.map(f => <SelectItem key={f.id} value={f.id}>{f.name} fund</SelectItem>)}
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
                <p className="text-sm font-medium">{t.description}{t.work_order_id && <span className="ml-2 inline-flex rounded-full border border-border px-2 py-0.5 align-middle text-[10px] font-medium text-muted-foreground">Work order</span>}</p>
                <p className="mt-0.5 text-[12px] text-muted-foreground">{[niceDate(t.occurred_on), t.category, t.supplier, `${fundName(funds, t.fund_id)} fund`].filter(Boolean).join(" · ")}
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
    </Card>
    </>}

    {txOpen && <TxDialog key={editing?.id ?? `new-${recordFundId ?? "any"}`} open={txOpen} onOpenChange={setTxOpen} schemeId={schemeId}
      tx={editing} funds={funds} defaultFundId={recordFundId} lineItems={activeLineItems} onSaved={onChanged} />}

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

    <BudgetHistoryDialog open={!!historyBudget} onOpenChange={(o) => { if (!o) setHistoryBudget(null); }} budget={historyBudget} funds={funds} revisions={revisions}
      onRevert={(revision) => { setHistoryBudget(null); setRevertFrom(revision); }} />

    <ManageFundsDialog open={manageFundsOpen} onOpenChange={setManageFundsOpen} schemeId={schemeId} funds={funds} onChanged={onChanged} />
  </div>;
}
