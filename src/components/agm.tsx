import { useEffect, useRef, useState } from "react";
import { Copy, FileText, Plus, Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import type { Lot } from "@/routes/dashboard";
import { ensureStandardWidget, publishActionDocument, type ComplianceWidget, type Task } from "@/lib/action-publish";

export type AgmMeeting = {
  id: string; scheme_id: string; title: string; meeting_date: string | null; meeting_time: string | null;
  location: string | null; video_link: string | null; agenda: { label: string; notes: string }[]; notes: string;
  status: string; created_at: string; published_at: string | null;
};

const AGM_WIDGET_SPEC = { key: "agm_notice", label: "AGM Notice", detail: "Written notice to every owner ahead of the annual general meeting." };

const STANDARD_AGM_AGENDA: { label: string; notes: string }[] = [
  { label: "Welcome and apologies", notes: "" },
  { label: "Confirm minutes of the previous AGM", notes: "" },
  { label: "Financial report", notes: "" },
  { label: "Insurance report", notes: "" },
  { label: "Maintenance and works report", notes: "" },
  { label: "Election of committee", notes: "" },
  { label: "General business", notes: "" },
  { label: "Close", notes: "" },
];

const niceDate = (value: string) => new Date(value).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });

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

function agendaLines(agenda: { label: string; notes: string }[]) {
  return agenda.filter(a => a.label.trim() !== "").map((a, i) => `${i + 1}. ${a.label}${a.notes ? ` — ${a.notes}` : ""}`);
}

function meetingTextBlock(title: string, meetingDate: string, meetingTime: string, location: string, videoLink: string, agenda: { label: string; notes: string }[], notes: string) {
  const header = [
    title.trim(),
    meetingDate ? `Date: ${niceDate(meetingDate)}${meetingTime ? ` at ${meetingTime}` : ""}` : "",
    location ? `Location: ${location}` : "",
    videoLink ? `Join online: ${videoLink}` : "",
  ].filter(l => l !== "");
  return [
    ...header,
    "",
    "Agenda:", ...agendaLines(agenda),
    "",
    "Notes:", notes,
  ].join("\n");
}

export function agmNoticeText(meeting: AgmMeeting): { title: string; message: string } {
  const message = meetingTextBlock(
    meeting.title, meeting.meeting_date ?? "", meeting.meeting_time ?? "", meeting.location ?? "",
    meeting.video_link ?? "", meeting.agenda, meeting.notes,
  );
  return { title: `AGM notice — ${meeting.title}`, message };
}

export function agmMailto(meeting: AgmMeeting, lots: { owner_email: string | null }[]): string {
  const emails = lots.map(l => l.owner_email).filter((e): e is string => !!e && e.trim() !== "");
  if (emails.length === 0) return "";
  const { title, message } = agmNoticeText(meeting);
  return `mailto:?bcc=${encodeURIComponent(emails.join(","))}&subject=${encodeURIComponent(title)}&body=${encodeURIComponent(message)}`;
}

export async function sendAgmNotice(meeting: AgmMeeting, schemeId: string): Promise<{ error?: string }> {
  const { title, message } = agmNoticeText(meeting);
  const { error } = await supabase.from("notices").insert({ scheme_id: schemeId, title, message, pinned: true, lot_id: null });
  if (error) return { error: error.message };
  return {};
}

function AgendaEditor({ agenda, onChange }: { agenda: { label: string; notes: string }[]; onChange: (agenda: { label: string; notes: string }[]) => void }) {
  const update = (i: number, patch: Partial<{ label: string; notes: string }>) =>
    onChange(agenda.map((a, idx) => idx === i ? { ...a, ...patch } : a));
  return <div className="space-y-2">
    <Label>Agenda</Label>
    {agenda.map((a, i) => <div key={i} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
      <Input placeholder="Item" value={a.label} onChange={e => update(i, { label: e.target.value })} />
      <Input placeholder="Notes (optional)" value={a.notes} onChange={e => update(i, { notes: e.target.value })} />
      <Button type="button" size="icon" variant="ghost" className="rounded-full text-muted-foreground" aria-label="Remove item" onClick={() => onChange(agenda.filter((_, idx) => idx !== i))} disabled={agenda.length === 1}><Trash2 className="size-4" /></Button>
    </div>)}
    <Button type="button" variant="outline" size="sm" className="rounded-full" onClick={() => onChange([...agenda, { label: "", notes: "" }])}><Plus className="size-3.5" />Add agenda item</Button>
  </div>;
}

function PublishedMeetingCard({ meeting, isCommittee, schemeId, lots }: {
  meeting: AgmMeeting; isCommittee: boolean; schemeId?: string | undefined; lots: { owner_email: string | null }[];
}) {
  const [sending, setSending] = useState(false);

  const send = async () => {
    if (!schemeId) return;
    setSending(true);
    const result = await sendAgmNotice(meeting, schemeId);
    setSending(false);
    if (result.error) { toast("Could not post the notice", { description: result.error }); return; }
    const mailto = agmMailto(meeting, lots);
    if (mailto) window.location.href = mailto;
    toast("Notice posted", { description: mailto ? "Your email app should also open." : "No owner email on file to open a mailto." });
  };

  return <details className="rounded-2xl border border-border/70 p-4">
    <summary className="cursor-pointer text-[14px] font-medium">{meeting.title}{meeting.meeting_date ? ` · ${niceDate(meeting.meeting_date)}` : ""}</summary>
    <div className="mt-3 space-y-2 text-[13px] text-muted-foreground">
      {meeting.meeting_date && <p>Date: {niceDate(meeting.meeting_date)}{meeting.meeting_time ? ` at ${meeting.meeting_time}` : ""}</p>}
      {meeting.location && <p>Location: {meeting.location}</p>}
      {meeting.video_link && <p>Join online: {meeting.video_link}</p>}
      <div className="mt-2 space-y-1">
        {meeting.agenda.map((a, i) => <p key={i}>{i + 1}. {a.label}{a.notes ? ` — ${a.notes}` : ""}</p>)}
      </div>
      {meeting.notes && <p className="mt-2 whitespace-pre-line">{meeting.notes}</p>}
    </div>
    {isCommittee && <div className="mt-4">
      <Button type="button" size="sm" variant="outline" className="rounded-full" disabled={sending} onClick={() => void send()}>{sending ? "Sending…" : "Send to everyone"}</Button>
    </div>}
  </details>;
}

export function AgmSection({ schemeId, isCommittee, meetings, task, widgets, lots, onChanged }: {
  schemeId?: string | undefined; isCommittee: boolean; meetings: AgmMeeting[]; task: Task | undefined;
  widgets: ComplianceWidget[]; lots: Pick<Lot, "owner_email">[]; onChanged: () => void;
}) {
  const bootstrapped = useRef(false);
  useEffect(() => {
    if (!schemeId || bootstrapped.current) return;
    bootstrapped.current = true;
    void ensureStandardWidget(schemeId, widgets, AGM_WIDGET_SPEC).then(created => { if (created) onChanged(); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schemeId]);

  const drafts = meetings.filter(m => m.status === "Draft").sort((a, b) => b.created_at.localeCompare(a.created_at));
  const published = meetings.filter(m => m.status === "Published")
    .sort((a, b) => (b.published_at ?? b.created_at).localeCompare(a.published_at ?? a.created_at));

  const [draftId, setDraftId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [meetingDate, setMeetingDate] = useState("");
  const [meetingTime, setMeetingTime] = useState("");
  const [location, setLocation] = useState("");
  const [videoLink, setVideoLink] = useState("");
  const [agenda, setAgenda] = useState<{ label: string; notes: string }[]>([]);
  const [notes, setNotes] = useState("");
  const [started, setStarted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [deleting, setDeleting] = useState<AgmMeeting | null>(null);

  const openDraft = (m: AgmMeeting) => {
    setDraftId(m.id);
    setTitle(m.title);
    setMeetingDate(m.meeting_date ?? "");
    setMeetingTime(m.meeting_time ?? "");
    setLocation(m.location ?? "");
    setVideoLink(m.video_link ?? "");
    setAgenda(m.agenda.map(a => ({ ...a })));
    setNotes(m.notes ?? "");
    setStarted(true);
  };

  const duplicateDraft = async (m: AgmMeeting) => {
    if (!schemeId) return;
    const { data, error } = await supabase.from("agm_meetings").insert({
      scheme_id: schemeId, status: "Draft", title: `${m.title || "Untitled meeting"} (copy)`, meeting_date: m.meeting_date, meeting_time: m.meeting_time,
      location: m.location, video_link: m.video_link, agenda: m.agenda, notes: m.notes,
    }).select().single();
    if (error || !data) { toast("Could not duplicate the draft", { description: error?.message }); return; }
    onChanged(); toast("Copy saved to your drafts");
  };

  const deleteDraft = async () => {
    if (!deleting) return;
    const { error } = await supabase.from("agm_meetings").delete().eq("id", deleting.id);
    if (error) { toast("Could not delete the draft", { description: error.message }); return; }
    if (draftId === deleting.id) { setDraftId(null); setStarted(false); }
    setDeleting(null); onChanged(); toast("Draft deleted");
  };

  const startNew = () => {
    const lastPublished = published[0];
    const seedAgenda = lastPublished ? lastPublished.agenda.map(a => ({ ...a })) : STANDARD_AGM_AGENDA.map(a => ({ ...a }));
    setDraftId(null);
    setTitle("");
    setMeetingDate("");
    setMeetingTime("");
    setLocation("");
    setVideoLink("");
    setAgenda(seedAgenda);
    setNotes("");
    setStarted(true);
  };

  const saveDraft = async () => {
    if (!schemeId) return;
    setSaving(true);
    const payload = {
      title: title.trim(), meeting_date: meetingDate || null, meeting_time: meetingTime || null,
      location: location || null, video_link: videoLink || null, agenda, notes,
    };
    if (draftId) {
      const { error } = await supabase.from("agm_meetings").update(payload).eq("id", draftId);
      setSaving(false);
      if (error) { toast("Could not save the draft", { description: error.message }); return; }
      onChanged(); toast("Saved to your drafts");
    } else {
      const { data, error } = await supabase.from("agm_meetings").insert({ ...payload, scheme_id: schemeId, status: "Draft" }).select().single();
      setSaving(false);
      if (error || !data) { toast("Could not save the draft", { description: error?.message }); return; }
      setDraftId(data.id as string);
      onChanged(); toast("Saved to your drafts");
    }
  };

  const publish = async () => {
    if (!schemeId || !title.trim()) { toast("Give the meeting a title first"); return; }
    setPublishing(true);
    const payload = {
      title: title.trim(), meeting_date: meetingDate || null, meeting_time: meetingTime || null,
      location: location || null, video_link: videoLink || null, agenda, notes,
      status: "Published" as const, published_at: new Date().toISOString(),
    };
    try {
      let id = draftId;
      if (id) {
        const { error } = await supabase.from("agm_meetings").update(payload).eq("id", id);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from("agm_meetings").insert({ ...payload, scheme_id: schemeId }).select().single();
        if (error || !data) throw error ?? new Error("Could not publish the meeting");
        id = data.id as string;
      }
      setDraftId(id);
      setPublishing(false);
      // The meeting is Published from here on, whether or not the document-filing
      // step below succeeds — never re-throw past this point as "could not publish".
      onChanged();
      const widget = widgets.find(w => w.standard_key === "agm_notice");
      if (widget) {
        try {
          const text = meetingTextBlock(title, meetingDate, meetingTime, location, videoLink, agenda, notes);
          await publishActionDocument(schemeId, widget, task?.id ?? null, text);
          setDraftId(null); setStarted(false);
          toast("AGM published — filed in Documents and marked complete");
        } catch (fileErr) {
          toast("Meeting published, but could not file the document", { description: (fileErr as Error).message });
        }
      } else {
        setDraftId(null); setStarted(false);
        toast("AGM published");
      }
    } catch (err) {
      setPublishing(false);
      toast("Could not publish", { description: (err as Error).message });
    }
  };

  return <div>
    <PageHead eyebrow="Your property" title="Annual General Meeting" blurb="Prepare the agenda, run the meeting, and send it to every owner — all from one place." />

    <div className="mt-10 space-y-8">
      {isCommittee && <Card className="p-5 sm:p-7">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Saved drafts</p>
          <Button type="button" size="sm" className="rounded-full" onClick={startNew}><Plus className="size-3.5" />New AGM draft</Button>
        </div>
        {drafts.length === 0
          ? <p className="mt-4 text-sm text-muted-foreground">No drafts yet. Start one, then use Save draft to keep it here.</p>
          : <ul className="mt-3 divide-y divide-border/70">
              {drafts.map(m => <li key={m.id} className="flex flex-wrap items-center gap-3 py-3">
                <FileText className="size-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{m.title || "Untitled meeting"}{draftId === m.id && started ? <span className="ml-2 text-[11px] font-normal text-primary">Open</span> : null}</p>
                  <p className="text-[12px] text-muted-foreground">{m.meeting_date ? `Meeting ${new Date(m.meeting_date).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })}` : "No date set"} · {m.agenda.length} agenda {m.agenda.length === 1 ? "item" : "items"}</p>
                </div>
                <div className="flex items-center gap-1">
                  <Button type="button" size="sm" variant="outline" className="rounded-full" onClick={() => openDraft(m)}>Open</Button>
                  <Button type="button" size="icon" variant="ghost" className="rounded-full" aria-label={`Duplicate ${m.title || "draft"}`} onClick={() => void duplicateDraft(m)}><Copy className="size-4" /></Button>
                  <Button type="button" size="icon" variant="ghost" className="rounded-full text-muted-foreground hover:text-destructive" aria-label={`Delete ${m.title || "draft"}`} onClick={() => setDeleting(m)}><Trash2 className="size-4" /></Button>
                </div>
              </li>)}
            </ul>}
      </Card>}

      {isCommittee && started && <Card className="p-5 sm:p-7">
          <div className="space-y-5">
              <div className="flex items-center justify-between gap-3">
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{draftId ? "Editing draft" : "New draft"}</p>
                <Button type="button" size="sm" variant="ghost" className="rounded-full" onClick={() => { setStarted(false); setDraftId(null); }}>Close</Button>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2"><Label htmlFor="agm_title">Meeting title</Label><Input id="agm_title" value={title} onChange={e => setTitle(e.target.value)} placeholder="Annual General Meeting 2026" /></div>
                <div className="space-y-2"><Label htmlFor="agm_date">Meeting date</Label><Input id="agm_date" type="date" value={meetingDate} onChange={e => setMeetingDate(e.target.value)} /></div>
                <div className="space-y-2"><Label htmlFor="agm_time">Meeting time</Label><Input id="agm_time" value={meetingTime} onChange={e => setMeetingTime(e.target.value)} placeholder="7:00 PM" /></div>
                <div className="space-y-2"><Label htmlFor="agm_location">Location</Label><Input id="agm_location" value={location} onChange={e => setLocation(e.target.value)} placeholder="Common room" /></div>
                <div className="space-y-2 sm:col-span-2"><Label htmlFor="agm_video">Video link</Label><Input id="agm_video" value={videoLink} onChange={e => setVideoLink(e.target.value)} placeholder="https://..." /></div>
              </div>
              <AgendaEditor agenda={agenda} onChange={setAgenda} />
              <div className="space-y-2"><Label htmlFor="agm_notes">Meeting notes</Label><Textarea id="agm_notes" rows={5} value={notes} onChange={e => setNotes(e.target.value)} placeholder="What was discussed and decided" /></div>
              <div className="flex flex-wrap justify-end gap-2 pt-2">
                <Button type="button" variant="outline" className="rounded-full" disabled={saving} onClick={() => void saveDraft()}>{saving ? "Saving…" : "Save draft"}</Button>
                <Button type="button" className="rounded-full" disabled={publishing} onClick={() => void publish()}>{publishing ? "Publishing…" : "Publish"}</Button>
              </div>
          </div>
      </Card>}

      <Dialog open={!!deleting} onOpenChange={o => { if (!o) setDeleting(null); }}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader><DialogTitle className="font-display tracking-[-0.02em]">Delete this draft?</DialogTitle>
            <DialogDescription>“{deleting?.title || "Untitled meeting"}” will be removed. This can't be undone.</DialogDescription></DialogHeader>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" className="rounded-full" onClick={() => setDeleting(null)}>Cancel</Button>
            <Button type="button" variant="destructive" className="rounded-full" onClick={() => void deleteDraft()}>Delete draft</Button>
          </div>
        </DialogContent>
      </Dialog>

      <div>
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Past meetings</p>
        {published.length === 0
          ? <p className="mt-3 text-sm text-muted-foreground">No AGM notes published yet.</p>
          : <div className="mt-3 space-y-2">
              {published.map(m => <PublishedMeetingCard key={m.id} meeting={m} isCommittee={isCommittee} schemeId={schemeId} lots={lots} />)}
            </div>}
      </div>
    </div>
  </div>;
}
