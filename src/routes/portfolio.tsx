import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ArrowRight, Building2, LogOut } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
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
  const managed = list.filter(r => r.role === "Manager").length;

  if (!ready) return null;
  return <div className="min-h-screen bg-background">
    <header className="sticky top-0 z-40 border-b border-border/70 bg-background/80 backdrop-blur-xl">
      <div className="mx-auto flex h-[68px] max-w-[1500px] items-center gap-4 px-4 sm:px-7">
        <Link to="/" className="flex items-center gap-2 font-display text-lg font-semibold tracking-[-0.02em]"><span className="grid size-5 grid-cols-2 gap-0.5">{[0, 1, 2, 3].map(i => <span key={i} className="rounded-[3px] bg-primary"/>)}</span>Loty</Link>
        <Button size="icon" variant="ghost" className="ml-auto rounded-full" aria-label="Sign out" onClick={() => { void supabase.auth.signOut().then(() => navigate({ to: "/", replace: true })); }}><LogOut/></Button>
      </div>
    </header>
    <main className="mx-auto max-w-[1500px] px-4 pb-24 pt-10 sm:px-7 sm:pt-14">
      <div className="max-w-2xl">
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Portfolio</p>
        <h1 className="mt-4 text-4xl font-medium tracking-[-0.035em] sm:text-5xl">My buildings</h1>
        <p className="mt-5 text-[15px] leading-7 text-muted-foreground">
          {list.length} {list.length === 1 ? "building" : "buildings"}{managed ? `, ${managed} you manage` : ""}. What needs doing is listed first; open any building to work in it.
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
                <p className="mt-1 text-[12px] text-muted-foreground">{r.address ?? ""}{r.address ? " · " : ""}{r.total_lots} lots · You're {r.role === "Manager" ? "the manager" : r.role === "Committee" ? "on the committee" : "an owner"}</p>
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
    </main>
  </div>;
}

function Stat({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return <div><dt className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">{label}</dt><dd className={`mt-0.5 font-medium tabular-nums ${warn ? "text-destructive" : ""}`}>{value}</dd></div>;
}
