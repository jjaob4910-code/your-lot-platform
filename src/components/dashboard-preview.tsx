import { Bell, CalendarCheck, CalendarDays, FileText, LayoutDashboard, WalletCards, Wrench } from "lucide-react";

const nav = [LayoutDashboard, WalletCards, Wrench, FileText];

export function DashboardPreview() {
  return (
    <div className="@container soft-shadow overflow-hidden rounded-2xl border border-border/70 bg-card">
      <div className="flex h-9 items-center justify-between border-b border-border/70 bg-secondary/40 px-3.5 @lg:h-10 @lg:px-4">
        <div className="flex items-center gap-2">
          <span className="size-1.5 rounded-full bg-muted-foreground/40" />
          <span className="text-[8px] font-semibold uppercase tracking-[0.14em] text-muted-foreground @lg:text-[9px]">Your property</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="h-1 w-12 rounded-full bg-muted @lg:w-16" />
          <Bell className="size-3 text-muted-foreground" />
        </div>
      </div>
      <div className="grid grid-cols-[40px_1fr] @lg:grid-cols-[128px_1fr]">
        <aside className="border-r border-border/70 p-2 @lg:p-3">
          <div className="space-y-0.5">
            {nav.map((Icon, i) => (
              <div key={i} className={`flex h-7 items-center gap-2 rounded-full px-2 text-[10px] @lg:h-8 @lg:px-2.5 ${i === 0 ? "bg-secondary text-foreground" : "text-muted-foreground"}`}>
                <Icon className="size-3 shrink-0" />
                <span className="hidden @lg:inline">{["Today", "Levies", "Repairs", "Paperwork"][i]}</span>
              </div>
            ))}
          </div>
        </aside>
        <div className="min-w-0 p-3.5 @lg:p-4">
          <p className="text-[9px] text-muted-foreground">Welcome back to your property</p>
          <h3 className="mt-0.5 text-sm font-medium @lg:text-base">Here&rsquo;s what needs your attention.</h3>

          <div className="mt-3.5 grid grid-cols-2 gap-x-4 gap-y-3 @xl:grid-cols-4">
            {[["Levies received", "8 of 10"], ["Owners up to date", "8"], ["Repairs open", "2"], ["Insurance renews", "18 Nov"]].map(([label, value]) => (
              <div key={label} className="border-t border-border/70 pt-1.5">
                <p className="text-[8px] text-muted-foreground @lg:text-[9px]">{label}</p>
                <p className="mt-0.5 font-display text-sm font-medium @lg:text-lg">{value}</p>
              </div>
            ))}
          </div>

          <div className="mt-3.5 grid gap-2.5 @xl:grid-cols-[1.2fr_.8fr]">
            <div className="rounded-xl border border-border/70 bg-card p-3">
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-medium">Who has paid their levies</p>
                <span className="text-[10px] text-muted-foreground">80%</span>
              </div>
              <div className="mt-3 flex h-9 items-end gap-1 @lg:h-11 @lg:gap-1.5">
                {["40%", "70%", "60%", "80%", "60%", "100%", "80%"].map((height, i) => (
                  <span key={i} className="flex-1 rounded-full bg-primary/15" style={{ height }} />
                ))}
              </div>
              <p className="mt-2 text-[8px] text-muted-foreground @lg:text-[9px]">Two owners need a reminder</p>
            </div>
            <div className="flex items-center justify-between rounded-xl bg-primary p-3 text-primary-foreground">
              <div>
                <p className="text-[10px] font-medium">Your next deadline</p>
                <p className="mt-1 font-display text-lg font-medium @lg:text-xl">18 Nov</p>
                <p className="text-[8px] opacity-70 @lg:text-[9px]">Insurance renewal</p>
              </div>
              <CalendarDays className="size-4 shrink-0 opacity-60" />
            </div>
          </div>

          <div className="mt-2.5 rounded-xl border border-border bg-card px-3 py-2">
            <p className="text-[8px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Coming up</p>
            <div className="mt-1.5 space-y-1.5">
              {[
                { Icon: CalendarCheck, title: "Annual general meeting", detail: "24 Oct, 6:30 pm" },
                { Icon: WalletCards, title: "Quarterly levy notices", detail: "Two reminders ready to send" },
                { Icon: Wrench, title: "Building insurance", detail: "Renewal due 18 November" },
              ].map(({ Icon, title, detail }) => (
                <div key={title} className="flex items-center gap-2 border-t border-border/60 pt-1.5 first:border-t-0 first:pt-0">
                  <Icon className="size-3 shrink-0 text-primary" />
                  <p className="truncate text-[10px] font-medium">{title}</p>
                  <p className="ml-auto shrink-0 text-[8px] text-muted-foreground @lg:text-[9px]">{detail}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
