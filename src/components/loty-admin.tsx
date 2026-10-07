import { useEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import { createPortal } from "react-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ArrowRight, CalendarDays, Clock, Download, FileSignature, FileText, History, Layers, Mail, Phone, Wrench, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { daysUntil, money, niceDate } from "@/lib/format";
import { LOTY_COLORS, colorOf, saveLotyMeta, type LotyColor } from "@/components/loty-notes";
import { downloadMonthlyReport } from "@/lib/loty-report-pdf";

// Loty staff tools across every managed building: a compliance calendar, arrears follow-up,
// work order response times and the team's workload. Staff read these buildings' records through
// the same access rules the committee uses; the follow-up log is staff-only.

export type AdminBuilding = { id: string; name: string; color?: string | null | undefined; assignedTo?: string | null | undefined };
type Open = (schemeId: string, tab?: string) => void;

function Dot({ color }: { color?: string | null | undefined }) {
  const c = colorOf(color);
  return <span className={`inline-block size-2.5 shrink-0 rounded-full ${c?.swatch ?? "bg-border"}`} aria-hidden/>;
}
const nameOf = (bs: AdminBuilding[], id: string) => bs.find(b => b.id === id);

// ── Photo framing ────────────────────────────────────────────────────────────
/** Drag the photo (or use the sliders) to choose which part shows on the card. */
export function CoverFramer({ open, onOpenChange, schemeId, url, position, onSaved }: {
  open: boolean; onOpenChange: (v: boolean) => void; schemeId: string; url: string; position?: string | null | undefined; onSaved: () => void;
}) {
  const parse = (p?: string | null) => { const m = /(\d+(?:\.\d+)?)% (\d+(?:\.\d+)?)%/.exec(p ?? ""); return m ? [Number(m[1]), Number(m[2])] as const : [50, 50] as const; };
  const [[x, y], setPos] = useState<readonly [number, number]>(() => parse(position));
  const drag = useRef<{ sx: number; sy: number; x: number; y: number } | null>(null);
  const clamp = (v: number) => Math.max(0, Math.min(100, Math.round(v)));
  const onDown = (e: PointerEvent<HTMLDivElement>) => { e.currentTarget.setPointerCapture(e.pointerId); drag.current = { sx: e.clientX, sy: e.clientY, x, y }; };
  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current; if (!d) return;
    const r = e.currentTarget.getBoundingClientRect();
    // Dragging the photo right shows more of its left side, so the focus moves the other way.
    setPos([clamp(d.x - ((e.clientX - d.sx) / r.width) * 100), clamp(d.y - ((e.clientY - d.sy) / r.height) * 100)]);
  };
  const save = async () => { if (await saveLotyMeta(schemeId, { cover_pos: `${x}% ${y}%` })) { onSaved(); onOpenChange(false); toast("Photo position saved"); } };
  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="sm:max-w-[520px]">
      <DialogHeader><DialogTitle className="font-display tracking-[-0.02em]">Adjust photo</DialogTitle>
        <DialogDescription>Drag the photo to choose what shows on the building's card.</DialogDescription></DialogHeader>
      <div data-cover-framer onPointerDown={onDown} onPointerMove={onMove} onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }}
        className="relative h-40 cursor-grab touch-none overflow-hidden rounded-2xl border border-border/70 active:cursor-grabbing">
        <img src={url} alt="" draggable={false} className="pointer-events-none size-full select-none object-cover" style={{ objectPosition: `${x}% ${y}%` }}/>
      </div>
      <div className="grid gap-3 text-[12px] text-muted-foreground sm:grid-cols-2">
        <label className="grid gap-1">Left – right<input type="range" min={0} max={100} value={x} onChange={e => setPos([Number(e.target.value), y])} aria-label="Horizontal position"/></label>
        <label className="grid gap-1">Top – bottom<input type="range" min={0} max={100} value={y} onChange={e => setPos([x, Number(e.target.value)])} aria-label="Vertical position"/></label>
      </div>
      <div className="flex justify-between gap-2">
        <Button variant="ghost" className="rounded-full" onClick={() => setPos([50, 50])}>Centre</Button>
        <div className="flex gap-2"><Button variant="ghost" className="rounded-full" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button className="rounded-full" onClick={() => void save()}>Save position</Button></div>
      </div>
    </DialogContent>
  </Dialog>;
}

// ── Data across managed buildings ────────────────────────────────────────────
function useAcross<T>(key: string, ids: string[], fetch: (ids: string[]) => Promise<T[]>) {
  return useQuery({ queryKey: ["loty-admin", key, ids.join(",")], enabled: ids.length > 0, queryFn: () => fetch(ids) });
}

// ── 1. Compliance calendar ───────────────────────────────────────────────────
type Deadline = { id: string; schemeId: string; date: string; title: string; kind: string; tab: string; done?: boolean };
export function ComplianceCalendar({ buildings, onOpen }: { buildings: AdminBuilding[]; onOpen: Open }) {
  const ids = buildings.map(b => b.id);
  const [range, setRange] = useState<30 | 90 | 365>(90);
  const data = useAcross("calendar", ids, async (ids): Promise<Deadline[]> => {
    const [agm, ins, tasks, lots] = await Promise.all([
      supabase.from("agm_meetings").select("id, scheme_id, title, meeting_date, notice_sent_at").in("scheme_id", ids),
      supabase.from("insurance_policies").select("id, scheme_id, policy_type, renewal_date").in("scheme_id", ids),
      supabase.from("compliance_tasks").select("id, scheme_id, task_name, due_date, status").in("scheme_id", ids),
      supabase.from("lots").select("id, scheme_id").in("scheme_id", ids),
    ]);
    const lotScheme = new Map((lots.data ?? []).map(l => [l.id as string, l.scheme_id as string]));
    const lev = lotScheme.size ? await supabase.from("levies").select("id, lot_id, due_date, status").in("lot_id", [...lotScheme.keys()]) : { data: [] };
    const out: Deadline[] = [];
    for (const m of agm.data ?? []) {
      if (!m.meeting_date) continue;
      const notice = new Date(new Date(m.meeting_date).getTime() - 14 * 86400000).toISOString().slice(0, 10);
      out.push({ id: `n-${m.id}`, schemeId: m.scheme_id, date: notice, title: `AGM notice due (${m.title})`, kind: "AGM notice", tab: "AGM", done: !!m.notice_sent_at });
      out.push({ id: `m-${m.id}`, schemeId: m.scheme_id, date: m.meeting_date.slice(0, 10), title: m.title, kind: "AGM", tab: "AGM" });
    }
    for (const p of ins.data ?? []) if (p.renewal_date) out.push({ id: `i-${p.id}`, schemeId: p.scheme_id, date: p.renewal_date.slice(0, 10), title: `${p.policy_type} insurance renews`, kind: "Insurance", tab: "Insurance" });
    for (const t of tasks.data ?? []) if (t.due_date) out.push({ id: `t-${t.id}`, schemeId: t.scheme_id, date: t.due_date.slice(0, 10), title: t.task_name, kind: "Compliance", tab: "Calendar", done: /done|complete/i.test(String(t.status ?? "")) });
    // One entry per building and due date for levies.
    const levyDates = new Map<string, number>();
    for (const v of lev.data ?? []) { const sid = lotScheme.get(v.lot_id as string); if (!sid || v.status === "Paid") continue; const k = `${sid}|${String(v.due_date).slice(0, 10)}`; levyDates.set(k, (levyDates.get(k) ?? 0) + 1); }
    const [contacts, agreements] = await Promise.all([
      supabase.from("loty_contacts").select("id, scheme_id, with_whom, summary, follow_up_on").not("follow_up_on", "is", null),
      supabase.from("loty_agreements").select("scheme_id, end_date, notice_days"),
    ]);
    for (const c of contacts.data ?? []) if (c.follow_up_on && ids.includes(c.scheme_id)) out.push({ id: `c-${c.id}`, schemeId: c.scheme_id, date: String(c.follow_up_on), title: `Follow up${c.with_whom ? ` with ${c.with_whom}` : ""}: ${c.summary}`, kind: "Contact follow-up", tab: "Dashboard" });
    for (const g of agreements.data ?? []) if (g.end_date && ids.includes(g.scheme_id)) out.push({ id: `g-${g.scheme_id}`, schemeId: g.scheme_id, date: String(g.end_date), title: "Management agreement ends", kind: "Agreement", tab: "Dashboard" });
    for (const [k, n] of levyDates) { const [sid, date] = k.split("|"); out.push({ id: `l-${k}`, schemeId: sid!, date: date!, title: `${n} ${n === 1 ? "levy" : "levies"} due`, kind: "Levies", tab: "Finance/Levies" }); }
    return out;
  });
  const items = (data.data ?? []).filter(d => !d.done && daysUntil(d.date) <= range && daysUntil(d.date) >= -60).sort((a, b) => a.date.localeCompare(b.date));
  const tone = (d: Deadline) => { const left = daysUntil(d.date); return left < 0 ? "bg-destructive/10 text-destructive" : left <= 7 ? "bg-rose-500/10 text-rose-700 dark:text-rose-300" : left <= 14 ? "bg-amber-500/15 text-amber-800 dark:text-amber-300" : left <= 30 ? "bg-sky-500/10 text-sky-700 dark:text-sky-300" : "bg-secondary text-muted-foreground"; };
  return <section className="soft-shadow rounded-3xl border border-border/70 bg-card p-5 sm:p-7" data-admin-calendar>
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground"><CalendarDays className="size-3.5"/>Compliance calendar</p>
        <p className="mt-1 text-[13px] text-muted-foreground">AGM notices and meetings, insurance renewals, levy due dates and compliance tasks for every managed building. Overdue items stay until they're done.</p></div>
      <div className="flex gap-1" role="group" aria-label="How far ahead">{([30, 90, 365] as const).map(r => <Button key={r} size="sm" variant={range === r ? "default" : "outline"} className="rounded-full" onClick={() => setRange(r)}>{r === 365 ? "12 months" : `${r} days`}</Button>)}</div>
    </div>
    <ul className="mt-4 divide-y divide-border/60">
      {data.isLoading && <li className="py-3 text-sm text-muted-foreground">Loading…</li>}
      {data.isSuccess && items.length === 0 && <li className="py-3 text-sm text-muted-foreground">Nothing due in this period.</li>}
      {items.map(d => { const b = nameOf(buildings, d.schemeId); const left = daysUntil(d.date);
        return <li key={d.id}><button type="button" onClick={() => onOpen(d.schemeId, d.tab)} className="flex w-full flex-wrap items-center gap-3 py-3 text-left hover:opacity-80">
          <span className={`w-28 shrink-0 rounded-full px-2.5 py-0.5 text-center text-[11px] font-medium ${tone(d)}`}>{left < 0 ? `${-left}d overdue` : left === 0 ? "Today" : `In ${left} days`}</span>
          <span className="min-w-0 flex-1 text-sm"><span className="font-medium">{d.title}</span><span className="block text-[12px] text-muted-foreground">{niceDate(d.date)} · {d.kind}</span></span>
          <span className="flex items-center gap-2 text-[13px]"><Dot color={b?.color}/>{b?.name}</span>
          <ArrowRight className="size-4 text-muted-foreground"/>
        </button></li>; })}
    </ul>
  </section>;
}

// ── 2. Arrears follow-up ─────────────────────────────────────────────────────
const STAGES = ["Reminder 1", "Reminder 2", "Final notice", "Phone call", "Payment plan", "Note"] as const;
type Followup = { id: string; levy_id: string; stage: string; note: string | null; created_by_name: string | null; created_at: string };
export function ArrearsFollowUp({ buildings, onOpen }: { buildings: AdminBuilding[]; onOpen: Open }) {
  const queryClient = useQueryClient();
  const ids = buildings.map(b => b.id);
  const data = useAcross("arrears", ids, async (ids) => {
    const lots = await supabase.from("lots").select("id, scheme_id, lot_number, owner_name, owner_email").in("scheme_id", ids);
    const byLot = new Map((lots.data ?? []).map(l => [l.id as string, l]));
    if (!byLot.size) return [];
    const lev = await supabase.from("levies").select("id, lot_id, amount, due_date, status, label").in("lot_id", [...byLot.keys()]);
    return (lev.data ?? []).filter(v => v.status !== "Paid" && String(v.status) !== "Void" && daysUntil(String(v.due_date)) < 0)
      .map(v => ({ ...v, lot: byLot.get(v.lot_id as string)! }));
  });
  const follow = useQuery({
    queryKey: ["loty-followups"], enabled: ids.length > 0,
    queryFn: async () => { const { data, error } = await supabase.from("loty_followups").select("*").order("created_at", { ascending: false }); return error ? [] as Followup[] : (data ?? []) as Followup[]; },
  });
  const [logging, setLogging] = useState<string | null>(null);
  const rows = (data.data ?? []).sort((a, b) => String(a.due_date).localeCompare(String(b.due_date)));
  const total = rows.reduce((t, r) => t + Number(r.amount), 0);
  const log = async (levyId: string, schemeId: string, stage: string, note: string) => {
    const { error } = await supabase.from("loty_followups").insert({ levy_id: levyId, scheme_id: schemeId, stage, note: note.trim() || null });
    if (error) { toast("Couldn't log that", { description: /loty_followups|schema cache/i.test(error.message) ? "Needs the Loty staff tools (round 2) set up in Supabase first." : error.message }); return; }
    setLogging(null); void queryClient.invalidateQueries({ queryKey: ["loty-followups"] }); toast(`${stage} logged`);
  };
  const reminderEmail = (r: typeof rows[number]) => {
    const b = nameOf(buildings, r.lot.scheme_id as string);
    const body = `Hi ${String(r.lot.owner_name ?? "there").split(" ")[0]},\n\nOur records show the levy for Lot ${r.lot.lot_number} at ${b?.name ?? "your building"} of ${money(Number(r.amount))}, due ${niceDate(String(r.due_date))}, hasn't been received yet.\n\nIf you've already paid, thank you, and please ignore this. Otherwise please pay as soon as you can, or reply to arrange a payment plan.\n\nKind regards,\nLoty, building manager for ${b?.name ?? "your building"}`;
    return `mailto:${encodeURIComponent(String(r.lot.owner_email ?? ""))}?subject=${encodeURIComponent(`Levy reminder: Lot ${r.lot.lot_number}, ${b?.name ?? ""}`)}&body=${encodeURIComponent(body)}`;
  };
  return <section className="soft-shadow rounded-3xl border border-border/70 bg-card p-5 sm:p-7" data-admin-arrears>
    <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground"><AlertTriangle className="size-3.5"/>Arrears follow-up</p>
    <p className="mt-1 text-[13px] text-muted-foreground">{rows.length ? `${rows.length} overdue ${rows.length === 1 ? "levy" : "levies"} · ${money(total)} across your buildings.` : "Every overdue levy across your buildings, with each follow-up recorded."}</p>
    <ul className="mt-4 divide-y divide-border/60">
      {data.isLoading && <li className="py-3 text-sm text-muted-foreground">Loading…</li>}
      {data.isSuccess && rows.length === 0 && <li className="py-3 text-sm text-muted-foreground">No overdue levies. Nice.</li>}
      {rows.map(r => { const b = nameOf(buildings, r.lot.scheme_id as string); const hist = (follow.data ?? []).filter(f => f.levy_id === r.id); const last = hist[0];
        return <li key={r.id} className="py-3" data-arrears-row>
          <div className="flex flex-wrap items-center gap-3">
            <Dot color={b?.color}/>
            <span className="min-w-0 flex-1 text-sm"><span className="font-medium">{b?.name} · Lot {r.lot.lot_number}</span>{r.lot.owner_name ? <span className="text-muted-foreground"> · {r.lot.owner_name}</span> : null}
              <span className="block text-[12px] text-muted-foreground">{money(Number(r.amount))} · due {niceDate(String(r.due_date))} · <span className="text-destructive">{-daysUntil(String(r.due_date))} days overdue</span>{last ? ` · Last: ${last.stage}, ${niceDate(last.created_at)}` : " · No follow-up yet"}</span></span>
            <div className="flex flex-wrap gap-1.5">
              {r.lot.owner_email && <Button asChild size="sm" variant="outline" className="h-8 rounded-full"><a href={reminderEmail(r)}><Mail className="size-3.5"/>Email reminder</a></Button>}
              <Button size="sm" variant="outline" className="h-8 rounded-full" onClick={() => setLogging(logging === r.id ? null : r.id)}>Log follow-up</Button>
              <Button size="sm" variant="ghost" className="h-8 rounded-full" onClick={() => onOpen(r.lot.scheme_id as string, "Finance/Levies")}>Open</Button>
            </div>
          </div>
          {logging === r.id && <form className="mt-3 flex flex-wrap items-center gap-2" onSubmit={e => { e.preventDefault(); const f = new FormData(e.currentTarget); void log(r.id, r.lot.scheme_id as string, String(f.get("stage")), String(f.get("note") ?? "")); }}>
            <select name="stage" aria-label="Follow-up step" defaultValue={STAGES[Math.min(hist.filter(h => h.stage.startsWith("Reminder") || h.stage === "Final notice").length, 2)]} className="h-8 rounded-full border border-border/70 bg-background px-3 text-[13px]">
              {STAGES.map(s => <option key={s}>{s}</option>)}</select>
            <input name="note" placeholder="Note (optional)" aria-label="Follow-up note" className="h-8 min-w-0 flex-1 rounded-full border border-border/70 bg-background px-3 text-[13px]"/>
            <Button type="submit" size="sm" className="h-8 rounded-full">Save</Button>
          </form>}
          {hist.length > 0 && <ol className="mt-2 space-y-0.5 pl-6 text-[12px] text-muted-foreground">{hist.slice(0, 4).map(h => <li key={h.id}>{niceDate(h.created_at)} · <span className="font-medium text-foreground">{h.stage}</span>{h.note ? ` · ${h.note}` : ""} · {h.created_by_name ?? "Loty"}</li>)}</ol>}
        </li>; })}
    </ul>
  </section>;
}

// ── 3. Work order response times ─────────────────────────────────────────────
export function JobsResponse({ buildings, onOpen }: { buildings: AdminBuilding[]; onOpen: Open }) {
  const ids = buildings.map(b => b.id);
  const data = useAcross("jobs", ids, async (ids) => {
    const { data } = await supabase.from("maintenance_requests").select("id, scheme_id, title, created_at, updated_at, closed_at, work_order_updates(created_at), work_order_quotes(created_at, status)").in("scheme_id", ids);
    return (data ?? []).filter(w => !w.closed_at);
  });
  const now = Date.now();
  const days = (iso?: string | null) => (iso ? Math.floor((now - new Date(iso).getTime()) / 86400000) : 0);
  const rows = useMemo(() => (data.data ?? []).map(w => {
    const updates = ((w as { work_order_updates?: { created_at: string }[] }).work_order_updates ?? []).map(u => u.created_at);
    const lastUpdate = [w.updated_at, w.created_at, ...updates].filter(Boolean).sort().at(-1) as string;
    const quotes = (w as { work_order_quotes?: { created_at: string; status: string | null }[] }).work_order_quotes ?? [];
    const waitingQuote = quotes.filter(q => !/accept|approve|reject|decline|paid/i.test(String(q.status ?? ""))).map(q => q.created_at).sort()[0];
    const flags = [days(lastUpdate) >= 7 ? `No update in ${days(lastUpdate)} days` : null, waitingQuote && days(waitingQuote) >= 14 ? `Quote waiting ${days(waitingQuote)} days` : null].filter(Boolean) as string[];
    return { ...w, age: days(w.created_at), sinceUpdate: days(lastUpdate), flags };
  }).sort((a, b) => b.flags.length - a.flags.length || b.age - a.age), [data.data, now]); // eslint-disable-line react-hooks/exhaustive-deps
  const stuck = rows.filter(r => r.flags.length).length;
  return <section className="soft-shadow rounded-3xl border border-border/70 bg-card p-5 sm:p-7" data-admin-jobs>
    <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground"><Wrench className="size-3.5"/>Work order response times</p>
    <p className="mt-1 text-[13px] text-muted-foreground">{rows.length ? `${rows.length} open ${rows.length === 1 ? "job" : "jobs"}${stuck ? `, ${stuck} needing a nudge` : ""}. Flags jobs with no update in 7 days or a quote waiting more than 14 days.` : "Open jobs across your buildings, oldest and stuck first."}</p>
    <ul className="mt-4 divide-y divide-border/60">
      {data.isLoading && <li className="py-3 text-sm text-muted-foreground">Loading…</li>}
      {data.isSuccess && rows.length === 0 && <li className="py-3 text-sm text-muted-foreground">No open jobs.</li>}
      {rows.map(r => { const b = nameOf(buildings, r.scheme_id);
        return <li key={r.id}><button type="button" onClick={() => onOpen(r.scheme_id, "Work orders")} className="flex w-full flex-wrap items-center gap-3 py-3 text-left hover:opacity-80" data-job-row>
          <Dot color={b?.color}/>
          <span className="min-w-0 flex-1 text-sm"><span className="font-medium">{r.title}</span><span className="block text-[12px] text-muted-foreground">{b?.name} · open {r.age} days · last update {r.sinceUpdate === 0 ? "today" : `${r.sinceUpdate} days ago`}</span></span>
          {r.flags.map(f => <span key={f} className="rounded-full bg-amber-500/15 px-2.5 py-0.5 text-[11px] font-medium text-amber-800 dark:text-amber-300"><Clock className="mr-1 inline size-3"/>{f}</span>)}
          <ArrowRight className="size-4 text-muted-foreground"/>
        </button></li>; })}
    </ul>
  </section>;
}

// ── 5. Activity log ──────────────────────────────────────────────────────────
type Activity = { id: string; scheme_id: string; actor_id: string | null; actor_name: string | null; table_name: string; action: string; summary: string | null; created_at: string };
export function ActivityFeed({ buildings, initialBuilding }: { buildings: AdminBuilding[]; initialBuilding?: string | null | undefined }) {
  const [building, setBuilding] = useState<string>(initialBuilding ?? "");
  const [actor, setActor] = useState("");
  const data = useQuery({
    queryKey: ["loty-activity"],
    queryFn: async () => { const { data, error } = await supabase.from("loty_activity").select("*").order("created_at", { ascending: false }).limit(500); return error ? [] as Activity[] : (data ?? []) as Activity[]; },
  });
  const actors = [...new Set((data.data ?? []).map(a => a.actor_name ?? "Loty"))];
  const rows = (data.data ?? []).filter(a => (!building || a.scheme_id === building) && (!actor || (a.actor_name ?? "Loty") === actor));
  return <section className="soft-shadow rounded-3xl border border-border/70 bg-card p-5 sm:p-7" data-admin-activity>
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div><p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground"><History className="size-3.5"/>Activity log</p>
        <p className="mt-1 text-[13px] text-muted-foreground">Every change the Loty team makes in a building, recorded automatically. Each building's committee can see what Loty did in their building.</p></div>
      <div className="flex flex-wrap gap-2">
        <select aria-label="Filter by building" value={building} onChange={e => setBuilding(e.target.value)} className="h-8 rounded-full border border-border/70 bg-background px-3 text-[13px]"><option value="">All buildings</option>{buildings.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select>
        <select aria-label="Filter by person" value={actor} onChange={e => setActor(e.target.value)} className="h-8 rounded-full border border-border/70 bg-background px-3 text-[13px]"><option value="">Everyone</option>{actors.map(a => <option key={a}>{a}</option>)}</select>
      </div>
    </div>
    <ul className="mt-4 divide-y divide-border/60">
      {data.isLoading && <li className="py-3 text-sm text-muted-foreground">Loading…</li>}
      {data.isSuccess && rows.length === 0 && <li className="py-3 text-sm text-muted-foreground">No Loty activity recorded yet.</li>}
      {rows.slice(0, 200).map(a => { const b = nameOf(buildings, a.scheme_id);
        return <li key={a.id} className="flex flex-wrap items-center gap-3 py-2.5 text-sm" data-activity-row>
          <span className="w-36 shrink-0 text-[12px] text-muted-foreground">{new Date(a.created_at).toLocaleString("en-AU", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}</span>
          <span className="min-w-0 flex-1"><span className="font-medium">{a.actor_name ?? "Loty"}</span> {a.action} {a.summary}</span>
          <span className="flex items-center gap-2 text-[12px] text-muted-foreground"><Dot color={b?.color}/>{b?.name ?? "Building"}</span>
        </li>; })}
    </ul>
  </section>;
}

/** One building's Loty activity as a side panel, for the admin bar inside a building. */
export function ActivityPanel({ schemeId, buildingName, onClose }: { schemeId: string; buildingName: string; onClose: () => void }) {
  const data = useQuery({
    queryKey: ["loty-activity", schemeId],
    queryFn: async () => { const { data, error } = await supabase.from("loty_activity").select("*").eq("scheme_id", schemeId).order("created_at", { ascending: false }).limit(300); return error ? [] as Activity[] : (data ?? []) as Activity[]; },
  });
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); }; window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, [onClose]);
  const rows = data.data ?? [];
  return createPortal(<>
    <div className="fixed inset-0 z-[60] bg-foreground/10" aria-hidden onClick={onClose}/>
    <aside role="dialog" aria-label={`Activity log for ${buildingName}`} data-activity-panel
      className="soft-shadow fixed inset-0 z-[61] flex flex-col bg-card sm:inset-y-4 sm:left-auto sm:right-4 sm:w-[440px] sm:rounded-3xl sm:border sm:border-border/70">
      <div className="flex items-center justify-between gap-3 border-b border-border/70 px-5 py-4">
        <div className="min-w-0"><p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground"><History className="size-3.5"/>Activity log</p>
          <p className="truncate text-sm font-medium">{buildingName}</p></div>
        <Button size="icon" variant="ghost" className="rounded-full" aria-label="Close activity log" onClick={onClose}><X/></Button>
      </div>
      <p className="border-b border-border/70 px-5 py-2.5 text-[12px] text-muted-foreground">Every change the Loty team makes in this building, recorded automatically. The committee can see this too.</p>
      <ul className="flex-1 divide-y divide-border/60 overflow-y-auto px-5">
        {data.isLoading && <li className="py-3 text-sm text-muted-foreground">Loading…</li>}
        {data.isSuccess && rows.length === 0 && <li className="py-8 text-center text-[13px] text-muted-foreground">No Loty activity recorded in this building yet.</li>}
        {rows.map(a => <li key={a.id} className="py-3 text-sm" data-activity-row>
          <p><span className="font-medium">{a.actor_name ?? "Loty"}</span> {a.action} {a.summary}</p>
          <p className="text-[11px] text-muted-foreground">{new Date(a.created_at).toLocaleString("en-AU", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}</p>
        </li>)}
      </ul>
    </aside>
  </>, document.body);
}

// ── 6. Contact log ───────────────────────────────────────────────────────────
type ContactRow = { id: string; scheme_id: string; kind: string; with_whom: string | null; summary: string; follow_up_on: string | null; created_by: string; created_by_name: string | null; created_at: string };
export function useLotyContacts(enabled = true) {
  return useQuery({ queryKey: ["loty-contacts"], enabled, queryFn: async () => { const { data, error } = await supabase.from("loty_contacts").select("*").order("created_at", { ascending: false }); return error ? [] as ContactRow[] : (data ?? []) as ContactRow[]; } });
}
export function ContactLog({ buildings, userId }: { buildings: AdminBuilding[]; userId?: string | undefined }) {
  const queryClient = useQueryClient();
  const data = useLotyContacts();
  const [building, setBuilding] = useState("");
  const rows = (data.data ?? []).filter(c => !building || c.scheme_id === building);
  const refresh = () => void queryClient.invalidateQueries({ queryKey: ["loty-contacts"] });
  const add = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget; const f = new FormData(form);
    const scheme = String(f.get("scheme") ?? ""); const summary = String(f.get("summary") ?? "").trim();
    if (!scheme || !summary) { toast("Choose a building and write a summary"); return; }
    const row: { scheme_id: string; kind: string; with_whom: string | null; summary: string; follow_up_on: string | null; created_by?: string } = { scheme_id: scheme, kind: String(f.get("kind")), with_whom: String(f.get("with") ?? "").trim() || null, summary, follow_up_on: String(f.get("follow") ?? "") || null };
    if (userId) row.created_by = userId;
    const { error } = await supabase.from("loty_contacts").insert(row);
    if (error) { toast("Couldn't save", { description: /loty_contacts|schema cache/i.test(error.message) ? "Needs the Loty staff tools (round 3) set up in Supabase first." : error.message }); return; }
    form.reset(); refresh(); toast("Contact logged");
  };
  const done = async (c: ContactRow) => { const { error } = await supabase.from("loty_contacts").update({ follow_up_on: null }).eq("id", c.id); if (error) toast("Couldn't update", { description: error.message }); refresh(); };
  const remove = async (c: ContactRow) => { if (!window.confirm("Delete this entry?")) return; const { error } = await supabase.from("loty_contacts").delete().eq("id", c.id); if (error) toast("Couldn't delete", { description: error.message }); refresh(); };
  return <section className="soft-shadow rounded-3xl border border-border/70 bg-card p-5 sm:p-7" data-admin-contacts>
    <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground"><Phone className="size-3.5"/>Contact log</p>
    <p className="mt-1 text-[13px] text-muted-foreground">Calls, emails and meetings with each committee. Follow-up dates also show in the compliance calendar.</p>
    <form onSubmit={e => void add(e)} className="mt-4 grid gap-2 rounded-2xl border border-border/70 p-3 sm:grid-cols-[1fr_auto_1fr] lg:grid-cols-[1fr_auto_1fr_2fr_auto_auto]" data-contact-form>
      <select name="scheme" aria-label="Building" className="h-9 rounded-full border border-border/70 bg-background px-3 text-[13px]" defaultValue=""><option value="" disabled>Building…</option>{buildings.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select>
      <select name="kind" aria-label="Type" className="h-9 rounded-full border border-border/70 bg-background px-3 text-[13px]">{["Call", "Email", "Meeting", "Other"].map(k => <option key={k}>{k}</option>)}</select>
      <input name="with" aria-label="With whom" placeholder="With whom" className="h-9 rounded-full border border-border/70 bg-background px-3 text-[13px]"/>
      <input name="summary" aria-label="Summary" placeholder="What was discussed" className="h-9 rounded-full border border-border/70 bg-background px-3 text-[13px]"/>
      <input name="follow" type="date" aria-label="Follow up on" title="Follow up on (optional)" className="h-9 rounded-full border border-border/70 bg-background px-3 text-[13px]"/>
      <Button type="submit" size="sm" className="h-9 rounded-full">Log</Button>
    </form>
    <div className="mt-4 flex justify-end"><select aria-label="Filter contacts by building" value={building} onChange={e => setBuilding(e.target.value)} className="h-8 rounded-full border border-border/70 bg-background px-3 text-[13px]"><option value="">All buildings</option>{buildings.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select></div>
    <ul className="mt-2 divide-y divide-border/60">
      {data.isSuccess && rows.length === 0 && <li className="py-3 text-sm text-muted-foreground">Nothing logged yet.</li>}
      {rows.map(c => { const b = nameOf(buildings, c.scheme_id); const due = c.follow_up_on && daysUntil(c.follow_up_on) <= 0;
        return <li key={c.id} className="flex flex-wrap items-start gap-3 py-3 text-sm" data-contact-row>
          <span className="mt-0.5 rounded-full bg-secondary px-2.5 py-0.5 text-[11px] font-medium">{c.kind}</span>
          <span className="min-w-0 flex-1"><span className="font-medium">{c.with_whom ? `${c.with_whom} · ` : ""}{b?.name}</span><span className="block whitespace-pre-wrap text-muted-foreground">{c.summary}</span>
            <span className="block text-[11px] text-muted-foreground">{niceDate(c.created_at)} · {c.created_by_name ?? "Loty"}</span></span>
          {c.follow_up_on && <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium ${due ? "bg-destructive/10 text-destructive" : "bg-sky-500/10 text-sky-700 dark:text-sky-300"}`}>{due ? "Follow up due" : `Follow up ${niceDate(c.follow_up_on)}`}</span>}
          <span className="flex gap-1">
            {c.follow_up_on && <Button size="sm" variant="ghost" className="h-7 rounded-full text-[12px]" onClick={() => void done(c)}>Done</Button>}
            {c.created_by === userId && <Button size="sm" variant="ghost" className="h-7 rounded-full text-[12px] text-muted-foreground" onClick={() => void remove(c)}>Delete</Button>}
          </span>
        </li>; })}
    </ul>
  </section>;
}

// ── 7. Management agreements ─────────────────────────────────────────────────
export type Agreement = { scheme_id: string; fee_amount: number | null; fee_period: string; start_date: string | null; end_date: string | null; notice_days: number; scope: string | null };
export function useLotyAgreements(enabled = true) {
  return useQuery({ queryKey: ["loty-agreements"], enabled, queryFn: async () => { const { data, error } = await supabase.from("loty_agreements").select("*"); return error ? [] as Agreement[] : (data ?? []) as Agreement[]; } });
}
export function Agreements({ buildings }: { buildings: AdminBuilding[] }) {
  const queryClient = useQueryClient();
  const data = useLotyAgreements();
  const [editing, setEditing] = useState<AdminBuilding | null>(null);
  const of = (id: string) => (data.data ?? []).find(a => a.scheme_id === id);
  const save = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault(); if (!editing) return;
    const f = new FormData(e.currentTarget); const v = (k: string) => String(f.get(k) ?? "").trim() || null;
    const { error } = await supabase.from("loty_agreements").upsert({ scheme_id: editing.id, fee_amount: v("fee") ? Number(v("fee")) : null, fee_period: v("period") ?? "quarter", start_date: v("start"), end_date: v("end"), notice_days: Number(v("notice") ?? 60), scope: v("scope"), updated_at: new Date().toISOString() });
    if (error) { toast("Couldn't save", { description: /loty_agreements|schema cache/i.test(error.message) ? "Needs the Loty staff tools (round 3) set up in Supabase first." : error.message }); return; }
    setEditing(null); void queryClient.invalidateQueries({ queryKey: ["loty-agreements"] }); toast("Agreement saved");
  };
  const a = editing ? of(editing.id) : undefined;
  return <section className="soft-shadow rounded-3xl border border-border/70 bg-card p-5 sm:p-7" data-admin-agreements>
    <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground"><FileSignature className="size-3.5"/>Management agreements</p>
    <p className="mt-1 text-[13px] text-muted-foreground">Fee, term and scope for each building Loty manages, with a warning before each agreement ends. End dates also show in the compliance calendar.</p>
    <ul className="mt-4 divide-y divide-border/60">
      {buildings.length === 0 && <li className="py-3 text-sm text-muted-foreground">No managed buildings yet.</li>}
      {buildings.map(b => { const g = of(b.id); const left = g?.end_date ? daysUntil(g.end_date) : null; const warn = left !== null && left <= (g?.notice_days ?? 60);
        return <li key={b.id} className="flex flex-wrap items-center gap-3 py-3 text-sm" data-agreement-row={b.name}>
          <Dot color={b.color}/>
          <span className="min-w-0 flex-1"><span className="font-medium">{b.name}</span>
            <span className="block text-[12px] text-muted-foreground">{g ? [g.fee_amount != null ? `${money(Number(g.fee_amount))} / ${g.fee_period}` : "Fee not set", g.start_date || g.end_date ? `${g.start_date ? niceDate(g.start_date) : "?"} – ${g.end_date ? niceDate(g.end_date) : "ongoing"}` : null, g.scope].filter(Boolean).join(" · ") : "No agreement recorded"}</span></span>
          {left !== null && <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium ${left < 0 ? "bg-destructive/10 text-destructive" : warn ? "bg-amber-500/15 text-amber-800 dark:text-amber-300" : "bg-secondary text-muted-foreground"}`}>{left < 0 ? "Ended" : `Ends in ${left} days`}</span>}
          <Button size="sm" variant="outline" className="h-8 rounded-full" onClick={() => setEditing(b)}>{g ? "Edit" : "Add"}</Button>
        </li>; })}
    </ul>
    <Dialog open={!!editing} onOpenChange={o => { if (!o) setEditing(null); }}>
      <DialogContent>
        <DialogHeader><DialogTitle className="font-display tracking-[-0.02em]">Management agreement</DialogTitle><DialogDescription>{editing?.name}</DialogDescription></DialogHeader>
        <form onSubmit={e => void save(e)} className="grid gap-3 sm:grid-cols-2" data-agreement-form>
          <label className="grid gap-1 text-[12px] text-muted-foreground">Fee ($)<input name="fee" type="number" min="0" step="0.01" defaultValue={a?.fee_amount ?? ""} className="h-9 rounded-xl border border-border/70 bg-background px-3 text-[14px] text-foreground"/></label>
          <label className="grid gap-1 text-[12px] text-muted-foreground">Per<select name="period" defaultValue={a?.fee_period ?? "quarter"} className="h-9 rounded-xl border border-border/70 bg-background px-3 text-[14px] text-foreground"><option value="month">Month</option><option value="quarter">Quarter</option><option value="year">Year</option></select></label>
          <label className="grid gap-1 text-[12px] text-muted-foreground">Starts<input name="start" type="date" defaultValue={a?.start_date ?? ""} className="h-9 rounded-xl border border-border/70 bg-background px-3 text-[14px] text-foreground"/></label>
          <label className="grid gap-1 text-[12px] text-muted-foreground">Ends<input name="end" type="date" defaultValue={a?.end_date ?? ""} className="h-9 rounded-xl border border-border/70 bg-background px-3 text-[14px] text-foreground"/></label>
          <label className="grid gap-1 text-[12px] text-muted-foreground">Warn this many days before it ends<input name="notice" type="number" min="0" max="365" defaultValue={a?.notice_days ?? 60} className="h-9 rounded-xl border border-border/70 bg-background px-3 text-[14px] text-foreground"/></label>
          <label className="grid gap-1 text-[12px] text-muted-foreground sm:col-span-2">Scope<textarea name="scope" rows={3} defaultValue={a?.scope ?? ""} placeholder="e.g. Levies, repairs, insurance, AGM, records" className="rounded-xl border border-border/70 bg-background px-3 py-2 text-[14px] text-foreground"/></label>
          <div className="flex justify-end gap-2 sm:col-span-2"><Button type="button" variant="ghost" className="rounded-full" onClick={() => setEditing(null)}>Cancel</Button><Button type="submit" className="rounded-full">Save agreement</Button></div>
        </form>
      </DialogContent>
    </Dialog>
  </section>;
}

// ── 8. Monthly reports ───────────────────────────────────────────────────────
export function Reports({ buildings, summaries }: { buildings: AdminBuilding[]; summaries: Map<string, { name: string; address: string | null; cash: number }> }) {
  const lastMonth = (() => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 1); return d.toISOString().slice(0, 7); })();
  const [month, setMonth] = useState(lastMonth);
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    for (const id of picked) { const s = summaries.get(id); if (s) { try { await downloadMonthlyReport(id, s, month); } catch (e) { toast("Couldn't make a report", { description: e instanceof Error ? e.message : String(e) }); } } }
    setBusy(false); toast(`${picked.length} ${picked.length === 1 ? "report" : "reports"} downloaded`);
  };
  return <section className="soft-shadow rounded-3xl border border-border/70 bg-card p-5 sm:p-7" data-admin-reports>
    <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground"><FileText className="size-3.5"/>Monthly reports</p>
    <p className="mt-1 text-[13px] text-muted-foreground">A PDF per building to send to its committee: money, levies and arrears, repairs, what's coming up and what Loty did that month.</p>
    <div className="mt-4 flex flex-wrap items-center gap-3">
      <label className="flex items-center gap-2 text-[13px] text-muted-foreground">Month<input type="month" value={month} onChange={e => setMonth(e.target.value)} aria-label="Report month" className="h-9 rounded-full border border-border/70 bg-background px-3 text-[13px] text-foreground"/></label>
      <PickBuildings buildings={buildings} picked={picked} setPicked={setPicked}/>
      <Button className="rounded-full" disabled={!picked.length || busy} onClick={() => void run()}><Download className="size-4"/>{busy ? "Making…" : `Download ${picked.length || ""} ${picked.length === 1 ? "report" : "reports"}`}</Button>
    </div>
  </section>;
}

function PickBuildings({ buildings, picked, setPicked }: { buildings: AdminBuilding[]; picked: string[]; setPicked: (v: string[]) => void }) {
  const all = buildings.length > 0 && picked.length === buildings.length;
  return <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Choose buildings" data-pick-buildings>
    <button type="button" onClick={() => setPicked(all ? [] : buildings.map(b => b.id))} className="rounded-full border border-border/70 px-3 py-1 text-[12px] font-medium hover:bg-secondary">{all ? "Clear" : "Select all"}</button>
    {buildings.map(b => { const on = picked.includes(b.id);
      return <button key={b.id} type="button" aria-pressed={on} onClick={() => setPicked(on ? picked.filter(x => x !== b.id) : [...picked, b.id])}
        className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[12px] font-medium ${on ? "border-primary bg-primary/10 text-primary" : "border-border/70 hover:bg-secondary"}`}><Dot color={b.color}/>{b.name}</button>; })}
  </div>;
}

// ── 9. Bulk actions ──────────────────────────────────────────────────────────
export function BulkActions({ buildings, onChanged }: { buildings: AdminBuilding[]; onChanged: () => void }) {
  const queryClient = useQueryClient();
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [reminders, setReminders] = useState<{ id: string; scheme: string; lot: number; owner: string | null; email: string | null; amount: number; due: string }[] | null>(null);
  const chosen = buildings.filter(b => picked.includes(b.id));
  const postNotice = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault(); const form = e.currentTarget; const f = new FormData(form);
    const title = String(f.get("title") ?? "").trim(); const message = String(f.get("message") ?? "").trim();
    if (!title || !picked.length) { toast("Choose buildings and add a title"); return; }
    setBusy(true);
    const { error } = await supabase.from("notices").insert(picked.map(id => ({ scheme_id: id, title, message })));
    setBusy(false);
    if (error) { toast("Couldn't post", { description: error.message }); return; }
    form.reset(); toast(`Notice posted to ${picked.length} ${picked.length === 1 ? "building" : "buildings"}`);
  };
  const findOverdue = async () => {
    setBusy(true);
    const lots = await supabase.from("lots").select("id, scheme_id, lot_number, owner_name, owner_email").in("scheme_id", picked);
    const byLot = new Map((lots.data ?? []).map(l => [l.id as string, l]));
    const lev = byLot.size ? await supabase.from("levies").select("id, lot_id, amount, due_date, status").in("lot_id", [...byLot.keys()]) : { data: [] };
    setBusy(false);
    setReminders((lev.data ?? []).filter(v => v.status !== "Paid" && String(v.status) !== "Void" && daysUntil(String(v.due_date)) < 0).map(v => {
      const l = byLot.get(v.lot_id as string)!;
      return { id: v.id as string, scheme: l.scheme_id as string, lot: l.lot_number as number, owner: l.owner_name as string | null, email: l.owner_email as string | null, amount: Number(v.amount), due: String(v.due_date) };
    }));
  };
  const mailto = (r: NonNullable<typeof reminders>[number]) => {
    const b = nameOf(buildings, r.scheme)?.name ?? "your building";
    const body = `Hi ${(r.owner ?? "there").split(" ")[0]},\n\nOur records show the levy for Lot ${r.lot} at ${b} of ${money(r.amount)}, due ${niceDate(r.due)}, hasn't been received yet.\n\nIf you've already paid, thank you, and please ignore this. Otherwise please pay as soon as you can, or reply to arrange a payment plan.\n\nKind regards,\nLoty, building manager for ${b}`;
    return `mailto:${encodeURIComponent(r.email ?? "")}?subject=${encodeURIComponent(`Levy reminder: Lot ${r.lot}, ${b}`)}&body=${encodeURIComponent(body)}`;
  };
  const logAll = async () => {
    if (!reminders?.length) return;
    const prev = await supabase.from("loty_followups").select("levy_id, stage").in("levy_id", reminders.map(r => r.id));
    const steps = ["Reminder 1", "Reminder 2", "Final notice"];
    const rows = reminders.map(r => { const n = (prev.data ?? []).filter(p => p.levy_id === r.id && steps.includes(String(p.stage))).length; return { levy_id: r.id, scheme_id: r.scheme, stage: steps[Math.min(n, 2)]!, note: "Logged in bulk" }; });
    const { error } = await supabase.from("loty_followups").insert(rows);
    if (error) { toast("Couldn't log", { description: /loty_followups|schema cache/i.test(error.message) ? "Needs the Loty staff tools (round 2) set up in Supabase first." : error.message }); return; }
    void queryClient.invalidateQueries({ queryKey: ["loty-followups"] }); toast(`Next reminder step logged for ${rows.length} ${rows.length === 1 ? "levy" : "levies"}`);
  };
  const bulkMeta = async (patch: { color?: LotyColor | null }) => {
    if (!picked.length) return;
    let ok = true; for (const id of picked) ok = (await saveLotyMeta(id, patch)) && ok;
    if (ok) { onChanged(); toast(`Updated ${picked.length} ${picked.length === 1 ? "building" : "buildings"}`); }
  };
  const emails = (reminders ?? []).map(r => r.email).filter(Boolean) as string[];
  return <section className="soft-shadow rounded-3xl border border-border/70 bg-card p-5 sm:p-7" data-admin-bulk>
    <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground"><Layers className="size-3.5"/>Bulk actions</p>
    <p className="mt-1 text-[13px] text-muted-foreground">Choose buildings, then do the same thing for all of them at once.</p>
    <div className="mt-4"><PickBuildings buildings={buildings} picked={picked} setPicked={p => { setPicked(p); setReminders(null); }}/></div>
    <div className="mt-5 grid gap-4 lg:grid-cols-2">
      <form onSubmit={e => void postNotice(e)} className="rounded-2xl border border-border/70 p-4" data-bulk-notice>
        <p className="text-sm font-medium">Post a notice</p>
        <p className="text-[12px] text-muted-foreground">Appears on each building's notice board{chosen.length ? `: ${chosen.map(b => b.name).join(", ")}` : ""}.</p>
        <input name="title" aria-label="Notice title" placeholder="Title" className="mt-3 h-9 w-full rounded-xl border border-border/70 bg-background px-3 text-[14px]"/>
        <textarea name="message" aria-label="Notice message" rows={3} placeholder="Message" className="mt-2 w-full rounded-xl border border-border/70 bg-background px-3 py-2 text-[14px]"/>
        <Button type="submit" size="sm" className="mt-2 rounded-full" disabled={!picked.length || busy}>Post to {picked.length || "…"} {picked.length === 1 ? "building" : "buildings"}</Button>
      </form>
      <div className="rounded-2xl border border-border/70 p-4" data-bulk-reminders>
        <p className="text-sm font-medium">Levy reminders</p>
        <p className="text-[12px] text-muted-foreground">Every overdue owner in the chosen buildings, with a reminder email ready to send.</p>
        <Button size="sm" variant="outline" className="mt-3 rounded-full" disabled={!picked.length || busy} onClick={() => void findOverdue()}>Find overdue levies</Button>
        {reminders && <>
          <p className="mt-3 text-[13px]">{reminders.length ? `${reminders.length} overdue · ${money(reminders.reduce((t, r) => t + r.amount, 0))}` : "No overdue levies in these buildings."}</p>
          <ul className="mt-2 max-h-56 space-y-1 overflow-y-auto">{reminders.map(r => <li key={r.id} className="flex items-center gap-2 text-[13px]" data-reminder-row>
            <span className="min-w-0 flex-1 truncate">{nameOf(buildings, r.scheme)?.name} · Lot {r.lot}{r.owner ? ` · ${r.owner}` : ""} · {money(r.amount)}</span>
            {r.email ? <a href={mailto(r)} className="shrink-0 text-primary hover:underline">Open email</a> : <span className="shrink-0 text-muted-foreground">No email</span>}</li>)}</ul>
          {reminders.length > 0 && <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" variant="outline" className="rounded-full" disabled={!emails.length} onClick={() => { void navigator.clipboard.writeText(emails.join(", ")).then(() => toast(`${emails.length} addresses copied`), () => toast("Couldn't copy")); }}>Copy all addresses</Button>
            <Button size="sm" variant="outline" className="rounded-full" onClick={() => void logAll()}>Log next reminder step for all</Button>
          </div>}
        </>}
      </div>
      <div className="rounded-2xl border border-border/70 p-4 lg:col-span-2" data-bulk-meta>
        <p className="text-sm font-medium">Colour</p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <span className="text-[12px] text-muted-foreground">Set colour</span>
          {LOTY_COLORS.map(c => <button key={c.key} type="button" disabled={!picked.length} aria-label={`Set ${c.label} for chosen buildings`} onClick={() => void bulkMeta({ color: c.key })} className={`size-6 rounded-full ${c.swatch} disabled:opacity-40`}/>)}
        </div>
      </div>
    </div>
  </section>;
}
