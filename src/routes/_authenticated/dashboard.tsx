import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip as ChartTooltip, XAxis, YAxis } from "recharts";
import { Bell, Building2, CalendarDays, Check, ChevronRight, FileCheck2, Files, LayoutDashboard, LogOut, Menu, Plus, ShieldCheck, WalletCards, Wrench } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [
    { title: "Your property dashboard | Loty" },
    { name: "description", content: "One calm place to run your building: levies, compliance, repairs, insurance and records, without a manager." },
    { property: "og:title", content: "Your property dashboard | Loty" },
    { property: "og:description", content: "One calm place to run your building: levies, compliance, repairs and records." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
  ]}),
  component: DashboardPage,
});

type Scheme = { id: string; name: string; address: string; total_lots: number; tier: string | null; next_agm_date: string | null };
type Lot = { id: string; lot_number: number; owner_name: string | null; owner_email: string | null; owner_user_id: string | null; entitlement_percent: number; occupied_status: string };
type Levy = { id: string; lot_id: string; amount: number; due_date: string; status: string; paid_at: string | null; lots: { lot_number: number; owner_name: string | null } | null };
type Task = { id: string; task_name: string; detail: string | null; due_date: string; status: string };
type Repair = { id: string; title: string; description: string | null; status: string; created_at: string; submitted_by_lot_id: string | null; lots: { lot_number: number } | null };
type Doc = { id: string; name: string; category: string | null; uploaded_at: string };

const sections = [
  ["Dashboard", LayoutDashboard], ["Lots", Building2], ["Levies", WalletCards], ["Maintenance", Wrench],
  ["Insurance", ShieldCheck], ["Compliance", FileCheck2], ["Calendar", CalendarDays], ["Documents", Files],
] as const;

const repairFlow = ["Requested", "Quoted", "Approved", "Complete"] as const;
const money = (n: number) => n.toLocaleString("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 });
const daysUntil = (date: string) => Math.ceil((new Date(date + "T00:00:00").getTime() - new Date(new Date().toDateString()).getTime()) / 86400000);
const effectiveLevyStatus = (levy: Levy) => (levy.status === "Pending" && daysUntil(levy.due_date) < 0 ? "Overdue" : levy.status);
const niceDate = (value: string) => new Date(value).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });

function DashboardPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [active, setActive] = useState("Dashboard");

  const { data: me } = useQuery({
    queryKey: ["me"],
    queryFn: async () => {
      const { data: userData } = await supabase.auth.getUser();
      const user = userData.user;
      if (!user) return null;
      const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", user.id);
      return { id: user.id, email: user.email ?? "", isCommittee: (roles ?? []).some(r => r.role === "Committee") };
    },
  });

  const scheme = useQuery({
    queryKey: ["scheme"],
    queryFn: async () => {
      const { data, error } = await supabase.from("schemes").select("*").order("created_at").limit(1).maybeSingle();
      if (error) throw error;
      return data as Scheme | null;
    },
  });
  const schemeId = scheme.data?.id;

  const lots = useQuery({
    queryKey: ["lots"],
    queryFn: async () => {
      const { data, error } = await supabase.from("lots").select("*").order("lot_number");
      if (error) throw error;
      return (data ?? []) as unknown as Lot[];
    },
  });
  const levies = useQuery({
    queryKey: ["levies"],
    queryFn: async () => {
      const { data, error } = await supabase.from("levies").select("*, lots(lot_number, owner_name)").order("due_date");
      if (error) throw error;
      return (data ?? []) as unknown as Levy[];
    },
  });
  const tasks = useQuery({
    queryKey: ["tasks"],
    queryFn: async () => {
      const { data, error } = await supabase.from("compliance_tasks").select("*").order("due_date");
      if (error) throw error;
      return (data ?? []) as unknown as Task[];
    },
  });
  const repairs = useQuery({
    queryKey: ["repairs"],
    queryFn: async () => {
      const { data, error } = await supabase.from("maintenance_requests").select("*, lots(lot_number)").order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as Repair[];
    },
  });
  const documents = useQuery({
    queryKey: ["documents"],
    queryFn: async () => {
      const { data, error } = await supabase.from("documents").select("*").order("uploaded_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as Doc[];
    },
  });

  const refresh = (keys: string[]) => keys.forEach(key => queryClient.invalidateQueries({ queryKey: [key] }));

  const setRepairStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase.from("maintenance_requests").update({ status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { refresh(["repairs"]); toast("Repair updated"); },
    onError: (e: Error) => toast("Could not update", { description: e.message }),
  });
  const setTaskStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase.from("compliance_tasks").update({ status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { refresh(["tasks"]); toast("Compliance updated"); },
    onError: (e: Error) => toast("Could not update", { description: e.message }),
  });
  const markLevyPaid = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("levies").update({ status: "Paid", paid_at: new Date().toISOString() }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { refresh(["levies"]); toast("Marked as paid"); },
    onError: (e: Error) => toast("Could not update", { description: e.message }),
  });

  const isCommittee = me?.isCommittee ?? false;
  const myLot = lots.data?.find(lot => lot.owner_user_id === me?.id) ?? null;

  const signOut = async () => {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  };

  return <div className="relative isolate min-h-screen bg-background">
    <Toaster />
    <header className="sticky top-0 z-40 border-b border-border/70 bg-background/80 backdrop-blur-xl">
      <div className="mx-auto flex h-[68px] max-w-[1500px] items-center gap-4 px-4 sm:px-7">
        <Link to="/" className="mr-2 flex shrink-0 items-center gap-2 font-display text-lg font-semibold tracking-[-0.02em]"><span className="grid size-5 grid-cols-2 gap-0.5">{[0,1,2,3].map(i=><span key={i} className="rounded-[2px] bg-primary"/>)}</span><span className="hidden sm:inline">Loty</span></Link>
        <nav className="hidden min-w-0 flex-1 items-center gap-1 lg:flex" aria-label="Dashboard sections">{sections.map(([label])=><Button key={label} size="sm" variant={active===label?"default":"ghost"} className="rounded-full px-3.5 text-xs font-medium transition-all duration-300" onClick={()=>setActive(label)}>{label}</Button>)}</nav>
        <div className="ml-auto flex items-center gap-1">
          <span className="mr-1 hidden rounded-full border border-border bg-secondary px-3 py-1 text-[10px] font-medium sm:inline">{isCommittee ? "Committee" : "Owner"}</span>
          <Button size="icon" variant="ghost" className="rounded-full" aria-label="Notifications" onClick={()=>setActive("Compliance")}><Bell /></Button>
          <Button size="icon" variant="ghost" className="rounded-full" aria-label="Sign out" onClick={signOut}><LogOut /></Button>
          <Sheet><SheetTrigger asChild><Button size="icon" variant="ghost" className="rounded-full lg:hidden" aria-label="Open navigation"><Menu/></Button></SheetTrigger><SheetContent side="right"><SheetTitle className="font-display">Your property</SheetTitle><nav className="mt-8 space-y-1">{sections.map(([label,Icon])=><Button key={label} variant={active===label?"default":"ghost"} className="w-full justify-start rounded-full" onClick={()=>setActive(label)}><Icon/>{label}</Button>)}</nav></SheetContent></Sheet>
        </div>
      </div>
    </header>

    <main className="mx-auto max-w-[1500px] px-4 pb-32 pt-10 sm:px-7 sm:pt-14">
      {active === "Dashboard" && <Overview
        scheme={scheme.data ?? null} levies={levies.data ?? []} tasks={tasks.data ?? []} repairs={repairs.data ?? []}
        isCommittee={isCommittee} myLot={myLot} onTaskStatus={(id,status)=>setTaskStatus.mutate({id,status})}
        onRepairStatus={(id,status)=>setRepairStatus.mutate({id,status})} goTo={setActive} email={me?.email ?? ""}/>}

      {active === "Lots" && <LotsSection lots={lots.data ?? []} isCommittee={isCommittee} schemeId={schemeId} onChanged={()=>refresh(["lots"])}/>}

      {active === "Levies" && <LeviesSection levies={levies.data ?? []} isCommittee={isCommittee} schemeId={schemeId}
        onPaid={(id)=>markLevyPaid.mutate(id)} onBudget={()=>refresh(["levies"])}/>}

      {active === "Maintenance" && <MaintenanceSection repairs={repairs.data ?? []} isCommittee={isCommittee} myLot={myLot} schemeId={schemeId}
        onStatus={(id,status)=>setRepairStatus.mutate({id,status})} onChanged={()=>refresh(["repairs"])}/>}

      {active === "Compliance" && <ComplianceSection tasks={tasks.data ?? []} isCommittee={isCommittee} schemeId={schemeId}
        onStatus={(id,status)=>setTaskStatus.mutate({id,status})} onChanged={()=>refresh(["tasks"])}/>}

      {active === "Insurance" && <InsuranceSection tasks={tasks.data ?? []}/>}
      {active === "Calendar" && <CalendarSection scheme={scheme.data ?? null} tasks={tasks.data ?? []} levies={levies.data ?? []}/>}
      {active === "Documents" && <DocumentsSection documents={documents.data ?? []} isCommittee={isCommittee} schemeId={schemeId} onChanged={()=>refresh(["documents"])}/>}
    </main>

    <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-4 border-t border-border/70 bg-background/90 p-2 backdrop-blur-xl lg:hidden">{sections.slice(0,4).map(([label,Icon])=><Button key={label} variant="ghost" className={`h-14 flex-col gap-1 rounded-2xl px-1 text-[9px] ${active===label?"bg-primary text-primary-foreground":"text-muted-foreground"}`} onClick={()=>setActive(label)}><Icon/>{label}</Button>)}</nav>
  </div>;
}

function PageHead({ eyebrow, title, blurb, action }: { eyebrow: string; title: string; blurb: string; action?: React.ReactNode }) {
  return <div className="flex flex-wrap items-end justify-between gap-4">
    <div className="max-w-2xl">
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">{eyebrow}</p>
      <h1 className="mt-4 text-4xl font-medium tracking-[-0.035em] sm:text-5xl">{title}</h1>
      <p className="mt-5 text-[15px] leading-7 text-muted-foreground">{blurb}</p>
    </div>
    {action}
  </div>;
}

function StatusPill({ status }: { status: string }) {
  const tone = status === "Overdue" ? "bg-destructive/10 text-destructive"
    : status === "Paid" || status === "Complete" ? "bg-primary/10 text-primary"
    : "bg-secondary text-muted-foreground";
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-medium ${tone}`}>{status}</span>;
}

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <section className={`soft-shadow rounded-3xl border border-border/70 bg-card ${className}`}>{children}</section>;
}

function Overview({ scheme, levies, tasks, repairs, isCommittee, myLot, onTaskStatus, onRepairStatus, goTo, email }: {
  scheme: Scheme | null; levies: Levy[]; tasks: Task[]; repairs: Repair[]; isCommittee: boolean; myLot: Lot | null;
  onTaskStatus: (id: string, status: string) => void; onRepairStatus: (id: string, status: string) => void;
  goTo: (s: string) => void; email: string;
}) {
  const thisYear = new Date().getFullYear();
  const collected = levies.filter(l => l.status === "Paid" && l.paid_at && new Date(l.paid_at).getFullYear() === thisYear)
    .reduce((sum, l) => sum + Number(l.amount), 0);
  const outstanding = levies.filter(l => effectiveLevyStatus(l) !== "Paid").reduce((sum, l) => sum + Number(l.amount), 0);
  const complianceScore = tasks.length ? Math.round((tasks.filter(t => t.status === "Complete").length / tasks.length) * 100) : 0;
  const openRepairs = repairs.filter(r => r.status !== "Complete").length;
  const agmDays = scheme?.next_agm_date ? daysUntil(scheme.next_agm_date) : null;

  const months = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - (5 - i));
    const label = d.toLocaleDateString("en-AU", { month: "short" });
    const total = levies.filter(l => l.paid_at && new Date(l.paid_at).getMonth() === d.getMonth() && new Date(l.paid_at).getFullYear() === d.getFullYear())
      .reduce((sum, l) => sum + Number(l.amount), 0);
    return { month: label, received: Math.round(total) };
  });

  const stats: [string, string, string][] = [
    ["Levies collected this year", money(collected), outstanding > 0 ? `${money(outstanding)} still outstanding` : "Everyone is up to date"],
    ["Compliance score", `${complianceScore}%`, `${tasks.filter(t => t.status === "Complete").length} of ${tasks.length} obligations done`],
    ["Repairs waiting on you", String(openRepairs), openRepairs ? "In progress or awaiting a decision" : "All quiet"],
    ["Days until your AGM", agmDays === null ? "—" : String(agmDays), scheme?.next_agm_date ? niceDate(scheme.next_agm_date) : "No date set"],
  ];

  return <>
    <div className="max-w-2xl">
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">{scheme ? scheme.address : "Your building"}</p>
      <h1 className="mt-4 text-4xl font-medium leading-[1.02] tracking-[-0.04em] sm:text-6xl">Hello{email ? `, ${email.split("@")[0]}` : ""}.<br/>Here's what's happening at your property.</h1>
      <p className="mt-5 text-[15px] leading-7 text-muted-foreground">
        {isCommittee
          ? "You can see every lot, every levy and every repair. Loty keeps an eye on the dates so you can get on with your week."
          : "Your levies and your repair requests, in one place. Loty keeps an eye on the dates so you can get on with your week."}
      </p>
    </div>

    <div className="mt-10 flex gap-3 overflow-x-auto pb-2">{stats.map(([label, value, hint]) =>
      <div key={label} className="min-w-[210px] shrink-0 rounded-3xl border border-border/70 bg-card p-5">
        <p className="text-[11px] font-medium text-muted-foreground">{label}</p>
        <p className="mt-4 truncate font-display text-3xl font-medium tracking-[-0.03em]">{value}</p>
        <p className="mt-2 text-[11px] text-muted-foreground/80">{hint}</p>
      </div>)}
    </div>

    <div className="mt-5 grid gap-5 xl:grid-cols-12">
      <Card className="p-7 xl:col-span-7">
        <div className="flex items-start justify-between">
          <div><p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Last six months</p><h2 className="mt-2 text-lg font-medium tracking-[-0.02em]">Levy payments received</h2></div>
          <Button size="sm" variant="ghost" className="h-7 rounded-full px-3 text-[11px]" onClick={()=>goTo("Levies")}>Open levies <ChevronRight/></Button>
        </div>
        <div className="mt-8 h-56">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={months} margin={{ left: -18, right: 8 }}>
              <CartesianGrid vertical={false} stroke="var(--border)" />
              <XAxis dataKey="month" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} />
              <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} />
              <ChartTooltip cursor={{ fill: "var(--secondary)" }} formatter={(value: number) => money(Number(value))} />
              <Bar dataKey="received" fill="var(--primary)" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <section className="soft-shadow rounded-3xl bg-primary p-7 text-primary-foreground xl:col-span-5">
        <div className="flex items-center justify-between">
          <div><p className="text-[10px] uppercase tracking-[0.14em] text-primary-foreground/55">What the law expects of you</p><h2 className="mt-2 text-xl font-medium tracking-[-0.025em]">Your yearly obligations</h2></div>
          <span className="font-display text-2xl">{tasks.filter(t=>t.status==="Complete").length}/{tasks.length}</span>
        </div>
        <div className="mt-6">{tasks.map(task => {
          const left = daysUntil(task.due_date);
          const done = task.status === "Complete";
          const urgent = !done && left < 14;
          return <div key={task.id} className="flex items-start gap-3 border-t border-primary-foreground/15 py-3.5">
            <button type="button" disabled={!isCommittee} onClick={()=>onTaskStatus(task.id, done ? "In Progress" : "Complete")}
              className={`mt-0.5 grid size-4 shrink-0 place-items-center rounded-full border ${done ? "border-primary-foreground bg-primary-foreground text-primary" : "border-primary-foreground/40"} ${isCommittee ? "cursor-pointer" : "cursor-default"}`}
              aria-label={`Mark ${task.task_name} ${done ? "in progress" : "complete"}`}>{done && <Check className="size-2.5"/>}</button>
            <span className="min-w-0 flex-1">
              <span className={`block text-[13px] ${done ? "text-primary-foreground/50 line-through" : "text-primary-foreground/90"}`}>{task.task_name}</span>
              <span className="block text-[11px] text-primary-foreground/50">Due {niceDate(task.due_date)}</span>
            </span>
            <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${done ? "bg-primary-foreground/10 text-primary-foreground/60" : urgent ? "bg-primary-foreground text-primary" : "bg-primary-foreground/10 text-primary-foreground/80"}`}>
              {done ? "Done" : left < 0 ? `${Math.abs(left)} days overdue` : `${left} days left`}
            </span>
          </div>;})}
          {tasks.length === 0 && <p className="border-t border-primary-foreground/15 py-6 text-[13px] text-primary-foreground/60">Nothing recorded yet.</p>}
        </div>
      </section>

      <Card className="overflow-hidden xl:col-span-12">
        <div className="flex items-center justify-between border-b border-border/70 px-7 py-5">
          <div><p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Repairs</p><h2 className="mt-1 text-lg font-medium tracking-[-0.02em]">{openRepairs ? `${openRepairs} open` : "Nothing open"}</h2></div>
          <Button size="sm" variant="ghost" className="rounded-full" onClick={()=>goTo("Maintenance")}>Open repairs <ChevronRight/></Button>
        </div>
        <RepairTable repairs={repairs.slice(0, 5)} isCommittee={isCommittee} onStatus={onRepairStatus}/>
      </Card>

      {!isCommittee && <Card className="p-7 xl:col-span-12">
        <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Your lot</p>
        <h2 className="mt-2 text-lg font-medium tracking-[-0.02em]">{myLot ? `Lot ${myLot.lot_number}, ${myLot.owner_name ?? ""}` : "No lot linked to your account yet"}</h2>
        <p className="mt-3 text-[13px] text-muted-foreground">{myLot ? `Your share of costs is ${myLot.entitlement_percent}%.` : "Ask your committee to add your email against your lot, and your levies will appear here."}</p>
      </Card>}
    </div>
  </>;
}

function RepairTable({ repairs, isCommittee, onStatus }: { repairs: Repair[]; isCommittee: boolean; onStatus: (id: string, status: string) => void }) {
  if (repairs.length === 0) return <p className="px-7 py-10 text-center text-sm text-muted-foreground">Nothing logged yet.</p>;
  return <div className="divide-y divide-border/70">{repairs.map(repair => {
    const next = repairFlow[repairFlow.indexOf(repair.status as typeof repairFlow[number]) + 1];
    return <div key={repair.id} className="flex flex-wrap items-center justify-between gap-4 px-7 py-5">
      <div className="min-w-0">
        <p className="text-sm font-medium">{repair.title}</p>
        <p className="mt-1 text-[12px] text-muted-foreground">{repair.lots ? `Lot ${repair.lots.lot_number} · ` : ""}Logged {niceDate(repair.created_at)}</p>
      </div>
      <div className="flex items-center gap-3">
        <StatusPill status={repair.status}/>
        {isCommittee && next && <Button size="sm" variant="outline" className="rounded-full" onClick={()=>onStatus(repair.id, next)}>Move to {next}</Button>}
      </div>
    </div>;})}
  </div>;
}

function LotsSection({ lots, isCommittee, schemeId, onChanged }: { lots: Lot[]; isCommittee: boolean; schemeId?: string; onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!schemeId) return;
    const form = new FormData(e.currentTarget);
    const { error } = await supabase.from("lots").insert({
      scheme_id: schemeId,
      lot_number: Number(form.get("lot_number")),
      owner_name: String(form.get("owner_name") ?? ""),
      owner_email: String(form.get("owner_email") ?? ""),
      entitlement_percent: Number(form.get("entitlement_percent")),
      occupied_status: String(form.get("occupied_status") ?? "Owner occupied"),
    });
    if (error) { toast("Could not add the lot", { description: error.message }); return; }
    setOpen(false); onChanged(); toast("Lot added");
  };
  const total = lots.reduce((sum, lot) => sum + Number(lot.entitlement_percent), 0);
  return <div>
    <PageHead eyebrow="Your property" title="Lots" blurb="Who owns what, who lives there, and how each owner's share of costs is worked out."
      action={isCommittee ? <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild><Button className="rounded-full"><Plus/> Add a lot</Button></DialogTrigger>
        <DialogContent>
          <DialogHeader><DialogTitle className="font-display tracking-[-0.02em]">Add a lot</DialogTitle><DialogDescription>Entitlements across all lots should add up to 100%.</DialogDescription></DialogHeader>
          <form onSubmit={submit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label htmlFor="lot_number">Lot number</Label><Input id="lot_number" name="lot_number" type="number" min="1" required/></div>
              <div className="space-y-2"><Label htmlFor="entitlement_percent">Entitlement %</Label><Input id="entitlement_percent" name="entitlement_percent" type="number" step="0.001" required/></div>
            </div>
            <div className="space-y-2"><Label htmlFor="owner_name">Owner name</Label><Input id="owner_name" name="owner_name"/></div>
            <div className="space-y-2"><Label htmlFor="owner_email">Owner email</Label><Input id="owner_email" name="owner_email" type="email"/></div>
            <div className="space-y-2"><Label>Occupancy</Label><Select name="occupied_status" defaultValue="Owner occupied"><SelectTrigger className="w-full"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="Owner occupied">Owner occupied</SelectItem><SelectItem value="Tenanted">Tenanted</SelectItem><SelectItem value="Vacant">Vacant</SelectItem></SelectContent></Select></div>
            <div className="flex justify-end gap-2 pt-2"><Button type="button" variant="ghost" className="rounded-full" onClick={()=>setOpen(false)}>Cancel</Button><Button type="submit" className="rounded-full">Save lot</Button></div>
          </form>
        </DialogContent>
      </Dialog> : undefined}/>
    <Card className="mt-10 overflow-hidden">
      <div className="divide-y divide-border/70">{lots.map(lot =>
        <div key={lot.id} className="flex flex-wrap items-center justify-between gap-4 px-7 py-5">
          <div><p className="text-sm font-medium">Lot {lot.lot_number}{lot.owner_name ? ` · ${lot.owner_name}` : ""}</p><p className="mt-1 text-[12px] text-muted-foreground">{lot.owner_email ?? "No email on file"}</p></div>
          <div className="flex items-center gap-4 text-[12px] text-muted-foreground"><span>{lot.occupied_status}</span><span className="font-display text-base text-foreground">{lot.entitlement_percent}%</span></div>
        </div>)}
        {lots.length === 0 && <p className="px-7 py-10 text-center text-sm text-muted-foreground">No lots visible to you yet.</p>}
      </div>
      {lots.length > 0 && <div className="border-t border-border/70 px-7 py-4 text-[12px] text-muted-foreground">Entitlements total {total.toFixed(2)}%</div>}
    </Card>
  </div>;
}

function LeviesSection({ levies, isCommittee, schemeId, onPaid, onBudget }: { levies: Levy[]; isCommittee: boolean; schemeId?: string; onPaid: (id: string) => void; onBudget: () => void }) {
  const [open, setOpen] = useState(false);
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!schemeId) return;
    const form = new FormData(e.currentTarget);
    const { error } = await supabase.from("budgets").insert({
      scheme_id: schemeId,
      financial_year: String(form.get("financial_year") ?? ""),
      admin_fund_total: Number(form.get("admin_fund_total")),
      maintenance_fund_total: Number(form.get("maintenance_fund_total")),
      levy_due_date: String(form.get("levy_due_date") ?? ""),
    });
    if (error) { toast("Could not create the budget", { description: error.message }); return; }
    setOpen(false); onBudget(); toast("Budget created", { description: "Levy notices were calculated for every lot." });
  };
  return <div>
    <PageHead eyebrow="Your property" title="Levies" blurb="Raise a levy, see who has paid, and chase the ones who haven't, without an awkward phone call."
      action={isCommittee ? <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild><Button className="rounded-full"><Plus/> Create a budget</Button></DialogTrigger>
        <DialogContent>
          <DialogHeader><DialogTitle className="font-display tracking-[-0.02em]">Create a budget</DialogTitle><DialogDescription>Each lot is billed its share of the total, based on entitlement.</DialogDescription></DialogHeader>
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-2"><Label htmlFor="financial_year">Financial year</Label><Input id="financial_year" name="financial_year" placeholder="2026/27" required/></div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label htmlFor="admin_fund_total">Admin fund</Label><Input id="admin_fund_total" name="admin_fund_total" type="number" step="0.01" required/></div>
              <div className="space-y-2"><Label htmlFor="maintenance_fund_total">Maintenance fund</Label><Input id="maintenance_fund_total" name="maintenance_fund_total" type="number" step="0.01" required/></div>
            </div>
            <div className="space-y-2"><Label htmlFor="levy_due_date">Due date</Label><Input id="levy_due_date" name="levy_due_date" type="date" required/></div>
            <div className="flex justify-end gap-2 pt-2"><Button type="button" variant="ghost" className="rounded-full" onClick={()=>setOpen(false)}>Cancel</Button><Button type="submit" className="rounded-full">Create and issue notices</Button></div>
          </form>
        </DialogContent>
      </Dialog> : undefined}/>
    <Card className="mt-10 overflow-hidden">
      <div className="divide-y divide-border/70">{levies.map(levy => {
        const status = effectiveLevyStatus(levy);
        return <div key={levy.id} className="flex flex-wrap items-center justify-between gap-4 px-7 py-5">
          <div><p className="text-sm font-medium">{levy.lots ? `Lot ${levy.lots.lot_number}${levy.lots.owner_name ? ` · ${levy.lots.owner_name}` : ""}` : "Your levy"}</p><p className="mt-1 text-[12px] text-muted-foreground">Due {niceDate(levy.due_date)}</p></div>
          <div className="flex items-center gap-4">
            <span className="font-display text-lg">{money(Number(levy.amount))}</span>
            <StatusPill status={status}/>
            {isCommittee && status !== "Paid" && <Button size="sm" variant="outline" className="rounded-full" onClick={()=>onPaid(levy.id)}>Mark paid</Button>}
          </div>
        </div>;})}
        {levies.length === 0 && <p className="px-7 py-10 text-center text-sm text-muted-foreground">No levies raised yet.</p>}
      </div>
    </Card>
  </div>;
}

function MaintenanceSection({ repairs, isCommittee, myLot, schemeId, onStatus, onChanged }: {
  repairs: Repair[]; isCommittee: boolean; myLot: Lot | null; schemeId?: string;
  onStatus: (id: string, status: string) => void; onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!schemeId) return;
    const form = new FormData(e.currentTarget);
    const { error } = await supabase.from("maintenance_requests").insert({
      scheme_id: schemeId,
      submitted_by_lot_id: myLot?.id ?? null,
      title: String(form.get("title") ?? ""),
      description: String(form.get("description") ?? ""),
      status: "Requested",
    });
    if (error) { toast("Could not log the repair", { description: error.message }); return; }
    setOpen(false); onChanged(); toast("Repair logged");
  };
  return <div>
    <PageHead eyebrow="Your property" title="Maintenance" blurb="Log a leak, get quotes and keep a dated trail of every repair on your building."
      action={<Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild><Button className="rounded-full"><Plus/> Log a repair</Button></DialogTrigger>
        <DialogContent>
          <DialogHeader><DialogTitle className="font-display tracking-[-0.02em]">Log a repair</DialogTitle><DialogDescription>Describe what needs fixing and where.</DialogDescription></DialogHeader>
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-2"><Label htmlFor="title">What needs fixing</Label><Input id="title" name="title" placeholder="Leaking gutter, block B" required autoFocus/></div>
            <div className="space-y-2"><Label htmlFor="description">Details</Label><Textarea id="description" name="description" placeholder="Where it is and when you noticed it"/></div>
            <div className="flex justify-end gap-2 pt-2"><Button type="button" variant="ghost" className="rounded-full" onClick={()=>setOpen(false)}>Cancel</Button><Button type="submit" className="rounded-full">Save repair</Button></div>
          </form>
        </DialogContent>
      </Dialog>}/>
    <Card className="mt-10 overflow-hidden"><RepairTable repairs={repairs} isCommittee={isCommittee} onStatus={onStatus}/></Card>
  </div>;
}

function ComplianceSection({ tasks, isCommittee, schemeId, onStatus, onChanged }: {
  tasks: Task[]; isCommittee: boolean; schemeId?: string; onStatus: (id: string, status: string) => void; onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!schemeId) return;
    const form = new FormData(e.currentTarget);
    const { error } = await supabase.from("compliance_tasks").insert({
      scheme_id: schemeId,
      task_name: String(form.get("task_name") ?? ""),
      detail: String(form.get("detail") ?? ""),
      due_date: String(form.get("due_date") ?? ""),
      status: "Not Started",
    });
    if (error) { toast("Could not add the obligation", { description: error.message }); return; }
    setOpen(false); onChanged(); toast("Obligation added");
  };
  return <div>
    <PageHead eyebrow="Your property" title="Compliance" blurb="The things the law expects each year, in plain English, with dates attached."
      action={isCommittee ? <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild><Button className="rounded-full"><Plus/> Add an obligation</Button></DialogTrigger>
        <DialogContent>
          <DialogHeader><DialogTitle className="font-display tracking-[-0.02em]">Add an obligation</DialogTitle><DialogDescription>Anything with a deadline attached to your building.</DialogDescription></DialogHeader>
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-2"><Label htmlFor="task_name">What's required</Label><Input id="task_name" name="task_name" placeholder="Fire safety statement" required autoFocus/></div>
            <div className="space-y-2"><Label htmlFor="detail">Notes</Label><Textarea id="detail" name="detail"/></div>
            <div className="space-y-2"><Label htmlFor="due_date">Due date</Label><Input id="due_date" name="due_date" type="date" required/></div>
            <div className="flex justify-end gap-2 pt-2"><Button type="button" variant="ghost" className="rounded-full" onClick={()=>setOpen(false)}>Cancel</Button><Button type="submit" className="rounded-full">Save</Button></div>
          </form>
        </DialogContent>
      </Dialog> : undefined}/>
    <Card className="mt-10 overflow-hidden">
      <div className="divide-y divide-border/70">{tasks.map(task => {
        const left = daysUntil(task.due_date);
        const urgent = task.status !== "Complete" && left < 14;
        return <div key={task.id} className="flex flex-wrap items-center justify-between gap-4 px-7 py-5">
          <div><p className="text-sm font-medium">{task.task_name}</p><p className="mt-1 text-[12px] text-muted-foreground">{task.detail ? `${task.detail} · ` : ""}Due {niceDate(task.due_date)}</p></div>
          <div className="flex items-center gap-3">
            <span className={`text-[12px] ${urgent ? "font-medium text-destructive" : "text-muted-foreground"}`}>{task.status === "Complete" ? "Done" : left < 0 ? `${Math.abs(left)} days overdue` : `${left} days left`}</span>
            {isCommittee
              ? <Select value={task.status} onValueChange={(value)=>onStatus(task.id, value)}><SelectTrigger className="w-[150px] rounded-full"><SelectValue/></SelectTrigger><SelectContent>{["Not Started","In Progress","Complete"].map(s=><SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select>
              : <StatusPill status={task.status}/>}
          </div>
        </div>;})}
        {tasks.length === 0 && <p className="px-7 py-10 text-center text-sm text-muted-foreground">Nothing recorded yet.</p>}
      </div>
    </Card>
  </div>;
}

function InsuranceSection({ tasks }: { tasks: Task[] }) {
  const policy = tasks.find(task => task.task_name.toLowerCase().includes("insurance"));
  return <div>
    <PageHead eyebrow="Your property" title="Insurance" blurb="Your policy, your sum insured and your renewal date, where you can actually find them."/>
    <Card className="mt-10 p-7">
      {policy
        ? <><p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Renewal</p>
            <h2 className="mt-2 text-2xl font-medium tracking-[-0.03em]">{niceDate(policy.due_date)}</h2>
            <p className="mt-3 text-[13px] text-muted-foreground">{policy.detail ?? "Cover must never lapse."} {daysUntil(policy.due_date)} days to go.</p></>
        : <p className="text-sm text-muted-foreground">No insurance renewal recorded yet. Add it under Compliance and it will appear here.</p>}
    </Card>
  </div>;
}

function CalendarSection({ scheme, tasks, levies }: { scheme: Scheme | null; tasks: Task[]; levies: Levy[] }) {
  const items = [
    ...(scheme?.next_agm_date ? [{ label: "Annual general meeting", date: scheme.next_agm_date }] : []),
    ...tasks.map(task => ({ label: task.task_name, date: task.due_date })),
    ...[...new Set(levies.map(levy => levy.due_date))].map(date => ({ label: "Levies due", date })),
  ].sort((a, b) => a.date.localeCompare(b.date));
  return <div>
    <PageHead eyebrow="Your property" title="Calendar" blurb="Meetings, renewals and deadlines for your property in one timeline."/>
    <Card className="mt-10 overflow-hidden">
      <div className="divide-y divide-border/70">{items.map((item, i) =>
        <div key={`${item.label}-${i}`} className="flex items-center justify-between gap-4 px-7 py-5">
          <p className="text-sm font-medium">{item.label}</p>
          <div className="text-right"><p className="text-[13px]">{niceDate(item.date)}</p><p className="text-[11px] text-muted-foreground">{daysUntil(item.date) < 0 ? `${Math.abs(daysUntil(item.date))} days ago` : `in ${daysUntil(item.date)} days`}</p></div>
        </div>)}
        {items.length === 0 && <p className="px-7 py-10 text-center text-sm text-muted-foreground">Nothing scheduled yet.</p>}
      </div>
    </Card>
  </div>;
}

function DocumentsSection({ documents, isCommittee, schemeId, onChanged }: { documents: Doc[]; isCommittee: boolean; schemeId?: string; onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!schemeId) return;
    const form = new FormData(e.currentTarget);
    const { error } = await supabase.from("documents").insert({
      scheme_id: schemeId,
      name: String(form.get("name") ?? ""),
      category: String(form.get("category") ?? "Other"),
    });
    if (error) { toast("Could not add the record", { description: error.message }); return; }
    setOpen(false); onChanged(); toast("Record added");
  };
  return <div>
    <PageHead eyebrow="Your property" title="Documents" blurb="Minutes, certificates, invoices and plans, filed once, findable forever."
      action={isCommittee ? <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild><Button className="rounded-full"><Plus/> Add a record</Button></DialogTrigger>
        <DialogContent>
          <DialogHeader><DialogTitle className="font-display tracking-[-0.02em]">Add a record</DialogTitle><DialogDescription>Name it so the next committee can find it.</DialogDescription></DialogHeader>
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-2"><Label htmlFor="name">Document name</Label><Input id="name" name="name" placeholder="AGM minutes 2026" required autoFocus/></div>
            <div className="space-y-2"><Label>Category</Label><Select name="category" defaultValue="Minutes"><SelectTrigger className="w-full"><SelectValue/></SelectTrigger><SelectContent>{["Minutes","Insurance","Plans","Invoices","Other"].map(c=><SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent></Select></div>
            <div className="flex justify-end gap-2 pt-2"><Button type="button" variant="ghost" className="rounded-full" onClick={()=>setOpen(false)}>Cancel</Button><Button type="submit" className="rounded-full">Save</Button></div>
          </form>
        </DialogContent>
      </Dialog> : undefined}/>
    <Card className="mt-10 overflow-hidden">
      <div className="divide-y divide-border/70">{documents.map(doc =>
        <div key={doc.id} className="flex items-center justify-between gap-4 px-7 py-5">
          <div><p className="text-sm font-medium">{doc.name}</p><p className="mt-1 text-[12px] text-muted-foreground">{doc.category ?? "Other"}</p></div>
          <p className="text-[12px] text-muted-foreground">{niceDate(doc.uploaded_at)}</p>
        </div>)}
        {documents.length === 0 && <p className="px-7 py-10 text-center text-sm text-muted-foreground">Nothing filed yet.</p>}
      </div>
    </Card>
  </div>;
}
