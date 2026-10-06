import { useState, type FormEvent } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Compass, Pencil, Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { InviteDialog } from "@/components/invite";
import { paymentDetails } from "@/lib/payment";

export type SchemeSettings = {
  id: string; scheme_id: string;
  notify_new_work_order: boolean; notify_new_document: boolean; notify_levy_due: boolean;
  currency_code: string; date_format: string;
  pay_account_name?: string | null; pay_bsb?: string | null; pay_account_number?: string | null; pay_reference?: string; pay_other?: string | null;
};
export type CommitteeRole = { id: string; lot_id: string; role: string };

type Scheme = { id: string; name: string; address: string; total_lots: number; tier: string | null; next_agm_date: string | null; next_agm_meeting_id?: string | null };
type Lot = { id: string; lot_number: number; owner_name: string | null; owner_email: string | null; owner_phone: string | null; entitlement_percent: number };

const ROLE_OPTIONS = ["Chairperson", "Secretary", "Treasurer", "Member"];

function PageHead({ eyebrow, title, blurb }: { eyebrow: string; title: string; blurb: string }) {
  return <div className="max-w-2xl">
    <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">{eyebrow}</p>
    <h1 className="mt-4 text-4xl font-medium tracking-[-0.035em] sm:text-5xl">{title}</h1>
    <p className="mt-5 text-[15px] leading-7 text-muted-foreground">{blurb}</p>
  </div>;
}

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <section className={`soft-shadow rounded-3xl border border-border/70 bg-card ${className}`}>{children}</section>;
}

function Field({ label, value }: { label: string; value: string }) {
  return <div>
    <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
    <p className="mt-1.5 text-sm">{value}</p>
  </div>;
}

function SectionHeading({ title, blurb, action }: { title: string; blurb: string; action?: React.ReactNode }) {
  return <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border/70 p-7 pb-5">
    <div>
      <h2 className="text-lg font-medium tracking-[-0.02em]">{title}</h2>
      <p className="mt-1 text-[13px] text-muted-foreground">{blurb}</p>
    </div>
    {action}
  </div>;
}

function SchemeDialog({ open, onOpenChange, scheme, onSaved }: {
  open: boolean; onOpenChange: (v: boolean) => void; scheme: Scheme; onSaved: () => void;
}) {
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const text = (key: string) => { const v = String(form.get(key) ?? "").trim(); return v === "" ? null : v; };
    const payload = {
      name: String(form.get("name") ?? "").trim(),
      address: String(form.get("address") ?? "").trim(),
      total_lots: Number(form.get("total_lots")),
      tier: text("tier"),
      // Left alone while the AGM tab owns the date (the field is disabled and not submitted).
      ...(scheme.next_agm_meeting_id ? {} : { next_agm_date: text("next_agm_date") }),
    };
    const { error } = await supabase.from("schemes").update(payload).eq("id", scheme.id);
    if (error) { toast("Could not save the building details", { description: error.message }); return; }
    onOpenChange(false); onSaved(); toast("Building details updated");
  };

  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent>
      <DialogHeader><DialogTitle className="font-display tracking-[-0.02em]">Edit building details</DialogTitle><DialogDescription>The basics your owners and levies are built around.</DialogDescription></DialogHeader>
      <form onSubmit={submit} className="space-y-4">
        <div className="space-y-2"><Label htmlFor="name">Building name</Label><Input id="name" name="name" defaultValue={scheme.name} required/></div>
        <div className="space-y-2"><Label htmlFor="address">Address</Label><Input id="address" name="address" defaultValue={scheme.address} required/></div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2"><Label htmlFor="total_lots">Total lots</Label><Input id="total_lots" name="total_lots" type="number" min="1" defaultValue={scheme.total_lots} required/></div>
          <div className="space-y-2"><Label htmlFor="tier">Tier</Label><Input id="tier" name="tier" defaultValue={scheme.tier ?? ""} placeholder="Tier 3"/>
            <p className="text-[12px] text-muted-foreground">Your owners corporation's tier (1–5) under Victorian law, set by lot count and annual fees. It decides some reporting and audit duties.</p></div>
        </div>
        {/* Once a meeting is scheduled in the AGM tab, that meeting's date is the one used everywhere. */}
        <div className="space-y-2"><Label htmlFor="next_agm_date">Next AGM date</Label>
          <Input id="next_agm_date" name="next_agm_date" type="date" defaultValue={scheme.next_agm_date ?? ""} disabled={!!scheme.next_agm_meeting_id}/>
          {scheme.next_agm_meeting_id && <p className="text-[12px] text-muted-foreground">Set by the meeting in the AGM tab. Change the date there.</p>}</div>
        <div className="flex justify-end gap-2 pt-2"><Button type="button" variant="ghost" className="rounded-full" onClick={()=>onOpenChange(false)}>Cancel</Button><Button type="submit" className="rounded-full">Save changes</Button></div>
      </form>
    </DialogContent>
  </Dialog>;
}

function CreateSchemeDialog({ open, onOpenChange, onSaved }: {
  open: boolean; onOpenChange: (v: boolean) => void; onSaved: () => void;
}) {
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const text = (key: string) => { const v = String(form.get(key) ?? "").trim(); return v === "" ? null : v; };
    const payload = {
      name: String(form.get("name") ?? "").trim(),
      address: String(form.get("address") ?? "").trim(),
      total_lots: Number(form.get("total_lots")),
      tier: text("tier"),
      next_agm_date: text("next_agm_date"),
    };
    // Creating a building makes you its committee; the extra details are saved straight after.
    const { data: id, error } = await supabase.rpc("create_building", { _name: payload.name, _address: payload.address, _total_lots: payload.total_lots });
    if (error || !id) { toast("Could not create your building", { description: error?.message }); return; }
    await supabase.from("schemes").update({ tier: payload.tier, next_agm_date: payload.next_agm_date }).eq("id", id);
    try { localStorage.setItem("loty-building", String(id)); } catch { /* storage unavailable */ }
    onOpenChange(false); onSaved(); toast("Building created");
    window.location.reload();
  };

  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent>
      <DialogHeader><DialogTitle className="font-display tracking-[-0.02em]">Create your building</DialogTitle><DialogDescription>The basics your owners and levies will be built around.</DialogDescription></DialogHeader>
      <form onSubmit={submit} className="space-y-4">
        <div className="space-y-2"><Label htmlFor="new_name">Building name</Label><Input id="new_name" name="name" placeholder="Banksia Court" required/></div>
        <div className="space-y-2"><Label htmlFor="new_address">Address</Label><Input id="new_address" name="address" placeholder="12 Banksia Street, Brunswick VIC 3056" required/></div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2"><Label htmlFor="new_total_lots">Total lots</Label><Input id="new_total_lots" name="total_lots" type="number" min="1" defaultValue={1} required/></div>
          <div className="space-y-2"><Label htmlFor="new_tier">Tier</Label><Input id="new_tier" name="tier" placeholder="Tier 3"/></div>
        </div>
        <div className="space-y-2"><Label htmlFor="new_next_agm_date">Next AGM date</Label><Input id="new_next_agm_date" name="next_agm_date" type="date"/></div>
        <div className="flex justify-end gap-2 pt-2"><Button type="button" variant="ghost" className="rounded-full" onClick={()=>onOpenChange(false)}>Cancel</Button><Button type="submit" className="rounded-full">Create building</Button></div>
      </form>
    </DialogContent>
  </Dialog>;
}

function AddRoleDialog({ open, onOpenChange, lots, onSaved }: {
  open: boolean; onOpenChange: (v: boolean) => void; lots: Lot[]; onSaved: () => void;
}) {
  const [lotId, setLotId] = useState<string>(lots[0]?.id ?? "");
  const [role, setRole] = useState<string>(ROLE_OPTIONS[0] ?? "Chairperson");

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!lotId) { toast("Add a lot first before assigning a role"); return; }
    const { error } = await supabase.from("committee_roles").insert({ lot_id: lotId, role });
    if (error) { toast("Could not add that role", { description: error.message }); return; }
    onOpenChange(false); onSaved(); toast("Role added");
  };

  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent>
      <DialogHeader><DialogTitle className="font-display tracking-[-0.02em]">Add a committee role</DialogTitle><DialogDescription>Assign a role to a lot's owner.</DialogDescription></DialogHeader>
      <form onSubmit={submit} className="space-y-4">
        <div className="space-y-2">
          <Label>Lot</Label>
          <Select value={lotId} onValueChange={setLotId}>
            <SelectTrigger className="w-full"><SelectValue/></SelectTrigger>
            <SelectContent>{lots.map(l => <SelectItem key={l.id} value={l.id}>Lot {l.lot_number}{l.owner_name ? ` · ${l.owner_name}` : ""}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Role</Label>
          <Select value={role} onValueChange={setRole}>
            <SelectTrigger className="w-full"><SelectValue/></SelectTrigger>
            <SelectContent>{ROLE_OPTIONS.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="flex justify-end gap-2 pt-2"><Button type="button" variant="ghost" className="rounded-full" onClick={()=>onOpenChange(false)}>Cancel</Button><Button type="submit" className="rounded-full" disabled={!lotId}>Add role</Button></div>
      </form>
    </DialogContent>
  </Dialog>;
}

// Where owners send their levy payments. Owners see this on their Finance page, levy invoices
// and reminder emails, with their own lot's reference filled in.
function PaymentDetailsCard({ settings, onSave }: { settings: SchemeSettings | null; onSave: (patch: Partial<Omit<SchemeSettings, "id" | "scheme_id">>) => Promise<void> }) {
  const [draft, setDraft] = useState({
    pay_account_name: settings?.pay_account_name ?? "", pay_bsb: settings?.pay_bsb ?? "", pay_account_number: settings?.pay_account_number ?? "",
    pay_reference: settings?.pay_reference ?? "LOT{lot}", pay_other: settings?.pay_other ?? "",
  });
  const [saving, setSaving] = useState(false);
  const set = (k: keyof typeof draft) => (e: React.ChangeEvent<HTMLInputElement>) => setDraft(d => ({ ...d, [k]: e.target.value }));
  const preview = paymentDetails(draft, 1);
  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (draft.pay_bsb && !/^\d{3}-?\d{3}$/.test(draft.pay_bsb.trim())) { toast("Check the BSB", { description: "A BSB is six digits, like 063-000." }); return; }
    setSaving(true);
    await onSave({
      pay_account_name: draft.pay_account_name.trim() || null, pay_bsb: draft.pay_bsb.trim() || null, pay_account_number: draft.pay_account_number.trim() || null,
      pay_reference: draft.pay_reference.trim() || "LOT{lot}", pay_other: draft.pay_other.trim() || null,
    });
    setSaving(false); toast("Payment details saved", { description: "Owners will see them on their Finance page and invoices." });
  };
  return <Card className="mt-6 overflow-hidden">
    <SectionHeading title="How owners pay" blurb="The building's bank account for levies. Owners see this on their Finance page, invoices and reminders, with their own reference."/>
    <form onSubmit={save} className="grid gap-4 p-7 sm:grid-cols-2">
      <div className="space-y-2"><Label htmlFor="pay_account_name">Account name</Label><Input id="pay_account_name" value={draft.pay_account_name} onChange={set("pay_account_name")} placeholder="Harbour View Owners Corporation"/></div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2"><Label htmlFor="pay_bsb">BSB</Label><Input id="pay_bsb" value={draft.pay_bsb} onChange={set("pay_bsb")} placeholder="063-000" inputMode="numeric"/></div>
        <div className="space-y-2"><Label htmlFor="pay_account_number">Account number</Label><Input id="pay_account_number" value={draft.pay_account_number} onChange={set("pay_account_number")} placeholder="1234 5678" inputMode="numeric"/></div>
      </div>
      <div className="space-y-2"><Label htmlFor="pay_reference">Payment reference</Label><Input id="pay_reference" value={draft.pay_reference} onChange={set("pay_reference")}/>
        <p className="text-[12px] text-muted-foreground">{"{lot}"} becomes the lot number, so each owner gets their own reference. Lot 1 would use “{preview?.reference ?? draft.pay_reference.replace(/\{lot\}/gi, "1")}”.</p></div>
      <div className="space-y-2"><Label htmlFor="pay_other">Other ways to pay (optional)</Label><Input id="pay_other" value={draft.pay_other} onChange={set("pay_other")} placeholder="PayID: levies@harbourview.org"/></div>
      <div className="flex items-center justify-end gap-2 sm:col-span-2">
        {!preview && <p className="mr-auto text-[12px] text-amber-700 dark:text-amber-300">Owners can't see how to pay until a BSB and account number (or another way to pay) are added.</p>}
        <Button type="submit" className="rounded-full" disabled={saving}>{saving ? "Saving…" : "Save payment details"}</Button>
      </div>
    </form>
  </Card>;
}

export function SettingsSection({ scheme, lots, committeeRoles, settings, isCommittee, schemeId, userId, notifyFundOverdrawn = true, onChanged }: {
  scheme: Scheme | null; lots: Lot[]; committeeRoles: CommitteeRole[]; settings: SchemeSettings | null;
  isCommittee: boolean; schemeId?: string | undefined; userId?: string | undefined; notifyFundOverdrawn?: boolean; onChanged: () => void;
}) {
  const [invitingCommittee, setInvitingCommittee] = useState(false);
  // Personal, not scheme-wide: each owner or committee member decides for themselves.
  const setMyPreference = async (patch: { notify_fund_overdrawn: boolean }) => {
    if (!userId) return;
    const { error } = await supabase.from("user_preferences").upsert({ user_id: userId, ...patch });
    if (error) { toast("Could not save that preference", { description: error.message }); return; }
    onChanged();
  };
  const navigate = useNavigate();
  const [editingScheme, setEditingScheme] = useState(false);
  const [creatingScheme, setCreatingScheme] = useState(false);
  const [addingRole, setAddingRole] = useState(false);

  const removeRole = async (role: CommitteeRole) => {
    const { error } = await supabase.from("committee_roles").delete().eq("id", role.id);
    if (error) { toast("Could not remove that role", { description: error.message }); return; }
    onChanged(); toast("Role removed");
  };

  const setPreference = async (patch: Partial<Omit<SchemeSettings, "id" | "scheme_id">>) => {
    if (!schemeId) return;
    const { error } = settings
      ? await supabase.from("scheme_settings").update(patch).eq("id", settings.id)
      : await supabase.from("scheme_settings").insert({ scheme_id: schemeId, ...patch });
    if (error) { toast("Could not save that preference", { description: error.message }); return; }
    onChanged();
  };

  return <div>
    <PageHead eyebrow="Your property" title="Settings" blurb={isCommittee ? "Your building's details, how owners pay, who's on the committee, and how Loty notifies people." : "Your building's details and your own notification choices."}/>

    <Card className="mt-10 overflow-hidden">
      <SectionHeading title={isCommittee ? "Building details" : "Your building"} blurb={isCommittee ? "The basics your owners and levies are built around." : "Run by your owners corporation committee."}
        action={isCommittee && scheme ? <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" className="rounded-full" onClick={()=>navigate({ to: "/onboarding" })}><Compass className="size-3.5"/>Run setup guide</Button>
          <Button variant="outline" size="sm" className="rounded-full" onClick={()=>setEditingScheme(true)}><Pencil className="size-3.5"/>Edit</Button>
        </div> : undefined}/>
      {scheme
        ? <div className="grid gap-5 p-7 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Building name" value={scheme.name}/>
            <Field label="Address" value={scheme.address}/>
            {isCommittee && <Field label="Total lots" value={String(scheme.total_lots)}/>}
            {isCommittee && <Field label="Tier" value={scheme.tier ?? "—"}/>}
            <Field label="Next AGM" value={scheme.next_agm_date ? new Date(scheme.next_agm_date).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" }) : "Not scheduled"}/>
          </div>
        : isCommittee
          ? <div className="p-7 text-center">
              <p className="text-sm text-muted-foreground">No building set up yet. Create it to get started.</p>
              <Button className="mt-4 rounded-full" onClick={()=>setCreatingScheme(true)}><Plus className="size-3.5"/>Create your building</Button>
            </div>
          : <p className="p-7 text-sm text-muted-foreground">No building set up yet.</p>}
    </Card>

    {isCommittee && scheme && <PaymentDetailsCard settings={settings} onSave={setPreference}/>}

    {isCommittee && <>
    <Card className="mt-6 overflow-hidden">
      <SectionHeading title="People & roles" blurb="Owners on record and who holds a committee position."
        action={isCommittee ? <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" className="rounded-full" onClick={()=>setInvitingCommittee(true)}>Invite a committee member</Button>
          {lots.length > 0 && <Button size="sm" className="rounded-full" onClick={()=>setAddingRole(true)}><Plus className="size-3.5"/>Add role</Button>}
        </div> : undefined}/>
      <InviteDialog open={invitingCommittee} onOpenChange={setInvitingCommittee} schemeId={schemeId} role="Committee" buildingName={scheme?.name}/>
      <div className="divide-y divide-border/70">{lots.map(lot =>
        <div key={lot.id} className="flex flex-wrap items-center justify-between gap-4 px-7 py-4">
          <div><p className="text-sm font-medium">Lot {lot.lot_number}{lot.owner_name ? ` · ${lot.owner_name}` : ""}</p><p className="mt-1 text-[12px] text-muted-foreground">{lot.owner_email ?? "No email on file"}{lot.owner_phone ? ` · ${lot.owner_phone}` : ""}</p></div>
          <span className="text-[12px] text-muted-foreground">{lot.entitlement_percent}% entitlement</span>
        </div>)}
        {lots.length === 0 && <p className="px-7 py-8 text-center text-sm text-muted-foreground">No lots yet — add lots first, then assign committee roles.</p>}
      </div>
      <div className="border-t border-border/70 p-7 pt-5">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Committee roles</p>
        <div className="mt-3 space-y-2">
          {committeeRoles.map(cr => {
            const lot = lots.find(l => l.id === cr.lot_id);
            return <div key={cr.id} className="flex items-center justify-between gap-4 rounded-2xl border border-border/70 px-4 py-2.5 text-[13px]">
              <span><span className="font-medium">{cr.role}</span> · {lot ? `Lot ${lot.lot_number}${lot.owner_name ? ` · ${lot.owner_name}` : ""}` : "Lot no longer on record"}</span>
              {isCommittee && <Button variant="ghost" size="icon" className="rounded-full text-muted-foreground hover:text-destructive" aria-label={`Remove ${cr.role}`} onClick={()=>{ void removeRole(cr); }}><Trash2 className="size-3.5"/></Button>}
            </div>;
          })}
          {committeeRoles.length === 0 && <p className="text-[13px] text-muted-foreground">No committee roles assigned yet.</p>}
        </div>
      </div>
    </Card>
    </>}

    <Card className="mt-6 overflow-hidden">
      <SectionHeading title="My notifications" blurb="Just for you. Everyone chooses their own."/>
      <div className="flex items-center justify-between gap-4 border-t border-border/70 px-7 py-4">
        <div><p className="text-sm font-medium">Fund overdrawn alerts</p><p className="mt-1 text-[12px] text-muted-foreground">Tell me when a fund goes below $0, based on what's recorded in Loty.</p></div>
        <Switch aria-label="Fund overdrawn alerts" checked={notifyFundOverdrawn} disabled={!userId} onCheckedChange={(checked)=>{ void setMyPreference({ notify_fund_overdrawn: checked }); }}/>
      </div>
    </Card>

    {isCommittee && <>
    <Card className="mt-6 overflow-hidden">
      <SectionHeading title="Building notifications" blurb="What the bell shows for everyone in this building."/>
      <div className="divide-y divide-border/70">
        {([
          ["notify_new_work_order", "New work orders", "Show the committee each new repair or job in the bell for a week."],
          ["notify_new_document", "New documents", "Show newly added documents in the bell for a week. Owners only see ones shared with them."],
          ["notify_levy_due", "Levy reminders", "Remind people when a levy is due within two weeks or overdue."],
        ] as const).map(([key, label, blurb]) =>
          <div key={key} className="flex items-center justify-between gap-4 px-7 py-4">
            <div><p className="text-sm font-medium">{label}</p><p className="mt-1 text-[12px] text-muted-foreground">{blurb}</p></div>
            <Switch checked={settings?.[key] ?? true} disabled={!isCommittee} onCheckedChange={(checked)=>{ void setPreference({ [key]: checked } as Partial<SchemeSettings>); }}/>
          </div>)}
      </div>
    </Card>
    </>}

    {scheme && <SchemeDialog open={editingScheme} onOpenChange={setEditingScheme} scheme={scheme} onSaved={onChanged}/>}
    {creatingScheme && <CreateSchemeDialog open={creatingScheme} onOpenChange={setCreatingScheme} onSaved={onChanged}/>}
    {addingRole && <AddRoleDialog open={addingRole} onOpenChange={setAddingRole} lots={lots} onSaved={onChanged}/>}
  </div>;
}
