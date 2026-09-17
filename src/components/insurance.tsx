import { useState, type FormEvent } from "react";
import { FileText, Pencil, Plus, ShieldCheck, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import type { DocFile } from "@/components/documents";

export type Policy = {
  id: string; scheme_id: string; policy_type: string; insurer: string | null; broker: string | null;
  broker_contact: string | null; policy_number: string | null; sum_insured: number | null; excess: number | null;
  premium: number | null; start_date: string | null; renewal_date: string | null; notes: string | null;
};

const INSURANCE_FOLDER = "Insurance";
const POLICY_TYPES = ["Building", "Public liability", "Office bearers", "Voluntary workers", "Fidelity guarantee", "Machinery breakdown", "Other"];

const money = (n: number | null) => (n === null || n === undefined ? "Not recorded" : n.toLocaleString("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 }));
const niceDate = (value: string | null) => (value ? new Date(value).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" }) : "Not recorded");
const daysUntil = (date: string) => Math.ceil((new Date(date + "T00:00:00").getTime() - new Date(new Date().toDateString()).getTime()) / 86400000);

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`rounded-[26px] border border-border/70 bg-card ${className}`}>{children}</div>;
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

function Field({ label, value }: { label: string; value: string }) {
  return <div>
    <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
    <p className="mt-1.5 text-sm">{value}</p>
  </div>;
}

function RenewalNote({ date }: { date: string | null }) {
  if (!date) return <span className="text-[12px] text-muted-foreground">No renewal date yet</span>;
  const left = daysUntil(date);
  const tone = left < 0 ? "text-destructive font-medium" : left < 30 ? "text-destructive" : "text-muted-foreground";
  return <span className={`text-[12px] ${tone}`}>
    {left < 0 ? `Expired ${Math.abs(left)} days ago` : left === 0 ? "Renews today" : `Renews in ${left} days`}
  </span>;
}

function PolicyDialog({ open, onOpenChange, schemeId, policy, onSaved }: {
  open: boolean; onOpenChange: (v: boolean) => void; schemeId?: string | undefined; policy: Policy | null; onSaved: () => void;
}) {
  const [type, setType] = useState(policy?.policy_type ?? "Building");

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!schemeId) return;
    const form = new FormData(e.currentTarget);
    const text = (key: string) => { const v = String(form.get(key) ?? "").trim(); return v === "" ? null : v; };
    const num = (key: string) => { const v = text(key); return v === null ? null : Number(v); };
    const payload = {
      scheme_id: schemeId, policy_type: type, insurer: text("insurer"), broker: text("broker"),
      broker_contact: text("broker_contact"), policy_number: text("policy_number"), sum_insured: num("sum_insured"),
      excess: num("excess"), premium: num("premium"), start_date: text("start_date"), renewal_date: text("renewal_date"),
      notes: text("notes"),
    };
    const { error } = policy
      ? await supabase.from("insurance_policies").update(payload).eq("id", policy.id)
      : await supabase.from("insurance_policies").insert(payload);
    if (error) { toast("Could not save the policy", { description: error.message }); return; }
    onOpenChange(false); onSaved(); toast(policy ? "Policy updated" : "Policy added");
  };

  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-[560px]">
      <DialogHeader>
        <DialogTitle className="font-display tracking-[-0.02em]">{policy ? "Edit policy" : "Add a policy"}</DialogTitle>
        <DialogDescription>Who covers your building, for how much, and when it needs renewing.</DialogDescription>
      </DialogHeader>
      <form onSubmit={submit} className="space-y-4">
        <div className="space-y-2">
          <Label>Cover type</Label>
          <Select value={type} onValueChange={setType}>
            <SelectTrigger className="rounded-full"><SelectValue/></SelectTrigger>
            <SelectContent>{POLICY_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2"><Label htmlFor="insurer">Underwriter</Label><Input id="insurer" name="insurer" defaultValue={policy?.insurer ?? ""} placeholder="CHU, SUU, Allianz"/></div>
          <div className="space-y-2"><Label htmlFor="policy_number">Policy number</Label><Input id="policy_number" name="policy_number" defaultValue={policy?.policy_number ?? ""}/></div>
          <div className="space-y-2"><Label htmlFor="broker">Broker</Label><Input id="broker" name="broker" defaultValue={policy?.broker ?? ""}/></div>
          <div className="space-y-2"><Label htmlFor="broker_contact">Broker contact</Label><Input id="broker_contact" name="broker_contact" defaultValue={policy?.broker_contact ?? ""} placeholder="Email or phone"/></div>
          <div className="space-y-2"><Label htmlFor="sum_insured">Sum insured (AUD)</Label><Input id="sum_insured" name="sum_insured" type="number" step="1" defaultValue={policy?.sum_insured ?? ""}/></div>
          <div className="space-y-2"><Label htmlFor="excess">Excess (AUD)</Label><Input id="excess" name="excess" type="number" step="1" defaultValue={policy?.excess ?? ""}/></div>
          <div className="space-y-2"><Label htmlFor="premium">Annual premium (AUD)</Label><Input id="premium" name="premium" type="number" step="1" defaultValue={policy?.premium ?? ""}/></div>
          <div className="space-y-2"><Label htmlFor="start_date">Cover starts</Label><Input id="start_date" name="start_date" type="date" defaultValue={policy?.start_date ?? ""}/></div>
          <div className="space-y-2"><Label htmlFor="renewal_date">Renewal date</Label><Input id="renewal_date" name="renewal_date" type="date" defaultValue={policy?.renewal_date ?? ""}/></div>
        </div>
        <div className="space-y-2"><Label htmlFor="notes">Notes</Label><Textarea id="notes" name="notes" defaultValue={policy?.notes ?? ""} placeholder="What is covered, anything the committee should remember"/></div>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" className="rounded-full" onClick={()=>onOpenChange(false)}>Cancel</Button>
          <Button type="submit" className="rounded-full">Save</Button>
        </div>
      </form>
    </DialogContent>
  </Dialog>;
}

export function InsuranceSection({ policies, documents, isCommittee, schemeId, onChanged }: {
  policies: Policy[]; documents: DocFile[]; isCommittee: boolean; schemeId?: string | undefined; onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Policy | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const totalPremium = policies.reduce((sum, p) => sum + (p.premium ?? 0), 0);
  const dated = policies.filter(p => p.renewal_date).sort((a, b) => (a.renewal_date! < b.renewal_date! ? -1 : 1));
  const next = dated[0] ?? null;
  const building = policies.find(p => p.policy_type === "Building");

  const insuranceFolderId = async () => {
    if (!schemeId) return null;
    const { data } = await supabase.from("document_folders").select("id").eq("scheme_id", schemeId).eq("name", INSURANCE_FOLDER).maybeSingle();
    if (data?.id) return data.id as string;
    const { data: made, error } = await supabase.from("document_folders")
      .insert({ scheme_id: schemeId, name: INSURANCE_FOLDER, icon: "ShieldCheck", color: "blue" }).select("id").single();
    if (error) throw error;
    return made.id as string;
  };

  const attach = async (policy: Policy, files: FileList | null) => {
    if (!files?.length || !schemeId) return;
    setBusy(policy.id);
    try {
      const folderId = await insuranceFolderId();
      for (const file of Array.from(files)) {
        const path = `${schemeId}/${crypto.randomUUID()}-${file.name.replace(/[^\w.\-]/g, "_")}`;
        const { error: upErr } = await supabase.storage.from("documents").upload(path, file);
        if (upErr) throw upErr;
        const { error } = await supabase.from("documents").insert({
          scheme_id: schemeId, name: file.name, category: policy.policy_type, folder_id: folderId,
          insurance_policy_id: policy.id, storage_path: path, file_size: file.size, mime_type: file.type,
        });
        if (error) throw error;
      }
      onChanged();
      toast("Filed under Insurance in your documents");
    } catch (err) {
      toast("Could not attach that", { description: (err as Error).message });
    } finally { setBusy(null); }
  };

  const openDoc = async (doc: DocFile) => {
    if (!doc.storage_path) { toast("No file attached to this record"); return; }
    const { data, error } = await supabase.storage.from("documents").createSignedUrl(doc.storage_path, 600);
    if (error || !data) { toast("Could not open the file", { description: error?.message }); return; }
    window.open(data.signedUrl, "_blank");
  };

  const removeDoc = async (doc: DocFile) => {
    if (doc.storage_path) await supabase.storage.from("documents").remove([doc.storage_path]);
    const { error } = await supabase.from("documents").delete().eq("id", doc.id);
    if (error) { toast("Could not remove it", { description: error.message }); return; }
    onChanged(); toast("Removed");
  };

  const removePolicy = async (policy: Policy) => {
    const { error } = await supabase.from("insurance_policies").delete().eq("id", policy.id);
    if (error) { toast("Could not remove the policy", { description: error.message }); return; }
    onChanged(); toast("Policy removed");
  };

  return <div>
    <PageHead eyebrow="Your property" title="Insurance" blurb="Every policy on your building in one place: who underwrites it, what it cost, the policy number and when it renews. Attach the certificate of currency and it files itself under Insurance in your documents."
      action={isCommittee ? <Button className="rounded-full" onClick={()=>{ setEditing(null); setOpen(true); }}><Plus/> Add a policy</Button> : undefined}/>

    <div className="mt-10 grid gap-4 sm:grid-cols-3">
      <Card className="p-6">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Sum insured (building)</p>
        <p className="mt-3 text-3xl font-medium tracking-[-0.03em]">{building ? money(building.sum_insured) : "—"}</p>
        <p className="mt-2 text-[12px] text-muted-foreground">{building?.insurer ?? "No building policy recorded yet"}</p>
      </Card>
      <Card className="p-6">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Premiums each year</p>
        <p className="mt-3 text-3xl font-medium tracking-[-0.03em]">{policies.length ? money(totalPremium) : "—"}</p>
        <p className="mt-2 text-[12px] text-muted-foreground">{policies.length} {policies.length === 1 ? "policy" : "policies"} on record</p>
      </Card>
      <Card className="bg-primary p-6 text-primary-foreground">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] opacity-70">Next renewal</p>
        <p className="mt-3 text-3xl font-medium tracking-[-0.03em]">{next ? niceDate(next.renewal_date) : "—"}</p>
        <p className="mt-2 text-[12px] opacity-80">{next ? `${next.policy_type} · ${daysUntil(next.renewal_date!) < 0 ? "expired" : `${daysUntil(next.renewal_date!)} days away`}` : "Add a policy to start the countdown"}</p>
      </Card>
    </div>

    <div className="mt-6 space-y-4">
      {policies.map(policy => {
        const files = documents.filter(d => d.insurance_policy_id === policy.id);
        return <Card key={policy.id} className="p-7">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 grid size-9 place-items-center rounded-full bg-secondary"><ShieldCheck className="h-4 w-4 text-primary"/></span>
              <div>
                <p className="text-base font-medium">{policy.policy_type}</p>
                <p className="mt-1 text-[12px] text-muted-foreground">{policy.insurer ?? "Underwriter not recorded"}{policy.policy_number ? ` · Policy ${policy.policy_number}` : ""}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <RenewalNote date={policy.renewal_date}/>
              {isCommittee && <>
                <Button asChild variant="outline" size="sm" className="rounded-full">
                  <label>{busy === policy.id ? "Attaching" : "Attach document"}
                    <input type="file" multiple className="sr-only" onChange={e => { void attach(policy, e.target.files); e.target.value = ""; }}/>
                  </label>
                </Button>
                <Button variant="ghost" size="icon" className="rounded-full" aria-label={`Edit ${policy.policy_type}`} onClick={()=>{ setEditing(policy); setOpen(true); }}><Pencil className="h-4 w-4"/></Button>
                <Button variant="ghost" size="icon" className="rounded-full text-muted-foreground hover:text-destructive" aria-label={`Remove ${policy.policy_type}`} onClick={()=>{ void removePolicy(policy); }}><Trash2 className="h-4 w-4"/></Button>
              </>}
            </div>
          </div>

          <div className="mt-6 grid gap-5 border-t border-border/70 pt-6 sm:grid-cols-3 lg:grid-cols-4">
            <Field label="Sum insured" value={money(policy.sum_insured)}/>
            <Field label="Annual premium" value={money(policy.premium)}/>
            <Field label="Excess" value={money(policy.excess)}/>
            <Field label="Cover starts" value={niceDate(policy.start_date)}/>
            <Field label="Renews" value={niceDate(policy.renewal_date)}/>
            <Field label="Broker" value={policy.broker ?? "Not recorded"}/>
            <Field label="Broker contact" value={policy.broker_contact ?? "Not recorded"}/>
            <Field label="Policy number" value={policy.policy_number ?? "Not recorded"}/>
          </div>

          {policy.notes && <p className="mt-5 text-[13px] leading-6 text-muted-foreground">{policy.notes}</p>}

          <div className="mt-5 flex flex-wrap gap-2">
            {files.map(doc => <span key={doc.id} className="inline-flex items-center gap-2 rounded-full bg-secondary px-3 py-1.5 text-[12px]">
              <FileText className="h-3.5 w-3.5 text-muted-foreground"/>
              <button type="button" className="underline-offset-4 hover:underline" onClick={()=>{ void openDoc(doc); }}>{doc.name}</button>
              {isCommittee && <button type="button" aria-label={`Remove ${doc.name}`} className="text-muted-foreground hover:text-destructive" onClick={()=>{ void removeDoc(doc); }}>×</button>}
            </span>)}
            {files.length === 0 && <span className="text-[12px] text-muted-foreground">No certificate of currency attached yet.</span>}
          </div>
        </Card>;
      })}
      {policies.length === 0 && <Card className="p-10 text-center">
        <p className="text-sm text-muted-foreground">No policies recorded yet. Add your building cover first, then public liability and office bearers.</p>
      </Card>}
    </div>

    <PolicyDialog open={open} onOpenChange={setOpen} schemeId={schemeId} policy={editing} onSaved={onChanged} key={editing?.id ?? "new"}/>
  </div>;
}
