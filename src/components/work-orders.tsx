import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ImagePlus, Plus, ThumbsDown, ThumbsUp } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

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
  lots: { lot_number: number } | null;
};
export type WorkOrderLot = { id: string; lot_number: number; owner_name: string | null };

export const workOrderFlow = ["Requested", "Awaiting approval", "Quoted", "Approved", "In progress", "Complete"] as const;

const niceDate = (value: string) => new Date(value).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
const niceStamp = (value: string) => new Date(value).toLocaleString("en-AU", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <section className={`soft-shadow rounded-3xl border border-border/70 bg-card ${className}`}>{children}</section>;
}

export function WorkOrderPill({ status }: { status: string }) {
  const tone = status === "Complete" ? "bg-primary/10 text-primary"
    : status === "Awaiting approval" ? "bg-destructive/10 text-destructive"
    : "bg-secondary text-muted-foreground";
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-medium ${tone}`}>{status}</span>;
}

function ProgressTrack({ status }: { status: string }) {
  const index = workOrderFlow.indexOf(status as typeof workOrderFlow[number]);
  return <div className="flex items-center gap-1.5">
    {workOrderFlow.map((step, i) => <span key={step} title={step}
      className={`h-1.5 flex-1 rounded-full ${i <= index ? "bg-primary" : "bg-secondary"}`}/>)}
  </div>;
}

export function WorkOrderTable({ orders, onOpen }: { orders: WorkOrder[]; onOpen: (order: WorkOrder) => void }) {
  if (orders.length === 0) return <p className="px-7 py-10 text-center text-sm text-muted-foreground">Nothing logged yet.</p>;
  return <div className="divide-y divide-border/70">{orders.map(order =>
    <button key={order.id} type="button" onClick={()=>onOpen(order)} className="flex w-full flex-wrap items-center justify-between gap-4 px-7 py-5 text-left transition-colors hover:bg-secondary/50">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-border px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.1em] text-muted-foreground">{order.kind}</span>
          <p className="text-sm font-medium">{order.title}</p>
        </div>
        <p className="mt-1 text-[12px] text-muted-foreground">
          {order.lots ? `Lot ${order.lots.lot_number} · ` : ""}Logged {niceDate(order.created_at)}
          {order.priority !== "Normal" ? ` · ${order.priority} priority` : ""}
        </p>
        <div className="mt-3 max-w-xs"><ProgressTrack status={order.status}/></div>
      </div>
      <div className="flex items-center gap-3"><WorkOrderPill status={order.status}/><span className="text-[12px] text-muted-foreground">View</span></div>
    </button>)}
  </div>;
}

export function WorkOrdersSection({ orders, lots, isCommittee, myLot, schemeId, onChanged }: {
  orders: WorkOrder[]; lots: WorkOrderLot[]; isCommittee: boolean; myLot: WorkOrderLot | null;
  schemeId?: string | undefined; onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [viewing, setViewing] = useState<WorkOrder | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);

  const current = viewing ? orders.find(o => o.id === viewing.id) ?? viewing : null;

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!schemeId) return;
    const form = new FormData(e.currentTarget);
    const needsApproval = String(form.get("approval_required") ?? "no") === "yes";
    setSaving(true);
    const { data, error } = await supabase.from("maintenance_requests").insert({
      scheme_id: schemeId,
      submitted_by_lot_id: (String(form.get("lot_id") ?? "") || myLot?.id) ?? null,
      title: String(form.get("title") ?? ""),
      description: String(form.get("description") ?? ""),
      kind: String(form.get("kind") ?? "Repair"),
      priority: String(form.get("priority") ?? "Normal"),
      location: String(form.get("location") ?? ""),
      estimated_cost: form.get("estimated_cost") ? Number(form.get("estimated_cost")) : null,
      approval_required: needsApproval,
      target_date: String(form.get("target_date") ?? "") || null,
      status: needsApproval ? "Awaiting approval" : "Requested",
    }).select("id").single();
    if (error || !data) { setSaving(false); toast("Could not log this work order", { description: error?.message }); return; }

    for (const file of files) {
      const path = `${data.id}/${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9.\-_]/g, "_")}`;
      const up = await supabase.storage.from("work-orders").upload(path, file);
      if (!up.error) await supabase.from("work_order_photos").insert({ work_order_id: data.id, storage_path: path });
    }
    if (needsApproval && lots.length) {
      await supabase.from("work_order_approvals").insert(lots.map(lot => ({ work_order_id: data.id, lot_id: lot.id })));
    }
    await supabase.from("work_order_updates").insert({
      work_order_id: data.id, note: needsApproval ? "Logged and sent to all lot owners for approval." : "Logged.",
      status_at_time: needsApproval ? "Awaiting approval" : "Requested", author_label: "Committee",
    });
    setSaving(false); setFiles([]); setOpen(false); onChanged(); toast("Work order logged");
  };

  return <div>
    <PageHead eyebrow="Your property" title="Work orders" blurb="Log a repair job or a general request, gather the owners' approval, then track every step to completion with photos and a dated trail."
      action={<Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild><Button className="rounded-full"><Plus/> New work order</Button></DialogTrigger>
        <DialogContent className="max-h-[88vh] overflow-y-auto">
          <DialogHeader><DialogTitle className="font-display tracking-[-0.02em]">New work order</DialogTitle><DialogDescription>A repair job or a general request for the building.</DialogDescription></DialogHeader>
          <form onSubmit={submit} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2"><Label>Type</Label>
                <Select name="kind" defaultValue="Repair"><SelectTrigger><SelectValue/></SelectTrigger>
                  <SelectContent><SelectItem value="Repair">Repair job</SelectItem><SelectItem value="Request">General request</SelectItem></SelectContent></Select></div>
              <div className="space-y-2"><Label>Priority</Label>
                <Select name="priority" defaultValue="Normal"><SelectTrigger><SelectValue/></SelectTrigger>
                  <SelectContent><SelectItem value="Low">Low</SelectItem><SelectItem value="Normal">Normal</SelectItem><SelectItem value="Urgent">Urgent</SelectItem></SelectContent></Select></div>
            </div>
            <div className="space-y-2"><Label htmlFor="title">What is needed</Label><Input id="title" name="title" placeholder="Leaking gutter, block B" required autoFocus/></div>
            <div className="space-y-2"><Label htmlFor="description">Details</Label><Textarea id="description" name="description" placeholder="What you need, where it is, and when you noticed it"/></div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2"><Label htmlFor="location">Where</Label><Input id="location" name="location" placeholder="Carpark, block B"/></div>
              <div className="space-y-2"><Label htmlFor="estimated_cost">Estimated cost</Label><Input id="estimated_cost" name="estimated_cost" type="number" step="0.01" placeholder="Optional"/></div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2"><Label htmlFor="target_date">Target date</Label><Input id="target_date" name="target_date" type="date"/></div>
              <div className="space-y-2"><Label>Raised for lot</Label>
                <Select name="lot_id" defaultValue={myLot?.id ?? ""}><SelectTrigger><SelectValue placeholder="Common property"/></SelectTrigger>
                  <SelectContent>{lots.map(lot => <SelectItem key={lot.id} value={lot.id}>Lot {lot.lot_number}{lot.owner_name ? `, ${lot.owner_name}` : ""}</SelectItem>)}</SelectContent></Select></div>
            </div>
            <div className="space-y-2"><Label>Ask every lot owner to approve this</Label>
              <Select name="approval_required" defaultValue="no"><SelectTrigger><SelectValue/></SelectTrigger>
                <SelectContent><SelectItem value="no">No, the committee can proceed</SelectItem><SelectItem value="yes">Yes, collect a decision from all lots</SelectItem></SelectContent></Select></div>
            <div className="space-y-2"><Label htmlFor="photos">Photos</Label>
              <Input id="photos" name="photos" type="file" accept="image/*" multiple onChange={e=>setFiles(Array.from(e.target.files ?? []))}/>
              {files.length > 0 && <p className="text-[12px] text-muted-foreground">{files.length} photo{files.length>1?"s":""} ready to upload</p>}</div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="ghost" className="rounded-full" onClick={()=>setOpen(false)}>Cancel</Button>
              <Button type="submit" className="rounded-full" disabled={saving}>{saving ? "Saving" : "Log work order"}</Button></div>
          </form>
        </DialogContent>
      </Dialog>}/>

    <Card className="mt-10 overflow-hidden"><WorkOrderTable orders={orders} onOpen={setViewing}/></Card>

    <Dialog open={!!current} onOpenChange={o=>!o && setViewing(null)}>
      <DialogContent className="max-h-[88vh] max-w-2xl overflow-y-auto">
        {current && <WorkOrderDetail order={current} lots={lots} isCommittee={isCommittee} onChanged={onChanged}/>}
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

export function WorkOrderDetail({ order, lots, isCommittee, onChanged }: {
  order: WorkOrder; lots: WorkOrderLot[]; isCommittee: boolean; onChanged: () => void;
}) {
  const queryClient = useQueryClient();
  const [note, setNote] = useState("");
  const [uploading, setUploading] = useState(false);

  const photos = useQuery({
    queryKey: ["wo-photos", order.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("work_order_photos").select("*").eq("work_order_id", order.id).order("created_at");
      if (error) throw error;
      const rows = (data ?? []) as { id: string; storage_path: string }[];
      const signed = await Promise.all(rows.map(async row => {
        const { data: url } = await supabase.storage.from("work-orders").createSignedUrl(row.storage_path, 3600);
        return { id: row.id, url: url?.signedUrl ?? "" };
      }));
      return signed.filter(p => p.url);
    },
  });
  const approvals = useQuery({
    queryKey: ["wo-approvals", order.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("work_order_approvals").select("*").eq("work_order_id", order.id);
      if (error) throw error;
      return (data ?? []) as { id: string; lot_id: string; decision: string; comment: string | null; decided_at: string | null }[];
    },
  });
  const updates = useQuery({
    queryKey: ["wo-updates", order.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("work_order_updates").select("*").eq("work_order_id", order.id).order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as { id: string; note: string; status_at_time: string | null; author_label: string | null; created_at: string }[];
    },
  });

  const refreshAll = () => {
    ["wo-photos", "wo-approvals", "wo-updates"].forEach(key => queryClient.invalidateQueries({ queryKey: [key, order.id] }));
    onChanged();
  };

  const logUpdate = async (text: string, status: string) => {
    await supabase.from("work_order_updates").insert({ work_order_id: order.id, note: text, status_at_time: status, author_label: isCommittee ? "Committee" : "Owner" });
  };

  const advance = useMutation({
    mutationFn: async (status: string) => {
      const patch: Record<string, unknown> = { status };
      if (status === "Complete") patch['closed_at'] = new Date().toISOString();
      const { error } = await supabase.from("maintenance_requests").update(patch as never).eq("id", order.id);
      if (error) throw error;
      await logUpdate(`Moved to ${status}.`, status);
    },
    onSuccess: () => { refreshAll(); toast("Work order updated"); },
    onError: (e: Error) => toast("Could not update", { description: e.message }),
  });

  const decide = useMutation({
    mutationFn: async ({ id, decision }: { id: string; decision: string }) => {
      const { error } = await supabase.from("work_order_approvals").update({ decision, decided_at: new Date().toISOString() }).eq("id", id);
      if (error) throw error;

      // Majority rule: once more than half the lots have approved, the work order moves on by itself.
      const { data } = await supabase.from("work_order_approvals").select("decision").eq("work_order_id", order.id);
      const all = (data ?? []) as { decision: string }[];
      const yes = all.filter(r => r.decision === "Approved").length;
      const no = all.filter(r => r.decision === "Declined").length;
      const majority = Math.floor(all.length / 2) + 1;
      if (order.status !== "Awaiting approval" || all.length === 0) return null;
      if (yes >= majority) {
        const { error: moveError } = await supabase.from("maintenance_requests").update({ status: "Approved" } as never).eq("id", order.id);
        if (moveError) throw moveError;
        await logUpdate(`Majority reached: ${yes} of ${all.length} lots approved. Moved to Approved automatically.`, "Approved");
        return "approved" as const;
      }
      if (no >= majority) {
        await logUpdate(`Majority declined: ${no} of ${all.length} lots said no. This one stays on hold.`, "Awaiting approval");
        return "declined" as const;
      }
      return null;
    },
    onSuccess: (outcome) => {
      refreshAll();
      if (outcome === "approved") toast("Majority approved, moved to Approved");
      else if (outcome === "declined") toast("Majority declined, this one stays on hold");
      else toast("Decision recorded");
    },
    onError: (e: Error) => toast("Could not record that", { description: e.message }),
  });

  const addNote = async () => {
    if (!note.trim()) return;
    await logUpdate(note.trim(), order.status);
    setNote(""); refreshAll(); toast("Update added");
  };

  const addPhotos = async (list: FileList | null) => {
    if (!list || list.length === 0) return;
    setUploading(true);
    for (const file of Array.from(list)) {
      const path = `${order.id}/${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9.\-_]/g, "_")}`;
      const up = await supabase.storage.from("work-orders").upload(path, file);
      if (!up.error) await supabase.from("work_order_photos").insert({ work_order_id: order.id, storage_path: path });
    }
    setUploading(false); refreshAll(); toast("Photos added");
  };

  const index = workOrderFlow.indexOf(order.status as typeof workOrderFlow[number]);
  const next = workOrderFlow[index + 1];
  const rows = approvals.data ?? [];
  const approved = rows.filter(r => r.decision === "Approved").length;
  const declined = rows.filter(r => r.decision === "Declined").length;
  const majorityNeeded = rows.length > 0 ? Math.floor(rows.length / 2) + 1 : 0;
  const blocked = order.approval_required && rows.length > 0 && approved < majorityNeeded && order.status === "Awaiting approval";

  return <div>
    <DialogHeader>
      <DialogTitle className="font-display tracking-[-0.02em]">{order.title}</DialogTitle>
      <DialogDescription>{order.kind === "Request" ? "General request" : "Repair job"}{order.location ? ` · ${order.location}` : ""} · logged {niceDate(order.created_at)}</DialogDescription>
    </DialogHeader>

    <div className="space-y-6">
      <div className="rounded-2xl border border-border/70 bg-secondary/40 p-4">
        <div className="flex items-center justify-between gap-3"><WorkOrderPill status={order.status}/>
          <span className="text-[12px] text-muted-foreground">Step {Math.max(index, 0) + 1} of {workOrderFlow.length}</span></div>
        <div className="mt-3"><ProgressTrack status={order.status}/></div>
        {isCommittee && next && <div className="mt-4 flex flex-wrap gap-2">
          <Button size="sm" className="rounded-full" disabled={blocked || advance.isPending} onClick={()=>advance.mutate(next)}>Move to {next}</Button>
          {order.status !== "Complete" && <Button size="sm" variant="outline" className="rounded-full" disabled={advance.isPending} onClick={()=>advance.mutate("Complete")}><Check/> Close it off</Button>}
        </div>}
        {blocked && <p className="mt-3 text-[12px] text-muted-foreground">Waiting on {rows.length - approved} of {rows.length} lots to decide before this can move on.</p>}
      </div>

      {order.description && <div><p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Details</p>
        <p className="mt-2 whitespace-pre-line text-[13px] leading-6">{order.description}</p></div>}

      <dl className="grid grid-cols-2 gap-4 text-[13px] sm:grid-cols-4">
        {[["Priority", order.priority], ["Raised for", order.lots ? `Lot ${order.lots.lot_number}` : "Common property"],
          ["Target date", order.target_date ? niceDate(order.target_date) : "Not set"],
          ["Estimated cost", order.estimated_cost ? `$${Number(order.estimated_cost).toLocaleString("en-AU")}` : "Not set"]].map(([label, value]) =>
          <div key={label}><dt className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">{label}</dt><dd className="mt-1 font-medium">{value}</dd></div>)}
      </dl>

      <div>
        <div className="flex items-center justify-between">
          <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Photos and evidence</p>
          <label className="cursor-pointer text-[12px] font-medium text-primary">
            <ImagePlus className="mr-1 inline size-3.5"/>{uploading ? "Uploading" : "Add photos"}
            <input type="file" accept="image/*" multiple className="hidden" onChange={e=>addPhotos(e.target.files)}/>
          </label>
        </div>
        {photos.data && photos.data.length > 0
          ? <div className="mt-3 grid grid-cols-3 gap-2">{photos.data.map(photo =>
              <a key={photo.id} href={photo.url} target="_blank" rel="noreferrer" className="overflow-hidden rounded-xl border border-border/70">
                <img src={photo.url} alt="Work order photo" className="h-24 w-full object-cover"/></a>)}</div>
          : <p className="mt-2 text-[13px] text-muted-foreground">No photos attached yet.</p>}
      </div>

      <div>
        <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Owner approvals</p>
        {order.approval_required && rows.length > 0 ? <>
          <p className="mt-2 text-[13px] text-muted-foreground">{approved} approved, {declined} declined, {rows.length - approved - declined} yet to respond.</p>
          <div className="mt-3 divide-y divide-border/70 rounded-2xl border border-border/70">
            {rows.map(row => {
              const lot = lots.find(l => l.id === row.lot_id);
              return <div key={row.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <div><p className="text-[13px] font-medium">Lot {lot?.lot_number ?? "?"}{lot?.owner_name ? `, ${lot.owner_name}` : ""}</p>
                  <p className="text-[12px] text-muted-foreground">{row.decision === "Pending" ? "Yet to respond" : `${row.decision} on ${row.decided_at ? niceDate(row.decided_at) : ""}`}</p></div>
                {row.decision === "Pending" && <div className="flex gap-2">
                  <Button size="sm" variant="outline" className="rounded-full" onClick={()=>decide.mutate({ id: row.id, decision: "Approved" })}><ThumbsUp/> Approve</Button>
                  <Button size="sm" variant="ghost" className="rounded-full" onClick={()=>decide.mutate({ id: row.id, decision: "Declined" })}><ThumbsDown/> Decline</Button>
                </div>}
              </div>;})}
          </div>
        </> : <p className="mt-2 text-[13px] text-muted-foreground">No approval was requested for this one.</p>}
      </div>

      <div>
        <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Progress trail</p>
        <div className="mt-3 space-y-2">
          <Textarea value={note} onChange={e=>setNote(e.target.value)} placeholder="Add an update: quote received, plumber booked, work finished"/>
          <div className="flex justify-end"><Button size="sm" className="rounded-full" onClick={addNote} disabled={!note.trim()}>Add update</Button></div>
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
  </div>;
}
