import { Bell, CalendarDays, FileText, LayoutDashboard, WalletCards, Wrench } from "lucide-react";

const nav = [LayoutDashboard, WalletCards, Wrench, FileText];

export function DashboardPreview() {
  return (
    <div className="soft-shadow overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex h-12 items-center justify-between border-b border-border bg-secondary/40 px-5">
        <div className="flex items-center gap-3"><span className="size-2.5 rounded-full bg-muted-foreground/40"/><span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Scheme workspace</span></div>
        <div className="flex items-center gap-2"><span className="h-1.5 w-20 rounded-full bg-muted"/><Bell className="size-3.5 text-muted-foreground"/></div>
      </div>
      <div className="grid min-h-[390px] grid-cols-[54px_1fr] sm:grid-cols-[170px_1fr]">
        <aside className="border-r border-border p-3 sm:p-5">
          <p className="mb-5 hidden text-[9px] font-semibold uppercase tracking-[0.16em] text-muted-foreground sm:block">Management</p>
          <div className="space-y-1">{nav.map((Icon,i)=><div key={i} className={`flex h-9 items-center gap-2 rounded-md px-2 text-[11px] ${i===0?"bg-secondary text-foreground":"text-muted-foreground"}`}><Icon className="size-3.5"/><span className="hidden sm:inline">{["Overview","Levies","Maintenance","Documents"][i]}</span></div>)}</div>
        </aside>
        <div className="min-w-0 p-4 sm:p-7">
          <div className="mb-7 flex items-end justify-between"><div><p className="text-[10px] text-muted-foreground">Welcome back</p><h3 className="mt-1 text-lg font-medium sm:text-2xl">Your scheme at a glance</h3></div><span className="hidden text-[10px] text-muted-foreground sm:block">All values empty</span></div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{["Levies collected","Compliance","Open requests","Next AGM"].map(label=><div key={label} className="border-t border-border pt-3"><p className="text-[9px] text-muted-foreground sm:text-[10px]">{label}</p><p className="mt-2 font-display text-2xl font-medium">—</p></div>)}</div>
          <div className="mt-7 grid gap-3 sm:grid-cols-[1.15fr_.85fr]">
            <div className="rounded-lg border border-border p-4"><div className="flex items-center justify-between"><p className="text-xs font-medium">Levy collection</p><span className="text-xs text-muted-foreground">—</span></div><div className="mt-8 flex h-24 items-end gap-2">{[35,54,43,68,49,78,60].map((h,i)=><span key={i} className="flex-1 rounded-t-sm bg-muted" style={{height:`${h}%`}}/>)}</div></div>
            <div className="rounded-lg bg-primary p-4 text-primary-foreground"><div className="flex justify-between"><p className="text-xs font-medium">Next compliance date</p><CalendarDays className="size-4 opacity-60"/></div><p className="mt-8 font-display text-4xl font-medium">—</p><p className="mt-2 text-[10px] opacity-55">No date scheduled</p><div className="mt-5 h-px bg-primary-foreground/15"/></div>
          </div>
        </div>
      </div>
    </div>
  );
}