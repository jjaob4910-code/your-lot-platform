import { Bell, CalendarCheck, CalendarDays, FileText, LayoutDashboard, Mail, ShieldCheck, WalletCards, Wrench } from "lucide-react";

const nav = [LayoutDashboard, WalletCards, Wrench, FileText];

export function DashboardPreview() {
  return (
    <div className="soft-shadow overflow-hidden rounded-2xl border border-border/70 bg-card">
      <div className="flex h-12 items-center justify-between border-b border-border/70 bg-secondary/40 px-5">
        <div className="flex items-center gap-3"><span className="size-2.5 rounded-full bg-muted-foreground/40"/><span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Your property</span></div>
        <div className="flex items-center gap-2"><span className="h-1.5 w-20 rounded-full bg-muted"/><Bell className="size-3.5 text-muted-foreground"/></div>
      </div>
      <div className="grid min-h-[470px] grid-cols-[54px_1fr] sm:grid-cols-[170px_1fr]">
        <aside className="border-r border-border/70 p-3 sm:p-5">
          <p className="mb-5 hidden text-[9px] font-semibold uppercase tracking-[0.16em] text-muted-foreground sm:block">Your building</p>
          <div className="space-y-1">{nav.map((Icon,i)=><div key={i} className={`flex h-9 items-center gap-2 rounded-full px-3 text-[11px] ${i===0?"bg-secondary text-foreground":"text-muted-foreground"}`}><Icon className="size-3.5"/><span className="hidden sm:inline">{["Today","Levies","Repairs","Paperwork"][i]}</span></div>)}</div>
        </aside>
        <div className="min-w-0 p-4 sm:p-7">
          <div className="mb-7 flex items-end justify-between"><div><p className="text-[10px] text-muted-foreground">Welcome back to your property</p><h3 className="mt-1 text-lg font-medium sm:text-2xl">Here’s what needs your attention.</h3></div><span className="hidden text-[10px] text-muted-foreground sm:block">Everything in one place</span></div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{[["Levies received","8 of 10"],["Owners up to date","8"],["Repairs open","2"],["Insurance renews","18 Nov"]].map(([label,value])=><div key={label} className="border-t border-border/70 pt-3"><p className="text-[9px] text-muted-foreground sm:text-[10px]">{label}</p><p className="mt-2 font-display text-xl font-medium sm:text-2xl">{value}</p></div>)}</div>
          <div className="relative mt-7 grid gap-3 pb-3 sm:min-h-[245px] sm:grid-cols-[1.2fr_.8fr] sm:pb-0">
            <div className="rounded-2xl border border-border/70 bg-card p-5 sm:pb-16"><div className="flex items-center justify-between"><p className="text-xs font-medium">Who has paid their levies</p><span className="text-xs text-muted-foreground">80%</span></div><div className="mt-8 flex h-20 items-end gap-2">{[48,72,58,86,66,92,78].map((height,i)=><span key={i} className="flex-1 rounded-full bg-primary/15" style={{height:`${height}%`}}/>)}</div><p className="mt-4 text-[10px] text-muted-foreground sm:invisible">Two owners need a reminder</p></div>
            <div className="rounded-2xl bg-primary p-5 text-primary-foreground sm:pb-16"><div className="flex justify-between"><p className="text-xs font-medium">Your next deadline</p><CalendarDays className="size-4 opacity-60"/></div><p className="mt-8 font-display text-4xl font-medium">18 Nov</p><p className="mt-2 text-[10px] opacity-70">Insurance renewal</p><div className="mt-5 h-px bg-primary-foreground/15"/></div>

            <div className="grid grid-cols-2 gap-2 sm:absolute sm:inset-x-5 sm:bottom-0 sm:grid-cols-4 sm:gap-3">
              <div className="rounded-xl border border-border bg-card p-3 shadow-sm">
                <div className="flex items-center justify-between"><CalendarCheck className="size-3.5 text-primary"/><span className="text-[8px] uppercase text-muted-foreground">Calendar</span></div>
                <p className="mt-4 text-[10px] font-medium">Annual general meeting</p><p className="mt-1 text-[9px] text-muted-foreground">24 Oct · 6:30 pm</p>
              </div>
              <div className="rounded-xl border border-border bg-secondary p-3 shadow-sm">
                <div className="flex items-center justify-between"><Mail className="size-3.5 text-primary"/><span className="text-[8px] uppercase text-muted-foreground">Meeting</span></div>
                <p className="mt-4 text-[10px] font-medium">Committee meeting</p><p className="mt-1 text-[9px] text-muted-foreground">Invites sent to 4 owners</p>
              </div>
              <div className="rounded-xl border border-border bg-card p-3 shadow-sm">
                <div className="flex items-center justify-between"><WalletCards className="size-3.5 text-primary"/><span className="text-[8px] uppercase text-muted-foreground">Levies</span></div>
                <p className="mt-4 text-[10px] font-medium">Quarterly levy notices</p><p className="mt-1 text-[9px] text-muted-foreground">Two reminders ready to send</p>
              </div>
              <div className="rounded-xl border border-border bg-card p-3 shadow-sm">
                <div className="flex items-center justify-between"><ShieldCheck className="size-3.5 text-primary"/><span className="text-[8px] uppercase text-muted-foreground">Insurance</span></div>
                <p className="mt-4 text-[10px] font-medium">Building insurance</p><p className="mt-1 text-[9px] text-muted-foreground">Renewal due 18 November</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
