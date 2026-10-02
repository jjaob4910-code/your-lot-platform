import { useState } from "react";
import { Briefcase, Check, Coins, ExternalLink, FileText, Link2, Paperclip, Plus, ShieldCheck, Upload, Vote, Wrench, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import type { DocFile } from "@/components/documents";
import { DocPreviewTile } from "@/components/insurance";

// ─── Shared types ────────────────────────────────────────────────────────────

export type ResolutionType = "Ordinary" | "Special" | "Unanimous";
export type VoteChoice = "For" | "Against" | "Abstain";
export type ItemLink = { type: "work_order" | "budget" | "levies" | "fund" | "policy" | "claim"; id: string };
export type VoterLot = { id: string; lot_number: number; owner_name: string | null; entitlement_percent: number };

/** Everything the AGM can reference elsewhere in Loty — already loaded on the dashboard, so link cards stay live. */
export type AgmContextData = {
  orders: { id: string; title: string; status: string; work_order_quotes?: { amount: number; status: string }[] }[];
  policies: { id: string; policy_type: string; insurer: string | null; sum_insured: number | null; renewal_date: string | null }[];
  claims: { id: string; title: string; status: string; claim_amount: number | null; approved_amount: number | null }[];
  budgets: { id: string; financial_year: string; total_amount: number }[];
  levies: { id: string; budget_id: string; amount: number; status: string }[];
  funds: { id: string; name: string }[];
  fundBalances: Record<string, number>;
  goTo?: (target: string) => void;
};

const money = (n: number | null | undefined) => n === null || n === undefined ? "—" : Number(n).toLocaleString("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 });
const niceDate = (v: string | null) => v ? new Date(`${v.slice(0, 10)}T00:00:00`).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" }) : "—";
const lotName = (l: VoterLot) => `Lot ${l.lot_number}${l.owner_name ? ` · ${l.owner_name}` : ""}`;

// ─── Resolutions and votes ───────────────────────────────────────────────────

export const RESOLUTION_HELP: Record<ResolutionType, string> = {
  Ordinary: "Passes with a majority of the votes cast.",
  Special: "Passes with at least 75% of total lot entitlement voting for it.",
  Unanimous: "Passes only if every lot's entitlement votes for it.",
};

/** Tally the per-lot votes and work out whether the resolution reaches its threshold. */
export function tallyVotes(votes: Record<string, VoteChoice> | undefined, lots: VoterLot[], type: ResolutionType) {
  const v = votes ?? {};
  const totalEnt = lots.reduce((s, l) => s + Number(l.entitlement_percent || 0), 0) || 100;
  const count = { For: 0, Against: 0, Abstain: 0 } as Record<VoteChoice, number>;
  const ent = { For: 0, Against: 0, Abstain: 0 } as Record<VoteChoice, number>;
  for (const l of lots) { const c = v[l.id]; if (c) { count[c] += 1; ent[c] += Number(l.entitlement_percent || 0); } }
  const pct = (x: number) => Math.round(x / totalEnt * 1000) / 10;
  const cast = count.For + count.Against;
  const any = cast + count.Abstain > 0;
  let passes = false; let reason = "";
  if (type === "Ordinary") { passes = count.For > count.Against; reason = `${count.For} for, ${count.Against} against of ${cast} votes cast`; }
  if (type === "Special") { passes = pct(ent.For) >= 75; reason = `${pct(ent.For)}% of entitlement voted for; needs 75%`; }
  if (type === "Unanimous") { passes = pct(ent.For) >= 100 && count.Against === 0; reason = `${pct(ent.For)}% of entitlement voted for; needs 100%`; }
  return { count, ent, pct, any, passes, reason };
}

export function resolutionSummary(item: { motion?: string | undefined; moved_by?: string | undefined; seconded_by?: string | undefined; outcome?: string | undefined; resolution_type?: ResolutionType | undefined; votes?: Record<string, VoteChoice> | undefined }, lots: VoterLot[]) {
  if (!item.motion?.trim()) return null;
  const type = item.resolution_type ?? "Ordinary";
  const t = tallyVotes(item.votes, lots, type);
  const who = [item.moved_by ? `Proposed by ${item.moved_by}` : "", item.seconded_by ? `seconded by ${item.seconded_by}` : ""].filter(Boolean).join(", ");
  const counts = t.any ? `For ${t.count.For} (${t.pct(t.ent.For)}%), Against ${t.count.Against} (${t.pct(t.ent.Against)}%), Abstain ${t.count.Abstain}` : "";
  const result = item.outcome === "Carried" ? "Passed" : item.outcome === "Lost" ? "Not passed" : "";
  return { heading: `Resolution (${type.toLowerCase()}): ${item.motion.trim()}`, detail: [who, counts, result].filter(Boolean).join(". ") + (result || who || counts ? "." : "") };
}

type ResolutionFields = { motion?: string; moved_by?: string; seconded_by?: string; outcome?: string; resolution_type?: ResolutionType; votes?: Record<string, VoteChoice> };

export function ResolutionPanel({ item, lots, attendance, editable, onChange }: {
  item: ResolutionFields; lots: VoterLot[]; attendance: Record<string, string>; editable: boolean; onChange: (patch: ResolutionFields) => void;
}) {
  const [open, setOpen] = useState(!!item.motion);
  const type = item.resolution_type ?? "Ordinary";
  const voters = lots.filter(l => attendance[l.id] === "Present" || attendance[l.id] === "Proxy");
  const tally = tallyVotes(item.votes, lots, type);
  const summary = resolutionSummary(item, lots);

  if (!editable) return summary ? <div className="rounded-xl border border-border/70 bg-background/60 p-3 text-[13px]">
    <p className="flex items-start gap-2 font-medium"><Vote className="mt-0.5 size-4 shrink-0 text-primary"/>{summary.heading}</p>
    {summary.detail && <p className="mt-1 pl-6 text-muted-foreground">{summary.detail}</p>}
  </div> : null;

  if (!open) return <Button type="button" variant="ghost" size="sm" className="rounded-full text-muted-foreground" onClick={() => setOpen(true)}><Plus/> Record a vote (resolution)</Button>;

  const setVote = (lotId: string, c: VoteChoice) => {
    const next = { ...(item.votes ?? {}) };
    if (next[lotId] === c) delete next[lotId]; else next[lotId] = c;
    const t = tallyVotes(next, lots, type);
    onChange({ votes: next, ...(t.any ? { outcome: t.passes ? "Carried" : "Lost" } : {}) });
  };
  const lotOptions = voters.map(lotName);

  return <div className="space-y-3 rounded-xl border border-border/70 bg-background/60 p-3 sm:p-4">
    <div className="flex items-start justify-between gap-2">
      <div><p className="flex items-center gap-2 text-[13px] font-medium"><Vote className="size-4 text-primary"/>Resolution</p>
        <p className="mt-0.5 text-[12px] text-muted-foreground">Use this when the meeting formally decides something, e.g. adopting the budget or electing the committee.</p></div>
      <Button type="button" size="sm" variant="ghost" className="h-7 shrink-0 rounded-full px-2 text-[11px] text-muted-foreground" onClick={() => { onChange({ motion: "", moved_by: "", seconded_by: "", outcome: "", votes: {} }); setOpen(false); }}>Remove vote</Button>
    </div>
    <Input value={item.motion ?? ""} onChange={e => onChange({ motion: e.target.value })} placeholder="What's proposed, e.g. That the 2026/27 budget be adopted" aria-label="What's proposed"/>
    <div className="grid gap-2 sm:grid-cols-2">
      <Input list="agm-voters" value={item.moved_by ?? ""} onChange={e => onChange({ moved_by: e.target.value })} placeholder="Proposed by (pick a lot or type a name)" aria-label="Proposed by"/>
      <Input list="agm-voters" value={item.seconded_by ?? ""} onChange={e => onChange({ seconded_by: e.target.value })} placeholder="Seconded by (supports putting it to a vote)" aria-label="Seconded by"/>
      <datalist id="agm-voters">{lotOptions.map(o => <option key={o} value={o}/>)}</datalist>
    </div>
    <div>
      <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Resolution type">
        {(["Ordinary", "Special", "Unanimous"] as const).map(t => <button key={t} type="button" role="radio" aria-checked={type === t}
          onClick={() => { const tt = tallyVotes(item.votes, lots, t); onChange({ resolution_type: t, ...(tt.any ? { outcome: tt.passes ? "Carried" : "Lost" } : {}) }); }}
          className={`rounded-full border px-3 py-1 text-[12px] font-medium ${type === t ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground"}`}>{t}</button>)}
      </div>
      <p className="mt-1 text-[11px] text-muted-foreground">{RESOLUTION_HELP[type]} Based on standard Victorian owners-corporation rules. Check your own rules.</p>
    </div>

    <div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[12px] font-medium">Votes</p>
        {voters.length > 0 && <div className="flex gap-1">
          <Button type="button" size="sm" variant="ghost" className="h-7 rounded-full px-2.5 text-[11px]" onClick={() => { const all = Object.fromEntries(voters.map(l => [l.id, "For" as VoteChoice])); const t = tallyVotes(all, lots, type); onChange({ votes: all, outcome: t.passes ? "Carried" : "Lost" }); }}>All for</Button>
          <Button type="button" size="sm" variant="ghost" className="h-7 rounded-full px-2.5 text-[11px]" onClick={() => onChange({ votes: {} })}>Clear</Button>
        </div>}
      </div>
      {voters.length === 0
        ? <p className="mt-1 text-[12px] text-muted-foreground">Mark lots Present or Proxy under Attendance to record their votes, or just pick the result below for a show of hands.</p>
        : <ul className="mt-2 divide-y divide-border/60 rounded-xl border border-border/60">
            {voters.map(l => <li key={l.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
              <span className="text-[13px]">{lotName(l)} <span className="text-[11px] text-muted-foreground">· {Number(l.entitlement_percent)}%{attendance[l.id] === "Proxy" ? " · proxy" : ""}</span></span>
              <span className="flex gap-1">{(["For", "Against", "Abstain"] as const).map(c => <Button key={c} type="button" size="sm"
                variant={item.votes?.[l.id] === c ? "default" : "outline"} className={`h-7 rounded-full px-2.5 text-[11px] ${item.votes?.[l.id] === c && c === "Against" ? "bg-destructive hover:bg-destructive/90" : ""}`}
                aria-pressed={item.votes?.[l.id] === c} onClick={() => setVote(l.id, c)}>{c}</Button>)}</span>
            </li>)}
          </ul>}
      {tally.any && <p className={`mt-2 rounded-lg px-3 py-2 text-[12px] ${tally.passes ? "bg-primary/10 text-primary" : "bg-destructive/10 text-destructive"}`}>
        For {tally.count.For} ({tally.pct(tally.ent.For)}%) · Against {tally.count.Against} ({tally.pct(tally.ent.Against)}%) · Abstain {tally.count.Abstain}. {tally.passes ? "Passes" : "Does not pass"} as {type === "Ordinary" ? "an" : "a"} {type.toLowerCase()} resolution ({tally.reason}).
      </p>}
    </div>

    <div className="flex flex-wrap items-center gap-2">
      <span className="text-[12px] font-medium">Result</span>
      {([["Carried", "Passed"], ["Lost", "Not passed"]] as const).map(([v, label]) => <Button key={v} type="button" size="sm" variant={item.outcome === v ? "default" : "outline"}
        className={`rounded-full ${item.outcome === v && v === "Lost" ? "bg-destructive hover:bg-destructive/90" : ""}`} onClick={() => onChange({ outcome: item.outcome === v ? "" : v })}>
        {item.outcome === v && <Check/>}{label}</Button>)}
    </div>
  </div>;
}

// ─── Attachments ─────────────────────────────────────────────────────────────

export type AgmAttachment = { id: string; meeting_id: string; item_id: string; document_id: string };

async function openDoc(doc: DocFile) {
  if (!doc.storage_path) { toast("That file isn't available"); return; }
  const { data, error } = await supabase.storage.from("documents").createSignedUrl(doc.storage_path, 600);
  if (error || !data) { toast("Could not open the file", { description: error?.message }); return; }
  window.open(data.signedUrl, "_blank");
}

export function ItemAttachments({ meetingId, itemId, attachments, documents, editable, onUpload, onChanged }: {
  meetingId: string; itemId: string; attachments: AgmAttachment[]; documents: DocFile[]; editable: boolean;
  onUpload: (files: File[]) => Promise<string[]>; onChanged: () => void;
}) {
  const [picking, setPicking] = useState(false);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const mine = attachments.filter(a => a.meeting_id === meetingId && a.item_id === itemId);
  const docs = mine.map(a => ({ a, doc: documents.find(d => d.id === a.document_id) })).filter((x): x is { a: AgmAttachment; doc: DocFile } => !!x.doc);
  const link = async (ids: string[]) => {
    const rows = ids.filter(id => !mine.some(m => m.document_id === id)).map(document_id => ({ meeting_id: meetingId, item_id: itemId, document_id }));
    if (!rows.length) return;
    const { error } = await supabase.from("agm_item_attachments").insert(rows);
    if (error) { toast("Could not attach that", { description: error.message }); return; }
    onChanged();
  };
  const upload = async (list: FileList | null) => {
    if (!list?.length) return;
    const files = Array.from(list); // copy before awaiting: the input's FileList empties when it resets
    setBusy(true);
    try { await link(await onUpload(files)); toast("Attached and filed under AGM in Documents"); }
    catch (err) { toast("Could not upload", { description: (err as Error).message }); }
    finally { setBusy(false); }
  };
  const unlink = async (a: AgmAttachment) => {
    const { error } = await supabase.from("agm_item_attachments").delete().eq("id", a.id);
    if (error) { toast("Could not remove it", { description: error.message }); return; }
    onChanged();
  };
  const choices = documents.filter(d => !mine.some(m => m.document_id === d.id) && d.name.toLowerCase().includes(q.toLowerCase())).slice(0, 40);

  return <div className="space-y-2">
    {docs.length > 0 && <div className="flex flex-wrap gap-3">
      {docs.map(({ a, doc }) => <DocPreviewTile key={a.id} doc={doc} canRemove={editable} onOpen={d => { void openDoc(d); }} onRemove={() => { void unlink(a); }}/>)}
    </div>}
    {editable && <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild><Button type="button" variant="ghost" size="sm" className="rounded-full text-muted-foreground" disabled={busy}><Paperclip/>{busy ? "Uploading…" : "Attach"}</Button></DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuItem asChild><label className="cursor-pointer"><Upload className="size-4"/>Upload files or photos<input type="file" multiple className="sr-only" onChange={e => { void upload(e.target.files); e.target.value = ""; }}/></label></DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setPicking(true)}><FileText className="size-4"/>Choose from Documents</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Dialog open={picking} onOpenChange={setPicking}>
        <DialogContent className="max-h-[80vh] overflow-y-auto sm:max-w-[480px]">
          <DialogHeader><DialogTitle className="font-display tracking-[-0.02em]">Choose from Documents</DialogTitle><DialogDescription>Attach an existing file to this agenda item.</DialogDescription></DialogHeader>
          <Input value={q} onChange={e => setQ(e.target.value)} placeholder="Search files" aria-label="Search files"/>
          <ul className="divide-y divide-border/60">
            {choices.map(d => <li key={d.id}><button type="button" className="flex w-full items-center gap-2 px-1 py-2.5 text-left text-[13px] hover:bg-secondary/50" onClick={() => { void link([d.id]); setPicking(false); }}>
              <FileText className="size-4 shrink-0 text-muted-foreground"/><span className="min-w-0 flex-1 truncate">{d.name}</span><span className="shrink-0 text-[11px] text-muted-foreground">{d.category}</span></button></li>)}
            {choices.length === 0 && <li className="py-6 text-center text-[13px] text-muted-foreground">No matching files.</li>}
          </ul>
        </DialogContent>
      </Dialog>
    </>}
  </div>;
}

// ─── Links into the rest of Loty ─────────────────────────────────────────────

/** One-line description of a linked record, used on cards and frozen into the PDFs. */
export function linkSummary(link: ItemLink, ctx: AgmContextData): { icon: typeof Wrench; title: string; detail: string; target: string } | null {
  switch (link.type) {
    case "work_order": {
      const o = ctx.orders.find(x => x.id === link.id); if (!o) return null;
      const q = o.work_order_quotes?.find(x => x.status === "Accepted");
      return { icon: Wrench, title: `Work order: ${o.title}`, detail: [o.status, q ? `accepted quote ${money(q.amount)}` : ""].filter(Boolean).join(" · "), target: "Work orders" };
    }
    case "budget": {
      const b = ctx.budgets.find(x => x.id === link.id); if (!b) return null;
      return { icon: Coins, title: `Budget ${b.financial_year}`, detail: `${money(b.total_amount)} budgeted`, target: "Finance/Budget" };
    }
    case "levies": {
      const b = ctx.budgets.find(x => x.id === link.id); if (!b) return null;
      const lv = ctx.levies.filter(l => l.budget_id === b.id);
      const paid = lv.filter(l => l.status === "Paid");
      return { icon: Coins, title: `Levies ${b.financial_year}`, detail: `${paid.length} of ${lv.length} paid · ${money(lv.filter(l => l.status !== "Paid").reduce((s, l) => s + Number(l.amount), 0))} owing`, target: "Finance/Levies" };
    }
    case "fund": {
      const f = ctx.funds.find(x => x.id === link.id); if (!f) return null;
      return { icon: Coins, title: `${f.name} fund`, detail: `Balance ${money(ctx.fundBalances[f.id] ?? 0)}`, target: "Finance/Cashflow" };
    }
    case "policy": {
      const p = ctx.policies.find(x => x.id === link.id); if (!p) return null;
      return { icon: ShieldCheck, title: `${p.policy_type} insurance${p.insurer ? ` (${p.insurer})` : ""}`, detail: `Sum insured ${money(p.sum_insured)} · renews ${niceDate(p.renewal_date)}`, target: "Insurance" };
    }
    case "claim": {
      const c = ctx.claims.find(x => x.id === link.id); if (!c) return null;
      return { icon: Briefcase, title: `Insurance claim: ${c.title}`, detail: [c.status, `claimed ${money(c.claim_amount)}`, c.approved_amount !== null ? `covered ${money(c.approved_amount)}` : ""].filter(Boolean).join(" · "), target: "Insurance" };
    }
  }
}

export function ItemLinks({ links, ctx, editable, onChange }: { links: ItemLink[]; ctx: AgmContextData; editable: boolean; onChange: (links: ItemLink[]) => void }) {
  const add = (l: ItemLink) => { if (!links.some(x => x.type === l.type && x.id === l.id)) onChange([...links, l]); };
  const cards = links.map(l => ({ l, s: linkSummary(l, ctx) })).filter((x): x is { l: ItemLink; s: NonNullable<ReturnType<typeof linkSummary>> } => !!x.s);
  return <div className="space-y-2">
    {cards.length > 0 && <div className="grid gap-2 sm:grid-cols-2">
      {cards.map(({ l, s }) => <div key={`${l.type}-${l.id}`} className="flex items-start gap-3 rounded-xl border border-border/70 bg-background/60 p-3">
        <span className="grid size-8 shrink-0 place-items-center rounded-full bg-secondary"><s.icon className="size-4 text-primary"/></span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-medium">{s.title}</p>
          <p className="text-[12px] text-muted-foreground">{s.detail}</p>
          {ctx.goTo && <button type="button" className="mt-1 inline-flex items-center gap-1 text-[12px] font-medium text-primary hover:underline" onClick={() => ctx.goTo?.(s.target)}>Open <ExternalLink className="size-3"/></button>}
        </div>
        {editable && <Button type="button" size="icon" variant="ghost" className="size-7 shrink-0 rounded-full text-muted-foreground" aria-label={`Remove link ${s.title}`} onClick={() => onChange(links.filter(x => !(x.type === l.type && x.id === l.id)))}><X className="size-3.5"/></Button>}
      </div>)}
    </div>}
    {editable && <DropdownMenu>
      <DropdownMenuTrigger asChild><Button type="button" variant="ghost" size="sm" className="rounded-full text-muted-foreground"><Link2/>Link…</Button></DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-[60vh] w-72 overflow-y-auto">
        {ctx.orders.length > 0 && <><DropdownMenuLabel>Work orders</DropdownMenuLabel>
          {ctx.orders.slice(0, 12).map(o => <DropdownMenuItem key={o.id} onSelect={() => add({ type: "work_order", id: o.id })}><Wrench className="size-4"/><span className="truncate">{o.title}</span></DropdownMenuItem>)}
          <DropdownMenuSeparator/></>}
        {ctx.budgets.length > 0 && <><DropdownMenuLabel>Finance</DropdownMenuLabel>
          {ctx.budgets.map(b => <DropdownMenuItem key={`b-${b.id}`} onSelect={() => add({ type: "budget", id: b.id })}><Coins className="size-4"/>Budget {b.financial_year}</DropdownMenuItem>)}
          {ctx.budgets.map(b => <DropdownMenuItem key={`l-${b.id}`} onSelect={() => add({ type: "levies", id: b.id })}><Coins className="size-4"/>Levies {b.financial_year}</DropdownMenuItem>)}
          {ctx.funds.map(f => <DropdownMenuItem key={`f-${f.id}`} onSelect={() => add({ type: "fund", id: f.id })}><Coins className="size-4"/>{f.name} fund balance</DropdownMenuItem>)}
          <DropdownMenuSeparator/></>}
        {(ctx.policies.length > 0 || ctx.claims.length > 0) && <DropdownMenuLabel>Insurance</DropdownMenuLabel>}
        {ctx.policies.map(p => <DropdownMenuItem key={`p-${p.id}`} onSelect={() => add({ type: "policy", id: p.id })}><ShieldCheck className="size-4"/>{p.policy_type} policy</DropdownMenuItem>)}
        {ctx.claims.map(c => <DropdownMenuItem key={`c-${c.id}`} onSelect={() => add({ type: "claim", id: c.id })}><Briefcase className="size-4"/><span className="truncate">Claim: {c.title}</span></DropdownMenuItem>)}
      </DropdownMenuContent>
    </DropdownMenu>}
  </div>;
}
