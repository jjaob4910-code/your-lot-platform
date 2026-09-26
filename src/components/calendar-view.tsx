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

export type CalendarScheme = { id: string; next_agm_date: string | null } | null;
export type CalendarTask = { id: string; task_name: string; detail: string | null; due_date: string; status: string };
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

function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`soft-shadow rounded-3xl border border-border/70 bg-card ${className}`}>{children}</section>;
}

export function CalendarSection({ scheme, tasks, levies, orders, goTo }: {
  scheme: CalendarScheme; tasks: CalendarTask[]; levies: CalendarLevy[]; orders: CalendarOrder[];
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

  const events = useQuery({
    queryKey: ["calendar-events"],
    queryFn: async () => {
      const { data, error } = await supabase.from("calendar_events").select("*").order("event_date");
      if (error) throw error;
      return (data ?? []) as unknown as EventRow[];
    },
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["calendar-events"] });
    queryClient.invalidateQueries({ queryKey: ["tasks"] });
    queryClient.invalidateQueries({ queryKey: ["scheme"] });
    queryClient.invalidateQueries({ queryKey: ["work-orders"] });
    queryClient.invalidateQueries({ queryKey: ["repairs"] });
  };

  const items = useMemo<Item[]>(() => {
    const list: Item[] = [];
    if (scheme?.next_agm_date) list.push({
      key: `agm`, date: scheme.next_agm_date, title: "Annual general meeting", detail: "Your yearly owners meeting.",
      tone: "meeting", movable: true, goTo: "Dashboard", source: "Meeting",
    });
    for (const task of tasks) list.push({
      key: `task-${task.id}`, date: task.due_date, title: task.task_name,
      detail: task.detail ?? `Compliance obligation, currently ${task.status.toLowerCase()}.`,
      tone: "compliance", movable: true, goTo: "Actions", source: "Compliance",
    });
    const dueDates = [...new Set(levies.filter(l => l.status !== "Paid").map(l => l.due_date))];
    for (const date of dueDates) {
      const owing = levies.filter(l => l.due_date === date && l.status !== "Paid");
      list.push({
        key: `levy-${date}`, date, title: "Levies due",
        detail: `${owing.length} lot${owing.length === 1 ? "" : "s"} still to pay for this instalment.`,
        tone: "levy", movable: false, goTo: "Finance", source: "Levies",
      });
    }
    for (const order of orders) if (order.target_date && order.status !== "Complete") list.push({
      key: `wo-${order.id}`, date: order.target_date, title: order.title,
      detail: `Work order target date, currently ${order.status.toLowerCase()}.`,
      tone: "work", movable: true, goTo: "Work orders", source: "Work order",
    });
    for (const row of events.data ?? []) list.push({
      key: `event-${row.id}`, date: row.event_date, title: row.title,
      detail: row.notes ?? (row.kind === "Reminder" ? "Your reminder." : "Your event."),
      tone: row.kind === "Reminder" ? "reminder" : "event", movable: true, eventRow: row, source: row.kind,
    });
    return list.sort((a, b) => a.date.localeCompare(b.date));
  }, [scheme, tasks, levies, orders, events.data]);

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
        <div className="flex rounded-full border border-border/70 p-1">
          <Button size="sm" variant={view === "calendar" ? "default" : "ghost"} className="h-8 rounded-full px-3 text-[12px]" onClick={()=>setView("calendar")}><CalendarDays/> Calendar</Button>
          <Button size="sm" variant={view === "list" ? "default" : "ghost"} className="h-8 rounded-full px-3 text-[12px]" onClick={()=>setView("list")}><List/> List</Button>
        </div>
        <Button className="rounded-full" onClick={()=>setAdding(todayISO)}><Plus/> Add</Button>
      </div>
    </div>

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
