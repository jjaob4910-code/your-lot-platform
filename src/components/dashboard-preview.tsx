import { BarChart3, Bell, Building2, FileCheck2, LayoutDashboard, Wrench } from "lucide-react";

export function DashboardPreview() {
  const nav = [LayoutDashboard, BarChart3, Wrench, FileCheck2];
  return (
    <div className="soft-shadow overflow-hidden rounded-2xl border border-border bg-card">
      <div className="flex h-10 items-center gap-2 border-b border-border px-4">
        <span className="h-2.5 w-2.5 rounded-full bg-chip-clay" />
        <span className="h-2.5 w-2.5 rounded-full bg-chip-yellow" />
        <span className="h-2.5 w-2.5 rounded-full bg-accent" />
      </div>
      <div className="grid min-h-[340px] grid-cols-[58px_1fr] sm:grid-cols-[150px_1fr]">
        <aside className="border-r border-border bg-secondary/60 p-3 sm:p-5">
          <div className="mb-8 flex items-center gap-2 font-display text-sm font-semibold"><Building2 className="size-5 text-primary" /><span className="hidden sm:inline">Your Lot.</span></div>
          <div className="space-y-2">{nav.map((Icon, i) => <div key={i} className={`flex h-9 items-center gap-2 rounded-lg px-2 text-xs ${i === 0 ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}><Icon className="size-4 shrink-0" /><span className="hidden sm:inline">{["Dashboard", "Levies", "Maintenance", "Compliance"][i]}</span></div>)}</div>
        </aside>
        <div className="min-w-0 p-4 sm:p-7">
          <div className="mb-6 flex items-center justify-between"><div><p className="text-xs text-muted-foreground">Welcome back</p><h3 className="text-base font-semibold sm:text-xl">Scheme overview</h3></div><Bell className="size-4 text-muted-foreground" /></div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">{["Levies", "Compliance", "Requests", "Next AGM"].map((label) => <div key={label} className="rounded-lg border border-border bg-surface-raised p-3"><p className="text-[9px] text-muted-foreground sm:text-xs">{label}</p><p className="mt-2 font-display text-lg font-semibold">—</p></div>)}</div>
          <div className="mt-3 grid gap-3 sm:grid-cols-[1.55fr_1fr]"><div className="flex min-h-40 items-center justify-center rounded-lg border border-border bg-surface-raised"><div className="text-center"><BarChart3 className="mx-auto size-6 text-primary/50"/><p className="mt-2 text-[10px] text-muted-foreground sm:text-xs">Levy activity will appear here</p></div></div><div className="rounded-lg border border-border bg-surface-raised p-4"><p className="text-xs font-semibold">Compliance</p><div className="mt-4 space-y-3">{[1,2,3,4].map(i => <div key={i} className="flex items-center gap-2"><span className="size-2 rounded-full bg-muted"/><span className="h-1.5 flex-1 rounded bg-muted"/></div>)}</div></div></div>
        </div>
      </div>
    </div>
  );
}