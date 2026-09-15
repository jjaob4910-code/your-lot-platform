import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { BarChart3, Bell, Building2, CalendarDays, FileCheck2, Files, Gauge, LayoutDashboard, Menu, Settings, ShieldCheck, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const Route = createFileRoute("/dashboard")({
  head: () => ({ meta: [
    { title: "Dashboard — Your Lot" },
    { name: "description", content: "Your Lot owners corporation dashboard for levies, compliance and maintenance." },
    { property: "og:title", content: "Your Lot dashboard" },
    { property: "og:description", content: "A clear operating view for your owners corporation." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
  ]}), component: DashboardPage,
});

const sections = [
  ["Dashboard", LayoutDashboard], ["Levies", BarChart3], ["Maintenance", Wrench], ["Insurance", ShieldCheck], ["Compliance", FileCheck2], ["Documents", Files], ["Settings", Settings],
] as const;

function NavItems({active, setActive}:{active:string;setActive:(value:string)=>void}) { return <nav className="space-y-1">{sections.map(([label, Icon]) => <Button key={label} variant={active === label ? "default" : "ghost"} className="w-full justify-start" onClick={() => setActive(label)}><Icon className="size-4"/>{label}</Button>)}</nav>; }

function DashboardPage() {
  const [active, setActive] = useState("Dashboard");
  return <div className="min-h-screen bg-secondary/45 lg:grid lg:grid-cols-[236px_1fr]">
    <aside className="hidden min-h-screen border-r border-sidebar-border bg-sidebar p-5 lg:block"><Link to="/" className="flex items-center gap-2 font-display text-xl font-semibold"><span className="grid size-8 place-items-center rounded-lg bg-primary text-primary-foreground"><Building2 className="size-4"/></span>Your Lot.</Link><div className="mt-10"><NavItems active={active} setActive={setActive}/></div><div className="absolute bottom-6 text-xs text-muted-foreground">Self-managed, together.</div></aside>
    <main className="min-w-0">
      <header className="grid h-18 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 border-b border-border bg-background px-4 sm:px-7">
        <Sheet><SheetTrigger asChild><Button size="icon" variant="ghost" className="lg:hidden" aria-label="Open navigation"><Menu/></Button></SheetTrigger><SheetContent side="left"><SheetTitle className="font-display">Your Lot.</SheetTitle><div className="mt-10"><NavItems active={active} setActive={setActive}/></div></SheetContent></Sheet>
        <Select defaultValue="scheme"><SelectTrigger className="w-full max-w-64 bg-card"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="scheme">Select a scheme</SelectItem></SelectContent></Select>
        <div className="flex items-center gap-2"><Button size="icon" variant="ghost" aria-label="Notifications"><Bell/></Button><div className="grid size-9 shrink-0 place-items-center rounded-full bg-chip-yellow text-xs font-semibold">YL</div></div>
      </header>
      <div className="mx-auto max-w-[1500px] p-4 pb-24 sm:p-7 lg:p-9">
        <div className="mb-8"><p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">Workspace</p><h1 className="mt-2 text-3xl font-semibold">{active}</h1><p className="mt-2 text-sm text-muted-foreground">Your scheme information will appear as it is added.</p></div>
        {active !== "Dashboard" ? <Card className="min-h-[460px] bg-card"><CardContent className="flex min-h-[460px] flex-col items-center justify-center text-center"><div className="grid size-14 place-items-center rounded-xl bg-muted"><Gauge className="size-6 text-primary"/></div><h2 className="mt-5 text-xl font-semibold">{active} is ready for your scheme</h2><p className="mt-2 max-w-sm text-sm leading-6 text-muted-foreground">There is no information here yet. Add your scheme details when you are ready.</p></CardContent></Card> : <DashboardOverview/>}
      </div>
    </main>
    <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-4 border-t border-border bg-background p-2 lg:hidden">{sections.slice(0,4).map(([label,Icon]) => <Button key={label} variant="ghost" className={`h-13 flex-col gap-1 px-1 text-[10px] ${active === label ? "text-primary" : "text-muted-foreground"}`} onClick={()=>setActive(label)}><Icon className="size-4"/>{label}</Button>)}</nav>
  </div>;
}

function DashboardOverview() {
  const metrics = [["Levies Collected", BarChart3], ["Compliance Score", FileCheck2], ["Open Maintenance Requests", Wrench], ["Next AGM", CalendarDays]] as const;
  return <div className="space-y-5">
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{metrics.map(([label, Icon]) => <Card key={label} className="bg-card"><CardContent className="p-5"><div className="flex items-start justify-between gap-3"><p className="text-sm text-muted-foreground">{label}</p><Icon className="size-4 shrink-0 text-primary"/></div><p className="mt-6 font-display text-3xl font-semibold">—</p><p className="mt-1 text-xs text-muted-foreground">No data yet</p></CardContent></Card>)}</div>
    <div className="grid gap-5 xl:grid-cols-[1.55fr_1fr]"><Card className="bg-card"><CardHeader><CardTitle>Levy overview</CardTitle></CardHeader><CardContent className="flex min-h-72 flex-col items-center justify-center text-center"><div className="grid size-12 place-items-center rounded-xl bg-muted"><BarChart3 className="size-5 text-primary"/></div><p className="mt-4 max-w-sm text-sm text-muted-foreground">Levy data will appear here once payments are recorded</p></CardContent></Card><Card className="bg-card"><CardHeader><CardTitle>Compliance checklist</CardTitle></CardHeader><CardContent className="space-y-1">{["AGM notice","Insurance renewal","Financial statement","Maintenance plan"].map(item=><div key={item} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-border py-3 last:border-0"><span className="truncate text-sm">{item}</span><span className="rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground">Not started</span></div>)}</CardContent></Card></div>
    <div className="grid gap-5 xl:grid-cols-[1.55fr_1fr]"><Card className="bg-card"><CardHeader><CardTitle>Maintenance requests</CardTitle></CardHeader><CardContent><Table><TableHeader><TableRow><TableHead>Title</TableHead><TableHead>Submitted by</TableHead><TableHead>Status</TableHead><TableHead>Date</TableHead></TableRow></TableHeader><TableBody><TableRow><TableCell colSpan={4} className="h-28 text-center text-muted-foreground">No requests yet</TableCell></TableRow></TableBody></Table></CardContent></Card><Card className="bg-card"><CardHeader><CardTitle>Recent activity</CardTitle></CardHeader><CardContent className="flex min-h-40 items-center justify-center text-sm text-muted-foreground">Activity will show up here</CardContent></Card></div>
  </div>;
}