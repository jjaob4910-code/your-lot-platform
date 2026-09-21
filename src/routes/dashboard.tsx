import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip as ChartTooltip, XAxis, YAxis } from "recharts";
import { Bell, Building2, CalendarDays, Check, ChevronRight, Coins, FileCheck2, Files, LayoutDashboard, LogOut, Menu, Pencil, Plus, ShieldCheck, Trash2, WalletCards, Wrench } from "lucide-react";
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
import { WorkOrdersSection, WorkOrderTable, type WorkOrder } from "@/components/work-orders";
import { CalendarSection } from "@/components/calendar-view";
import { DocumentsSection, type DocFile } from "@/components/documents";
import { InsuranceSection, type Policy } from "@/components/insurance";
import { FinanceSection, type FinanceBudget, type FinanceTx, type ForecastLine } from "@/components/finance";

export const Route = createFileRoute("/dashboard")({
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
type Lot = {
  id: string; lot_number: number; owner_name: string | null; owner_email: string | null;
  owner_phone: string | null; street_address: string | null;
  owner_user_id: string | null; entitlement_percent: number; occupied_status: string
};
type Levy = {
  id: string; lot_id: string; amount: number; due_date: string; status: string; paid_at: string | null;
  lots: { lot_number: number; owner_name: string | null; owner_email: string | null; entitlement_percent: number } | null;
  budgets: { financial_year: string; admin_fund_total: number; maintenance_fund_total: number; allocation_method: string | null } | null;
};
type Task = { id: string; task_name: string; detail: string | null; due_date: string; status: string };
type Repair = WorkOrder;
type Doc = DocFile;

const sections = [
  ["Dashboard", LayoutDashboard], ["Lots", Building2], ["Levies", WalletCards], ["Work orders", Wrench],
  ["Finance", Coins], ["Insurance", ShieldCheck], ["Compliance", FileCheck2], ["Calendar", CalendarDays],
  ["Documents", Files],
] as const;

const money = (n: number) => n.toLocaleString("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 });
const daysUntil = (date: string) => Math.ceil((new Date(date + "T00:00:00").getTime() - new Date(new Date().toDateString()).getTime()) / 86400000);
const effectiveLevyStatus = (levy: Levy) => (levy.status === "Pending" && daysUntil(levy.due_date) < 0 ? "Overdue" : levy.status);
const niceDate = (value: string) => new Date(value).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });

function DashboardPage() {
  const queryClient = useQueryClient();
  const [active, setActive] = useState("Dashboard");


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
      const { data, error } = await supabase.from("levies").select("*, lots(lot_number, owner_name, owner_email, entitlement_percent), budgets(financial_year, admin_fund_total, maintenance_fund_total, allocation_method)").order("due_date");
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

  const policies = useQuery({
    queryKey: ["insurance"],
    queryFn: async () => {
      const { data, error } = await supabase.from("insurance_policies").select("*").order("renewal_date", { nullsFirst: false });
      if (error) throw error;
      return (data ?? []) as unknown as Policy[];
    },
  });

  const budgets = useQuery({
    queryKey: ["budgets"],
    queryFn: async () => {
      const { data, error } = await supabase.from("budgets").select("*").order("financial_year", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as FinanceBudget[];
    },
  });
  const finance = useQuery({
    queryKey: ["finance"],
    queryFn: async () => {
      const { data, error } = await supabase.from("finance_transactions").select("*").order("occurred_on", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as FinanceTx[];
    },
  });
  const forecastLines = useQuery({
    queryKey: ["forecast-lines"],
    queryFn: async () => {
      const { data, error } = await supabase.from("budget_forecast_lines").select("*").order("expected_month");
      if (error) throw error;
      return (data ?? []) as unknown as ForecastLine[];
    },
  });

  const refresh = (keys: string[]) => keys.forEach(key => queryClient.invalidateQueries({ queryKey: [key] }));

  const setRepairStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase.from("maintenance_requests").update({ status: status as "Requested" | "Quoted" | "Approved" | "Complete" }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { refresh(["repairs"]); toast("Repair updated"); },
    onError: (e: Error) => toast("Could not update", { description: e.message }),
  });
  const setTaskStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase.from("compliance_tasks").update({ status: status as "Not Started" | "In Progress" | "Complete" }).eq("id", id);
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

  const isCommittee = true;
  const myLot = null;


  return <div className="relative isolate min-h-screen bg-background">
    <Toaster />
    <header className="sticky top-0 z-40 border-b border-border/70 bg-background/80 backdrop-blur-xl">
      <div className="mx-auto flex h-[68px] max-w-[1500px] items-center gap-4 px-4 sm:px-7">
        <Link to="/" className="mr-2 flex shrink-0 items-center gap-2 font-display text-lg font-semibold tracking-[-0.02em]"><span className="grid size-5 grid-cols-2 gap-0.5">{[0,1,2,3].map(i=><span key={i} className="rounded-[2px] bg-primary"/>)}</span><span className="hidden sm:inline">Loty</span></Link>
        <nav className="hidden min-w-0 flex-1 items-center gap-1 lg:flex" aria-label="Dashboard sections">{sections.map(([label])=><Button key={label} size="sm" variant={active===label?"default":"ghost"} className="rounded-full px-3.5 text-xs font-medium transition-all duration-300" onClick={()=>setActive(label)}>{label}</Button>)}</nav>
        <div className="ml-auto flex items-center gap-1">
          <span className="mr-1 hidden rounded-full border border-border bg-secondary px-3 py-1 text-[10px] font-medium sm:inline">{isCommittee ? "Committee" : "Owner"}</span>
          <Button size="icon" variant="ghost" className="rounded-full" aria-label="Notifications" onClick={()=>setActive("Compliance")}><Bell /></Button>
          <Button asChild size="icon" variant="ghost" className="rounded-full" aria-label="Back to home"><Link to="/"><LogOut /></Link></Button>
          <Sheet><SheetTrigger asChild><Button size="icon" variant="ghost" className="rounded-full lg:hidden" aria-label="Open navigation"><Menu/></Button></SheetTrigger><SheetContent side="right"><SheetTitle className="font-display">Your property</SheetTitle><nav className="mt-8 space-y-1">{sections.map(([label,Icon])=><Button key={label} variant={active===label?"default":"ghost"} className="w-full justify-start rounded-full" onClick={()=>setActive(label)}><Icon/>{label}</Button>)}</nav></SheetContent></Sheet>
        </div>
      </div>
    </header>

    <main className="mx-auto max-w-[1500px] px-4 pb-32 pt-10 sm:px-7 sm:pt-14">
      {active === "Dashboard" && <Overview
        scheme={scheme.data ?? null} levies={levies.data ?? []} tasks={tasks.data ?? []} repairs={repairs.data ?? []}
        isCommittee={isCommittee} myLot={myLot} onTaskStatus={(id,status)=>setTaskStatus.mutate({id,status})}
        onRepairStatus={(id,status)=>setRepairStatus.mutate({id,status})} goTo={setActive} email=""/>}

      {active === "Lots" && <LotsSection lots={lots.data ?? []} isCommittee={isCommittee} schemeId={schemeId} onChanged={()=>refresh(["lots"])}/>}

      {active === "Levies" && <LeviesSection levies={levies.data ?? []} isCommittee={isCommittee} schemeId={schemeId}
        onPaid={(id)=>markLevyPaid.mutate(id)} onBudget={()=>refresh(["levies","budgets"])}/>}

      {active === "Work orders" && <WorkOrdersSection orders={repairs.data ?? []} lots={lots.data ?? []} isCommittee={isCommittee} myLot={myLot} schemeId={schemeId}
        onChanged={()=>refresh(["repairs"])}/>}

      {active === "Compliance" && <ComplianceSection tasks={tasks.data ?? []} documents={documents.data ?? []} isCommittee={isCommittee} schemeId={schemeId}
        onStatus={(id,status)=>setTaskStatus.mutate({id,status})} onChanged={()=>refresh(["tasks","documents","document-folders"])}/>}

      {active === "Finance" && <FinanceSection transactions={finance.data ?? []} budgets={budgets.data ?? []} levies={levies.data ?? []}
        forecastLines={forecastLines.data ?? []} lots={lots.data ?? []} documents={documents.data ?? []}
        isCommittee={isCommittee} schemeId={schemeId} goTo={setActive}
        onChanged={()=>refresh(["finance","budgets","levies","forecast-lines","documents","document-folders"])}/>}

      {active === "Insurance" && <InsuranceSection policies={policies.data ?? []} documents={documents.data ?? []} isCommittee={isCommittee}
        schemeId={schemeId} onChanged={()=>refresh(["insurance","documents","document-folders"])}/>}
      {active === "Calendar" && <CalendarSection scheme={scheme.data ?? null} tasks={tasks.data ?? []} levies={levies.data ?? []}
        orders={repairs.data ?? []} goTo={setActive}/>}
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
      <h1 className="mt-4 text-4xl font-medium leading-[1.02] tracking-[-0.04em] sm:text-6xl">Hi there, Here's what's happening.</h1>
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
          <div><p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Work orders</p><h2 className="mt-1 text-lg font-medium tracking-[-0.02em]">{openRepairs ? `${openRepairs} open` : "Nothing open"}</h2></div>
          <Button size="sm" variant="ghost" className="rounded-full" onClick={()=>goTo("Work orders")}>Open work orders <ChevronRight/></Button>
        </div>
        <WorkOrderTable orders={repairs.slice(0, 5)} onOpen={()=>goTo("Work orders")}/>
      </Card>

      {!isCommittee && <Card className="p-7 xl:col-span-12">
        <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Your lot</p>
        <h2 className="mt-2 text-lg font-medium tracking-[-0.02em]">{myLot ? `Lot ${myLot.lot_number}, ${myLot.owner_name ?? ""}` : "No lot linked to your account yet"}</h2>
        <p className="mt-3 text-[13px] text-muted-foreground">{myLot ? `Your share of costs is ${myLot.entitlement_percent}%.` : "Ask your committee to add your email against your lot, and your levies will appear here."}</p>
      </Card>}
    </div>
  </>;
}


function LotDialog({ open, onOpenChange, schemeId, lot, onSaved }: {
  open: boolean; onOpenChange: (v: boolean) => void; schemeId?: string | undefined; lot: Lot | null; onSaved: () => void;
}) {
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!schemeId) return;
    const form = new FormData(e.currentTarget);
    const base = {
      lot_number: Number(form.get("lot_number")),
      owner_name: String(form.get("owner_name") ?? ""),
      owner_email: String(form.get("owner_email") ?? ""),
      owner_phone: String(form.get("owner_phone") ?? ""),
      street_address: String(form.get("street_address") ?? ""),
      occupied_status: String(form.get("occupied_status") ?? "Owner occupied"),
    };
    const { error } = lot
      ? await supabase.from("lots").update(base).eq("id", lot.id)
      : await supabase.from("lots").insert({ ...base, scheme_id: schemeId });
    if (error) { toast(lot ? "Could not update the lot" : "Could not add the lot", { description: error.message }); return; }
    onOpenChange(false); onSaved(); toast(lot ? "Lot updated" : "Lot added");
  };
  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent>
      <DialogHeader><DialogTitle className="font-display tracking-[-0.02em]">{lot ? `Edit lot ${lot.lot_number}` : "Add a lot"}</DialogTitle><DialogDescription>{lot ? "Update the lot number and who owns it." : "Add the lot number and who owns it."}</DialogDescription></DialogHeader>
      <form onSubmit={submit} className="space-y-4">
        <div className="space-y-2"><Label htmlFor="lot_number">Lot number</Label><Input id="lot_number" name="lot_number" type="number" min="1" defaultValue={lot?.lot_number ?? ""} required/></div>
        <div className="space-y-2"><Label htmlFor="owner_name">Owner name</Label><Input id="owner_name" name="owner_name" defaultValue={lot?.owner_name ?? ""}/></div>
        <div className="space-y-2"><Label htmlFor="owner_email">Owner email</Label><Input id="owner_email" name="owner_email" type="email" defaultValue={lot?.owner_email ?? ""}/></div>
        <div className="space-y-2"><Label htmlFor="owner_phone">Owner phone</Label><Input id="owner_phone" name="owner_phone" type="tel" placeholder="04xx xxx xxx" defaultValue={lot?.owner_phone ?? ""}/></div>
        <div className="space-y-2"><Label htmlFor="street_address">Street address</Label><Input id="street_address" name="street_address" placeholder="12 Example St, Suburb" defaultValue={lot?.street_address ?? ""}/></div>
        <div className="space-y-2"><Label>Occupancy</Label><Select name="occupied_status" defaultValue={lot?.occupied_status ?? "Owner occupied"}><SelectTrigger className="w-full"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="Owner occupied">Owner occupied</SelectItem><SelectItem value="Tenanted">Tenanted</SelectItem><SelectItem value="Vacant">Vacant</SelectItem></SelectContent></Select></div>
        <div className="flex justify-end gap-2 pt-2"><Button type="button" variant="ghost" className="rounded-full" onClick={()=>onOpenChange(false)}>Cancel</Button><Button type="submit" className="rounded-full">{lot ? "Save changes" : "Save lot"}</Button></div>
      </form>
    </DialogContent>
  </Dialog>;
}

function DeleteLotButton({ lot, onDeleted }: { lot: Lot; onDeleted: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const timeoutRef = useRef<number | null>(null);

  useEffect(() => () => { if (timeoutRef.current) window.clearTimeout(timeoutRef.current); }, []);

  const handleClick = async () => {
    if (!confirming) {
      setConfirming(true);
      timeoutRef.current = window.setTimeout(() => setConfirming(false), 4000);
      return;
    }
    if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
    const { error } = await supabase.from("lots").delete().eq("id", lot.id);
    if (error) { toast("Could not remove that", { description: error.message }); setConfirming(false); return; }
    onDeleted();
    toast("Lot removed");
  };

  return confirming
    ? <Button type="button" variant="destructive" size="sm" className="rounded-full" onClick={()=>{ void handleClick(); }}>Confirm delete?</Button>
    : <Button type="button" variant="ghost" size="icon" className="rounded-full text-muted-foreground hover:text-destructive"
        aria-label={`Remove lot ${lot.lot_number}`} onClick={()=>{ void handleClick(); }}><Trash2 className="h-4 w-4"/></Button>;
}

function LotsSection({ lots, isCommittee, schemeId, onChanged }: { lots: Lot[]; isCommittee: boolean; schemeId?: string | undefined; onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Lot | null>(null);
  const [viewing, setViewing] = useState<Lot | null>(null);
  return <div>
    <PageHead eyebrow="Your property" title="Lots" blurb="Who owns what and who lives there. Open a lot to see that owner's details."
      action={isCommittee ? <Button className="rounded-full" onClick={()=>{ setEditing(null); setOpen(true); }}><Plus/> Add a lot</Button> : undefined}/>
    <Card className="mt-10 overflow-hidden">
      <div className="divide-y divide-border/70">{lots.map(lot =>
        <button type="button" key={lot.id} onClick={()=>setViewing(lot)}
          className="flex w-full flex-wrap items-center justify-between gap-4 px-7 py-5 text-left transition-colors hover:bg-muted/40">
          <div><p className="text-sm font-medium">Lot {lot.lot_number}{lot.owner_name ? ` · ${lot.owner_name}` : ""}</p><p className="mt-1 text-[12px] text-muted-foreground">{lot.owner_email ?? "No email on file"}</p></div>
          <div className="flex items-center gap-4 text-[12px] text-muted-foreground"><span>{lot.occupied_status}</span><span className="text-foreground">View details</span></div>
        </button>)}
        {lots.length === 0 && <p className="px-7 py-10 text-center text-sm text-muted-foreground">No lots visible to you yet.</p>}
      </div>
    </Card>
    <Dialog open={!!viewing} onOpenChange={(o)=>{ if (!o) setViewing(null); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="font-display tracking-[-0.02em]">Lot {viewing?.lot_number}</DialogTitle>
          <DialogDescription>Owner details on file for this lot.</DialogDescription>
        </DialogHeader>
        <div className="divide-y divide-border/70 text-sm">
          {[["Owner", viewing?.owner_name || "Not recorded"],
            ["Email", viewing?.owner_email || "No email on file"],
            ["Phone", viewing?.owner_phone || "No phone on file"],
            ["Address", viewing?.street_address || "No address on file"],
            ["Occupancy", viewing?.occupied_status || "Not recorded"]].map(([label, value]) =>
            <div key={label} className="flex items-center justify-between gap-6 py-3">
              <span className="text-[12px] uppercase tracking-[0.12em] text-muted-foreground">{label}</span>
              <span className="text-right font-medium">{value}</span>
            </div>)}
        </div>
        <div className={`flex items-center pt-2 ${isCommittee ? "justify-between" : "justify-end"}`}>
          {isCommittee && viewing && <div className="flex items-center gap-2">
            <Button type="button" variant="ghost" size="icon" className="rounded-full" aria-label={`Edit lot ${viewing.lot_number}`}
              onClick={()=>{ setEditing(viewing); setViewing(null); setOpen(true); }}><Pencil className="h-4 w-4"/></Button>
            <DeleteLotButton lot={viewing} onDeleted={()=>{ setViewing(null); onChanged(); }}/>
          </div>}
          <Button className="rounded-full" onClick={()=>setViewing(null)}>Close</Button>
        </div>
      </DialogContent>
    </Dialog>
    {open && <LotDialog open={open} onOpenChange={setOpen} schemeId={schemeId} lot={editing} onSaved={onChanged} key={editing?.id ?? "new"}/>}
  </div>;
}

function reminderText(levy: Levy, status: string) {
  const who = levy.lots?.owner_name ?? "there";
  const year = levy.budgets?.financial_year ? ` for ${levy.budgets.financial_year}` : "";
  return status === "Overdue"
    ? `Hi ${who},\n\nA quick friendly note: the levy${year} for Lot ${levy.lots?.lot_number ?? ""} of ${money(Number(levy.amount))} was due on ${niceDate(levy.due_date)} and is still showing as unpaid on our records.\n\nIf you have already paid, please ignore this and let us know so we can update the books. Otherwise, whenever you get a chance is fine.\n\nThanks,\nYour owners corporation committee`
    : `Hi ${who},\n\nJust a friendly reminder that the levy${year} for Lot ${levy.lots?.lot_number ?? ""} of ${money(Number(levy.amount))} is due on ${niceDate(levy.due_date)}.\n\nNo action needed if it is already on its way.\n\nThanks,\nYour owners corporation committee`;
}

function LeviesSection({ levies, isCommittee, schemeId, onPaid, onBudget }: { levies: Levy[]; isCommittee: boolean; schemeId?: string | undefined; onPaid: (id: string) => void; onBudget: () => void }) {
  const [open, setOpen] = useState(false);
  const [invoice, setInvoice] = useState<Levy | null>(null);
  const [reminder, setReminder] = useState<Levy | null>(null);
  const [showPaid, setShowPaid] = useState(false);
  const [method, setMethod] = useState("Entitlement");

  const years = Array.from(new Set(levies.map(l => l.budgets?.financial_year ?? "Unallocated")));
  const [year, setYear] = useState("All years");
  const inYear = year === "All years" ? levies : levies.filter(l => (l.budgets?.financial_year ?? "Unallocated") === year);

  const paid = inYear.filter(l => l.status === "Paid");
  const unpaid = inYear.filter(l => l.status !== "Paid").sort((a, b) => a.due_date.localeCompare(b.due_date));
  const collected = paid.reduce((s, l) => s + Number(l.amount), 0);
  const owing = unpaid.reduce((s, l) => s + Number(l.amount), 0);
  const overdueCount = unpaid.filter(l => daysUntil(l.due_date) < 0).length;
  const soonCount = unpaid.filter(l => { const d = daysUntil(l.due_date); return d >= 0 && d <= 14; }).length;

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!schemeId) return;
    const form = new FormData(e.currentTarget);
    const { error } = await supabase.from("budgets").insert({
      scheme_id: schemeId,
      financial_year: String(form.get("financial_year") ?? ""),
      admin_fund_total: Number(form.get("admin_fund_total")),
      maintenance_fund_total: Number(form.get("maintenance_fund_total")),
      allocation_method: method,
      levy_due_date: String(form.get("levy_due_date") ?? ""),
    });
    if (error) { toast("Could not create the budget", { description: error.message }); return; }
    setOpen(false); onBudget();
    toast("Budget created", { description: method === "Equal" ? "Every lot was billed an equal share." : "Every lot was billed its entitlement share." });
  };

  const lotsInBudget = (levy: Levy) => levies.filter(l => l.budgets?.financial_year === levy.budgets?.financial_year).length || 1;
  const isEqual = (levy: Levy) => levy.budgets?.allocation_method === "Equal";
  const share = (levy: Levy) => isEqual(levy) ? 1 / lotsInBudget(levy) : Number(levy.lots?.entitlement_percent ?? 0) / 100;
  const adminShare = (levy: Levy) => Number(levy.budgets?.admin_fund_total ?? 0) * share(levy);
  const maintShare = (levy: Levy) => Number(levy.budgets?.maintenance_fund_total ?? 0) * share(levy);

  const rows = showPaid ? [...unpaid, ...paid] : unpaid;

  return <div>
    <PageHead eyebrow="Your property" title="Levies" blurb="Set what is to be paid and how it is split, then track exactly who still owes and how close they are to their due date."
      action={isCommittee ? <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild><Button className="rounded-full"><Plus/> Create a budget</Button></DialogTrigger>
        <DialogContent>
          <DialogHeader><DialogTitle className="font-display tracking-[-0.02em]">Create a budget</DialogTitle><DialogDescription>Choose the totals and how they are split, and Loty issues a notice to every lot.</DialogDescription></DialogHeader>
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-2"><Label htmlFor="financial_year">Financial year</Label><Input id="financial_year" name="financial_year" placeholder="2026/27" required/></div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label htmlFor="admin_fund_total">Admin fund</Label><Input id="admin_fund_total" name="admin_fund_total" type="number" step="0.01" required/></div>
              <div className="space-y-2"><Label htmlFor="maintenance_fund_total">Maintenance fund</Label><Input id="maintenance_fund_total" name="maintenance_fund_total" type="number" step="0.01" required/></div>
            </div>
            <div className="space-y-2">
              <Label>How it is split</Label>
              <Select value={method} onValueChange={setMethod}>
                <SelectTrigger><SelectValue/></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Entitlement">By lot entitlement</SelectItem>
                  <SelectItem value="Equal">Equal share for every lot</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-[11px] leading-5 text-muted-foreground">{method === "Equal" ? "The total is divided evenly, so every lot pays the same amount." : "Each lot pays its entitlement percentage of the total."}</p>
            </div>
            <div className="space-y-2"><Label htmlFor="levy_due_date">Due date</Label><Input id="levy_due_date" name="levy_due_date" type="date" required/></div>
            <div className="flex justify-end gap-2 pt-2"><Button type="button" variant="ghost" className="rounded-full" onClick={()=>setOpen(false)}>Cancel</Button><Button type="submit" className="rounded-full">Create and issue notices</Button></div>
          </form>
        </DialogContent>
      </Dialog> : undefined}/>

    <div className="mt-10 flex flex-wrap items-center gap-2">
      {["All years", ...years].map(option =>
        <button key={option} type="button" onClick={()=>setYear(option)}
          className={`rounded-full px-4 py-2 text-[12px] font-medium transition ${year===option?"bg-primary text-primary-foreground":"border border-border/70 bg-card text-muted-foreground hover:text-foreground"}`}>{option}</button>)}
      <button type="button" onClick={()=>setShowPaid(v=>!v)}
        className="ml-auto rounded-full border border-border/70 bg-card px-4 py-2 text-[12px] font-medium text-muted-foreground hover:text-foreground">
        {showPaid ? "Hide the lots that have paid" : `Show the ${paid.length} lots that have paid`}
      </button>
    </div>

    <div className="mt-5 grid gap-3 sm:grid-cols-3">
      {[["Paid", `${paid.length} of ${inYear.length}`, money(collected)],
        ["Still to pay", `${unpaid.length} of ${inYear.length}`, money(owing)],
        ["Needs attention", overdueCount ? `${overdueCount} overdue` : soonCount ? `${soonCount} due within 14 days` : "Nothing pressing", String(overdueCount + soonCount)]].map(([label, hint, value]) =>
        <div key={label} className="rounded-3xl border border-border/70 bg-card p-5">
          <p className="text-[11px] font-medium text-muted-foreground">{label}</p>
          <p className="mt-3 font-display text-2xl tracking-[-0.03em]">{value}</p>
          <p className="mt-2 text-[11px] text-muted-foreground/80">{hint}</p>
        </div>)}
    </div>

    <Card className="mt-5 overflow-hidden">
      <div className="divide-y divide-border/70">{rows.map(levy => {
        const status = effectiveLevyStatus(levy);
        const left = daysUntil(levy.due_date);
        const alert = status === "Paid" ? null
          : left < 0 ? { tone: "bg-destructive/10 text-destructive", text: `${Math.abs(left)} days overdue` }
          : left <= 14 ? { tone: "bg-primary text-primary-foreground", text: left === 0 ? "Due today" : `Due in ${left} days` }
          : { tone: "bg-secondary text-muted-foreground", text: `Due in ${left} days` };
        return <div key={levy.id} className="flex flex-wrap items-center justify-between gap-4 px-7 py-5">
          <div className="min-w-0">
            <p className="text-sm font-medium">{levy.lots ? `Lot ${levy.lots.lot_number}${levy.lots.owner_name ? ` · ${levy.lots.owner_name}` : ""}` : "Your levy"}</p>
            <p className="mt-1 text-[12px] text-muted-foreground">
              {levy.budgets?.financial_year ? `${levy.budgets.financial_year} · ` : ""}Due {niceDate(levy.due_date)}
              {levy.status === "Paid" && levy.paid_at ? ` · Paid ${niceDate(levy.paid_at)}` : ""}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <span className="font-display text-lg">{money(Number(levy.amount))}</span>
            {alert && <span className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${alert.tone}`}>{alert.text}</span>}
            <StatusPill status={status}/>
            <Button size="sm" variant="ghost" className="rounded-full" onClick={()=>setInvoice(levy)}>Invoice</Button>
            {isCommittee && status !== "Paid" && <Button size="sm" variant="ghost" className="rounded-full" onClick={()=>setReminder(levy)}>Send a reminder</Button>}
            {isCommittee && status !== "Paid" && <Button size="sm" variant="outline" className="rounded-full" onClick={()=>onPaid(levy.id)}>Mark paid</Button>}
          </div>
        </div>;})}
        {rows.length === 0 && <p className="px-7 py-10 text-center text-sm text-muted-foreground">{inYear.length ? "Everyone has paid. Nothing to chase." : "No levies raised yet."}</p>}
      </div>
    </Card>

    <Dialog open={!!invoice} onOpenChange={(o)=>{ if (!o) setInvoice(null); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="font-display tracking-[-0.02em]">Levy invoice</DialogTitle>
          <DialogDescription>{invoice?.budgets?.financial_year ? `Financial year ${invoice.budgets.financial_year}` : "How this amount was worked out."}</DialogDescription>
        </DialogHeader>
        {invoice && <div className="space-y-4 text-sm">
          <div className="rounded-2xl border border-border/70 p-4">
            <p className="font-medium">Lot {invoice.lots?.lot_number ?? ""}{invoice.lots?.owner_name ? ` · ${invoice.lots.owner_name}` : ""}</p>
            <p className="mt-1 text-[12px] text-muted-foreground">{invoice.lots?.owner_email ?? "No email on file"}</p>
          </div>
          <div className="space-y-2">
            {[["How it is split", isEqual(invoice) ? "Equal share for every lot" : "By lot entitlement"],
              [isEqual(invoice) ? "This lot's share" : "Lot entitlement", isEqual(invoice) ? `1 of ${lotsInBudget(invoice)} lots` : `${Number(invoice.lots?.entitlement_percent ?? 0)}%`],
              ["Admin fund share", money(adminShare(invoice))],
              ["Maintenance fund share", money(maintShare(invoice))],
              ["Due date", niceDate(invoice.due_date)],
              ["Status", effectiveLevyStatus(invoice)]].map(([k, v]) =>
              <div key={k} className="flex justify-between border-b border-border/60 pb-2 text-[13px]"><span className="text-muted-foreground">{k}</span><span className="font-medium">{v}</span></div>)}
            <div className="flex justify-between pt-2"><span className="font-medium">Total payable</span><span className="font-display text-xl">{money(Number(invoice.amount))}</span></div>
          </div>
          <p className="text-[11px] leading-5 text-muted-foreground">{isEqual(invoice) ? "The admin fund and the maintenance fund are divided evenly between every lot." : "Each lot pays its entitlement share of the admin fund and the maintenance fund for the year."}</p>
        </div>}
      </DialogContent>
    </Dialog>

    <Dialog open={!!reminder} onOpenChange={(o)=>{ if (!o) setReminder(null); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="font-display tracking-[-0.02em]">Send a friendly reminder</DialogTitle>
          <DialogDescription>A polite note, ready to send to the owner.</DialogDescription>
        </DialogHeader>
        {reminder && <div className="space-y-4">
          <p className="text-[12px] text-muted-foreground">To {reminder.lots?.owner_email ?? "no email on file for this lot"}</p>
          <Textarea readOnly rows={10} className="text-[13px]" value={reminderText(reminder, effectiveLevyStatus(reminder))}/>
          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="ghost" className="rounded-full" onClick={()=>{
              void navigator.clipboard.writeText(reminderText(reminder, effectiveLevyStatus(reminder)));
              toast("Reminder copied", { description: "Paste it wherever you like." });
            }}>Copy the message</Button>
            <Button type="button" className="rounded-full" disabled={!reminder.lots?.owner_email} onClick={()=>{
              const subject = `Levy reminder for Lot ${reminder.lots?.lot_number ?? ""}`;
              window.location.href = `mailto:${reminder.lots?.owner_email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(reminderText(reminder, effectiveLevyStatus(reminder)))}`;
              setReminder(null);
              toast("Reminder ready", { description: "Your email app has it open." });
            }}>Open in email</Button>
          </div>
        </div>}
      </DialogContent>
    </Dialog>
  </div>;
}


const COMPLIANCE_FOLDER = "Compliance";

function ComplianceSection({ tasks, documents, isCommittee, schemeId, onStatus, onChanged }: {
  tasks: Task[]; documents: Doc[]; isCommittee: boolean; schemeId?: string | undefined;
  onStatus: (id: string, status: string) => void; onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

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

  const complianceFolderId = async () => {
    if (!schemeId) return null;
    const { data } = await supabase.from("document_folders").select("id").eq("scheme_id", schemeId).eq("name", COMPLIANCE_FOLDER).maybeSingle();
    if (data?.id) return data.id as string;
    const { data: made, error } = await supabase.from("document_folders")
      .insert({ scheme_id: schemeId, name: COMPLIANCE_FOLDER, icon: "ShieldCheck", color: "green" }).select("id").single();
    if (error) throw error;
    return made.id as string;
  };

  const attach = async (task: Task, files: FileList | null) => {
    if (!files?.length || !schemeId) return;
    setBusy(task.id);
    try {
      const folderId = await complianceFolderId();
      for (const file of Array.from(files)) {
        const path = `${schemeId}/${crypto.randomUUID()}-${file.name.replace(/[^\w.\-]/g, "_")}`;
        const { error: upErr } = await supabase.storage.from("documents").upload(path, file);
        if (upErr) throw upErr;
        const { error } = await supabase.from("documents").insert({
          scheme_id: schemeId, name: file.name, category: task.task_name, folder_id: folderId,
          compliance_task_id: task.id, storage_path: path, file_size: file.size, mime_type: file.type,
        });
        if (error) throw error;
      }
      onChanged();
      toast("Filed under Compliance in your documents");
    } catch (err) {
      toast("Could not attach that", { description: (err as Error).message });
    } finally { setBusy(null); }
  };

  const openDoc = async (doc: Doc) => {
    if (!doc.storage_path) { toast("No file attached to this record"); return; }
    const { data, error } = await supabase.storage.from("documents").createSignedUrl(doc.storage_path, 600);
    if (error || !data) { toast("Could not open the file", { description: error?.message }); return; }
    window.open(data.signedUrl, "_blank");
  };

  const removeDoc = async (doc: Doc) => {
    if (doc.storage_path) await supabase.storage.from("documents").remove([doc.storage_path]);
    const { error } = await supabase.from("documents").delete().eq("id", doc.id);
    if (error) { toast("Could not remove it", { description: error.message }); return; }
    onChanged(); toast("Removed");
  };

  return <div>
    <PageHead eyebrow="Your property" title="Compliance" blurb="The things the law expects each year, in plain English, with dates attached. Attach the paperwork and it files itself under Compliance in your documents."
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
        const files = documents.filter(d => d.compliance_task_id === task.id);
        return <div key={task.id} className="px-7 py-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div><p className="text-sm font-medium">{task.task_name}</p><p className="mt-1 text-[12px] text-muted-foreground">{task.detail ? `${task.detail} · ` : ""}Due {niceDate(task.due_date)}</p></div>
            <div className="flex items-center gap-3">
              <span className={`text-[12px] ${urgent ? "font-medium text-destructive" : "text-muted-foreground"}`}>{task.status === "Complete" ? "Done" : left < 0 ? `${Math.abs(left)} days overdue` : `${left} days left`}</span>
              {isCommittee && <Button asChild variant="outline" size="sm" className="rounded-full">
                <label>{busy === task.id ? "Attaching" : "Attach document"}
                  <input type="file" multiple className="sr-only" onChange={e => { void attach(task, e.target.files); e.target.value = ""; }}/>
                </label>
              </Button>}
              {isCommittee
                ? <Select value={task.status} onValueChange={(value)=>onStatus(task.id, value)}><SelectTrigger className="w-[150px] rounded-full"><SelectValue/></SelectTrigger><SelectContent>{["Not Started","In Progress","Complete"].map(s=><SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select>
                : <StatusPill status={task.status}/>}
            </div>
          </div>
          {files.length > 0 && <div className="mt-4 flex flex-wrap gap-2">
            {files.map(doc => <span key={doc.id} className="inline-flex items-center gap-2 rounded-full bg-secondary px-3 py-1.5 text-[12px]">
              <Files className="h-3.5 w-3.5 text-muted-foreground"/>
              <button type="button" className="underline-offset-4 hover:underline" onClick={()=>{ void openDoc(doc); }}>{doc.name}</button>
              {isCommittee && <button type="button" aria-label={`Remove ${doc.name}`} className="text-muted-foreground hover:text-destructive" onClick={()=>{ void removeDoc(doc); }}>×</button>}
            </span>)}
          </div>}
        </div>;})}
        {tasks.length === 0 && <p className="px-7 py-10 text-center text-sm text-muted-foreground">Nothing recorded yet.</p>}
      </div>
    </Card>
  </div>;
}
