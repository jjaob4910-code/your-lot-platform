import { useMemo, useState, type DragEvent, type FormEvent, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, ChevronLeft, ChevronRight, List, Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { isRetiredObligation, obligationTab, type ComplianceWidget } from "@/lib/action-publish";

export type CalendarScheme = { id: string; next_agm_date: string | null } | null;
type AgmDateSource = { next_agm_date: string | null } | null;
export type CalendarTask = { id: string; task_name: string; detail: string | null; due_date: string; status: string; widget_id: string | null };
export type CalendarLevy = { id: string; due_date: string; status: string; amount: number };
export type CalendarOrder = { id: string; title: string; status: string; target_date: string | null };

type EventRow = { id: string; title: string; notes: string | null; event_date: string; kind: string };

type Item = {
  key: string;
  date: string;
  title: string;
  detail: string;
  tone: "event" | "reminder" | "compliance" | "levy" | "meeting" | "work";
  movable: boolean;
  goTo?: string;
  eventRow?: EventRow;
  source: string;
};

const toISO = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const parse = (iso: string) => new Date(`${iso}T00:00:00`);
const niceDate = (iso: string) => parse(iso).toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "long", year: "numeric" });
const daysUntil = (iso: string) => Math.ceil((parse(iso).getTime() - new Date(new Date().toDateString()).getTime()) / 86400000);
const whenText = (iso: string) => {
  const d = daysUntil(iso);
  return d === 0 ? "Today" : d < 0 ? `${Math.abs(d)} days ago` : `In ${d} days`;
};

const toneClass: Record<Item["tone"], string> = {
  event: "bg-primary/10 text-primary",
  reminder: "bg-amber-500/15 text-amber-700",
  compliance: "bg-secondary text-foreground",
  levy: "bg-emerald-600/12 text-emerald-700",
  meeting: "bg-primary text-primary-foreground",
  work: "bg-destructive/10 text-destructive",
};

// Everything that lands on the calendar, from every part of the app. Shared by the
// Calendar tab and the dashboard's Upcoming widget so they always agree.
export function buildCalendarItems(scheme: AgmDateSource, tasks: CalendarTask[], widgets: ComplianceWidget[],
  levies: CalendarLevy[], orders: CalendarOrder[], events: EventRow[]): Item[] {
  const list: Item[] = [];
  if (scheme?.next_agm_date) list.push({
    key: `agm`, date: scheme.next_agm_date, title: "Annual general meeting", detail: "Your yearly owners meeting.",
    tone: "meeting", movable: true, goTo: "AGM", source: "Meeting",
  });
  for (const task of tasks) {
    const key = widgets.find(w => w.id === task.widget_id)?.standard_key;
    if (isRetiredObligation(key)) continue;
    const tab = obligationTab(key);
    list.push({
      key: `task-${task.id}`, date: task.due_date, title: task.task_name,
      detail: task.detail ?? `Yearly obligation, currently ${task.status.toLowerCase()}.`,
      tone: "compliance", movable: true, goTo: tab, source: tab,
    });
  }
  const dueDates = [...new Set(levies.filter(l => l.status !== "Paid").map(l => l.due_date))];
  for (const date of dueDates) {
    const owing = levies.filter(l => l.due_date === date && l.status !== "Paid");
    list.push({
      key: `levy-${date}`, date, title: "Levies due",
      detail: `${owing.length} lot${owing.length === 1 ? "" : "s"} still to pay for this instalment.`,
      tone: "levy", movable: false, goTo: "Finance/Levies", source: "Levies",
    });
  }
  for (const order of orders) if (order.target_date && order.status !== "Complete" && order.status !== "Closed") list.push({
    key: `wo-${order.id}`, date: order.target_date, title: order.title,
    detail: `Work order target date, currently ${order.status.toLowerCase()}.`,
    tone: "work", movable: true, goTo: "Work orders", source: "Work order",
  });
  for (const row of events) list.push({
    key: `event-${row.id}`, date: row.event_date, title: row.title,
    detail: row.notes ?? (row.kind === "Reminder" ? "Your reminder." : "Your event."),
    tone: row.kind === "Reminder" ? "reminder" : "event", movable: true, eventRow: row, source: row.kind,
  });
  return list.sort((a, b) => a.date.localeCompare(b.date));
}

const useCalendarEvents = () => useQuery({
  queryKey: ["calendar-events"],
  queryFn: async () => {
    const { data, error } = await supabase.from("calendar_events").select("*").order("event_date");
    if (error) throw error;
    return (data ?? []) as unknown as EventRow[];
  },
});

/** Dashboard widget: the next two weeks, soonest first. Tapping an item opens where it lives. */
export function UpcomingWidgetBody({ scheme, tasks, widgets, levies, orders, goTo }: {
  scheme: AgmDateSource; tasks: CalendarTask[]; widgets: ComplianceWidget[]; levies: CalendarLevy[]; orders: CalendarOrder[];
  goTo: (section: string) => void;
}) {
  const events = useCalendarEvents();
  const items = buildCalendarItems(scheme, tasks, widgets, levies, orders, events.data ?? [])
    .filter(i => { const d = daysUntil(i.date); return d >= 0 && d <= 14; }).slice(0, 6);
  if (items.length === 0) return <p className="py-4 text-[13px] text-muted-foreground">Nothing in the next two weeks.</p>;
  return <ul className="divide-y divide-border/60">
    {items.map(i => <li key={i.key}>
      <button type="button" onClick={() => goTo(i.goTo ?? "Calendar")} className="flex w-full items-center gap-3 py-2.5 text-left hover:opacity-80">
        <span className="w-12 shrink-0 text-center">
          <span className="block text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{parse(i.date).toLocaleDateString("en-AU", { month: "short" })}</span>
          <span className="block font-display text-xl leading-none">{parse(i.date).getDate()}</span>
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-medium">{i.title}</span>
          <span className="block text-[11px] text-muted-foreground">{whenText(i.date)} · {i.source}</span>
        </span>
        <span className={`hidden shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium sm:inline ${toneClass[i.tone]}`}>{i.source}</span>
      </button>
    </li>)}
  </ul>;
}

function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`soft-shadow rounded-3xl border border-border/70 bg-card ${className}`}>{children}</section>;
}

const toneDot: Record<Item["tone"], string> = {
  event: "bg-primary", reminder: "bg-amber-500", compliance: "bg-foreground/60", levy: "bg-emerald-600", meeting: "bg-primary", work: "bg-destructive",
};

// The month grid is unreadable at phone width, so phones get a strip of day numbers with
// coloured dots, and below it the month's entries as a readable list grouped by day.
function PhoneCalendar({ className, cursor, setCursor, days, items, todayISO, onOpen, onAdd }: {
  className: string; cursor: Date; setCursor: (d: Date) => void; days: Date[]; items: Item[]; todayISO: string;
  onOpen: (item: Item) => void; onAdd: (iso: string) => void;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const monthKey = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}`;
  // On the current month, keep the next 30 days in view too, so the end of a month never looks empty.
  const isCurrentMonth = todayISO.startsWith(monthKey);
  const horizon = (() => { const d = new Date(); d.setDate(d.getDate() + 30); return toISO(d); })();
  const monthItems = items.filter(i => i.date.startsWith(monthKey) || (isCurrentMonth && i.date > todayISO && i.date <= horizon));
  const groups = [...new Set(monthItems.map(i => i.date))].map(date => ({ date, items: monthItems.filter(i => i.date === date) }));
  const go = (delta: number) => { setSelected(null); setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + delta, 1)); };
  const pick = (iso: string) => {
    setSelected(iso);
    document.getElementById(`cal-day-${iso}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  const weeks = days.slice(35).every(d => d.getMonth() !== cursor.getMonth()) ? days.slice(0, 35) : days;
  return <div className={`mt-8 space-y-4 ${className}`}>
    <Card className="p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-medium tracking-[-0.02em]">{cursor.toLocaleDateString("en-AU", { month: "long", year: "numeric" })}</h2>
        <div className="flex items-center gap-1">
          <Button size="icon" variant="ghost" className="size-9 rounded-full" aria-label="Previous month" onClick={() => go(-1)}><ChevronLeft/></Button>
          <Button size="sm" variant="ghost" className="h-9 rounded-full px-3 text-[12px]" onClick={() => { const d = new Date(); d.setDate(1); setSelected(null); setCursor(d); }}>Today</Button>
          <Button size="icon" variant="ghost" className="size-9 rounded-full" aria-label="Next month" onClick={() => go(1)}><ChevronRight/></Button>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-7 text-center text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
        {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => <div key={i} className="py-1">{d}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-y-1">
        {weeks.map(day => {
          const iso = toISO(day);
          const inMonth = day.getMonth() === cursor.getMonth();
          const dayItems = inMonth ? items.filter(i => i.date === iso) : [];
          return <button key={iso} type="button" disabled={!inMonth} onClick={() => dayItems.length ? pick(iso) : onAdd(iso)}
            aria-label={`${niceDate(iso)}${dayItems.length ? `, ${dayItems.length} item${dayItems.length === 1 ? "" : "s"}` : ""}`}
            className={`flex h-11 flex-col items-center justify-center rounded-xl ${!inMonth ? "opacity-0" : selected === iso ? "bg-primary/10" : ""}`}>
            <span className={`grid size-7 place-items-center rounded-full text-[13px] ${iso === todayISO ? "bg-primary text-primary-foreground" : ""}`}>{day.getDate()}</span>
            <span className="mt-0.5 flex h-1.5 gap-0.5">{[...new Set(dayItems.map(i => i.tone))].slice(0, 3).map(t => <span key={t} className={`size-1.5 rounded-full ${toneDot[t]}`}/>)}</span>
          </button>;
        })}
      </div>
      <p className="mt-2 text-[11px] text-muted-foreground">Tap a day with dots to jump to it, or an empty day to add something.</p>
    </Card>

    {groups.length === 0
      ? <Card className="p-8 text-center"><p className="text-sm text-muted-foreground">Nothing this month.</p></Card>
      : groups.map(g => <section key={g.date} id={`cal-day-${g.date}`} className="scroll-mt-4">
          <p className={`px-1 text-[11px] font-semibold uppercase tracking-[0.12em] ${g.date === todayISO ? "text-primary" : "text-muted-foreground"}`}>
            {parse(g.date).toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "short" })} · {whenText(g.date)}
          </p>
          <div className={`mt-2 divide-y divide-border/70 overflow-hidden rounded-2xl border bg-card ${selected === g.date ? "border-primary/50" : "border-border/70"}`}>
            {g.items.map(item => <button key={item.key} type="button" onClick={() => onOpen(item)} className="flex w-full items-center gap-3 px-4 py-3.5 text-left active:bg-secondary/60">
              <span className={`h-9 w-1 shrink-0 rounded-full ${toneDot[item.tone]}`}/>
              <span className="min-w-0 flex-1">
                <span className="block text-[14px] font-medium leading-5">{item.title}</span>
                <span className="mt-0.5 block truncate text-[12px] text-muted-foreground">{item.detail}</span>
              </span>
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${toneClass[item.tone]}`}>{item.source}</span>
            </button>)}
          </div>
        </section>)}
  </div>;
}

export function CalendarSection({ scheme, tasks, widgets, levies, orders, goTo }: {
  scheme: CalendarScheme; tasks: CalendarTask[]; widgets: ComplianceWidget[]; levies: CalendarLevy[]; orders: CalendarOrder[];
  goTo: (section: string) => void;
}) {
  const queryClient = useQueryClient();
  const [view, setView] = useState<"calendar" | "list">("calendar");
  const [cursor, setCursor] = useState(() => { const d = new Date(); d.setDate(1); return d; });
  const [viewing, setViewing] = useState<Item | null>(null);
  const [editing, setEditing] = useState<EventRow | null>(null);
  const [adding, setAdding] = useState<string | null>(null);
  const [dragKey, setDragKey] = useState<string | null>(null);
  const [overDay, setOverDay] = useState<string | null>(null);

  const events = useCalendarEvents();

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["calendar-events"] });
    queryClient.invalidateQueries({ queryKey: ["tasks"] });
    queryClient.invalidateQueries({ queryKey: ["scheme"] });
    queryClient.invalidateQueries({ queryKey: ["work-orders"] });
    queryClient.invalidateQueries({ queryKey: ["repairs"] });
  };

  const items = useMemo<Item[]>(() => buildCalendarItems(scheme, tasks, widgets, levies, orders, events.data ?? []),
    [scheme, tasks, widgets, levies, orders, events.data]);

  const move = async (item: Item, date: string) => {
    if (item.date === date) return;
    if (item.eventRow) {
      const { error } = await supabase.from("calendar_events").update({ event_date: date }).eq("id", item.eventRow.id);
      if (error) { toast("Could not move that", { description: error.message }); return; }
    } else if (item.key === "agm") {
      const { error } = await supabase.from("schemes").update({ next_agm_date: date }).eq("id", scheme?.id ?? "");
      if (error) { toast("Could not move that", { description: error.message }); return; }
    } else if (item.key.startsWith("task-")) {
      const { error } = await supabase.from("compliance_tasks").update({ due_date: date }).eq("id", item.key.slice(5));
      if (error) { toast("Could not move that", { description: error.message }); return; }
    } else if (item.key.startsWith("wo-")) {
      const { error } = await supabase.from("maintenance_requests").update({ target_date: date } as never).eq("id", item.key.slice(3));
      if (error) { toast("Could not move that", { description: error.message }); return; }
    } else return;
    refresh();
    toast(`Moved to ${niceDate(date)}`);
  };

  const removeEvent = async (row: EventRow) => {
    const { error } = await supabase.from("calendar_events").delete().eq("id", row.id);
    if (error) { toast("Could not remove that", { description: error.message }); return; }
    setViewing(null); setEditing(null); refresh(); toast("Removed");
  };

  const onDrop = (date: string) => (e: DragEvent) => {
    e.preventDefault();
    setOverDay(null);
    const key = e.dataTransfer.getData("text/plain") || dragKey;
    const item = items.find(i => i.key === key);
    setDragKey(null);
    if (item && item.movable) void move(item, date);
    else if (item) toast("Levy due dates are set by the budget, so they stay put");
  };

  // Month grid starting Monday
  const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const offset = (first.getDay() + 6) % 7;
  const gridStart = new Date(first); gridStart.setDate(first.getDate() - offset);
  const days = Array.from({ length: 42 }, (_, i) => { const d = new Date(gridStart); d.setDate(gridStart.getDate() + i); return d; });
  const todayISO = toISO(new Date());

  return <div>
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="max-w-2xl">
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Your property</p>
        <h1 className="mt-4 text-4xl font-medium tracking-[-0.035em] sm:text-5xl">Calendar</h1>
        <p className="mt-5 text-[15px] leading-7 text-muted-foreground">Meetings, renewals, levies and repairs in one place. Drag anything to a new day, open it for the detail, and add your own events and reminders.</p>
      </div>
      <div className="flex items-center gap-2">
        <div className="hidden rounded-full border border-border/70 p-1 sm:flex">
          <Button size="sm" variant={view === "calendar" ? "default" : "ghost"} className="h-8 rounded-full px-3 text-[12px]" onClick={()=>setView("calendar")}><CalendarDays/> Calendar</Button>
          <Button size="sm" variant={view === "list" ? "default" : "ghost"} className="h-8 rounded-full px-3 text-[12px]" onClick={()=>setView("list")}><List/> List</Button>
        </div>
        <Button className="rounded-full" onClick={()=>setAdding(todayISO)}><Plus/> Add</Button>
      </div>
    </div>

    {/* Phones: a compact month strip with dots, then the month's entries grouped by day. */}
    <PhoneCalendar className="sm:hidden" cursor={cursor} setCursor={setCursor} days={days} items={items} todayISO={todayISO}
      onOpen={setViewing} onAdd={setAdding}/>

    <div className="hidden sm:block">
    {view === "calendar" ? <Card className="mt-10 overflow-hidden">
      <div className="flex items-center justify-between border-b border-border/70 px-6 py-4">
        <h2 className="text-lg font-medium tracking-[-0.02em]">{cursor.toLocaleDateString("en-AU", { month: "long", year: "numeric" })}</h2>
        <div className="flex items-center gap-1">
          <Button size="icon" variant="ghost" className="size-8 rounded-full" onClick={()=>setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}><ChevronLeft/></Button>
          <Button size="sm" variant="ghost" className="h-8 rounded-full px-3 text-[12px]" onClick={()=>{ const d = new Date(); d.setDate(1); setCursor(d); }}>Today</Button>
          <Button size="icon" variant="ghost" className="size-8 rounded-full" onClick={()=>setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}><ChevronRight/></Button>
        </div>
      </div>
      <div className="grid grid-cols-7 border-b border-border/70 bg-secondary/40 text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
        {["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].map(d => <div key={d} className="px-2 py-2 text-center">{d}</div>)}
      </div>
      <div className="grid grid-cols-7">
        {days.map(day => {
          const iso = toISO(day);
          const inMonth = day.getMonth() === cursor.getMonth();
          const dayItems = items.filter(i => i.date === iso);
          return <div key={iso}
            onDragOver={e=>{ e.preventDefault(); setOverDay(iso); }}
            onDragLeave={()=>setOverDay(prev => prev === iso ? null : prev)}
            onDrop={onDrop(iso)}
            onDoubleClick={()=>setAdding(iso)}
            className={`min-h-[104px] border-b border-r border-border/60 p-1.5 transition-colors ${inMonth ? "" : "bg-secondary/30"} ${overDay === iso ? "bg-primary/10" : ""}`}>
            <div className="flex items-center justify-between px-1">
              <span className={`text-[11px] ${iso === todayISO ? "flex size-5 items-center justify-center rounded-full bg-primary text-primary-foreground" : inMonth ? "text-foreground" : "text-muted-foreground/60"}`}>{day.getDate()}</span>
            </div>
            <div className="mt-1 space-y-1">
              {dayItems.slice(0, 3).map(item =>
                <button key={item.key} type="button" draggable={item.movable}
                  onDragStart={e=>{ e.dataTransfer.setData("text/plain", item.key); setDragKey(item.key); }}
                  onDragEnd={()=>setDragKey(null)}
                  onClick={()=>setViewing(item)}
                  className={`block w-full truncate rounded-lg px-1.5 py-1 text-left text-[11px] ${toneClass[item.tone]} ${item.movable ? "cursor-grab active:cursor-grabbing" : ""}`}>
                  {item.title}
                </button>)}
              {dayItems.length > 3 && <p className="px-1.5 text-[10px] text-muted-foreground">+{dayItems.length - 3} more</p>}
            </div>
          </div>;
        })}
      </div>
      <p className="px-6 py-3 text-[11px] text-muted-foreground">Tip: double click a day to add something, or drag an entry to a new day.</p>
    </Card>
    : <Card className="mt-10 overflow-hidden">
      <div className="divide-y divide-border/70">
        {items.map(item =>
          <button key={item.key} type="button" onClick={()=>setViewing(item)} className="flex w-full items-center justify-between gap-4 px-7 py-5 text-left transition-colors hover:bg-secondary/50">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${toneClass[item.tone]}`}>{item.source}</span>
                <p className="text-sm font-medium">{item.title}</p>
              </div>
              <p className="mt-1 truncate text-[12px] text-muted-foreground">{item.detail}</p>
            </div>
            <div className="shrink-0 text-right">
              <p className="text-[13px]">{niceDate(item.date)}</p>
              <p className="text-[11px] text-muted-foreground">{whenText(item.date)}</p>
            </div>
          </button>)}
        {items.length === 0 && <p className="px-7 py-10 text-center text-sm text-muted-foreground">Nothing scheduled yet.</p>}
      </div>
    </Card>}
    </div>

    <Dialog open={!!viewing} onOpenChange={o=>!o && setViewing(null)}>
      <DialogContent>
        {viewing && <>
          <DialogHeader>
            <DialogTitle className="font-display tracking-[-0.02em]">{viewing.title}</DialogTitle>
            <DialogDescription>{viewing.source} · {niceDate(viewing.date)} · {whenText(viewing.date)}</DialogDescription>
          </DialogHeader>
          <p className="text-[13px] leading-6 text-muted-foreground">{viewing.detail}</p>
          <div className="mt-4 flex flex-wrap justify-end gap-2">
            {viewing.eventRow && <Button variant="ghost" className="rounded-full text-destructive hover:text-destructive" onClick={()=>removeEvent(viewing.eventRow!)}><Trash2/> Remove</Button>}
            {viewing.eventRow && <Button variant="outline" className="rounded-full" onClick={()=>{ setEditing(viewing.eventRow!); setViewing(null); }}>Edit</Button>}
            {viewing.goTo && <Button className="rounded-full" onClick={()=>{ const to = viewing.goTo!; setViewing(null); goTo(to); }}>Take me there <ChevronRight/></Button>}
          </div>
        </>}
      </DialogContent>
    </Dialog>

    <EventDialog
      open={!!adding || !!editing}
      row={editing}
      date={adding ?? editing?.event_date ?? todayISO}
      schemeId={scheme?.id}
      onClose={()=>{ setAdding(null); setEditing(null); }}
      onSaved={refresh}
    />
  </div>;
}

function EventDialog({ open, row, date, schemeId, onClose, onSaved }: {
  open: boolean; row: EventRow | null; date: string; schemeId?: string | undefined; onClose: () => void; onSaved: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!schemeId) { toast("Set your building up first"); return; }
    const form = new FormData(e.currentTarget);
    const payload = {
      title: String(form.get("title") ?? ""),
      notes: String(form.get("notes") ?? ""),
      event_date: String(form.get("event_date") ?? date),
      kind: String(form.get("kind") ?? "Event"),
    };
    setSaving(true);
    const { error } = row
      ? await supabase.from("calendar_events").update(payload).eq("id", row.id)
      : await supabase.from("calendar_events").insert({ ...payload, scheme_id: schemeId });
    setSaving(false);
    if (error) { toast("Could not save that", { description: error.message }); return; }
    onClose(); onSaved(); toast(row ? "Updated" : "Added to your calendar");
  };
  return <Dialog open={open} onOpenChange={o=>!o && onClose()}>
    <DialogContent>
      <DialogHeader>
        <DialogTitle className="font-display tracking-[-0.02em]">{row ? "Edit this entry" : "Add to your calendar"}</DialogTitle>
        <DialogDescription>An event for the building, or a reminder just for you.</DialogDescription>
      </DialogHeader>
      <form onSubmit={submit} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2"><Label htmlFor="event_date">Date</Label><Input id="event_date" name="event_date" type="date" defaultValue={row?.event_date ?? date} required/></div>
          <div className="space-y-2"><Label>Type</Label>
            <Select name="kind" defaultValue={row?.kind ?? "Event"}><SelectTrigger><SelectValue/></SelectTrigger>
              <SelectContent><SelectItem value="Event">Event</SelectItem><SelectItem value="Reminder">Reminder</SelectItem></SelectContent></Select></div>
        </div>
        <div className="space-y-2"><Label htmlFor="title">What is it</Label><Input id="title" name="title" defaultValue={row?.title ?? ""} placeholder="Committee catch up" required autoFocus/></div>
        <div className="space-y-2"><Label htmlFor="notes">Notes</Label><Textarea id="notes" name="notes" defaultValue={row?.notes ?? ""} placeholder="Anything worth remembering"/></div>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" className="rounded-full" onClick={onClose}>Cancel</Button>
          <Button type="submit" className="rounded-full" disabled={saving}>{saving ? "Saving" : row ? "Save changes" : "Add it"}</Button>
        </div>
      </form>
    </DialogContent>
  </Dialog>;
}
