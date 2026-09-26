import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip as ChartTooltip, XAxis, YAxis } from "recharts";
import { Building2, CalendarClock, Check, ChevronRight, Coins, FileCheck2, Landmark, MessageSquare, Pin, Plus, Send, Wrench, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { WorkOrderTable, type WorkOrder } from "@/components/work-orders";
import { computeFundBalances, currentFinancialYearStart, type FundBudget, type Levy, type FundTx } from "@/lib/fund-balance";

export type DashboardWidget = { id: string; scheme_id: string; widget_type: string; sort_order: number };
export type Notice = { id: string; scheme_id: string; title: string; message: string; pinned: boolean; created_at: string };
export type NoticeComment = { id: string; notice_id: string; scheme_id: string; author_name: string | null; message: string; created_at: string };

type OvScheme = { address: string; next_agm_date: string | null };
type OvTask = { id: string; task_name: string; due_date: string; status: string };
type OvLot = { lot_number: number; owner_name: string | null; entitlement_percent: number };
type OvLevy = Levy;

const money = (n: number) => n.toLocaleString("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 });
const daysUntil = (date: string) => Math.ceil((new Date(date + "T00:00:00").getTime() - new Date(new Date().toDateString()).getTime()) / 86400000);
const niceDate = (value: string) => new Date(value).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });

const WIDGET_CATALOG: Record<string, { label: string; description: string; span: string }> = {
  cash: { label: "Current cash", description: "What's sitting in your admin and maintenance funds right now.", span: "lg:col-span-4" },
  next_meeting: { label: "Next meeting", description: "A countdown to your next AGM.", span: "lg:col-span-4" },
  notices: { label: "Notice board", description: "Post updates for owners and take replies.", span: "lg:col-span-4" },
  levies_chart: { label: "Levy payments", description: "The last six months of levies received.", span: "lg:col-span-7" },
  obligations: { label: "Yearly obligations", description: "Your compliance checklist, one tap to complete.", span: "lg:col-span-5" },
  work_orders: { label: "Work orders", description: "The latest repair and maintenance requests.", span: "lg:col-span-12" },
  my_lot: { label: "Your lot", description: "Your own lot details and cost share.", span: "lg:col-span-12" },
};

function WidgetShell({ widget, title, icon: Icon, tone = "default", action, isCommittee, span, dragging, onDragStart, onDragOver, onDrop, onDragEnd, onRemove, children }: {
  widget: DashboardWidget; title: string; icon: typeof Coins; tone?: "default" | "primary"; action?: ReactNode;
  isCommittee: boolean; span: string; dragging: boolean;
  onDragStart: (e: React.DragEvent, id: string) => void; onDragOver: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent, id: string) => void; onDragEnd: () => void; onRemove: (widget: DashboardWidget) => void;
  children: ReactNode;
}) {
  const dark = tone === "primary";
  return <div draggable={isCommittee}
    onDragStart={e => isCommittee && onDragStart(e, widget.id)}
    onDragOver={e => isCommittee && onDragOver(e)}
    onDrop={e => isCommittee && onDrop(e, widget.id)}
    onDragEnd={onDragEnd}
    className={`soft-shadow overflow-hidden rounded-3xl transition ${dark ? "bg-primary text-primary-foreground" : "border border-border/70 bg-card"} ${span} ${dragging ? "opacity-40" : ""} ${isCommittee ? "cursor-grab active:cursor-grabbing" : ""}`}>
    <div className={`flex items-center justify-between gap-3 border-b px-6 py-4 ${dark ? "border-primary-foreground/15" : "border-border/60"}`}>
      <div className={`flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] ${dark ? "text-primary-foreground/60" : "text-muted-foreground"}`}>
        <Icon className="size-3.5" />{title}
      </div>
      <div className="flex items-center gap-2">
        {action}
        {isCommittee && <button type="button" aria-label={`Remove ${title}`}
          className={dark ? "text-primary-foreground/60 hover:text-primary-foreground" : "text-muted-foreground hover:text-destructive"}
          onClick={() => onRemove(widget)}><X className="size-4" /></button>}
      </div>
    </div>
    <div className="p-6">{children}</div>
  </div>;
}

function CashWidgetBody({ levies, budgets, transactions, goTo }: { levies: Levy[]; budgets: FundBudget[]; transactions: FundTx[]; goTo: (s: string) => void }) {
  const { admin, maintenance, total } = computeFundBalances(levies, budgets, transactions, currentFinancialYearStart());
  return <div>
    <p className="font-display text-4xl font-medium tracking-[-0.03em]">{money(total)}</p>
    <p className="mt-1 text-[12px] text-muted-foreground">Across admin and maintenance funds, this financial year</p>
    <div className="mt-5 space-y-2 text-[13px]">
      <div className="flex justify-between border-t border-border/60 pt-2"><span className="text-muted-foreground">Admin fund</span><span className="font-medium tabular-nums">{money(admin)}</span></div>
      <div className="flex justify-between"><span className="text-muted-foreground">Maintenance fund</span><span className="font-medium tabular-nums">{money(maintenance)}</span></div>
    </div>
    <Button size="sm" variant="ghost" className="mt-4 h-7 rounded-full px-3 text-[11px]" onClick={() => goTo("Finance")}>Open Finance <ChevronRight className="size-3.5" /></Button>
  </div>;
}

function NextMeetingWidgetBody({ scheme, goTo }: { scheme: OvScheme | null; goTo: (s: string) => void }) {
  const days = scheme?.next_agm_date ? daysUntil(scheme.next_agm_date) : null;
  return <div>
    <p className="font-display text-4xl font-medium tracking-[-0.03em]">{days === null ? "—" : days < 0 ? `${Math.abs(days)}d overdue` : `${days} days`}</p>
    <p className="mt-1 text-[12px] text-muted-foreground">{scheme?.next_agm_date ? `Next AGM · ${niceDate(scheme.next_agm_date)}` : "No AGM date set yet"}</p>
    <Button size="sm" variant="ghost" className="mt-4 h-7 rounded-full px-3 text-[11px]" onClick={() => goTo("Calendar")}>Open calendar <ChevronRight className="size-3.5" /></Button>
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

function LeviesChartWidgetBody({ levies }: { levies: OvLevy[] }) {
  const months = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - (5 - i));
    const label = d.toLocaleDateString("en-AU", { month: "short" });
    const total = levies.filter(l => l.paid_at && new Date(l.paid_at).getMonth() === d.getMonth() && new Date(l.paid_at).getFullYear() === d.getFullYear())
      .reduce((sum, l) => sum + Number(l.amount), 0);
    return { month: label, received: Math.round(total) };
  });
  return <div className="h-56">
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={months} margin={{ left: -18, right: 8 }}>
        <CartesianGrid vertical={false} stroke="var(--border)" />
        <XAxis dataKey="month" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} />
        <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} />
        <ChartTooltip cursor={{ fill: "var(--secondary)" }} formatter={(value: number) => money(Number(value))} />
        <Bar dataKey="received" fill="var(--primary)" radius={[6, 6, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  </div>;
}

function ObligationsWidgetBody({ tasks, isCommittee, onTaskStatus }: { tasks: OvTask[]; isCommittee: boolean; onTaskStatus: (id: string, status: string) => void }) {
  return <div>{tasks.map(task => {
    const left = daysUntil(task.due_date);
    const done = task.status === "Complete";
    const urgent = !done && left < 14;
    return <div key={task.id} className="flex items-start gap-3 border-t border-primary-foreground/15 py-3.5 first:border-0 first:pt-0">
      <button type="button" disabled={!isCommittee} onClick={() => onTaskStatus(task.id, done ? "In Progress" : "Complete")}
        className={`mt-0.5 grid size-4 shrink-0 place-items-center rounded-full border ${done ? "border-primary-foreground bg-primary-foreground text-primary" : "border-primary-foreground/40"} ${isCommittee ? "cursor-pointer" : "cursor-default"}`}
        aria-label={`Mark ${task.task_name} ${done ? "in progress" : "complete"}`}>{done && <Check className="size-2.5" />}</button>
      <span className="min-w-0 flex-1">
        <span className={`block text-[13px] ${done ? "text-primary-foreground/50 line-through" : "text-primary-foreground/90"}`}>{task.task_name}</span>
        <span className="block text-[11px] text-primary-foreground/50">Due {niceDate(task.due_date)}</span>
      </span>
      <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${done ? "bg-primary-foreground/10 text-primary-foreground/60" : urgent ? "bg-primary-foreground text-primary" : "bg-primary-foreground/10 text-primary-foreground/80"}`}>
        {done ? "Done" : left < 0 ? `${Math.abs(left)} days overdue` : `${left} days left`}
      </span>
    </div>;
  })}
    {tasks.length === 0 && <p className="py-6 text-[13px] text-primary-foreground/60">Nothing recorded yet.</p>}
  </div>;
}

function WorkOrdersWidgetBody({ repairs, goTo }: { repairs: WorkOrder[]; goTo: (s: string) => void }) {
  return <div className="-m-6"><WorkOrderTable orders={repairs.slice(0, 5)} onOpen={() => goTo("Work orders")} /></div>;
}

function MyLotWidgetBody({ myLot }: { myLot: OvLot | null }) {
  return <div>
    <h2 className="text-lg font-medium tracking-[-0.02em]">{myLot ? `Lot ${myLot.lot_number}, ${myLot.owner_name ?? ""}` : "No lot linked to your account yet"}</h2>
    <p className="mt-3 text-[13px] text-muted-foreground">{myLot ? `Your share of costs is ${myLot.entitlement_percent}%.` : "Ask your committee to add your email against your lot, and your levies will appear here."}</p>
  </div>;
}

export function OverviewSection({ scheme, levies, budgets, transactions, tasks, repairs, myLot, notices, noticeComments, widgets, widgetsLoading, isCommittee, schemeId, onTaskStatus, onChanged, goTo }: {
  scheme: OvScheme | null; levies: OvLevy[]; budgets: FundBudget[]; transactions: FundTx[]; tasks: OvTask[]; repairs: WorkOrder[];
  myLot: OvLot | null; notices: Notice[]; noticeComments: NoticeComment[]; widgets: DashboardWidget[]; widgetsLoading: boolean;
  isCommittee: boolean; schemeId?: string | undefined; onTaskStatus: (id: string, status: string) => void; onChanged: () => void; goTo: (s: string) => void;
}) {
  const [dragId, setDragId] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const bootstrapped = useRef(false);

  useEffect(() => {
    if (!schemeId || bootstrapped.current || widgetsLoading || widgets.length > 0) return;
    bootstrapped.current = true;
    void supabase.from("dashboard_widgets").insert([
      { scheme_id: schemeId, widget_type: "cash", sort_order: 0 },
      { scheme_id: schemeId, widget_type: "next_meeting", sort_order: 1 },
      { scheme_id: schemeId, widget_type: "notices", sort_order: 2 },
    ]).then(({ error }) => { if (!error) onChanged(); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schemeId, widgetsLoading, widgets.length]);

  const sorted = widgets.slice().sort((a, b) => a.sort_order - b.sort_order);
  const present = new Set(sorted.map(w => w.widget_type));
  const available = Object.keys(WIDGET_CATALOG).filter(k => !present.has(k));

  const addWidget = async (type: string) => {
    if (!schemeId) return;
    const { error } = await supabase.from("dashboard_widgets").insert({ scheme_id: schemeId, widget_type: type, sort_order: sorted.length });
    if (error) { toast("Could not add that", { description: error.message }); return; }
    onChanged(); toast("Added to your dashboard");
  };
  const removeWidget = async (widget: DashboardWidget) => {
    const { error } = await supabase.from("dashboard_widgets").delete().eq("id", widget.id);
    if (error) { toast("Could not remove that", { description: error.message }); return; }
    onChanged();
  };
  const reorder = async (sourceId: string, targetId: string) => {
    const ordered = sorted.slice();
    const from = ordered.findIndex(w => w.id === sourceId);
    const to = ordered.findIndex(w => w.id === targetId);
    if (from === -1 || to === -1 || from === to) return;
    const [moved] = ordered.splice(from, 1);
    if (!moved) return;
    ordered.splice(to, 0, moved);
    const updates = ordered
      .map((w, i) => ({ w, i }))
      .filter(({ w, i }) => w.sort_order !== i)
      .map(({ w, i }) => supabase.from("dashboard_widgets").update({ sort_order: i }).eq("id", w.id));
    await Promise.all(updates);
    onChanged();
  };

  const onDragStart = (e: React.DragEvent, id: string) => { e.dataTransfer.setData("text/plain", id); setDragId(id); };
  const onDragOver = (e: React.DragEvent) => { e.preventDefault(); };
  const onDrop = (e: React.DragEvent, id: string) => {
    e.preventDefault();
    const source = e.dataTransfer.getData("text/plain") || dragId;
    setDragId(null);
    if (source && source !== id) void reorder(source, id);
  };
  const onDragEnd = () => setDragId(null);

  return <>
    <div className="max-w-2xl">
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">{scheme ? scheme.address : "Your building"}</p>
      <h1 className="mt-4 text-4xl font-medium leading-[1.02] tracking-[-0.04em] sm:text-6xl">Hi there, Here's what's happening.</h1>
    </div>

    {isCommittee && <div className="mt-6 flex flex-wrap items-center gap-3">
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogTrigger asChild><Button variant="outline" size="sm" className="rounded-full" disabled={available.length === 0}><Plus className="size-3.5" />Add a widget</Button></DialogTrigger>
        <DialogContent>
          <DialogHeader><DialogTitle className="font-display tracking-[-0.02em]">Add a widget</DialogTitle><DialogDescription>Choose another view for your dashboard.</DialogDescription></DialogHeader>
          {available.length === 0
            ? <p className="py-6 text-center text-[13px] text-muted-foreground">Everything is already on your dashboard.</p>
            : <div className="space-y-2">
                {available.map(key => <button key={key} type="button" onClick={() => { void addWidget(key); setAddOpen(false); }}
                  className="flex w-full items-center justify-between gap-4 rounded-2xl border border-border/70 p-4 text-left hover:bg-secondary/40">
                  <div><p className="text-sm font-medium">{WIDGET_CATALOG[key]?.label}</p><p className="mt-1 text-[12px] text-muted-foreground">{WIDGET_CATALOG[key]?.description}</p></div>
                  <Plus className="size-4 shrink-0 text-muted-foreground" />
                </button>)}
              </div>}
        </DialogContent>
      </Dialog>
      {sorted.length > 0 && <p className="text-[11px] text-muted-foreground">Drag a widget to reorder it</p>}
    </div>}

    <div className="mt-6 grid gap-5 lg:grid-cols-12">
      {sorted.map(widget => {
        const cfg = WIDGET_CATALOG[widget.widget_type];
        if (!cfg) return null;
        const shared = { widget, isCommittee, span: cfg.span, dragging: dragId === widget.id, onDragStart, onDragOver, onDrop, onDragEnd, onRemove: removeWidget };
        switch (widget.widget_type) {
          case "cash": return <WidgetShell key={widget.id} {...shared} title="Current cash" icon={Coins}><CashWidgetBody levies={levies} budgets={budgets} transactions={transactions} goTo={goTo} /></WidgetShell>;
          case "next_meeting": return <WidgetShell key={widget.id} {...shared} title="Next meeting" icon={CalendarClock}><NextMeetingWidgetBody scheme={scheme} goTo={goTo} /></WidgetShell>;
          case "notices": return <WidgetShell key={widget.id} {...shared} title="Notice board" icon={MessageSquare}><NoticesWidgetBody notices={notices} noticeComments={noticeComments} schemeId={schemeId} isCommittee={isCommittee} onChanged={onChanged} /></WidgetShell>;
          case "levies_chart": return <WidgetShell key={widget.id} {...shared} title="Levy payments" icon={Landmark} action={<Button size="sm" variant="ghost" className="h-7 rounded-full px-3 text-[11px]" onClick={() => goTo("Finance")}>Open <ChevronRight className="size-3.5" /></Button>}><LeviesChartWidgetBody levies={levies} /></WidgetShell>;
          case "obligations": return <WidgetShell key={widget.id} {...shared} title="Yearly obligations" icon={FileCheck2} tone="primary" action={<span className="font-display text-lg text-primary-foreground">{tasks.filter(t => t.status === "Complete").length}/{tasks.length}</span>}><ObligationsWidgetBody tasks={tasks} isCommittee={isCommittee} onTaskStatus={onTaskStatus} /></WidgetShell>;
          case "work_orders": return <WidgetShell key={widget.id} {...shared} title="Work orders" icon={Wrench} action={<Button size="sm" variant="ghost" className="h-7 rounded-full px-3 text-[11px]" onClick={() => goTo("Work orders")}>Open <ChevronRight className="size-3.5" /></Button>}><WorkOrdersWidgetBody repairs={repairs} goTo={goTo} /></WidgetShell>;
          case "my_lot": return <WidgetShell key={widget.id} {...shared} title="Your lot" icon={Building2}><MyLotWidgetBody myLot={myLot} /></WidgetShell>;
          default: return null;
        }
      })}
      {sorted.length === 0 && !widgetsLoading && <p className="col-span-12 rounded-3xl border border-dashed border-border/70 p-10 text-center text-sm text-muted-foreground">Nothing on your dashboard yet.{isCommittee ? " Add a widget to get started." : ""}</p>}
    </div>
  </>;
}
