import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip as ChartTooltip, XAxis, YAxis } from "recharts";
import { Building2, CalendarDays, Check, ChevronRight, Coins, FileCheck2, Files, Gavel, History, LayoutDashboard, LogOut, Menu, Paperclip, Pencil, Plus, Receipt, Settings, ShieldCheck, Trash2, Undo2, WalletCards, Wrench } from "lucide-react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";
import { WorkOrdersSection, WorkOrderTable, type WorkOrder } from "@/components/work-orders";
import { CalendarSection } from "@/components/calendar-view";
import { DocumentsSection, type DocFile } from "@/components/documents";
import { InsuranceSection, type Policy } from "@/components/insurance";
import { OverviewSection, type DashboardWidget, type Notice, type NoticeComment } from "@/components/overview";
import { FinanceSection, type FinanceBudget, type FinanceTx, type ForecastLine } from "@/components/finance";
import { SettingsSection, type SchemeSettings, type CommitteeRole } from "@/components/settings";
import { NotificationsBell } from "@/components/notifications";

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

export type Scheme = { id: string; name: string; address: string; total_lots: number; tier: string | null; next_agm_date: string | null };
export type Lot = {
  id: string; lot_number: number; owner_name: string | null; owner_email: string | null;
  owner_phone: string | null; street_address: string | null;
  owner_user_id: string | null; entitlement_percent: number; occupied_status: string
};
type Levy = {
  id: string; lot_id: string; budget_id: string; amount: number; due_date: string; status: string; paid_at: string | null;
  lots: { lot_number: number; owner_name: string | null; owner_email: string | null; entitlement_percent: number } | null;
  budgets: { financial_year: string; admin_fund_total: number; maintenance_fund_total: number; allocation_method: string | null } | null;
};
export type BudgetLineItem = { id: string; budget_id: string; scheme_id: string; fund: string; description: string; amount: number; cost_type: string };
type DraftLineItemJson = { fund: string; description: string; amount: number };
type BudgetRevision = {
  id: string; budget_id: string; scheme_id: string; reason: string;
  previous_admin_fund_total: number; previous_maintenance_fund_total: number;
  previous_allocation_method: string; previous_levy_due_date: string; previous_line_items: DraftLineItemJson[];
  new_admin_fund_total: number; new_maintenance_fund_total: number;
  new_allocation_method: string; new_levy_due_date: string; new_line_items: DraftLineItemJson[];
  levies_recalculated: boolean; created_at: string;
};
type Task = { id: string; task_name: string; detail: string | null; due_date: string; status: string; widget_id: string | null; created_at: string };
export type ComplianceWidget = {
  id: string; scheme_id: string; label: string; is_standard: boolean; standard_key: string | null;
  default_detail: string | null; enabled: boolean; sort_order: number;
};
type Repair = WorkOrder;
type Doc = DocFile;

const sections = [
  ["Dashboard", LayoutDashboard], ["Lots", Building2], ["Levies", WalletCards], ["Work orders", Wrench],
  ["Finance", Coins], ["Insurance", ShieldCheck], ["Compliance", FileCheck2], ["Calendar", CalendarDays],
  ["Documents", Files],
] as const;

export const money = (n: number) => n.toLocaleString("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 });
const daysUntil = (date: string) => Math.ceil((new Date(date + "T00:00:00").getTime() - new Date(new Date().toDateString()).getTime()) / 86400000);
const effectiveLevyStatus = (levy: Levy) => (levy.status === "Pending" && daysUntil(levy.due_date) < 0 ? "Overdue" : levy.status);
const niceDate = (value: string) => new Date(value).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });

function DashboardPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [active, setActive] = useState("Dashboard");

  const [session, setSession] = useState<Session | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setAuthChecked(true);
      if (!data.session) navigate({ to: "/auth", replace: true });
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, sess) => {
      setSession(sess);
      if (!sess) navigate({ to: "/auth", replace: true });
    });
    return () => sub.subscription.unsubscribe();
  }, [navigate]);
  const userId = session?.user?.id;

  const scheme = useQuery({
    queryKey: ["scheme"],
    queryFn: async () => {
      const { data, error } = await supabase.from("schemes").select("*").order("created_at").limit(1).maybeSingle();
      if (error) throw error;
      return data as Scheme | null;
    },
  });
  const schemeId = scheme.data?.id;

  const roleQuery = useQuery({
    queryKey: ["user-role", userId],
    queryFn: async () => {
      const { data, error } = await supabase.from("user_roles").select("role").eq("user_id", userId!).maybeSingle();
      if (error) throw error;
      return data?.role ?? "Owner";
    },
    enabled: !!userId,
  });
  const myLotQuery = useQuery({
    queryKey: ["my-lot", userId],
    queryFn: async () => {
      const { data, error } = await supabase.from("lots").select("*").eq("owner_user_id", userId!).maybeSingle();
      if (error) throw error;
      return data as unknown as Lot | null;
    },
    enabled: !!userId,
  });

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
  const complianceWidgets = useQuery({
    queryKey: ["compliance-widgets"],
    queryFn: async () => {
      const { data, error } = await supabase.from("compliance_widgets").select("*").order("sort_order");
      if (error) throw error;
      return (data ?? []) as unknown as ComplianceWidget[];
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

  const dashboardWidgets = useQuery({
    queryKey: ["dashboard-widgets"],
    queryFn: async () => {
      const { data, error } = await supabase.from("dashboard_widgets").select("*").order("sort_order");
      if (error) throw error;
      return (data ?? []) as unknown as DashboardWidget[];
    },
  });
  const notices = useQuery({
    queryKey: ["notices"],
    queryFn: async () => {
      const { data, error } = await supabase.from("notices").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as Notice[];
    },
  });
  const noticeComments = useQuery({
    queryKey: ["notice-comments"],
    queryFn: async () => {
      const { data, error } = await supabase.from("notice_comments").select("*").order("created_at");
      if (error) throw error;
      return (data ?? []) as unknown as NoticeComment[];
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
  const budgetLineItems = useQuery({
    queryKey: ["budget-line-items"],
    queryFn: async () => {
      const { data, error } = await supabase.from("budget_line_items").select("*").order("created_at");
      if (error) throw error;
      return (data ?? []) as unknown as BudgetLineItem[];
    },
  });
  const budgetRevisions = useQuery({
    queryKey: ["budget-revisions"],
    queryFn: async () => {
      const { data, error } = await supabase.from("budget_revisions").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as BudgetRevision[];
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

  const committeeRoles = useQuery({
    queryKey: ["committee-roles"],
    queryFn: async () => {
      const { data, error } = await supabase.from("committee_roles").select("*");
      if (error) throw error;
      return (data ?? []) as unknown as CommitteeRole[];
    },
  });
  const schemeSettings = useQuery({
    queryKey: ["scheme-settings"],
    queryFn: async () => {
      const { data, error } = await supabase.from("scheme_settings").select("*").eq("scheme_id", schemeId!).maybeSingle();
      if (error) throw error;
      return data as unknown as SchemeSettings | null;
    },
    enabled: !!schemeId,
  });

  const refresh = (keys: string[]) => keys.forEach(key => queryClient.invalidateQueries({ queryKey: [key] }));

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

  const isCommittee = roleQuery.data === "Committee";
  const myLot = myLotQuery.data ?? null;

  useEffect(() => {
    if (!authChecked || !userId || scheme.isLoading || roleQuery.isLoading) return;
    if (scheme.data === null && isCommittee) navigate({ to: "/onboarding", replace: true });
  }, [authChecked, userId, scheme.isLoading, scheme.data, roleQuery.isLoading, isCommittee, navigate]);

  if (!authChecked) return null;

  return <div className="relative isolate min-h-screen bg-background">
    <Toaster />
    <header className="sticky top-0 z-40 border-b border-border/70 bg-background/80 backdrop-blur-xl">
      <div className="mx-auto flex h-[68px] max-w-[1500px] items-center gap-4 px-4 sm:px-7">
        <Link to="/" className="mr-2 flex shrink-0 items-center gap-2 font-display text-lg font-semibold tracking-[-0.02em]"><span className="grid size-5 grid-cols-2 gap-0.5">{[0,1,2,3].map(i=><span key={i} className="rounded-[2px] bg-primary"/>)}</span><span className="hidden sm:inline">Loty</span></Link>
        <nav className="hidden min-w-0 flex-1 items-center gap-1 lg:flex" aria-label="Dashboard sections">{sections.map(([label])=><Button key={label} size="sm" variant={active===label?"default":"ghost"} className="rounded-full px-3.5 text-xs font-medium transition-all duration-300" onClick={()=>setActive(label)}>{label}</Button>)}</nav>
        <div className="ml-auto flex items-center gap-1">
          <Button size="icon" variant="ghost" className="rounded-full" aria-label="Settings" onClick={()=>setActive("Settings")}><Settings /></Button>
          <NotificationsBell schemeId={schemeId} userId={userId} isCommittee={isCommittee} myLot={myLot} goTo={setActive}/>
          <Button size="icon" variant="ghost" className="rounded-full" aria-label="Sign out" onClick={()=>{ void supabase.auth.signOut().then(()=>navigate({ to: "/", replace: true })); }}><LogOut /></Button>
          <Sheet><SheetTrigger asChild><Button size="icon" variant="ghost" className="rounded-full lg:hidden" aria-label="Open navigation"><Menu/></Button></SheetTrigger><SheetContent side="right"><SheetTitle className="font-display">Your property</SheetTitle><nav className="mt-8 space-y-1">{sections.map(([label,Icon])=><Button key={label} variant={active===label?"default":"ghost"} className="w-full justify-start rounded-full" onClick={()=>setActive(label)}><Icon/>{label}</Button>)}</nav></SheetContent></Sheet>
        </div>
      </div>
    </header>

    <main className="mx-auto max-w-[1500px] px-4 pb-32 pt-10 sm:px-7 sm:pt-14">
      {active === "Dashboard" && <OverviewSection
        scheme={scheme.data ?? null} levies={levies.data ?? []} budgets={budgets.data ?? []} transactions={finance.data ?? []}
        tasks={tasks.data ?? []} repairs={repairs.data ?? []} myLot={myLot} notices={notices.data ?? []} noticeComments={noticeComments.data ?? []}
        widgets={dashboardWidgets.data ?? []} widgetsLoading={dashboardWidgets.isLoading} isCommittee={isCommittee} schemeId={schemeId}
        onTaskStatus={(id,status)=>setTaskStatus.mutate({id,status})}
        onChanged={()=>refresh(["dashboard-widgets","notices","notice-comments"])} goTo={setActive}/>}

      {active === "Lots" && <LotsSection lots={lots.data ?? []} isCommittee={isCommittee} schemeId={schemeId} onChanged={()=>refresh(["lots"])}/>}

      {active === "Levies" && <LeviesSection levies={levies.data ?? []} lots={lots.data ?? []} budgets={budgets.data ?? []}
        lineItems={budgetLineItems.data ?? []} revisions={budgetRevisions.data ?? []} documents={documents.data ?? []}
        isCommittee={isCommittee} schemeId={schemeId} onPaid={(id)=>markLevyPaid.mutate(id)}
        onBudget={()=>refresh(["levies","budgets","budget-line-items","budget-revisions","documents","document-folders"])}/>}

      {active === "Work orders" && <WorkOrdersSection orders={repairs.data ?? []} lots={lots.data ?? []} isCommittee={isCommittee} myLot={myLot} schemeId={schemeId}
        onChanged={()=>refresh(["repairs"])}/>}

      {active === "Compliance" && <ComplianceSection tasks={tasks.data ?? []} documents={documents.data ?? []} widgets={complianceWidgets.data ?? []}
        isCommittee={isCommittee} schemeId={schemeId} onStatus={(id,status)=>setTaskStatus.mutate({id,status})}
        onChanged={()=>refresh(["tasks","documents","document-folders","compliance-widgets"])}/>}

      {active === "Finance" && <FinanceSection transactions={finance.data ?? []} budgets={budgets.data ?? []} levies={levies.data ?? []}
        forecastLines={forecastLines.data ?? []} lineItems={budgetLineItems.data ?? []} lots={lots.data ?? []} documents={documents.data ?? []}
        isCommittee={isCommittee} schemeId={schemeId} goTo={setActive}
        onChanged={()=>refresh(["finance","budgets","levies","budget-line-items","forecast-lines","documents","document-folders"])}/>}

      {active === "Insurance" && <InsuranceSection policies={policies.data ?? []} documents={documents.data ?? []} isCommittee={isCommittee}
        schemeId={schemeId} onChanged={()=>refresh(["insurance","documents","document-folders"])}/>}
      {active === "Calendar" && <CalendarSection scheme={scheme.data ?? null} tasks={tasks.data ?? []} levies={levies.data ?? []}
        orders={repairs.data ?? []} goTo={setActive}/>}
      {active === "Documents" && <DocumentsSection documents={documents.data ?? []} isCommittee={isCommittee} schemeId={schemeId} onChanged={()=>refresh(["documents"])}/>}

      {active === "Settings" && <SettingsSection scheme={scheme.data ?? null} lots={lots.data ?? []}
        committeeRoles={committeeRoles.data ?? []} settings={schemeSettings.data ?? null}
        isCommittee={isCommittee} schemeId={schemeId}
        onChanged={()=>refresh(["scheme","lots","committee-roles","scheme-settings"])}/>}
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



function LotDialog({ open, onOpenChange, schemeId, lot, onSaved }: {
  open: boolean; onOpenChange: (v: boolean) => void; schemeId?: string | undefined; lot: Lot | null; onSaved: () => void;
}) {
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!schemeId) return;
    const form = new FormData(e.currentTarget);
    const base = {
      lot_number: Number(form.get("lot_number")),
      entitlement_percent: Number(form.get("entitlement_percent")) || 0,
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
        <div className="space-y-2"><Label htmlFor="entitlement_percent">Ownership allotment (%)</Label><Input id="entitlement_percent" name="entitlement_percent" type="number" min="0" step="0.001" placeholder="e.g. 12.5" defaultValue={lot?.entitlement_percent ?? ""}/></div>
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
          <div className="flex items-center gap-4 text-[12px] text-muted-foreground"><span>{lot.entitlement_percent}% entitlement</span><span>{lot.occupied_status}</span><span className="text-foreground">View details</span></div>
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
            ["Entitlement", `${viewing?.entitlement_percent ?? 0}%`],
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

const LEVY_FOLDER = "Levies";

export async function ensureLevyFolder(schemeId: string) {
  const { data: found } = await supabase.from("document_folders").select("id").eq("scheme_id", schemeId).eq("name", LEVY_FOLDER).maybeSingle();
  if (found?.id) return found.id as string;
  const { data, error } = await supabase.from("document_folders").insert({ scheme_id: schemeId, name: LEVY_FOLDER, icon: "Receipt", color: "amber" }).select("id").single();
  if (error) return null;
  return data.id as string;
}

export async function uploadLevyDoc(schemeId: string, file: File, opts: { category: string; budget_line_item_id?: string; levy_id?: string }) {
  const folderId = await ensureLevyFolder(schemeId);
  const path = `${schemeId}/${crypto.randomUUID()}-${file.name}`;
  const up = await supabase.storage.from("documents").upload(path, file);
  if (up.error) return { error: up.error.message };
  const { error } = await supabase.from("documents").insert({
    scheme_id: schemeId, name: file.name, category: opts.category, folder_id: folderId,
    storage_path: path, file_size: file.size, mime_type: file.type,
    budget_line_item_id: opts.budget_line_item_id ?? null, levy_id: opts.levy_id ?? null,
  });
  return { error: error?.message };
}

async function openLevyDoc(doc: DocFile) {
  if (!doc.storage_path) return;
  const { data, error } = await supabase.storage.from("documents").createSignedUrl(doc.storage_path, 600);
  if (error || !data) { toast("Could not open that file"); return; }
  window.open(data.signedUrl, "_blank", "noopener");
}

export const shareAmount = (method: string, entitlementPercent: number, lotCount: number, total: number) =>
  Math.round((method === "Equal" ? total / Math.max(1, lotCount) : (entitlementPercent / 100) * total) * 100) / 100;

export type DraftLine = { id: string; fund: "Admin" | "Maintenance"; costType: "Fixed" | "Variable"; description: string; amount: string; file: File | null };
export const emptyDraftLine = (): DraftLine => ({ id: crypto.randomUUID(), fund: "Admin", costType: "Variable", description: "", amount: "", file: null });
export const draftTotals = (lines: DraftLine[]) => ({
  admin: lines.filter(l => l.fund === "Admin").reduce((s, l) => s + (Number(l.amount) || 0), 0),
  maintenance: lines.filter(l => l.fund === "Maintenance").reduce((s, l) => s + (Number(l.amount) || 0), 0),
  fixed: lines.filter(l => l.costType === "Fixed").reduce((s, l) => s + (Number(l.amount) || 0), 0),
  variable: lines.filter(l => l.costType === "Variable").reduce((s, l) => s + (Number(l.amount) || 0), 0),
});
const lineItemsToDraft = (items: { id: string; fund: string; description: string; amount: number; cost_type?: string }[]): DraftLine[] =>
  items.length ? items.map(i => ({ id: i.id, fund: i.fund === "Maintenance" ? "Maintenance" : "Admin", costType: i.cost_type === "Fixed" ? "Fixed" : "Variable", description: i.description, amount: String(i.amount), file: null })) : [emptyDraftLine()];
const jsonLineItemsToDraft = (items: DraftLineItemJson[]): DraftLine[] =>
  items.length ? items.map(i => ({ id: crypto.randomUUID(), fund: i.fund === "Maintenance" ? "Maintenance" : "Admin", costType: "Variable", description: i.description, amount: String(i.amount), file: null })) : [emptyDraftLine()];

const budgetChangeText = (financialYear: string, reason: string, prevAdmin: number, prevMaint: number, newAdmin: number, newMaint: number, recalculated: boolean) => [
  `Budget update for ${financialYear}`,
  ``,
  reason,
  ``,
  `Admin fund: ${money(prevAdmin)} → ${money(newAdmin)}`,
  `Maintenance fund: ${money(prevMaint)} → ${money(newMaint)}`,
  ``,
  recalculated
    ? "Levies still to be paid have been recalculated to reflect this. If you have already paid, you may hear from us separately about an adjustment to your amount."
    : "This does not change any levy amounts already issued.",
  ``,
  `Thanks,\nYour owners corporation committee`,
].join("\n");

const refundText = (levy: Levy, diff: number, financialYear: string) => {
  const who = levy.lots?.owner_name ?? "there";
  const lot = levy.lots?.lot_number ?? "";
  const reassessed = Number(levy.amount) + diff;
  return diff < 0
    ? `Hi ${who},\n\nFollowing a correction to the ${financialYear} budget, your paid levy for Lot ${lot} of ${money(Number(levy.amount))} has been reassessed at ${money(reassessed)}.\n\nYou are owed a refund of ${money(-diff)}. The committee will arrange this with you directly.\n\nThanks,\nYour owners corporation committee`
    : `Hi ${who},\n\nFollowing a correction to the ${financialYear} budget, your paid levy for Lot ${lot} of ${money(Number(levy.amount))} has been reassessed at ${money(reassessed)}.\n\nAn additional ${money(diff)} is now owing. The committee will follow up with you about this.\n\nThanks,\nYour owners corporation committee`;
};

export function LineItemsEditor({ lines, setLines }: { lines: DraftLine[]; setLines: (lines: DraftLine[]) => void }) {
  const update = (id: string, patch: Partial<DraftLine>) => setLines(lines.map(l => l.id === id ? { ...l, ...patch } : l));
  const remove = (id: string) => { if (lines.length > 1) setLines(lines.filter(l => l.id !== id)); };
  return <div className="space-y-3">
    <p className="text-[11px] leading-5 text-muted-foreground">
      <span className="font-medium">Fixed</span> — a known, recurring cost (insurance, a cleaning contract). <span className="font-medium">Variable</span> — a one-off or estimated cost (a repair quote).
    </p>
    {lines.map(line => <div key={line.id} className="rounded-2xl border border-border/70 p-3">
      <div className="grid gap-2 sm:grid-cols-[110px_100px_1fr_130px_auto_auto] sm:items-center">
        <Select value={line.fund} onValueChange={(v) => update(line.id, { fund: v as "Admin" | "Maintenance" })}>
          <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="Admin">Admin</SelectItem><SelectItem value="Maintenance">Maintenance</SelectItem></SelectContent>
        </Select>
        <Select value={line.costType} onValueChange={(v) => update(line.id, { costType: v as "Fixed" | "Variable" })}>
          <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="Fixed">Fixed</SelectItem><SelectItem value="Variable">Variable</SelectItem></SelectContent>
        </Select>
        <Input placeholder="What is it" value={line.description} onChange={e => update(line.id, { description: e.target.value })} className="h-9" />
        <Input type="number" min="0" step="0.01" placeholder="Amount" value={line.amount} onChange={e => update(line.id, { amount: e.target.value })} className="h-9" />
        <Button asChild type="button" size="icon" variant="ghost" className="rounded-full" aria-label="Attach evidence of cost">
          <label><Paperclip className="size-4" /><input type="file" className="hidden" onChange={e => { const f = e.target.files?.[0] ?? null; update(line.id, { file: f }); e.currentTarget.value = ""; }} /></label>
        </Button>
        <Button type="button" size="icon" variant="ghost" className="rounded-full text-muted-foreground" aria-label="Remove this line" onClick={() => remove(line.id)}><Trash2 className="size-4" /></Button>
      </div>
      {line.file && <p className="mt-2 text-[11px] text-muted-foreground">Attaching: {line.file.name}</p>}
    </div>)}
    <Button type="button" variant="outline" size="sm" className="rounded-full" onClick={() => setLines([...lines, emptyDraftLine()])}><Plus className="size-3.5" />Add a line</Button>
  </div>;
}

export function InvoicePreview({ lots, method, total }: { lots: Lot[]; method: string; total: number }) {
  if (lots.length === 0) return <p className="text-[12px] text-muted-foreground">Add your lots first and this will show what each one will be billed.</p>;
  return <div className="divide-y divide-border/60 rounded-2xl border border-border/70">
    {lots.map(l => <div key={l.id} className="flex items-center justify-between gap-4 px-4 py-2.5 text-[13px]">
      <span>Lot {l.lot_number}{l.owner_name ? ` · ${l.owner_name}` : ""}</span>
      <span className="font-medium tabular-nums">{money(shareAmount(method, l.entitlement_percent, lots.length, total))}</span>
    </div>)}
  </div>;
}

export function CreateBudgetDialog({ open, onOpenChange, schemeId, lots, onCreated, initialLines }: {
  open: boolean; onOpenChange: (v: boolean) => void; schemeId?: string | undefined; lots: Lot[]; onCreated: () => void;
  initialLines?: DraftLine[] | undefined;
}) {
  const [lines, setLines] = useState<DraftLine[]>(initialLines && initialLines.length > 0 ? initialLines : [emptyDraftLine()]);
  const [method, setMethod] = useState("Entitlement");
  const [financialYear, setFinancialYear] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const totals = draftTotals(lines);
  const total = totals.admin + totals.maintenance;

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!schemeId) return;
    const validLines = lines.filter(l => l.description.trim() !== "" && Number(l.amount) > 0);
    if (validLines.length === 0 || total <= 0) { toast("Add at least one line item with a description and an amount"); return; }
    setSubmitting(true);
    const { data: budget, error } = await supabase.from("budgets").insert({
      scheme_id: schemeId, financial_year: financialYear, admin_fund_total: totals.admin,
      maintenance_fund_total: totals.maintenance, allocation_method: method, levy_due_date: dueDate,
    }).select().single();
    if (error || !budget) { toast("Could not create the budget", { description: error?.message }); setSubmitting(false); return; }
    const failures: string[] = [];
    for (const line of validLines) {
      const { data: item, error: itemError } = await supabase.from("budget_line_items").insert({
        budget_id: budget.id as string, scheme_id: schemeId, fund: line.fund, cost_type: line.costType, description: line.description, amount: Number(line.amount),
      }).select().single();
      if (itemError || !item) { failures.push(line.description); continue; }
      if (line.file) {
        const up = await uploadLevyDoc(schemeId, line.file, { category: "Budget line item", budget_line_item_id: item.id as string });
        if (up.error) failures.push(`${line.description} (evidence file)`);
      }
    }
    setSubmitting(false);
    onOpenChange(false); onCreated();
    if (failures.length > 0) {
      toast("Budget created, but some items need attention", { description: `Could not save: ${failures.join(", ")}. The budget and levies were still created — add these manually from the budget's line items.` });
    } else {
      toast("Budget created", { description: method === "Equal" ? "Every lot was billed an equal share." : "Every lot was billed its entitlement share." });
    }
  };

  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-[640px]">
      <DialogHeader><DialogTitle className="font-display tracking-[-0.02em]">Create a budget</DialogTitle><DialogDescription>Break the year into line items, and Loty issues a notice to every lot from the totals.</DialogDescription></DialogHeader>
      <form onSubmit={submit} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2"><Label htmlFor="financial_year">Financial year</Label><Input id="financial_year" value={financialYear} onChange={e => setFinancialYear(e.target.value)} placeholder="2026/27" required /></div>
          <div className="space-y-2"><Label htmlFor="levy_due_date">Due date</Label><Input id="levy_due_date" type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} required /></div>
        </div>
        <div className="space-y-2">
          <Label>How it is split</Label>
          <Select value={method} onValueChange={setMethod}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="Entitlement">By lot entitlement</SelectItem><SelectItem value="Equal">Equal share for every lot</SelectItem></SelectContent>
          </Select>
          <p className="text-[11px] leading-5 text-muted-foreground">{method === "Equal" ? "The total is divided evenly, so every lot pays the same amount." : "Each lot pays its entitlement percentage of the total."}</p>
        </div>
        <div className="space-y-2">
          <Label>Line items</Label>
          <LineItemsEditor lines={lines} setLines={setLines} />
        </div>
        <div className="rounded-2xl border border-border/70 bg-secondary/40 p-4 text-[13px]">
          <div className="flex justify-between"><span className="text-muted-foreground">Admin fund total</span><span className="font-medium tabular-nums">{money(totals.admin)}</span></div>
          <div className="mt-1.5 flex justify-between"><span className="text-muted-foreground">Maintenance fund total</span><span className="font-medium tabular-nums">{money(totals.maintenance)}</span></div>
          <div className="mt-3 flex justify-between border-t border-border/60 pt-3 text-[12px] text-muted-foreground"><span>Fixed costs</span><span className="tabular-nums">{money(totals.fixed)}</span></div>
          <div className="mt-1 flex justify-between text-[12px] text-muted-foreground"><span>Variable costs</span><span className="tabular-nums">{money(totals.variable)}</span></div>
          <p className="mt-3 border-t border-border/60 pt-3 text-[11px] leading-5 text-muted-foreground">Admin fund — day-to-day running costs. Maintenance fund — savings for bigger repairs and works.</p>
        </div>
        {lots.length > 0 && total > 0 && <div className="space-y-2">
          <Label>Preview — what each lot will be billed</Label>
          <InvoicePreview lots={lots} method={method} total={total} />
        </div>}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" className="rounded-full" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="submit" className="rounded-full" disabled={submitting}>{submitting ? "Creating…" : "Create and issue notices"}</Button>
        </div>
      </form>
    </DialogContent>
  </Dialog>;
}

type EditOutcome = { adjustments: { levy: Levy; oldAmount: number; newAmount: number; diff: number }[]; recalculated: boolean };

function EditBudgetDialog({ open, onOpenChange, schemeId, budget, lots, levies, lineItems, revertFrom, onSaved }: {
  open: boolean; onOpenChange: (v: boolean) => void; schemeId?: string | undefined; budget: FinanceBudget;
  lots: Lot[]; levies: Levy[]; lineItems: BudgetLineItem[]; revertFrom: BudgetRevision | null; onSaved: () => void;
}) {
  const originalLines = lineItems.filter(li => li.budget_id === budget.id);
  const [lines, setLines] = useState<DraftLine[]>(revertFrom ? jsonLineItemsToDraft(revertFrom.previous_line_items) : lineItemsToDraft(originalLines));
  const [method, setMethod] = useState(revertFrom ? revertFrom.previous_allocation_method : (budget.allocation_method ?? "Entitlement"));
  const [dueDate, setDueDate] = useState(revertFrom ? revertFrom.previous_levy_due_date : budget.levy_due_date);
  const [reason, setReason] = useState(revertFrom ? `Reverted to the version from ${niceDate(revertFrom.created_at)}` : "");
  const [recalculate, setRecalculate] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [outcome, setOutcome] = useState<EditOutcome | null>(null);
  const totals = draftTotals(lines);
  const total = totals.admin + totals.maintenance;
  const allOwnerEmails = lots.map(l => l.owner_email).filter((e): e is string => !!e);

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!schemeId) return;
    if (reason.trim() === "") { toast("Add a short reason for this change first"); return; }
    const validLines = lines.filter(l => l.description.trim() !== "" && Number(l.amount) > 0);
    if (validLines.length === 0) { toast("Add at least one line item"); return; }
    setSubmitting(true);

    const { error: revError } = await supabase.from("budget_revisions").insert({
      budget_id: budget.id, scheme_id: schemeId, reason,
      previous_admin_fund_total: budget.admin_fund_total, previous_maintenance_fund_total: budget.maintenance_fund_total,
      previous_allocation_method: budget.allocation_method ?? "Entitlement", previous_levy_due_date: budget.levy_due_date,
      previous_line_items: originalLines.map(li => ({ fund: li.fund, description: li.description, amount: li.amount })),
      new_admin_fund_total: totals.admin, new_maintenance_fund_total: totals.maintenance,
      new_allocation_method: method, new_levy_due_date: dueDate,
      new_line_items: validLines.map(l => ({ fund: l.fund, description: l.description, amount: Number(l.amount) })),
      levies_recalculated: recalculate,
    });
    if (revError) { toast("Could not record this change", { description: revError.message }); setSubmitting(false); return; }

    const { error: budgetError } = await supabase.from("budgets").update({
      admin_fund_total: totals.admin, maintenance_fund_total: totals.maintenance, allocation_method: method, levy_due_date: dueDate,
    }).eq("id", budget.id);
    if (budgetError) { toast("Could not update the budget", { description: budgetError.message }); setSubmitting(false); return; }

    const originalIds = new Set(originalLines.map(li => li.id));
    const draftIds = new Set(validLines.map(l => l.id));
    const failures: string[] = [];
    for (const li of originalLines) {
      if (!draftIds.has(li.id)) {
        const { error } = await supabase.from("budget_line_items").delete().eq("id", li.id);
        if (error) failures.push(li.description);
      }
    }
    for (const line of validLines) {
      if (originalIds.has(line.id)) {
        const { error } = await supabase.from("budget_line_items").update({ fund: line.fund, cost_type: line.costType, description: line.description, amount: Number(line.amount) }).eq("id", line.id);
        if (error) { failures.push(line.description); continue; }
        if (line.file) {
          const up = await uploadLevyDoc(schemeId, line.file, { category: "Budget line item", budget_line_item_id: line.id });
          if (up.error) failures.push(`${line.description} (evidence file)`);
        }
      } else {
        const { data: item, error } = await supabase.from("budget_line_items").insert({
          budget_id: budget.id, scheme_id: schemeId, fund: line.fund, cost_type: line.costType, description: line.description, amount: Number(line.amount),
        }).select().single();
        if (error || !item) { failures.push(line.description); continue; }
        if (line.file) {
          const up = await uploadLevyDoc(schemeId, line.file, { category: "Budget line item", budget_line_item_id: item.id as string });
          if (up.error) failures.push(`${line.description} (evidence file)`);
        }
      }
    }

    const adjustments: EditOutcome["adjustments"] = [];
    if (recalculate) {
      const budgetLevies = levies.filter(l => l.budget_id === budget.id);
      for (const levy of budgetLevies) {
        const entitlement = Number(levy.lots?.entitlement_percent ?? 0);
        const newAmount = shareAmount(method, entitlement, budgetLevies.length, total);
        if (levy.status === "Paid") {
          const diff = Math.round((newAmount - Number(levy.amount)) * 100) / 100;
          if (diff !== 0) adjustments.push({ levy, oldAmount: Number(levy.amount), newAmount, diff });
        } else {
          const { error } = await supabase.from("levies").update({ amount: newAmount, due_date: dueDate }).eq("id", levy.id);
          if (error) failures.push(`Levy for Lot ${levy.lots?.lot_number ?? ""}`);
        }
      }
    }

    setSubmitting(false);
    if (failures.length > 0) toast("Some parts of this update need attention", { description: failures.join(", ") });
    onSaved();
    setOutcome({ adjustments, recalculated: recalculate });
  };

  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-[640px]">
      {outcome
        ? <>
            <DialogHeader><DialogTitle className="font-display tracking-[-0.02em]">Budget updated for {budget.financial_year}</DialogTitle>
              <DialogDescription>{outcome.recalculated ? "Unpaid levies were recalculated to match the correction." : "Existing levy amounts were left as they were."}</DialogDescription></DialogHeader>
            <div className="space-y-4">
              <Button asChild variant="outline" className="rounded-full">
                <a href={`mailto:?bcc=${encodeURIComponent(allOwnerEmails.join(","))}&subject=${encodeURIComponent(`Update to your ${budget.financial_year} levies`)}&body=${encodeURIComponent(budgetChangeText(budget.financial_year, reason, budget.admin_fund_total, budget.maintenance_fund_total, totals.admin, totals.maintenance, outcome.recalculated))}`}>Email all owners</a>
              </Button>
              {outcome.adjustments.length > 0 && <div className="space-y-2">
                <Label>Owners affected by the correction</Label>
                <div className="divide-y divide-border/60 rounded-2xl border border-border/70">
                  {outcome.adjustments.map(a => <div key={a.levy.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 text-[13px]">
                    <span>Lot {a.levy.lots?.lot_number ?? ""}{a.levy.lots?.owner_name ? ` · ${a.levy.lots.owner_name}` : ""}</span>
                    <span className={`font-medium ${a.diff < 0 ? "text-primary" : "text-destructive"}`}>{a.diff < 0 ? `Refund of ${money(-a.diff)}` : `Additional ${money(a.diff)} now owing`}</span>
                    <Button asChild size="sm" variant="ghost" className="rounded-full" disabled={!a.levy.lots?.owner_email}>
                      <a href={`mailto:${a.levy.lots?.owner_email}?subject=${encodeURIComponent(`An update to your ${budget.financial_year} levy`)}&body=${encodeURIComponent(refundText(a.levy, a.diff, budget.financial_year))}`}>Email this owner</a>
                    </Button>
                  </div>)}
                </div>
              </div>}
              <div className="flex justify-end pt-2"><Button className="rounded-full" onClick={() => onOpenChange(false)}>Close</Button></div>
            </div>
          </>
        : <>
            <DialogHeader><DialogTitle className="font-display tracking-[-0.02em]">Edit budget for {budget.financial_year}</DialogTitle>
              <DialogDescription>Every edit needs a reason and is kept in this budget's history.</DialogDescription></DialogHeader>
            <form onSubmit={submit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="reason">What changed and why</Label>
                <Textarea id="reason" rows={3} value={reason} onChange={e => setReason(e.target.value)} placeholder="e.g. The insurance quote came in lower than budgeted" required />
              </div>
              <div className="space-y-2"><Label htmlFor="levy_due_date_edit">Due date</Label><Input id="levy_due_date_edit" type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} required /></div>
              <div className="space-y-2">
                <Label>How it is split</Label>
                <Select value={method} onValueChange={setMethod}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="Entitlement">By lot entitlement</SelectItem><SelectItem value="Equal">Equal share for every lot</SelectItem></SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Line items</Label>
                <LineItemsEditor lines={lines} setLines={setLines} />
              </div>
              <div className="rounded-2xl border border-border/70 bg-secondary/40 p-4 text-[13px]">
                <div className="flex justify-between"><span className="text-muted-foreground">Admin fund total</span><span className="font-medium tabular-nums">{money(totals.admin)}</span></div>
                <div className="mt-1.5 flex justify-between"><span className="text-muted-foreground">Maintenance fund total</span><span className="font-medium tabular-nums">{money(totals.maintenance)}</span></div>
                <div className="mt-3 flex justify-between border-t border-border/60 pt-3 text-[12px] text-muted-foreground"><span>Fixed costs</span><span className="tabular-nums">{money(totals.fixed)}</span></div>
                <div className="mt-1 flex justify-between text-[12px] text-muted-foreground"><span>Variable costs</span><span className="tabular-nums">{money(totals.variable)}</span></div>
              </div>
              {lots.length > 0 && total > 0 && <div className="space-y-2">
                <Label>Preview if recalculated — what each lot would be billed</Label>
                <InvoicePreview lots={lots} method={method} total={total} />
              </div>}
              <div className="flex items-center justify-between rounded-2xl border border-border/70 p-4">
                <div>
                  <p className="text-sm font-medium">Recalculate unpaid levies to match</p>
                  <p className="mt-1 text-[12px] text-muted-foreground">{recalculate ? "Levies not yet paid will update to the new totals. Paid levies are never changed — you'll see any refund or extra amount owing next." : "This is a record-only correction. No levy amounts will change."}</p>
                </div>
                <Switch checked={recalculate} onCheckedChange={setRecalculate} />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="ghost" className="rounded-full" onClick={() => onOpenChange(false)}>Cancel</Button>
                <Button type="submit" className="rounded-full" disabled={submitting}>{submitting ? "Saving…" : "Save changes"}</Button>
              </div>
            </form>
          </>}
    </DialogContent>
  </Dialog>;
}

function BudgetHistoryDialog({ open, onOpenChange, budget, revisions, onRevert }: {
  open: boolean; onOpenChange: (v: boolean) => void; budget: FinanceBudget | null; revisions: BudgetRevision[]; onRevert: (revision: BudgetRevision) => void;
}) {
  const rows = budget ? revisions.filter(r => r.budget_id === budget.id) : [];
  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="max-h-[88vh] overflow-y-auto">
      <DialogHeader><DialogTitle className="font-display tracking-[-0.02em]">History for {budget?.financial_year}</DialogTitle><DialogDescription>Every change made to this budget, most recent first.</DialogDescription></DialogHeader>
      {rows.length === 0
        ? <p className="py-8 text-center text-[13px] text-muted-foreground">No changes recorded yet.</p>
        : <div className="space-y-3">
            {rows.map(r => <div key={r.id} className="rounded-2xl border border-border/70 p-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-medium">{r.reason}</p>
                  <p className="mt-1 text-[12px] text-muted-foreground">{niceDate(r.created_at)} · {r.levies_recalculated ? "Levies recalculated" : "Record only"}</p>
                </div>
                <Button size="sm" variant="outline" className="rounded-full shrink-0" onClick={() => onRevert(r)}><Undo2 className="size-3.5" />Revert to this</Button>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-3 text-[12px]">
                <div><p className="text-muted-foreground">Admin fund</p><p className="font-medium">{money(r.previous_admin_fund_total)} → {money(r.new_admin_fund_total)}</p></div>
                <div><p className="text-muted-foreground">Maintenance fund</p><p className="font-medium">{money(r.previous_maintenance_fund_total)} → {money(r.new_maintenance_fund_total)}</p></div>
              </div>
            </div>)}
          </div>}
    </DialogContent>
  </Dialog>;
}

function LeviesSection({ levies, lots, budgets, lineItems, revisions, documents, isCommittee, schemeId, onPaid, onBudget }: {
  levies: Levy[]; lots: Lot[]; budgets: FinanceBudget[]; lineItems: BudgetLineItem[]; revisions: BudgetRevision[]; documents: DocFile[];
  isCommittee: boolean; schemeId?: string | undefined; onPaid: (id: string) => void; onBudget: () => void;
}) {
  const [createOpen, setCreateOpen] = useState(false);
  const [invoice, setInvoice] = useState<Levy | null>(null);
  const [reminder, setReminder] = useState<Levy | null>(null);
  const [showPaid, setShowPaid] = useState(false);
  const [editingBudget, setEditingBudget] = useState<FinanceBudget | null>(null);
  const [revertFrom, setRevertFrom] = useState<BudgetRevision | null>(null);
  const [historyBudget, setHistoryBudget] = useState<FinanceBudget | null>(null);

  const years = Array.from(new Set(levies.map(l => l.budgets?.financial_year ?? "Unallocated")));
  const [year, setYear] = useState("All years");
  const inYear = year === "All years" ? levies : levies.filter(l => (l.budgets?.financial_year ?? "Unallocated") === year);
  const currentBudget = year === "All years" ? null : (budgets.find(b => b.financial_year === year) ?? null);

  const paid = inYear.filter(l => l.status === "Paid");
  const unpaid = inYear.filter(l => l.status !== "Paid").sort((a, b) => a.due_date.localeCompare(b.due_date));
  const collected = paid.reduce((s, l) => s + Number(l.amount), 0);
  const owing = unpaid.reduce((s, l) => s + Number(l.amount), 0);
  const overdueCount = unpaid.filter(l => daysUntil(l.due_date) < 0).length;
  const soonCount = unpaid.filter(l => { const d = daysUntil(l.due_date); return d >= 0 && d <= 14; }).length;

  const lotsInBudget = (levy: Levy) => levies.filter(l => l.budgets?.financial_year === levy.budgets?.financial_year).length || 1;
  const isEqual = (levy: Levy) => levy.budgets?.allocation_method === "Equal";
  const share = (levy: Levy) => isEqual(levy) ? 1 / lotsInBudget(levy) : Number(levy.lots?.entitlement_percent ?? 0) / 100;
  const adminShare = (levy: Levy) => Number(levy.budgets?.admin_fund_total ?? 0) * share(levy);
  const maintShare = (levy: Levy) => Number(levy.budgets?.maintenance_fund_total ?? 0) * share(levy);

  const attachProof = async (levy: Levy, file: File) => {
    if (!schemeId) return;
    const up = await uploadLevyDoc(schemeId, file, { category: "Levy payment", levy_id: levy.id });
    if (up.error) { toast("Upload failed", { description: up.error }); return; }
    onBudget();
    toast("Payment proof filed under Levies in your documents");
  };
  const levyDocsFor = (id: string) => documents.filter(d => d.levy_id === id);

  const rows = showPaid ? [...unpaid, ...paid] : unpaid;

  return <div>
    <PageHead eyebrow="Your property" title="Levies" blurb="Set what is to be paid and how it is split, then track exactly who still owes and how close they are to their due date."
      action={isCommittee ? <Button className="rounded-full" onClick={() => setCreateOpen(true)}><Plus /> Create a budget</Button> : undefined} />

    <div className="mt-10 flex flex-wrap items-center gap-2">
      {["All years", ...years].map(option =>
        <button key={option} type="button" onClick={() => setYear(option)}
          className={`rounded-full px-4 py-2 text-[12px] font-medium transition ${year === option ? "bg-primary text-primary-foreground" : "border border-border/70 bg-card text-muted-foreground hover:text-foreground"}`}>{option}</button>)}
      {isCommittee && currentBudget && <>
        <Button size="sm" variant="outline" className="rounded-full" onClick={() => setEditingBudget(currentBudget)}><Pencil className="size-3.5" />Edit budget</Button>
        <Button size="sm" variant="ghost" className="rounded-full" onClick={() => setHistoryBudget(currentBudget)}><History className="size-3.5" />History</Button>
      </>}
      <button type="button" onClick={() => setShowPaid(v => !v)}
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
        const docs = levyDocsFor(levy.id);
        return <div key={levy.id} className="flex flex-wrap items-center justify-between gap-4 px-7 py-5">
          <div className="min-w-0">
            <p className="text-sm font-medium">{levy.lots ? `Lot ${levy.lots.lot_number}${levy.lots.owner_name ? ` · ${levy.lots.owner_name}` : ""}` : "Your levy"}</p>
            <p className="mt-1 text-[12px] text-muted-foreground">
              {levy.budgets?.financial_year ? `${levy.budgets.financial_year} · ` : ""}Due {niceDate(levy.due_date)}
              {levy.status === "Paid" && levy.paid_at ? ` · Paid ${niceDate(levy.paid_at)}` : ""}
            </p>
            {docs.length > 0 && <div className="mt-2 flex flex-wrap gap-2">
              {docs.map(d => <button key={d.id} onClick={() => void openLevyDoc(d)} className="rounded-full border border-border bg-secondary px-2.5 py-1 text-[11px] hover:bg-secondary/70">{d.name}</button>)}
            </div>}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <span className="font-display text-lg">{money(Number(levy.amount))}</span>
            {alert && <span className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${alert.tone}`}>{alert.text}</span>}
            <StatusPill status={status} />
            <Button size="sm" variant="ghost" className="rounded-full" onClick={() => setInvoice(levy)}>Invoice</Button>
            {isCommittee && <Button asChild size="icon" variant="ghost" className="rounded-full" aria-label="Attach payment proof">
              <label><Paperclip className="size-4" /><input type="file" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) void attachProof(levy, f); e.currentTarget.value = ""; }} /></label>
            </Button>}
            {isCommittee && status !== "Paid" && <Button size="sm" variant="ghost" className="rounded-full" onClick={() => setReminder(levy)}>Send a reminder</Button>}
            {isCommittee && status !== "Paid" && <Button size="sm" variant="outline" className="rounded-full" onClick={() => onPaid(levy.id)}>Mark paid</Button>}
          </div>
        </div>;
      })}
        {rows.length === 0 && <p className="px-7 py-10 text-center text-sm text-muted-foreground">{inYear.length ? "Everyone has paid. Nothing to chase." : "No levies raised yet."}</p>}
      </div>
    </Card>

    <Dialog open={!!invoice} onOpenChange={(o) => { if (!o) setInvoice(null); }}>
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

    <Dialog open={!!reminder} onOpenChange={(o) => { if (!o) setReminder(null); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="font-display tracking-[-0.02em]">Send a friendly reminder</DialogTitle>
          <DialogDescription>A polite note, ready to send to the owner.</DialogDescription>
        </DialogHeader>
        {reminder && <div className="space-y-4">
          <p className="text-[12px] text-muted-foreground">To {reminder.lots?.owner_email ?? "no email on file for this lot"}</p>
          <Textarea readOnly rows={10} className="text-[13px]" value={reminderText(reminder, effectiveLevyStatus(reminder))} />
          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="ghost" className="rounded-full" onClick={() => {
              void navigator.clipboard.writeText(reminderText(reminder, effectiveLevyStatus(reminder)));
              toast("Reminder copied", { description: "Paste it wherever you like." });
            }}>Copy the message</Button>
            <Button type="button" className="rounded-full" disabled={!reminder.lots?.owner_email} onClick={() => {
              const subject = `Levy reminder for Lot ${reminder.lots?.lot_number ?? ""}`;
              window.location.href = `mailto:${reminder.lots?.owner_email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(reminderText(reminder, effectiveLevyStatus(reminder)))}`;
              setReminder(null);
              toast("Reminder ready", { description: "Your email app has it open." });
            }}>Open in email</Button>
          </div>
        </div>}
      </DialogContent>
    </Dialog>

    {createOpen && <CreateBudgetDialog open={createOpen} onOpenChange={setCreateOpen} schemeId={schemeId} lots={lots} onCreated={onBudget} />}

    {editingBudget && <EditBudgetDialog key={`${editingBudget.id}-${revertFrom?.id ?? "current"}`} open={!!editingBudget}
      onOpenChange={(o) => { if (!o) { setEditingBudget(null); setRevertFrom(null); } }} schemeId={schemeId} budget={editingBudget}
      lots={lots} levies={levies} lineItems={lineItems} revertFrom={revertFrom} onSaved={onBudget} />}

    <BudgetHistoryDialog open={!!historyBudget} onOpenChange={(o) => { if (!o) setHistoryBudget(null); }} budget={historyBudget} revisions={revisions}
      onRevert={(revision) => { setHistoryBudget(null); setRevertFrom(revision); setEditingBudget(historyBudget); }} />
  </div>;
}


const COMPLIANCE_FOLDER = "Compliance";

export const STANDARD_WIDGETS: { key: string; label: string; detail: string }[] = [
  { key: "agm_notice", label: "AGM Notice", detail: "Written notice to every owner ahead of the annual general meeting." },
  { key: "insurance_renewal", label: "Insurance Renewal", detail: "Keep building insurance current, renewed before the policy lapses." },
  { key: "financial_statements", label: "Financial Statements", detail: "Prepare the annual financial statements: what came in, what went out." },
  { key: "maintenance_plan", label: "Maintenance Plan", detail: "Keep a maintenance plan for the building's common property up to date, including fire safety certification." },
];

const WIDGET_ICON: Record<string, typeof ShieldCheck> = {
  agm_notice: Gavel, insurance_renewal: ShieldCheck, financial_statements: Receipt, maintenance_plan: Wrench,
};
const widgetIcon = (w: ComplianceWidget) => (w.standard_key && WIDGET_ICON[w.standard_key]) || ShieldCheck;

function urgencyTone(dueDate: string | null | undefined, done: boolean) {
  if (done) return { label: "Done", className: "text-muted-foreground" };
  if (!dueDate) return { label: "Not started", className: "text-muted-foreground" };
  const left = daysUntil(dueDate);
  if (left < 0) return { label: `${Math.abs(left)} days overdue`, className: "font-medium text-destructive" };
  if (left < 14) return { label: `${left} days left`, className: "text-destructive" };
  return { label: `${left} days left`, className: "text-muted-foreground" };
}

export async function ensureStandardWidgets(schemeId: string, existing: ComplianceWidget[]) {
  const missing = STANDARD_WIDGETS.filter(sw => !existing.some(w => w.standard_key === sw.key));
  if (missing.length === 0) return false;
  const { error } = await supabase.from("compliance_widgets").insert(
    missing.map((sw, i) => ({
      scheme_id: schemeId, label: sw.label, is_standard: true, standard_key: sw.key,
      default_detail: sw.detail, enabled: true, sort_order: existing.length + i,
    }))
  );
  if (error) throw error;
  return true;
}

function currentTaskFor(widget: ComplianceWidget, tasks: Task[]) {
  return tasks.filter(t => t.widget_id === widget.id).sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
}

function WidgetDialog({ open, onOpenChange, widget, task, documents, schemeId, isCommittee, onChanged }: {
  open: boolean; onOpenChange: (v: boolean) => void; widget: ComplianceWidget | null; task: Task | undefined;
  documents: Doc[]; schemeId?: string | undefined; isCommittee: boolean; onChanged: () => void;
}) {
  const [status, setStatus] = useState(task?.status ?? "Not Started");
  const [dueDate, setDueDate] = useState(task?.due_date ?? "");
  const [taskId, setTaskId] = useState<string | null>(task?.id ?? null);
  const [busy, setBusy] = useState(false);

  const complianceFolderId = async () => {
    if (!schemeId) return null;
    const { data } = await supabase.from("document_folders").select("id").eq("scheme_id", schemeId).eq("name", COMPLIANCE_FOLDER).maybeSingle();
    if (data?.id) return data.id as string;
    const { data: made, error } = await supabase.from("document_folders")
      .insert({ scheme_id: schemeId, name: COMPLIANCE_FOLDER, icon: "ShieldCheck", color: "green" }).select("id").single();
    if (error) throw error;
    return made.id as string;
  };

  const ensureTask = async (): Promise<string> => {
    if (taskId) return taskId;
    if (!schemeId || !widget) throw new Error("Missing scheme or widget");
    const { data, error } = await supabase.from("compliance_tasks").insert({
      scheme_id: schemeId, widget_id: widget.id, task_name: widget.label,
      detail: widget.default_detail, due_date: dueDate || new Date().toISOString().slice(0, 10),
      status: status as "Not Started" | "In Progress" | "Complete",
    }).select("id").single();
    if (error) throw error;
    const newId = data.id as string;
    setTaskId(newId);
    onChanged();
    return newId;
  };

  const attach = async (files: FileList | null) => {
    if (!files?.length || !schemeId || !widget) return;
    const fileArray = Array.from(files); // snapshot before any await — input.files is live and clears when the input's value resets
    setBusy(true);
    try {
      const id = await ensureTask();
      const folderId = await complianceFolderId();
      for (const file of fileArray) {
        const path = `${schemeId}/${crypto.randomUUID()}-${file.name.replace(/[^\w.\-]/g, "_")}`;
        const { error: upErr } = await supabase.storage.from("documents").upload(path, file);
        if (upErr) throw upErr;
        const { error } = await supabase.from("documents").insert({
          scheme_id: schemeId, name: file.name, category: widget.label, folder_id: folderId,
          compliance_task_id: id, storage_path: path, file_size: file.size, mime_type: file.type,
        });
        if (error) throw error;
      }
      onChanged();
      toast("Filed under Compliance in your documents");
    } catch (err) {
      toast("Could not attach that", { description: (err as Error).message });
    } finally { setBusy(false); }
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

  const save = async () => {
    if (!schemeId || !widget) return;
    setBusy(true);
    try {
      if (taskId) {
        const { error } = await supabase.from("compliance_tasks").update({ due_date: dueDate, status: status as "Not Started" | "In Progress" | "Complete" }).eq("id", taskId);
        if (error) throw error;
      } else {
        await ensureTask();
      }
      onChanged();
      onOpenChange(false);
      toast("Saved");
    } catch (err) {
      toast("Could not save", { description: (err as Error).message });
    } finally { setBusy(false); }
  };

  const files = taskId ? documents.filter(d => d.compliance_task_id === taskId) : [];

  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent>
      <DialogHeader>
        <DialogTitle className="font-display tracking-[-0.02em]">{widget?.label}</DialogTitle>
        <DialogDescription>{task?.detail || widget?.default_detail || "Anything with a deadline attached to your building."}</DialogDescription>
      </DialogHeader>
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="widget_due_date">Due date</Label>
          <Input id="widget_due_date" type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} disabled={!isCommittee} />
        </div>
        <div className="space-y-2">
          <Label>Status</Label>
          <div className="flex flex-wrap gap-2">
            {["Not Started", "In Progress", "Complete"].map(s =>
              <button key={s} type="button" disabled={!isCommittee} onClick={() => setStatus(s)}
                className={`rounded-full px-3.5 py-1.5 text-[12px] font-medium transition ${status === s ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground"} ${isCommittee ? "cursor-pointer" : "cursor-default"}`}>
                {s}
              </button>)}
          </div>
        </div>
        {isCommittee && <div className="space-y-2">
          <Label>Evidence</Label>
          <Button asChild variant="outline" size="sm" className="rounded-full">
            <label>{busy ? "Working…" : "Attach document"}
              <input type="file" multiple className="sr-only" onChange={e => { void attach(e.target.files); e.target.value = ""; }} />
            </label>
          </Button>
        </div>}
        {files.length > 0 && <div className="flex flex-wrap gap-2">
          {files.map(doc => <span key={doc.id} className="inline-flex items-center gap-2 rounded-full bg-secondary px-3 py-1.5 text-[12px]">
            <Files className="h-3.5 w-3.5 text-muted-foreground" />
            <button type="button" className="underline-offset-4 hover:underline" onClick={() => { void openDoc(doc); }}>{doc.name}</button>
            {isCommittee && <button type="button" aria-label={`Remove ${doc.name}`} className="text-muted-foreground hover:text-destructive" onClick={() => { void removeDoc(doc); }}>×</button>}
          </span>)}
        </div>}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" className="rounded-full" onClick={() => onOpenChange(false)}>Close</Button>
          {isCommittee && <Button type="button" className="rounded-full" disabled={busy} onClick={() => void save()}>Save</Button>}
        </div>
      </div>
    </DialogContent>
  </Dialog>;
}

function WidgetCard({ widget, task, isCommittee, dimmed, dragging, onDragStart, onDragOver, onDrop, onDragEnd, onOpen, onToggleEnabled, onDelete }: {
  widget: ComplianceWidget; task: Task | undefined; isCommittee: boolean; dimmed: boolean; dragging: boolean;
  onDragStart: (e: React.DragEvent, id: string) => void; onDragOver: (e: React.DragEvent, id: string) => void;
  onDrop: (e: React.DragEvent, id: string) => void; onDragEnd: () => void; onOpen: () => void;
  onToggleEnabled: (widget: ComplianceWidget, enabled: boolean) => void; onDelete: (widget: ComplianceWidget) => void;
}) {
  const Icon = widgetIcon(widget);
  const done = task?.status === "Complete";
  const tone = urgencyTone(task?.due_date, done);
  const interactive = !dimmed;
  return <div role="button" tabIndex={interactive ? 0 : -1} draggable={isCommittee && interactive}
    onDragStart={e => interactive && onDragStart(e, widget.id)}
    onDragOver={e => interactive && onDragOver(e, widget.id)}
    onDrop={e => interactive && onDrop(e, widget.id)}
    onDragEnd={onDragEnd}
    onClick={() => { if (interactive) onOpen(); }}
    onKeyDown={e => { if (interactive && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); onOpen(); } }}
    className={`soft-shadow rounded-3xl border border-border/70 bg-card p-6 text-left transition ${interactive ? "hover:border-border cursor-pointer" : "cursor-default opacity-60"} ${dragging ? "opacity-40" : ""}`}>
    <div className="flex items-start justify-between gap-2">
      <Icon className="h-5 w-5 text-muted-foreground" />
      {isCommittee && widget.is_standard && <span onClick={e => e.stopPropagation()}>
        <Switch checked={widget.enabled} onCheckedChange={v => onToggleEnabled(widget, v)} />
      </span>}
      {isCommittee && !widget.is_standard && <button type="button" aria-label={`Remove ${widget.label}`}
        className="text-muted-foreground hover:text-destructive" onClick={e => { e.stopPropagation(); onDelete(widget); }}>
        <Trash2 className="h-4 w-4" />
      </button>}
    </div>
    <p className="mt-4 text-sm font-medium">{widget.label}</p>
    <div className="mt-2"><StatusPill status={task?.status ?? "Not Started"} /></div>
    <p className={`mt-3 text-[12px] ${tone.className}`}>{tone.label}</p>
  </div>;
}

function ComplianceSection({ tasks, documents, widgets, isCommittee, schemeId, onChanged }: {
  tasks: Task[]; documents: Doc[]; widgets: ComplianceWidget[]; isCommittee: boolean; schemeId?: string | undefined;
  onStatus: (id: string, status: string) => void; onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [selected, setSelected] = useState<ComplianceWidget | null>(null);
  const [showDisabled, setShowDisabled] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const bootstrapped = useRef(false);

  useEffect(() => {
    if (!schemeId || bootstrapped.current) return;
    bootstrapped.current = true;
    void ensureStandardWidgets(schemeId, widgets).then(created => { if (created) onChanged(); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schemeId]);

  const sorted = widgets.slice().sort((a, b) => a.sort_order - b.sort_order);
  const visible = sorted.filter(w => w.enabled || showDisabled);
  const hiddenCount = sorted.filter(w => !w.enabled).length;

  const submitCustom = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!schemeId) return;
    const form = new FormData(e.currentTarget);
    const { error } = await supabase.from("compliance_widgets").insert({
      scheme_id: schemeId, label: String(form.get("label") ?? ""), is_standard: false,
      default_detail: String(form.get("detail") ?? "") || null, enabled: true, sort_order: widgets.length,
    });
    if (error) { toast("Could not add the obligation", { description: error.message }); return; }
    setAddOpen(false); onChanged(); toast("Obligation added");
  };

  const toggleEnabled = async (widget: ComplianceWidget, enabled: boolean) => {
    const { error } = await supabase.from("compliance_widgets").update({ enabled }).eq("id", widget.id);
    if (error) { toast("Could not update that", { description: error.message }); return; }
    onChanged();
  };

  const deleteWidget = async (widget: ComplianceWidget) => {
    const { error } = await supabase.from("compliance_widgets").delete().eq("id", widget.id);
    if (error) { toast("Could not remove that", { description: error.message }); return; }
    onChanged(); toast("Obligation removed");
  };

  const reorder = async (sourceId: string, targetId: string) => {
    const ordered = sorted.slice();
    const from = ordered.findIndex(w => w.id === sourceId);
    const to = ordered.findIndex(w => w.id === targetId);
    if (from === -1 || to === -1 || from === to) return;
    const [moved] = ordered.splice(from, 1);
    if (!moved) return;
    ordered.splice(to, 0, moved);
    const updates = ordered
      .map((w, i) => ({ w, i }))
      .filter(({ w, i }) => w.sort_order !== i)
      .map(({ w, i }) => supabase.from("compliance_widgets").update({ sort_order: i }).eq("id", w.id));
    await Promise.all(updates);
    onChanged();
  };

  return <div>
    <PageHead eyebrow="Your property" title="Compliance" blurb="The things the law expects each year, in plain English, with dates attached. Click one to work through it, and attach the paperwork if you have it."
      action={isCommittee ? <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogTrigger asChild><Button className="rounded-full"><Plus /> Add an obligation</Button></DialogTrigger>
        <DialogContent>
          <DialogHeader><DialogTitle className="font-display tracking-[-0.02em]">Add an obligation</DialogTitle><DialogDescription>Anything with a deadline attached to your building.</DialogDescription></DialogHeader>
          <form onSubmit={submitCustom} className="space-y-4">
            <div className="space-y-2"><Label htmlFor="label">What's required</Label><Input id="label" name="label" placeholder="Pool safety certificate" required autoFocus /></div>
            <div className="space-y-2"><Label htmlFor="detail">Notes</Label><Textarea id="detail" name="detail" /></div>
            <div className="flex justify-end gap-2 pt-2"><Button type="button" variant="ghost" className="rounded-full" onClick={() => setAddOpen(false)}>Cancel</Button><Button type="submit" className="rounded-full">Save</Button></div>
          </form>
        </DialogContent>
      </Dialog> : undefined} />

    {visible.length === 0
      ? <p className="mt-10 px-7 py-10 text-center text-sm text-muted-foreground">Nothing to show yet.</p>
      : <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map(widget => <WidgetCard key={widget.id} widget={widget} task={currentTaskFor(widget, tasks)} isCommittee={isCommittee}
            dimmed={!widget.enabled} dragging={dragId === widget.id}
            onDragStart={(e, id) => { e.dataTransfer.setData("text/plain", id); setDragId(id); }}
            onDragOver={e => e.preventDefault()}
            onDrop={(e, id) => { e.preventDefault(); const source = e.dataTransfer.getData("text/plain") || dragId; setDragId(null); if (source && source !== id) void reorder(source, id); }}
            onDragEnd={() => setDragId(null)}
            onOpen={() => { setSelected(widget); setOpen(true); }}
            onToggleEnabled={toggleEnabled} onDelete={deleteWidget} />)}
        </div>}

    {hiddenCount > 0 && <button type="button" onClick={() => setShowDisabled(v => !v)}
      className="mt-6 rounded-full border border-border/70 bg-card px-4 py-2 text-[12px] font-medium text-muted-foreground hover:text-foreground">
      {showDisabled ? "Hide disabled obligations" : `Show ${hiddenCount} disabled obligation${hiddenCount === 1 ? "" : "s"}`}
    </button>}

    {open && <WidgetDialog open={open} onOpenChange={setOpen} widget={selected} task={selected ? currentTaskFor(selected, tasks) : undefined}
      documents={documents} schemeId={schemeId} isCommittee={isCommittee} onChanged={onChanged} key={selected?.id ?? "none"} />}
  </div>;
}
