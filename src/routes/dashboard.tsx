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
import { FinanceSection, type FinanceBudget, type FinanceTx, type ForecastLine, type BudgetLineItem, type BudgetRevision } from "@/components/finance";
import { SettingsSection, type SchemeSettings, type CommitteeRole } from "@/components/settings";
import { NotificationsBell } from "@/components/notifications";
import { computeFundBalances, currentFinancialYearStart, type Levy } from "@/lib/fund-balance";

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
type Task = { id: string; task_name: string; detail: string | null; due_date: string; status: string; widget_id: string | null; created_at: string };
export type ComplianceWidget = {
  id: string; scheme_id: string; label: string; is_standard: boolean; standard_key: string | null;
  default_detail: string | null; enabled: boolean; sort_order: number;
};
type Repair = WorkOrder;
type Doc = DocFile;

const sections = [
  ["Dashboard", LayoutDashboard], ["Lots", Building2], ["Work orders", Wrench],
  ["Finance", Coins], ["Insurance", ShieldCheck], ["Actions", FileCheck2], ["Calendar", CalendarDays],
  ["Documents", Files],
] as const;

export const money = (n: number) => n.toLocaleString("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 });
const daysUntil = (date: string) => Math.ceil((new Date(date + "T00:00:00").getTime() - new Date(new Date().toDateString()).getTime()) / 86400000);
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

  const actionDrafts = useQuery({
    queryKey: ["action-drafts"],
    queryFn: async () => {
      const { data, error } = await supabase.from("action_drafts").select("*");
      if (error) throw error;
      return (data ?? []) as unknown as ActionDraft[];
    },
  });
  const agmMeetings = useQuery({
    queryKey: ["agm-meetings"],
    queryFn: async () => {
      const { data, error } = await supabase.from("agm_meetings").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as AgmMeeting[];
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

      {active === "Work orders" && <WorkOrdersSection orders={repairs.data ?? []} lots={lots.data ?? []} isCommittee={isCommittee} myLot={myLot} schemeId={schemeId}
        onChanged={()=>refresh(["repairs"])}/>}

      {active === "Actions" && <ComplianceSection tasks={tasks.data ?? []} documents={documents.data ?? []} widgets={complianceWidgets.data ?? []}
        policies={policies.data ?? []} budgets={budgets.data ?? []} levies={levies.data ?? []} finance={finance.data ?? []} repairs={repairs.data ?? []}
        drafts={actionDrafts.data ?? []} meetings={agmMeetings.data ?? []}
        isCommittee={isCommittee} schemeId={schemeId}
        onChanged={()=>refresh(["tasks","documents","document-folders","compliance-widgets","action-drafts","agm-meetings"])}/>}

      {active === "Finance" && <FinanceSection transactions={finance.data ?? []} budgets={budgets.data ?? []} levies={levies.data ?? []}
        revisions={budgetRevisions.data ?? []} forecastLines={forecastLines.data ?? []} lineItems={budgetLineItems.data ?? []} lots={lots.data ?? []} documents={documents.data ?? []}
        isCommittee={isCommittee} schemeId={schemeId} onMarkLevyPaid={(id)=>markLevyPaid.mutate(id)}
        onChanged={()=>refresh(["finance","budgets","levies","budget-line-items","budget-revisions","forecast-lines","documents","document-folders"])}/>}

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

const COMPLIANCE_FOLDER = "Actions";

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

async function ensureActionsFolder(schemeId: string) {
  const { data } = await supabase.from("document_folders").select("id").eq("scheme_id", schemeId).eq("name", COMPLIANCE_FOLDER).maybeSingle();
  if (data?.id) return data.id as string;
  const { data: made, error } = await supabase.from("document_folders")
    .insert({ scheme_id: schemeId, name: COMPLIANCE_FOLDER, icon: "ShieldCheck", color: "green" }).select("id").single();
  if (error) throw error;
  return made.id as string;
}

// Turns a preview + the committee's own notes into a filed document, and marks
// the obligation's task Complete — the shared "publish" behavior for every
// standard Action (Insurance Renewal, Financial Statements, Maintenance Plan,
// AGM Notice), so publishing always leaves the same trail in Documents and in
// the obligation's own status, whichever one it was.
async function publishActionDocument(schemeId: string, widget: ComplianceWidget, existingTaskId: string | null, text: string) {
  const folderId = await ensureActionsFolder(schemeId);
  const fileName = `${widget.label} — ${new Date().toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })}.txt`;
  const path = `${schemeId}/${crypto.randomUUID()}-${fileName.replace(/[^\w.\- ]/g, "_")}`;
  const blob = new Blob([text], { type: "text/plain" });
  const { error: upErr } = await supabase.storage.from("documents").upload(path, blob);
  if (upErr) throw upErr;

  const taskId = existingTaskId ?? (await supabase.from("compliance_tasks").insert({
    scheme_id: schemeId, widget_id: widget.id, task_name: widget.label,
    detail: widget.default_detail, due_date: new Date().toISOString().slice(0, 10), status: "Complete",
  }).select("id").single()).data?.id as string | undefined;
  if (!taskId) throw new Error("Could not create the obligation record");
  if (existingTaskId) {
    const { error } = await supabase.from("compliance_tasks").update({ status: "Complete" }).eq("id", existingTaskId);
    if (error) throw error;
  }

  const { error } = await supabase.from("documents").insert({
    scheme_id: schemeId, name: fileName, category: widget.label, folder_id: folderId,
    compliance_task_id: taskId, storage_path: path, file_size: blob.size, mime_type: "text/plain",
  });
  if (error) throw error;
  return taskId;
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

type ActionDraft = { id: string; scheme_id: string; standard_key: string; content: string };
type AgmMeeting = { id: string; scheme_id: string; title: string; meeting_date: string | null; agenda: { label: string; notes: string }[]; notes: string; status: string; created_at: string; published_at: string | null };

function ActionWorkspaceDialog({ open, onOpenChange, widget, task, schemeId, isCommittee, previewLabel, previewText, draft, onChanged }: {
  open: boolean; onOpenChange: (v: boolean) => void; widget: ComplianceWidget; task: Task | undefined;
  schemeId?: string | undefined; isCommittee: boolean; previewLabel: string; previewText: string; draft: ActionDraft | null; onChanged: () => void;
}) {
  const [content, setContent] = useState(draft?.content ?? "");
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);

  const saveDraft = async () => {
    if (!schemeId) return;
    setSaving(true);
    const { error } = draft
      ? await supabase.from("action_drafts").update({ content }).eq("id", draft.id)
      : await supabase.from("action_drafts").insert({ scheme_id: schemeId, standard_key: widget.standard_key ?? "", content });
    setSaving(false);
    if (error) { toast("Could not save the draft", { description: error.message }); return; }
    onChanged(); toast("Draft saved");
  };

  const publish = async () => {
    if (!schemeId) return;
    setPublishing(true);
    const text = [previewText, content.trim() ? `\n\nCommittee notes:\n${content.trim()}` : ""].join("");
    try {
      await publishActionDocument(schemeId, widget, task?.id ?? null, text);
      onOpenChange(false); onChanged();
      toast("Published", { description: "Filed in Documents and marked complete." });
    } catch (err) {
      toast("Could not publish", { description: (err as Error).message });
    } finally { setPublishing(false); }
  };

  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-[600px]">
      <DialogHeader>
        <DialogTitle className="font-display tracking-[-0.02em]">{widget.label}</DialogTitle>
        <DialogDescription>{widget.default_detail}</DialogDescription>
      </DialogHeader>
      <div className="space-y-4">
        <div className="space-y-2">
          <Label>Preview — {previewLabel}</Label>
          <pre className="max-h-64 overflow-y-auto whitespace-pre-wrap rounded-2xl border border-border/70 bg-secondary/40 p-4 text-[12px] leading-6">{previewText}</pre>
          <p className="text-[11px] text-muted-foreground">Always shows your latest info from {previewLabel} — nothing to keep in sync by hand.</p>
        </div>
        {isCommittee && <div className="space-y-2">
          <Label htmlFor="committee_notes">Committee notes (optional)</Label>
          <Textarea id="committee_notes" rows={4} value={content} onChange={e => setContent(e.target.value)} placeholder="Anything to add before this goes out" />
        </div>}
        <div className="flex flex-wrap justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" className="rounded-full" onClick={() => onOpenChange(false)}>Close</Button>
          {isCommittee && <Button type="button" variant="outline" className="rounded-full" disabled={saving} onClick={() => void saveDraft()}>{saving ? "Saving…" : "Save draft"}</Button>}
          {isCommittee && <Button type="button" className="rounded-full" disabled={publishing} onClick={() => void publish()}>{publishing ? "Publishing…" : "Publish"}</Button>}
        </div>
      </div>
    </DialogContent>
  </Dialog>;
}

function AgmDialog({ open, onOpenChange, widget, task, schemeId, isCommittee, meetings, onChanged }: {
  open: boolean; onOpenChange: (v: boolean) => void; widget: ComplianceWidget; task: Task | undefined;
  schemeId?: string | undefined; isCommittee: boolean; meetings: AgmMeeting[]; onChanged: () => void;
}) {
  const [title, setTitle] = useState("");
  const [meetingDate, setMeetingDate] = useState("");
  const [agenda, setAgenda] = useState<{ label: string; notes: string }[]>([{ label: "", notes: "" }]);
  const [notes, setNotes] = useState("");
  const [publishing, setPublishing] = useState(false);
  const published = meetings.filter(m => m.status === "Published").sort((a, b) => b.created_at.localeCompare(a.created_at));

  const updateAgenda = (i: number, patch: Partial<{ label: string; notes: string }>) =>
    setAgenda(agenda.map((a, idx) => idx === i ? { ...a, ...patch } : a));

  const publish = async () => {
    if (!schemeId || !title.trim()) { toast("Give the meeting a title first"); return; }
    setPublishing(true);
    const validAgenda = agenda.filter(a => a.label.trim() !== "");
    const { data: meeting, error } = await supabase.from("agm_meetings").insert({
      scheme_id: schemeId, title: title.trim(), meeting_date: meetingDate || null,
      agenda: validAgenda, notes, status: "Published", published_at: new Date().toISOString(),
    }).select().single();
    if (error || !meeting) { toast("Could not publish the meeting", { description: error?.message }); setPublishing(false); return; }
    const text = [
      `${title.trim()}`, meetingDate ? `Date: ${new Date(meetingDate).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })}` : "",
      "", "Agenda:", ...validAgenda.map((a, i) => `${i + 1}. ${a.label}${a.notes ? ` — ${a.notes}` : ""}`),
      "", "Notes:", notes,
    ].filter(l => l !== "").join("\n");
    try {
      await publishActionDocument(schemeId, widget, task?.id ?? null, text);
      setPublishing(false); onOpenChange(false); onChanged();
      toast("AGM notes published", { description: "Filed in Documents and marked complete." });
    } catch (err) {
      setPublishing(false);
      toast("Saved the meeting, but could not file the document", { description: (err as Error).message });
    }
  };

  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-[620px]">
      <DialogHeader>
        <DialogTitle className="font-display tracking-[-0.02em]">AGM Notice</DialogTitle>
        <DialogDescription>Previous meetings, and a place to build the next agenda and notes.</DialogDescription>
      </DialogHeader>
      <div className="space-y-5">
        <div>
          <Label>Previous meetings</Label>
          {published.length === 0
            ? <p className="mt-2 text-[13px] text-muted-foreground">No AGM notes published yet.</p>
            : <div className="mt-2 space-y-2">
                {published.map(m => <details key={m.id} className="rounded-2xl border border-border/70 p-3">
                  <summary className="cursor-pointer text-[13px] font-medium">{m.title}{m.meeting_date ? ` · ${niceDate(m.meeting_date)}` : ""}</summary>
                  <div className="mt-2 space-y-1 text-[12px] text-muted-foreground">
                    {m.agenda.map((a, i) => <p key={i}>{i + 1}. {a.label}{a.notes ? ` — ${a.notes}` : ""}</p>)}
                    {m.notes && <p className="mt-2 whitespace-pre-line">{m.notes}</p>}
                  </div>
                </details>)}
              </div>}
        </div>
        {isCommittee && <>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2"><Label htmlFor="agm_title">Meeting title</Label><Input id="agm_title" value={title} onChange={e => setTitle(e.target.value)} placeholder="Annual General Meeting 2026" /></div>
            <div className="space-y-2"><Label htmlFor="agm_date">Meeting date</Label><Input id="agm_date" type="date" value={meetingDate} onChange={e => setMeetingDate(e.target.value)} /></div>
          </div>
          <div className="space-y-2">
            <Label>Agenda</Label>
            {agenda.map((a, i) => <div key={i} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
              <Input placeholder="Item" value={a.label} onChange={e => updateAgenda(i, { label: e.target.value })} />
              <Input placeholder="Notes (optional)" value={a.notes} onChange={e => updateAgenda(i, { notes: e.target.value })} />
              <Button type="button" size="icon" variant="ghost" className="rounded-full text-muted-foreground" aria-label="Remove item" onClick={() => setAgenda(agenda.filter((_, idx) => idx !== i))} disabled={agenda.length === 1}><Trash2 className="size-4" /></Button>
            </div>)}
            <Button type="button" variant="outline" size="sm" className="rounded-full" onClick={() => setAgenda([...agenda, { label: "", notes: "" }])}><Plus className="size-3.5" />Add agenda item</Button>
          </div>
          <div className="space-y-2"><Label htmlFor="agm_notes">Meeting notes</Label><Textarea id="agm_notes" rows={5} value={notes} onChange={e => setNotes(e.target.value)} placeholder="What was discussed and decided" /></div>
        </>}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" className="rounded-full" onClick={() => onOpenChange(false)}>Close</Button>
          {isCommittee && <Button type="button" className="rounded-full" disabled={publishing} onClick={() => void publish()}>{publishing ? "Publishing…" : "Publish AGM notes"}</Button>}
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

function financialStatementsPreview(budgets: FinanceBudget[], levies: Levy[], finance: FinanceTx[]) {
  const year = currentFinancialYearStart();
  const budget = budgets.find(b => b.financial_year.match(/\d{4}/)?.[0] === String(year));
  const balances = computeFundBalances(levies, budgets, finance, year);
  const paidTx = finance.filter(t => t.status === "Paid" && new Date(t.occurred_on).getFullYear() >= year);
  const spent = paidTx.filter(t => t.direction === "out").reduce((s, t) => s + Number(t.amount), 0);
  const collected = paidTx.filter(t => t.direction === "in").reduce((s, t) => s + Number(t.amount), 0);
  return [
    `Financial year: ${budget?.financial_year ?? `${year}/${year + 1}`}`,
    budget ? `Budgeted: Admin ${money(budget.admin_fund_total)} · Maintenance ${money(budget.maintenance_fund_total)}` : "No budget set for this year yet.",
    `Money in: ${money(collected)}`, `Money out: ${money(spent)}`,
    `Fund balances: Admin ${money(balances.admin)} · Maintenance ${money(balances.maintenance)} · Total ${money(balances.total)}`,
  ].join("\n");
}

function insuranceRenewalPreview(policies: Policy[]) {
  if (policies.length === 0) return "No insurance policies recorded yet.";
  const dated = policies.filter(p => p.renewal_date).sort((a, b) => a.renewal_date! < b.renewal_date! ? -1 : 1);
  const lines = policies.map(p => {
    const bits = [p.policy_type, p.insurer ? `Insurer: ${p.insurer}` : null, p.premium != null ? `Premium: ${money(p.premium)}` : null,
      p.sum_insured != null ? `Sum insured: ${money(p.sum_insured)}` : null,
      p.renewal_date ? `Renews ${niceDate(p.renewal_date)} (${daysUntil(p.renewal_date) < 0 ? "overdue" : `${daysUntil(p.renewal_date)} days away`})` : null];
    return "- " + bits.filter(Boolean).join(" · ");
  });
  const next = dated[0];
  return [next ? `Next renewal: ${next.policy_type} on ${niceDate(next.renewal_date!)}` : "No renewal dates recorded.", "", "Policies:", ...lines].join("\n");
}

function maintenancePlanPreview(repairs: Repair[]) {
  const open = repairs.filter(r => r.status !== "Complete");
  if (open.length === 0) return "No open maintenance or work orders right now.";
  const lines = open.map(r => `- ${r.title} (${r.status})`);
  return [`Open items: ${open.length}`, "", ...lines].join("\n");
}

const standardPreview: Record<string, { label: string; text: (ctx: { policies: Policy[]; budgets: FinanceBudget[]; levies: Levy[]; finance: FinanceTx[]; repairs: Repair[] }) => string }> = {
  financial_statements: { label: "Finance", text: ctx => financialStatementsPreview(ctx.budgets, ctx.levies, ctx.finance) },
  insurance_renewal: { label: "Insurance", text: ctx => insuranceRenewalPreview(ctx.policies) },
  maintenance_plan: { label: "Work orders", text: ctx => maintenancePlanPreview(ctx.repairs) },
};

function ComplianceSection({ tasks, documents, widgets, policies, budgets, levies, finance, repairs, drafts, meetings, isCommittee, schemeId, onChanged }: {
  tasks: Task[]; documents: Doc[]; widgets: ComplianceWidget[]; policies: Policy[]; budgets: FinanceBudget[]; levies: Levy[]; finance: FinanceTx[]; repairs: Repair[];
  drafts: ActionDraft[]; meetings: AgmMeeting[]; isCommittee: boolean; schemeId?: string | undefined; onChanged: () => void;
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
    <PageHead eyebrow="Your property" title="Actions" blurb="Plan and prepare the paperwork your building actually needs. Click one to see what it should say, add your own notes, and publish it to Documents."
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

    {open && selected?.standard_key === "agm_notice" &&
      <AgmDialog open={open} onOpenChange={setOpen} widget={selected} task={currentTaskFor(selected, tasks)}
        schemeId={schemeId} isCommittee={isCommittee} meetings={meetings} onChanged={onChanged} key={selected.id} />}

    {open && selected?.standard_key && standardPreview[selected.standard_key] &&
      <ActionWorkspaceDialog open={open} onOpenChange={setOpen} widget={selected} task={currentTaskFor(selected, tasks)}
        schemeId={schemeId} isCommittee={isCommittee}
        previewLabel={standardPreview[selected.standard_key]!.label}
        previewText={standardPreview[selected.standard_key]!.text({ policies, budgets, levies, finance, repairs })}
        draft={drafts.find(d => d.standard_key === selected.standard_key) ?? null}
        onChanged={onChanged} key={selected.id} />}

    {open && selected && selected.standard_key !== "agm_notice" && !standardPreview[selected.standard_key ?? ""] &&
      <WidgetDialog open={open} onOpenChange={setOpen} widget={selected} task={currentTaskFor(selected, tasks)}
        documents={documents} schemeId={schemeId} isCommittee={isCommittee} onChanged={onChanged} key={selected.id} />}
  </div>;
}
