import { useState } from "react";
import { daysUntil } from "@/lib/format";
import { AlertTriangle, Bell, Calendar, Coins, FileCheck2, MessageSquare, Vote, Wrench } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { Lot } from "@/routes/dashboard";
import { isRetiredObligation, obligationTab } from "@/lib/action-publish";
import { useCalendarEvents } from "@/components/calendar-view";

const relativeDay = (value: string) => {
  const days = Math.floor((Date.now() - new Date(value).getTime()) / 86400000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  return `${days} days ago`;
};

// `timestamp` drives read/unread — only set for genuine one-off events (a vote
// request, an update, a message). Actions/calendar items are ongoing
// reminders, not "new" occurrences, so they never carry one and never affect
// the unread dot or count.
type NotificationItem = { id: string; category: string; icon: typeof Bell; text: string; sub: string; tab: string; timestamp?: string | undefined };

type BellLevy = { id: string; lot_id: string; amount: number; due_date: string; status: string };
type BellNotice = { id: string; title: string; created_at: string; lot_id: string | null };
type BellTx = { id: string; description: string; amount: number; direction: string; status: string; budget_line_item_id: string | null; voided_at?: string | null; created_at?: string };
type BellTask = { id: string; task_name: string; due_date: string; status: string; widget_id: string | null };
type BellWidget = { id: string; standard_key: string | null };

// Levies, notices, spending, obligations and calendar events come from the dashboard's own
// queries (passed in or shared by cache key), so the bell never fetches a second copy.
export function NotificationsBell({ schemeId, userId, isCommittee, myLot, goTo, overdrawnFunds = [], levies = [], notices = [], transactions = [], tasks = [], widgets = [], notifyLevyDue = true, agmNotice = null }: {
  schemeId?: string | undefined; userId?: string | undefined; isCommittee: boolean; myLot: Lot | null; goTo: (tab: string) => void;
  /** Already filtered by the viewer's own "Fund overdrawn alerts" preference. */
  overdrawnFunds?: { id: string; name: string; balance: number }[];
  levies?: BellLevy[]; notices?: BellNotice[]; transactions?: BellTx[]; tasks?: BellTask[]; widgets?: BellWidget[];
  notifyLevyDue?: boolean; agmNotice?: { due: string; meetingDate: string } | null;
}) {
  const queryClient = useQueryClient();
  const [optimisticReadAt, setOptimisticReadAt] = useState<string | null>(null);

  const lastRead = useQuery({
    queryKey: ["notif-last-read", userId],
    queryFn: async () => {
      const { data, error } = await supabase.from("notification_reads").select("last_read_at").eq("user_id", userId!).maybeSingle();
      if (error) throw error;
      return data?.last_read_at ?? null;
    },
    enabled: !!userId,
  });
  const lastReadAt = optimisticReadAt ?? lastRead.data ?? null;

  const markRead = async () => {
    if (!userId) return;
    const now = new Date().toISOString();
    setOptimisticReadAt(now);
    const { error } = await supabase.from("notification_reads").upsert({ user_id: userId, last_read_at: now });
    if (!error) queryClient.invalidateQueries({ queryKey: ["notif-last-read", userId] });
  };

  const pendingApprovals = useQuery({
    queryKey: ["notif-approvals", schemeId],
    queryFn: async () => {
      const { data, error } = await supabase.from("maintenance_requests")
        .select("id, title, work_order_approvals(id, lot_id, decision, created_at)")
        .eq("scheme_id", schemeId!).eq("status", "Awaiting approval");
      if (error) throw error;
      return (data ?? []) as { id: string; title: string; work_order_approvals: { id: string; lot_id: string; decision: string; created_at: string }[] }[];
    },
    enabled: !!schemeId,
  });

  const recentUpdates = useQuery({
    queryKey: ["notif-updates", schemeId],
    queryFn: async () => {
      const since = new Date(Date.now() - 7 * 86400000).toISOString();
      const { data, error } = await supabase.from("work_order_updates")
        .select("id, note, created_at, work_order_id, maintenance_requests!inner(scheme_id, title, submitted_by_lot_id)")
        .eq("maintenance_requests.scheme_id", schemeId!).gte("created_at", since).order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as { id: string; note: string; created_at: string; work_order_id: string; maintenance_requests: { title: string; submitted_by_lot_id: string | null } | null }[];
    },
    enabled: !!schemeId,
  });






  const events = useCalendarEvents();
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();
  const recentNotices = notices.filter(n => n.created_at >= weekAgo);
  const dueLevies = levies.filter(l => l.status !== "Paid" && l.status !== "Void");
  const unbudgeted = isCommittee ? transactions.filter(t => t.direction === "out" && t.status === "Paid" && !t.budget_line_item_id && !t.voided_at && (t.created_at ?? "") >= weekAgo) : [];
  const openTasks = tasks.filter(t => t.status !== "Complete");

  const items: NotificationItem[] = [];

  const openOrders = pendingApprovals.data ?? [];
  const myPendingVotes = myLot ? openOrders.filter(o => o.work_order_approvals.some(a => a.lot_id === myLot.id && a.decision === "Pending")) : [];
  for (const order of myPendingVotes) {
    const mine = order.work_order_approvals.find(a => a.lot_id === myLot!.id);
    items.push({ id: `vote-${order.id}`, category: "Approval needed", icon: Vote, text: `Vote needed: ${order.title}`, sub: "Your lot hasn't responded yet", tab: "Work orders", timestamp: mine?.created_at });
  }
  if (isCommittee) {
    const pendingRows = openOrders.flatMap(o => o.work_order_approvals.filter(a => a.decision === "Pending"));
    if (pendingRows.length > 0) {
      const newest = pendingRows.reduce((max, r) => r.created_at > max ? r.created_at : max, pendingRows[0]!.created_at);
      items.push({ id: "votes-aggregate", category: "Approval needed", icon: Vote, text: `${pendingRows.length} approval vote${pendingRows.length === 1 ? "" : "s"} still open`, sub: `across ${openOrders.length} work order${openOrders.length === 1 ? "" : "s"}`, tab: "Work orders", timestamp: newest });
    }
  }

  for (const u of recentUpdates.data ?? []) {
    const relevant = isCommittee || (myLot && u.maintenance_requests?.submitted_by_lot_id === myLot.id);
    if (!relevant) continue;
    items.push({ id: `update-${u.id}`, category: "Work order update", icon: Wrench, text: u.maintenance_requests?.title ?? "Work order", sub: `${u.note} · ${relativeDay(u.created_at)}`, tab: "Work orders", timestamp: u.created_at });
  }

  for (const task of openTasks) {
    const key = widgets.find(w => w.id === task.widget_id)?.standard_key;
    const left = daysUntil(task.due_date);
    if (left > 14 || isRetiredObligation(key)) continue;
    items.push({ id: `task-${task.id}`, category: "Obligations", icon: FileCheck2, text: task.task_name, sub: left < 0 ? `${Math.abs(left)} days overdue` : left === 0 ? "Due today" : `Due in ${left} days`, tab: obligationTab(key) });
  }

  // The AGM notice reminder comes from the meeting itself: shown from 21 days before it's due.
  if (isCommittee && agmNotice) {
    const left = daysUntil(agmNotice.due);
    if (left <= 21) items.push({ id: "agm-notice", category: "Obligations", icon: FileCheck2, text: "Send the AGM notice",
      sub: left < 0 ? `${Math.abs(left)} days overdue` : left === 0 ? "Due today" : `Due in ${left} days`, tab: "AGM" });
  }

  for (const event of events.data ?? []) {
    const left = daysUntil(event.event_date);
    if (left < 0 || left > 14) continue;
    items.push({ id: `event-${event.id}`, category: "Upcoming event", icon: Calendar, text: event.title, sub: left === 0 ? "Today" : left === 1 ? "Tomorrow" : `In ${left} days`, tab: "Calendar" });
  }

  for (const notice of recentNotices) {
    if (!isCommittee && notice.lot_id && notice.lot_id !== myLot?.id) continue;
    items.push({ id: `notice-${notice.id}`, category: "Message", icon: MessageSquare, text: notice.title, sub: `Posted ${relativeDay(notice.created_at)}`, tab: "Dashboard", timestamp: notice.created_at });
  }

  if (notifyLevyDue) {
    const dueSoon = dueLevies.filter(l => daysUntil(l.due_date) <= 14);
    if (isCommittee) {
      if (dueSoon.length > 0) {
        const overdue = dueSoon.filter(l => daysUntil(l.due_date) < 0).length;
        const plural = (n: number) => n === 1 ? "levy" : "levies";
        items.push({ id: "levies-aggregate", category: "Levy due", icon: Coins,
          text: overdue === dueSoon.length ? `${overdue} ${plural(overdue)} overdue` : overdue > 0 ? `${dueSoon.length} ${plural(dueSoon.length)} due, ${overdue} overdue` : `${dueSoon.length} ${plural(dueSoon.length)} coming due`,
          sub: "Across the scheme", tab: "Finance/Levies" });
      }
    } else if (myLot) {
      for (const levy of dueSoon.filter(l => l.lot_id === myLot.id)) {
        const left = daysUntil(levy.due_date);
        items.push({ id: `levy-${levy.id}`, category: "Levy due", icon: Coins, text: `Levy due ${left < 0 ? `${Math.abs(left)} days ago` : left === 0 ? "today" : `in ${left} days`}`, sub: `${new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 }).format(Number(levy.amount))}`, tab: "Finance/Levies" });
      }
    }
  }

  for (const tx of unbudgeted) {
    items.push({ id: `unbudgeted-${tx.id}`, category: "Unbudgeted spend", icon: AlertTriangle, text: tx.description, sub: `${new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 }).format(Number(tx.amount))} · not in the budget`, tab: "Finance/Cashflow", timestamp: tx.created_at });
  }

  for (const f of overdrawnFunds) {
    items.push({ id: `overdrawn-${f.id}`, category: "Fund overdrawn", icon: AlertTriangle, text: `${f.name} fund is below $0`,
      sub: `${new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 }).format(f.balance)} based on what's recorded in Loty`, tab: "Finance/Cashflow" });
  }

  const categoryOrder = ["Fund overdrawn", "Approval needed", "Unbudgeted spend", "Work order update", "Levy due", "Obligations", "Upcoming event", "Message"];
  items.sort((a, b) => categoryOrder.indexOf(a.category) - categoryOrder.indexOf(b.category));

  const isUnread = (item: NotificationItem) => !!item.timestamp && (!lastReadAt || item.timestamp > lastReadAt);
  const hasUnread = items.some(isUnread);

  return <Popover onOpenChange={(open)=>{ if (open) void markRead(); }}>
    <PopoverTrigger asChild>
      <Button size="icon" variant="ghost" className="relative rounded-full" aria-label="Notifications">
        <Bell/>
        {hasUnread && <span className="absolute right-1.5 top-1.5 size-2 rounded-full bg-destructive"/>}
      </Button>
    </PopoverTrigger>
    <PopoverContent align="end" sideOffset={8} collisionPadding={12} className="w-[calc(100vw-24px)] sm:w-80 max-h-[70vh] overflow-y-auto p-0">
      <div className="border-b border-border/70 px-4 py-3"><p className="text-sm font-medium">Notifications</p></div>
      {items.length === 0
        ? <p className="px-4 py-8 text-center text-[13px] text-muted-foreground">You're all caught up.</p>
        : <div className="divide-y divide-border/70">
            {items.map(item => <button key={item.id} type="button" onClick={()=>goTo(item.tab)}
              className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/40">
              <span className="relative mt-0.5 shrink-0">
                <item.icon className="size-4 text-muted-foreground"/>
                {isUnread(item) && <span className="absolute -right-0.5 -top-0.5 size-1.5 rounded-full bg-destructive"/>}
              </span>
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">{item.category}</p>
                <p className={`mt-0.5 truncate text-[13px] ${isUnread(item) ? "font-semibold" : "font-medium"}`}>{item.text}</p>
                <p className="mt-0.5 text-[12px] text-muted-foreground">{item.sub}</p>
              </div>
            </button>)}
          </div>}
    </PopoverContent>
  </Popover>;
}
