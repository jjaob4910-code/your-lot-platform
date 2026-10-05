import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { DndContext, KeyboardSensor, MouseSensor, TouchSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, rectSortingStrategy, sortableKeyboardCoordinates, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { UpcomingWidgetBody } from "@/components/calendar-view";
import { CalendarClock, CalendarDays, Check, ChevronRight, Coins, FileCheck2, GripVertical, Landmark, MessageSquare, MoreHorizontal, PiggyBank, Pin, Plus, RotateCcw, Send, Settings2, StickyNote, Wrench } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { RichTextEditor } from "@/components/rich-text";
import { WorkOrderTable, type WorkOrder } from "@/components/work-orders";
import { budgetStartYear, currentFinancialYearStart, type Levy, type FundTx } from "@/lib/fund-balance";
import { currentTaskFor, isRetiredObligation, type ComplianceWidget, type Task } from "@/lib/action-publish";

export type BudgetFund = { id: string; name: string; sort_order: number };

export type WidgetSize = "S" | "M" | "L" | "XL" | "Full";
export type DashboardWidget = { id: string; scheme_id: string; widget_type: string; sort_order: number; user_id?: string | null; size?: string; config?: Json };
export type Notice = { id: string; scheme_id: string; title: string; message: string; pinned: boolean; created_at: string; lot_id: string | null };
export type NoticeComment = { id: string; notice_id: string; scheme_id: string; author_name: string | null; message: string; created_at: string };
export type OvBudget = { id: string; financial_year: string; total_amount: number; budget_fund_totals: { fund_id: string; total: number }[] };
export type OvMeeting = { id: string; meeting_date: string | null; stage?: string | null; notice_sent_at?: string | null; published_at?: string | null; created_at: string };
export type OvPolicy = { id: string; policy_type: string; insurer: string | null; renewal_date: string | null };
export type OvTx = FundTx & { budget_line_item_id?: string | null };

type OvScheme = { address: string; next_agm_date: string | null };
type OvLot = { id: string; lot_number: number; owner_name: string | null; entitlement_percent: number };
type NoteConfig = { html?: string; color?: string };

const money = (n: number) => n.toLocaleString("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 });
const daysUntil = (date: string) => Math.ceil((new Date(date.slice(0, 10) + "T00:00:00").getTime() - new Date(new Date().toDateString()).getTime()) / 86400000);
const niceDate = (value: string) => new Date(value).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
const fyLabel = (start: number) => `${start}/${String(start + 1).slice(2)}`;
const inFy = (iso: string, start: number) => { const d = new Date(iso); const s = d.getMonth() >= 6 ? d.getFullYear() : d.getFullYear() - 1; return s === start; };

// Sizes are columns on a 12-column desktop grid; tablets use two columns and phones one.
const SIZES: WidgetSize[] = ["S", "M", "L", "XL", "Full"];
const SIZE_COLS: Record<WidgetSize, number> = { S: 3, M: 4, L: 6, XL: 8, Full: 12 };
const SIZE_LABEL: Record<WidgetSize, string> = { S: "Small", M: "Medium", L: "Large", XL: "Extra large", Full: "Full width" };
const SIZE_CLASS: Record<WidgetSize, string> = {
  S: "md:col-span-1 lg:col-span-3", M: "md:col-span-1 lg:col-span-4", L: "md:col-span-2 lg:col-span-6",
  XL: "md:col-span-2 lg:col-span-8", Full: "md:col-span-2 lg:col-span-12",
};
const asSize = (s: string | undefined): WidgetSize => (SIZES as string[]).includes(s ?? "") ? s as WidgetSize : "M";

// Older layouts used these names; they map onto the widgets that replaced them.
const LEGACY_TYPES: Record<string, string> = { levies_chart: "levies", obligations: "year_glance" };
const typeOf = (w: DashboardWidget) => LEGACY_TYPES[w.widget_type] ?? w.widget_type;

const WIDGET_CATALOG: Record<string, { label: string; description: string; size: WidgetSize; min: WidgetSize; multiple?: boolean }> = {
  cash: { label: "Current cash", description: "Each fund's balance, matching Finance.", size: "M", min: "S" },
  levies: { label: "Levies", description: "This financial year's levies: paid, owing and overdue.", size: "L", min: "S" },
  budget: { label: "Budget", description: "This year's budget, what's been spent and what's left.", size: "L", min: "S" },
  year_glance: { label: "Year at a glance", description: "Budget, levies, AGM and insurance, worked out from your records.", size: "M", min: "S" },
  next_meeting: { label: "Next meeting", description: "A countdown to your next AGM.", size: "M", min: "S" },
  upcoming: { label: "Upcoming", description: "What's on the calendar in the next two weeks.", size: "M", min: "S" },
  notices: { label: "Notice board", description: "Post updates for owners and take replies.", size: "M", min: "M" },
  work_orders: { label: "Work orders", description: "The latest repair and maintenance requests.", size: "Full", min: "L" },
  notes: { label: "Notes", description: "A private note only you can see. Add as many as you like.", size: "M", min: "S", multiple: true },
};
const STARTER: string[] = ["cash", "levies", "year_glance", "next_meeting", "notices"];

function SortableWidget({ widget, size, customising, isOverlay, children }: { widget: DashboardWidget; size: WidgetSize; customising: boolean; isOverlay?: boolean; children: (grip: ReactNode) => ReactNode }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: widget.id, disabled: !customising });
  const style = { transform: CSS.Translate.toString(transform), transition };
  const grip = customising ? <button type="button" ref={setActivatorNodeRef} {...attributes} {...listeners} aria-label="Drag to move"
    className="-ml-2 grid size-7 shrink-0 cursor-grab touch-none place-items-center rounded-full text-current opacity-60 hover:bg-secondary/60 hover:opacity-100 active:cursor-grabbing"><GripVertical className="size-4" /></button> : null;
  return <div ref={setNodeRef} style={style} data-widget={widget.widget_type} data-size={size}
    className={`relative min-w-0 ${SIZE_CLASS[size]} ${isDragging && !isOverlay ? "opacity-30" : ""}`}>
    {children(grip)}
  </div>;
}

type CardTone = "default" | "primary" | "yellow" | "blue" | "green";

function WidgetCard({ title, icon: Icon, tone = "default", action, grip, menu, resize, customising, children }: {
  title: string; icon: typeof Coins; tone?: CardTone; action?: ReactNode; grip?: ReactNode; menu?: ReactNode; resize?: ReactNode; customising: boolean; children: ReactNode;
}) {
  const dark = tone === "primary";
  const toneClass = dark ? "bg-primary text-primary-foreground" : tone === "yellow" ? "border border-amber-200 bg-amber-50 dark:border-amber-900/50 dark:bg-amber-950/30"
    : tone === "blue" ? "border border-sky-200 bg-sky-50 dark:border-sky-900/50 dark:bg-sky-950/30" : tone === "green" ? "border border-emerald-200 bg-emerald-50 dark:border-emerald-900/50 dark:bg-emerald-950/30"
    : "border border-border/70 bg-card";
  return <div className={`soft-shadow relative flex h-full flex-col overflow-hidden rounded-3xl ${toneClass} ${customising ? "ring-1 ring-dashed ring-primary/30" : ""}`}>
    <div className={`flex items-center justify-between gap-3 border-b px-6 py-4 ${dark ? "border-primary-foreground/15" : "border-border/60"}`}>
      <div className={`flex min-w-0 items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] ${dark ? "text-primary-foreground/60" : "text-muted-foreground"}`}>
        {grip}<Icon className="size-3.5 shrink-0" /><span className="truncate">{title}</span>
      </div>
      <div className="flex shrink-0 items-center gap-1">{action}{menu}</div>
    </div>
    <div className="min-w-0 flex-1 p-6">{children}</div>
    {resize}
  </div>;
}

function CashWidgetBody({ funds, balances, goTo }: { funds: BudgetFund[]; balances: Record<string, number>; goTo: (s: string) => void }) {
  const total = funds.reduce((s, f) => s + (balances[f.id] ?? 0), 0);
  return <div>
    <p className={`font-display text-4xl font-medium tracking-[-0.03em] ${total < 0 ? "text-destructive" : ""}`}>{money(total)}</p>
    <p className="mt-1 text-[12px] text-muted-foreground">Across your funds today, as recorded in Finance</p>
    <div className="mt-5 space-y-2 text-[13px]">
      {funds.map(f => { const b = balances[f.id] ?? 0; return <div key={f.id} className="flex justify-between gap-3 border-t border-border/60 pt-2 first:border-0 first:pt-0">
        <span className="truncate text-muted-foreground">{f.name}</span><span className={`font-medium tabular-nums ${b < 0 ? "text-destructive" : ""}`}>{money(b)}{b < 0 ? " overdrawn" : ""}</span>
      </div>; })}
    </div>
  </div>;
}

function NextMeetingWidgetBody({ scheme, goTo }: { scheme: OvScheme | null; goTo: (s: string) => void }) {
  const days = scheme?.next_agm_date ? daysUntil(scheme.next_agm_date) : null;
  return <div>
    <p className="font-display text-4xl font-medium tracking-[-0.03em]">{days === null ? "—" : days < 0 ? `${Math.abs(days)}d overdue` : `${days} days`}</p>
    <p className="mt-1 text-[12px] text-muted-foreground">{scheme?.next_agm_date ? `Next AGM · ${niceDate(scheme.next_agm_date)}` : "No AGM date set yet"}</p>
  </div>;
}

function NoticesWidgetBody({ notices, noticeComments, schemeId, isCommittee, onChanged }: {
  notices: Notice[]; noticeComments: NoticeComment[]; schemeId?: string | undefined; isCommittee: boolean; onChanged: () => void;
}) {
  const [postOpen, setPostOpen] = useState(false);
  const [viewing, setViewing] = useState<Notice | null>(null);
  const sorted = notices.slice().sort((a, b) => (Number(b.pinned) - Number(a.pinned)) || b.created_at.localeCompare(a.created_at));
  const commentsFor = (id: string) => noticeComments.filter(c => c.notice_id === id);

  const postNotice = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!schemeId) return;
    const form = new FormData(e.currentTarget);
    const { error } = await supabase.from("notices").insert({
      scheme_id: schemeId, title: String(form.get("title") ?? ""), message: String(form.get("message") ?? ""),
      pinned: form.get("pinned") === "on",
    });
    if (error) { toast("Could not post that", { description: error.message }); return; }
    setPostOpen(false); onChanged(); toast("Notice posted");
  };

  const addComment = async (e: FormEvent<HTMLFormElement>, notice: Notice) => {
    e.preventDefault();
    const formEl = e.currentTarget; // capture before the await — React nulls the event's currentTarget once the handler returns
    if (!schemeId) return;
    const form = new FormData(formEl);
    const message = String(form.get("message") ?? "").trim();
    if (message === "") return;
    const { error } = await supabase.from("notice_comments").insert({
      notice_id: notice.id, scheme_id: schemeId,
      author_name: String(form.get("author_name") ?? "").trim() || null, message,
    });
    if (error) { toast("Could not post your reply", { description: error.message }); return; }
    formEl.reset();
    onChanged();
  };

  return <div>
    {isCommittee && <Dialog open={postOpen} onOpenChange={setPostOpen}>
      <DialogTrigger asChild><Button size="sm" variant="outline" className="rounded-full"><Plus className="size-3.5" />Post a notice</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle className="font-display tracking-[-0.02em]">Post a notice</DialogTitle><DialogDescription>Visible to every owner on the dashboard.</DialogDescription></DialogHeader>
        <form onSubmit={postNotice} className="space-y-4">
          <div className="space-y-2"><Label htmlFor="notice_title">Title</Label><Input id="notice_title" name="title" required autoFocus /></div>
          <div className="space-y-2"><Label htmlFor="notice_message">Message</Label><Textarea id="notice_message" name="message" rows={4} required /></div>
          <label className="flex items-center gap-2 text-[13px] text-foreground"><input type="checkbox" name="pinned" className="size-4 rounded border-border" />Pin to the top</label>
          <div className="flex justify-end gap-2 pt-2"><Button type="button" variant="ghost" className="rounded-full" onClick={() => setPostOpen(false)}>Cancel</Button><Button type="submit" className="rounded-full">Post</Button></div>
        </form>
      </DialogContent>
    </Dialog>}
    <div className="mt-4 space-y-3">
      {sorted.slice(0, 4).map(n => <button key={n.id} type="button" onClick={() => setViewing(n)} className="block w-full rounded-2xl border border-border/70 p-3 text-left hover:bg-secondary/40">
        <div className="flex items-center gap-2">
          {n.pinned && <Pin className="size-3 text-primary" />}
          <p className="truncate text-[13px] font-medium">{n.title}</p>
        </div>
        <p className="mt-1 truncate text-[12px] text-muted-foreground">{n.message}</p>
        <p className="mt-1 text-[11px] text-muted-foreground/70">{niceDate(n.created_at)} · {commentsFor(n.id).length} repl{commentsFor(n.id).length === 1 ? "y" : "ies"}</p>
      </button>)}
      {sorted.length === 0 && <p className="py-6 text-center text-[13px] text-muted-foreground">No notices yet.</p>}
    </div>
    <Dialog open={!!viewing} onOpenChange={o => { if (!o) setViewing(null); }}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        {viewing && <>
          <DialogHeader><DialogTitle className="font-display tracking-[-0.02em]">{viewing.title}</DialogTitle><DialogDescription>{niceDate(viewing.created_at)}</DialogDescription></DialogHeader>
          <p className="whitespace-pre-wrap text-[13px] leading-6">{viewing.message}</p>
          <div className="mt-4 space-y-3 border-t border-border/60 pt-4">
            {commentsFor(viewing.id).map(c => <div key={c.id} className="rounded-xl bg-secondary/40 p-3 text-[13px]">
              <p className="font-medium">{c.author_name || "Owner"}</p>
              <p className="mt-1 text-muted-foreground">{c.message}</p>
            </div>)}
            {commentsFor(viewing.id).length === 0 && <p className="text-[12px] text-muted-foreground">No replies yet.</p>}
          </div>
          <form onSubmit={e => { void addComment(e, viewing); }} className="mt-3 space-y-2">
            <Input name="author_name" placeholder="Your name (optional)" />
            <div className="flex gap-2"><Textarea name="message" rows={2} placeholder="Write a reply" required className="flex-1" /><Button type="submit" size="icon" className="shrink-0 rounded-full"><Send className="size-4" /></Button></div>
          </form>
        </>}
      </DialogContent>
    </Dialog>
  </div>;
}

function fyLevies(levies: Levy[], fy: number) {
  return levies.filter(l => l.status !== "Void" && (l.budgets?.financial_year ? budgetStartYear(l.budgets.financial_year) === fy : inFy(l.due_date, fy)));
}

function LeviesWidgetBody({ levies, mine, goTo }: { levies: Levy[]; mine: boolean; goTo: (s: string) => void }) {
  const fy = currentFinancialYearStart();
  const list = fyLevies(levies, fy);
  const issued = list.reduce((s, l) => s + Number(l.amount), 0);
  const paid = list.filter(l => l.status === "Paid").reduce((s, l) => s + Number(l.amount), 0);
  const owingList = list.filter(l => l.status !== "Paid");
  const overdue = owingList.filter(l => daysUntil(l.due_date) < 0);
  const pct = issued > 0 ? Math.round((paid / issued) * 100) : 0;
  if (list.length === 0) return <div>
    <p className="text-[13px] text-muted-foreground">{mine ? `No levies issued to your lot for ${fyLabel(fy)} yet.` : `No levies issued for ${fyLabel(fy)} yet.`}</p>
  </div>;
  return <div>
    <p className="text-[12px] text-muted-foreground">{mine ? "Your levies" : "Levies"} for {fyLabel(fy)}</p>
    <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
      <p className="font-display text-3xl font-medium tracking-[-0.03em]">{money(paid)}</p>
      <p className="text-[13px] text-muted-foreground">paid of {money(issued)}</p>
    </div>
    <div className="mt-3 h-2 overflow-hidden rounded-full bg-secondary" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Levies paid">
      <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
    </div>
    <div className="mt-4 grid grid-cols-3 gap-2 text-[12px]">
      <div><p className="text-muted-foreground">Paid</p><p className="font-medium tabular-nums">{list.length - owingList.length} of {list.length}</p></div>
      <div><p className="text-muted-foreground">Owing</p><p className="font-medium tabular-nums">{money(issued - paid)}</p></div>
      <div><p className="text-muted-foreground">Overdue</p><p className={`font-medium tabular-nums ${overdue.length ? "text-destructive" : ""}`}>{overdue.length}</p></div>
    </div>
    {owingList.length > 0 && <ul className="mt-4 space-y-1.5 border-t border-border/60 pt-3 text-[12px]">
      {owingList.slice().sort((a, b) => a.due_date.localeCompare(b.due_date)).slice(0, 4).map(l => { const left = daysUntil(l.due_date); return <li key={l.id} className="flex justify-between gap-3">
        <span className="truncate">{mine ? (l.label || "Levy") : `Lot ${l.lots?.lot_number ?? "?"}${l.label ? ` · ${l.label}` : ""}`}</span>
        <span className={`shrink-0 tabular-nums ${left < 0 ? "text-destructive" : "text-muted-foreground"}`}>{money(Number(l.amount))} · {left < 0 ? `${-left}d overdue` : `due ${niceDate(l.due_date)}`}</span>
      </li>; })}
      {owingList.length > 4 && <li className="text-muted-foreground">and {owingList.length - 4} more</li>}
    </ul>}
  </div>;
}

function BudgetWidgetBody({ budgets, funds, transactions, goTo }: { budgets: OvBudget[]; funds: BudgetFund[]; transactions: OvTx[]; goTo: (s: string) => void }) {
  const fy = currentFinancialYearStart();
  const budget = budgets.find(b => budgetStartYear(b.financial_year) === fy);
  if (!budget) return <div>
    <p className="text-[13px] text-muted-foreground">No budget yet for {fyLabel(fy)}.</p>
    <Button size="sm" variant="outline" className="mt-3 rounded-full" onClick={() => goTo("Finance/Budget")}>Set the budget <ChevronRight className="size-3.5" /></Button>
  </div>;
  const spentBy: Record<string, number> = {};
  for (const t of transactions) if (t.direction === "out" && t.status === "Paid" && inFy(t.occurred_on, fy)) spentBy[t.fund_id] = (spentBy[t.fund_id] ?? 0) + Number(t.amount);
  const spent = Object.values(spentBy).reduce((a, b) => a + b, 0);
  const total = Number(budget.total_amount);
  const left = total - spent;
  return <div>
    <p className="text-[12px] text-muted-foreground">Budget {budget.financial_year}</p>
    <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
      <p className={`font-display text-3xl font-medium tracking-[-0.03em] ${left < 0 ? "text-destructive" : ""}`}>{money(left)}</p>
      <p className="text-[13px] text-muted-foreground">{left < 0 ? "over" : "left"} of {money(total)} · {money(spent)} spent</p>
    </div>
    <div className="mt-4 space-y-3 text-[12px]">
      {funds.map(f => {
        const planned = Number(budget.budget_fund_totals.find(t => t.fund_id === f.id)?.total ?? 0);
        const used = spentBy[f.id] ?? 0;
        if (!planned && !used) return null;
        const pct = planned > 0 ? Math.min(100, Math.round((used / planned) * 100)) : 100;
        const over = used > planned;
        return <div key={f.id}>
          <div className="flex justify-between gap-3"><span className="truncate text-muted-foreground">{f.name}</span><span className={`shrink-0 tabular-nums ${over ? "text-destructive" : ""}`}>{money(used)} of {money(planned)}</span></div>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-secondary"><div className={`h-full rounded-full ${over ? "bg-destructive" : "bg-primary"}`} style={{ width: `${pct}%` }} /></div>
        </div>;
      })}
    </div>
  </div>;
}

type GlanceItem = { label: string; done: boolean; note: string; urgent: boolean; tab: string };

function yearGlance({ budgets, levies, meetings, policies, scheme, agmTask }: { budgets: OvBudget[]; levies: Levy[]; meetings: OvMeeting[]; policies: OvPolicy[]; scheme: OvScheme | null; agmTask: Task | undefined }): GlanceItem[] {
  const fy = currentFinancialYearStart();
  const budget = budgets.find(b => budgetStartYear(b.financial_year) === fy);
  const list = fyLevies(levies, fy);
  // Levies paid before the app could send them still count as issued.
  const sent = list.filter(l => l.notified_at || l.status === "Paid").length;
  const meeting = meetings.find(m => inFy(m.meeting_date ?? m.created_at, fy));
  const stage = meeting?.stage ?? "Draft";
  const agmDue = meeting?.meeting_date ?? scheme?.next_agm_date ?? agmTask?.due_date ?? null;
  const agmLeft = agmDue ? daysUntil(agmDue) : null;
  const dueNote = (left: number | null, fallback: string) => left === null ? fallback : left < 0 ? `${-left} days overdue` : `${left} days left`;
  const today = new Date().toISOString().slice(0, 10);
  const current = policies.filter(p => p.renewal_date && p.renewal_date >= today).sort((a, b) => (a.renewal_date ?? "").localeCompare(b.renewal_date ?? ""));
  const nextRenewal = current[0]?.renewal_date ?? null;
  const renewLeft = nextRenewal ? daysUntil(nextRenewal) : null;
  return [
    { label: `Budget set for ${fyLabel(fy)}`, done: !!budget, note: budget ? `${money(Number(budget.total_amount))}` : "Not set yet", urgent: !budget, tab: "Finance/Budget" },
    { label: "Levies issued", done: list.length > 0 && sent === list.length, note: list.length === 0 ? "None issued yet" : `${sent} of ${list.length} lots`, urgent: false, tab: "Finance/Levies" },
    { label: "AGM notice sent", done: stage !== "Draft" || agmTask?.status === "Complete", note: stage !== "Draft" ? "Sent" : dueNote(agmLeft, "No date yet"), urgent: stage === "Draft" && agmLeft !== null && agmLeft < 21, tab: "AGM" },
    { label: "AGM minutes published", done: stage === "Published", note: stage === "Published" ? "Published" : stage === "Minutes" ? "Minutes in progress" : "After the meeting", urgent: false, tab: "AGM" },
    { label: "Insurance current", done: current.length > 0 && (renewLeft ?? 99) >= 30, note: policies.length === 0 ? "No policy recorded" : current.length === 0 ? "Policy has lapsed" : `Renews ${niceDate(nextRenewal!)}`, urgent: policies.length > 0 && (current.length === 0 || (renewLeft ?? 99) < 30), tab: "Insurance" },
  ];
}

function YearGlanceWidgetBody({ items, goTo }: { items: GlanceItem[]; goTo: (s: string) => void }) {
  return <div>{items.map(it => <button type="button" key={it.label} onClick={() => goTo(it.tab)}
    className="flex w-full items-start gap-3 border-t border-primary-foreground/15 py-3 text-left first:border-0 first:pt-0 hover:opacity-80">
    <span className={`mt-0.5 grid size-4 shrink-0 place-items-center rounded-full border ${it.done ? "border-primary-foreground bg-primary-foreground text-primary" : "border-primary-foreground/40"}`}>{it.done && <Check className="size-2.5" />}</span>
    <span className="min-w-0 flex-1">
      <span className={`block text-[13px] ${it.done ? "text-primary-foreground/60" : "text-primary-foreground/90"}`}>{it.label}</span>
      <span className={`block text-[11px] ${it.urgent ? "font-medium text-primary-foreground" : "text-primary-foreground/50"}`}>{it.note}</span>
    </span>
    <ChevronRight className="mt-0.5 size-3.5 shrink-0 text-primary-foreground/40" />
  </button>)}</div>;
}

function NotesWidgetBody({ widget, onSave }: { widget: DashboardWidget; onSave: (config: NoteConfig) => void }) {
  const cfg = (widget.config ?? {}) as NoteConfig;
  const [html, setHtml] = useState(cfg.html ?? "");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef(html);
  const change = (v: string) => {
    setHtml(v); latest.current = v;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => onSave({ ...cfg, html: v }), 800);
  };
  useEffect(() => () => { if (timer.current) { clearTimeout(timer.current); onSave({ ...cfg, html: latest.current }); } },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []);
  return <div className="-mx-3 -my-2"><RichTextEditor value={html} onChange={change} placeholder="Jot something down. Only you can see this." ariaLabel="Note" minHeight={80} /></div>;
}

function WorkOrdersWidgetBody({ repairs, goTo }: { repairs: WorkOrder[]; goTo: (s: string) => void }) {
  return <div className="-m-6"><WorkOrderTable orders={repairs.slice(0, 5)} onOpen={() => goTo("Work orders")} /></div>;
}

// Drag the corner to resize: the widget snaps live to the nearest size as you move.
function ResizeHandle({ size, min, gridRef, onPreview, onCommit, onCancel }: {
  size: WidgetSize; min: WidgetSize; gridRef: React.RefObject<HTMLDivElement | null>;
  onPreview: (s: WidgetSize) => void; onCommit: (s: WidgetSize) => void; onCancel: () => void;
}) {
  const start = (e: React.PointerEvent) => {
    e.preventDefault(); e.stopPropagation();
    const grid = gridRef.current; if (!grid) return;
    const colWidth = grid.getBoundingClientRect().width / 12;
    const x0 = e.clientX; const cols0 = SIZE_COLS[size];
    const allowed = SIZES.filter(s => SIZE_COLS[s] >= SIZE_COLS[min]);
    let current = size;
    const move = (ev: PointerEvent) => {
      const want = cols0 + (ev.clientX - x0) / colWidth;
      const next = allowed.reduce((best, s) => Math.abs(SIZE_COLS[s] - want) < Math.abs(SIZE_COLS[best] - want) ? s : best, allowed[0]!);
      if (next !== current) { current = next; onPreview(next); }
    };
    const end = () => { cleanup(); if (current !== size) onCommit(current); };
    const key = (ev: KeyboardEvent) => { if (ev.key === "Escape") { cleanup(); onCancel(); } };
    const cleanup = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", end); window.removeEventListener("keydown", key); };
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", end); window.addEventListener("keydown", key);
  };
  return <button type="button" aria-label="Drag to resize" onPointerDown={start}
    className="absolute bottom-1.5 right-1.5 hidden size-6 cursor-se-resize touch-none place-items-center rounded-md text-muted-foreground hover:bg-secondary lg:grid">
    <svg viewBox="0 0 10 10" className="size-3" aria-hidden><path d="M9 1 1 9M9 5 5 9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /></svg>
  </button>;
}

type Slot = { id: string; type: string; size: WidgetSize; config: Json; row: DashboardWidget };

export function OverviewSection({ scheme, levies, funds, transactions, balances, budgets, meetings, policies, tasks, complianceWidgets, repairs, myLot, notices, noticeComments, widgets, widgetsLoading, isCommittee, schemeId, userId, onChanged, goTo }: {
  scheme: OvScheme | null; levies: Levy[]; funds: BudgetFund[]; transactions: OvTx[]; balances: Record<string, number>; budgets: OvBudget[]; meetings: OvMeeting[]; policies: OvPolicy[];
  tasks: Task[]; complianceWidgets: ComplianceWidget[]; repairs: WorkOrder[];
  myLot: OvLot | null; notices: Notice[]; noticeComments: NoticeComment[]; widgets: DashboardWidget[]; widgetsLoading: boolean;
  isCommittee: boolean; schemeId?: string | undefined; userId?: string | undefined; onChanged: () => void; goTo: (s: string) => void;
}) {
  const [addOpen, setAddOpen] = useState(false);
  const [customising, setCustomising] = useState(false);
  const [local, setLocal] = useState<Slot[] | null>(null);
  const snapshot = useRef<Slot[] | null>(null);
  const seeded = useRef(false);
  const [seedFailed, setSeedFailed] = useState(false);
  const gridRef = useRef<HTMLDivElement | null>(null);
  const canCustomise = !!userId || isCommittee;

  // Each person has their own layout; rows without a user are the scheme's default,
  // copied for someone the first time they open the dashboard.
  const defaults = widgets.filter(w => !w.user_id);
  // If a personal copy can't be saved, fall back to showing the default layout.
  const personalUser = userId && !seedFailed ? userId : null;
  const mine = userId && !seedFailed ? widgets.filter(w => w.user_id === userId) : defaults;
  const fromRows: Slot[] = useMemo(() => mine.slice().sort((a, b) => a.sort_order - b.sort_order)
    .filter(w => WIDGET_CATALOG[typeOf(w)])
    .map(w => ({ id: w.id, type: typeOf(w), size: asSize(w.size), config: w.config ?? {}, row: w })),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [JSON.stringify(mine.map(w => [w.id, w.sort_order, w.size, w.widget_type]))]);
  const slots = local ?? fromRows;
  useEffect(() => { setLocal(null); }, [fromRows]);

  useEffect(() => {
    if (!schemeId || seeded.current || widgetsLoading || mine.length > 0) return;
    if (!userId && !isCommittee) return;
    seeded.current = true;
    const source = defaults.length ? defaults.slice().sort((a, b) => a.sort_order - b.sort_order).filter(w => WIDGET_CATALOG[typeOf(w)])
      .map(w => ({ widget_type: typeOf(w), size: asSize(w.size), config: w.config ?? {} }))
      : STARTER.map(t => ({ widget_type: t, size: WIDGET_CATALOG[t]!.size, config: {} }));
    void supabase.from("dashboard_widgets").insert(source.map((s, i) => ({ ...s, scheme_id: schemeId, user_id: userId ?? null, sort_order: i })))
      .then(({ error }) => {
        if (!error) { onChanged(); return; }
        setSeedFailed(true);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schemeId, userId, widgetsLoading, mine.length]);

  // Shown once per session, committee only: owners can't change the shared layout anyway.
  useEffect(() => {
    if (!seedFailed || !isCommittee) return;
    try { if (sessionStorage.getItem("loty-shared-layout-note") === "1") return; sessionStorage.setItem("loty-shared-layout-note", "1"); } catch { /* storage unavailable */ }
    toast("Your dashboard is using the shared layout for now", { description: "Changes you make apply to everyone." });
  }, [seedFailed, isCommittee]);

  const visibleNotices = isCommittee ? notices : notices.filter(n => !n.lot_id || n.lot_id === myLot?.id);
  const myLevies = isCommittee ? levies : levies.filter(l => l.lot_id === myLot?.id);
  const agmWidget = complianceWidgets.find(w => w.is_standard && w.enabled && w.standard_key === "agm_notice" && !isRetiredObligation(w.standard_key));
  const glance = yearGlance({ budgets, levies, meetings, policies, scheme, agmTask: agmWidget ? currentTaskFor(agmWidget, tasks) : undefined });

  const present = new Set(slots.map(s => s.type));
  const available = Object.keys(WIDGET_CATALOG).filter(k => WIDGET_CATALOG[k]!.multiple || !present.has(k))
    .filter(k => isCommittee || !["notices"].includes(k) || present.has(k));

  // Writes only what differs from what's saved, then refreshes.
  const persist = async (next: Slot[], before: Slot[]) => {
    const prev = new Map(before.map(s => [s.id, s]));
    const updates = next.map((s, i) => ({ s, i })).filter(({ s, i }) => { const p = prev.get(s.id); return !p || s.row.sort_order !== i || p.size !== s.size; })
      .map(({ s, i }) => supabase.from("dashboard_widgets").update({ sort_order: i, size: s.size }).eq("id", s.id));
    const results = await Promise.all(updates);
    const failed = results.find(r => r.error);
    if (failed?.error) toast("Could not save your layout", { description: failed.error.message });
    onChanged();
  };
  const apply = (next: Slot[], message: string) => {
    const before = slots;
    setLocal(next);
    void persist(next, before);
    toast(message, { action: { label: "Undo", onClick: () => { setLocal(before); void persist(before, next); } } });
  };

  const addWidget = async (type: string) => {
    if (!schemeId) return;
    const cfg = WIDGET_CATALOG[type]!;
    const { error } = await supabase.from("dashboard_widgets").insert({ scheme_id: schemeId, user_id: personalUser, widget_type: type, size: cfg.size, sort_order: slots.length, config: {} });
    if (error) { toast("Could not add that", { description: error.message }); return; }
    onChanged(); toast(`Added ${cfg.label}`);
  };
  const reinsert = async (s: Slot, index: number) => {
    if (!schemeId) return;
    await supabase.from("dashboard_widgets").insert({ scheme_id: schemeId, user_id: personalUser, widget_type: s.type, size: s.size, sort_order: index, config: s.config });
  };
  const removeWidget = async (s: Slot) => {
    const index = slots.findIndex(x => x.id === s.id);
    setLocal(slots.filter(x => x.id !== s.id));
    const { error } = await supabase.from("dashboard_widgets").delete().eq("id", s.id);
    if (error) { toast("Could not remove that", { description: error.message }); setLocal(null); return; }
    onChanged();
    toast(`Removed ${WIDGET_CATALOG[s.type]?.label ?? "widget"}`, { action: { label: "Undo", onClick: () => { void reinsert(s, index).then(onChanged); } } });
  };
  const setSize = (s: Slot, size: WidgetSize) => {
    if (s.size === size) return;
    apply(slots.map(x => x.id === s.id ? { ...x, size } : x), `${WIDGET_CATALOG[s.type]?.label} is now ${SIZE_LABEL[size].toLowerCase()}`);
  };
  const saveConfig = async (s: Slot, config: NoteConfig) => {
    const { error } = await supabase.from("dashboard_widgets").update({ config: config as Json }).eq("id", s.id);
    if (error) toast("Could not save your note", { description: error.message });
  };

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const onDragEnd = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return;
    const from = slots.findIndex(s => s.id === e.active.id);
    const to = slots.findIndex(s => s.id === e.over!.id);
    if (from < 0 || to < 0) return;
    apply(arrayMove(slots, from, to), "Moved");
  };

  const startCustomising = () => { snapshot.current = slots; setCustomising(true); };
  const done = () => { snapshot.current = null; setCustomising(false); };
  const cancel = async () => {
    const snap = snapshot.current; setCustomising(false); snapshot.current = null;
    if (!snap) return;
    const now = new Set(slots.map(s => s.id));
    const was = new Set(snap.map(s => s.id));
    setLocal(snap.filter(s => now.has(s.id)));
    await Promise.all([
      ...slots.filter(s => !was.has(s.id)).map(s => supabase.from("dashboard_widgets").delete().eq("id", s.id)),
      ...snap.map((s, i) => now.has(s.id) ? supabase.from("dashboard_widgets").update({ sort_order: i, size: s.size }).eq("id", s.id) : reinsert(s, i)),
    ]);
    onChanged();
  };
  const resetToDefault = async () => {
    if (!personalUser) return;
    const { error } = await supabase.from("dashboard_widgets").delete().eq("user_id", personalUser);
    if (error) { toast("Could not reset", { description: error.message }); return; }
    seeded.current = false; snapshot.current = null; setCustomising(false); setLocal(null); onChanged();
    toast("Your dashboard is back to the default layout");
  };

  const linkBtn = (label: string, target: string) => <Button size="sm" variant="ghost" className="h-7 rounded-full px-3 text-[11px]" onClick={() => goTo(target)}>{label} <ChevronRight className="size-3.5" /></Button>;

  const render = (s: Slot, grip: ReactNode) => {
    const cfg = WIDGET_CATALOG[s.type]!;
    const note = (s.config ?? {}) as NoteConfig;
    const tone: CardTone = s.type === "year_glance" ? "primary" : s.type === "notes" && note.color && ["yellow", "blue", "green"].includes(note.color) ? note.color as CardTone : "default";
    const menu = canCustomise ? <DropdownMenu>
      <DropdownMenuTrigger asChild><button type="button" aria-label={`${cfg.label} options`} className={`grid size-7 place-items-center rounded-full ${tone === "primary" ? "text-primary-foreground/60 hover:bg-primary-foreground/10" : "text-muted-foreground hover:bg-secondary"}`}><MoreHorizontal className="size-4" /></button></DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel className="text-[11px] text-muted-foreground">Size</DropdownMenuLabel>
        {SIZES.filter(z => SIZE_COLS[z] >= SIZE_COLS[cfg.min]).map(z => <DropdownMenuItem key={z} onSelect={() => setSize(s, z)}>
          <span className="w-4">{s.size === z && <Check className="size-3.5" />}</span>{SIZE_LABEL[z]}
        </DropdownMenuItem>)}
        {s.type === "notes" && <>
          <DropdownMenuSeparator /><DropdownMenuLabel className="text-[11px] text-muted-foreground">Colour</DropdownMenuLabel>
          {(["default", "yellow", "blue", "green"] as const).map(c => <DropdownMenuItem key={c} onSelect={() => { const config = { ...note, color: c }; setLocal(slots.map(x => x.id === s.id ? { ...x, config } : x)); void saveConfig(s, config).then(onChanged); }}>
            <span className="w-4">{(note.color ?? "default") === c && <Check className="size-3.5" />}</span>{c === "default" ? "Plain" : c[0]!.toUpperCase() + c.slice(1)}
          </DropdownMenuItem>)}
        </>}
        <DropdownMenuSeparator />
        <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={() => void removeWidget(s)}>Remove from dashboard</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu> : null;
    const resize = customising ? <ResizeHandle size={s.size} min={cfg.min} gridRef={gridRef}
      onPreview={z => setLocal(slots.map(x => x.id === s.id ? { ...x, size: z } : x))}
      onCommit={z => apply(slots.map(x => x.id === s.id ? { ...x, size: z } : x), `${cfg.label} is now ${SIZE_LABEL[z].toLowerCase()}`)}
      onCancel={() => setLocal(null)} /> : null;
    const shell = { grip, menu, resize, customising, tone };
    switch (s.type) {
      case "cash": return <WidgetCard {...shell} title="Current cash" icon={Coins} action={linkBtn("Cashflow", "Finance/Cashflow")}><CashWidgetBody funds={funds} balances={balances} goTo={goTo} /></WidgetCard>;
      case "levies": return <WidgetCard {...shell} title={isCommittee ? "Levies" : "Your levies"} icon={Landmark} action={linkBtn("Levies", "Finance/Levies")}><LeviesWidgetBody levies={myLevies} mine={!isCommittee} goTo={goTo} /></WidgetCard>;
      case "budget": return <WidgetCard {...shell} title="Budget" icon={PiggyBank} action={linkBtn("Budget", "Finance/Budget")}><BudgetWidgetBody budgets={budgets} funds={funds} transactions={transactions} goTo={goTo} /></WidgetCard>;
      case "year_glance": return <WidgetCard {...shell} title="Year at a glance" icon={FileCheck2} action={<span className="font-display text-lg text-primary-foreground">{glance.filter(g => g.done).length}/{glance.length}</span>}><YearGlanceWidgetBody items={glance} goTo={goTo} /></WidgetCard>;
      case "next_meeting": return <WidgetCard {...shell} title="Next meeting" icon={CalendarClock} action={linkBtn("Calendar", "Calendar")}><NextMeetingWidgetBody scheme={scheme} goTo={goTo} /></WidgetCard>;
      case "upcoming": return <WidgetCard {...shell} title="Upcoming" icon={CalendarDays} action={linkBtn("Calendar", "Calendar")}><UpcomingWidgetBody scheme={scheme} tasks={tasks} widgets={complianceWidgets} levies={levies} orders={repairs} goTo={goTo} /></WidgetCard>;
      case "notices": return <WidgetCard {...shell} title="Notice board" icon={MessageSquare}><NoticesWidgetBody notices={visibleNotices} noticeComments={noticeComments} schemeId={schemeId} isCommittee={isCommittee} onChanged={onChanged} /></WidgetCard>;
      case "work_orders": return <WidgetCard {...shell} title="Work orders" icon={Wrench} action={linkBtn("Open", "Work orders")}><WorkOrdersWidgetBody repairs={repairs} goTo={goTo} /></WidgetCard>;
      case "notes": return <WidgetCard {...shell} title="Note" icon={StickyNote}><NotesWidgetBody widget={s.row} onSave={config => void saveConfig(s, config)} /></WidgetCard>;
      default: return null;
    }
  };

  return <>
    <div className="max-w-2xl">
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">{scheme ? scheme.address : "Your building"}</p>
      <h1 className="mt-4 text-4xl font-medium leading-[1.02] tracking-[-0.04em] sm:text-6xl">Hi there, Here's what's happening.</h1>
    </div>

    {canCustomise && <div className="mt-6 flex flex-wrap items-center gap-2">
      {!customising
        ? <Button variant="outline" size="sm" className="rounded-full" onClick={startCustomising}><Settings2 className="size-3.5" />Customise</Button>
        : <>
          <Button size="sm" className="rounded-full" onClick={done}>Done</Button>
          <Button variant="ghost" size="sm" className="rounded-full" onClick={() => void cancel()}>Cancel</Button>
          <Dialog open={addOpen} onOpenChange={setAddOpen}>
            <DialogTrigger asChild><Button variant="outline" size="sm" className="rounded-full"><Plus className="size-3.5" />Add a widget</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle className="font-display tracking-[-0.02em]">Add a widget</DialogTitle><DialogDescription>Choose another view for your dashboard.</DialogDescription></DialogHeader>
              {available.length === 0
                ? <p className="py-6 text-center text-[13px] text-muted-foreground">Everything is already on your dashboard.</p>
                : <div className="max-h-[60vh] space-y-2 overflow-y-auto">
                    {available.map(key => <button key={key} type="button" onClick={() => { void addWidget(key); setAddOpen(false); }}
                      className="flex w-full items-center justify-between gap-4 rounded-2xl border border-border/70 p-4 text-left hover:bg-secondary/40">
                      <div><p className="text-sm font-medium">{WIDGET_CATALOG[key]?.label}</p><p className="mt-1 text-[12px] text-muted-foreground">{WIDGET_CATALOG[key]?.description}</p></div>
                      <Plus className="size-4 shrink-0 text-muted-foreground" />
                    </button>)}
                  </div>}
            </DialogContent>
          </Dialog>
          {personalUser && <Button variant="ghost" size="sm" className="rounded-full text-muted-foreground" onClick={() => void resetToDefault()}><RotateCcw className="size-3.5" />Reset to default</Button>}
          <p className="w-full text-[11px] text-muted-foreground sm:w-auto">Drag <GripVertical className="inline size-3" /> to move{" "}<span className="hidden lg:inline">· drag a corner to resize</span><span className="lg:hidden">· hold, then drag on a phone</span></p>
        </>}
    </div>}

    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext items={slots.map(s => s.id)} strategy={rectSortingStrategy}>
        <div ref={gridRef} className="mt-6 grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-12">
          {slots.map(s => <SortableWidget key={s.id} widget={s.row} size={s.size} customising={customising}>{grip => render(s, grip)}</SortableWidget>)}
          {slots.length === 0 && !widgetsLoading && <p className="col-span-full rounded-3xl border border-dashed border-border/70 p-10 text-center text-sm text-muted-foreground">Nothing on your dashboard yet.{canCustomise ? " Choose Customise to add a widget." : ""}</p>}
        </div>
      </SortableContext>
    </DndContext>
  </>;
}
