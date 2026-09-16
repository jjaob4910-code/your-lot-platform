import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { ArrowUpRight, Bell, Building2, CalendarDays, Check, ChevronRight, FileCheck2, Files, LayoutDashboard, Menu, Plus, Settings, ShieldCheck, Sparkles, Trash2, WalletCards, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";

export const Route = createFileRoute("/dashboard")({
  head: () => ({ meta: [
    { title: "Your property dashboard | Loty" },
    { name: "description", content: "One calm place to run your building: levies, compliance, repairs, insurance and records, without a manager." },
    { property: "og:title", content: "Your property dashboard | Loty" },
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

const entryLabels: Record<string, { single: string; field: string; hint: string }> = {
  Lots: { single: "lot", field: "Owner or lot number", hint: "e.g. Lot 3, Jane Citizen" },
  Levies: { single: "levy", field: "Levy name and amount", hint: "e.g. Admin fund, quarter one" },
  Maintenance: { single: "repair", field: "What needs fixing", hint: "e.g. Leaking gutter, block B" },
  Insurance: { single: "policy", field: "Policy name", hint: "e.g. Building insurance" },
  Compliance: { single: "obligation", field: "What's required", hint: "e.g. Fire safety statement" },
  Calendar: { single: "date", field: "What's happening", hint: "e.g. Annual general meeting" },
  Documents: { single: "document", field: "Document name", hint: "e.g. Minutes, October AGM" },
};

type Building = { address: string; planNo: string; state: string; homes: string };
type Entry = { title: string; detail: string };

function DashboardPage() {
  const [active, setActive] = useState("Dashboard");
  const [building, setBuilding] = useState<Building | null>(null);
  const [entries, setEntries] = useState<Record<string, Entry[]>>({});
  const [doneTasks, setDoneTasks] = useState<Set<string>>(new Set());
  const [meetings, setMeetings] = useState<Entry[]>([]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [noticesOpen, setNoticesOpen] = useState(false);

  const addEntry = (section: string, entry: Entry) => {
    setEntries(prev => ({ ...prev, [section]: [...(prev[section] ?? []), entry] }));
    toast(`Added to ${section.toLowerCase()}`, { description: entry.title });
  };
  const removeEntry = (section: string, index: number) => {
    setEntries(prev => ({ ...prev, [section]: (prev[section] ?? []).filter((_, i) => i !== index) }));
  };
  const toggleTask = (task: string) => {
    setDoneTasks(prev => {
      const next = new Set(prev);
      if (next.has(task)) next.delete(task); else next.add(task);
      return next;
    });
  };

  return <div className="relative isolate min-h-screen bg-background">
    <Toaster />
    <header className="sticky top-0 z-40 border-b border-border/70 bg-background/80 backdrop-blur-xl">
      <div className="mx-auto flex h-[68px] max-w-[1500px] items-center gap-4 px-4 sm:px-7">
        <Link to="/" className="mr-2 flex shrink-0 items-center gap-2 font-display text-lg font-semibold tracking-[-0.02em]"><span className="grid size-5 grid-cols-2 gap-0.5">{[0,1,2,3].map(i=><span key={i} className="rounded-[2px] bg-primary"/>)}</span><span className="hidden sm:inline">Loty</span></Link>
        <nav className="hidden min-w-0 flex-1 items-center gap-1 lg:flex" aria-label="Dashboard sections">{sections.map(([label])=><Button key={label} size="sm" variant={active===label?"default":"ghost"} className="rounded-full px-3.5 text-xs font-medium transition-all duration-300" onClick={()=>setActive(label)}>{label}</Button>)}</nav>
        <div className="ml-auto flex items-center gap-1">
          <Button size="icon" variant="ghost" className="rounded-full" aria-label="Settings" onClick={()=>setSettingsOpen(true)}><Settings /></Button>
          <Button size="icon" variant="ghost" className="rounded-full" aria-label="Notifications" onClick={()=>setNoticesOpen(true)}><Bell /></Button>
          <span className="ml-1 grid size-8 place-items-center rounded-full border border-border bg-secondary text-[10px] font-semibold">ME</span>
          <Sheet><SheetTrigger asChild><Button size="icon" variant="ghost" className="rounded-full lg:hidden" aria-label="Open navigation"><Menu/></Button></SheetTrigger><SheetContent side="right"><SheetTitle className="font-display">Your property</SheetTitle><nav className="mt-8 space-y-1">{sections.map(([label,Icon])=><Button key={label} variant={active===label?"default":"ghost"} className="w-full justify-start rounded-full" onClick={()=>setActive(label)}><Icon/>{label}</Button>)}</nav></SheetContent></Sheet>
        </div>
      </div>
    </header>

    <main className="mx-auto max-w-[1500px] px-4 pb-32 pt-10 sm:px-7 sm:pt-14">
      {active === "Dashboard"
        ? <DashboardOverview building={building} setBuilding={setBuilding} doneTasks={doneTasks} toggleTask={toggleTask} meetings={meetings} addMeeting={(m)=>setMeetings(prev=>[...prev,m])} entries={entries} goTo={setActive}/>
        : <SectionPage title={active} entries={entries[active] ?? []} onAdd={(e)=>addEntry(active, e)} onRemove={(i)=>removeEntry(active, i)}/>}
    </main>
    <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-4 border-t border-border/70 bg-background/90 p-2 backdrop-blur-xl lg:hidden">{sections.slice(0,4).map(([label,Icon])=><Button key={label} variant="ghost" className={`h-14 flex-col gap-1 rounded-2xl px-1 text-[9px] ${active===label?"bg-primary text-primary-foreground":"text-muted-foreground"}`} onClick={()=>setActive(label)}><Icon/>{label}</Button>)}</nav>

    <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
      <DialogContent>
        <DialogHeader><DialogTitle className="font-display tracking-[-0.02em]">Settings</DialogTitle><DialogDescription>Your property preferences will live here. For now there's nothing to change.</DialogDescription></DialogHeader>
        <div className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">Nothing to set up yet. Add your building first.</div>
      </DialogContent>
    </Dialog>
    <Dialog open={noticesOpen} onOpenChange={setNoticesOpen}>
      <DialogContent>
        <DialogHeader><DialogTitle className="font-display tracking-[-0.02em]">Notifications</DialogTitle><DialogDescription>Reminders about levies, renewals and meetings will appear here.</DialogDescription></DialogHeader>
        <div className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">You're all caught up.</div>
      </DialogContent>
    </Dialog>
  </div>;
}

function SectionPage({title, entries, onAdd, onRemove}:{title:string; entries:Entry[]; onAdd:(e:Entry)=>void; onRemove:(i:number)=>void}) {
  const [open, setOpen] = useState(false);
  const meta = entryLabels[title] ?? { single: "entry", field: "Name", hint: "" };
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const entryTitle = String(data.get("title") ?? "").trim();
    if (!entryTitle) return;
    onAdd({ title: entryTitle, detail: String(data.get("detail") ?? "").trim() });
    setOpen(false);
  };
  return <div>
    <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Your property</p>
    <h1 className="mt-4 text-4xl font-medium tracking-[-0.035em] sm:text-6xl">{title}</h1>
    <p className="mt-5 max-w-xl text-[15px] leading-7 text-muted-foreground">{sectionBlurb[title] ?? "Everything for your building, in one place."}</p>

    {entries.length > 0 && <div className="soft-shadow mt-12 divide-y divide-border/70 rounded-3xl border border-border/70 bg-card">
      {entries.map((entry, i) =>
        <div key={`${entry.title}-${i}`} className="flex items-start justify-between gap-4 px-7 py-5">
          <div><p className="text-sm font-medium">{entry.title}</p>{entry.detail && <p className="mt-1 text-[13px] text-muted-foreground">{entry.detail}</p>}</div>
          <Button size="icon" variant="ghost" className="shrink-0 rounded-full" aria-label={`Remove ${entry.title}`} onClick={()=>onRemove(i)}><Trash2 className="size-4"/></Button>
        </div>)}
    </div>}

    <div className={`soft-shadow mt-${entries.length>0?"5":"12"} flex min-h-[300px] flex-col items-center justify-center rounded-3xl border ${entries.length>0?"border-dashed":"border-border/70"} bg-card px-6 py-14 text-center`}>
      <span className="grid size-12 place-items-center rounded-2xl bg-secondary"><Sparkles className="size-5 text-muted-foreground"/></span>
      <h2 className="mt-6 text-xl font-medium tracking-[-0.02em]">{entries.length>0 ? `Add another ${meta.single}` : "Nothing here yet, and that's fine"}</h2>
      <p className="mt-3 max-w-md text-sm leading-6 text-muted-foreground">Add your first entry and this page starts doing the remembering for you.</p>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild><Button className="mt-7 rounded-full px-5"><Plus/> Add your first {meta.single}</Button></DialogTrigger>
        <DialogContent>
          <DialogHeader><DialogTitle className="font-display tracking-[-0.02em]">Add a {meta.single}</DialogTitle><DialogDescription>{sectionBlurb[title]}</DialogDescription></DialogHeader>
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-2"><Label htmlFor="entry-title">{meta.field}</Label><Input id="entry-title" name="title" placeholder={meta.hint} required autoFocus/></div>
            <div className="space-y-2"><Label htmlFor="entry-detail">Notes (optional)</Label><Textarea id="entry-detail" name="detail" placeholder="Anything worth remembering about it"/></div>
            <div className="flex justify-end gap-2 pt-2"><Button type="button" variant="ghost" className="rounded-full" onClick={()=>setOpen(false)}>Cancel</Button><Button type="submit" className="rounded-full">Save</Button></div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  </div>;
}

function DashboardOverview({building, setBuilding, doneTasks, toggleTask, meetings, addMeeting, entries, goTo}:{
  building: Building|null; setBuilding:(b:Building)=>void;
  doneTasks: Set<string>; toggleTask:(t:string)=>void;
  meetings: Entry[]; addMeeting:(m:Entry)=>void;
  entries: Record<string, Entry[]>; goTo:(s:string)=>void;
}) {
  const [setupOpen, setSetupOpen] = useState(false);
  const [dateOpen, setDateOpen] = useState(false);
  const repairCount = (entries["Maintenance"] ?? []).length;
  const stats: [string, string, string][] = [
    ["Money in your accounts", "—", "Nothing recorded yet"],
    ["Owners paid up", "—", "No levies raised"],
    ["Repairs waiting on you", repairCount > 0 ? String(repairCount) : "—", repairCount > 0 ? "Logged by you" : "All quiet"],
    ["Insurance renews", "—", "Not added"],
    ["Next meeting", meetings.length > 0 ? (meetings[0]?.title ?? "—") : "—", meetings.length > 0 ? "Scheduled by you" : "None scheduled"],
  ];
  const tasks: [string, string][] = [
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

  const submitBuilding = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const address = String(data.get("address") ?? "").trim();
    if (!address) return;
    setBuilding({ address, planNo: String(data.get("planNo") ?? "").trim(), state: String(data.get("state") ?? ""), homes: String(data.get("homes") ?? "").trim() });
    setSetupOpen(false);
    toast("Your building is set up", { description: address });
  };
  const submitDate = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const title = String(data.get("title") ?? "").trim();
    if (!title) return;
    addMeeting({ title, detail: String(data.get("day") ?? "") });
    setDateOpen(false);
    toast("Added to your calendar", { description: title });
  };

  return <>
    <div className="max-w-2xl">
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Monday morning, your building</p>
      <h1 className="mt-4 text-4xl font-medium leading-[1.02] tracking-[-0.04em] sm:text-6xl">Good morning.<br/>Here's what's happening at your property.</h1>
      <p className="mt-5 text-[15px] leading-7 text-muted-foreground">Levies, repairs and deadlines, all in one place. Loty keeps an eye on the details so you can get on with your week.</p>
    </div>

    <div className="mt-10 flex gap-3 overflow-x-auto pb-2">{stats.map(([label, value, hint])=>
      <div key={label} className="min-w-[210px] shrink-0 rounded-3xl border border-border/70 bg-card p-5 transition-shadow duration-300 hover:shadow-[0_18px_50px_-32px_color-mix(in_oklab,var(--foreground)_40%,transparent)]">
        <p className="text-[11px] font-medium text-muted-foreground">{label}</p>
        <p className="mt-4 truncate font-display text-3xl font-medium tracking-[-0.03em]">{value}</p>
        <p className="mt-2 text-[11px] text-muted-foreground/80">{hint}</p>
      </div>)}
    </div>

    <div className="mt-5 grid gap-5 xl:grid-cols-12">
      <section className="soft-shadow overflow-hidden rounded-3xl border border-border/70 bg-card xl:col-span-5">
        <div className="aspect-[16/7] border-b border-border/70 bg-secondary p-5"><div className="flex h-full items-center justify-center rounded-2xl border border-dashed border-border"><Building2 className="size-7 text-muted-foreground"/></div></div>
        <div className="p-7">
          <div className="flex items-start justify-between gap-4">
            <div><p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Your building</p><h2 className="mt-2 text-2xl font-medium tracking-[-0.03em]">{building ? building.address : "Add your address"}</h2></div>
            <Dialog open={setupOpen} onOpenChange={setSetupOpen}>
              <DialogTrigger asChild><Button size="sm" variant="outline" className="rounded-full"><Plus/> {building ? "Edit" : "Set up"}</Button></DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle className="font-display tracking-[-0.02em]">Set up your building</DialogTitle><DialogDescription>Entered once, used everywhere else.</DialogDescription></DialogHeader>
                <form onSubmit={submitBuilding} className="space-y-4">
                  <div className="space-y-2"><Label htmlFor="address">Street address</Label><Input id="address" name="address" placeholder="e.g. 12 Banksia Street, Brunswick" required autoFocus defaultValue={building?.address}/></div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2"><Label htmlFor="planNo">Plan number</Label><Input id="planNo" name="planNo" placeholder="e.g. SP 12345" defaultValue={building?.planNo}/></div>
                    <div className="space-y-2"><Label htmlFor="homes">Number of homes</Label><Input id="homes" name="homes" type="number" min="1" placeholder="e.g. 8" defaultValue={building?.homes}/></div>
                  </div>
                  <div className="space-y-2"><Label>State</Label><Select name="state" defaultValue={building?.state ?? ""}><SelectTrigger className="w-full"><SelectValue placeholder="Choose your state"/></SelectTrigger><SelectContent>{["NSW","VIC","QLD","SA","WA","TAS","ACT","NT"].map(s=><SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select></div>
                  <div className="flex justify-end gap-2 pt-2"><Button type="button" variant="ghost" className="rounded-full" onClick={()=>setSetupOpen(false)}>Cancel</Button><Button type="submit" className="rounded-full">Save building</Button></div>
                </form>
              </DialogContent>
            </Dialog>
          </div>
          <p className="mt-3 text-[13px] leading-6 text-muted-foreground">Your plan number, your lots and your state rules, entered once, used everywhere else.</p>
          <div className="mt-7 grid grid-cols-3 border-t border-border/70 pt-5 text-xs">
            <div><p className="text-muted-foreground">Homes</p><p className="mt-2 font-medium">{building?.homes || "—"}</p></div>
            <div><p className="text-muted-foreground">Plan no.</p><p className="mt-2 font-medium">{building?.planNo || "—"}</p></div>
            <div><p className="text-muted-foreground">State</p><p className="mt-2 font-medium">{building?.state || "—"}</p></div>
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
        <div className="mt-4 flex items-center justify-between text-[10px] text-muted-foreground"><span>No payments recorded yet</span><Button size="sm" variant="ghost" className="h-7 rounded-full px-3 text-[11px]" onClick={()=>goTo("Levies")}>Raise a levy <ChevronRight/></Button></div>
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
          <span className="font-display text-2xl">{doneTasks.size}/8</span>
        </div>
        <div className="mt-7 grid md:grid-cols-2 md:gap-x-8">{tasks.map(([task, why])=>{
          const done = doneTasks.has(task);
          return <button key={task} type="button" onClick={()=>toggleTask(task)} className="flex w-full items-start gap-3 border-t border-primary-foreground/15 py-3.5 text-left transition-opacity hover:opacity-80">
            <span className={`mt-0.5 grid size-3.5 shrink-0 place-items-center rounded-full border ${done ? "border-primary-foreground bg-primary-foreground text-primary" : "border-primary-foreground/40"}`}>{done && <Check className="size-2.5"/>}</span>
            <span><span className={`block text-[13px] ${done ? "text-primary-foreground/50 line-through" : "text-primary-foreground/90"}`}>{task}</span><span className="block text-[11px] text-primary-foreground/50">{why}</span></span>
          </button>;})}
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
          <div><p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Your week</p><h2 className="mt-1 text-lg font-medium tracking-[-0.02em]">{meetings.length > 0 ? `${meetings.length} ${meetings.length===1?"thing":"things"} booked in` : "Nothing booked in yet"}</h2></div>
          <Button size="sm" variant="ghost" className="rounded-full" onClick={()=>goTo("Calendar")}>Open calendar <ChevronRight/></Button>
        </div>
        <div className="overflow-x-auto"><div className="grid min-w-[680px] grid-cols-7">{days.map((day,i)=>{
          const todays = meetings.filter(m=>m.detail===day);
          return <div key={day} className={`min-h-32 p-5 ${i>0?"border-l border-border/70":""}`}>
            <p className="text-[10px] font-medium text-muted-foreground">{day}</p>
            {todays.length > 0
              ? <div className="mt-2 space-y-1.5">{todays.map((m,j)=><p key={j} className="truncate rounded-lg bg-secondary px-2 py-1 text-[11px] font-medium">{m.title}</p>)}</div>
              : <p className="mt-2 font-display text-xl text-muted-foreground/50">—</p>}
          </div>;})}
        </div></div>
        <div className="flex items-center justify-between gap-4 border-t border-border/70 px-7 py-5 text-[13px] text-muted-foreground">
          <p>Meetings, renewals and repair visits land here so no one has to remember them.</p>
          <Dialog open={dateOpen} onOpenChange={setDateOpen}>
            <DialogTrigger asChild><Button size="sm" variant="outline" className="rounded-full">Add a date <ArrowUpRight/></Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle className="font-display tracking-[-0.02em]">Add a date</DialogTitle><DialogDescription>Meetings, renewals and repair visits for your property.</DialogDescription></DialogHeader>
              <form onSubmit={submitDate} className="space-y-4">
                <div className="space-y-2"><Label htmlFor="meeting-title">What's happening</Label><Input id="meeting-title" name="title" placeholder="e.g. Annual general meeting" required autoFocus/></div>
                <div className="space-y-2"><Label>Day</Label><Select name="day" defaultValue="Mon"><SelectTrigger className="w-full"><SelectValue placeholder="Pick a day"/></SelectTrigger><SelectContent>{days.map(d=><SelectItem key={d} value={d}>{d}</SelectItem>)}</SelectContent></Select></div>
                <div className="flex justify-end gap-2 pt-2"><Button type="button" variant="ghost" className="rounded-full" onClick={()=>setDateOpen(false)}>Cancel</Button><Button type="submit" className="rounded-full">Save date</Button></div>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </section>
    </div>
  </>;
}
