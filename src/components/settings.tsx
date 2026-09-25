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

export type SchemeSettings = {
  id: string; scheme_id: string;
  notify_new_work_order: boolean; notify_new_document: boolean; notify_levy_due: boolean;
  currency_code: string; date_format: string;
};
export type CommitteeRole = { id: string; lot_id: string; role: string };

type Scheme = { id: string; name: string; address: string; total_lots: number; tier: string | null; next_agm_date: string | null };
type Lot = { id: string; lot_number: number; owner_name: string | null; owner_email: string | null; owner_phone: string | null; entitlement_percent: number };

const ROLE_OPTIONS = ["Chairperson", "Secretary", "Treasurer", "Member"];
const CURRENCIES = ["AUD", "NZD", "USD"];
const DATE_FORMATS = ["DD/MM/YYYY", "MM/DD/YYYY", "YYYY-MM-DD"];

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
      next_agm_date: text("next_agm_date"),
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
          <div className="space-y-2"><Label htmlFor="tier">Tier</Label><Input id="tier" name="tier" defaultValue={scheme.tier ?? ""} placeholder="Tier 3"/></div>
        </div>
        <div className="space-y-2"><Label htmlFor="next_agm_date">Next AGM date</Label><Input id="next_agm_date" name="next_agm_date" type="date" defaultValue={scheme.next_agm_date ?? ""}/></div>
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
    const { error } = await supabase.from("schemes").insert(payload);
    if (error) { toast("Could not create your building", { description: error.message }); return; }
    onOpenChange(false); onSaved(); toast("Building created");
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

export function SettingsSection({ scheme, lots, committeeRoles, settings, isCommittee, schemeId, onChanged }: {
  scheme: Scheme | null; lots: Lot[]; committeeRoles: CommitteeRole[]; settings: SchemeSettings | null;
  isCommittee: boolean; schemeId?: string | undefined; onChanged: () => void;
}) {
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
    <PageHead eyebrow="Your property" title="Settings" blurb="Your building's details, who holds a committee role, and how Loty notifies and formats things for everyone."/>

    <Card className="mt-10 overflow-hidden">
      <SectionHeading title="Building details" blurb="The basics your owners and levies are built around."
        action={isCommittee && scheme ? <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" className="rounded-full" onClick={()=>navigate({ to: "/onboarding" })}><Compass className="size-3.5"/>Run setup guide</Button>
          <Button variant="outline" size="sm" className="rounded-full" onClick={()=>setEditingScheme(true)}><Pencil className="size-3.5"/>Edit</Button>
        </div> : undefined}/>
      {scheme
        ? <div className="grid gap-5 p-7 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Building name" value={scheme.name}/>
            <Field label="Address" value={scheme.address}/>
            <Field label="Total lots" value={String(scheme.total_lots)}/>
            <Field label="Tier" value={scheme.tier ?? "Not recorded"}/>
            <Field label="Next AGM" value={scheme.next_agm_date ? new Date(scheme.next_agm_date).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" }) : "Not scheduled"}/>
          </div>
        : isCommittee
          ? <div className="p-7 text-center">
              <p className="text-sm text-muted-foreground">No building set up yet. Create it to get started.</p>
              <Button className="mt-4 rounded-full" onClick={()=>setCreatingScheme(true)}><Plus className="size-3.5"/>Create your building</Button>
            </div>
          : <p className="p-7 text-sm text-muted-foreground">No building set up yet.</p>}
    </Card>

    <Card className="mt-6 overflow-hidden">
      <SectionHeading title="People & roles" blurb="Owners on record and who holds a committee position."
        action={isCommittee && lots.length > 0 ? <Button size="sm" className="rounded-full" onClick={()=>setAddingRole(true)}><Plus className="size-3.5"/>Add role</Button> : undefined}/>
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

    <Card className="mt-6 overflow-hidden">
      <SectionHeading title="App preferences" blurb="Notifications, currency and date format for everyone viewing this building."/>
      <div className="divide-y divide-border/70">
        {([
          ["notify_new_work_order", "New work order notices", "Notify when a repair or maintenance request comes in."],
          ["notify_new_document", "New document notices", "Notify when a file is added to Documents."],
          ["notify_levy_due", "Levy due reminders", "Notify as a levy's due date approaches."],
        ] as const).map(([key, label, blurb]) =>
          <div key={key} className="flex items-center justify-between gap-4 px-7 py-4">
            <div><p className="text-sm font-medium">{label}</p><p className="mt-1 text-[12px] text-muted-foreground">{blurb}</p></div>
            <Switch checked={settings?.[key] ?? true} disabled={!isCommittee} onCheckedChange={(checked)=>{ void setPreference({ [key]: checked } as Partial<SchemeSettings>); }}/>
          </div>)}
        <div className="grid gap-5 px-7 py-5 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Currency</Label>
            <Select value={settings?.currency_code ?? "AUD"} disabled={!isCommittee} onValueChange={(v)=>{ void setPreference({ currency_code: v }); }}>
              <SelectTrigger className="w-full"><SelectValue/></SelectTrigger>
              <SelectContent>{CURRENCIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Date format</Label>
            <Select value={settings?.date_format ?? "DD/MM/YYYY"} disabled={!isCommittee} onValueChange={(v)=>{ void setPreference({ date_format: v }); }}>
              <SelectTrigger className="w-full"><SelectValue/></SelectTrigger>
              <SelectContent>{DATE_FORMATS.map(f => <SelectItem key={f} value={f}>{f}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </div>
      </div>
    </Card>

    {scheme && <SchemeDialog open={editingScheme} onOpenChange={setEditingScheme} scheme={scheme} onSaved={onChanged}/>}
    {creatingScheme && <CreateSchemeDialog open={creatingScheme} onOpenChange={setCreatingScheme} onSaved={onChanged}/>}
    {addingRole && <AddRoleDialog open={addingRole} onOpenChange={setAddingRole} lots={lots} onSaved={onChanged}/>}
  </div>;
}
