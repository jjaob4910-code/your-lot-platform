import { useState } from "react";
import { AlertTriangle, Bell, Calendar, Coins, FileCheck2, MessageSquare, Vote, Wrench } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { Lot } from "@/routes/dashboard";

const daysUntil = (date: string) => Math.ceil((new Date(date + "T00:00:00").getTime() - new Date(new Date().toDateString()).getTime()) / 86400000);
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

export function NotificationsBell({ schemeId, userId, isCommittee, myLot, goTo }: {
  schemeId?: string | undefined; userId?: string | undefined; isCommittee: boolean; myLot: Lot | null; goTo: (tab: string) => void;
}) {
  const schemeSettings = useQuery({
    queryKey: ["notif-scheme-settings", schemeId],
    queryFn: async () => {
      const { data, error } = await supabase.from("scheme_settings").select("notify_levy_due").eq("scheme_id", schemeId!).maybeSingle();
      if (error) throw error;
      return data?.notify_levy_due ?? true;
    },
    enabled: !!schemeId,
  });
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

  const compliance = useQuery({
    queryKey: ["notif-compliance", schemeId],
    queryFn: async () => {
      const { data, error } = await supabase.from("compliance_tasks").select("id, task_name, due_date, status").eq("scheme_id", schemeId!).neq("status", "Complete");
      if (error) throw error;
      return (data ?? []) as { id: string; task_name: string; due_date: string; status: string }[];
    },
    enabled: !!schemeId,
  });

  const events = useQuery({
    queryKey: ["notif-events", schemeId],
    queryFn: async () => {
      const { data, error } = await supabase.from("calendar_events").select("id, title, event_date").eq("scheme_id", schemeId!);
      if (error) throw error;
      return (data ?? []) as { id: string; title: string; event_date: string }[];
    },
    enabled: !!schemeId,
  });

  const notices = useQuery({
    queryKey: ["notif-notices", schemeId],
    queryFn: async () => {
      const since = new Date(Date.now() - 7 * 86400000).toISOString();
      const { data, error } = await supabase.from("notices").select("id, title, created_at").eq("scheme_id", schemeId!).gte("created_at", since).order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as { id: string; title: string; created_at: string }[];
    },
    enabled: !!schemeId,
  });

  const duelevies = useQuery({
    queryKey: ["notif-levies", schemeId],
    queryFn: async () => {
      const { data, error } = await supabase.from("levies")
        .select("id, lot_id, amount, due_date, status, budgets!inner(scheme_id)")
        .eq("budgets.scheme_id", schemeId!).eq("status", "Pending");
      if (error) throw error;
      return (data ?? []) as unknown as { id: string; lot_id: string; amount: number; due_date: string; status: string }[];
    },
    enabled: !!schemeId,
  });

  const unbudgetedSpend = useQuery({
    queryKey: ["notif-unbudgeted", schemeId],
    queryFn: async () => {
      const since = new Date(Date.now() - 7 * 86400000).toISOString();
      const { data, error } = await supabase.from("finance_transactions")
        .select("id, description, amount, occurred_on, created_at")
        .eq("scheme_id", schemeId!).eq("direction", "out").eq("status", "Paid").is("budget_line_item_id", null).gte("created_at", since);
      if (error) throw error;
      return (data ?? []) as { id: string; description: string; amount: number; occurred_on: string; created_at: string }[];
    },
    enabled: !!schemeId && isCommittee,
  });

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

  for (const task of compliance.data ?? []) {
    const left = daysUntil(task.due_date);
    if (left > 14) continue;
    items.push({ id: `task-${task.id}`, category: "Actions", icon: FileCheck2, text: task.task_name, sub: left < 0 ? `${Math.abs(left)} days overdue` : left === 0 ? "Due today" : `Due in ${left} days`, tab: "Actions" });
  }

  for (const event of events.data ?? []) {
    const left = daysUntil(event.event_date);
    if (left < 0 || left > 14) continue;
    items.push({ id: `event-${event.id}`, category: "Upcoming event", icon: Calendar, text: event.title, sub: left === 0 ? "Today" : left === 1 ? "Tomorrow" : `In ${left} days`, tab: "Calendar" });
  }

  for (const notice of notices.data ?? []) {
    items.push({ id: `notice-${notice.id}`, category: "Message", icon: MessageSquare, text: notice.title, sub: `Posted ${relativeDay(notice.created_at)}`, tab: "Dashboard", timestamp: notice.created_at });
  }

  if (schemeSettings.data !== false) {
    const dueSoon = (duelevies.data ?? []).filter(l => daysUntil(l.due_date) <= 14);
    if (isCommittee) {
      if (dueSoon.length > 0) {
        items.push({ id: "levies-aggregate", category: "Levy due", icon: Coins, text: `${dueSoon.length} levy${dueSoon.length === 1 ? "" : "ies"} coming due`, sub: "Across the scheme", tab: "Finance" });
      }
    } else if (myLot) {
      for (const levy of dueSoon.filter(l => l.lot_id === myLot.id)) {
        const left = daysUntil(levy.due_date);
        items.push({ id: `levy-${levy.id}`, category: "Levy due", icon: Coins, text: `Levy due ${left < 0 ? `${Math.abs(left)} days ago` : left === 0 ? "today" : `in ${left} days`}`, sub: `${new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 }).format(Number(levy.amount))}`, tab: "Finance" });
      }
    }
  }

  for (const tx of unbudgetedSpend.data ?? []) {
    items.push({ id: `unbudgeted-${tx.id}`, category: "Unbudgeted spend", icon: AlertTriangle, text: tx.description, sub: `${new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 }).format(Number(tx.amount))} · not in the budget`, tab: "Finance", timestamp: tx.created_at });
  }

  const categoryOrder = ["Approval needed", "Unbudgeted spend", "Work order update", "Levy due", "Actions", "Upcoming event", "Message"];
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
    <PopoverContent align="end" className="w-80 max-h-[70vh] overflow-y-auto p-0">
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
