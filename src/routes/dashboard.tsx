import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Bell, Building2, CalendarDays, ChevronRight, CirclePause, CirclePlay, FileCheck2, Files, Gauge, LayoutDashboard, Menu, Settings, ShieldCheck, Users, WalletCards, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

export const Route = createFileRoute("/dashboard")({
  head: () => ({ meta: [
    { title: "Owners corporation dashboard — Your Lot" },
    { name: "description", content: "A clear operating workspace for levies, compliance, maintenance and records." },
    { property: "og:title", content: "Your Lot owners corporation dashboard" },
    { property: "og:description", content: "A clear operating workspace for your owners corporation." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
  ]}), component: DashboardPage,
});

const sections = [
  ["Dashboard", LayoutDashboard], ["Lots", Building2], ["Levies", WalletCards], ["Maintenance", Wrench],
  ["Insurance", ShieldCheck], ["Compliance", FileCheck2], ["Calendar", CalendarDays], ["Documents", Files],
] as const;

function DashboardPage() {
  const [active, setActive] = useState("Dashboard");
  return <div className="min-h-screen bg-background">
    <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-[1500px] items-center gap-4 px-4 sm:px-7">
        <Link to="/" className="mr-2 flex shrink-0 items-center gap-2 font-display text-lg font-semibold"><span className="grid size-5 grid-cols-2 gap-0.5">{[0,1,2,3].map(i=><span key={i} className="rounded-[2px] bg-primary"/>)}</span><span className="hidden sm:inline">Your Lot</span></Link>
        <nav className="hidden min-w-0 flex-1 items-center gap-1 lg:flex" aria-label="Dashboard sections">{sections.map(([label])=><Button key={label} size="sm" variant={active===label?"default":"ghost"} className="rounded-full px-3 text-xs" onClick={()=>setActive(label)}>{label}</Button>)}</nav>
        <div className="ml-auto flex items-center gap-1">
          <Button size="icon" variant="ghost" aria-label="Settings"><Settings /></Button>
          <Button size="icon" variant="ghost" aria-label="Notifications"><Bell /></Button>
          <span className="ml-1 grid size-8 place-items-center rounded-full border border-border bg-secondary text-[10px] font-semibold">YL</span>
          <Sheet><SheetTrigger asChild><Button size="icon" variant="ghost" className="lg:hidden" aria-label="Open navigation"><Menu/></Button></SheetTrigger><SheetContent side="right"><SheetTitle className="font-display">Workspace</SheetTitle><nav className="mt-8 space-y-1">{sections.map(([label,Icon])=><Button key={label} variant={active===label?"default":"ghost"} className="w-full justify-start" onClick={()=>setActive(label)}><Icon/>{label}</Button>)}</nav></SheetContent></Sheet>
        </div>
      </div>
    </header>

    <main className="mx-auto max-w-[1500px] px-4 pb-24 pt-10 sm:px-7 sm:pt-14">
      {active === "Dashboard" ? <DashboardOverview/> : <EmptySection title={active}/>} 
    </main>
    <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-4 border-t border-border bg-background p-2 lg:hidden">{sections.slice(0,4).map(([label,Icon])=><Button key={label} variant="ghost" className={`h-14 flex-col gap-1 rounded-md px-1 text-[9px] ${active===label?"bg-primary text-primary-foreground":"text-muted-foreground"}`} onClick={()=>setActive(label)}><Icon/>{label}</Button>)}</nav>
  </div>;
}

function EmptySection({title}:{title:string}) {
  return <div><p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Scheme workspace</p><h1 className="mt-4 text-4xl font-medium sm:text-6xl">{title}</h1><div className="mt-12 flex min-h-[430px] flex-col items-center justify-center rounded-xl border border-dashed border-border text-center"><Gauge className="size-5 text-muted-foreground"/><h2 className="mt-5 text-lg font-medium">Nothing here yet</h2><p className="mt-2 max-w-sm text-sm text-muted-foreground">Your scheme information will appear here when it is added.</p></div></div>;
}

function DashboardOverview() {
  const stats = ["Compliance", "Levies collected", "Open requests", "Occupancy", "Next meeting"];
  const tasks = ["AGM Notice", "Insurance Renewal", "Financial Statement", "Maintenance Plan", "Owner Register Update", "Levy Notices", "Meeting Minutes", "Annual Report"];
  const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  return <>
    <div className="flex flex-col justify-between gap-5 md:flex-row md:items-end"><div><p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Scheme overview</p><h1 className="mt-4 text-4xl font-medium leading-tight sm:text-6xl">Welcome back,<br/>[Scheme Name]</h1></div><p className="max-w-sm text-sm leading-6 text-muted-foreground">Your scheme will take shape here as records, payments and obligations are added.</p></div>
    <div className="mt-10 flex gap-2 overflow-x-auto pb-2">{stats.map(label=><div key={label} className="flex shrink-0 items-center gap-5 rounded-full border border-border bg-card px-4 py-2"><span className="text-[10px] font-medium text-muted-foreground">{label}</span><strong className="font-display text-sm font-medium">—</strong></div>)}</div>

    <div className="mt-6 grid gap-5 xl:grid-cols-12">
      <section className="overflow-hidden rounded-xl border border-border bg-card xl:col-span-5"><div className="aspect-[16/7] border-b border-border bg-secondary p-5"><div className="flex h-full items-center justify-center rounded-lg border border-dashed border-border"><Building2 className="size-7 text-muted-foreground"/></div></div><div className="p-6"><div className="flex items-start justify-between gap-4"><div><p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Scheme profile</p><h2 className="mt-2 text-2xl font-medium">[Scheme Name]</h2></div><span className="rounded-full border border-border px-3 py-1 text-xs">Levy —</span></div><div className="mt-7 grid grid-cols-3 border-t border-border pt-5 text-xs"><div><p className="text-muted-foreground">Lots</p><p className="mt-2 font-medium">—</p></div><div><p className="text-muted-foreground">Plan</p><p className="mt-2 font-medium">—</p></div><div><p className="text-muted-foreground">State</p><p className="mt-2 font-medium">—</p></div></div></div></section>

      <section className="rounded-xl border border-border bg-card p-6 xl:col-span-4"><div className="flex items-start justify-between"><div><p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Current period</p><h2 className="mt-2 text-lg font-medium">Levy collection</h2></div><span className="text-2xl">—</span></div><div className="mt-12 flex h-40 items-end gap-3 border-b border-border pb-1">{[1,2,3,4,5,6].map(item=><span key={item} className="h-1 flex-1 rounded-full bg-muted"/>)}</div><div className="mt-4 flex justify-between text-[9px] text-muted-foreground"><span>No payments recorded</span><span>—</span></div></section>

      <section className="rounded-xl border border-border bg-card p-6 xl:col-span-3"><p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Next obligation</p><h2 className="mt-2 text-lg font-medium">Compliance countdown</h2><div className="relative mx-auto mt-8 grid size-36 place-items-center rounded-full border-[10px] border-muted"><div className="text-center"><p className="font-display text-4xl font-medium">—</p><p className="text-[9px] text-muted-foreground">days</p></div></div><div className="mt-7 flex justify-center gap-2"><Button size="icon" variant="outline" aria-label="Start countdown"><CirclePlay/></Button><Button size="icon" variant="outline" aria-label="Pause countdown"><CirclePause/></Button></div></section>

      <section className="rounded-xl bg-primary p-6 text-primary-foreground xl:col-span-7"><div className="flex items-center justify-between"><div><p className="text-[10px] uppercase tracking-[0.14em] text-primary-foreground/55">Annual obligations</p><h2 className="mt-2 text-xl font-medium">Compliance tasks</h2></div><span className="font-display text-2xl">0/8</span></div><div className="mt-7 grid md:grid-cols-2 md:gap-x-8">{tasks.map(task=><div key={task} className="flex items-center gap-3 border-t border-primary-foreground/15 py-3"><span className="size-3.5 rounded-full border border-primary-foreground/40"/><span className="text-xs text-primary-foreground/75">{task}</span></div>)}</div></section>

      <section className="rounded-xl border border-border bg-card px-6 xl:col-span-5"><Accordion type="single" collapsible>{["Fund Contributions","Documents","Owner Register"].map(label=><AccordionItem key={label} value={label}><AccordionTrigger className="py-5 hover:no-underline"><span className="flex items-center gap-3">{label}<span className="font-normal text-muted-foreground">—</span></span></AccordionTrigger><AccordionContent><p className="pb-3 text-muted-foreground">No information added yet.</p></AccordionContent></AccordionItem>)}</Accordion></section>

      <section className="overflow-hidden rounded-xl border border-border bg-card xl:col-span-12"><div className="flex items-center justify-between border-b border-border px-6 py-5"><div><p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Schedule</p><h2 className="mt-1 text-lg font-medium">Calendar</h2></div><Button size="sm" variant="ghost">View calendar <ChevronRight/></Button></div><div className="grid min-w-[680px] grid-cols-7">{days.map((day,i)=><div key={day} className={`min-h-32 p-4 ${i>0?"border-l border-border":""}`}><p className="text-[10px] font-medium text-muted-foreground">{day}</p><p className="mt-2 font-display text-xl">—</p>{(i===1||i===4)&&<div className="mt-7 rounded-md border border-dashed border-border px-2 py-2 text-[9px] text-muted-foreground">Placeholder event</div>}</div>)}</div></section>
    </div>
  </>;
}