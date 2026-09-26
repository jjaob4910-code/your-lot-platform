import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, Check, FileCheck2, ShieldCheck, WalletCards, Wrench } from "lucide-react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";
import {
  money, type Lot, type Scheme,
} from "@/routes/dashboard";
import { CreateBudgetDialog, type DraftLine } from "@/components/finance";

export const Route = createFileRoute("/onboarding")({
  head: () => ({ meta: [
    { title: "Set up your building | Loty" },
    { name: "description", content: "A short guided setup: lots and owners, insurance, maintenance, finances, levies and compliance." },
  ]}),
  component: OnboardingPage,
});

type Levy = { id: string; amount: number; lots: { lot_number: number; owner_name: string | null } | null };

const STEPS = [
  { key: "building", label: "Building", icon: Building2 },
  { key: "lots", label: "Lots & owners", icon: Building2 },
  { key: "insurance", label: "Insurance", icon: ShieldCheck },
  { key: "maintenance", label: "Maintenance", icon: Wrench },
  { key: "finance", label: "Finance", icon: WalletCards },
  { key: "levies", label: "Levies", icon: WalletCards },
  { key: "compliance", label: "Compliance", icon: FileCheck2 },
] as const;

function StepShell({ index, title, blurb, children, footer }: {
  index: number; title: string; blurb: string; children: React.ReactNode; footer: React.ReactNode;
}) {
  const step = STEPS[index] ?? STEPS[0];
  return <div className="mx-auto w-full max-w-2xl px-4 py-14 sm:px-0">
    <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Step {index + 1} of {STEPS.length} · {step.label}</p>
    <h1 className="mt-4 text-3xl font-medium tracking-[-0.03em] sm:text-4xl">{title}</h1>
    <p className="mt-3 text-[15px] leading-7 text-muted-foreground">{blurb}</p>
    <div className="mt-8 soft-shadow rounded-3xl border border-border/70 bg-card p-7">{children}</div>
    <div className="mt-6 flex items-center justify-between">{footer}</div>
  </div>;
}

function ProgressDots({ index }: { index: number }) {
  return <div className="mx-auto flex max-w-2xl items-center gap-1.5 px-4 pt-8 sm:px-0">
    {STEPS.map((s, i) => <span key={s.key} className={`h-1.5 flex-1 rounded-full ${i <= index ? "bg-primary" : "bg-secondary"}`} />)}
  </div>;
}

function BuildingStep({ onCreated }: { onCreated: (scheme: Scheme) => void }) {
  const [submitting, setSubmitting] = useState(false);
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const payload = {
      name: String(form.get("name") ?? "").trim(),
      address: String(form.get("address") ?? "").trim(),
      total_lots: Number(form.get("total_lots")),
    };
    setSubmitting(true);
    const { data, error } = await supabase.from("schemes").insert(payload).select().single();
    setSubmitting(false);
    if (error || !data) { toast("Could not create your building", { description: error?.message }); return; }
    toast("Building created");
    onCreated(data as Scheme);
  };
  return <form id="building-form" onSubmit={submit} className="space-y-4">
    <div className="space-y-2"><Label htmlFor="name">Building name</Label><Input id="name" name="name" placeholder="Banksia Court" required/></div>
    <div className="space-y-2"><Label htmlFor="address">Address</Label><Input id="address" name="address" placeholder="12 Banksia Street, Brunswick VIC 3056" required/></div>
    <div className="space-y-2"><Label htmlFor="total_lots">Total lots</Label><Input id="total_lots" name="total_lots" type="number" min="1" defaultValue={1} required/></div>
    <Button type="submit" className="hidden" disabled={submitting}>Continue</Button>
  </form>;
}

function LotsStep({ schemeId, lots, onAdded }: { schemeId: string; lots: Lot[]; onAdded: () => void }) {
  const [submitting, setSubmitting] = useState(false);
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const lotNumber = Number(form.get("lot_number"));
    if (!lotNumber) { toast("Add a lot number first"); return; }
    setSubmitting(true);
    const { error } = await supabase.from("lots").insert({
      scheme_id: schemeId, lot_number: lotNumber,
      owner_name: String(form.get("owner_name") ?? "").trim() || null,
      owner_email: String(form.get("owner_email") ?? "").trim() || null,
      owner_phone: String(form.get("owner_phone") ?? "").trim() || null,
      entitlement_percent: Number(form.get("entitlement_percent")) || 0,
    });
    setSubmitting(false);
    if (error) { toast("Could not add that lot", { description: error.message }); return; }
    (e.target as HTMLFormElement).reset();
    onAdded();
  };
  return <div className="space-y-5">
    {lots.length > 0 && <div className="divide-y divide-border/70 rounded-2xl border border-border/70">
      {lots.map(l => <div key={l.id} className="flex items-center justify-between px-4 py-2.5 text-[13px]">
        <span>Lot {l.lot_number}{l.owner_name ? ` · ${l.owner_name}` : ""}</span>
        <span className="text-muted-foreground">{l.entitlement_percent}% · {l.owner_email ?? "No email yet"}</span>
      </div>)}
    </div>}
    <form onSubmit={submit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2"><Label htmlFor="lot_number">Lot number</Label><Input id="lot_number" name="lot_number" type="number" min="1" required/></div>
        <div className="space-y-2"><Label htmlFor="entitlement_percent">Ownership allotment (%)</Label><Input id="entitlement_percent" name="entitlement_percent" type="number" min="0" step="0.001" placeholder="e.g. 12.5"/></div>
        <div className="space-y-2"><Label htmlFor="owner_name">Owner name</Label><Input id="owner_name" name="owner_name"/></div>
        <div className="space-y-2"><Label htmlFor="owner_email">Owner email</Label><Input id="owner_email" name="owner_email" type="email" placeholder="Needed for them to sign up and link to this lot"/></div>
        <div className="space-y-2"><Label htmlFor="owner_phone">Owner phone</Label><Input id="owner_phone" name="owner_phone" type="tel"/></div>
      </div>
      <Button type="submit" variant="outline" className="rounded-full" disabled={submitting}>{submitting ? "Adding…" : "Add this lot"}</Button>
    </form>
  </div>;
}

const COVER_TYPES = ["Building", "Contents", "Common property", "Other"];

function InsuranceStep({ schemeId, policies, onAdded }: { schemeId: string; policies: { id: string; policy_type: string; insurer: string | null }[]; onAdded: () => void }) {
  const [submitting, setSubmitting] = useState(false);
  const [type, setType] = useState("Building");
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const num = (key: string) => { const v = String(form.get(key) ?? "").trim(); return v === "" ? null : Number(v); };
    const policyType = type === "Other" ? (String(form.get("policy_type_other") ?? "").trim() || "Other") : type;
    setSubmitting(true);
    const { error } = await supabase.from("insurance_policies").insert({
      scheme_id: schemeId, policy_type: policyType,
      insurer: String(form.get("insurer") ?? "").trim() || null,
      sum_insured: num("sum_insured"), premium: num("premium"),
      renewal_date: String(form.get("renewal_date") ?? "").trim() || null,
    });
    setSubmitting(false);
    if (error) { toast("Could not add that policy", { description: error.message }); return; }
    (e.target as HTMLFormElement).reset();
    setType("Building");
    onAdded();
  };
  return <div className="space-y-5">
    {policies.length > 0 && <div className="divide-y divide-border/70 rounded-2xl border border-border/70">
      {policies.map(p => <div key={p.id} className="flex items-center justify-between px-4 py-2.5 text-[13px]"><span>{p.policy_type}</span><span className="text-muted-foreground">{p.insurer ?? "Provider not recorded"}</span></div>)}
    </div>}
    <form onSubmit={submit} className="space-y-4">
      <div className="space-y-2">
        <Label>Cover type</Label>
        <Select value={type} onValueChange={setType}>
          <SelectTrigger className="w-full"><SelectValue/></SelectTrigger>
          <SelectContent>{COVER_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      {type === "Other" && <div className="space-y-2"><Label htmlFor="policy_type_other">What kind of cover</Label><Input id="policy_type_other" name="policy_type_other" placeholder="e.g. Machinery breakdown"/></div>}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2"><Label htmlFor="insurer">Insurance provider</Label><Input id="insurer" name="insurer" placeholder="CHU, SUU, Allianz"/></div>
        <div className="space-y-2"><Label htmlFor="renewal_date">Renewal date</Label><Input id="renewal_date" name="renewal_date" type="date"/></div>
        <div className="space-y-2"><Label htmlFor="sum_insured">Sum insured (AUD)</Label><Input id="sum_insured" name="sum_insured" type="number"/></div>
        <div className="space-y-2"><Label htmlFor="premium">Annual premium (AUD)</Label><Input id="premium" name="premium" type="number"/></div>
      </div>
      <Button type="submit" variant="outline" className="rounded-full" disabled={submitting}>{submitting ? "Adding…" : "Add this policy"}</Button>
    </form>
  </div>;
}

function MaintenanceStep({ schemeId, requests, onAdded }: { schemeId: string; requests: { id: string; title: string; kind: string }[]; onAdded: () => void }) {
  const [submitting, setSubmitting] = useState(false);
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const title = String(form.get("title") ?? "").trim();
    if (!title) { toast("Give it a short title first"); return; }
    setSubmitting(true);
    const { error } = await supabase.from("maintenance_requests").insert({
      scheme_id: schemeId, title, kind: String(form.get("kind") ?? "Repair"),
      description: String(form.get("description") ?? "").trim() || null,
    });
    setSubmitting(false);
    if (error) { toast("Could not add that", { description: error.message }); return; }
    (e.target as HTMLFormElement).reset();
    onAdded();
  };
  return <div className="space-y-5">
    {requests.length > 0 && <div className="divide-y divide-border/70 rounded-2xl border border-border/70">
      {requests.map(r => <div key={r.id} className="flex items-center justify-between px-4 py-2.5 text-[13px]"><span>{r.title}</span><span className="text-muted-foreground">{r.kind}</span></div>)}
    </div>}
    <form onSubmit={submit} className="space-y-4">
      <div className="space-y-2"><Label htmlFor="title">What needs doing</Label><Input id="title" name="title" placeholder="Leaking gutter above carport"/></div>
      <div className="space-y-2">
        <Label>Type</Label>
        <Select name="kind" defaultValue="Repair">
          <SelectTrigger className="w-full"><SelectValue/></SelectTrigger>
          <SelectContent><SelectItem value="Repair">Repair</SelectItem><SelectItem value="Request">Request</SelectItem></SelectContent>
        </Select>
      </div>
      <div className="space-y-2"><Label htmlFor="description">Details (optional)</Label><Input id="description" name="description"/></div>
      <Button type="submit" variant="outline" className="rounded-full" disabled={submitting}>{submitting ? "Adding…" : "Add this item"}</Button>
    </form>
  </div>;
}

function OnboardingPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [session, setSession] = useState<Session | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [step, setStep] = useState(0);
  const [scheme, setScheme] = useState<Scheme | null>(null);
  const [budgetOpen, setBudgetOpen] = useState(false);
  const [budgetCreated, setBudgetCreated] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setAuthChecked(true);
      if (!data.session) navigate({ to: "/auth", replace: true });
    });
  }, [navigate]);

  const schemeQuery = useQuery({
    queryKey: ["onboarding-scheme"],
    queryFn: async () => {
      const { data, error } = await supabase.from("schemes").select("*").order("created_at").limit(1).maybeSingle();
      if (error) throw error;
      return data as Scheme | null;
    },
    enabled: !!session,
  });
  useEffect(() => {
    if (schemeQuery.data) {
      setScheme(schemeQuery.data);
      setStep(s => s === 0 ? 1 : s);
    }
  }, [schemeQuery.data]);
  const schemeId = scheme?.id;

  const lots = useQuery({
    queryKey: ["onboarding-lots", schemeId],
    queryFn: async () => {
      const { data, error } = await supabase.from("lots").select("*").eq("scheme_id", schemeId!).order("lot_number");
      if (error) throw error;
      return (data ?? []) as unknown as Lot[];
    },
    enabled: !!schemeId,
  });
  const policies = useQuery({
    queryKey: ["onboarding-insurance", schemeId],
    queryFn: async () => {
      const { data, error } = await supabase.from("insurance_policies").select("id, policy_type, insurer, premium").eq("scheme_id", schemeId!);
      if (error) throw error;
      return (data ?? []) as { id: string; policy_type: string; insurer: string | null; premium: number | null }[];
    },
    enabled: !!schemeId,
  });
  const requests = useQuery({
    queryKey: ["onboarding-maintenance", schemeId],
    queryFn: async () => {
      const { data, error } = await supabase.from("maintenance_requests").select("id, title, kind").eq("scheme_id", schemeId!);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!schemeId,
  });
  const levies = useQuery({
    queryKey: ["onboarding-levies", schemeId],
    queryFn: async () => {
      const { data, error } = await supabase.from("levies").select("id, amount, lots(lot_number, owner_name)").eq("lots.scheme_id", schemeId!);
      if (error) throw error;
      return (data ?? []) as unknown as Levy[];
    },
    enabled: !!schemeId && budgetCreated,
  });

  if (!authChecked || (session && schemeQuery.isLoading)) return null;

  const next = () => setStep(s => Math.min(s + 1, STEPS.length - 1));
  const prev = () => setStep(s => Math.max(scheme ? 1 : 0, s - 1));
  const finish = () => navigate({ to: "/dashboard", replace: true });
  const BackButton = ({ index }: { index: number }) => index > 0
    ? <Button variant="ghost" className="rounded-full" onClick={prev}>Back</Button>
    : <span/>;

  const insuranceLines: DraftLine[] = (policies.data ?? []).map(p => ({
    id: p.id, fund: "Admin", costType: "Fixed", description: `${p.policy_type} insurance${p.insurer ? ` — ${p.insurer}` : ""}`,
    amount: p.premium != null ? String(p.premium) : "", month: "", file: null,
  }));

  return <div className="relative isolate min-h-screen bg-background">
    <Toaster/>
    <ProgressDots index={step}/>

    {step === 0 && <StepShell index={0} title="Let's set up your building." blurb="This only takes a couple of minutes. You can skip anything and come back to it later from the normal dashboard."
      footer={<><span/><Button type="submit" form="building-form" className="rounded-full">Continue</Button></>}>
      <BuildingStep onCreated={(created)=>{ setScheme(created); queryClient.invalidateQueries({ queryKey: ["onboarding-scheme"] }); next(); }}/>
    </StepShell>}

    {step === 1 && schemeId && <StepShell index={1} title="Who are the lot owners?" blurb="Add as many as you know now — you can add the rest anytime from the Lots tab. An owner's email lets them sign up and see just their own lot."
      footer={<><BackButton index={1}/><div className="flex gap-2"><Button variant="ghost" className="rounded-full" onClick={next}>Skip for now</Button><Button className="rounded-full" onClick={next}>Continue</Button></div></>}>
      <LotsStep schemeId={schemeId} lots={lots.data ?? []} onAdded={()=>queryClient.invalidateQueries({ queryKey: ["onboarding-lots", schemeId] })}/>
    </StepShell>}

    {step === 2 && schemeId && <StepShell index={2} title="What's insured?" blurb="Building insurance is usually compulsory for an owners corporation. Add what you have on file — the renewal date will show up as a compliance reminder automatically, and the premium will be carried into your budget."
      footer={<><BackButton index={2}/><div className="flex gap-2"><Button variant="ghost" className="rounded-full" onClick={next}>Skip for now</Button><Button className="rounded-full" onClick={next}>Continue</Button></div></>}>
      <InsuranceStep schemeId={schemeId} policies={policies.data ?? []} onAdded={()=>queryClient.invalidateQueries({ queryKey: ["onboarding-insurance", schemeId] })}/>
    </StepShell>}

    {step === 3 && schemeId && <StepShell index={3} title="Any maintenance to log?" blurb="If there's a repair already on your mind — a leak, a broken gate — add it now. Most new buildings have nothing here yet, and that's fine."
      footer={<><BackButton index={3}/><div className="flex gap-2"><Button variant="ghost" className="rounded-full" onClick={next}>Nothing to log yet</Button><Button className="rounded-full" onClick={next}>Continue</Button></div></>}>
      <MaintenanceStep schemeId={schemeId} requests={requests.data ?? []} onAdded={()=>queryClient.invalidateQueries({ queryKey: ["onboarding-maintenance", schemeId] })}/>
    </StepShell>}

    {step === 4 && schemeId && <StepShell index={4} title="Work out this year's budget." blurb="This is the important one: add up what the building expects to spend and Loty works out what each lot owes, then issues the levies automatically."
      footer={<><BackButton index={4}/><div className="flex gap-2"><Button variant="ghost" className="rounded-full" onClick={next}>Skip for now</Button><Button className="rounded-full" onClick={next}>{budgetCreated ? "Continue" : "Continue without a budget"}</Button></div></>}>
      <div className="space-y-5">
        <div className="rounded-2xl border border-border/70 bg-secondary/40 p-4 text-[13px] leading-6">
          <p className="font-medium">A budget usually has two parts:</p>
          <p className="mt-2"><span className="font-medium">Admin fund</span> — the day-to-day running costs: insurance, cleaning, common-area electricity, management fees.</p>
          <p className="mt-1"><span className="font-medium">Maintenance fund</span> — bigger, less frequent repairs and capital works: roof repairs, repainting, lift servicing.</p>
        </div>
        {insuranceLines.length > 0 && !budgetCreated && <p className="text-sm text-muted-foreground">The {insuranceLines.length === 1 ? "insurance policy" : `${insuranceLines.length} insurance policies`} you added earlier will be pre-filled as a line item — adjust the amount if needed.</p>}
        {budgetCreated
          ? <p className="text-sm text-muted-foreground">Budget created — levies have been issued to every lot. You can review them on the next step.</p>
          : <p className="text-sm text-muted-foreground">This uses the same budget tool as the Levies tab: line items for what you expect to spend, split by lot entitlement or equally.</p>}
        <Button type="button" className="rounded-full" onClick={()=>setBudgetOpen(true)}>{budgetCreated ? "Create another budget" : "Create a budget"}</Button>
      </div>
    </StepShell>}

    {step === 5 && <StepShell index={5} title="Levies, worked out for you." blurb="Once a budget exists, Loty splits it across every lot automatically — no separate step needed. Here's what's been issued so far."
      footer={<><BackButton index={5}/><Button className="rounded-full" onClick={next}>Continue</Button></>}>
      {budgetCreated && (levies.data?.length ?? 0) > 0
        ? <div className="divide-y divide-border/70 rounded-2xl border border-border/70">
            {levies.data!.map(l => <div key={l.id} className="flex items-center justify-between px-4 py-2.5 text-[13px]">
              <span>Lot {l.lots?.lot_number ?? "?"}{l.lots?.owner_name ? ` · ${l.lots.owner_name}` : ""}</span>
              <span className="font-medium tabular-nums">{money(Number(l.amount))}</span>
            </div>)}
          </div>
        : <p className="text-sm text-muted-foreground">No levies yet — once you create a budget (on the previous step, or later from the Levies tab), each lot's share is issued automatically based on its entitlement.</p>}
    </StepShell>}

    {step === 6 && <StepShell index={6} title="Compliance, tracked automatically." blurb="Loty already keeps an eye on the obligations every owners corporation has: your AGM notice, insurance renewal, financial statements and maintenance plan. You'll see reminders on the Compliance tab as dates approach."
      footer={<><BackButton index={6}/><Button className="rounded-full" onClick={finish}><Check className="size-3.5"/>Finish setup</Button></>}>
      <div className="space-y-2 text-sm">
        {["AGM Notice", "Insurance Renewal", "Financial Statements", "Maintenance Plan"].map(w =>
          <div key={w} className="flex items-center gap-2 rounded-2xl border border-border/70 px-4 py-2.5"><Check className="size-3.5 text-primary"/><span>{w}</span></div>)}
      </div>
    </StepShell>}

    {schemeId && <CreateBudgetDialog key={`budget-${insuranceLines.length}`} open={budgetOpen} onOpenChange={setBudgetOpen} schemeId={schemeId} lots={lots.data ?? []} initialLines={insuranceLines.length > 0 ? insuranceLines : undefined}
      onCreated={()=>{ setBudgetCreated(true); queryClient.invalidateQueries({ queryKey: ["onboarding-levies", schemeId] }); }}/>}
  </div>;
}
