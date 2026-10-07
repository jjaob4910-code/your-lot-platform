import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ArrowRight, Building2, LogOut } from "lucide-react";
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

  const list = rows.data ?? [];
  const actions = list.flatMap(actionsFor).sort((a, b) => a.urgency - b.urgency);
  const managed = list.filter(r => r.role === "Manager" || r.role === "Loty").length;

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
            : `${list.length} ${list.length === 1 ? "building" : "buildings"}${managed ? `, ${managed} you manage` : ""}. What needs doing is listed first; open any building to work in it.`}
        </p>
      </div>

      <section className="soft-shadow mt-10 rounded-3xl border border-border/70 bg-card p-5 sm:p-7" data-needs-action>
        <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground"><AlertTriangle className="size-3.5"/>Needs action · {actions.length}</p>
        {rows.isLoading ? <p className="mt-4 text-sm text-muted-foreground">Loading…</p>
          : actions.length === 0 ? <p className="mt-4 text-sm text-muted-foreground">Nothing needs action right now across your buildings.</p>
          : <ul className="mt-3 divide-y divide-border/60">
            {actions.map((a, i) => <li key={i}>
              <button type="button" onClick={() => open(a.scheme.scheme_id, a.tab)} className="flex w-full items-center justify-between gap-3 py-3 text-left hover:opacity-80">
                <span className="min-w-0 text-sm"><span className="font-medium">{a.scheme.name}</span><span className="text-muted-foreground"> · {a.text}</span></span>
                <ArrowRight className="size-4 shrink-0 text-muted-foreground"/>
              </button>
            </li>)}
          </ul>}
      </section>

      <div className="mt-6 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {list.map(r => { const n = actionsFor(r).length;
          return <button key={r.scheme_id} type="button" onClick={() => open(r.scheme_id)} data-building={r.name}
            className="soft-shadow rounded-3xl border border-border/70 bg-card p-5 text-left transition-colors hover:bg-secondary/30 sm:p-6">
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
          </button>; })}
      </div>
      {list.length === 0 && !rows.isLoading && <p className="mt-6 text-sm text-muted-foreground">{isStaff ? "No buildings yet. Switch on Managed by Loty below for each building Loty runs." : "You're not in any buildings yet."}</p>}

      {isStaff && <AllBuildings onChanged={() => void rows.refetch()}/>}
      {isStaff && <TeamContact/>}
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
