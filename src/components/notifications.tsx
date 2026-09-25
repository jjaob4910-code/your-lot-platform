import { Bell, Calendar, FileCheck2, MessageSquare, Vote, Wrench } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
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

type NotificationItem = { id: string; category: string; icon: typeof Bell; text: string; sub: string; tab: string };

export function NotificationsBell({ schemeId, isCommittee, myLot, goTo }: {
  schemeId?: string | undefined; isCommittee: boolean; myLot: Lot | null; goTo: (tab: string) => void;
}) {
  const pendingApprovals = useQuery({
    queryKey: ["notif-approvals", schemeId],
    queryFn: async () => {
      const { data, error } = await supabase.from("maintenance_requests")
        .select("id, title, work_order_approvals(id, lot_id, decision)")
        .eq("scheme_id", schemeId!).eq("status", "Awaiting approval");
      if (error) throw error;
      return (data ?? []) as { id: string; title: string; work_order_approvals: { id: string; lot_id: string; decision: string }[] }[];
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

  const items: NotificationItem[] = [];

  const openOrders = pendingApprovals.data ?? [];
  const myPendingVotes = myLot ? openOrders.filter(o => o.work_order_approvals.some(a => a.lot_id === myLot.id && a.decision === "Pending")) : [];
  for (const order of myPendingVotes) {
    items.push({ id: `vote-${order.id}`, category: "Approval needed", icon: Vote, text: `Vote needed: ${order.title}`, sub: "Your lot hasn't responded yet", tab: "Work orders" });
  }
  if (isCommittee) {
    const totalPending = openOrders.reduce((sum, o) => sum + o.work_order_approvals.filter(a => a.decision === "Pending").length, 0);
    if (totalPending > 0) {
      items.push({ id: "votes-aggregate", category: "Approval needed", icon: Vote, text: `${totalPending} approval vote${totalPending === 1 ? "" : "s"} still open`, sub: `across ${openOrders.length} work order${openOrders.length === 1 ? "" : "s"}`, tab: "Work orders" });
    }
  }

  for (const u of recentUpdates.data ?? []) {
    const relevant = isCommittee || (myLot && u.maintenance_requests?.submitted_by_lot_id === myLot.id);
    if (!relevant) continue;
    items.push({ id: `update-${u.id}`, category: "Work order update", icon: Wrench, text: u.maintenance_requests?.title ?? "Work order", sub: `${u.note} · ${relativeDay(u.created_at)}`, tab: "Work orders" });
  }

  for (const task of compliance.data ?? []) {
    const left = daysUntil(task.due_date);
    if (left > 14) continue;
    items.push({ id: `task-${task.id}`, category: "Compliance", icon: FileCheck2, text: task.task_name, sub: left < 0 ? `${Math.abs(left)} days overdue` : left === 0 ? "Due today" : `Due in ${left} days`, tab: "Compliance" });
  }

  for (const event of events.data ?? []) {
    const left = daysUntil(event.event_date);
    if (left < 0 || left > 14) continue;
    items.push({ id: `event-${event.id}`, category: "Upcoming event", icon: Calendar, text: event.title, sub: left === 0 ? "Today" : left === 1 ? "Tomorrow" : `In ${left} days`, tab: "Calendar" });
  }

  for (const notice of notices.data ?? []) {
    items.push({ id: `notice-${notice.id}`, category: "Message", icon: MessageSquare, text: notice.title, sub: `Posted ${relativeDay(notice.created_at)}`, tab: "Dashboard" });
  }

  const categoryOrder = ["Approval needed", "Work order update", "Compliance", "Upcoming event", "Message"];
  items.sort((a, b) => categoryOrder.indexOf(a.category) - categoryOrder.indexOf(b.category));

  return <Popover>
    <PopoverTrigger asChild>
      <Button size="icon" variant="ghost" className="relative rounded-full" aria-label="Notifications">
        <Bell/>
        {items.length > 0 && <span className="absolute right-1.5 top-1.5 size-2 rounded-full bg-destructive"/>}
      </Button>
    </PopoverTrigger>
    <PopoverContent align="end" className="w-80 max-h-[70vh] overflow-y-auto p-0">
      <div className="border-b border-border/70 px-4 py-3"><p className="text-sm font-medium">Notifications</p></div>
      {items.length === 0
        ? <p className="px-4 py-8 text-center text-[13px] text-muted-foreground">You're all caught up.</p>
        : <div className="divide-y divide-border/70">
            {items.map(item => <button key={item.id} type="button" onClick={()=>goTo(item.tab)}
              className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/40">
              <item.icon className="mt-0.5 size-4 shrink-0 text-muted-foreground"/>
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">{item.category}</p>
                <p className="mt-0.5 truncate text-[13px] font-medium">{item.text}</p>
                <p className="mt-0.5 text-[12px] text-muted-foreground">{item.sub}</p>
              </div>
            </button>)}
          </div>}
    </PopoverContent>
  </Popover>;
}
