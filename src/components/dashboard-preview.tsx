import { Bell, CalendarCheck, CalendarDays, FileText, LayoutDashboard, Mail, ShieldCheck, WalletCards, Wrench } from "lucide-react";

const nav = [LayoutDashboard, WalletCards, Wrench, FileText];

export function DashboardPreview() {
  return (
    <div className="@container soft-shadow overflow-hidden rounded-2xl border border-border/70 bg-card">
      <div className="flex h-11 items-center justify-between border-b border-border/70 bg-secondary/40 px-4 @lg:h-12 @lg:px-5">
        <div className="flex items-center gap-2.5">
          <span className="size-2 rounded-full bg-muted-foreground/40" />
          <span className="text-[9px] font-semibold uppercase tracking-[0.14em] text-muted-foreground @lg:text-[10px]">Your property</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="h-1.5 w-14 rounded-full bg-muted @lg:w-20" />
          <Bell className="size-3.5 text-muted-foreground" />
        </div>
      </div>
      <div className="grid grid-cols-[46px_1fr] @lg:grid-cols-[150px_1fr]">
        <aside className="border-r border-border/70 p-2.5 @lg:p-4">
          <p className="mb-4 hidden text-[9px] font-semibold uppercase tracking-[0.16em] text-muted-foreground @lg:block">Your building</p>
          <div className="space-y-1">
            {nav.map((Icon, i) => (
              <div key={i} className={`flex h-8 items-center gap-2 rounded-full px-2.5 text-[11px] @lg:h-9 @lg:px-3 ${i === 0 ? "bg-secondary text-foreground" : "text-muted-foreground"}`}>
                <Icon className="size-3.5 shrink-0" />
                <span className="hidden @lg:inline">{["Today", "Levies", "Repairs", "Paperwork"][i]}</span>
              </div>
            ))}
          </div>
        </aside>
        <div className="min-w-0 p-4 @lg:p-6">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-[9px] text-muted-foreground @lg:text-[10px]">Welcome back to your property</p>
              <h3 className="mt-1 text-base font-medium @lg:text-xl">Here&rsquo;s what needs your attention.</h3>
            </div>
            <span className="hidden text-[10px] text-muted-foreground @xl:block">Everything in one place</span>
          </div>
          <div className="mt-5 grid grid-cols-2 gap-x-4 gap-y-4 @xl:grid-cols-4">
            {[["Levies received", "8 of 10"], ["Owners up to date", "8"], ["Repairs open", "2"], ["Insurance renews", "18 Nov"]].map(([label, value]) => (
              <div key={label} className="border-t border-border/70 pt-2.5">
                <p className="text-[9px] text-muted-foreground @lg:text-[10px]">{label}</p>
                <p className="mt-1.5 font-display text-lg font-medium @lg:mt-2 @lg:text-2xl">{value}</p>
              </div>
            ))}
          </div>
          <div className="mt-5 grid gap-3 @lg:mt-6 @xl:grid-cols-[1.2fr_.8fr]">
            <div className="rounded-2xl border border-border/70 bg-card p-4 @lg:p-5">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium">Who has paid their levies</p>
                <span className="text-xs text-muted-foreground">80%</span>
              </div>
              <div className="mt-6 flex h-16 items-end gap-1.5 @lg:mt-8 @lg:h-20 @lg:gap-2">
                {["40%", "70%", "60%", "80%", "60%", "100%", "80%"].map((height, i) => (
                  <span key={i} className="flex-1 rounded-full bg-primary/15" style={{ height }} />
                ))}
              </div>
              <p className="mt-3 text-[10px] text-muted-foreground @lg:mt-4">Two owners need a reminder</p>
            </div>
            <div className="rounded-2xl bg-primary p-4 text-primary-foreground @lg:p-5">
              <div className="flex justify-between">
                <p className="text-xs font-medium">Your next deadline</p>
                <CalendarDays className="size-4 opacity-60" />
              </div>
              <p className="mt-5 font-display text-2xl font-medium @lg:mt-8 @lg:text-4xl">18 Nov</p>
              <p className="mt-1.5 text-[10px] opacity-70 @lg:mt-2">Insurance renewal</p>
              <div className="mt-4 h-px bg-primary-foreground/15 @lg:mt-5" />
            </div>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3 @lg:mt-4 @xl:grid-cols-4">
            <div className="rounded-xl border border-border bg-card p-3 shadow-sm">
              <div className="flex items-center justify-between"><CalendarCheck className="size-3.5 text-primary" /><span className="text-[8px] uppercase text-muted-foreground">Calendar</span></div>
              <p className="mt-3 text-[10px] font-medium @lg:mt-4">Annual general meeting</p>
              <p className="mt-1 text-[9px] text-muted-foreground">24 Oct · 6:30 pm</p>
            </div>
            <div className="rounded-xl border border-border bg-secondary p-3 shadow-sm">
              <div className="flex items-center justify-between"><Mail className="size-3.5 text-primary" /><span className="text-[8px] uppercase text-muted-foreground">Meeting</span></div>
              <p className="mt-3 text-[10px] font-medium @lg:mt-4">Committee meeting</p>
              <p className="mt-1 text-[9px] text-muted-foreground">Invites sent to 4 owners</p>
            </div>
            <div className="rounded-xl border border-border bg-card p-3 shadow-sm">
              <div className="flex items-center justify-between"><WalletCards className="size-3.5 text-primary" /><span className="text-[8px] uppercase text-muted-foreground">Levies</span></div>
              <p className="mt-3 text-[10px] font-medium @lg:mt-4">Quarterly levy notices</p>
              <p className="mt-1 text-[9px] text-muted-foreground">Two reminders ready to send</p>
            </div>
            <div className="rounded-xl border border-border bg-card p-3 shadow-sm">
              <div className="flex items-center justify-between"><ShieldCheck className="size-3.5 text-primary" /><span className="text-[8px] uppercase text-muted-foreground">Insurance</span></div>
              <p className="mt-3 text-[10px] font-medium @lg:mt-4">Building insurance</p>
              <p className="mt-1 text-[9px] text-muted-foreground">Renewal due 18 November</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
