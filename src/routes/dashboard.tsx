import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowUpRight, Bell, Building2, CalendarDays, ChevronRight, FileCheck2, Files, LayoutDashboard, Menu, Plus, Settings, ShieldCheck, Sparkles, WalletCards, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";


export const Route = createFileRoute("/dashboard")({
  head: () => ({ meta: [
    { title: "Your property dashboard | Your Lot" },
    { name: "description", content: "One calm place to run your building: levies, compliance, repairs, insurance and records, without a manager." },
    { property: "og:title", content: "Your property dashboard | Your Lot" },
    { property: "og:description", content: "One calm place to run your building: levies, compliance, repairs and records." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
  ]}), component: DashboardPage,
});

const sections = [
  ["Dashboard", LayoutDashboard], ["Lots", Building2], ["Levies", WalletCards], ["Maintenance", Wrench],
  ["Insurance", ShieldCheck], ["Compliance", FileCheck2], ["Calendar", CalendarDays], ["Documents", Files],
] as const;

const sectionBlurb: Record<string, string> = {
  Lots: "Who owns what, who lives there, and how each owner's share of costs is worked out.",
  Levies: "Raise a levy, see who has paid, and chase the ones who haven't, without an awkward phone call.",
  Maintenance: "Log a leak, get quotes and keep a dated trail of every repair on your building.",
  Insurance: "Your policy, your sum insured and your renewal date, where you can actually find them.",
  Compliance: "The things the law expects each year, in plain English, with dates attached.",
  Calendar: "Meetings, renewals and deadlines for your property in one timeline.",
  Documents: "Minutes, certificates, invoices and plans, filed once, findable forever.",
};

function DashboardPage() {
  const [active, setActive] = useState("Dashboard");
  return <div className="relative isolate min-h-screen bg-background">
    
    <header className="sticky top-0 z-40 border-b border-border/70 bg-background/80 backdrop-blur-xl">
      <div className="mx-auto flex h-[68px] max-w-[1500px] items-center gap-4 px-4 sm:px-7">
        <Link to="/" className="mr-2 flex shrink-0 items-center gap-2 font-display text-lg font-semibold tracking-[-0.02em]"><span className="grid size-5 grid-cols-2 gap-0.5">{[0,1,2,3].map(i=><span key={i} className="rounded-[2px] bg-primary"/>)}</span><span className="hidden sm:inline">Your Lot</span></Link>
        <nav className="hidden min-w-0 flex-1 items-center gap-1 lg:flex" aria-label="Dashboard sections">{sections.map(([label])=><Button key={label} size="sm" variant={active===label?"default":"ghost"} className="rounded-full px-3.5 text-xs font-medium transition-all duration-300" onClick={()=>setActive(label)}>{label}</Button>)}</nav>
        <div className="ml-auto flex items-center gap-1">
          <Button size="icon" variant="ghost" className="rounded-full" aria-label="Settings"><Settings /></Button>
          <Button size="icon" variant="ghost" className="rounded-full" aria-label="Notifications"><Bell /></Button>
          <span className="ml-1 grid size-8 place-items-center rounded-full border border-border bg-secondary text-[10px] font-semibold">YL</span>
          <Sheet><SheetTrigger asChild><Button size="icon" variant="ghost" className="rounded-full lg:hidden" aria-label="Open navigation"><Menu/></Button></SheetTrigger><SheetContent side="right"><SheetTitle className="font-display">Your property</SheetTitle><nav className="mt-8 space-y-1">{sections.map(([label,Icon])=><Button key={label} variant={active===label?"default":"ghost"} className="w-full justify-start rounded-full" onClick={()=>setActive(label)}><Icon/>{label}</Button>)}</nav></SheetContent></Sheet>
        </div>
      </div>
    </header>

    <main className="mx-auto max-w-[1500px] px-4 pb-32 pt-10 sm:px-7 sm:pt-14">
      {active === "Dashboard" ? <DashboardOverview/> : <EmptySection title={active}/>}
    </main>
    <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-4 border-t border-border/70 bg-background/90 p-2 backdrop-blur-xl lg:hidden">{sections.slice(0,4).map(([label,Icon])=><Button key={label} variant="ghost" className={`h-14 flex-col gap-1 rounded-2xl px-1 text-[9px] ${active===label?"bg-primary text-primary-foreground":"text-muted-foreground"}`} onClick={()=>setActive(label)}><Icon/>{label}</Button>)}</nav>
  </div>;
}

function EmptySection({title}:{title:string}) {
  return <div>
    <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Your property</p>
    <h1 className="mt-4 text-4xl font-medium tracking-[-0.035em] sm:text-6xl">{title}</h1>
    <p className="mt-5 max-w-xl text-[15px] leading-7 text-muted-foreground">{sectionBlurb[title] ?? "Everything for your building, in one place."}</p>
    <div className="soft-shadow mt-12 flex min-h-[420px] flex-col items-center justify-center rounded-3xl border border-border/70 bg-card px-6 text-center">
      <span className="grid size-12 place-items-center rounded-2xl bg-secondary"><Sparkles className="size-5 text-muted-foreground"/></span>
      <h2 className="mt-6 text-xl font-medium tracking-[-0.02em]">Nothing here yet, and that's fine</h2>
      <p className="mt-3 max-w-md text-sm leading-6 text-muted-foreground">Add your first entry and this page starts doing the remembering for you.</p>
      <Button className="mt-7 rounded-full px-5"><Plus/> Add your first {title.toLowerCase().replace(/s$/, "")}</Button>
    </div>
  </div>;
}

function DashboardOverview() {
  const stats: [string, string][] = [
    ["Money in your accounts", "Nothing recorded yet"],
    ["Owners paid up", "No levies raised"],
    ["Repairs waiting on you", "All quiet"],
    ["Insurance renews", "Not added"],
    ["Next meeting", "None scheduled"],
  ];
  const tasks = [
    ["Call your AGM", "Every owner needs notice in writing"],
    ["Renew building insurance", "Cover must never lapse"],
    ["Prepare the annual accounts", "What came in, what went out"],
    ["Review your maintenance plan", "What breaks next, and what it costs"],
    ["Update the owner register", "Names, lots, contact details"],
    ["Issue levy notices", "So owners know what's due and when"],
    ["Circulate meeting minutes", "Decisions, written down"],
    ["File the annual report", "One tidy record of the year"],
  ];
  const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  return <>
    <div className="flex flex-col justify-between gap-6 md:flex-row md:items-end">
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Monday morning, your building</p>
        <h1 className="mt-4 text-4xl font-medium leading-[1.02] tracking-[-0.04em] sm:text-6xl">Good morning.<br/>Nothing needs you today.</h1>
      </div>
      <p className="max-w-sm text-[15px] leading-7 text-muted-foreground">This is your property, not a scheme number in someone else's filing cabinet. As you add owners, money and dates, this page tells you exactly what's due and what you can ignore.</p>
    </div>

    <div className="mt-10 flex gap-3 overflow-x-auto pb-2">{stats.map(([label, hint])=>
      <div key={label} className="min-w-[210px] shrink-0 rounded-3xl border border-border/70 bg-card p-5 transition-shadow duration-300 hover:shadow-[0_18px_50px_-32px_color-mix(in_oklab,var(--foreground)_40%,transparent)]">
        <p className="text-[11px] font-medium text-muted-foreground">{label}</p>
        <p className="mt-4 font-display text-3xl font-medium tracking-[-0.03em]">—</p>
        <p className="mt-2 text-[11px] text-muted-foreground/80">{hint}</p>
      </div>)}
    </div>

    <div className="mt-5 grid gap-5 xl:grid-cols-12">
      <section className="soft-shadow overflow-hidden rounded-3xl border border-border/70 bg-card xl:col-span-5">
        <div className="aspect-[16/7] border-b border-border/70 bg-secondary p-5"><div className="flex h-full items-center justify-center rounded-2xl border border-dashed border-border"><Building2 className="size-7 text-muted-foreground"/></div></div>
        <div className="p-7">
          <div className="flex items-start justify-between gap-4">
            <div><p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Your building</p><h2 className="mt-2 text-2xl font-medium tracking-[-0.03em]">Add your address</h2></div>
            <Button size="sm" variant="outline" className="rounded-full"><Plus/> Set up</Button>
          </div>
          <p className="mt-3 text-[13px] leading-6 text-muted-foreground">Your plan number, your lots and your state rules, entered once, used everywhere else.</p>
          <div className="mt-7 grid grid-cols-3 border-t border-border/70 pt-5 text-xs">
            <div><p className="text-muted-foreground">Homes</p><p className="mt-2 font-medium">—</p></div>
            <div><p className="text-muted-foreground">Plan no.</p><p className="mt-2 font-medium">—</p></div>
            <div><p className="text-muted-foreground">State</p><p className="mt-2 font-medium">—</p></div>
          </div>
        </div>
      </section>

      <section className="soft-shadow rounded-3xl border border-border/70 bg-card p-7 xl:col-span-4">
        <div className="flex items-start justify-between">
          <div><p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">This quarter</p><h2 className="mt-2 text-lg font-medium tracking-[-0.02em]">Who has paid their levies</h2></div>
          <span className="font-display text-2xl">—</span>
        </div>
        <p className="mt-3 text-[13px] leading-6 text-muted-foreground">You'll see each owner, what they owe, and who needs a reminder. No spreadsheet required.</p>
        <div className="mt-10 flex h-36 items-end gap-3 border-b border-border/70 pb-1">{[1,2,3,4,5,6].map(item=><span key={item} className="h-1 flex-1 rounded-full bg-muted"/>)}</div>
        <div className="mt-4 flex justify-between text-[10px] text-muted-foreground"><span>No payments recorded yet</span><span>—</span></div>
      </section>

      <section className="soft-shadow rounded-3xl border border-border/70 bg-card p-7 xl:col-span-3">
        <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Nothing overdue</p>
        <h2 className="mt-2 text-lg font-medium tracking-[-0.02em]">Days until your next deadline</h2>
        <div className="relative mx-auto mt-8 grid size-36 place-items-center rounded-full border-[10px] border-muted">
          <div className="text-center"><p className="font-display text-4xl font-medium tracking-[-0.04em]">—</p><p className="text-[10px] text-muted-foreground">days</p></div>
        </div>
        <p className="mt-7 text-center text-[12px] leading-6 text-muted-foreground">Add a renewal or meeting date and we'll count it down, then nudge you in time.</p>
      </section>

      <section className="soft-shadow rounded-3xl bg-primary p-7 text-primary-foreground xl:col-span-7">
        <div className="flex items-center justify-between">
          <div><p className="text-[10px] uppercase tracking-[0.14em] text-primary-foreground/55">What the law expects of you each year</p><h2 className="mt-2 text-xl font-medium tracking-[-0.025em]">Your eight yearly jobs</h2></div>
          <span className="font-display text-2xl">0/8</span>
        </div>
        <div className="mt-7 grid md:grid-cols-2 md:gap-x-8">{tasks.map(([task, why])=>
          <div key={task} className="flex items-start gap-3 border-t border-primary-foreground/15 py-3.5">
            <span className="mt-0.5 size-3.5 shrink-0 rounded-full border border-primary-foreground/40"/>
            <span><span className="block text-[13px] text-primary-foreground/90">{task}</span><span className="block text-[11px] text-primary-foreground/50">{why}</span></span>
          </div>)}
        </div>
      </section>

      <section className="soft-shadow rounded-3xl border border-border/70 bg-card px-7 xl:col-span-5">
        <Accordion type="single" collapsible>{([
          ["Your savings for big repairs", "Roofs, driveways, paint. Money set aside before you need it."],
          ["Your paperwork", "Certificates, minutes and invoices, filed by year."],
          ["Your neighbours", "Owners, tenants and how to reach them."],
        ] as [string, string][]).map(([label, body])=>
          <AccordionItem key={label} value={label}>
            <AccordionTrigger className="py-5 text-left hover:no-underline"><span className="flex items-center gap-3">{label}<span className="font-normal text-muted-foreground">—</span></span></AccordionTrigger>
            <AccordionContent><p className="pb-4 text-muted-foreground">{body} Nothing added yet.</p></AccordionContent>
          </AccordionItem>)}
        </Accordion>
      </section>

      <section className="soft-shadow overflow-hidden rounded-3xl border border-border/70 bg-card xl:col-span-12">
        <div className="flex items-center justify-between border-b border-border/70 px-7 py-5">
          <div><p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Your week</p><h2 className="mt-1 text-lg font-medium tracking-[-0.02em]">Nothing booked in yet</h2></div>
          <Button size="sm" variant="ghost" className="rounded-full">Open calendar <ChevronRight/></Button>
        </div>
        <div className="overflow-x-auto"><div className="grid min-w-[680px] grid-cols-7">{days.map((day,i)=>
          <div key={day} className={`min-h-32 p-5 ${i>0?"border-l border-border/70":""}`}>
            <p className="text-[10px] font-medium text-muted-foreground">{day}</p>
            <p className="mt-2 font-display text-xl text-muted-foreground/50">—</p>
          </div>)}
        </div></div>
        <div className="flex items-center justify-between gap-4 border-t border-border/70 px-7 py-5 text-[13px] text-muted-foreground">
          <p>Meetings, renewals and repair visits land here so no one has to remember them.</p>
          <Button size="sm" variant="outline" className="rounded-full">Add a date <ArrowUpRight/></Button>
        </div>
      </section>
    </div>
  </>;
}
