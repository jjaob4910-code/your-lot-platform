import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip as ChartTooltip, XAxis, YAxis } from "recharts";
import { Building2, CalendarDays, Check, ChevronRight, Coins, Files, Gavel, History, LayoutDashboard, LogOut, Menu, Paperclip, Pencil, Plus, Settings, ShieldCheck, Trash2, Undo2, WalletCards, Wrench } from "lucide-react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";
import { WorkOrdersSection, WorkOrderTable, type Contractor, type WorkOrder } from "@/components/work-orders";
import { CalendarSection } from "@/components/calendar-view";
import { DocumentsSection, type DocFile } from "@/components/documents";
import { InsuranceSection, type Policy } from "@/components/insurance";
import type { Claim } from "@/components/insurance-claims";
import { OverviewSection, type DashboardWidget, type Notice, type NoticeComment, type BudgetFund } from "@/components/overview";
import { FinanceSection, ensureDefaultFunds, type RecurringTx, type FinanceView, type FinanceBudget, type FinanceTx, type BudgetLineItem, type BudgetRevision } from "@/components/finance";
import { SettingsSection, type SchemeSettings, type CommitteeRole } from "@/components/settings";
import { NotificationsBell } from "@/components/notifications";
import { recordedFundBalances, splitLevyAcrossFunds, type Levy } from "@/lib/fund-balance";
import { AgmSection, type AgmMeeting, type AgmSuggestion } from "@/components/agm";
import { currentTaskFor, type ComplianceWidget, type Task } from "@/lib/action-publish";

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
type Repair = WorkOrder;
type Doc = DocFile;

const sections = [
  ["Dashboard", LayoutDashboard], ["Lots", Building2], ["Insurance", ShieldCheck],
  ["Work orders", Wrench], ["Finance", Coins], ["AGM", Gavel], ["Calendar", CalendarDays],
  ["Documents", Files],
] as const;

export const money = (n: number) => n.toLocaleString("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 });

function DashboardPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [active, setActive] = useState("Dashboard");
  const [financeView, setFinanceView] = useState<FinanceView>("Budget");
  // Deep links elsewhere in the app use "Tab" or "Finance/Levies" to open and scroll to a Finance section.
  const goTo = (target: string) => {
    const [tab, sub] = target.split("/");
    if (tab === "Finance" && (sub === "Budget" || sub === "Levies" || sub === "Cashflow")) setFinanceView(sub);
    setActive(tab!);
  };

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
      const { data, error } = await supabase.from("levies").select("*, lots(lot_number, owner_name, owner_email, entitlement_percent), budgets(financial_year, allocation_method, total_amount, budget_fund_totals(fund_id, total))").order("due_date");
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
      const { data, error } = await supabase.from("maintenance_requests").select("*, lots(lot_number), work_order_steps(*), work_order_quotes(*, finance_transactions(fund_id))").order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as Repair[];
    },
  });
  const contractors = useQuery({
    queryKey: ["contractors"],
    queryFn: async () => {
      const { data, error } = await supabase.from("contractors").select("*").order("name");
      if (error) throw error;
      return (data ?? []) as Contractor[];
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

  const claims = useQuery({
    queryKey: ["insurance-claims"],
    queryFn: async () => {
      const { data, error } = await supabase.from("insurance_claims").select("*, insurance_claim_updates(*)").order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as Claim[];
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
      const { data, error } = await supabase.from("budgets").select("*, budget_fund_totals(fund_id, total)").order("financial_year", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as FinanceBudget[];
    },
  });
  const budgetFunds = useQuery({
    queryKey: ["budget-funds"],
    queryFn: async () => {
      const { data, error } = await supabase.from("budget_funds").select("*").order("sort_order");
      if (error) throw error;
      return (data ?? []) as unknown as BudgetFund[];
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
  const recurringTx = useQuery({
    queryKey: ["recurring"],
    queryFn: async () => {
      const { data, error } = await supabase.from("recurring_transactions").select("*").order("created_at");
      if (error) throw error;
      return (data ?? []) as unknown as RecurringTx[];
    },
  });
  // Voided entries stay in the Finance ledger but never count anywhere else.
  const activeTransactions = (finance.data ?? []).filter(t => !t.voided_at);
  const recordedBalances = recordedFundBalances(levies.data ?? [], activeTransactions);
  const overdrawnFunds = (budgetFunds.data ?? []).filter(f => (recordedBalances[f.id] ?? 0) < 0)
    .map(f => ({ id: f.id, name: f.name, balance: recordedBalances[f.id] ?? 0 }));
  // Personal preference: each person can switch overdrawn alerts off for themselves.
  const myPrefs = useQuery({
    queryKey: ["user-preferences", userId],
    queryFn: async () => {
      const { data, error } = await supabase.from("user_preferences").select("notify_fund_overdrawn").eq("user_id", userId!).maybeSingle();
      if (error) throw error;
      return { notify_fund_overdrawn: data?.notify_fund_overdrawn ?? true };
    },
    enabled: !!userId,
  });
  const warnOverdrawn = myPrefs.data?.notify_fund_overdrawn ?? true;
  const agmSuggestions = useQuery({
    queryKey: ["agm-suggestions"],
    queryFn: async () => {
      const { data, error } = await supabase.from("agm_suggestions").select("*").order("created_at");
      if (error) throw error;
      return (data ?? []) as AgmSuggestion[];
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
  // Paid transactions are locked to the Treasurer (or any committee member when none is set).
  const canManagePaid = useQuery({
    queryKey: ["can-manage-paid", userId, schemeId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("can_manage_paid_finance", { _user: userId!, _scheme: schemeId! });
      if (error) throw error;
      return !!data;
    },
    enabled: !!userId && !!schemeId,
  });
  const treasurerLot = (committeeRoles.data ?? []).find(r => r.role === "Treasurer");
  const treasurerName = treasurerLot ? (() => { const l = (lots.data ?? []).find(x => x.id === treasurerLot.lot_id); return l ? (l.owner_name ?? `Lot ${l.lot_number}`) : "Assigned"; })() : null;
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

  const markLevyPaid = useMutation({
    mutationFn: async ({ id, paidAt }: { id: string; paidAt: string }) => {
      const levy = (levies.data ?? []).find(l => l.id === id);
      const { error } = await supabase.from("levies").update({ status: "Paid", paid_at: paidAt }).eq("id", id);
      if (error) throw error;
      if (!levy) return;
      const shares = splitLevyAcrossFunds(levy);
      if (shares.length === 0) return;
      const { error: txError } = await supabase.from("finance_transactions").insert(shares.map(s => ({
        scheme_id: schemeId!, direction: "in", fund_id: s.fund_id, amount: s.amount, occurred_on: paidAt, status: "Paid",
        category: "Levy contribution", description: `Levy — Lot ${levy.lots?.lot_number ?? "?"} (${levy.budgets?.financial_year ?? ""})`,
        levy_id: levy.id,
      })));
      if (txError) throw txError;
    },
    onSuccess: () => { refresh(["levies", "finance"]); toast("Marked as paid"); },
    onError: (e: Error) => { refresh(["levies"]); toast("Marked as paid, but could not record the transaction", { description: e.message }); },
  });

  const isCommittee = roleQuery.data === "Committee";
  const myLot = myLotQuery.data ?? null;

  useEffect(() => {
    if (!authChecked || !userId || scheme.isLoading || roleQuery.isLoading) return;
    if (scheme.data === null && isCommittee) navigate({ to: "/onboarding", replace: true });
  }, [authChecked, userId, scheme.isLoading, scheme.data, roleQuery.isLoading, isCommittee, navigate]);

  const fundsBootstrapped = useRef(false);
  useEffect(() => {
    if (!schemeId || budgetFunds.isLoading || fundsBootstrapped.current) return;
    fundsBootstrapped.current = true;
    void ensureDefaultFunds(schemeId, budgetFunds.data?.length ?? 0).then(created => { if (created) refresh(["budget-funds"]); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schemeId, budgetFunds.isLoading]);

  const agmWidget = (complianceWidgets.data ?? []).find(w => w.standard_key === "agm_notice");
  const currentAgmTask = agmWidget ? currentTaskFor(agmWidget, tasks.data ?? []) : undefined;

  if (!authChecked) return null;

  return <div className="relative isolate min-h-screen bg-background">
    <Toaster />
    <header className="sticky top-0 z-40 border-b border-border/70 bg-background/80 backdrop-blur-xl">
      <div className="mx-auto flex h-[68px] max-w-[1500px] items-center gap-4 px-4 sm:px-7">
        <Link to="/" className="mr-2 flex shrink-0 items-center gap-2 font-display text-lg font-semibold tracking-[-0.02em]"><span className="grid size-5 grid-cols-2 gap-0.5">{[0,1,2,3].map(i=><span key={i} className="rounded-[2px] bg-primary"/>)}</span><span className="hidden sm:inline">Loty</span></Link>
        <nav className="hidden min-w-0 flex-1 items-center gap-1 lg:flex" aria-label="Dashboard sections">{sections.map(([label])=><Button key={label} size="sm" variant={active===label?"default":"ghost"} className="rounded-full px-3.5 text-xs font-medium transition-all duration-300" onClick={()=>setActive(label)}>{label}</Button>)}</nav>
        <div className="ml-auto flex items-center gap-1">
          <Button size="icon" variant="ghost" className="rounded-full" aria-label="Settings" onClick={()=>setActive("Settings")}><Settings /></Button>
          <NotificationsBell schemeId={schemeId} userId={userId} isCommittee={isCommittee} myLot={myLot} goTo={goTo} overdrawnFunds={warnOverdrawn ? overdrawnFunds : []}/>
          <Button size="icon" variant="ghost" className="rounded-full" aria-label="Sign out" onClick={()=>{ void supabase.auth.signOut().then(()=>navigate({ to: "/", replace: true })); }}><LogOut /></Button>
          <Sheet><SheetTrigger asChild><Button size="icon" variant="ghost" className="rounded-full lg:hidden" aria-label="Open navigation"><Menu/></Button></SheetTrigger><SheetContent side="right"><SheetTitle className="font-display">Your property</SheetTitle><nav className="mt-8 space-y-1">{sections.map(([label,Icon])=><Button key={label} variant={active===label?"default":"ghost"} className="w-full justify-start rounded-full" onClick={()=>setActive(label)}><Icon/>{label}</Button>)}</nav><div className="mt-4 border-t border-border/70 pt-4"><Button variant={active==="Settings"?"default":"ghost"} className="w-full justify-start rounded-full" onClick={()=>setActive("Settings")}><Settings/>Settings</Button></div></SheetContent></Sheet>
        </div>
      </div>
    </header>

    <main className="mx-auto max-w-[1500px] px-4 pb-32 pt-10 sm:px-7 sm:pt-14">
      {active === "Dashboard" && <OverviewSection
        scheme={scheme.data ?? null} levies={levies.data ?? []} funds={budgetFunds.data ?? []} transactions={activeTransactions}
        tasks={tasks.data ?? []} complianceWidgets={complianceWidgets.data ?? []} repairs={repairs.data ?? []} myLot={myLot} notices={notices.data ?? []} noticeComments={noticeComments.data ?? []}
        widgets={dashboardWidgets.data ?? []} widgetsLoading={dashboardWidgets.isLoading} isCommittee={isCommittee} schemeId={schemeId}
        onChanged={()=>refresh(["dashboard-widgets","notices","notice-comments"])} goTo={goTo}/>}

      {active === "Lots" && <LotsSection lots={lots.data ?? []} isCommittee={isCommittee} schemeId={schemeId} onChanged={()=>refresh(["lots"])}/>}

      {active === "Work orders" && <WorkOrdersSection orders={repairs.data ?? []} lots={lots.data ?? []} isCommittee={isCommittee} myLot={myLot} schemeId={schemeId}
        documents={documents.data ?? []} funds={budgetFunds.data ?? []} contractors={contractors.data ?? []} claims={claims.data ?? []}
        fundBalances={warnOverdrawn ? recordedBalances : undefined}
        onChanged={()=>refresh(["repairs","documents","document-folders","finance","notices","contractors"])}/>}

      {active === "AGM" && <AgmSection schemeId={schemeId} isCommittee={isCommittee} meetings={agmMeetings.data ?? []}
        task={currentAgmTask} widgets={complianceWidgets.data ?? []} lots={lots.data ?? []} myLot={myLot}
        scheme={scheme.data ? { name: scheme.data.name, address: scheme.data.address ?? null } : null}
        suggestions={agmSuggestions.data ?? []} documents={documents.data ?? []}
        onChanged={()=>refresh(["tasks","documents","document-folders","compliance-widgets","agm-meetings","agm-suggestions","notices"])}/>}

      {active === "Finance" && <FinanceSection view={financeView} onViewChange={setFinanceView} transactions={finance.data ?? []} budgets={budgets.data ?? []} levies={levies.data ?? []}
        revisions={budgetRevisions.data ?? []} lineItems={budgetLineItems.data ?? []} lots={lots.data ?? []} funds={budgetFunds.data ?? []} documents={documents.data ?? []}
        isCommittee={isCommittee} schemeId={schemeId} onMarkLevyPaid={(id,paidAt)=>markLevyPaid.mutate({id,paidAt})}
        canManagePaid={canManagePaid.data ?? false} treasurerName={treasurerName}
        recordedBalances={recordedBalances} warnOverdrawn={warnOverdrawn} userId={userId} recurring={recurringTx.data ?? []} onOpenSettings={()=>setActive("Settings")}
        onChanged={()=>refresh(["finance","recurring","can-manage-paid","budgets","levies","budget-line-items","budget-revisions","budget-funds","documents","document-folders"])}/>}

      {active === "Insurance" && <InsuranceSection policies={policies.data ?? []} documents={documents.data ?? []} isCommittee={isCommittee}
        schemeId={schemeId} onChanged={()=>refresh(["insurance","insurance-claims","documents","document-folders"])}
        claims={claims.data ?? []} lots={lots.data ?? []} orders={repairs.data ?? []} funds={budgetFunds.data ?? []}
        onClaimsChanged={()=>refresh(["insurance-claims","documents","document-folders","finance"])}/>}
      {active === "Calendar" && <CalendarSection scheme={scheme.data ?? null} tasks={tasks.data ?? []} widgets={complianceWidgets.data ?? []} levies={levies.data ?? []}
        orders={repairs.data ?? []} goTo={goTo}/>}
      {active === "Documents" && <DocumentsSection documents={documents.data ?? []} isCommittee={isCommittee} schemeId={schemeId} onChanged={()=>refresh(["documents"])}/>}

      {active === "Settings" && <SettingsSection scheme={scheme.data ?? null} lots={lots.data ?? []}
        committeeRoles={committeeRoles.data ?? []} settings={schemeSettings.data ?? null}
        isCommittee={isCommittee} schemeId={schemeId} userId={userId} notifyFundOverdrawn={warnOverdrawn}
        onChanged={()=>refresh(["scheme","lots","committee-roles","scheme-settings","can-manage-paid","user-preferences"])}/>}
    </main>

    <nav className="fixed inset-x-0 bottom-0 z-40 flex gap-1 overflow-x-auto scroll-px-2 snap-x snap-mandatory border-t border-border/70 bg-background/90 p-2 backdrop-blur-xl lg:hidden">{sections.map(([label,Icon])=><Button key={label} variant="ghost" className={`h-14 w-[76px] shrink-0 snap-center flex-col gap-1 rounded-2xl px-1 text-[9px] ${active===label?"bg-primary text-primary-foreground":"text-muted-foreground"}`} onClick={()=>setActive(label)}><Icon/>{label}</Button>)}</nav>
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

