import { Bell, CalendarDays, FileText, LayoutDashboard, WalletCards, Wrench } from "lucide-react";

const nav = [LayoutDashboard, WalletCards, Wrench, FileText];

export function DashboardPreview() {
  return (
    <div className="soft-shadow overflow-hidden rounded-2xl border border-border/70 bg-card">
      <div className="flex h-12 items-center justify-between border-b border-border/70 bg-secondary/40 px-5">
        <div className="flex items-center gap-3"><span className="size-2.5 rounded-full bg-muted-foreground/40"/><span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Your property</span></div>
        <div className="flex items-center gap-2"><span className="h-1.5 w-20 rounded-full bg-muted"/><Bell className="size-3.5 text-muted-foreground"/></div>
      </div>
      <div className="grid min-h-[390px] grid-cols-[54px_1fr] sm:grid-cols-[170px_1fr]">
        <aside className="border-r border-border/70 p-3 sm:p-5">
          <p className="mb-5 hidden text-[9px] font-semibold uppercase tracking-[0.16em] text-muted-foreground sm:block">Your building</p>
          <div className="space-y-1">{nav.map((Icon,i)=><div key={i} className={`flex h-9 items-center gap-2 rounded-full px-3 text-[11px] ${i===0?"bg-secondary text-foreground":"text-muted-foreground"}`}><Icon className="size-3.5"/><span className="hidden sm:inline">{["Today","Levies","Repairs","Paperwork"][i]}</span></div>)}</div>
        </aside>
        <div className="min-w-0 p-4 sm:p-7">
          <div className="mb-7 flex items-end justify-between"><div><p className="text-[10px] text-muted-foreground">Monday morning</p><h3 className="mt-1 text-lg font-medium tracking-[-0.03em] sm:text-2xl">Nothing needs you today.</h3></div><span className="hidden text-[10px] text-muted-foreground sm:block">Nothing added yet</span></div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{["Money in","Owners paid up","Repairs waiting","Insurance renews"].map(label=><div key={label} className="border-t border-border/70 pt-3"><p className="text-[9px] text-muted-foreground sm:text-[10px]">{label}</p><p className="mt-2 font-display text-2xl font-medium tracking-[-0.03em]">—</p></div>)}</div>
          <div className="mt-7 grid gap-3 sm:grid-cols-[1.15fr_.85fr]">
            <div className="rounded-2xl border border-border/70 p-5"><div className="flex items-center justify-between"><p className="text-xs font-medium">Who has paid their levies</p><span className="text-xs text-muted-foreground">—</span></div><div className="mt-8 flex h-24 items-end gap-2">{[0,1,2,3,4,5,6].map(i=><span key={i} className="h-1 flex-1 rounded-full bg-muted"/>)}</div></div>
            <div className="rounded-2xl bg-primary p-5 text-primary-foreground"><div className="flex justify-between"><p className="text-xs font-medium">Your next deadline</p><CalendarDays className="size-4 opacity-60"/></div><p className="mt-8 font-display text-4xl font-medium tracking-[-0.04em]">—</p><p className="mt-2 text-[10px] opacity-55">Nothing due yet</p><div className="mt-5 h-px bg-primary-foreground/15"/></div>
          </div>
        </div>
      </div>
    </div>
  );
}
