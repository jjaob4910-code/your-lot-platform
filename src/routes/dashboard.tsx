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
import { FinanceSection, ensureDefaultFunds, shareAmount, type RecurringTx, type LevyReversal, type FinanceView, type FinanceBudget, type FinanceTx, type BudgetLineItem, type BudgetRevision } from "@/components/finance";
import { SettingsSection, type SchemeSettings, type CommitteeRole } from "@/components/settings";
import { NotificationsBell } from "@/components/notifications";
import { InviteDialog } from "@/components/invite";
import { OwnerFinance } from "@/components/owner-finance";
import { agmNoticeDue, nextAgm } from "@/lib/agm-date";
import { budgetStartYear, currentFinancialYearStart, recordedFundBalances, splitLevyAcrossFunds, type Levy } from "@/lib/fund-balance";
import { AgmSection, type AgmMeeting, type AgmSuggestion } from "@/components/agm";
import type { AgmAttachment } from "@/components/agm-extras";
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

type Membership = { scheme_id: string; role: "Committee" | "Owner"; lot_id: string | null; schemes: { id: string; name: string; address: string } | null };
const BUILDING_KEY = "loty-building";
function pickMembership(list: Membership[]): Membership | undefined {
  let saved: string | null = null;
  try { saved = localStorage.getItem(BUILDING_KEY); } catch { /* storage unavailable */ }
  return list.find(m => m.scheme_id === saved) ?? list[0];
}
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

import { money } from "@/lib/format";
export { money };

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

  // Which buildings this person belongs to, and as what. The building they last opened is
  // remembered on this device; otherwise the first one.
  const memberships = useQuery({
    queryKey: ["memberships", userId],
    queryFn: async () => {
      const { data, error } = await supabase.from("scheme_members").select("scheme_id, role, lot_id, schemes(*)").eq("user_id", userId!);
      if (!error) return (data ?? []) as unknown as Membership[];
      // Until the membership update has been applied to the database, fall back to the
      // single building and the old app-wide role.
      if (!/scheme_members|does not exist|schema cache/i.test(error.message)) throw error;
      const [{ data: first }, { data: role }] = await Promise.all([
        supabase.from("schemes").select("*").order("created_at").limit(1).maybeSingle(),
        supabase.from("user_roles").select("role").eq("user_id", userId!).maybeSingle(),
      ]);
      return first ? [{ scheme_id: first.id, role: role?.role === "Committee" ? "Committee" : "Owner", lot_id: null, schemes: first }] as Membership[] : [];
    },
    enabled: !!userId,
  });
  const membership = pickMembership(memberships.data ?? []);
  const scheme = useQuery({
    queryKey: ["scheme", membership?.scheme_id],
    queryFn: async () => {
      const { data, error } = await supabase.from("schemes").select("*").eq("id", membership!.scheme_id).maybeSingle();
      if (error) throw error;
      return data as Scheme | null;
    },
    enabled: !!membership,
  });
  const schemeId = membership?.scheme_id;

  const myLotQuery = useQuery({
    queryKey: ["my-lot", userId], enabled: !!userId && !!schemeId,
    queryFn: async () => {
      const { data, error } = await supabase.from("lots").select("*").eq("owner_user_id", userId!).eq("scheme_id", schemeId!).maybeSingle();
      if (error) throw error;
      return data as unknown as Lot | null;
    },
  });

  const lots = useQuery({
    queryKey: ["lots"], enabled: !!schemeId,
    queryFn: async () => {
      const { data, error } = await supabase.from("lots").select("*").eq("scheme_id", schemeId!).order("lot_number");
      if (error) throw error;
      return (data ?? []) as unknown as Lot[];
    },
  });
  const levies = useQuery({
    queryKey: ["levies"], enabled: !!schemeId,
    queryFn: async () => {
      const { data, error } = await supabase.from("levies").select("*, lots!inner(scheme_id, lot_number, owner_name, owner_email, entitlement_percent), budgets(financial_year, allocation_method, total_amount, budget_fund_totals(fund_id, total))").order("due_date").eq("lots.scheme_id", schemeId!);
      if (error) throw error;
      return (data ?? []) as unknown as Levy[];
    },
  });
  const tasks = useQuery({
    queryKey: ["tasks"], enabled: !!schemeId,
    queryFn: async () => {
      const { data, error } = await supabase.from("compliance_tasks").select("*").eq("scheme_id", schemeId!).order("due_date");
      if (error) throw error;
      return (data ?? []) as unknown as Task[];
    },
  });
  const complianceWidgets = useQuery({
    queryKey: ["compliance-widgets"], enabled: !!schemeId,
    queryFn: async () => {
      const { data, error } = await supabase.from("compliance_widgets").select("*").eq("scheme_id", schemeId!).order("sort_order");
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
    queryKey: ["contractors"], enabled: !!schemeId,
    queryFn: async () => {
      const { data, error } = await supabase.from("contractors").select("*").eq("scheme_id", schemeId!).order("name");
      if (error) throw error;
      return (data ?? []) as Contractor[];
    },
  });
  const documents = useQuery({
    queryKey: ["documents"], enabled: !!schemeId,
    queryFn: async () => {
      const { data, error } = await supabase.from("documents").select("*").eq("scheme_id", schemeId!).order("uploaded_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as Doc[];
    },
  });

  const claims = useQuery({
    queryKey: ["insurance-claims"], enabled: !!schemeId,
    queryFn: async () => {
      const { data, error } = await supabase.from("insurance_claims").select("*, insurance_claim_updates(*)").eq("scheme_id", schemeId!).order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as Claim[];
    },
  });
  const policies = useQuery({
    queryKey: ["insurance"], enabled: !!schemeId,
    queryFn: async () => {
      const { data, error } = await supabase.from("insurance_policies").select("*").eq("scheme_id", schemeId!).order("renewal_date", { nullsFirst: false });
      if (error) throw error;
      return (data ?? []) as unknown as Policy[];
    },
  });

  const dashboardWidgets = useQuery({
    queryKey: ["dashboard-widgets"], enabled: !!schemeId,
    queryFn: async () => {
      const { data, error } = await supabase.from("dashboard_widgets").select("*").eq("scheme_id", schemeId!).order("sort_order");
      if (error) throw error;
      return (data ?? []) as unknown as DashboardWidget[];
    },
  });
  const notices = useQuery({
    queryKey: ["notices"], enabled: !!schemeId,
    queryFn: async () => {
      const { data, error } = await supabase.from("notices").select("*").eq("scheme_id", schemeId!).order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as Notice[];
    },
  });
  const noticeComments = useQuery({
    queryKey: ["notice-comments"], enabled: !!schemeId,
    queryFn: async () => {
      const { data, error } = await supabase.from("notice_comments").select("*").eq("scheme_id", schemeId!).order("created_at");
      if (error) throw error;
      return (data ?? []) as unknown as NoticeComment[];
    },
  });
  const budgets = useQuery({
    queryKey: ["budgets"], enabled: !!schemeId,
    queryFn: async () => {
      const { data, error } = await supabase.from("budgets").select("*, budget_fund_totals(fund_id, total)").eq("scheme_id", schemeId!).order("financial_year", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as FinanceBudget[];
    },
  });
  const budgetFunds = useQuery({
    queryKey: ["budget-funds"], enabled: !!schemeId,
    queryFn: async () => {
      const { data, error } = await supabase.from("budget_funds").select("*").eq("scheme_id", schemeId!).order("sort_order");
      if (error) throw error;
      return (data ?? []) as unknown as BudgetFund[];
    },
  });
  const budgetLineItems = useQuery({
    queryKey: ["budget-line-items"], enabled: !!schemeId,
    queryFn: async () => {
      const { data, error } = await supabase.from("budget_line_items").select("*").eq("scheme_id", schemeId!).order("created_at");
      if (error) throw error;
      return (data ?? []) as unknown as BudgetLineItem[];
    },
  });
  const budgetRevisions = useQuery({
    queryKey: ["budget-revisions"], enabled: !!schemeId,
    queryFn: async () => {
      const { data, error } = await supabase.from("budget_revisions").select("*").eq("scheme_id", schemeId!).order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as BudgetRevision[];
    },
  });
  const finance = useQuery({
    queryKey: ["finance"], enabled: !!schemeId,
    queryFn: async () => {
      const { data, error } = await supabase.from("finance_transactions").select("*").eq("scheme_id", schemeId!).order("occurred_on", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as FinanceTx[];
    },
  });
  const financialYears = useQuery({
    queryKey: ["financial-years"], enabled: !!schemeId,
    queryFn: async () => {
      const { data, error } = await supabase.from("financial_years").select("id, start_year").eq("scheme_id", schemeId!).order("start_year");
      if (error) throw error;
      return (data ?? []) as { id: string; start_year: number }[];
    },
  });
  const levyReversals = useQuery({
    queryKey: ["levy-reversals"],
    queryFn: async () => {
      const { data, error } = await supabase.from("levy_payment_reversals").select("id, levy_id, reason, actor_label, created_at");
      if (error) throw error;
      return (data ?? []) as LevyReversal[];
    },
  });
  const recurringTx = useQuery({
    queryKey: ["recurring"], enabled: !!schemeId,
    queryFn: async () => {
      const { data, error } = await supabase.from("recurring_transactions").select("*").eq("scheme_id", schemeId!).order("created_at");
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
  const agmAttachments = useQuery({
    queryKey: ["agm-attachments"],
    queryFn: async () => {
      const { data, error } = await supabase.from("agm_item_attachments").select("id, meeting_id, item_id, document_id");
      if (error) throw error;
      return (data ?? []) as AgmAttachment[];
    },
  });
  const agmSuggestions = useQuery({
    queryKey: ["agm-suggestions"],
    queryFn: async () => {
      const { data, error } = await supabase.from("agm_suggestions").select("*").order("created_at");
      if (error) throw error;
      return (data ?? []) as AgmSuggestion[];
    },
  });
  const agmMeetings = useQuery({
    queryKey: ["agm-meetings"], enabled: !!schemeId,
    queryFn: async () => {
      const { data, error } = await supabase.from("agm_meetings").select("*").eq("scheme_id", schemeId!).order("created_at", { ascending: false });
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

  // The bell keeps its own queries ("notif-…"), so any change refreshes it as well.
  const refresh = (keys: string[]) => {
    keys.forEach(key => queryClient.invalidateQueries({ queryKey: [key] }));
    queryClient.invalidateQueries({ predicate: q => typeof q.queryKey[0] === "string" && q.queryKey[0].startsWith("notif-") });
  };

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

  const isCommittee = membership?.role === "Committee";
  const myLot = myLotQuery.data ?? null;
  // The next AGM comes from the AGM tab's meetings, falling back to the date in Settings.
  const agmNext = nextAgm(agmMeetings.data ?? [], scheme.data?.next_agm_date ?? null);
  const noticeDue = agmNoticeDue(agmMeetings.data ?? []);
  const schemeWithAgm = scheme.data ? { ...scheme.data, next_agm_date: agmNext.date, next_agm_meeting_id: agmNext.meetingId, agm_notice_due: noticeDue?.due ?? null,
    renewals: (policies.data ?? []).filter(p => p.renewal_date).map(p => ({ id: p.id, label: p.policy_type, date: p.renewal_date!.slice(0, 10) })) } : null;

  // Someone who doesn't belong to any building yet sets one up (or follows an invite link).
  useEffect(() => {
    if (!authChecked || !userId || memberships.isLoading || memberships.isError) return;
    if ((memberships.data ?? []).length === 0) navigate({ to: "/onboarding", replace: true });
  }, [authChecked, userId, memberships.isLoading, memberships.isError, memberships.data, navigate]);

  const fundsBootstrapped = useRef(false);
  useEffect(() => {
    if (!schemeId || budgetFunds.isLoading || fundsBootstrapped.current) return;
    fundsBootstrapped.current = true;
    void ensureDefaultFunds(schemeId, budgetFunds.data?.length ?? 0).then(created => { if (created) refresh(["budget-funds"]); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schemeId, budgetFunds.isLoading]);


  if (!authChecked) return null;

  return <div className="relative isolate min-h-screen bg-background">
    <Toaster />
    <header className="sticky top-0 z-40 border-b border-border/70 bg-background/80 backdrop-blur-xl">
      <div className="mx-auto flex h-[68px] max-w-[1500px] items-center gap-4 px-4 sm:px-7">
        <Link to="/" className="mr-2 flex shrink-0 items-center gap-2 font-display text-lg font-semibold tracking-[-0.02em]"><span className="grid size-5 grid-cols-2 gap-0.5">{[0,1,2,3].map(i=><span key={i} className="rounded-[2px] bg-primary"/>)}</span><span className="hidden sm:inline">Loty</span></Link>
        <nav className="hidden min-w-0 flex-1 items-center gap-1 lg:flex" aria-label="Dashboard sections">{sections.map(([label])=><Button key={label} size="sm" variant={active===label?"default":"ghost"} className="rounded-full px-3.5 text-xs font-medium transition-all duration-300" onClick={()=>setActive(label)}>{label}</Button>)}</nav>
        <div className="ml-auto flex items-center gap-1">
          {(memberships.data?.length ?? 0) > 1 && <select aria-label="Building" value={schemeId ?? ""} className="mr-1 max-w-[160px] truncate rounded-full border border-border/70 bg-background px-3 py-1.5 text-xs"
            onChange={e => { try { localStorage.setItem(BUILDING_KEY, e.target.value); } catch { /* storage unavailable */ } window.location.reload(); }}>
            {(memberships.data ?? []).map(m => <option key={m.scheme_id} value={m.scheme_id}>{m.schemes?.name ?? "Building"}</option>)}
          </select>}
          <Button size="icon" variant="ghost" className="rounded-full" aria-label="Settings" onClick={()=>setActive("Settings")}><Settings /></Button>
          <NotificationsBell schemeId={schemeId} userId={userId} isCommittee={isCommittee} myLot={myLot} goTo={goTo} overdrawnFunds={warnOverdrawn ? overdrawnFunds : []}
            levies={levies.data ?? []} notices={notices.data ?? []} transactions={activeTransactions} tasks={tasks.data ?? []} widgets={complianceWidgets.data ?? []}
            notifyLevyDue={schemeSettings.data?.notify_levy_due ?? true} agmNotice={noticeDue}
            renewals={(policies.data ?? []).filter(p => p.renewal_date).map(p => ({ id: p.id, label: p.policy_type, date: p.renewal_date!.slice(0, 10) }))}/>
          <Button size="icon" variant="ghost" className="rounded-full" aria-label="Sign out" onClick={()=>{ void supabase.auth.signOut().then(()=>navigate({ to: "/", replace: true })); }}><LogOut /></Button>
          <Sheet><SheetTrigger asChild><Button size="icon" variant="ghost" className="rounded-full lg:hidden" aria-label="Open navigation"><Menu/></Button></SheetTrigger><SheetContent side="right"><SheetTitle className="font-display">Your property</SheetTitle><nav className="mt-8 space-y-1">{sections.map(([label,Icon])=><Button key={label} variant={active===label?"default":"ghost"} className="w-full justify-start rounded-full" onClick={()=>setActive(label)}><Icon/>{label}</Button>)}</nav><div className="mt-4 border-t border-border/70 pt-4"><Button variant={active==="Settings"?"default":"ghost"} className="w-full justify-start rounded-full" onClick={()=>setActive("Settings")}><Settings/>Settings</Button></div></SheetContent></Sheet>
        </div>
      </div>
    </header>

    <main className="mx-auto max-w-[1500px] px-4 pb-32 pt-10 sm:px-7 sm:pt-14">
      {active === "Dashboard" && <OverviewSection lots={lots.data ?? []} firstName={(myLot?.owner_name || String(session?.user?.user_metadata?.["display_name"] ?? "")).trim().split(/\s+/)[0] || undefined}
        scheme={schemeWithAgm} levies={levies.data ?? []} funds={budgetFunds.data ?? []} transactions={activeTransactions}
        balances={recordedBalances} budgets={budgets.data ?? []} meetings={agmMeetings.data ?? []} policies={policies.data ?? []} userId={userId}
        tasks={tasks.data ?? []} complianceWidgets={complianceWidgets.data ?? []} repairs={repairs.data ?? []} myLot={myLot} notices={notices.data ?? []} noticeComments={noticeComments.data ?? []}
        widgets={dashboardWidgets.data ?? []} widgetsLoading={dashboardWidgets.isLoading} isCommittee={isCommittee} schemeId={schemeId}
        onChanged={()=>refresh(["dashboard-widgets","notices","notice-comments"])} goTo={goTo}/>}

      {active === "Lots" && <LotsSection lots={lots.data ?? []} isCommittee={isCommittee} schemeId={schemeId} myLot={myLot} buildingName={scheme.data?.name}
        budget={(budgets.data ?? []).find(b => budgetStartYear(b.financial_year) === currentFinancialYearStart())}
        onChanged={()=>refresh(["lots","levies","my-lot"])}/>}

      {active === "Work orders" && <WorkOrdersSection orders={repairs.data ?? []} lots={lots.data ?? []} isCommittee={isCommittee} myLot={myLot} schemeId={schemeId}
        documents={documents.data ?? []} funds={budgetFunds.data ?? []} contractors={contractors.data ?? []} claims={claims.data ?? []}
        fundBalances={warnOverdrawn ? recordedBalances : undefined}
        budgetLines={(budgetLineItems.data ?? []).map(l => ({ id: l.id, fund_id: l.fund_id, description: l.description, fy: (budgets.data ?? []).find(b => b.id === l.budget_id)?.financial_year ?? null }))}
        onChanged={()=>refresh(["repairs","documents","document-folders","finance","notices","contractors","budget-line-items"])}/>}

      {active === "AGM" && <AgmSection schemeId={schemeId} isCommittee={isCommittee} meetings={agmMeetings.data ?? []} 
        lots={lots.data ?? []} myLot={myLot}
        scheme={scheme.data ? { name: scheme.data.name, address: scheme.data.address ?? null } : null}
        suggestions={agmSuggestions.data ?? []} documents={documents.data ?? []} attachments={agmAttachments.data ?? []}
        ctx={{ orders: repairs.data ?? [], policies: policies.data ?? [], claims: claims.data ?? [], budgets: budgets.data ?? [],
          levies: levies.data ?? [], funds: budgetFunds.data ?? [], fundBalances: recordedBalances, goTo }}
        onChanged={()=>refresh(["tasks","documents","document-folders","compliance-widgets","agm-meetings","agm-suggestions","agm-attachments","notices"])}/>}

      {active === "Finance" && !isCommittee && <OwnerFinance schemeId={schemeId} levies={levies.data ?? []} myLotId={myLot?.id ?? null}
        budgets={budgets.data ?? []} lineItems={budgetLineItems.data ?? []}/>}
      {active === "Finance" && isCommittee && <FinanceSection view={financeView} onViewChange={setFinanceView} transactions={finance.data ?? []} budgets={budgets.data ?? []} levies={levies.data ?? []}
        revisions={budgetRevisions.data ?? []} lineItems={budgetLineItems.data ?? []} lots={lots.data ?? []} funds={budgetFunds.data ?? []} documents={documents.data ?? []}
        isCommittee={isCommittee} schemeId={schemeId} onMarkLevyPaid={(id,paidAt)=>markLevyPaid.mutate({id,paidAt})}
        canManagePaid={canManagePaid.data ?? false} treasurerName={treasurerName}
        recordedBalances={recordedBalances} warnOverdrawn={warnOverdrawn} userId={userId} recurring={recurringTx.data ?? []}
        financialYears={financialYears.data ?? []} levyReversals={levyReversals.data ?? []} onOpenSettings={()=>setActive("Settings")}
        onChanged={()=>refresh(["finance","recurring","financial-years","levy-reversals","can-manage-paid","budgets","levies","budget-line-items","budget-revisions","budget-funds","documents","document-folders","notices"])}/>}

      {active === "Insurance" && <InsuranceSection policies={policies.data ?? []} documents={documents.data ?? []} isCommittee={isCommittee}
        schemeId={schemeId} onChanged={()=>refresh(["insurance","insurance-claims","documents","document-folders"])}
        claims={claims.data ?? []} lots={lots.data ?? []} orders={repairs.data ?? []} funds={budgetFunds.data ?? []}
        onClaimsChanged={()=>refresh(["insurance-claims","documents","document-folders","finance"])}/>}
      {active === "Calendar" && <CalendarSection scheme={schemeWithAgm} tasks={tasks.data ?? []} widgets={complianceWidgets.data ?? []} levies={levies.data ?? []}
        orders={repairs.data ?? []} goTo={goTo} canEdit={isCommittee}/>}
      {active === "Documents" && <DocumentsSection documents={documents.data ?? []} isCommittee={isCommittee} schemeId={schemeId} onChanged={()=>refresh(["documents"])}/>}

      {active === "Settings" && <SettingsSection scheme={schemeWithAgm} lots={lots.data ?? []}
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



function LotDialog({ open, onOpenChange, schemeId, lot, onSaved, budget, lotCount }: {
  open: boolean; onOpenChange: (v: boolean) => void; schemeId?: string | undefined; lot: Lot | null; onSaved: () => void;
  /** This year's locked budget, if any: a lot added after it gets offered its levy. */
  budget?: FinanceBudget | undefined; lotCount: number;
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
    const { data: saved, error } = lot
      ? await supabase.from("lots").update(base).eq("id", lot.id).select("id").single()
      : await supabase.from("lots").insert({ ...base, scheme_id: schemeId }).select("id").single();
    if (error) { toast(lot ? "Could not update the lot" : "Could not add the lot", { description: error.message }); return; }
    onOpenChange(false); onSaved();
    if (lot || !budget || !saved) { toast(lot ? "Lot updated" : "Lot added"); return; }
    // The year's levies were issued before this lot existed, so offer its share now.
    const amount = shareAmount(budget.allocation_method ?? "Entitlement", base.entitlement_percent, lotCount + 1, Number(budget.total_amount));
    toast("Lot added", {
      description: `This year's levies went out before Lot ${base.lot_number} existed. Its share is ${money(amount)}.`,
      duration: 15000,
      action: { label: "Issue its levy", onClick: () => {
        void supabase.from("levies").insert({ lot_id: saved.id, budget_id: budget.id, amount, due_date: budget.levy_due_date, status: "Pending" })
          .then(({ error: e }) => { if (e) toast("Could not issue the levy", { description: e.message }); else { onSaved(); toast(`Levy of ${money(amount)} issued to Lot ${base.lot_number}`); } });
      } },
    });
  };
  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent>
      <DialogHeader><DialogTitle className="font-display tracking-[-0.02em]">{lot ? `Edit lot ${lot.lot_number}` : "Add a lot"}</DialogTitle><DialogDescription>{lot ? "Update the lot number and who owns it." : "Add the lot number and who owns it."}</DialogDescription></DialogHeader>
      <form onSubmit={submit} className="space-y-4">
        <div className="space-y-2"><Label htmlFor="lot_number">Lot number</Label><Input id="lot_number" name="lot_number" type="number" min="1" defaultValue={lot?.lot_number ?? ""} required/></div>
        <div className="space-y-2"><Label htmlFor="entitlement_percent">Lot entitlement (%)</Label><Input id="entitlement_percent" name="entitlement_percent" type="number" min="0" step="0.001" placeholder="e.g. 12.5" defaultValue={lot?.entitlement_percent ?? ""}/>
          <p className="text-[12px] text-muted-foreground">From your plan of subdivision. It sets this lot's share of levies and its weight in votes. All lots should add up to 100%.</p></div>
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

function LotsSection({ lots, isCommittee, schemeId, onChanged, budget, myLot, buildingName }: {
  lots: Lot[]; isCommittee: boolean; schemeId?: string | undefined; onChanged: () => void;
  budget?: FinanceBudget | undefined; myLot: Lot | null; buildingName?: string | undefined;
}) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Lot | null>(null);
  const [viewing, setViewing] = useState<Lot | null>(null);
  const [inviting, setInviting] = useState<Lot | null>(null);
  // Owners see only their own lot, plus how to reach the committee.
  const contacts = useQuery({
    queryKey: ["committee-contacts", schemeId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("committee_contacts", { _scheme: schemeId! });
      if (error) throw error;
      return Array.isArray(data) ? data : [];
    },
    enabled: !!schemeId && !isCommittee,
  });
  const total = lots.reduce((sum, l) => sum + Number(l.entitlement_percent || 0), 0);
  const totalOk = Math.abs(total - 100) < 0.01;
  const visible = isCommittee ? lots : lots.filter(l => l.id === myLot?.id);

  return <div>
    <PageHead eyebrow="Your property" title={isCommittee ? "Lots" : "Your lot"}
      blurb={isCommittee ? "Who owns what and who lives there. Invite each owner so they can see their levies and the building's notices." : "Your lot's details on file, and how to reach your committee."}
      action={isCommittee ? <Button className="rounded-full" onClick={()=>{ setEditing(null); setOpen(true); }}><Plus/> Add a lot</Button> : undefined}/>
    {isCommittee && lots.length > 0 && <p role="status" className={`mt-6 rounded-2xl px-4 py-3 text-[13px] ${totalOk ? "bg-secondary/50 text-muted-foreground" : "bg-amber-500/10 text-amber-800 dark:text-amber-300"}`}>
      {totalOk ? "Lot entitlements add up to 100%." : `Lot entitlements add up to ${Number(total.toFixed(3))}%. They should total 100% so levies and votes are shared correctly. Check them against your plan of subdivision.`}
    </p>}
    <Card className="mt-6 overflow-hidden">
      <div className="divide-y divide-border/70">{visible.map(lot =>
        <div key={lot.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 transition-colors hover:bg-muted/40 sm:px-7">
          <button type="button" onClick={()=>setViewing(lot)} className="min-w-0 flex-1 text-left">
            <p className="text-sm font-medium">Lot {lot.lot_number}{lot.owner_name ? ` · ${lot.owner_name}` : ""}</p>
            <p className="mt-1 text-[12px] text-muted-foreground">{lot.entitlement_percent}% entitlement · {lot.occupied_status}{lot.owner_email ? ` · ${lot.owner_email}` : " · No email on file"}</p>
          </button>
          <div className="flex items-center gap-2">
            {isCommittee && (lot.owner_user_id
              ? <span className="rounded-full bg-emerald-600/10 px-2.5 py-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-400">Joined</span>
              : <><span className="rounded-full bg-secondary px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground">Not joined yet</span>
                  <Button type="button" size="sm" variant="outline" className="h-8 rounded-full" onClick={() => setInviting(lot)}>Invite</Button></>)}
            <Button type="button" size="sm" variant="ghost" className="h-8 rounded-full" onClick={()=>setViewing(lot)}>Details</Button>
          </div>
        </div>)}
        {visible.length === 0 && <p className="px-7 py-10 text-center text-sm text-muted-foreground">{isCommittee ? "No lots yet. Add your first lot to start billing levies." : "Your lot isn't linked to your account yet. Ask your committee to invite you, or to put your email on your lot."}</p>}
      </div>
    </Card>
    {!isCommittee && <Card className="mt-6 p-5 sm:p-7">
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Your committee</p>
      <ul className="mt-3 divide-y divide-border/70">
        {(contacts.data ?? []).map((c, i) => <li key={i} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
          <span><span className="font-medium">{c.name ?? "Committee member"}</span>{c.committee_role ? <span className="text-muted-foreground"> · {c.committee_role}</span> : null}</span>
          <span className="text-[13px] text-muted-foreground">{[c.email, c.phone].filter(Boolean).join(" · ")}</span>
        </li>)}
        {contacts.isSuccess && contacts.data.length === 0 && <li className="py-2.5 text-sm text-muted-foreground">No committee contacts on file yet.</li>}
      </ul>
    </Card>}
    <Dialog open={!!viewing} onOpenChange={(o)=>{ if (!o) setViewing(null); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="font-display tracking-[-0.02em]">Lot {viewing?.lot_number}</DialogTitle>
          <DialogDescription>Owner details on file for this lot.</DialogDescription>
        </DialogHeader>
        <div className="divide-y divide-border/70 text-sm">
          {[["Owner", viewing?.owner_name || "—"],
            ["Entitlement", `${viewing?.entitlement_percent ?? 0}%`],
            ["Email", viewing?.owner_email || "—"],
            ["Phone", viewing?.owner_phone || "—"],
            ["Address", viewing?.street_address || "—"],
            ["Occupancy", viewing?.occupied_status || "—"],
            ...(isCommittee ? [["On Loty", viewing?.owner_user_id ? "Joined" : "Not joined yet"]] : [])].map(([label, value]) =>
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
    {open && <LotDialog open={open} onOpenChange={setOpen} schemeId={schemeId} lot={editing} onSaved={onChanged} budget={budget} lotCount={lots.length} key={editing?.id ?? "new"}/>}
    <InviteDialog open={!!inviting} onOpenChange={o => { if (!o) setInviting(null); }} schemeId={schemeId} role="Owner" lot={inviting} buildingName={buildingName}/>
  </div>;
}

