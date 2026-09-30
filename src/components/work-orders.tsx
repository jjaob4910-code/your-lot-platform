import { useEffect, useRef, useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Check, ChevronDown, Info, MoreHorizontal, Pencil, Plus, ThumbsDown, ThumbsUp, Trash2, Undo2 } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "sonner";
import { DocPreviewTile } from "@/components/insurance";
import type { DocFile } from "@/components/documents";
import { OverdrawWarning } from "@/components/finance";
import type { BudgetFund } from "@/components/overview";

export type WorkOrderStep = {
  id: string; work_order_id: string; position: number; label: string;
  step_type: string; done_at: string | null; created_at: string;
};
export type WorkOrderQuote = {
  id: string; work_order_id: string; contractor_id: string | null; amount: number; notes: string | null;
  status: string; paid_at: string | null; finance_transaction_id: string | null; created_at: string;
  finance_transactions?: { fund_id: string } | null;
};
export type Contractor = {
  id: string; scheme_id: string; name: string; trade: string | null; phone: string | null;
  email: string | null; abn: string | null; notes: string | null; created_at: string;
};

export type WorkOrder = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  kind: string;
  priority: string;
  location: string | null;
  estimated_cost: number | null;
  approval_required: boolean;
  target_date: string | null;
  outcome: string | null;
  closed_at: string | null;
  created_at: string;
  submitted_by_lot_id: string | null;
  lot_ids: string[];
  scope_of_works: string | null;
  lots: { lot_number: number } | null;
  work_order_steps?: WorkOrderStep[];
  work_order_quotes?: WorkOrderQuote[];
};
export type WorkOrderLot = { id: string; lot_number: number; owner_name: string | null; owner_email?: string | null };

const WORK_ORDERS_FOLDER = "Work orders";
const DEFAULT_TASK_STEPS = ["Plan", "Do", "Close out"];

const niceDate = (value: string) => new Date(value.length === 10 ? `${value}T00:00:00` : value).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
const niceStamp = (value: string) => new Date(value).toLocaleString("en-AU", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
const money = (n: number) => n.toLocaleString("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 2 });
const todayIso = () => new Date().toLocaleDateString("en-CA");
const safeName = (name: string) => name.replace(/[^\w.-]/g, "_");
const kindLabel = (kind: string) => (kind === "Repair" ? "Works" : "Task");

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <section className={`soft-shadow rounded-3xl border border-border/70 bg-card ${className}`}>{children}</section>;
}

function joinAnd(items: string[]) {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

export function sortedSteps(order: WorkOrder) {
  return [...(order.work_order_steps ?? [])].sort((a, b) => a.position - b.position);
}

export function lotsLabel(order: WorkOrder, lots: WorkOrderLot[]) {
  const ids = order.lot_ids ?? [];
  if (ids.length === 0) return order.lots ? `Lot ${order.lots.lot_number}` : "Common property";
  if (lots.length > 0 && ids.length === lots.length && lots.every(l => ids.includes(l.id))) return "All lots";
  const numbers = ids.map(id => lots.find(l => l.id === id)?.lot_number).filter((n): n is number => n !== undefined).sort((a, b) => a - b);
  if (numbers.length === 0) return order.lots ? `Lot ${order.lots.lot_number}` : `${ids.length} lot${ids.length === 1 ? "" : "s"}`;
  return `Lot${numbers.length === 1 ? "" : "s"} ${numbers.join(", ")}`;
}

type WorkOrderStatus = Database["public"]["Enums"]["maintenance_status"];

/** The status other screens read, worked out from the order's steps. */
export function statusFromSteps(order: Pick<WorkOrder, "status" | "approval_required">, steps: Pick<WorkOrderStep, "step_type" | "done_at">[]): WorkOrderStatus {
  const done = steps.filter(s => s.done_at).length;
  if (steps.length > 0 && done === steps.length) return "Complete";
  if (done === 0) {
    if (order.status === "Complete" || order.status === "Closed" || order.status === "In progress") return order.approval_required ? "Awaiting approval" : "Requested";
    return order.status as WorkOrderStatus;
  }
  const approvalOpen = steps.some(s => s.step_type === "approval" && !s.done_at);
  if (order.status === "Awaiting approval" && approvalOpen) return "Awaiting approval";
  return "In progress";
}

/** Writes the status (and closed_at) that matches the given steps. Committee only. */
export async function syncWorkOrderStatus(order: WorkOrder, steps: Pick<WorkOrderStep, "step_type" | "done_at">[]) {
  const status = statusFromSteps(order, steps);
  const closed_at = status === "Complete" ? (order.closed_at ?? new Date().toISOString()) : null;
  if (status === order.status && closed_at === order.closed_at) return status;
  const { error } = await supabase.from("maintenance_requests").update({ status, closed_at }).eq("id", order.id);
  if (error) throw error;
  return status;
}

async function workOrdersFolderId(schemeId: string) {
  const { data } = await supabase.from("document_folders").select("id").eq("scheme_id", schemeId).eq("name", WORK_ORDERS_FOLDER).maybeSingle();
  if (data?.id) return data.id as string;
  const { data: made, error } = await supabase.from("document_folders")
    .insert({ scheme_id: schemeId, name: WORK_ORDERS_FOLDER, icon: "Wrench", color: "blue" }).select("id").single();
  if (error) throw error;
  return made.id as string;
}

/** Uploads files to Documents, filed under "Work orders" and linked to the order (and quote). Pass an array copied before any await. */
async function uploadWorkOrderFiles(schemeId: string, orderId: string, files: File[], quoteId: string | null = null) {
  if (files.length === 0) return;
  const folderId = await workOrdersFolderId(schemeId);
  for (const file of files) {
    const path = `${schemeId}/${crypto.randomUUID()}-${safeName(file.name)}`;
    const { error: upErr } = await supabase.storage.from("documents").upload(path, file);
    if (upErr) throw upErr;
    const { error } = await supabase.from("documents").insert({
      scheme_id: schemeId, name: file.name, category: quoteId ? "Quote" : "Work order", folder_id: folderId,
      work_order_id: orderId, work_order_quote_id: quoteId, storage_path: path, file_size: file.size, mime_type: file.type,
    });
    if (error) throw error;
  }
}

/** Owners can't write to Documents, so their attachments go to the work order's photo store. */
async function uploadOwnerPhotos(orderId: string, files: File[]) {
  for (const file of files) {
    const path = `${orderId}/${crypto.randomUUID()}-${safeName(file.name)}`;
    const { error: upErr } = await supabase.storage.from("work-orders").upload(path, file);
    if (upErr) throw upErr;
    const { error } = await supabase.from("work_order_photos").insert({ work_order_id: orderId, storage_path: path });
    if (error) throw error;
  }
}

async function openDocument(doc: DocFile) {
  if (!doc.storage_path) { toast("No file attached to this record"); return; }
  const { data, error } = await supabase.storage.from("documents").createSignedUrl(doc.storage_path, 600);
  if (error || !data) { toast("Could not open the file", { description: error?.message }); return; }
  window.open(data.signedUrl, "_blank");
}

function ConfirmDialog({ open, onOpenChange, title, body, confirmLabel, destructive, busy, onConfirm }: {
  open: boolean; onOpenChange: (v: boolean) => void; title: string; body: string; confirmLabel: string;
  destructive?: boolean; busy?: boolean; onConfirm: () => void;
}) {
  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="sm:max-w-[440px]">
      <DialogHeader><DialogTitle className="font-display tracking-[-0.02em]">{title}</DialogTitle><DialogDescription>{body}</DialogDescription></DialogHeader>
      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="ghost" className="rounded-full" onClick={() => onOpenChange(false)}>Cancel</Button>
        <Button type="button" variant={destructive ? "destructive" : "default"} className="rounded-full" disabled={busy} onClick={onConfirm}>{busy ? "Working…" : confirmLabel}</Button>
      </div>
    </DialogContent>
  </Dialog>;
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{children}</p>;
}

export function WorkOrderPill({ status }: { status: string }) {
  const tone = status === "Complete" ? "bg-primary/10 text-primary"
    : status === "Awaiting approval" ? "bg-destructive/10 text-destructive"
    : "bg-secondary text-muted-foreground";
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-medium ${tone}`}>{status}</span>;
}

function KindChip({ kind }: { kind: string }) {
  return <span className="rounded-full border border-border px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.1em] text-muted-foreground">{kindLabel(kind)}</span>;
}

function StepProgress({ steps }: { steps: WorkOrderStep[] }) {
  const done = steps.filter(s => s.done_at).length;
  const pct = steps.length ? Math.round((done / steps.length) * 100) : 0;
  return <div className="flex items-center gap-2">
    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-secondary"><div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }}/></div>
    <span className="text-[11px] tabular-nums text-muted-foreground">{done}/{steps.length}</span>
  </div>;
}

export function WorkOrderTable({ orders, lots = [], onOpen }: { orders: WorkOrder[]; lots?: WorkOrderLot[]; onOpen: (order: WorkOrder) => void }) {
  if (orders.length === 0) return <p className="px-7 py-10 text-center text-sm text-muted-foreground">Nothing logged yet.</p>;
  return <div className="divide-y divide-border/70">{orders.map(order => {
    const steps = sortedSteps(order);
    const next = steps.find(s => !s.done_at);
    const complete = steps.length > 0 && !next;
    return <button key={order.id} type="button" onClick={()=>onOpen(order)} className="flex w-full flex-wrap items-center justify-between gap-4 px-5 py-5 text-left transition-colors hover:bg-secondary/50 sm:px-7">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <KindChip kind={order.kind}/>
          <p className="text-sm font-medium">{order.title}</p>
        </div>
        <p className="mt-1 text-[12px] text-muted-foreground">
          {lotsLabel(order, lots)} · Logged {niceDate(order.created_at)}
          {order.priority !== "Normal" ? ` · ${order.priority} priority` : ""}
        </p>
        <div className="mt-3 max-w-xs">{steps.length > 0 ? <StepProgress steps={steps}/> : <p className="text-[12px] text-muted-foreground">Waiting for the committee to set up steps</p>}</div>
      </div>
      <div className="flex items-center gap-3">
        {complete ? <WorkOrderPill status="Complete"/> : next ? <span className="text-[12px] font-medium">Next: {next.label}</span> : <WorkOrderPill status={order.status}/>}
        <span className="text-[12px] text-muted-foreground">View</span>
      </div>
    </button>;
  })}
  </div>;
}

function ContractorDialog({ open, onOpenChange, schemeId, contractor, onSaved }: {
  open: boolean; onOpenChange: (v: boolean) => void; schemeId?: string | undefined; contractor: Contractor | null; onSaved: (id: string) => void;
}) {
  const [saving, setSaving] = useState(false);
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault(); e.stopPropagation();
    if (!schemeId) return;
    const form = new FormData(e.currentTarget);
    const text = (key: string) => { const v = String(form.get(key) ?? "").trim(); return v === "" ? null : v; };
    const payload = { scheme_id: schemeId, name: text("c_name") ?? "", trade: text("c_trade"), phone: text("c_phone"), email: text("c_email"), abn: text("c_abn"), notes: text("c_notes") };
    setSaving(true);
    const res = contractor
      ? await supabase.from("contractors").update(payload).eq("id", contractor.id).select("id").single()
      : await supabase.from("contractors").insert(payload).select("id").single();
    setSaving(false);
    if (res.error || !res.data) { toast("Could not save the contractor", { description: res.error?.message }); return; }
    onOpenChange(false); onSaved(res.data.id); toast(contractor ? "Contractor updated" : "Contractor added");
  };
  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-[520px]">
      <DialogHeader>
        <DialogTitle className="font-display tracking-[-0.02em]">{contractor ? "Edit contractor" : "Add a contractor"}</DialogTitle>
        <DialogDescription>Kept in your contractor list so you can reuse them for quotes.</DialogDescription>
      </DialogHeader>
      <form key={contractor?.id ?? "new"} onSubmit={submit} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2"><Label htmlFor="c_name">Name</Label><Input id="c_name" name="c_name" required defaultValue={contractor?.name ?? ""} placeholder="e.g. Smith Plumbing"/></div>
          <div className="space-y-2"><Label htmlFor="c_trade">Trade</Label><Input id="c_trade" name="c_trade" defaultValue={contractor?.trade ?? ""} placeholder="e.g. Plumber"/></div>
          <div className="space-y-2"><Label htmlFor="c_phone">Phone</Label><Input id="c_phone" name="c_phone" type="tel" defaultValue={contractor?.phone ?? ""}/></div>
          <div className="space-y-2"><Label htmlFor="c_email">Email</Label><Input id="c_email" name="c_email" type="email" defaultValue={contractor?.email ?? ""}/></div>
          <div className="space-y-2 sm:col-span-2"><Label htmlFor="c_abn">ABN</Label><Input id="c_abn" name="c_abn" defaultValue={contractor?.abn ?? ""}/></div>
        </div>
        <div className="space-y-2"><Label htmlFor="c_notes">Notes</Label><Textarea id="c_notes" name="c_notes" rows={3} defaultValue={contractor?.notes ?? ""} placeholder="Licence number, availability, anything worth remembering"/></div>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" className="rounded-full" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="submit" className="rounded-full" disabled={saving}>{saving ? "Saving…" : contractor ? "Save changes" : "Add contractor"}</Button>
        </div>
      </form>
    </DialogContent>
  </Dialog>;
}

function StepBuilder({ steps, onChange }: { steps: string[]; onChange: (steps: string[]) => void }) {
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir; if (j < 0 || j >= steps.length) return;
    const next = [...steps]; [next[i], next[j]] = [next[j]!, next[i]!]; onChange(next);
  };
  return <div className="space-y-2">
    {steps.map((label, i) => <div key={i} className="flex items-center gap-1.5">
      <span className="w-5 shrink-0 text-center text-[12px] tabular-nums text-muted-foreground">{i + 1}</span>
      <Input value={label} aria-label={`Step ${i + 1}`} onChange={e => onChange(steps.map((s, k) => (k === i ? e.target.value : s)))} className="min-w-0 flex-1"/>
      <Button type="button" variant="ghost" size="icon" className="size-8 shrink-0 rounded-full" aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)}><ArrowUp className="size-3.5"/></Button>
      <Button type="button" variant="ghost" size="icon" className="size-8 shrink-0 rounded-full" aria-label="Move down" disabled={i === steps.length - 1} onClick={() => move(i, 1)}><ArrowDown className="size-3.5"/></Button>
      <Button type="button" variant="ghost" size="icon" className="size-8 shrink-0 rounded-full text-muted-foreground hover:text-destructive" aria-label="Remove step" disabled={steps.length <= 1} onClick={() => onChange(steps.filter((_, k) => k !== i))}><Trash2 className="size-3.5"/></Button>
    </div>)}
    <Button type="button" variant="outline" size="sm" className="rounded-full" onClick={() => onChange([...steps, ""])}><Plus/> Add step</Button>
  </div>;
}

type LotScope = "all" | "common" | "selected";

function NewWorkOrderDialog({ open, onOpenChange, lots, isCommittee, myLot, schemeId, onCreated }: {
  open: boolean; onOpenChange: (v: boolean) => void; lots: WorkOrderLot[]; isCommittee: boolean; myLot: WorkOrderLot | null;
  schemeId?: string | undefined; onCreated: (result: { orderId: string; title: string; approvalLots: WorkOrderLot[] }) => void;
}) {
  const [kind, setKind] = useState<"Repair" | "Request">(isCommittee ? "Repair" : "Request");
  const [priority, setPriority] = useState("Normal");
  const [taskSteps, setTaskSteps] = useState<string[]>(DEFAULT_TASK_STEPS);
  const [scope, setScope] = useState<LotScope>("common");
  const [selected, setSelected] = useState<string[]>([]);
  const [approval, setApproval] = useState<"no" | "yes">("no");
  const [files, setFiles] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setKind(isCommittee ? "Repair" : "Request"); setPriority("Normal"); setTaskSteps(DEFAULT_TASK_STEPS);
    setScope("common"); setSelected([]); setApproval("no"); setFiles([]);
  };

  const isWorks = isCommittee && kind === "Repair";

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!schemeId) return;
    const form = new FormData(e.currentTarget);
    const text = (key: string) => { const v = String(form.get(key) ?? "").trim(); return v === "" ? null : v; };
    const picked = [...files];

    let lotIds: string[];
    if (!isCommittee) lotIds = myLot ? [myLot.id] : [];
    else if (scope === "all") lotIds = lots.map(l => l.id);
    else if (scope === "selected") lotIds = selected;
    else lotIds = [];
    if (isCommittee && scope === "selected" && lotIds.length === 0) { toast("Choose at least one lot"); return; }

    const needsApproval = isCommittee && approval === "yes";
    const approvalLots = !needsApproval ? [] : lotIds.length === 0 ? lots : lots.filter(l => lotIds.includes(l.id));
    if (needsApproval && approvalLots.length === 0) { toast("There are no lots to ask for approval"); return; }

    const orderKind = isWorks ? "Repair" : "Request";
    const stepLabels = orderKind === "Request"
      ? (isCommittee ? taskSteps.map(s => s.trim()).filter(Boolean) : DEFAULT_TASK_STEPS)
      : null;
    if (stepLabels && stepLabels.length === 0) { toast("Add at least one step"); return; }

    const title = text("title") ?? "";
    setSaving(true);
    const status = needsApproval ? "Awaiting approval" : "Requested";
    const { data, error } = await supabase.from("maintenance_requests").insert({
      scheme_id: schemeId,
      submitted_by_lot_id: lotIds[0] ?? null,
      lot_ids: lotIds,
      title,
      description: text("description") ?? "",
      scope_of_works: isWorks ? text("scope_of_works") : null,
      kind: orderKind,
      priority,
      location: text("location") ?? "",
      estimated_cost: isWorks && text("estimated_cost") ? Number(text("estimated_cost")) : null,
      approval_required: needsApproval,
      target_date: text("target_date"),
      status,
    }).select("id").single();
    if (error || !data) { setSaving(false); toast("Could not log this work order", { description: error?.message }); return; }

    const problems: string[] = [];
    const stepRows = stepLabels
      ? stepLabels.map((label, i) => ({ work_order_id: data.id, position: i, label, step_type: "custom" }))
      : [
          { label: "Scope of works", step_type: "scope" }, { label: "Quotes", step_type: "quotes" },
          ...(needsApproval ? [{ label: "Approval", step_type: "approval" }] : []), { label: "Works", step_type: "works" },
        ].map((s, i) => ({ work_order_id: data.id, position: i, ...s }));
    // Owners can't write steps; the database gives their orders the default Task steps.
    if (isCommittee) {
      const { error: stepErr } = await supabase.from("work_order_steps").insert(stepRows);
      if (stepErr) problems.push(`Steps: ${stepErr.message}`);
    }

    if (needsApproval) {
      const { error: apErr } = await supabase.from("work_order_approvals").insert(approvalLots.map(lot => ({ work_order_id: data.id, lot_id: lot.id })));
      if (apErr) problems.push(`Approvals: ${apErr.message}`);
    }
    try {
      if (isCommittee) await uploadWorkOrderFiles(schemeId, data.id, picked);
      else await uploadOwnerPhotos(data.id, picked);
    } catch (err) { problems.push(`Attachments: ${(err as Error).message}`); }
    await supabase.from("work_order_updates").insert({
      work_order_id: data.id, note: needsApproval ? `Logged. Approval requested from ${approvalLots.length} lot${approvalLots.length === 1 ? "" : "s"}.` : "Logged.",
      status_at_time: status, author_label: isCommittee ? "Committee" : "Owner",
    });
    setSaving(false);
    if (problems.length) toast("Work order logged, with some issues", { description: problems.join(" ") });
    else toast("Work order logged");
    reset(); onOpenChange(false);
    onCreated({ orderId: data.id, title, approvalLots });
  };

  const toggleLot = (id: string) => setSelected(s => (s.includes(id) ? s.filter(x => x !== id) : [...s, id]));

  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-[600px]">
      <DialogHeader>
        <DialogTitle className="font-display tracking-[-0.02em]">New work order</DialogTitle>
        <DialogDescription>{isCommittee ? "Record works for the building, or a task the committee needs to see through." : "Let the committee know about something that needs attention."}</DialogDescription>
      </DialogHeader>
      <form onSubmit={submit} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          {isCommittee && <div className="space-y-2"><Label>Type</Label>
            <Select value={kind} onValueChange={v => setKind(v as "Repair" | "Request")}><SelectTrigger><SelectValue/></SelectTrigger>
              <SelectContent>
                <SelectItem value="Repair">Works — quotes and payment</SelectItem>
                <SelectItem value="Request">Task — your own steps</SelectItem>
              </SelectContent></Select></div>}
          <div className="space-y-2"><Label>Priority</Label>
            <Select value={priority} onValueChange={setPriority}><SelectTrigger><SelectValue/></SelectTrigger>
              <SelectContent><SelectItem value="Low">Low</SelectItem><SelectItem value="Normal">Normal</SelectItem><SelectItem value="Urgent">Urgent</SelectItem></SelectContent></Select></div>
        </div>

        {isCommittee && kind === "Request" && <div className="space-y-2">
          <Label>Steps</Label>
          <p className="text-[12px] text-muted-foreground">The steps this task moves through, in order.</p>
          <StepBuilder steps={taskSteps} onChange={setTaskSteps}/>
        </div>}

        <div className="space-y-2"><Label htmlFor="title">Work order description</Label><Input id="title" name="title" placeholder="e.g. Insurance renewal, Garden maintenance" required autoFocus/></div>
        <div className="space-y-2"><Label htmlFor="description">Details</Label><Textarea id="description" name="description" placeholder="Background, what has been noticed, and anything the committee should know"/></div>
        {isWorks && <div className="space-y-2"><Label htmlFor="scope_of_works">Scope of works</Label><Textarea id="scope_of_works" name="scope_of_works" rows={4} placeholder="What the contractor needs to do, materials, access, any standards to meet"/></div>}

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2"><Label htmlFor="location">Location</Label><Input id="location" name="location" placeholder="e.g. Carpark, House 3"/></div>
          {isWorks && <div className="space-y-2"><Label htmlFor="estimated_cost">Estimated cost</Label><Input id="estimated_cost" name="estimated_cost" type="number" step="0.01" min="0" placeholder="Optional"/></div>}
          <div className="space-y-2">
            <div className="flex items-center gap-1.5">
              <Label htmlFor="target_date">Target date</Label>
              <TooltipProvider delayDuration={150}><Tooltip>
                <TooltipTrigger asChild><button type="button" aria-label="About the target date" className="text-muted-foreground hover:text-foreground"><Info className="size-3.5"/></button></TooltipTrigger>
                <TooltipContent>The date you'd ideally like this item closed out by.</TooltipContent>
              </Tooltip></TooltipProvider>
            </div>
            <Input id="target_date" name="target_date" type="date"/>
          </div>
        </div>

        {isCommittee ? <>
          <div className="space-y-2"><Label>Raised for lots</Label>
            <Select value={scope} onValueChange={v => setScope(v as LotScope)}><SelectTrigger><SelectValue/></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All lots</SelectItem>
                <SelectItem value="common">Common property</SelectItem>
                <SelectItem value="selected">Selected lots</SelectItem>
              </SelectContent></Select>
            {scope === "selected" && <div className="max-h-48 space-y-1 overflow-y-auto rounded-2xl border border-border/70 p-2">
              {lots.map(lot => <label key={lot.id} className="flex cursor-pointer items-center gap-2.5 rounded-xl px-2 py-1.5 text-[13px] hover:bg-secondary/60">
                <input type="checkbox" className="size-4 accent-primary" checked={selected.includes(lot.id)} onChange={() => toggleLot(lot.id)}/>
                <span>Lot {lot.lot_number}{lot.owner_name ? ` · ${lot.owner_name}` : ""}</span>
              </label>)}
              {lots.length === 0 && <p className="px-2 py-1.5 text-[12px] text-muted-foreground">No lots set up yet.</p>}
            </div>}
          </div>
          <div className="space-y-2"><Label>Approval requirement</Label>
            <Select value={approval} onValueChange={v => setApproval(v as "no" | "yes")}><SelectTrigger><SelectValue/></SelectTrigger>
              <SelectContent>
                <SelectItem value="no">Committee can proceed</SelectItem>
                <SelectItem value="yes">Owners of the selected lots must approve</SelectItem>
              </SelectContent></Select>
            {approval === "yes" && scope === "common" && <p className="text-[12px] text-muted-foreground">Common property: every lot owner will be asked.</p>}
          </div>
        </> : <p className="text-[12px] text-muted-foreground">{myLot ? `Raised for Lot ${myLot.lot_number}.` : "Raised for the common property."}</p>}

        <div className="space-y-2"><Label htmlFor="wo_files">Attachments</Label>
          <Input id="wo_files" type="file" multiple accept={isCommittee ? undefined : "image/*"} onChange={e => { const picked = Array.from(e.target.files ?? []); setFiles(picked); }}/>
          <p className="text-[12px] text-muted-foreground">{files.length > 0 ? `${files.length} file${files.length > 1 ? "s" : ""} ready to upload` : "Photos, plans, reports or any other documents."}</p></div>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" className="rounded-full" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="submit" className="rounded-full" disabled={saving}>{saving ? "Saving…" : "Log work order"}</Button></div>
      </form>
    </DialogContent>
  </Dialog>;
}

function NotifyOwnersDialog({ pending, schemeId, onClose, onSent }: {
  pending: { orderId: string; title: string; approvalLots: WorkOrderLot[] } | null; schemeId?: string | undefined; onClose: () => void; onSent: () => void;
}) {
  const [sending, setSending] = useState(false);
  const lotsList = [...(pending?.approvalLots ?? [])].sort((a, b) => a.lot_number - b.lot_number);
  const names = joinAnd(lotsList.map(l => String(l.lot_number)));
  const notify = async () => {
    if (!pending || !schemeId) return;
    setSending(true);
    const title = `Approval needed: ${pending.title}`;
    const message = `The committee has logged a work order, "${pending.title}", that needs your approval. Open Work orders on your dashboard to approve or decline it.`;
    const { error } = await supabase.from("notices").insert(lotsList.map(lot => ({ scheme_id: schemeId, lot_id: lot.id, title, message })));
    setSending(false);
    const emails = lotsList.map(l => l.owner_email).filter((e): e is string => !!e);
    const body = `${message}\n\nThanks,\nYour owners corporation committee`;
    const mailto = emails.length ? `mailto:?bcc=${encodeURIComponent(emails.join(","))}&subject=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}` : "";
    onSent(); onClose();
    if (error) { toast("Could not post the notices", { description: error.message }); return; }
    if (mailto) window.location.href = mailto;
    toast("Owners notified", { description: mailto ? "Your email app should also open." : "No owner email on file to open an email." });
  };
  return <Dialog open={!!pending} onOpenChange={o => { if (!o) onClose(); }}>
    <DialogContent className="sm:max-w-[440px]">
      <DialogHeader>
        <DialogTitle className="font-display tracking-[-0.02em]">Notify owners</DialogTitle>
        <DialogDescription>Notify the owners of Lot{lotsList.length === 1 ? "" : "s"} {names} about this approval?</DialogDescription>
      </DialogHeader>
      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="ghost" className="rounded-full" onClick={onClose}>Not now</Button>
        <Button type="button" className="rounded-full" disabled={sending} onClick={() => void notify()}>{sending ? "Sending…" : "Notify owners"}</Button>
      </div>
    </DialogContent>
  </Dialog>;
}

function ContractorsList({ contractors, orders, isCommittee, schemeId, onChanged }: {
  contractors: Contractor[]; orders: WorkOrder[]; isCommittee: boolean; schemeId?: string | undefined; onChanged: () => void;
}) {
  const [editing, setEditing] = useState<Contractor | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [removing, setRemoving] = useState<Contractor | null>(null);
  const [busy, setBusy] = useState(false);
  const quotes = orders.flatMap(o => o.work_order_quotes ?? []);

  const remove = async () => {
    if (!removing) return;
    setBusy(true);
    const { error } = await supabase.from("contractors").delete().eq("id", removing.id);
    setBusy(false);
    if (error) { toast("Could not remove the contractor", { description: error.message }); return; }
    setRemoving(null); onChanged(); toast("Contractor removed");
  };

  return <div className="mt-10">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 className="font-display text-xl tracking-[-0.02em]">Contractor list</h2>
        <p className="mt-1 text-[13px] text-muted-foreground">Trades the building has used or asked for quotes.</p>
      </div>
      {isCommittee && <Button variant="outline" className="rounded-full" onClick={() => { setEditing(null); setFormOpen(true); }}><Plus/> Add contractor</Button>}
    </div>
    <Card className="mt-4 overflow-hidden">
      <div className="divide-y divide-border/70">
        {contractors.map(c => {
          const theirs = quotes.filter(q => q.contractor_id === c.id);
          const jobs = theirs.filter(q => q.status === "Accepted").length;
          return <div key={c.id} className="flex flex-col gap-2 px-5 py-4 sm:flex-row sm:items-center sm:gap-6 sm:px-7">
            <div className="min-w-0 sm:w-56 sm:shrink-0">
              <p className="truncate text-sm font-medium">{c.name}</p>
              <p className="text-[12px] text-muted-foreground">{c.trade ?? "Trade not recorded"}{c.abn ? ` · ABN ${c.abn}` : ""}</p>
            </div>
            <div className="min-w-0 flex-1 break-words text-[12px] text-muted-foreground">
              {[c.phone, c.email].filter(Boolean).length > 0
                ? <p className="flex flex-wrap gap-x-4 gap-y-0.5">
                    {c.phone && <a className="hover:text-foreground" href={`tel:${c.phone}`}>{c.phone}</a>}
                    {c.email && <a className="hover:text-foreground" href={`mailto:${c.email}`}>{c.email}</a>}
                  </p>
                : <p>No contact details</p>}
              {c.notes && <p className="mt-0.5 truncate" title={c.notes}>{c.notes}</p>}
            </div>
            <p className="shrink-0 text-[12px] text-muted-foreground sm:w-28 sm:text-right">{theirs.length} quote{theirs.length === 1 ? "" : "s"} · {jobs} job{jobs === 1 ? "" : "s"}</p>
            {isCommittee && <div className="flex shrink-0 sm:justify-end">
              <Button variant="ghost" size="icon" className="size-8 rounded-full" aria-label={`Edit ${c.name}`} onClick={() => { setEditing(c); setFormOpen(true); }}><Pencil className="size-3.5"/></Button>
              <Button variant="ghost" size="icon" className="size-8 rounded-full text-muted-foreground hover:text-destructive" aria-label={`Remove ${c.name}`} onClick={() => setRemoving(c)}><Trash2 className="size-3.5"/></Button>
            </div>}
          </div>;
        })}
        {contractors.length === 0 && <p className="px-7 py-8 text-center text-sm text-muted-foreground">No contractors yet.{isCommittee ? " Add one here or while recording a quote." : ""}</p>}
      </div>
    </Card>
    <ContractorDialog open={formOpen} onOpenChange={setFormOpen} schemeId={schemeId} contractor={editing} onSaved={() => onChanged()}/>
    <ConfirmDialog open={!!removing} onOpenChange={o => { if (!o) setRemoving(null); }} title="Remove contractor"
      body={`Remove ${removing?.name ?? "this contractor"} from the list? Their past quotes stay on the work orders.`} confirmLabel="Remove" destructive busy={busy} onConfirm={() => void remove()}/>
  </div>;
}

export function WorkOrdersSection({ orders, lots, isCommittee, myLot, schemeId, documents = [], funds = [], contractors = [], claims = [], fundBalances, onChanged }: {
  orders: WorkOrder[]; lots: WorkOrderLot[]; isCommittee: boolean; myLot: WorkOrderLot | null;
  schemeId?: string | undefined;
  documents?: DocFile[]; funds?: BudgetFund[]; contractors?: Contractor[]; claims?: LinkedClaim[];
  /** Recorded fund balances, only when the viewer wants overdrawn warnings. */
  fundBalances?: Record<string, number> | undefined; onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [viewing, setViewing] = useState<string | null>(null);
  const [showCompleted, setShowCompleted] = useState(false);
  const [pendingNotify, setPendingNotify] = useState<{ orderId: string; title: string; approvalLots: WorkOrderLot[] } | null>(null);

  const current = viewing ? orders.find(o => o.id === viewing) ?? null : null;
  const isDone = (o: WorkOrder) => {
    const steps = o.work_order_steps ?? [];
    return steps.length > 0 ? steps.every(s => s.done_at) : o.status === "Complete" || o.status === "Closed";
  };
  const active = orders.filter(o => !isDone(o));
  const completed = orders.filter(isDone);

  return <div>
    <PageHead eyebrow="Your property" title="Work orders" blurb="Works move from scope to quotes, approval and completion, and only reach Finance once they're paid. Tasks follow the steps you set."
      action={<Button className="rounded-full" onClick={() => setOpen(true)}><Plus/> New work order</Button>}/>

    <NewWorkOrderDialog open={open} onOpenChange={setOpen} lots={lots} isCommittee={isCommittee} myLot={myLot} schemeId={schemeId}
      onCreated={result => { onChanged(); if (result.approvalLots.length > 0) setPendingNotify(result); }}/>
    <NotifyOwnersDialog pending={pendingNotify} schemeId={schemeId} onClose={() => setPendingNotify(null)} onSent={onChanged}/>

    <Card className="mt-10 overflow-hidden">
      <div className="border-b border-border/70 px-5 py-4 sm:px-7"><p className="text-sm font-medium">Active <span className="text-muted-foreground">· {active.length}</span></p></div>
      <WorkOrderTable orders={active} lots={lots} onOpen={o => setViewing(o.id)}/>
    </Card>

    <Card className="mt-4 overflow-hidden">
      <button type="button" onClick={() => setShowCompleted(v => !v)} aria-expanded={showCompleted}
        className="flex w-full items-center justify-between px-5 py-4 text-left hover:bg-secondary/50 sm:px-7">
        <p className="text-sm font-medium">Completed <span className="text-muted-foreground">· {completed.length}</span></p>
        <ChevronDown className={`size-4 text-muted-foreground transition-transform ${showCompleted ? "rotate-180" : ""}`}/>
      </button>
      {showCompleted && <div className="border-t border-border/70"><WorkOrderTable orders={completed} lots={lots} onOpen={o => setViewing(o.id)}/></div>}
    </Card>

    <ContractorsList contractors={contractors} orders={orders} isCommittee={isCommittee} schemeId={schemeId} onChanged={onChanged}/>

    <Dialog open={!!current} onOpenChange={o => { if (!o) setViewing(null); }}>
      <DialogContent className="h-[100dvh] max-h-[100dvh] w-screen max-w-none overflow-y-auto overflow-x-hidden rounded-none p-4 pb-0 sm:h-auto sm:max-h-[90vh] sm:w-[calc(100vw-2rem)] sm:max-w-3xl sm:rounded-lg sm:p-6">
        {current && <WorkOrderDetail order={current} lots={lots} isCommittee={isCommittee} myLot={myLot} schemeId={schemeId}
          documents={documents} funds={funds} contractors={contractors} claims={claims.filter(c => c.work_order_id === current.id)} fundBalances={fundBalances} onChanged={onChanged} onDeleted={() => setViewing(null)}/>}
      </DialogContent>
    </Dialog>
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

type Approval = { id: string; lot_id: string; decision: string; comment: string | null; decided_at: string | null };
type Update = { id: string; note: string; status_at_time: string | null; author_label: string | null; created_at: string };

// The step list doubles as navigation: tapping a step jumps to the part of the
// work order where it's done. A timeline on phones, a row of chips on wider screens.
function StepChain({ steps, onJump }: { steps: WorkOrderStep[]; onJump: (step: WorkOrderStep) => void }) {
  const currentId = steps.find(s => !s.done_at)?.id;
  const allDone = steps.length > 0 && !currentId;
  const doneCount = steps.filter(s => s.done_at).length;
  const items = [...steps.map(s => ({ step: s as WorkOrderStep | null, id: s.id, label: s.label, doneAt: s.done_at, state: s.done_at ? "done" : s.id === currentId ? "current" : "upcoming" })),
    { step: null, id: "complete", label: "Complete", doneAt: null, state: allDone ? "done" : "upcoming" }];
  return <div>
    <div className="flex items-center justify-between gap-3 text-[12px]">
      <span className="font-medium">{allDone ? "All steps done" : `Step ${doneCount + 1} of ${steps.length}`}</span>
      <span className="text-muted-foreground">{doneCount}/{steps.length} done</span>
    </div>
    <div className="mt-2 flex gap-1" aria-hidden>{steps.map(s => <span key={s.id} className={`h-1.5 flex-1 rounded-full ${s.done_at ? "bg-primary" : s.id === currentId ? "bg-primary/40" : "bg-border"}`}/>)}</div>
    <ol className="mt-3 space-y-0.5 sm:flex sm:flex-wrap sm:items-center sm:gap-1.5 sm:space-y-0">
      {items.map((item, i) => <li key={item.id}>
        <button type="button" disabled={!item.step} onClick={() => item.step && onJump(item.step)}
          aria-current={item.state === "current" ? "step" : undefined}
          className={`flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left text-[13px] transition hover:bg-background/70 disabled:hover:bg-transparent
            sm:w-auto sm:gap-1.5 sm:rounded-full sm:border sm:px-3 sm:py-1.5 sm:text-[12px] sm:font-medium ${
            item.state === "done" ? "sm:border-primary/30 sm:bg-primary/10 sm:text-primary"
            : item.state === "current" ? "font-medium sm:border-foreground sm:bg-foreground sm:text-background sm:hover:bg-foreground/90"
            : "text-muted-foreground sm:border-border"}`}>
          <span className={`grid size-6 shrink-0 place-items-center rounded-full text-[11px] tabular-nums sm:size-auto sm:bg-transparent sm:text-inherit ${
            item.state === "done" ? "bg-primary text-primary-foreground" : item.state === "current" ? "bg-foreground text-background" : "border border-border"}`}>
            {item.state === "done" ? <Check className="size-3.5"/> : i + 1}
          </span>
          <span className="min-w-0 flex-1 truncate sm:flex-none">{item.label}</span>
          <span className="shrink-0 text-[11px] font-normal text-muted-foreground sm:hidden">
            {item.state === "done" && item.doneAt ? niceDate(item.doneAt) : item.state === "current" ? "Now" : ""}
          </span>
        </button>
      </li>)}
    </ol>
  </div>;
}

function MarkPaidDialog({ quote, order, contractorName, funds, schemeId, fundBalances, onClose, onDone }: {
  quote: WorkOrderQuote | null; order: WorkOrder; contractorName: string | null; funds: BudgetFund[]; schemeId?: string | undefined;
  fundBalances?: Record<string, number> | undefined; onClose: () => void; onDone: () => void;
}) {
  const [fundId, setFundId] = useState<string>("");
  const [date, setDate] = useState(todayIso());
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (quote) { setFundId(funds[0]?.id ?? ""); setDate(todayIso()); } }, [quote, funds]);

  const confirm = async () => {
    if (!quote || !schemeId || !fundId) return;
    setSaving(true);
    const { data, error } = await supabase.from("finance_transactions").insert({
      scheme_id: schemeId, direction: "out", status: "Paid", amount: Number(quote.amount), occurred_on: date, fund_id: fundId,
      category: "Repairs and maintenance", description: `Work order — ${order.title}`, supplier: contractorName, work_order_id: order.id,
    }).select("id").single();
    if (error || !data) { setSaving(false); toast("Could not record the payment", { description: error?.message }); return; }
    const { error: qErr } = await supabase.from("work_order_quotes").update({ paid_at: date, finance_transaction_id: data.id }).eq("id", quote.id);
    await supabase.from("work_order_updates").insert({ work_order_id: order.id, note: `Paid ${money(Number(quote.amount))}${contractorName ? ` to ${contractorName}` : ""}.`, status_at_time: order.status, author_label: "Committee" });
    setSaving(false);
    onClose(); onDone();
    if (qErr) toast("Payment recorded in Finance, but the quote could not be updated", { description: qErr.message });
    else toast("Marked paid", { description: "Recorded in Finance." });
  };

  return <Dialog open={!!quote} onOpenChange={o => { if (!o) onClose(); }}>
    <DialogContent className="sm:max-w-[440px]">
      <DialogHeader>
        <DialogTitle className="font-display tracking-[-0.02em]">Mark paid</DialogTitle>
        <DialogDescription>Records {quote ? money(Number(quote.amount)) : "this amount"}{contractorName ? ` to ${contractorName}` : ""} as money out in Finance.</DialogDescription>
      </DialogHeader>
      <div className="space-y-4">
        <div className="space-y-2"><Label>Paid from</Label>
          <Select value={fundId} onValueChange={setFundId}><SelectTrigger><SelectValue placeholder="Choose a fund"/></SelectTrigger>
            <SelectContent>{funds.map(f => <SelectItem key={f.id} value={f.id}>{f.name} fund</SelectItem>)}</SelectContent></Select></div>
        <div className="space-y-2"><Label htmlFor="paid_on">Payment date</Label><Input id="paid_on" type="date" value={date} onChange={e => setDate(e.target.value)}/></div>
        {quote && fundBalances && fundId && (fundBalances[fundId] ?? 0) - Number(quote.amount) < 0 &&
          <OverdrawWarning fundName={funds.find(f => f.id === fundId)?.name ?? "chosen"} after={(fundBalances[fundId] ?? 0) - Number(quote.amount)}/>}
      </div>
      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="ghost" className="rounded-full" onClick={onClose}>Cancel</Button>
        <Button type="button" className="rounded-full" disabled={saving || !fundId || !date} onClick={() => void confirm()}>{saving ? "Saving…" : "Confirm payment"}</Button>
      </div>
    </DialogContent>
  </Dialog>;
}

function AddQuoteForm({ order, contractors, schemeId, onAddContractor, pendingContractorId, onSaved, onCancel }: {
  order: WorkOrder; contractors: Contractor[]; schemeId?: string | undefined; onAddContractor: () => void;
  pendingContractorId: string | null; onSaved: () => void; onCancel: () => void;
}) {
  const [contractorId, setContractorId] = useState<string>("");
  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (pendingContractorId) setContractorId(pendingContractorId); }, [pendingContractorId]);

  const save = async () => {
    if (!schemeId || !amount) return;
    const picked = [...files];
    setSaving(true);
    const { data, error } = await supabase.from("work_order_quotes").insert({
      work_order_id: order.id, contractor_id: contractorId || null, amount: Number(amount), notes: notes.trim() || null,
    }).select("id").single();
    if (error || !data) { setSaving(false); toast("Could not add the quote", { description: error?.message }); return; }
    let fileError: string | null = null;
    try { await uploadWorkOrderFiles(schemeId, order.id, picked, data.id); } catch (err) { fileError = (err as Error).message; }
    setSaving(false);
    if (fileError) toast("Quote added, but the file could not be attached", { description: fileError });
    else toast("Quote added");
    onSaved();
  };

  return <div className="space-y-3 rounded-2xl border border-border/70 p-4">
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="space-y-2"><Label>Contractor</Label>
        <Select value={contractorId} onValueChange={v => { if (v === "__new") onAddContractor(); else setContractorId(v); }}>
          <SelectTrigger><SelectValue placeholder="Choose a contractor"/></SelectTrigger>
          <SelectContent>
            {contractors.map(c => <SelectItem key={c.id} value={c.id}>{c.name}{c.trade ? ` · ${c.trade}` : ""}</SelectItem>)}
            <SelectItem value="__new">+ Add new contractor</SelectItem>
          </SelectContent></Select></div>
      <div className="space-y-2"><Label htmlFor="q_amount">Amount</Label><Input id="q_amount" type="number" step="0.01" min="0" value={amount} onChange={e => setAmount(e.target.value)} placeholder="Including GST"/></div>
    </div>
    <div className="space-y-2"><Label htmlFor="q_notes">Notes</Label><Textarea id="q_notes" rows={2} value={notes} onChange={e => setNotes(e.target.value)} placeholder="What's included, how long it's valid, start date"/></div>
    <div className="space-y-2"><Label htmlFor="q_file">Quote document (optional)</Label><Input id="q_file" type="file" multiple onChange={e => setFiles(Array.from(e.target.files ?? []))}/></div>
    <div className="flex justify-end gap-2">
      <Button type="button" variant="ghost" size="sm" className="rounded-full" onClick={onCancel}>Cancel</Button>
      <Button type="button" size="sm" className="rounded-full" disabled={saving || !amount} onClick={() => void save()}>{saving ? "Saving…" : "Add quote"}</Button>
    </div>
  </div>;
}

export type LinkedClaim = { id: string; title: string; status: string; work_order_id: string | null };

export function WorkOrderDetail({ order, lots, isCommittee, myLot, schemeId, documents, funds, contractors, claims = [], fundBalances, onChanged, onDeleted }: {
  order: WorkOrder; lots: WorkOrderLot[]; isCommittee: boolean; myLot: WorkOrderLot | null; schemeId?: string | undefined;
  documents: DocFile[]; funds: BudgetFund[]; contractors: Contractor[]; claims?: LinkedClaim[]; fundBalances?: Record<string, number> | undefined;
  onChanged: () => void; onDeleted: () => void;
}) {
  const queryClient = useQueryClient();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [editingScope, setEditingScope] = useState(false);
  const [scopeText, setScopeText] = useState(order.scope_of_works ?? "");
  const [addingQuote, setAddingQuote] = useState(false);
  const [contractorOpen, setContractorOpen] = useState(false);
  const [newContractorId, setNewContractorId] = useState<string | null>(null);
  const [payingQuote, setPayingQuote] = useState<WorkOrderQuote | null>(null);
  const [confirmClose, setConfirmClose] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [newStep, setNewStep] = useState("");
  const [renaming, setRenaming] = useState<{ id: string; label: string } | null>(null);

  const author = isCommittee ? "Committee" : "Owner";
  const steps = sortedSteps(order);
  const current = steps.find(s => !s.done_at) ?? null;
  const isOpen = !!current || steps.length === 0;
  const quotes = [...(order.work_order_quotes ?? [])].sort((a, b) => Number(a.amount) - Number(b.amount));
  const lowestId = quotes.length > 1 ? quotes[0]!.id : null;
  const accepted = quotes.find(q => q.status === "Accepted") ?? null;
  const stepOf = (type: string) => steps.find(s => s.step_type === type) ?? null;
  const orderDocs = documents.filter(d => d.work_order_id === order.id);
  const contractorName = (id: string | null) => contractors.find(c => c.id === id)?.name ?? null;

  const photos = useQuery({
    queryKey: ["wo-photos", order.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("work_order_photos").select("*").eq("work_order_id", order.id).order("created_at");
      if (error) throw error;
      const rows = (data ?? []) as { id: string; storage_path: string }[];
      const signed = await Promise.all(rows.map(async row => {
        const { data: url } = await supabase.storage.from("work-orders").createSignedUrl(row.storage_path, 3600);
        return { id: row.id, storage_path: row.storage_path, url: url?.signedUrl ?? "" };
      }));
      return signed;
    },
  });
  const approvals = useQuery({
    queryKey: ["wo-approvals", order.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("work_order_approvals").select("*").eq("work_order_id", order.id);
      if (error) throw error;
      return (data ?? []) as Approval[];
    },
  });
  const updates = useQuery({
    queryKey: ["wo-updates", order.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("work_order_updates").select("*").eq("work_order_id", order.id).order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Update[];
    },
  });

  const refreshAll = () => {
    ["wo-photos", "wo-approvals", "wo-updates"].forEach(key => { void queryClient.invalidateQueries({ queryKey: [key, order.id] }); });
    onChanged();
  };

  const logUpdate = async (text: string, status: string | null) => {
    await supabase.from("work_order_updates").insert({ work_order_id: order.id, note: text, status_at_time: status, author_label: author });
  };

  /** Ticks (or unticks) steps, then brings the order's status into line. */
  const setStepsDone = async (ids: string[], done: boolean, noteText: string, successText: string) => {
    if (ids.length === 0) return;
    setBusy(true);
    try {
      const stamp = done ? new Date().toISOString() : null;
      const { error } = await supabase.from("work_order_steps").update({ done_at: stamp }).in("id", ids);
      if (error) throw error;
      const next = steps.map(s => (ids.includes(s.id) ? { ...s, done_at: stamp } : s));
      const status = await syncWorkOrderStatus(order, next);
      await logUpdate(noteText, status);
      refreshAll(); toast(successText);
    } catch (err) {
      toast("Could not update the work order", { description: (err as Error).message });
    } finally { setBusy(false); }
  };

  const tickStep = (step: WorkOrderStep | null, text: string) => { if (step && !step.done_at) void setStepsDone([step.id], true, `${step.label} complete.`, text); };

  const saveScope = async () => {
    const { error } = await supabase.from("maintenance_requests").update({ scope_of_works: scopeText.trim() || null }).eq("id", order.id);
    if (error) { toast("Could not save the scope", { description: error.message }); return; }
    setEditingScope(false); onChanged(); toast("Scope of works saved");
  };

  const awaitingApproval = steps.some(st => st.step_type === "approval" && !st.done_at);
  const acceptQuote = async (quote: WorkOrderQuote) => {
    setBusy(true);
    try {
      const { error: e1 } = await supabase.from("work_order_quotes").update({ status: "Declined" }).eq("work_order_id", order.id).neq("id", quote.id);
      if (e1) throw e1;
      const { error: e2 } = await supabase.from("work_order_quotes").update({ status: "Accepted" }).eq("id", quote.id);
      if (e2) throw e2;
      const { error: e3 } = await supabase.from("maintenance_requests").update({ estimated_cost: Number(quote.amount) }).eq("id", order.id);
      if (e3) throw e3;
      // Accepting a quote settles the scope too, so both steps close together.
      const toClose = steps.filter(st => (st.step_type === "scope" || st.step_type === "quotes") && !st.done_at);
      let status = order.status;
      if (toClose.length) {
        const stamp = new Date().toISOString();
        const { error: e4 } = await supabase.from("work_order_steps").update({ done_at: stamp }).in("id", toClose.map(st => st.id));
        if (e4) throw e4;
        status = await syncWorkOrderStatus(order, steps.map(st => (toClose.some(c => c.id === st.id) ? { ...st, done_at: stamp } : st)));
      }
      const who = contractorName(quote.contractor_id);
      await logUpdate(`Accepted the quote${who ? ` from ${who}` : ""} for ${money(Number(quote.amount))}.`, status);
      refreshAll(); toast("Quote accepted");
    } catch (err) {
      toast("Could not accept the quote", { description: (err as Error).message });
    } finally { setBusy(false); }
  };

  const removeQuote = async (quote: WorkOrderQuote) => {
    for (const doc of documents.filter(d => d.work_order_quote_id === quote.id)) if (doc.storage_path) await supabase.storage.from("documents").remove([doc.storage_path]);
    const { error } = await supabase.from("work_order_quotes").delete().eq("id", quote.id);
    if (error) { toast("Could not remove the quote", { description: error.message }); return; }
    refreshAll(); toast("Quote removed");
  };

  const decide = async (row: Approval, decision: "Approved" | "Declined") => {
    const { error } = await supabase.from("work_order_approvals").update({ decision, decided_at: new Date().toISOString() }).eq("id", row.id);
    if (error) { toast("Could not record that", { description: error.message }); return; }
    // The database moves the order on once a majority approves; just refresh.
    refreshAll(); toast("Decision recorded");
  };

  const addNote = async () => {
    if (!note.trim()) return;
    await logUpdate(note.trim(), order.status);
    setNote(""); refreshAll(); toast("Update added");
  };

  const addFiles = async (list: FileList | null) => {
    if (!list || list.length === 0 || !schemeId) return;
    const picked = Array.from(list); // copy before any await: the FileList empties when the input resets
    setUploading(true);
    try { await uploadWorkOrderFiles(schemeId, order.id, picked); onChanged(); toast("Filed under Work orders in your documents"); }
    catch (err) { toast("Could not attach that", { description: (err as Error).message }); }
    finally { setUploading(false); }
  };

  const removeDoc = async (doc: DocFile) => {
    if (doc.storage_path) await supabase.storage.from("documents").remove([doc.storage_path]);
    const { error } = await supabase.from("documents").delete().eq("id", doc.id);
    if (error) { toast("Could not remove it", { description: error.message }); return; }
    onChanged(); toast("Removed");
  };

  const removePhoto = async (photo: { id: string; storage_path: string }) => {
    await supabase.storage.from("work-orders").remove([photo.storage_path]);
    const { error } = await supabase.from("work_order_photos").delete().eq("id", photo.id);
    if (error) { toast("Could not remove it", { description: error.message }); return; }
    refreshAll(); toast("Removed");
  };

  const setupSteps = async () => {
    const rows = (order.kind === "Repair"
      ? [{ label: "Scope of works", step_type: "scope" }, { label: "Quotes", step_type: "quotes" }, ...(order.approval_required ? [{ label: "Approval", step_type: "approval" }] : []), { label: "Works", step_type: "works" }]
      : DEFAULT_TASK_STEPS.map(label => ({ label, step_type: "custom" }))).map((s, i) => ({ work_order_id: order.id, position: i, ...s }));
    const { error } = await supabase.from("work_order_steps").insert(rows);
    if (error) { toast("Could not set up the steps", { description: error.message }); return; }
    onChanged(); toast("Steps set up");
  };

  const addStep = async () => {
    const label = newStep.trim(); if (!label) return;
    const position = steps.length ? Math.max(...steps.map(s => s.position)) + 1 : 0;
    const { error } = await supabase.from("work_order_steps").insert({ work_order_id: order.id, position, label, step_type: "custom" });
    if (error) { toast("Could not add the step", { description: error.message }); return; }
    setNewStep(""); onChanged(); toast("Step added");
  };

  const renameStep = async () => {
    if (!renaming || !renaming.label.trim()) return;
    const { error } = await supabase.from("work_order_steps").update({ label: renaming.label.trim() }).eq("id", renaming.id);
    if (error) { toast("Could not rename the step", { description: error.message }); return; }
    setRenaming(null); onChanged();
  };

  const removeStep = async (step: WorkOrderStep) => {
    const { error } = await supabase.from("work_order_steps").delete().eq("id", step.id);
    if (error) { toast("Could not remove the step", { description: error.message }); return; }
    try { await syncWorkOrderStatus(order, steps.filter(s => s.id !== step.id)); } catch { /* status catches up on the next change */ }
    onChanged(); toast("Step removed");
  };

  const closeOrder = async () => {
    const open = steps.filter(s => !s.done_at).map(s => s.id);
    if (open.length === 0 && steps.length > 0) { setConfirmClose(false); return; }
    if (steps.length === 0) {
      setBusy(true);
      const { error } = await supabase.from("maintenance_requests").update({ status: "Complete", closed_at: new Date().toISOString() }).eq("id", order.id);
      setBusy(false);
      if (error) { toast("Could not close it", { description: error.message }); return; }
      await logUpdate("Closed by the committee.", "Complete");
      setConfirmClose(false); refreshAll(); toast("Work order closed"); return;
    }
    await setStepsDone(open, true, "Closed by the committee.", "Work order closed");
    setConfirmClose(false);
  };

  const deleteOrder = async () => {
    setBusy(true);
    const paths = orderDocs.map(d => d.storage_path).filter((p): p is string => !!p);
    if (paths.length) await supabase.storage.from("documents").remove(paths);
    const { data: legacy } = await supabase.from("work_order_photos").select("storage_path").eq("work_order_id", order.id);
    const photoPaths = ((legacy ?? []) as { storage_path: string }[]).map(p => p.storage_path);
    if (photoPaths.length) await supabase.storage.from("work-orders").remove(photoPaths);
    const { error } = await supabase.from("maintenance_requests").delete().eq("id", order.id);
    setBusy(false);
    if (error) { toast("Could not delete the work order", { description: error.message }); return; }
    setConfirmDelete(false); onDeleted(); onChanged(); toast("Work order deleted");
  };

  const rows = approvals.data ?? [];
  const approvedCount = rows.filter(r => r.decision === "Approved").length;
  const declinedCount = rows.filter(r => r.decision === "Declined").length;
  const majorityNeeded = rows.length > 0 ? Math.floor(rows.length / 2) + 1 : 0;
  const lastDone = [...steps].reverse().find(s => s.done_at) ?? null;
  const canUndoLast = isCommittee && lastDone && steps.indexOf(lastDone) === (current ? steps.indexOf(current) - 1 : steps.length - 1);
  const scopeStep = stepOf("scope"), quotesStep = stepOf("quotes"), approvalStep = stepOf("approval"), worksStep = stepOf("works");

  const jumpTo = (section: string) => document.getElementById(`wo-sec-${section}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  const jumpToStep = (step: WorkOrderStep) => jumpTo(
    ["scope", "quotes", "approval", "works"].includes(step.step_type) ? step.step_type
    : order.kind === "Request" && isCommittee && isOpen ? "steps" : "notes");
  // The single thing to do next, pinned to the bottom on phones.
  const myPendingVote = !!myLot && !approvalStep?.done_at && rows.some(r => r.lot_id === myLot.id && r.decision === "Pending");
  const nextAction: { label: string; run: () => void } | null = (() => {
    if (myPendingVote && !isCommittee) return { label: "Vote on this work order", run: () => jumpTo("approval") };
    if (!isCommittee) return null;
    if (steps.length === 0) return { label: "Set up steps", run: () => void setupSteps() };
    if (accepted && !accepted.paid_at && !awaitingApproval && (!current || current.step_type === "works")) return { label: "Mark paid", run: () => setPayingQuote(accepted) };
    if (!current) return null;
    switch (current.step_type) {
      case "scope": return { label: "Mark scope complete", run: () => tickStep(scopeStep, "Scope marked complete") };
      case "quotes": return accepted ? null : { label: "Add a quote", run: () => { setAddingQuote(true); jumpTo("quotes"); } };
      case "approval": return { label: "Review owner approval", run: () => jumpTo("approval") };
      case "works": return { label: "Mark works complete", run: () => tickStep(worksStep, "Works marked complete") };
      default: return { label: `Mark "${current.label}" done`, run: () => tickStep(current, `${current.label} done`) };
    }
  })();

  return <div className="min-w-0">
    <DialogHeader className="pr-8 text-left">
      <div className="flex flex-wrap items-center gap-2"><KindChip kind={order.kind}/>{order.priority !== "Normal" && <span className="text-[11px] font-medium text-destructive">{order.priority} priority</span>}</div>
      <DialogTitle className="font-display tracking-[-0.02em]">{order.title}</DialogTitle>
      <DialogDescription>{[lotsLabel(order, lots), order.location, order.target_date ? `Target ${niceDate(order.target_date)}` : null, `Logged ${niceDate(order.created_at)}`].filter(Boolean).join(" · ")}</DialogDescription>
    </DialogHeader>

    <div className="mt-5 space-y-7">
      <div className="rounded-2xl border border-border/70 bg-secondary/40 p-4">
        {steps.length > 0 ? <StepChain steps={steps} onJump={jumpToStep}/> : <p className="text-[13px] text-muted-foreground">No steps yet.</p>}
      </div>

      {claims.map(c => <p key={c.id} className="rounded-xl bg-secondary px-4 py-3 text-[13px]"><span className="font-medium">Insurance claim:</span> {c.title} ({c.status})</p>)}
      {order.description && <div><SectionLabel>Details</SectionLabel><p className="mt-2 whitespace-pre-line text-[13px] leading-6">{order.description}</p></div>}

      {order.kind === "Request" && isCommittee && isOpen && steps.length > 0 && <div id="wo-sec-steps" className="scroll-mt-4">
        <SectionLabel>Steps</SectionLabel>
        <div className="mt-2 divide-y divide-border/70 rounded-2xl border border-border/70">
          {steps.map(step => <div key={step.id} className="flex items-center gap-2 px-3 py-2">
            {renaming?.id === step.id
              ? <><Input value={renaming.label} onChange={e => setRenaming({ id: step.id, label: e.target.value })} className="h-8 min-w-0 flex-1"/>
                  <Button size="sm" className="rounded-full" onClick={() => void renameStep()}>Save</Button>
                  <Button size="sm" variant="ghost" className="rounded-full" onClick={() => setRenaming(null)}>Cancel</Button></>
              : <><span className={`min-w-0 flex-1 truncate text-[13px] ${step.done_at ? "text-muted-foreground line-through" : ""}`}>{step.label}</span>
                  <Button variant="ghost" size="icon" className="size-8 rounded-full" aria-label={`Rename ${step.label}`} onClick={() => setRenaming({ id: step.id, label: step.label })}><Pencil className="size-3.5"/></Button>
                  {!step.done_at && steps.length > 1 && <Button variant="ghost" size="icon" className="size-8 rounded-full text-muted-foreground hover:text-destructive" aria-label={`Remove ${step.label}`} onClick={() => void removeStep(step)}><Trash2 className="size-3.5"/></Button>}</>}
          </div>)}
        </div>
        <div className="mt-2 flex gap-2">
          <Input value={newStep} onChange={e => setNewStep(e.target.value)} placeholder="Add a step" className="min-w-0 flex-1" onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); void addStep(); } }}/>
          <Button size="sm" variant="outline" className="h-9 rounded-full" disabled={!newStep.trim()} onClick={() => void addStep()}><Plus/> Add</Button>
        </div>
      </div>}

      {order.kind === "Repair" && <div id="wo-sec-scope" className="scroll-mt-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <SectionLabel>Scope of works</SectionLabel>
          {isCommittee && !editingScope && <Button size="sm" variant="ghost" className="h-7 rounded-full px-3 text-[12px]" onClick={() => { setScopeText(order.scope_of_works ?? ""); setEditingScope(true); }}><Pencil className="size-3.5"/> Edit</Button>}
        </div>
        {editingScope
          ? <div className="mt-2 space-y-2">
              <Textarea rows={5} value={scopeText} onChange={e => setScopeText(e.target.value)} placeholder="What the contractor needs to do, materials, access, any standards to meet"/>
              <div className="flex justify-end gap-2"><Button size="sm" variant="ghost" className="rounded-full" onClick={() => setEditingScope(false)}>Cancel</Button><Button size="sm" className="rounded-full" onClick={() => void saveScope()}>Save scope</Button></div>
            </div>
          : <p className="mt-2 whitespace-pre-line text-[13px] leading-6">{order.scope_of_works || <span className="text-muted-foreground">Not written yet.</span>}</p>}
        {isCommittee && scopeStep && !scopeStep.done_at && !editingScope && <Button size="sm" className="mt-3 rounded-full" disabled={busy} onClick={() => tickStep(scopeStep, "Scope marked complete")}><Check/> Mark scope complete</Button>}
      </div>}

      {order.kind === "Repair" && <div id="wo-sec-quotes" className="scroll-mt-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <SectionLabel>Quotes</SectionLabel>
          {isCommittee && !addingQuote && !accepted && <Button size="sm" variant="outline" className="h-8 rounded-full" onClick={() => setAddingQuote(true)}><Plus/> Add quote</Button>}
        </div>
        {addingQuote && <div className="mt-3"><AddQuoteForm order={order} contractors={contractors} schemeId={schemeId} pendingContractorId={newContractorId}
          onAddContractor={() => setContractorOpen(true)} onCancel={() => setAddingQuote(false)} onSaved={() => { setAddingQuote(false); setNewContractorId(null); refreshAll(); }}/></div>}
        {quotes.length > 0
          ? <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{quotes.map(q => {
              const qDocs = documents.filter(d => d.work_order_quote_id === q.id);
              const who = contractorName(q.contractor_id);
              const paidFund = funds.find(f => f.id === q.finance_transactions?.fund_id)?.name ?? null;
              return <div key={q.id} className={`min-w-0 rounded-2xl border p-4 ${q.status === "Accepted" ? "border-primary/40 bg-primary/5" : "border-border/70"}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0"><p className="truncate text-[13px] font-medium">{who ?? "Contractor not recorded"}</p>
                    <p className="mt-0.5 text-lg font-medium tabular-nums">{money(Number(q.amount))}</p></div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${q.status === "Accepted" ? "bg-primary/10 text-primary" : q.status === "Declined" ? "bg-secondary text-muted-foreground" : "bg-secondary text-foreground"}`}>{q.status}</span>
                    {q.id === lowestId && <span className="text-[10px] font-medium text-primary">Lowest</span>}
                  </div>
                </div>
                {q.notes && <p className="mt-2 whitespace-pre-line text-[12px] text-muted-foreground">{q.notes}</p>}
                {qDocs.length > 0 && <div className="mt-3 flex flex-wrap gap-2">{qDocs.map(d => <DocPreviewTile key={d.id} doc={d} canRemove={isCommittee} onOpen={doc => { void openDocument(doc); }} onRemove={doc => { void removeDoc(doc); }}/>)}</div>}
                {q.status === "Accepted" && (q.paid_at
                  ? <p className="mt-3 text-[12px] font-medium text-primary">Paid {niceDate(q.paid_at)}{paidFund ? ` from ${paidFund} fund` : ""}</p>
                  : isCommittee && (awaitingApproval
                    ? <p className="mt-3 text-[12px] text-muted-foreground">Can be marked paid once owners approve.</p>
                    : <Button size="sm" className="mt-3 rounded-full" onClick={() => setPayingQuote(q)}>Mark paid</Button>))}
                {isCommittee && q.status === "Received" && <div className="mt-3 flex flex-wrap gap-2">
                  {!accepted && <Button size="sm" variant="outline" className="rounded-full" disabled={busy} onClick={() => void acceptQuote(q)}><Check/> Accept</Button>}
                  <Button size="sm" variant="ghost" className="rounded-full text-muted-foreground" onClick={() => void removeQuote(q)}>Remove</Button>
                </div>}
              </div>;
            })}</div>
          : !addingQuote && <p className="mt-2 text-[13px] text-muted-foreground">No quotes yet.</p>}
        {accepted && !accepted.paid_at && <p className="mt-2 text-[12px] text-muted-foreground">Nothing goes to Finance until the accepted quote is marked paid.</p>}
      </div>}

      {(approvalStep || rows.length > 0) && <div id="wo-sec-approval" className="scroll-mt-4">
        <SectionLabel>Owner approval</SectionLabel>
        {rows.length > 0 && <p className="mt-2 text-[13px] text-muted-foreground">{approvedCount} approved, {declinedCount} declined, {rows.length - approvedCount - declinedCount} yet to respond. {majorityNeeded} approvals make a majority.</p>}
        {rows.length > 0 && <div className="mt-3 divide-y divide-border/70 rounded-2xl border border-border/70">
          {[...rows].sort((a, b) => (lots.find(l => l.id === a.lot_id)?.lot_number ?? 0) - (lots.find(l => l.id === b.lot_id)?.lot_number ?? 0)).map(row => {
            const lot = lots.find(l => l.id === row.lot_id);
            const mine = !!myLot && myLot.id === row.lot_id;
            const canVote = row.decision === "Pending" && (isCommittee || mine) && !(approvalStep?.done_at);
            return <div key={row.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
              <div><p className="text-[13px] font-medium">Lot {lot?.lot_number ?? "?"}{lot?.owner_name ? ` · ${lot.owner_name}` : ""}{mine ? " (you)" : ""}</p>
                <p className="text-[12px] text-muted-foreground">{row.decision === "Pending" ? "Yet to respond" : `${row.decision}${row.decided_at ? ` on ${niceDate(row.decided_at)}` : ""}`}</p></div>
              {canVote && <div className="flex flex-wrap items-center gap-2">
                {isCommittee && !mine && <span className="text-[11px] text-muted-foreground">Record for Lot {lot?.lot_number ?? "?"}</span>}
                <Button size="sm" variant="outline" className="rounded-full" onClick={() => void decide(row, "Approved")}><ThumbsUp/> Approve</Button>
                <Button size="sm" variant="ghost" className="rounded-full" onClick={() => void decide(row, "Declined")}><ThumbsDown/> Decline</Button>
              </div>}
            </div>;
          })}
        </div>}
        {approvalStep?.done_at && <p className="mt-2 text-[12px] font-medium text-primary">Approved {niceDate(approvalStep.done_at)}</p>}
        {isCommittee && approvalStep && !approvalStep.done_at && <Button size="sm" variant="outline" className="mt-3 rounded-full" disabled={busy} onClick={() => tickStep(approvalStep, "Marked approved")}><Check/> Mark approved</Button>}
      </div>}

      {order.kind === "Repair" && worksStep && isCommittee && !worksStep.done_at && <div id="wo-sec-works" className="flex scroll-mt-4 flex-wrap items-center justify-between gap-3 rounded-2xl border border-border/70 p-4">
        <div><SectionLabel>Works</SectionLabel><p className="mt-1 text-[12px] text-muted-foreground">Add progress notes and photos below as the job goes.</p></div>
        <Button size="sm" className="rounded-full" disabled={busy} onClick={() => tickStep(worksStep, "Works marked complete")}><Check/> Mark works complete</Button>
      </div>}

      <div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <SectionLabel>Attachments</SectionLabel>
          {isCommittee && <Button asChild variant="outline" size="sm" className="h-8 rounded-full">
            <label className="cursor-pointer"><Plus/>{uploading ? "Uploading…" : "Add files"}
              <input type="file" multiple className="sr-only" onChange={e => { void addFiles(e.target.files); e.target.value = ""; }}/></label>
          </Button>}
        </div>
        {orderDocs.length + (photos.data?.length ?? 0) > 0
          ? <div className="mt-3 flex flex-wrap gap-3">
              {orderDocs.map(doc => <DocPreviewTile key={doc.id} doc={doc} canRemove={isCommittee} onOpen={d => { void openDocument(d); }} onRemove={d => { void removeDoc(d); }}/>)}
              {(photos.data ?? []).filter(p => p.url).map(photo => <div key={photo.id} className="relative w-36">
                <a href={photo.url} target="_blank" rel="noreferrer" className="block h-44 w-36 overflow-hidden rounded-2xl border border-border/70">
                  <img src={photo.url} alt="Work order photo" className="h-full w-full object-cover"/></a>
                <p className="mt-1.5 truncate text-[11px] text-muted-foreground">Photo</p>
                {isCommittee && <button type="button" aria-label="Remove photo" onClick={() => void removePhoto(photo)}
                  className="absolute right-1.5 top-1.5 grid size-6 place-items-center rounded-full bg-background/90 text-[13px] text-muted-foreground shadow-sm hover:text-destructive">×</button>}
              </div>)}
            </div>
          : <p className="mt-2 text-[13px] text-muted-foreground">Nothing attached yet.</p>}
      </div>

      <div id="wo-sec-notes" className="scroll-mt-4">
        <SectionLabel>Progress notes</SectionLabel>
        <div className="mt-3 space-y-2">
          <Textarea value={note} onChange={e => setNote(e.target.value)} placeholder="Add an update: contractor booked, work started, issue found"/>
          <div className="flex justify-end"><Button size="sm" className="rounded-full" onClick={() => void addNote()} disabled={!note.trim()}>Add update</Button></div>
        </div>
        <ol className="mt-4 space-y-3 border-l border-border pl-4">
          {(updates.data ?? []).map(entry => <li key={entry.id}>
            <p className="text-[13px]">{entry.note}</p>
            <p className="text-[11px] text-muted-foreground">{niceStamp(entry.created_at)}{entry.author_label ? ` · ${entry.author_label}` : ""}{entry.status_at_time ? ` · ${entry.status_at_time}` : ""}</p>
          </li>)}
          {(updates.data ?? []).length === 0 && <li className="text-[13px] text-muted-foreground">Nothing recorded yet.</li>}
        </ol>
      </div>

    </div>

    {/* Next action, pinned to the bottom of the screen on phones; less-used actions sit in the ⋯ menu. */}
    {(nextAction || isCommittee) && <div className="sticky bottom-0 z-10 -mx-4 mt-6 flex items-center gap-2 border-t border-border/70 bg-background/95 px-4 py-3 backdrop-blur sm:static sm:mx-0 sm:justify-end sm:bg-transparent sm:px-0 sm:pb-0 sm:pt-5 sm:backdrop-blur-none">
      {nextAction && <Button className="h-11 flex-1 rounded-full sm:h-9 sm:flex-none" disabled={busy} onClick={nextAction.run}>
        {nextAction.label === "Add a quote" ? <Plus/> : <Check/>} {nextAction.label}</Button>}
      {isCommittee && <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="icon" className={`size-11 shrink-0 rounded-full sm:size-9 ${nextAction ? "" : "ml-auto"}`} aria-label="More actions"><MoreHorizontal/></Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          {canUndoLast && lastDone && <DropdownMenuItem disabled={busy} onSelect={() => void setStepsDone([lastDone.id], false, `${lastDone.label} reopened.`, "Step reopened")}><Undo2/> Reopen "{lastDone.label}"</DropdownMenuItem>}
          {isOpen && <DropdownMenuItem onSelect={() => setConfirmClose(true)}><Check/> Close work order</DropdownMenuItem>}
          <DropdownMenuSeparator/>
          <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={() => setConfirmDelete(true)}><Trash2/> Delete work order</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>}
    </div>}

    <ContractorDialog open={contractorOpen} onOpenChange={setContractorOpen} schemeId={schemeId} contractor={null} onSaved={id => { setNewContractorId(id); onChanged(); }}/>
    <MarkPaidDialog quote={payingQuote} order={order} contractorName={payingQuote ? contractorName(payingQuote.contractor_id) : null} funds={funds} schemeId={schemeId} fundBalances={fundBalances}
      onClose={() => setPayingQuote(null)} onDone={refreshAll}/>
    <ConfirmDialog open={confirmClose} onOpenChange={setConfirmClose} title="Close this work order?"
      body="Every remaining step will be marked done and the work order moves to Completed." confirmLabel="Close work order" busy={busy} onConfirm={() => void closeOrder()}/>
    <ConfirmDialog open={confirmDelete} onOpenChange={setConfirmDelete} title="Delete this work order?"
      body="This removes the work order with its steps, quotes, approvals, notes and attached files. Payments already recorded in Finance stay there. This can't be undone." confirmLabel="Delete" destructive busy={busy} onConfirm={() => void deleteOrder()}/>
  </div>;
}
