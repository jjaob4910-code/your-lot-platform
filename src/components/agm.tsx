import { useEffect, useRef, useState, type DragEvent } from "react";
import { ArrowDown, ArrowLeft, ArrowUp, CalendarDays, Check, Clock, Copy, Download, FileText, GripVertical, Lightbulb, MapPin, Plus, Send, Trash2, Video } from "lucide-react";
import { RichTextEditor, RichTextView, isRichEmpty } from "@/components/rich-text";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import type { Lot } from "@/routes/dashboard";
import type { DocFile } from "@/components/documents";
import { ensureStandardWidget, type ComplianceWidget, type Task } from "@/lib/action-publish";
import { buildAgmMinutesPdf, buildAgmNoticePdf } from "@/lib/agm-pdf";
import { ItemAttachments, ItemLinks, ResolutionPanel, linkSummary, resolutionSummary, type AgmAttachment, type AgmContextData, type ItemLink, type ResolutionType, type VoteChoice } from "@/components/agm-extras";

const EMPTY_CTX: AgmContextData = { orders: [], policies: [], claims: [], budgets: [], levies: [], funds: [], fundBalances: {} };

export type AgendaItem = {
  id?: string; label: string; notes: string;
  discussion?: string; motion?: string; moved_by?: string; seconded_by?: string; outcome?: string;
  suggested_by_lot_id?: string | null;
  resolution_type?: ResolutionType; votes?: Record<string, VoteChoice>; links?: ItemLink[];
};
export type AgmStage = "Draft" | "Notice sent" | "Minutes" | "Published";
export type AgmMeeting = {
  id: string; scheme_id: string; title: string; meeting_date: string | null; meeting_time: string | null;
  location: string | null; video_link: string | null; agenda: AgendaItem[]; notes: string;
  status: string; created_at: string; published_at: string | null;
  stage?: AgmStage; notice_sent_at?: string | null; notice_document_id?: string | null; minutes_document_id?: string | null;
  attendance?: Record<string, string> | null;
};
export type AgmSuggestion = { id: string; meeting_id: string; lot_id: string | null; title: string; details: string | null; status: string; created_at: string };
type AgmLot = Pick<Lot, "id" | "lot_number" | "owner_name" | "owner_email" | "entitlement_percent">;

const AGM_WIDGET_SPEC = { key: "agm_notice", label: "AGM Notice", detail: "Written notice to every owner ahead of the annual general meeting." };
const AGM_FOLDER = "AGM";
const STAGES: AgmStage[] = ["Draft", "Notice sent", "Minutes", "Published"];
const STAGE_LABEL: Record<AgmStage, string> = { Draft: "Agenda", "Notice sent": "Notice sent", Minutes: "Minutes", Published: "Published" };
const ATTENDANCE = ["Present", "Proxy", "Apologies"];

const STANDARD_AGM_AGENDA: { label: string; notes: string }[] = [
  { label: "Welcome and apologies", notes: "" },
  { label: "Confirm minutes of the previous AGM", notes: "" },
  { label: "Financial report", notes: "Financial statements for the year and the fund balances." },
  { label: "Budget and levies", notes: "Adopt the budget and set levies for the coming year." },
  { label: "Insurance report", notes: "Current policies, sums insured and any claims." },
  { label: "Maintenance and works report", notes: "" },
  { label: "Election of committee", notes: "" },
  { label: "General business", notes: "" },
  { label: "Close", notes: "" },
];

const niceDate = (value: string) => new Date(value.length === 10 ? `${value}T00:00:00` : value).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
const daysUntil = (iso: string) => Math.ceil((new Date(`${iso}T00:00:00`).getTime() - new Date(new Date().toDateString()).getTime()) / 86400000);
const stageOf = (m: AgmMeeting): AgmStage => m.stage ?? (m.status === "Published" ? "Published" : "Draft");
const withIds = (agenda: AgendaItem[]) => agenda.map(a => ({ ...a, id: a.id ?? crypto.randomUUID() }));
const lotLabel = (lot: AgmLot | undefined) => lot ? `Lot ${lot.lot_number}${lot.owner_name ? ` · ${lot.owner_name}` : ""}` : "A lot";

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

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`rounded-[26px] border border-border/70 bg-card ${className}`}>{children}</div>;
}

function StagePill({ stage }: { stage: AgmStage }) {
  const tone = stage === "Published" ? "bg-primary/10 text-primary" : stage === "Draft" ? "bg-secondary text-muted-foreground" : "bg-amber-500/10 text-amber-700 dark:text-amber-400";
  return <span className={`inline-flex shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium ${tone}`}>{STAGE_LABEL[stage]}</span>;
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{children}</p>;
}

async function agmFolderId(schemeId: string) {
  const { data } = await supabase.from("document_folders").select("id").eq("scheme_id", schemeId).eq("name", AGM_FOLDER).maybeSingle();
  if (data?.id) return data.id as string;
  const { data: made, error } = await supabase.from("document_folders").insert({ scheme_id: schemeId, name: AGM_FOLDER, icon: "Users", color: "blue" }).select("id").single();
  if (error) throw error;
  return made.id as string;
}

// Files a generated PDF under AGM in Documents, shared with every owner.
// Files or photos attached to an agenda item: filed under AGM in Documents, shared with owners.
async function uploadAgmFiles(schemeId: string, files: File[]) {
  const folderId = await agmFolderId(schemeId);
  const ids: string[] = [];
  for (const file of files) {
    const path = `${schemeId}/${crypto.randomUUID()}-${file.name.replace(/[^\w.-]/g, "_")}`;
    const { error: upErr } = await supabase.storage.from("documents").upload(path, file);
    if (upErr) throw upErr;
    const { data, error } = await supabase.from("documents").insert({
      scheme_id: schemeId, name: file.name, category: "AGM", folder_id: folderId, storage_path: path, file_size: file.size, mime_type: file.type, shared_with_owners: true,
    }).select("id").single();
    if (error || !data) throw error ?? new Error("Could not file it");
    ids.push(data.id as string);
  }
  return ids;
}

async function fileAgmPdf(schemeId: string, blob: Blob, name: string, category: string) {
  const folderId = await agmFolderId(schemeId);
  const path = `${schemeId}/${crypto.randomUUID()}-${name.replace(/[^\w.-]/g, "_")}`;
  const { error: upErr } = await supabase.storage.from("documents").upload(path, blob, { contentType: "application/pdf" });
  if (upErr) throw upErr;
  const { data, error } = await supabase.from("documents").insert({
    scheme_id: schemeId, name, category, folder_id: folderId, storage_path: path, file_size: blob.size, mime_type: "application/pdf", shared_with_owners: true,
  }).select("id").single();
  if (error || !data) throw error ?? new Error("Could not file the PDF");
  return data.id as string;
}

function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

async function openDoc(doc: DocFile | undefined) {
  if (!doc?.storage_path) { toast("That file isn't available"); return; }
  const { data, error } = await supabase.storage.from("documents").createSignedUrl(doc.storage_path, 600);
  if (error || !data) { toast("Could not open the file", { description: error?.message }); return; }
  window.open(data.signedUrl, "_blank");
}

function noticeEmail(m: AgmMeeting, lots: AgmLot[]) {
  const emails = lots.map(l => l.owner_email).filter((e): e is string => !!e && e.trim() !== "");
  const subject = `Notice of AGM — ${m.title || "Annual General Meeting"}`;
  const body = [
    "Dear owners,", "",
    `Please find attached the notice and agenda for ${m.title || "our annual general meeting"}${m.meeting_date ? `, to be held on ${niceDate(m.meeting_date)}${m.meeting_time ? ` at ${m.meeting_time}` : ""}` : ""}${m.location ? ` at ${m.location}` : ""}.`,
    m.video_link ? `You can also join online: ${m.video_link}` : "", "",
    "The notice is also in Documents in Loty.", "", "Kind regards,", "Your owners corporation committee",
  ].filter((l, i, arr) => !(l === "" && arr[i - 1] === "")).join("\n");
  return { count: emails.length, href: emails.length ? `mailto:?bcc=${encodeURIComponent(emails.join(","))}&subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}` : "" };
}

// ─── Notebook ────────────────────────────────────────────────────────────────

type Draft = Pick<AgmMeeting, "title" | "meeting_date" | "meeting_time" | "location" | "video_link"> & { agenda: AgendaItem[]; attendance: Record<string, string>; notes: string };

function MeetingNotebook({ meeting, scheme, lots, myLot, suggestions, documents, isCommittee, schemeId, task, widgets, onBack, onChanged, ctx, attachments }: {
  meeting: AgmMeeting; scheme: { name: string; address: string | null } | null; lots: AgmLot[]; myLot: AgmLot | null;
  suggestions: AgmSuggestion[]; documents: DocFile[]; isCommittee: boolean; schemeId?: string | undefined;
  task: Task | undefined; widgets: ComplianceWidget[]; onBack: () => void; onChanged: () => void;
  ctx: AgmContextData; attachments: AgmAttachment[];
}) {
  const stage = stageOf(meeting);
  const [d, setD] = useState<Draft>(() => ({
    title: meeting.title, meeting_date: meeting.meeting_date, meeting_time: meeting.meeting_time, location: meeting.location, video_link: meeting.video_link,
    agenda: withIds(meeting.agenda), attendance: meeting.attendance ?? {}, notes: meeting.notes ?? "",
  }));
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirmNotice, setConfirmNotice] = useState(false);
  const [confirmPublish, setConfirmPublish] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const [suggestTitle, setSuggestTitle] = useState("");
  const [suggestDetails, setSuggestDetails] = useState("");

  const canEditAgenda = isCommittee && stage === "Draft";
  const canEditMinutes = isCommittee && stage === "Minutes";
  const canEditDetails = isCommittee && (stage === "Draft" || stage === "Minutes");

  const change = (patch: Partial<Draft>) => { setD(prev => ({ ...prev, ...patch })); setDirty(true); };
  const setItem = (id: string, patch: Partial<AgendaItem>) => change({ agenda: d.agenda.map(a => a.id === id ? { ...a, ...patch } : a) });
  const move = (id: string, delta: number) => {
    const i = d.agenda.findIndex(a => a.id === id); const j = i + delta;
    if (i < 0 || j < 0 || j >= d.agenda.length) return;
    const next = [...d.agenda]; [next[i], next[j]] = [next[j]!, next[i]!]; change({ agenda: next });
  };
  const dropOn = (targetId: string) => (e: DragEvent) => {
    e.preventDefault();
    if (!dragId || dragId === targetId) return;
    const next = d.agenda.filter(a => a.id !== dragId);
    const moving = d.agenda.find(a => a.id === dragId)!;
    next.splice(next.findIndex(a => a.id === targetId), 0, moving);
    setDragId(null); change({ agenda: next });
  };

  // Autosave: write ~0.8s after the last change.
  const latest = useRef(d); latest.current = d;
  useEffect(() => {
    if (!dirty) return;
    const t = setTimeout(async () => {
      setSaveState("saving");
      const v = latest.current;
      const { error } = await supabase.from("agm_meetings").update({
        title: v.title.trim(), meeting_date: v.meeting_date || null, meeting_time: v.meeting_time || null,
        location: v.location || null, video_link: v.video_link || null, agenda: v.agenda, attendance: v.attendance, notes: v.notes,
      }).eq("id", meeting.id);
      if (error) { setSaveState("idle"); toast("Could not save", { description: error.message }); return; }
      setDirty(false); setSaveState("saved"); onChanged();
    }, 800);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [d, dirty]);

  const flush = async () => {
    const v = latest.current;
    await supabase.from("agm_meetings").update({
      title: v.title.trim(), meeting_date: v.meeting_date || null, meeting_time: v.meeting_time || null,
      location: v.location || null, video_link: v.video_link || null, agenda: v.agenda, attendance: v.attendance, notes: v.notes,
    }).eq("id", meeting.id);
    setDirty(false);
  };

  // Resolutions, attachments and links are frozen into the PDF as plain lines.
  const pdfMeeting = () => ({ ...d, title: d.title.trim() || "Annual General Meeting", agenda: d.agenda.map(a => ({
    ...a, discussion: a.discussion ?? "", motion: a.motion ?? "",
    resolution: resolutionSummary(a, lots),
    attachments: attachments.filter(x => x.meeting_id === meeting.id && x.item_id === a.id).map(x => documents.find(doc => doc.id === x.document_id)?.name).filter((n): n is string => !!n),
    links: (a.links ?? []).map(l => linkSummary(l, ctx)).filter(Boolean).map(sm => `${sm!.title}: ${sm!.detail}`),
  })) });
  const fileName = (kind: string) => `${kind} — ${(d.title.trim() || "AGM").replace(/[/\\]/g, "-")}.pdf`;

  const completeObligation = async () => {
    if (!schemeId) return;
    const widget = widgets.find(w => w.standard_key === "agm_notice");
    if (task) await supabase.from("compliance_tasks").update({ status: "Complete" }).eq("id", task.id);
    else if (widget) await supabase.from("compliance_tasks").insert({ scheme_id: schemeId, widget_id: widget.id, task_name: widget.label, detail: widget.default_detail, due_date: new Date().toISOString().slice(0, 10), status: "Complete" });
  };

  const sendNotice = async () => {
    if (!schemeId) return;
    if (!d.title.trim()) { toast("Give the meeting a title first"); return; }
    if (d.agenda.filter(a => a.label.trim()).length === 0) { toast("Add at least one agenda item first"); return; }
    setBusy(true);
    try {
      await flush();
      const blob = await buildAgmNoticePdf(pdfMeeting(), scheme);
      const name = fileName("Notice of AGM");
      const docId = await fileAgmPdf(schemeId, blob, name, "AGM notice");
      const { error } = await supabase.from("agm_meetings").update({ stage: "Notice sent", notice_sent_at: new Date().toISOString(), notice_document_id: docId }).eq("id", meeting.id);
      if (error) throw error;
      await supabase.from("notices").insert({ scheme_id: schemeId, pinned: true, lot_id: null, title: `Notice of AGM — ${d.title.trim()}`,
        message: `${d.meeting_date ? `${niceDate(d.meeting_date)}${d.meeting_time ? ` at ${d.meeting_time}` : ""}` : "Date to be confirmed"}${d.location ? ` · ${d.location}` : ""}. The notice and agenda are in Documents.` });
      await completeObligation();
      downloadBlob(blob, name);
      const mail = noticeEmail({ ...meeting, ...d }, lots);
      setConfirmNotice(false); onChanged();
      if (mail.href) { toast("Notice filed and posted", { description: `Your email app is opening with ${mail.count} owner${mail.count === 1 ? "" : "s"}. Attach the downloaded PDF.` }); window.location.href = mail.href; }
      else toast("Notice filed and posted", { description: "No owner emails on file, so no email was opened." });
    } catch (err) {
      toast("Could not send the notice", { description: (err as Error).message });
    } finally { setBusy(false); }
  };

  const startMinutes = async () => {
    setBusy(true);
    const { error } = await supabase.from("agm_meetings").update({ stage: "Minutes" }).eq("id", meeting.id);
    setBusy(false);
    if (error) { toast("Could not start the minutes", { description: error.message }); return; }
    onChanged();
  };

  const publishMinutes = async () => {
    if (!schemeId) return;
    setBusy(true);
    try {
      await flush();
      const attendance = lots.filter(l => d.attendance[l.id]).map(l => ({ lot: `Lot ${l.lot_number}`, status: d.attendance[l.id]! }));
      const blob = await buildAgmMinutesPdf(pdfMeeting(), scheme, attendance);
      const docId = await fileAgmPdf(schemeId, blob, fileName("Minutes of AGM"), "AGM minutes");
      const { error } = await supabase.from("agm_meetings").update({ stage: "Published", status: "Published", published_at: new Date().toISOString(), minutes_document_id: docId }).eq("id", meeting.id);
      if (error) throw error;
      await supabase.from("notices").insert({ scheme_id: schemeId, pinned: false, lot_id: null, title: `Minutes published — ${d.title.trim()}`, message: "The minutes of the AGM are now in Documents." });
      setConfirmPublish(false); onChanged(); toast("Minutes published", { description: "Filed in Documents and shared with owners." });
    } catch (err) {
      toast("Could not publish the minutes", { description: (err as Error).message });
    } finally { setBusy(false); }
  };

  const addSuggestion = async (s: AgmSuggestion) => {
    change({ agenda: [...d.agenda, { id: crypto.randomUUID(), label: s.title, notes: s.details ?? "", suggested_by_lot_id: s.lot_id }] });
    const { error } = await supabase.from("agm_suggestions").update({ status: "Added" }).eq("id", s.id);
    if (error) toast("Added to the agenda, but the suggestion couldn't be updated", { description: error.message });
    onChanged();
  };
  const declineSuggestion = async (s: AgmSuggestion) => {
    const { error } = await supabase.from("agm_suggestions").update({ status: "Declined" }).eq("id", s.id);
    if (error) { toast("Could not decline it", { description: error.message }); return; }
    onChanged();
  };
  const suggest = async () => {
    if (!suggestTitle.trim()) return;
    const { error } = await supabase.from("agm_suggestions").insert({ meeting_id: meeting.id, lot_id: myLot?.id ?? null, title: suggestTitle.trim(), details: suggestDetails.trim() || null });
    if (error) { toast("Could not send your suggestion", { description: error.message }); return; }
    setSuggestTitle(""); setSuggestDetails(""); onChanged(); toast("Suggestion sent to the committee");
  };

  const stageIndex = STAGES.indexOf(stage);
  const next = !isCommittee ? null
    : stage === "Draft" ? { label: "Send notice", icon: Send, run: () => setConfirmNotice(true) }
    : stage === "Notice sent" ? { label: "Start minutes", icon: FileText, run: () => void startMinutes() }
    : stage === "Minutes" ? { label: "Publish minutes", icon: Check, run: () => setConfirmPublish(true) }
    : null;
  const noticeDoc = documents.find(x => x.id === meeting.notice_document_id);
  const minutesDoc = documents.find(x => x.id === meeting.minutes_document_id);
  const pending = suggestions.filter(s => s.status === "Pending");
  const mine = myLot ? suggestions.filter(s => s.lot_id === myLot.id) : [];
  const standardLeft = STANDARD_AGM_AGENDA.filter(s => !d.agenda.some(a => a.label.trim().toLowerCase() === s.label.toLowerCase()));
  const shortNotice = d.meeting_date ? daysUntil(d.meeting_date) < 14 : true;

  return <div className="mt-8 space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <Button variant="ghost" size="sm" className="rounded-full" onClick={onBack}><ArrowLeft/> All meetings</Button>
      <span className="text-[12px] text-muted-foreground" aria-live="polite">{saveState === "saving" || dirty ? "Saving…" : saveState === "saved" ? "Saved just now" : ""}</span>
    </div>

    {/* Stage bar and the one next action */}
    <Card className="p-4 sm:p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <ol className="flex flex-wrap items-center gap-1.5 text-[12px]">
          {STAGES.map((s, i) => <li key={s} className="flex items-center gap-1.5">
            <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 font-medium ${i < stageIndex ? "bg-primary/10 text-primary" : i === stageIndex ? "bg-foreground text-background" : "border border-border text-muted-foreground"}`}>
              {i < stageIndex && <Check className="size-3"/>}{STAGE_LABEL[s]}</span>
            {i < STAGES.length - 1 && <span className="h-px w-2 bg-border" aria-hidden/>}
          </li>)}
        </ol>
        <div className="flex flex-wrap gap-2">
          {noticeDoc && <Button size="sm" variant="outline" className="rounded-full" onClick={() => void openDoc(noticeDoc)}><Download/> Notice PDF</Button>}
          {minutesDoc && <Button size="sm" variant="outline" className="rounded-full" onClick={() => void openDoc(minutesDoc)}><Download/> Minutes PDF</Button>}
          {next && <Button size="sm" className="rounded-full" disabled={busy} onClick={next.run}><next.icon/> {next.label}</Button>}
        </div>
      </div>
      {stage === "Notice sent" && meeting.notice_sent_at && <p className="mt-3 text-[12px] text-muted-foreground">Notice sent {niceDate(meeting.notice_sent_at)}. On the day, start the minutes to record what's discussed and decided.</p>}
    </Card>

    {/* The notebook: one sheet — title, details, then numbered sections — read like a document. */}
    <Card className="overflow-hidden">
      <div className="px-5 pb-5 pt-7 sm:px-10 sm:pt-10">
        {canEditDetails
          ? <input value={d.title} onChange={e => change({ title: e.target.value })} placeholder="Annual General Meeting 2026" aria-label="Meeting title"
              className="w-full border-0 bg-transparent p-0 font-display text-3xl tracking-[-0.03em] outline-none placeholder:text-muted-foreground/50 sm:text-4xl"/>
          : <h2 className="font-display text-3xl tracking-[-0.03em] sm:text-4xl">{d.title || "Annual General Meeting"}</h2>}
        <div className="mt-4 flex flex-wrap gap-2">
          {([
            ["agm_date", CalendarDays, "Date", <input key="d" id="agm_date" type="date" disabled={!canEditDetails} value={d.meeting_date ?? ""} onChange={e => change({ meeting_date: e.target.value })} className="min-w-0 bg-transparent outline-none disabled:opacity-100" aria-label="Date"/>],
            ["agm_time", Clock, "Time", <input key="t" id="agm_time" disabled={!canEditDetails} value={d.meeting_time ?? ""} onChange={e => change({ meeting_time: e.target.value })} placeholder="Time" className="w-24 min-w-0 bg-transparent outline-none placeholder:text-muted-foreground/60" aria-label="Time"/>],
            ["agm_location", MapPin, "Location", <input key="l" id="agm_location" disabled={!canEditDetails} value={d.location ?? ""} onChange={e => change({ location: e.target.value })} placeholder="Location" className="w-36 min-w-0 bg-transparent outline-none placeholder:text-muted-foreground/60" aria-label="Location"/>],
            ["agm_video", Video, "Video link", <input key="v" id="agm_video" disabled={!canEditDetails} value={d.video_link ?? ""} onChange={e => change({ video_link: e.target.value })} placeholder="Video link" className="w-44 min-w-0 bg-transparent outline-none placeholder:text-muted-foreground/60" aria-label="Video link"/>],
          ] as const).map(([id, Icon, label, field]) => <label key={id} htmlFor={id} title={label}
            className="flex min-w-0 max-w-full items-center gap-2 rounded-full border border-border/70 bg-background/60 px-3 py-1.5 text-[13px] focus-within:border-primary/50">
            <Icon className="size-3.5 shrink-0 text-muted-foreground"/>{field}
          </label>)}
        </div>
      </div>

      <div className="border-t border-border/70 px-5 py-6 sm:px-10">
        <SectionLabel>{stage === "Minutes" || stage === "Published" ? "Minutes" : "Agenda"}</SectionLabel>
        <p className="mt-1 text-[13px] text-muted-foreground">{stage === "Draft" ? "What the meeting will cover. Owners see this once the notice goes out. Use the toolbar for lists, checklists, bold and highlights." : stage === "Notice sent" ? "The agenda as sent to owners." : "What was discussed and decided under each item."}</p>
        <ol className="mt-4 divide-y divide-border/60">
          {d.agenda.map((a, i) => {
            const suggestedBy = a.suggested_by_lot_id ? lots.find(l => l.id === a.suggested_by_lot_id) : undefined;
            return <li key={a.id} onDragOver={canEditAgenda ? e => e.preventDefault() : undefined} onDrop={canEditAgenda ? dropOn(a.id!) : undefined}
              className={`group/item py-5 first:pt-2 ${dragId === a.id ? "opacity-50" : ""}`}>
              <div className="flex items-start gap-3">
                {canEditAgenda && <span draggable onDragStart={() => setDragId(a.id!)} onDragEnd={() => setDragId(null)} className="mt-1.5 hidden cursor-grab text-muted-foreground opacity-0 transition group-hover/item:opacity-100 sm:block" aria-hidden><GripVertical className="size-4"/></span>}
                <span className="mt-0.5 w-6 shrink-0 font-display text-lg tabular-nums text-muted-foreground">{i + 1}.</span>
                <div className="min-w-0 flex-1 space-y-1.5">
                  <div className="flex items-start gap-2">
                    {canEditAgenda
                      ? <input value={a.label} onChange={e => setItem(a.id!, { label: e.target.value })} placeholder="Agenda item" aria-label={`Agenda item ${i + 1}`}
                          className="min-w-0 flex-1 border-0 bg-transparent p-0 font-display text-lg tracking-[-0.01em] outline-none placeholder:text-muted-foreground/50"/>
                      : <p className="min-w-0 flex-1 font-display text-lg tracking-[-0.01em]">{a.label || "Untitled item"}</p>}
                    {(canEditAgenda || canEditMinutes) && <div className="flex shrink-0 items-center">
                      <ItemLinks part="menu" links={a.links ?? []} ctx={ctx} editable onChange={links => setItem(a.id!, { links })}/>
                      <ItemAttachments part="menu" meetingId={meeting.id} itemId={a.id!} attachments={attachments} documents={documents} editable
                        onUpload={files => schemeId ? uploadAgmFiles(schemeId, files) : Promise.resolve([])} onChanged={onChanged}/>
                    </div>}
                    {canEditAgenda && <div className="flex shrink-0 items-center gap-0.5 transition sm:opacity-0 sm:group-focus-within/item:opacity-100 sm:group-hover/item:opacity-100">
                      <Button type="button" size="icon" variant="ghost" className="size-7 rounded-full" aria-label="Move up" disabled={i === 0} onClick={() => move(a.id!, -1)}><ArrowUp className="size-3.5"/></Button>
                      <Button type="button" size="icon" variant="ghost" className="size-7 rounded-full" aria-label="Move down" disabled={i === d.agenda.length - 1} onClick={() => move(a.id!, 1)}><ArrowDown className="size-3.5"/></Button>
                      <Button type="button" size="icon" variant="ghost" className="size-7 rounded-full text-muted-foreground hover:text-destructive" aria-label={`Remove ${a.label || "item"}`} onClick={() => change({ agenda: d.agenda.filter(x => x.id !== a.id) })}><Trash2 className="size-3.5"/></Button>
                    </div>}
                  </div>
                  {suggestedBy && <p className="inline-flex rounded-full bg-secondary px-2 py-0.5 text-[10px] font-medium text-muted-foreground">Suggested by Lot {suggestedBy.lot_number}</p>}
                  {canEditAgenda
                    ? <div className="-mx-3"><RichTextEditor value={a.notes} onChange={html => setItem(a.id!, { notes: html })} placeholder="Add detail, a list or a checklist…" ariaLabel={`Description for item ${i + 1}`} minHeight={28}/></div>
                    : <RichTextView value={a.notes} className="text-muted-foreground"/>}
                  <ItemLinks part="list" links={a.links ?? []} ctx={ctx} editable={canEditAgenda || canEditMinutes} onChange={links => setItem(a.id!, { links })}/>
                  <ItemAttachments part="list" meetingId={meeting.id} itemId={a.id!} attachments={attachments} documents={documents} editable={canEditAgenda || canEditMinutes}
                    onUpload={files => schemeId ? uploadAgmFiles(schemeId, files) : Promise.resolve([])} onChanged={onChanged}/>

                  {(stage === "Minutes" || stage === "Published") && <div className="mt-3 space-y-2 rounded-2xl bg-secondary/40 p-3 sm:p-4">
                    <SectionLabel>Discussion</SectionLabel>
                    {canEditMinutes
                      ? <div className="-mx-1"><RichTextEditor value={a.discussion ?? ""} onChange={html => setItem(a.id!, { discussion: html })} placeholder="What was discussed and decided" ariaLabel={`Discussion for item ${i + 1}`} minHeight={56}/></div>
                      : <RichTextView value={a.discussion}/>}
                    <ResolutionPanel item={a} lots={lots} attendance={d.attendance} editable={canEditMinutes} onChange={patch => setItem(a.id!, patch)}/>
                  </div>}
                </div>
              </div>
            </li>;
          })}
          {d.agenda.length === 0 && <li className="py-6 text-center text-[13px] text-muted-foreground">No agenda items yet.</li>}
        </ol>
        {canEditAgenda && <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-dashed border-border/70 pt-4">
          <Button type="button" variant="ghost" size="sm" className="rounded-full text-muted-foreground" onClick={() => change({ agenda: [...d.agenda, { id: crypto.randomUUID(), label: "", notes: "" }] })}><Plus/> Add agenda item</Button>
          {standardLeft.length > 0 && <Select value="" onValueChange={label => { const s = STANDARD_AGM_AGENDA.find(x => x.label === label); if (s) change({ agenda: [...d.agenda, { id: crypto.randomUUID(), ...s }] }); }}>
            <SelectTrigger className="h-8 w-auto rounded-full border-dashed text-[12px]" aria-label="Add standard item"><SelectValue placeholder="Add standard item"/></SelectTrigger>
            <SelectContent>{standardLeft.map(s => <SelectItem key={s.label} value={s.label}>{s.label}</SelectItem>)}</SelectContent>
          </Select>}
        </div>}
      </div>

      {/* Free-form notes for the whole meeting */}
      {(canEditDetails || !isRichEmpty(d.notes)) && <div className="border-t border-border/70 px-5 py-6 sm:px-10">
        <SectionLabel>Meeting notes</SectionLabel>
        {canEditDetails
          ? <div className="-mx-3 mt-2"><RichTextEditor value={d.notes} onChange={html => change({ notes: html })} placeholder="Anything else: background, reminders, actions for the committee…" ariaLabel="Meeting notes" minHeight={56}/></div>
          : <RichTextView value={d.notes} className="mt-2"/>}
      </div>}
    </Card>

    {/* Attendance */}
    {(stage === "Minutes" || stage === "Published") && lots.length > 0 && <Card className="p-5 sm:p-7">
      <SectionLabel>Attendance</SectionLabel>
      <ul className="mt-3 divide-y divide-border/60">
        {lots.map(l => <li key={l.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
          <span className="text-[13px]">{lotLabel(l)}</span>
          {canEditMinutes
            ? <div className="flex gap-1">{ATTENDANCE.map(s => <Button key={s} type="button" size="sm" variant={d.attendance[l.id] === s ? "default" : "ghost"} className="h-8 rounded-full px-3 text-[12px]"
                onClick={() => { const next = { ...d.attendance }; if (next[l.id] === s) delete next[l.id]; else next[l.id] = s; change({ attendance: next }); }}>{s}</Button>)}</div>
            : <span className="text-[12px] text-muted-foreground">{d.attendance[l.id] ?? "Not recorded"}</span>}
        </li>)}
      </ul>
    </Card>}

    {/* Suggestions */}
    {isCommittee && stage === "Draft" && pending.length > 0 && <Card className="p-5 sm:p-7">
      <SectionLabel>Suggestions from owners</SectionLabel>
      <ul className="mt-3 divide-y divide-border/60">
        {pending.map(s => <li key={s.id} className="flex flex-wrap items-start justify-between gap-3 py-3">
          <div className="min-w-0"><p className="text-[14px] font-medium">{s.title}</p>
            <p className="text-[12px] text-muted-foreground">{lotLabel(lots.find(l => l.id === s.lot_id))}{s.details ? ` · ${s.details}` : ""}</p></div>
          <div className="flex gap-2">
            <Button size="sm" className="rounded-full" onClick={() => void addSuggestion(s)}><Plus/> Add to agenda</Button>
            <Button size="sm" variant="ghost" className="rounded-full" onClick={() => void declineSuggestion(s)}>Decline</Button>
          </div>
        </li>)}
      </ul>
    </Card>}
    {!isCommittee && stage === "Draft" && myLot && <Card className="p-5 sm:p-7">
      <div className="flex items-center gap-2"><Lightbulb className="size-4 text-primary"/><SectionLabel>Suggest an agenda item</SectionLabel></div>
      <div className="mt-3 space-y-2">
        <Input value={suggestTitle} onChange={e => setSuggestTitle(e.target.value)} placeholder="What should the meeting discuss?" aria-label="Suggestion title"/>
        <Textarea value={suggestDetails} onChange={e => setSuggestDetails(e.target.value)} rows={2} placeholder="Any detail (optional)" aria-label="Suggestion details"/>
        <div className="flex justify-end"><Button size="sm" className="rounded-full" disabled={!suggestTitle.trim()} onClick={() => void suggest()}>Send suggestion</Button></div>
      </div>
      {mine.length > 0 && <ul className="mt-4 space-y-1.5">{mine.map(s => <li key={s.id} className="flex items-center justify-between gap-3 text-[13px]"><span>{s.title}</span>
        <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${s.status === "Added" ? "bg-primary/10 text-primary" : s.status === "Declined" ? "bg-secondary text-muted-foreground" : "bg-amber-500/10 text-amber-700"}`}>{s.status}</span></li>)}</ul>}
    </Card>}

    <Dialog open={confirmNotice} onOpenChange={setConfirmNotice}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader><DialogTitle className="font-display tracking-[-0.02em]">Send the notice?</DialogTitle>
          <DialogDescription>This makes the notice PDF, files it in Documents for every owner, pins it on the dashboard, downloads a copy for you and opens your email app addressed to all owners. Attach the downloaded PDF before sending.</DialogDescription></DialogHeader>
        {shortNotice && <p className="rounded-2xl bg-amber-500/10 px-4 py-3 text-[12px] leading-5 text-amber-800 dark:text-amber-300">
          {d.meeting_date ? `The meeting is ${Math.max(0, daysUntil(d.meeting_date))} days away.` : "No meeting date is set yet."} Owners usually need at least 14 days' notice. You can still send it.</p>}
        <p className="text-[12px] text-muted-foreground">After this, the agenda is locked. Owner suggestions close too.</p>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" className="rounded-full" onClick={() => setConfirmNotice(false)}>Cancel</Button>
          <Button className="rounded-full" disabled={busy} onClick={() => void sendNotice()}>{busy ? "Preparing…" : "Send notice"}</Button>
        </div>
      </DialogContent>
    </Dialog>
    <Dialog open={confirmPublish} onOpenChange={setConfirmPublish}>
      <DialogContent className="sm:max-w-[460px]">
        <DialogHeader><DialogTitle className="font-display tracking-[-0.02em]">Publish the minutes?</DialogTitle>
          <DialogDescription>This makes the minutes PDF, files it in Documents for every owner and lets them know. The minutes can't be edited afterwards.</DialogDescription></DialogHeader>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" className="rounded-full" onClick={() => setConfirmPublish(false)}>Cancel</Button>
          <Button className="rounded-full" disabled={busy} onClick={() => void publishMinutes()}>{busy ? "Publishing…" : "Publish minutes"}</Button>
        </div>
      </DialogContent>
    </Dialog>
  </div>;
}

// ─── Page ────────────────────────────────────────────────────────────────────

export function AgmSection({ schemeId, isCommittee, meetings, task, widgets, lots, myLot = null, scheme = null, suggestions = [], documents = [], onChanged, ctx = EMPTY_CTX, attachments = [] }: {
  schemeId?: string | undefined; isCommittee: boolean; meetings: AgmMeeting[]; task: Task | undefined;
  widgets: ComplianceWidget[]; lots: AgmLot[]; myLot?: AgmLot | null; scheme?: { name: string; address: string | null } | null;
  suggestions?: AgmSuggestion[]; documents?: DocFile[]; onChanged: () => void;
  ctx?: AgmContextData; attachments?: AgmAttachment[];
}) {
  const bootstrapped = useRef(false);
  useEffect(() => {
    if (!schemeId || bootstrapped.current) return;
    bootstrapped.current = true;
    void ensureStandardWidget(schemeId, widgets, AGM_WIDGET_SPEC).then(created => { if (created) onChanged(); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schemeId]);

  const [openId, setOpenId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<AgmMeeting | null>(null);
  const sorted = [...meetings].sort((a, b) => b.created_at.localeCompare(a.created_at));
  const open = openId ? meetings.find(m => m.id === openId) ?? null : null;

  const create = async (from?: AgmMeeting) => {
    if (!schemeId) return;
    const agenda = (from ? from.agenda.map(a => ({ label: a.label, notes: a.notes })) : STANDARD_AGM_AGENDA).map(a => ({ ...a, id: crypto.randomUUID() }));
    const { data, error } = await supabase.from("agm_meetings").insert({
      scheme_id: schemeId, status: "Draft", stage: "Draft", agenda, notes: "",
      title: from ? `${from.title || "Annual General Meeting"} (copy)` : `Annual General Meeting ${new Date().getFullYear()}`,
      location: from?.location ?? null, video_link: from?.video_link ?? null, meeting_time: from?.meeting_time ?? null,
    }).select("id").single();
    if (error || !data) { toast(from ? "Could not duplicate the meeting" : "Could not start a meeting", { description: error?.message }); return; }
    onChanged(); setOpenId(data.id as string);
    if (from) toast("Copy made", { description: "Agenda carried over. Set the new date." });
  };

  const remove = async () => {
    if (!deleting) return;
    const { error } = await supabase.from("agm_meetings").delete().eq("id", deleting.id);
    if (error) { toast("Could not delete the meeting", { description: error.message }); return; }
    if (openId === deleting.id) setOpenId(null);
    setDeleting(null); onChanged(); toast("Meeting deleted");
  };

  return <div>
    <PageHead eyebrow="Your property" title="Annual General Meeting"
      blurb="Build the agenda, send the notice, then take the minutes on the day. Owners can suggest items while the agenda is being drafted."
      action={isCommittee && !open ? <Button className="rounded-full" onClick={() => void create()} disabled={!schemeId}><Plus/> New AGM</Button> : undefined}/>

    {open
      ? <MeetingNotebook key={open.id} meeting={open} scheme={scheme} lots={lots} myLot={myLot} suggestions={suggestions.filter(s => s.meeting_id === open.id)} ctx={ctx} attachments={attachments}
          documents={documents} isCommittee={isCommittee} schemeId={schemeId} task={task} widgets={widgets} onBack={() => setOpenId(null)} onChanged={onChanged}/>
      : <Card className="mt-10 overflow-hidden">
          {sorted.length === 0
            ? <div className="p-10 text-center">
                <p className="text-sm text-muted-foreground">No AGMs yet.</p>
                {isCommittee && <Button className="mt-4 rounded-full" onClick={() => void create()} disabled={!schemeId}><Plus/> Start with the standard agenda</Button>}
              </div>
            : <ul className="divide-y divide-border/70">
                {sorted.map(m => { const st = stageOf(m); const pendingCount = suggestions.filter(s => s.meeting_id === m.id && s.status === "Pending").length;
                  return <li key={m.id} className="flex flex-wrap items-center gap-3 px-5 py-4 sm:px-7">
                    <button type="button" className="flex min-w-0 flex-1 items-center gap-3 text-left" onClick={() => setOpenId(m.id)}>
                      <FileText className="size-4 shrink-0 text-muted-foreground"/>
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium">{m.title || "Untitled meeting"}</span>
                        <span className="block text-[12px] text-muted-foreground">{m.meeting_date ? niceDate(m.meeting_date) : "No date set"} · {m.agenda.length} agenda {m.agenda.length === 1 ? "item" : "items"}
                          {isCommittee && pendingCount > 0 ? ` · ${pendingCount} suggestion${pendingCount === 1 ? "" : "s"}` : ""}</span>
                      </span>
                    </button>
                    <StagePill stage={st}/>
                    <div className="flex items-center gap-1">
                      <Button type="button" size="sm" variant="outline" className="rounded-full" onClick={() => setOpenId(m.id)}>Open</Button>
                      {isCommittee && <Button type="button" size="icon" variant="ghost" className="rounded-full" aria-label={`Duplicate ${m.title || "meeting"}`} onClick={() => void create(m)}><Copy className="size-4"/></Button>}
                      {isCommittee && <Button type="button" size="icon" variant="ghost" className="rounded-full text-muted-foreground hover:text-destructive" aria-label={`Delete ${m.title || "meeting"}`} onClick={() => setDeleting(m)}><Trash2 className="size-4"/></Button>}
                    </div>
                  </li>; })}
              </ul>}
        </Card>}

    <Dialog open={!!deleting} onOpenChange={o => { if (!o) setDeleting(null); }}>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader><DialogTitle className="font-display tracking-[-0.02em]">Delete this meeting?</DialogTitle>
          <DialogDescription>“{deleting?.title || "Untitled meeting"}” and its suggestions will be removed. Any PDFs already filed stay in Documents.</DialogDescription></DialogHeader>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" className="rounded-full" onClick={() => setDeleting(null)}>Cancel</Button>
          <Button type="button" variant="destructive" className="rounded-full" onClick={() => void remove()}>Delete meeting</Button>
        </div>
      </DialogContent>
    </Dialog>
  </div>;
}
