import { useState, type FormEvent } from "react";
import { moneyCents as money, niceDate, localISO } from "@/lib/format";
import { ChevronDown, ChevronRight, Pencil, Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import type { DocFile } from "@/components/documents";
import { DocPreviewTile, type Policy } from "@/components/insurance";
import { MoneyFormField, MoneyInput } from "@/components/finance";

export type ClaimUpdate = { id: string; claim_id: string; note: string; author_label: string | null; status_at_time: string | null; created_at: string };
export type Claim = {
  id: string; scheme_id: string; policy_id: string | null; claim_number: string | null; title: string; description: string | null;
  incident_date: string | null; lodged_date: string | null; status: string; responsible_lot_id: string | null; responsible_name: string | null;
  insurer_contact_name: string | null; insurer_contact_phone: string | null; insurer_contact_email: string | null;
  claim_amount: number | null; excess: number | null; approved_amount: number | null; decision_date: string | null; decision_notes: string | null;
  work_order_id: string | null; payout_received_at: string | null; finance_transaction_id: string | null; created_at: string;
  insurance_claim_updates?: ClaimUpdate[];
};
export type ClaimLot = { id: string; lot_number: number; owner_name: string | null };
export type ClaimOrder = { id: string; title: string; status: string };
export type ClaimFund = { id: string; name: string };

export const CLOSED_CLAIM_STATUSES = ["Paid", "Declined", "Withdrawn"];
const PROGRESS = ["Lodged", "Under assessment", "Decision", "Paid"];
const INSURANCE_FOLDER = "Insurance";
const NONE = "__none";
const OTHER = "__other";

const today = () => localISO();
const num = (v: string) => (v.trim() === "" ? null : Number(v));

function progressIndex(status: string) {
  if (status === "Draft") return -1;
  if (status === "Lodged") return 0;
  if (status === "Under assessment") return 1;
  if (status === "Paid") return 3;
  return 2; // Approved, Partially approved, Declined, Withdrawn
}

export function ClaimPill({ status }: { status: string }) {
  const tone = status === "Paid" || status === "Approved" ? "bg-primary/10 text-primary"
    : status === "Declined" ? "bg-destructive/10 text-destructive"
    : status === "Partially approved" ? "bg-amber-500/10 text-amber-700 dark:text-amber-400"
    : "bg-secondary text-muted-foreground";
  return <span className={`inline-flex shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium ${tone}`}>{status}</span>;
}

/** What the building carries itself: the excess, plus whatever the insurer didn't cover. */
function buildingPays(c: Claim) {
  if (c.claim_amount === null) return null;
  const claimed = Number(c.claim_amount);
  if (c.status === "Declined") return claimed;
  if (c.approved_amount !== null) return Math.max(0, claimed - Number(c.approved_amount));
  return Math.min(claimed, Number(c.excess ?? 0));
}

function responsibleLabel(c: Claim, lots: ClaimLot[]) {
  if (c.responsible_lot_id) {
    const lot = lots.find(l => l.id === c.responsible_lot_id);
    if (lot) return `Lot ${lot.lot_number}${lot.owner_name ? ` · ${lot.owner_name}` : ""}`;
  }
  return c.responsible_name || "Not assigned";
}

async function insuranceFolderId(schemeId: string) {
  const { data, error: lookupError } = await supabase.from("document_folders").select("id").eq("scheme_id", schemeId).eq("name", INSURANCE_FOLDER).maybeSingle();
  if (lookupError) throw lookupError;
  if (data?.id) return data.id as string;
  const { data: made, error } = await supabase.from("document_folders")
    .insert({ scheme_id: schemeId, name: INSURANCE_FOLDER, icon: "ShieldCheck", color: "blue" }).select("id").single();
  if (error) throw error;
  return made.id as string;
}

async function uploadClaimFiles(schemeId: string, claimId: string, files: File[]) {
  const folderId = await insuranceFolderId(schemeId);
  for (const file of files) {
    const path = `${schemeId}/${crypto.randomUUID()}-${file.name.replace(/[^\w.-]/g, "_")}`;
    const { error: upErr } = await supabase.storage.from("documents").upload(path, file);
    if (upErr) throw upErr;
    const { error } = await supabase.from("documents").insert({
      scheme_id: schemeId, name: file.name, category: "Insurance claim", folder_id: folderId,
      insurance_claim_id: claimId, storage_path: path, file_size: file.size, mime_type: file.type,
    });
    if (error) throw error;
  }
}

async function openDoc(doc: DocFile) {
  if (!doc.storage_path) { toast("No file attached to this record"); return; }
  const { data, error } = await supabase.storage.from("documents").createSignedUrl(doc.storage_path, 600);
  if (error || !data) { toast("Could not open the file", { description: error?.message }); return; }
  window.open(data.signedUrl, "_blank");
}

function ConfirmDialog({ open, onOpenChange, title, body, confirmLabel, busy, onConfirm }: {
  open: boolean; onOpenChange: (v: boolean) => void; title: string; body: string; confirmLabel: string; busy?: boolean; onConfirm: () => void;
}) {
  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="sm:max-w-[440px]">
      <DialogHeader><DialogTitle className="font-display tracking-[-0.02em]">{title}</DialogTitle><DialogDescription>{body}</DialogDescription></DialogHeader>
      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="ghost" className="rounded-full" onClick={() => onOpenChange(false)}>Cancel</Button>
        <Button type="button" variant="destructive" className="rounded-full" disabled={busy} onClick={onConfirm}>{busy ? "Working…" : confirmLabel}</Button>
      </div>
    </DialogContent>
  </Dialog>;
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{children}</p>;
}

function Stat({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return <div>
    <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
    <p className={`mt-1.5 text-sm ${strong ? "font-semibold" : "font-medium"}`}>{value}</p>
  </div>;
}

function ClaimDialog({ open, onOpenChange, schemeId, claim, policies, lots, orders, defaultPolicyId, onSaved }: {
  open: boolean; onOpenChange: (v: boolean) => void; schemeId?: string | undefined; claim: Claim | null; policies: Policy[]; lots: ClaimLot[];
  orders: ClaimOrder[]; defaultPolicyId?: string | null | undefined; onSaved: (id: string) => void;
}) {
  const initialPolicy = claim?.policy_id ?? defaultPolicyId ?? policies.find(p => p.policy_type === "Building")?.id ?? policies[0]?.id ?? NONE;
  const [policyId, setPolicyId] = useState<string>(initialPolicy);
  const [excess, setExcess] = useState<string>(claim ? (claim.excess?.toString() ?? "") : (policies.find(p => p.id === initialPolicy)?.excess?.toString() ?? ""));
  const [responsible, setResponsible] = useState<string>(claim?.responsible_lot_id ?? (claim?.responsible_name ? OTHER : NONE));
  const [orderId, setOrderId] = useState<string>(claim?.work_order_id ?? NONE);
  const [files, setFiles] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);

  const pickPolicy = (id: string) => {
    setPolicyId(id);
    const p = policies.find(x => x.id === id);
    if (p?.excess !== null && p?.excess !== undefined) setExcess(String(p.excess));
  };

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!schemeId) return;
    const f = new FormData(e.currentTarget);
    const str = (k: string) => { const v = String(f.get(k) ?? "").trim(); return v === "" ? null : v; };
    const title = str("title");
    if (!title) { toast("Give the claim a short title"); return; }
    const row = {
      scheme_id: schemeId, title, description: str("description"), claim_number: str("claim_number"),
      policy_id: policyId === NONE ? null : policyId, incident_date: str("incident_date"), lodged_date: str("lodged_date"),
      responsible_lot_id: responsible === NONE || responsible === OTHER ? null : responsible,
      responsible_name: responsible === OTHER ? str("responsible_name") : null,
      insurer_contact_name: str("insurer_contact_name"), insurer_contact_phone: str("insurer_contact_phone"), insurer_contact_email: str("insurer_contact_email"),
      claim_amount: num(String(f.get("claim_amount") ?? "")), excess: num(excess),
      work_order_id: orderId === NONE ? null : orderId,
    };
    setSaving(true);
    try {
      let id = claim?.id;
      if (claim) {
        const { error } = await supabase.from("insurance_claims").update(row).eq("id", claim.id);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from("insurance_claims").insert({ ...row, status: "Lodged" }).select("id").single();
        if (error || !data) throw error ?? new Error("No claim returned");
        id = data.id as string;
        await supabase.from("insurance_claim_updates").insert({ claim_id: id, note: "Claim logged", status_at_time: "Lodged", author_label: "Committee" });
      }
      if (files.length && id) await uploadClaimFiles(schemeId, id, files);
      toast(claim ? "Claim updated" : "Claim logged");
      onSaved(id!);
      onOpenChange(false);
    } catch (err) {
      toast("Could not save the claim", { description: (err as Error).message });
    } finally { setSaving(false); }
  };

  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[620px]">
      <DialogHeader>
        <DialogTitle className="font-display tracking-[-0.02em]">{claim ? "Edit claim" : "Log a claim"}</DialogTitle>
        <DialogDescription>Record what happened, which policy it's on and who's handling it. Nothing goes into Finance until a payout is marked received.</DialogDescription>
      </DialogHeader>
      <form onSubmit={e => { void submit(e); }} className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2 sm:col-span-2"><Label htmlFor="c-title">Claim title</Label>
          <Input id="c-title" name="title" defaultValue={claim?.title ?? ""} placeholder="e.g. Storm damage to carpark roof" required/></div>
        <div className="space-y-2 sm:col-span-2"><Label htmlFor="c-desc">What happened</Label>
          <Textarea id="c-desc" name="description" defaultValue={claim?.description ?? ""} rows={3} placeholder="Describe the incident and the damage"/></div>
        <div className="space-y-2"><Label>Policy</Label>
          <Select value={policyId} onValueChange={pickPolicy}>
            <SelectTrigger aria-label="Policy"><SelectValue placeholder="Choose a policy"/></SelectTrigger>
            <SelectContent>
              {policies.map(p => <SelectItem key={p.id} value={p.id}>{p.policy_type}{p.insurer ? ` · ${p.insurer}` : ""}</SelectItem>)}
              <SelectItem value={NONE}>Not linked to a policy</SelectItem>
            </SelectContent>
          </Select></div>
        <div className="space-y-2"><Label htmlFor="c-num">Insurer's claim number</Label>
          <Input id="c-num" name="claim_number" defaultValue={claim?.claim_number ?? ""} placeholder="Optional"/></div>
        <div className="space-y-2"><Label htmlFor="c-inc">Incident date</Label>
          <Input id="c-inc" name="incident_date" type="date" defaultValue={claim?.incident_date ?? ""}/></div>
        <div className="space-y-2"><Label htmlFor="c-lodged">Lodged with insurer</Label>
          <Input id="c-lodged" name="lodged_date" type="date" defaultValue={claim?.lodged_date ?? today()}/></div>

        <div className="space-y-2 sm:col-span-2"><Label>Responsible person</Label>
          <Select value={responsible} onValueChange={setResponsible}>
            <SelectTrigger aria-label="Responsible person"><SelectValue/></SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>Not assigned</SelectItem>
              {lots.map(l => <SelectItem key={l.id} value={l.id}>Lot {l.lot_number}{l.owner_name ? ` · ${l.owner_name}` : ""}</SelectItem>)}
              <SelectItem value={OTHER}>Someone else…</SelectItem>
            </SelectContent>
          </Select>
          {responsible === OTHER && <Input name="responsible_name" defaultValue={claim?.responsible_name ?? ""} placeholder="Name of the person handling it" aria-label="Responsible person name"/>}
        </div>

        <div className="sm:col-span-2"><SectionLabel>Insurer's representative</SectionLabel></div>
        <div className="space-y-2"><Label htmlFor="c-rep">Name</Label>
          <Input id="c-rep" name="insurer_contact_name" defaultValue={claim?.insurer_contact_name ?? ""} placeholder="Assessor or claims officer"/></div>
        <div className="space-y-2"><Label htmlFor="c-rep-phone">Phone</Label>
          <Input id="c-rep-phone" name="insurer_contact_phone" defaultValue={claim?.insurer_contact_phone ?? ""}/></div>
        <div className="space-y-2 sm:col-span-2"><Label htmlFor="c-rep-email">Email</Label>
          <Input id="c-rep-email" name="insurer_contact_email" type="email" defaultValue={claim?.insurer_contact_email ?? ""}/></div>

        <div className="space-y-2"><Label htmlFor="c-amount">Claim amount ($)</Label>
          <MoneyFormField id="c-amount" name="claim_amount" defaultValue={claim?.claim_amount ?? ""}/></div>
        <div className="space-y-2"><Label htmlFor="c-excess">Excess ($)</Label>
          <MoneyInput id="c-excess" name="excess" value={excess} onChange={setExcess}/>
          <p className="text-[11px] text-muted-foreground">Pre-filled from the policy. Change it if this claim differs.</p></div>

        <div className="space-y-2 sm:col-span-2"><Label>Linked work order</Label>
          <Select value={orderId} onValueChange={setOrderId}>
            <SelectTrigger aria-label="Linked work order"><SelectValue/></SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>None</SelectItem>
              {orders.map(o => <SelectItem key={o.id} value={o.id}>{o.title}</SelectItem>)}
            </SelectContent>
          </Select></div>

        <div className="space-y-2 sm:col-span-2"><Label htmlFor="c-files">Attachments</Label>
          <Input id="c-files" type="file" multiple onChange={e => setFiles(Array.from(e.target.files ?? []))}/>
          <p className="text-[11px] text-muted-foreground">Photos, quotes, assessor reports. They file under Insurance in your documents.</p></div>

        <div className="flex justify-end gap-2 pt-2 sm:col-span-2">
          <Button type="button" variant="ghost" className="rounded-full" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="submit" className="rounded-full" disabled={saving}>{saving ? "Saving…" : claim ? "Save changes" : "Log claim"}</Button>
        </div>
      </form>
    </DialogContent>
  </Dialog>;
}

function DecisionDialog({ open, onOpenChange, claim, onDone }: { open: boolean; onOpenChange: (v: boolean) => void; claim: Claim; onDone: () => void }) {
  const [outcome, setOutcome] = useState<string>("Approved");
  const [saving, setSaving] = useState(false);
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const approved = outcome === "Declined" ? 0 : num(String(f.get("approved_amount") ?? ""));
    if (outcome !== "Declined" && approved === null) { toast("Enter the amount the insurer will cover"); return; }
    const notes = String(f.get("decision_notes") ?? "").trim() || null;
    const date = String(f.get("decision_date") ?? "") || today();
    setSaving(true);
    const { error } = await supabase.from("insurance_claims").update({ status: outcome, approved_amount: approved, decision_date: date, decision_notes: notes }).eq("id", claim.id);
    if (!error) await supabase.from("insurance_claim_updates").insert({
      claim_id: claim.id, status_at_time: outcome, author_label: "Committee",
      note: outcome === "Declined" ? `Declined${notes ? `: ${notes}` : ""}` : `${outcome} for ${money(approved)}${notes ? `. ${notes}` : ""}`,
    });
    setSaving(false);
    if (error) { toast("Could not record the decision", { description: error.message }); return; }
    toast("Decision recorded"); onDone(); onOpenChange(false);
  };
  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="sm:max-w-[480px]">
      <DialogHeader><DialogTitle className="font-display tracking-[-0.02em]">Record the insurer's decision</DialogTitle>
        <DialogDescription>{claim.title}</DialogDescription></DialogHeader>
      <form onSubmit={e => { void submit(e); }} className="space-y-4">
        <div className="space-y-2"><Label>Outcome</Label>
          <Select value={outcome} onValueChange={setOutcome}>
            <SelectTrigger aria-label="Outcome"><SelectValue/></SelectTrigger>
            <SelectContent>{["Approved", "Partially approved", "Declined"].map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
          </Select></div>
        {outcome !== "Declined" && <div className="space-y-2"><Label htmlFor="d-amt">Amount covered ($)</Label>
          <MoneyFormField id="d-amt" name="approved_amount"
            defaultValue={claim.approved_amount ?? (claim.claim_amount !== null ? Math.max(0, Number(claim.claim_amount) - Number(claim.excess ?? 0)) : "")}/>
          <p className="text-[11px] text-muted-foreground">What the insurer will pay, after the excess.</p></div>}
        <div className="space-y-2"><Label htmlFor="d-date">Decision date</Label><Input id="d-date" name="decision_date" type="date" defaultValue={today()}/></div>
        <div className="space-y-2"><Label htmlFor="d-notes">{outcome === "Declined" ? "Reason given" : "Notes"}</Label>
          <Textarea id="d-notes" name="decision_notes" rows={3} defaultValue={claim.decision_notes ?? ""}/></div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" className="rounded-full" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="submit" className="rounded-full" disabled={saving}>{saving ? "Saving…" : "Record decision"}</Button>
        </div>
      </form>
    </DialogContent>
  </Dialog>;
}

function PayoutDialog({ open, onOpenChange, claim, funds, policy, onDone }: {
  open: boolean; onOpenChange: (v: boolean) => void; claim: Claim; funds: ClaimFund[]; policy: Policy | undefined; onDone: () => void;
}) {
  const [fundId, setFundId] = useState<string>(funds[0]?.id ?? "");
  const [saving, setSaving] = useState(false);
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const amount = num(String(f.get("amount") ?? ""));
    const date = String(f.get("date") ?? "") || today();
    if (!amount || amount <= 0) { toast("Enter the amount received"); return; }
    if (!fundId) { toast("Choose which fund received it"); return; }
    setSaving(true);
    const { data: tx, error: txErr } = await supabase.from("finance_transactions").insert({
      scheme_id: claim.scheme_id, direction: "in", status: "Paid", amount, occurred_on: date, fund_id: fundId,
      category: "Reimbursement", description: `Insurance claim — ${claim.title}`, supplier: policy?.insurer ?? null,
      insurance_claim_id: claim.id, work_order_id: claim.work_order_id,
    }).select("id").single();
    if (txErr || !tx) { setSaving(false); toast("Could not record the payout", { description: txErr?.message }); return; }
    const { error } = await supabase.from("insurance_claims").update({
      status: "Paid", payout_received_at: date, finance_transaction_id: tx.id,
      approved_amount: claim.approved_amount ?? amount,
    }).eq("id", claim.id);
    if (!error) await supabase.from("insurance_claim_updates").insert({ claim_id: claim.id, status_at_time: "Paid", author_label: "Committee", note: `Payout of ${money(amount)} received` });
    setSaving(false);
    if (error) { toast("Payout recorded in Finance, but the claim didn't update", { description: error.message }); onDone(); return; }
    toast("Payout recorded in Finance"); onDone(); onOpenChange(false);
  };
  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="sm:max-w-[460px]">
      <DialogHeader><DialogTitle className="font-display tracking-[-0.02em]">Mark payout received</DialogTitle>
        <DialogDescription>This records the money coming in to Finance, linked to this claim.</DialogDescription></DialogHeader>
      <form onSubmit={e => { void submit(e); }} className="space-y-4">
        <div className="space-y-2"><Label htmlFor="p-amt">Amount received ($)</Label>
          <MoneyFormField id="p-amt" name="amount" defaultValue={claim.approved_amount ?? ""}/></div>
        <div className="space-y-2"><Label>Paid into</Label>
          <Select value={fundId} onValueChange={setFundId}>
            <SelectTrigger aria-label="Fund"><SelectValue placeholder="Choose a fund"/></SelectTrigger>
            <SelectContent>{funds.map(fd => <SelectItem key={fd.id} value={fd.id}>{fd.name}</SelectItem>)}</SelectContent>
          </Select></div>
        <div className="space-y-2"><Label htmlFor="p-date">Date received</Label><Input id="p-date" name="date" type="date" defaultValue={today()}/></div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" className="rounded-full" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="submit" className="rounded-full" disabled={saving}>{saving ? "Saving…" : "Record payout"}</Button>
        </div>
      </form>
    </DialogContent>
  </Dialog>;
}

function ClaimDetail({ claim, policies, lots, orders, funds, documents, isCommittee, schemeId, onEdit, onChanged }: {
  claim: Claim; policies: Policy[]; lots: ClaimLot[]; orders: ClaimOrder[]; funds: ClaimFund[]; documents: DocFile[];
  isCommittee: boolean; schemeId?: string | undefined; onEdit: () => void; onChanged: () => void;
}) {
  const [decisionOpen, setDecisionOpen] = useState(false);
  const [payoutOpen, setPayoutOpen] = useState(false);
  const [confirm, setConfirm] = useState<null | "withdraw" | "delete">(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const policy = policies.find(p => p.id === claim.policy_id);
  const order = orders.find(o => o.id === claim.work_order_id);
  const files = documents.filter(d => d.insurance_claim_id === claim.id);
  const updates = [...(claim.insurance_claim_updates ?? [])].sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  const step = progressIndex(claim.status);
  const closed = CLOSED_CLAIM_STATUSES.includes(claim.status);
  const pays = buildingPays(claim);

  const setStatus = async (status: string) => {
    const { error } = await supabase.from("insurance_claims").update({ status }).eq("id", claim.id);
    if (!error) await supabase.from("insurance_claim_updates").insert({ claim_id: claim.id, status_at_time: status, author_label: "Committee", note: `Moved to ${status}` });
    if (error) { toast("Could not update the status", { description: error.message }); return; }
    onChanged();
  };
  const addNote = async () => {
    if (!note.trim()) return;
    const { error } = await supabase.from("insurance_claim_updates").insert({ claim_id: claim.id, note: note.trim(), status_at_time: claim.status, author_label: isCommittee ? "Committee" : "Owner" });
    if (error) { toast("Could not add the note", { description: error.message }); return; }
    setNote(""); onChanged();
  };
  const attach = async (list: FileList | null) => {
    if (!list?.length || !schemeId) return;
    const picked = Array.from(list);
    setBusy(true);
    try { await uploadClaimFiles(schemeId, claim.id, picked); toast("Filed under Insurance in your documents"); onChanged(); }
    catch (err) { toast("Could not attach that", { description: (err as Error).message }); }
    finally { setBusy(false); }
  };
  const removeDoc = async (doc: DocFile) => {
    if (doc.storage_path) await supabase.storage.from("documents").remove([doc.storage_path]);
    const { error } = await supabase.from("documents").delete().eq("id", doc.id);
    if (error) { toast("Could not remove it", { description: error.message }); return; }
    onChanged();
  };
  const runConfirm = async () => {
    setBusy(true);
    if (confirm === "withdraw") await setStatus("Withdrawn");
    if (confirm === "delete") {
      for (const d of files) if (d.storage_path) await supabase.storage.from("documents").remove([d.storage_path]);
      const { error } = await supabase.from("insurance_claims").delete().eq("id", claim.id);
      if (error) toast("Could not delete the claim", { description: error.message }); else toast("Claim deleted");
      onChanged();
    }
    setBusy(false); setConfirm(null);
  };

  return <div className="space-y-6 border-t border-border/70 px-5 pb-6 pt-5 sm:px-7">
    {claim.status !== "Withdrawn" && <ol className="grid grid-cols-4 gap-2" aria-label="Claim progress">
      {PROGRESS.map((label, i) => {
        const text = i === 2 && step >= 2 && claim.status !== "Paid" ? claim.status : i === 2 && claim.status === "Paid" && claim.approved_amount !== null ? "Approved" : label;
        const done = i < step || (i === step && claim.status === "Paid");
        const current = i === step && claim.status !== "Paid";
        const declined = i === 2 && claim.status === "Declined";
        return <li key={label} className="min-w-0">
          <div className={`h-1.5 rounded-full ${declined ? "bg-destructive" : done || current ? "bg-primary" : "bg-secondary"} ${current && !declined ? "opacity-60" : ""}`}/>
          <p className={`mt-2 truncate text-[11px] ${current || declined ? "font-semibold text-foreground" : done ? "text-foreground" : "text-muted-foreground"}`}>{text}</p>
        </li>;
      })}
    </ol>}

    <div className="grid grid-cols-2 gap-5 sm:grid-cols-4">
      <Stat label="Claimed" value={money(claim.claim_amount)}/>
      <Stat label="Excess" value={money(claim.excess)}/>
      <Stat label="Insurer covers" value={claim.status === "Declined" ? money(0) : money(claim.approved_amount)}/>
      <Stat label="Building pays" value={money(pays)} strong/>
    </div>

    <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
      <Stat label="Policy" value={policy ? `${policy.policy_type}${policy.insurer ? ` · ${policy.insurer}` : ""}` : "Not linked"}/>
      <Stat label="Claim number" value={claim.claim_number ?? "—"}/>
      <Stat label="Responsible person" value={responsibleLabel(claim, lots)}/>
      <Stat label="Incident" value={niceDate(claim.incident_date)}/>
      <Stat label="Lodged" value={niceDate(claim.lodged_date)}/>
      <Stat label="Decision" value={claim.decision_date ? niceDate(claim.decision_date) : "Pending"}/>
      <div className="min-w-0">
        <SectionLabel>Insurer's rep</SectionLabel>
        <p className="mt-1.5 text-sm font-medium">{claim.insurer_contact_name ?? "—"}</p>
        {claim.insurer_contact_phone && <a className="block text-[12px] text-primary hover:underline" href={`tel:${claim.insurer_contact_phone}`}>{claim.insurer_contact_phone}</a>}
        {claim.insurer_contact_email && <a className="block break-all text-[12px] text-primary hover:underline" href={`mailto:${claim.insurer_contact_email}`}>{claim.insurer_contact_email}</a>}
      </div>
      <Stat label="Work order" value={order ? `${order.title} (${order.status})` : "None"}/>
      {claim.payout_received_at && <Stat label="Payout received" value={niceDate(claim.payout_received_at)}/>}
    </div>

    {claim.description && <p className="text-[13px] leading-6 text-muted-foreground">{claim.description}</p>}
    {claim.decision_notes && <div className={`rounded-xl px-4 py-3 text-[13px] ${claim.status === "Declined" ? "bg-destructive/10" : "bg-secondary"}`}>
      <span className="font-medium">{claim.status === "Declined" ? "Reason declined: " : "Decision notes: "}</span>{claim.decision_notes}</div>}

    {isCommittee && <div className="flex flex-wrap gap-2">
      {(claim.status === "Draft" || claim.status === "Lodged") && <Button size="sm" variant="outline" className="rounded-full" onClick={() => { void setStatus(claim.status === "Draft" ? "Lodged" : "Under assessment"); }}>
        {claim.status === "Draft" ? "Mark lodged" : "Move to under assessment"}</Button>}
      {!closed && !["Approved", "Partially approved"].includes(claim.status) && <Button size="sm" className="rounded-full" onClick={() => setDecisionOpen(true)}>Record decision</Button>}
      {["Approved", "Partially approved"].includes(claim.status) && <>
        <Button size="sm" className="rounded-full" onClick={() => setPayoutOpen(true)}>Mark payout received</Button>
        <Button size="sm" variant="outline" className="rounded-full" onClick={() => setDecisionOpen(true)}>Change decision</Button>
      </>}
      <Button asChild size="sm" variant="outline" className="rounded-full">
        <label>{busy ? "Attaching…" : "Attach files"}<input type="file" multiple className="sr-only" onChange={e => { void attach(e.target.files); e.target.value = ""; }}/></label>
      </Button>
      <Button size="sm" variant="ghost" className="rounded-full" onClick={onEdit}><Pencil className="h-3.5 w-3.5"/> Edit</Button>
      {!closed && <Button size="sm" variant="ghost" className="rounded-full" onClick={() => setConfirm("withdraw")}>Withdraw</Button>}
      <Button size="sm" variant="ghost" className="rounded-full text-muted-foreground hover:text-destructive" onClick={() => setConfirm("delete")}><Trash2 className="h-3.5 w-3.5"/> Delete</Button>
    </div>}

    {files.length > 0 && <div className="flex flex-wrap gap-3">
      {files.map(doc => <DocPreviewTile key={doc.id} doc={doc} canRemove={isCommittee} onOpen={d => { void openDoc(d); }} onRemove={d => { void removeDoc(d); }}/>)}
    </div>}

    <div>
      <SectionLabel>Progress notes</SectionLabel>
      <div className="mt-3 flex gap-2">
        <Input value={note} onChange={e => setNote(e.target.value)} placeholder="Add an update, e.g. assessor visited" aria-label="Add a note"
          onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); void addNote(); } }}/>
        <Button size="sm" variant="outline" className="shrink-0 rounded-full" onClick={() => { void addNote(); }}>Add</Button>
      </div>
      <ul className="mt-3 divide-y divide-border/70">
        {updates.map(u => <li key={u.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2.5 text-[13px]">
          <span>{u.note}</span>
          <span className="text-[11px] text-muted-foreground">{niceDate(u.created_at)}{u.author_label ? ` · ${u.author_label}` : ""}</span>
        </li>)}
        {updates.length === 0 && <li className="py-2.5 text-[13px] text-muted-foreground">No notes yet.</li>}
      </ul>
    </div>

    {decisionOpen && <DecisionDialog open={decisionOpen} onOpenChange={setDecisionOpen} claim={claim} onDone={onChanged}/>}
    {payoutOpen && <PayoutDialog open={payoutOpen} onOpenChange={setPayoutOpen} claim={claim} funds={funds} policy={policy} onDone={onChanged}/>}
    <ConfirmDialog open={!!confirm} onOpenChange={o => { if (!o) setConfirm(null); }} busy={busy}
      title={confirm === "delete" ? "Delete this claim?" : "Withdraw this claim?"}
      body={confirm === "delete" ? "The claim, its notes and attachments are removed. Any payout already in Finance stays there." : "The claim moves to Closed as withdrawn. You can still see it there."}
      confirmLabel={confirm === "delete" ? "Delete claim" : "Withdraw claim"} onConfirm={() => { void runConfirm(); }}/>
  </div>;
}

export function ClaimsSection({ claims, policies, lots, orders, funds, documents, isCommittee, schemeId, onChanged, logFor, onLogHandled }: {
  claims: Claim[]; policies: Policy[]; lots: ClaimLot[]; orders: ClaimOrder[]; funds: ClaimFund[]; documents: DocFile[];
  isCommittee: boolean; schemeId?: string | undefined; onChanged: () => void; logFor: string | null | undefined; onLogHandled: () => void;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [editing, setEditing] = useState<Claim | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [showClosed, setShowClosed] = useState(false);
  const dialogOpen = formOpen || logFor !== undefined;
  const open = claims.filter(c => !CLOSED_CLAIM_STATUSES.includes(c.status));
  const closed = claims.filter(c => CLOSED_CLAIM_STATUSES.includes(c.status));

  const row = (c: Claim) => {
    const policy = policies.find(p => p.id === c.policy_id);
    const isOpen = expanded === c.id;
    return <li key={c.id}>
      <button type="button" className="flex w-full items-start gap-3 px-5 py-4 text-left hover:bg-secondary/40 sm:px-7" aria-expanded={isOpen} onClick={() => setExpanded(isOpen ? null : c.id)}>
        {isOpen ? <ChevronDown className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground"/> : <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground"/>}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">{c.title}</p>
          <p className="mt-1 text-[12px] text-muted-foreground">
            {policy?.policy_type ?? "No policy"}{c.claim_number ? ` · #${c.claim_number}` : ""} · {responsibleLabel(c, lots)}
          </p>
          <p className="mt-1 text-[12px] text-muted-foreground">Claimed {money(c.claim_amount)}{c.approved_amount !== null && c.status !== "Declined" ? ` · Covered ${money(c.approved_amount)}` : ""}</p>
        </div>
        <ClaimPill status={c.status}/>
      </button>
      {isOpen && <ClaimDetail claim={c} policies={policies} lots={lots} orders={orders} funds={funds} documents={documents}
        isCommittee={isCommittee} schemeId={schemeId} onChanged={onChanged} onEdit={() => { setEditing(c); setFormOpen(true); }}/>}
    </li>;
  };

  return <section className="mt-12">
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Claims</p>
        <h2 className="mt-2 font-display text-2xl tracking-[-0.02em]">Insurance claims</h2>
        <p className="mt-2 max-w-xl text-[13px] text-muted-foreground">Follow each claim from lodgement to payout: who's handling it, the insurer's rep, what's claimed and what the building carries.</p>
      </div>
      {isCommittee && <Button className="rounded-full" onClick={() => { setEditing(null); setFormOpen(true); }} disabled={!schemeId}><Plus/> Log a claim</Button>}
    </div>

    <div className="mt-6 overflow-hidden rounded-2xl border border-border bg-card">
      {open.length > 0 ? <ul className="divide-y divide-border/70">{open.map(row)}</ul>
        : <p className="px-7 py-8 text-center text-sm text-muted-foreground">No open claims.</p>}
      {closed.length > 0 && <div className="border-t border-border">
        <button type="button" className="flex w-full items-center gap-2 px-5 py-3 text-[12px] font-medium text-muted-foreground hover:bg-secondary/40 sm:px-7" onClick={() => setShowClosed(v => !v)} aria-expanded={showClosed}>
          {showClosed ? <ChevronDown className="h-4 w-4"/> : <ChevronRight className="h-4 w-4"/>} Closed ({closed.length})
        </button>
        {showClosed && <ul className="divide-y divide-border/70 border-t border-border/70">{closed.map(row)}</ul>}
      </div>}
    </div>

    {dialogOpen && <ClaimDialog key={editing?.id ?? `new-${logFor ?? ""}`} open={dialogOpen}
      onOpenChange={v => { if (!v) { setFormOpen(false); setEditing(null); onLogHandled(); } }}
      schemeId={schemeId} claim={editing} policies={policies} lots={lots} orders={orders} defaultPolicyId={logFor}
      onSaved={id => { setExpanded(id); onChanged(); }}/>}
  </section>;
}
