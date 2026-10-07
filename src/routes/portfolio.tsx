import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ArrowRight, Building2, Camera, Check, LogOut, MoreHorizontal, Move, Search, StickyNote, Trash2 } from "lucide-react";
import { ArrearsFollowUp, ComplianceCalendar, CoverFramer, JobsResponse, TeamWorkload, type AdminBuilding } from "@/components/loty-admin";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { LOTY_COLORS, LotyNotesPanel, colorOf, saveLotyMeta, uploadCover, useCoverUrl, useLotyMeta, useLotyNotes, useLotyTeam, type LotyMeta, type LotyNote } from "@/components/loty-notes";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import { daysUntil, money, niceDate } from "@/lib/format";
import { OPEN_TAB_KEY, PORTFOLIO_SEEN_KEY } from "@/lib/portfolio";

export const Route = createFileRoute("/portfolio")({
  ssr: false,
  head: () => ({ meta: [{ title: "My buildings | Loty" }] }),
  component: PortfolioPage,
});

type Row = {
  scheme_id: string; name: string; address: string | null; role: string; total_lots: number; cash: number;
  levies_overdue: number; overdue_amount: number; open_work_orders: number; approvals_waiting: number;
  next_agm: string | null; agm_notice_sent: boolean | null; next_renewal: string | null; renewal_label: string | null;
};
type Action = { scheme: Row; text: string; tab: string; urgency: number };


// What needs doing across every building, most urgent first. Lower urgency = sooner.
function actionsFor(r: Row): Action[] {
  const out: Action[] = [];
  if (r.levies_overdue > 0) out.push({ scheme: r, tab: "Finance/Levies", urgency: 0,
    text: `${r.levies_overdue} ${r.levies_overdue === 1 ? "levy" : "levies"} overdue · ${money(Number(r.overdue_amount))}` });
  if (r.approvals_waiting > 0) out.push({ scheme: r, tab: "Work orders", urgency: 1,
    text: `${r.approvals_waiting} work ${r.approvals_waiting === 1 ? "order" : "orders"} waiting on owners' approval` });
  if (r.next_agm && !r.agm_notice_sent) {
    const noticeLeft = daysUntil(r.next_agm) - 14;
    if (noticeLeft <= 30) out.push({ scheme: r, tab: "AGM", urgency: Math.max(0, noticeLeft),
      text: noticeLeft < 0 ? `AGM notice is late (meeting ${niceDate(r.next_agm)})` : `Send the AGM notice within ${noticeLeft} days` });
  }
  if (r.next_renewal) {
    const left = daysUntil(r.next_renewal);
    if (left <= 45) out.push({ scheme: r, tab: "Insurance", urgency: left, text: `${r.renewal_label ?? "Insurance"} renews in ${left} days` });
  }
  if (Number(r.cash) < 0) out.push({ scheme: r, tab: "Finance/Cashflow", urgency: 0, text: `Funds overdrawn: ${money(Number(r.cash))}` });
  return out;
}

type AdminTab = "buildings" | "calendar" | "arrears" | "jobs" | "team";
const ADMIN_TABS: [AdminTab, string][] = [["buildings", "Buildings"], ["calendar", "Compliance calendar"], ["arrears", "Arrears"], ["jobs", "Work orders"], ["team", "Team"]];

function Segmented<T extends string>({ label, value, onChange, options }: { label: string; value: T; onChange: (v: T) => void; options: [T, string][] }) {
  return <div role="group" aria-label={label} className="flex rounded-full border border-border/70 bg-background p-0.5">
    {options.map(([k, l]) => <button key={k} type="button" aria-pressed={value === k} onClick={() => onChange(k)}
      className={`rounded-full px-3 py-1 text-[12px] font-medium ${value === k ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>{l}</button>)}
  </div>;
}

/** A building Loty doesn't manage: staff can tag it and keep notes, and take it on. */
function SelfManagedCard({ b, meta, notes, team, onNotes, onChanged, onTakeOn }: {
  b: Building; meta?: LotyMeta | undefined; notes: LotyNote[]; team: { user_id: string; name: string }[]; onNotes: () => void; onChanged: () => void; onTakeOn: () => void;
}) {
  const pinned = notes.find(x => x.pinned);
  const who = team.find(t => t.user_id === meta?.assigned_to);
  return <div data-building={b.name} data-self-managed data-color={meta?.color ?? ""} className="soft-shadow group relative flex flex-col overflow-hidden rounded-3xl border border-dashed border-border bg-card">
    <CardMedia schemeId={b.id} name={b.name} meta={meta} staff team={team} onChanged={onChanged}/>
    <div className="flex-1 p-5 sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0"><p className="flex items-center gap-2 text-base font-medium"><Building2 className="size-4 text-muted-foreground"/>{b.name}</p>
          <p className="mt-1 text-[12px] text-muted-foreground">{b.address ?? ""}{b.address ? " · " : ""}{b.total_lots} lots · {b.members} {b.members === 1 ? "person" : "people"} joined</p></div>
        <span className="shrink-0 rounded-full bg-secondary px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground">Self-managed</span>
      </div>
      <p className="mt-4 text-[12px] text-muted-foreground">On Loty since {niceDate(b.created_at)}</p>
      <Button size="sm" variant="outline" className="mt-3 rounded-full" onClick={onTakeOn}>Take on as Loty managed</Button>
    </div>
    <div className="flex items-center gap-2 border-t border-border/70 px-5 py-3 text-[12px] sm:px-6">
      {who && <span className="shrink-0 rounded-full bg-secondary px-2 py-0.5 text-[11px]">{who.name}</span>}
      {pinned ? <p className="min-w-0 flex-1 truncate text-muted-foreground"><span className="font-medium text-foreground">Pinned:</span> {pinned.body}</p> : <span className="flex-1"/>}
      <button type="button" onClick={onNotes} className="flex shrink-0 items-center gap-1 rounded-full px-2 py-1 font-medium text-primary hover:bg-secondary"><StickyNote className="size-3.5"/>Notes{notes.length ? ` (${notes.length})` : ""}</button>
    </div>
  </div>;
}

type SortKey = "todo" | "name" | "overdue" | "agm" | "renewal" | "lots";
const far = "9999-12-31";
const SORTS: { key: SortKey; label: string; cmp: (a: Row, b: Row) => number }[] = [
  { key: "todo", label: "Most to do", cmp: (a, b) => actionsFor(b).length - actionsFor(a).length || a.name.localeCompare(b.name) },
  { key: "name", label: "Name A–Z", cmp: (a, b) => a.name.localeCompare(b.name) },
  { key: "overdue", label: "Overdue levies", cmp: (a, b) => Number(b.overdue_amount) - Number(a.overdue_amount) || a.name.localeCompare(b.name) },
  { key: "agm", label: "Next AGM", cmp: (a, b) => (a.next_agm ?? far).localeCompare(b.next_agm ?? far) },
  { key: "renewal", label: "Next insurance renewal", cmp: (a, b) => (a.next_renewal ?? far).localeCompare(b.next_renewal ?? far) },
  { key: "lots", label: "Most lots", cmp: (a, b) => b.total_lots - a.total_lots },
];

function ColorDot({ color }: { color?: string | null | undefined }) {
  const c = colorOf(color);
  return c ? <span className={`mr-2 inline-block size-2.5 rounded-full align-middle ${c.swatch}`} aria-label={`${c.label} building`}/> : null;
}

/** The top of a building card: cover photo (framed where staff placed it) and the staff menu
 *  for colour, photo and who looks after it. */
function CardMedia({ schemeId, name, meta, staff, team, onOpen, onChanged }: {
  schemeId: string; name: string; meta?: LotyMeta | undefined; staff: boolean; team: { user_id: string; name: string }[]; onOpen?: (() => void) | undefined; onChanged: () => void;
}) {
  const c = colorOf(meta?.color);
  const cover = useCoverUrl(meta?.cover_path);
  const [menu, setMenu] = useState(false);
  const [framing, setFraming] = useState(false);
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]!.toUpperCase()).join("");
  const done = (ok: boolean) => { if (ok) { onChanged(); setMenu(false); } };
  const media = cover.data ? <img src={cover.data} alt="" className="size-full object-cover transition-transform group-hover:scale-[1.02]" style={{ objectPosition: meta?.cover_pos ?? "50% 50%" }} data-cover/>
    : <span className={`grid size-full place-items-center ${c?.soft ?? "bg-primary/5"}`}><span className="font-display text-3xl font-medium text-primary/40">{initials}</span></span>;
  return <>
    {c && <span className={`absolute inset-y-0 left-0 z-10 w-1.5 ${c.stripe}`} aria-hidden/>}
    {onOpen ? <button type="button" onClick={onOpen} className="relative block h-32 w-full overflow-hidden text-left" aria-label={`Open ${name}`}>{media}</button>
      : <div className="relative block h-32 w-full overflow-hidden">{media}</div>}
    {staff && <Popover open={menu} onOpenChange={setMenu}>
      <PopoverTrigger asChild><button type="button" aria-label={`Options for ${name}`} className="absolute right-3 top-3 z-10 grid size-8 place-items-center rounded-full bg-card/90 shadow-sm backdrop-blur hover:bg-card"><MoreHorizontal className="size-4"/></button></PopoverTrigger>
      <PopoverContent align="end" className="w-64 p-3" data-card-menu>
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Colour</p>
        <div className="mt-2 flex gap-1.5">
          {LOTY_COLORS.map(x => <button key={x.key} type="button" aria-label={`Colour ${x.label}`} title={x.label} onClick={() => void saveLotyMeta(schemeId, { color: x.key }).then(done)}
            className={`grid size-7 place-items-center rounded-full ${x.swatch} text-white`}>{meta?.color === x.key && <Check className="size-3.5"/>}</button>)}
        </div>
        {meta?.color && <button type="button" className="mt-2 text-[12px] text-muted-foreground hover:underline" onClick={() => void saveLotyMeta(schemeId, { color: null }).then(done)}>Remove colour</button>}
        <p className="mt-4 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Cover photo</p>
        <label className="mt-2 flex cursor-pointer items-center gap-2 rounded-xl px-2 py-1.5 text-[13px] hover:bg-secondary"><Camera className="size-4"/>{meta?.cover_path ? "Change photo" : "Add a photo"}
          <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" aria-label="Cover photo" onChange={e => { const f = e.target.files?.[0]; if (f) void uploadCover(schemeId, f).then(ok => { done(ok); if (ok) { toast("Cover photo updated"); void saveLotyMeta(schemeId, { cover_pos: "50% 50%" }); } }); }}/></label>
        {meta?.cover_path && cover.data && <button type="button" className="flex w-full items-center gap-2 rounded-xl px-2 py-1.5 text-left text-[13px] hover:bg-secondary" onClick={() => { setMenu(false); setFraming(true); }}><Move className="size-4"/>Adjust photo</button>}
        {meta?.cover_path && <button type="button" className="flex w-full items-center gap-2 rounded-xl px-2 py-1.5 text-left text-[13px] text-destructive hover:bg-secondary" onClick={() => void saveLotyMeta(schemeId, { cover_path: null }).then(done)}><Trash2 className="size-4"/>Remove photo</button>}
        <p className="mt-4 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Looked after by</p>
        <select aria-label={`Who looks after ${name}`} value={meta?.assigned_to ?? ""} onChange={e => void saveLotyMeta(schemeId, { assigned_to: e.target.value || null }).then(done)}
          className="mt-2 h-8 w-full rounded-full border border-border/70 bg-background px-3 text-[13px]">
          <option value="">Unassigned</option>{team.map(t => <option key={t.user_id} value={t.user_id}>{t.name}</option>)}
        </select>
      </PopoverContent>
    </Popover>}
    {framing && cover.data && <CoverFramer open={framing} onOpenChange={setFraming} schemeId={schemeId} url={cover.data} position={meta?.cover_pos} onSaved={onChanged}/>}
  </>;
}

/** One building: cover photo, colour, key figures, pinned note; staff can recolour, change the photo and open notes. */
function BuildingCard({ r, meta, notes, staff, team, onOpen, onNotes, onChanged }: {
  r: Row; meta?: LotyMeta | undefined; notes: LotyNote[]; staff: boolean; team: { user_id: string; name: string }[]; onOpen: () => void; onNotes: () => void; onChanged: () => void;
}) {
  const n = actionsFor(r).length;
  const pinned = notes.find(x => x.pinned);
  const who = team.find(t => t.user_id === meta?.assigned_to);
  return <div data-building={r.name} data-color={meta?.color ?? ""} className="soft-shadow group relative flex flex-col overflow-hidden rounded-3xl border border-border/70 bg-card">
    <CardMedia schemeId={r.scheme_id} name={r.name} meta={meta} staff={staff} team={team} onOpen={onOpen} onChanged={onChanged}/>
    <button type="button" onClick={onOpen} className="flex-1 p-5 text-left hover:bg-secondary/30 sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-base font-medium"><Building2 className="size-4 text-muted-foreground"/>{r.name}</p>
          <p className="mt-1 text-[12px] text-muted-foreground">{r.address ?? ""}{r.address ? " · " : ""}{r.total_lots} lots · {r.role === "Loty" ? "Managed by Loty" : r.role === "Manager" ? "You're the manager" : r.role === "Committee" ? "You're on the committee" : "You're an owner"}</p>
        </div>
        <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-medium ${n ? "bg-amber-500/15 text-amber-800 dark:text-amber-300" : "bg-emerald-600/10 text-emerald-700 dark:text-emerald-400"}`}>{n ? `${n} to do` : "All good"}</span>
      </div>
      <dl className="mt-5 grid grid-cols-2 gap-x-4 gap-y-3 text-[13px]">
        <Stat label="Cash held" value={money(Number(r.cash))}/>
        <Stat label="Overdue levies" value={r.levies_overdue ? `${r.levies_overdue} · ${money(Number(r.overdue_amount))}` : "None"} warn={r.levies_overdue > 0}/>
        <Stat label="Open work orders" value={String(r.open_work_orders)}/>
        <Stat label="Next AGM" value={r.next_agm ? niceDate(r.next_agm) : "Not set"}/>
        <Stat label="Next renewal" value={r.next_renewal ? niceDate(r.next_renewal) : "None on file"}/>
        <Stat label="Approvals waiting" value={String(r.approvals_waiting)} warn={r.approvals_waiting > 0}/>
      </dl>
    </button>
    {staff && <div className="flex items-center gap-2 border-t border-border/70 px-5 py-3 text-[12px] sm:px-6">
      {who && <span className="shrink-0 rounded-full bg-secondary px-2 py-0.5 text-[11px]" data-assignee>{who.name}</span>}
      {pinned ? <p className="min-w-0 flex-1 truncate text-muted-foreground" data-pinned-note><span className="font-medium text-foreground">Pinned:</span> {pinned.body}</p> : <span className="flex-1"/>}
      <button type="button" onClick={onNotes} className="flex shrink-0 items-center gap-1 rounded-full px-2 py-1 font-medium text-primary hover:bg-secondary" data-notes-button><StickyNote className="size-3.5"/>Notes{notes.length ? ` (${notes.length})` : ""}</button>
    </div>}
  </div>;
}

function PortfolioPage() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => {
      if (!data.session) navigate({ to: "/auth", replace: true }); else setReady(true);
    });
    try { sessionStorage.setItem(PORTFOLIO_SEEN_KEY, "1"); } catch { /* storage unavailable */ }
  }, [navigate]);

  const staff = useQuery({
    queryKey: ["is-loty-staff"], enabled: ready,
    queryFn: async () => { const { data, error } = await supabase.rpc("is_loty_staff"); return !error && !!data; },
  });
  const isStaff = staff.data === true;

  const rows = useQuery({
    queryKey: ["portfolio"], enabled: ready,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("portfolio_summary");
      if (error) throw error;
      return (Array.isArray(data) ? data : []) as Row[];
    },
  });

  const open = (schemeId: string, tab?: string) => {
    try { localStorage.setItem("loty-building", schemeId); if (tab) sessionStorage.setItem(OPEN_TAB_KEY, tab); } catch { /* storage unavailable */ }
    window.location.assign("/dashboard");
  };

  const queryClient = useQueryClient();
  const meta = useLotyMeta(isStaff);
  const notes = useLotyNotes(isStaff);
  const [notesFor, setNotesFor] = useState<Row | null>(null);
  const [userId, setUserId] = useState<string | undefined>();
  useEffect(() => { void supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id)); }, []);
  // Search, colour filter and sort, remembered on this device.
  const [q, setQ] = useState("");
  const [colorFilter, setColorFilter] = useState<string | null>(() => { try { return localStorage.getItem("loty-portfolio-color"); } catch { return null; } });
  const [sort, setSort] = useState<SortKey>(() => { try { return (localStorage.getItem("loty-portfolio-sort") as SortKey) || "todo"; } catch { return "todo"; } });
  useEffect(() => { try { localStorage.setItem("loty-portfolio-sort", sort); if (colorFilter) localStorage.setItem("loty-portfolio-color", colorFilter); else localStorage.removeItem("loty-portfolio-color"); } catch { /* storage unavailable */ } }, [sort, colorFilter]);
  const metaOf = (id: string) => meta.data?.get(id);
  const notesOf = (id: string) => (notes.data ?? []).filter(n => n.scheme_id === id);
  const refreshMeta = () => void queryClient.invalidateQueries({ queryKey: ["loty-meta"] });
  const team = useLotyTeam(isStaff);
  const teamList = team.data ?? [];
  // Staff: which tool, which buildings (Loty-managed, self-managed or all) and whose.
  const [tab, setTab] = useState<AdminTab>(() => { try { return (sessionStorage.getItem("loty-admin-tab") as AdminTab) || "buildings"; } catch { return "buildings"; } });
  useEffect(() => { try { sessionStorage.setItem("loty-admin-tab", tab); } catch { /* storage unavailable */ } }, [tab]);
  const [scope, setScope] = useState<"managed" | "self" | "all">("managed");
  const [owner, setOwner] = useState<"everyone" | "mine" | "unassigned">("everyone");
  const everyBuilding = useQuery({
    queryKey: ["loty-all-buildings"], enabled: isStaff,
    queryFn: async () => { const { data, error } = await supabase.rpc("loty_all_buildings"); if (error) throw error; return (Array.isArray(data) ? data : []) as Building[]; },
  });
  const selfManaged = (everyBuilding.data ?? []).filter(b => !b.managed_by_loty)
    .filter(b => !q || `${b.name} ${b.address ?? ""}`.toLowerCase().includes(q.toLowerCase()))
    .filter(b => !colorFilter || metaOf(b.id)?.color === colorFilter)
    .filter(b => owner === "everyone" || (owner === "mine" ? !!userId && metaOf(b.id)?.assigned_to === userId : !metaOf(b.id)?.assigned_to))
    .sort((a, b) => a.name.localeCompare(b.name));
  const ownerOk = (id: string) => owner === "everyone" || (owner === "mine" ? !!userId && metaOf(id)?.assigned_to === userId : !metaOf(id)?.assigned_to);

  const all = rows.data ?? [];
  const list = all
    .filter(r => !q || `${r.name} ${r.address ?? ""}`.toLowerCase().includes(q.toLowerCase()))
    .filter(r => !colorFilter || metaOf(r.scheme_id)?.color === colorFilter)
    .filter(r => !isStaff || ownerOk(r.scheme_id))
    .sort(SORTS.find(x => x.key === sort)!.cmp);
  const actions = all.flatMap(actionsFor).sort((a, b) => a.urgency - b.urgency);
  const managed = all.filter(r => r.role === "Manager" || r.role === "Loty").length;
  const adminBuildings: AdminBuilding[] = all.filter(r => r.role === "Loty").map(r => ({ id: r.scheme_id, name: r.name, color: metaOf(r.scheme_id)?.color, assignedTo: metaOf(r.scheme_id)?.assigned_to }));
  const showManaged = !isStaff || scope !== "self";
  const showSelf = isStaff && scope !== "managed";

  if (!ready) return null;
  return <div className="min-h-screen bg-background">
    <header className="sticky top-0 z-40 border-b border-border/70 bg-background/80 backdrop-blur-xl">
      <div className="mx-auto flex h-[68px] max-w-[1500px] items-center gap-4 px-4 sm:px-7">
        <Link to="/" className="flex items-center gap-2 font-display text-lg font-semibold tracking-[-0.02em]"><span className="grid size-5 grid-cols-2 gap-0.5">{[0, 1, 2, 3].map(i => <span key={i} className="rounded-[3px] bg-primary"/>)}</span>Loty</Link>
        <Button size="icon" variant="ghost" className="ml-auto rounded-full" aria-label="Sign out" onClick={() => { void supabase.auth.signOut().then(() => navigate({ to: isStaff ? "/staff" : "/", replace: true })); }}><LogOut/></Button>
      </div>
    </header>
    <main className="mx-auto max-w-[1500px] px-4 pb-24 pt-10 sm:px-7 sm:pt-14">
      <div className="max-w-2xl">
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">{isStaff ? "Loty team only" : "Portfolio"}</p>
        <h1 className="mt-4 text-4xl font-medium tracking-[-0.035em] sm:text-5xl">{isStaff ? "Loty dashboard" : "My buildings"}</h1>
        <p className="mt-5 text-[15px] leading-7 text-muted-foreground">
          {isStaff
            ? `${managed} ${managed === 1 ? "building" : "buildings"} managed by Loty. What needs doing is listed first; open any building to work in it as its manager. Only the Loty team can see this page.`
            : `${all.length} ${all.length === 1 ? "building" : "buildings"}${managed ? `, ${managed} you manage` : ""}. What needs doing is listed first; open any building to work in it.`}
        </p>
      </div>

      {isStaff && <nav className="mt-8 flex gap-1 overflow-x-auto border-b border-border/70" aria-label="Loty tools" data-admin-tabs>
        {ADMIN_TABS.map(([key, label]) => <button key={key} type="button" onClick={() => setTab(key)} aria-current={tab === key ? "page" : undefined}
          className={`-mb-px shrink-0 border-b-2 px-3 py-2.5 text-[13px] font-medium transition-colors ${tab === key ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}>{label}</button>)}
      </nav>}
      {isStaff && tab === "calendar" && <div className="mt-6"><ComplianceCalendar buildings={adminBuildings} onOpen={open}/></div>}
      {isStaff && tab === "arrears" && <div className="mt-6"><ArrearsFollowUp buildings={adminBuildings} onOpen={open}/></div>}
      {isStaff && tab === "jobs" && <div className="mt-6"><JobsResponse buildings={adminBuildings} onOpen={open}/></div>}
      {isStaff && tab === "team" && <div className="mt-6 space-y-6"><TeamWorkload buildings={adminBuildings} team={teamList} todo={id => { const r = all.find(x => x.scheme_id === id); return r ? actionsFor(r).length : 0; }} onAssign={refreshMeta}/><TeamContact/></div>}

      {(!isStaff || tab === "buildings") && <>
      <section className="soft-shadow mt-8 rounded-3xl border border-border/70 bg-card p-5 sm:p-7" data-needs-action>
        <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground"><AlertTriangle className="size-3.5"/>Needs action · {actions.length}</p>
        {rows.isLoading ? <p className="mt-4 text-sm text-muted-foreground">Loading…</p>
          : actions.length === 0 ? <p className="mt-4 text-sm text-muted-foreground">Nothing needs action right now across your buildings.</p>
          : <ul className="mt-3 divide-y divide-border/60">
            {actions.map((a, i) => <li key={i}>
              <button type="button" onClick={() => open(a.scheme.scheme_id, a.tab)} className="flex w-full items-center justify-between gap-3 py-3 text-left hover:opacity-80">
                <span className="min-w-0 text-sm"><ColorDot color={metaOf(a.scheme.scheme_id)?.color}/><span className="font-medium">{a.scheme.name}</span><span className="text-muted-foreground"> · {a.text}</span></span>
                <ArrowRight className="size-4 shrink-0 text-muted-foreground"/>
              </button>
            </li>)}
          </ul>}
      </section>

      {/* Toolbar: search, colour filter and sort */}
      <div className="mt-8 flex flex-wrap items-center gap-3" data-portfolio-toolbar>
        <label className="relative w-full sm:w-64"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"/>
          <Input value={q} onChange={e => setQ(e.target.value)} placeholder="Search buildings" aria-label="Search buildings" className="h-9 rounded-full pl-9"/></label>
        {isStaff && <div className="flex items-center gap-1.5" role="group" aria-label="Filter by colour">
          {LOTY_COLORS.map(c => <button key={c.key} type="button" aria-label={`Show ${c.label} buildings`} aria-pressed={colorFilter === c.key} title={c.label}
            onClick={() => setColorFilter(f => f === c.key ? null : c.key)}
            className={`size-6 rounded-full ${c.swatch} ring-offset-2 ring-offset-background transition ${colorFilter === c.key ? "ring-2 ring-foreground" : colorFilter ? "opacity-40" : ""}`}/>)}
          {colorFilter && <button type="button" onClick={() => setColorFilter(null)} className="ml-1 text-[12px] text-muted-foreground hover:underline">Clear</button>}
        </div>}
        {isStaff && <Segmented label="Which buildings" value={scope} onChange={setScope} options={[["managed", "Loty managed"], ["self", "Self-managed"], ["all", "All"]]}/>}
        {isStaff && <Segmented label="Whose buildings" value={owner} onChange={setOwner} options={[["everyone", "Everyone"], ["mine", "Mine"], ["unassigned", "Unassigned"]]}/>}
        <label className="ml-auto flex items-center gap-2 text-[13px] text-muted-foreground">Sort
          <select value={sort} onChange={e => setSort(e.target.value as SortKey)} aria-label="Sort buildings" className="h-9 rounded-full border border-border/70 bg-background px-3 text-[13px] text-foreground">
            {SORTS.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
          </select></label>
      </div>

      {showManaged && <div className="mt-5 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {list.map(r => <BuildingCard key={r.scheme_id} r={r} meta={metaOf(r.scheme_id)} notes={notesOf(r.scheme_id)} staff={isStaff} team={teamList}
          onOpen={() => open(r.scheme_id)} onNotes={() => setNotesFor(r)} onChanged={refreshMeta}/>)}
      </div>}
      {showSelf && <>
        <p className="mt-8 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground" data-self-heading>Self-managed · {selfManaged.length}</p>
        <p className="mt-1 text-[13px] text-muted-foreground">Run by their own committees. Loty can't open them until you switch on Managed by Loty, but you can colour, photograph, assign and keep notes on them.</p>
        <div className="mt-4 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {selfManaged.map(b => <SelfManagedCard key={b.id} b={b} meta={metaOf(b.id)} notes={notesOf(b.id)} team={teamList}
            onNotes={() => setNotesFor({ scheme_id: b.id, name: b.name } as Row)} onChanged={refreshMeta}
            onTakeOn={async () => { const { error } = await supabase.rpc("loty_set_managed", { _scheme: b.id, _managed: true }); if (error) { toast("Could not change that", { description: error.message }); return; } toast(`Loty now manages ${b.name}`); void everyBuilding.refetch(); void rows.refetch(); }}/>)}
          {everyBuilding.isSuccess && selfManaged.length === 0 && <p className="text-sm text-muted-foreground">No self-managed buildings match.</p>}
        </div>
      </>}
      {all.length > 0 && list.length === 0 && <p className="mt-6 text-sm text-muted-foreground">No buildings match. <button type="button" className="text-primary hover:underline" onClick={() => { setQ(""); setColorFilter(null); }}>Clear filters</button></p>}
      {notesFor && <LotyNotesPanel schemeId={notesFor.scheme_id} buildingName={notesFor.name} userId={userId} onClose={() => setNotesFor(null)}/>}
      {all.length === 0 && !rows.isLoading && <p className="mt-6 text-sm text-muted-foreground">{isStaff ? "No buildings yet. Switch on Managed by Loty below for each building Loty runs." : "You're not in any buildings yet."}</p>}

      {isStaff && <AllBuildings onChanged={() => { void rows.refetch(); void everyBuilding.refetch(); }}/>}
      </>}
    </main>
    <Toaster/>
  </div>;
}

type Building = { id: string; name: string; address: string | null; total_lots: number; managed_by_loty: boolean; managed_since: string | null; members: number; created_at: string };

/** Every building on Loty, so the team can choose which ones it manages. Staff only. */
function AllBuildings({ onChanged }: { onChanged: () => void }) {
  const queryClient = useQueryClient();
  const [q, setQ] = useState("");
  const all = useQuery({
    queryKey: ["loty-all-buildings"],
    queryFn: async () => { const { data, error } = await supabase.rpc("loty_all_buildings"); if (error) throw error; return (Array.isArray(data) ? data : []) as Building[]; },
  });
  const set = async (b: Building, on: boolean) => {
    const { error } = await supabase.rpc("loty_set_managed", { _scheme: b.id, _managed: on });
    if (error) { toast("Could not change that", { description: error.message }); return; }
    toast(on ? `Loty now manages ${b.name}` : `${b.name} is back with its committee`);
    void queryClient.invalidateQueries({ queryKey: ["loty-all-buildings"] }); onChanged();
  };
  const list = (all.data ?? []).filter(b => !q || `${b.name} ${b.address ?? ""}`.toLowerCase().includes(q.toLowerCase()));
  return <section className="soft-shadow mt-10 rounded-3xl border border-border/70 bg-card p-5 sm:p-7" data-all-buildings>
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div><p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">All buildings on Loty · {all.data?.length ?? 0}</p>
        <p className="mt-2 max-w-xl text-[13px] text-muted-foreground">Switch on the buildings Loty manages. The team then gets full access to them, and their owners see Loty as their building manager.</p></div>
      <Input value={q} onChange={e => setQ(e.target.value)} placeholder="Search buildings" aria-label="Search buildings" className="h-9 w-full rounded-full sm:w-64"/>
    </div>
    <ul className="mt-4 divide-y divide-border/60">
      {list.map(b => <li key={b.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
        <div className="min-w-0"><p className="text-sm font-medium">{b.name}</p>
          <p className="text-[12px] text-muted-foreground">{b.address ?? ""}{b.address ? " · " : ""}{b.total_lots} lots · {b.members} {b.members === 1 ? "person" : "people"} joined{b.managed_since ? ` · Managed since ${niceDate(b.managed_since)}` : ""}</p></div>
        <label className="flex items-center gap-2 text-[13px]"><span className="text-muted-foreground">Managed by Loty</span>
          <Switch checked={b.managed_by_loty} onCheckedChange={on => void set(b, on)} aria-label={`Managed by Loty: ${b.name}`}/></label>
      </li>)}
      {all.isSuccess && list.length === 0 && <li className="py-3 text-sm text-muted-foreground">No buildings match.</li>}
    </ul>
  </section>;
}

/** The team's contact details, shown to owners of every managed building. */
function TeamContact() {
  const team = useQuery({
    queryKey: ["loty-team"],
    queryFn: async () => { const { data, error } = await supabase.from("loty_team").select("email, phone").maybeSingle(); if (error) throw error; return data; },
  });
  const save = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const { error } = await supabase.from("loty_team").update({ email: String(f.get("email") || "").trim() || null, phone: String(f.get("phone") || "").trim() || null, updated_at: new Date().toISOString() }).eq("id", true);
    if (error) { toast("Could not save", { description: error.message }); return; }
    toast("Team contact saved", { description: "Owners of managed buildings see it under Who runs this building." }); void team.refetch();
  };
  return <section className="soft-shadow mt-6 rounded-3xl border border-border/70 bg-card p-5 sm:p-7">
    <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">How owners reach Loty</p>
    <p className="mt-2 text-[13px] text-muted-foreground">Shown to owners of every building Loty manages.</p>
    {team.isSuccess && <form onSubmit={e => void save(e)} className="mt-4 flex flex-wrap items-end gap-3">
      <label className="grid gap-1 text-[12px] text-muted-foreground">Email<Input name="email" type="email" defaultValue={team.data?.email ?? ""} className="w-64"/></label>
      <label className="grid gap-1 text-[12px] text-muted-foreground">Phone<Input name="phone" defaultValue={team.data?.phone ?? ""} className="w-48"/></label>
      <Button type="submit" className="rounded-full">Save</Button>
    </form>}
  </section>;
}

function Stat({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return <div><dt className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">{label}</dt><dd className={`mt-0.5 font-medium tabular-nums ${warn ? "text-destructive" : ""}`}>{value}</dd></div>;
}
