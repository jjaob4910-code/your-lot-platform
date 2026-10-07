import { useMemo, useRef, useState, type PointerEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ArrowRight, CalendarDays, Clock, Mail, Users, Wrench } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { daysUntil, money, niceDate } from "@/lib/format";
import { colorOf, saveLotyMeta } from "@/components/loty-notes";

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

// ── 4. Team workload ─────────────────────────────────────────────────────────
export function TeamWorkload({ buildings, team, todo, onAssign }: {
  buildings: AdminBuilding[]; team: { user_id: string; name: string }[]; todo: (id: string) => number; onAssign: () => void;
}) {
  const people = [...team.map(t => ({ ...t, list: buildings.filter(b => b.assignedTo === t.user_id) })), { user_id: "", name: "Unassigned", list: buildings.filter(b => !b.assignedTo) }];
  const assign = async (b: AdminBuilding, userId: string) => { if (await saveLotyMeta(b.id, { assigned_to: userId || null })) onAssign(); };
  return <section className="soft-shadow rounded-3xl border border-border/70 bg-card p-5 sm:p-7" data-admin-team>
    <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground"><Users className="size-3.5"/>Team and assignments</p>
    <p className="mt-1 text-[13px] text-muted-foreground">Who looks after each building, and how much each person has on.</p>
    <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {people.map(p => <div key={p.user_id || "none"} className="rounded-2xl border border-border/70 p-4" data-team-person={p.name}>
        <p className="flex items-center justify-between text-sm font-medium">{p.name}<span className="text-[12px] font-normal text-muted-foreground">{p.list.length} {p.list.length === 1 ? "building" : "buildings"} · {p.list.reduce((t, b) => t + todo(b.id), 0)} to do</span></p>
        <ul className="mt-2 space-y-1.5">{p.list.map(b => <li key={b.id} className="flex items-center gap-2 text-[13px]"><Dot color={b.color}/><span className="min-w-0 flex-1 truncate">{b.name}</span>
          <select aria-label={`Assign ${b.name}`} value={b.assignedTo ?? ""} onChange={e => void assign(b, e.target.value)} className="h-7 rounded-full border border-border/70 bg-background px-2 text-[12px]">
            <option value="">Unassigned</option>{team.map(t => <option key={t.user_id} value={t.user_id}>{t.name}</option>)}</select></li>)}
          {p.list.length === 0 && <li className="text-[12px] text-muted-foreground">None</li>}</ul>
      </div>)}
    </div>
  </section>;
}
