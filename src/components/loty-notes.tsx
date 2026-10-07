import { createPortal } from "react-dom";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Pin, PinOff, StickyNote, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

// Loty staff's private notes and building settings (colour, cover photo). Owners and committees
// never see these; the database only returns them to Loty staff.

export type LotyNote = { id: string; scheme_id: string; author_id: string; author_name: string | null; body: string; pinned: boolean; created_at: string };
export type LotyColor = "blue" | "green" | "amber" | "red" | "purple" | "grey";
export type LotyMeta = { scheme_id: string; color: LotyColor | null; cover_path: string | null };

export const LOTY_COLORS: { key: LotyColor; label: string; swatch: string; stripe: string; soft: string; border: string }[] = [
  { key: "blue", label: "Blue", swatch: "bg-sky-500", stripe: "bg-sky-500", soft: "bg-sky-500/10", border: "border-sky-500" },
  { key: "green", label: "Green", swatch: "bg-emerald-500", stripe: "bg-emerald-500", soft: "bg-emerald-500/10", border: "border-emerald-500" },
  { key: "amber", label: "Amber", swatch: "bg-amber-500", stripe: "bg-amber-500", soft: "bg-amber-500/10", border: "border-amber-500" },
  { key: "red", label: "Red", swatch: "bg-rose-500", stripe: "bg-rose-500", soft: "bg-rose-500/10", border: "border-rose-500" },
  { key: "purple", label: "Purple", swatch: "bg-violet-500", stripe: "bg-violet-500", soft: "bg-violet-500/10", border: "border-violet-500" },
  { key: "grey", label: "Grey", swatch: "bg-slate-400", stripe: "bg-slate-400", soft: "bg-slate-400/10", border: "border-slate-400" },
];
export const colorOf = (key?: string | null) => LOTY_COLORS.find(c => c.key === key) ?? null;

/** Colour and cover photo for every building, keyed by scheme. Empty for non-staff or before setup. */
export function useLotyMeta(enabled: boolean) {
  return useQuery({
    queryKey: ["loty-meta"], enabled,
    queryFn: async () => {
      const { data, error } = await supabase.from("loty_buildings").select("scheme_id, color, cover_path");
      if (error) return new Map<string, LotyMeta>();
      return new Map(((data ?? []) as LotyMeta[]).map(m => [m.scheme_id, m]));
    },
  });
}
/** All Loty notes (staff only), newest first. */
export function useLotyNotes(enabled: boolean) {
  return useQuery({
    queryKey: ["loty-notes"], enabled,
    queryFn: async () => {
      const { data, error } = await supabase.from("loty_notes").select("*").order("created_at", { ascending: false });
      if (error) return [] as LotyNote[];
      return (data ?? []) as LotyNote[];
    },
  });
}
/** A short-lived link to a cover photo in the private bucket. */
export function useCoverUrl(path?: string | null) {
  return useQuery({
    queryKey: ["loty-cover", path], enabled: !!path, staleTime: 50 * 60 * 1000,
    queryFn: async () => {
      const { data } = await supabase.storage.from("loty-covers").createSignedUrl(path!, 60 * 60);
      return data?.signedUrl ?? null;
    },
  });
}

const needsSetup = (msg: string) => /loty_buildings|loty_notes|loty-covers|schema cache|does not exist|Bucket not found/i.test(msg);
const setupHint = "Needs the Loty staff tools set up in Supabase first.";

export async function saveLotyMeta(schemeId: string, patch: Partial<Pick<LotyMeta, "color" | "cover_path">>) {
  const { error } = await supabase.from("loty_buildings").upsert({ scheme_id: schemeId, ...patch, updated_at: new Date().toISOString() });
  if (error) toast("Couldn't save that", { description: needsSetup(error.message) ? setupHint : error.message });
  return !error;
}
export async function uploadCover(schemeId: string, file: File) {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) { toast("Choose a JPG, PNG or WebP photo"); return false; }
  if (file.size > 5 * 1024 * 1024) { toast("That photo is over 5 MB", { description: "Choose a smaller one." }); return false; }
  const path = `${schemeId}/${Date.now()}.${file.type.split("/")[1]}`;
  const { error } = await supabase.storage.from("loty-covers").upload(path, file, { upsert: true, contentType: file.type });
  if (error) { toast("Couldn't upload the photo", { description: needsSetup(error.message) ? setupHint : error.message }); return false; }
  return saveLotyMeta(schemeId, { cover_path: path });
}

/** A side panel of one building's Loty notes. */
export function LotyNotesPanel({ schemeId, buildingName, userId, onClose }: { schemeId: string; buildingName: string; userId?: string | undefined; onClose: () => void }) {
  const queryClient = useQueryClient();
  const notes = useLotyNotes(true);
  const [draft, setDraft] = useState("");
  const list = (notes.data ?? []).filter(n => n.scheme_id === schemeId).sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.created_at.localeCompare(a.created_at));
  const refresh = () => void queryClient.invalidateQueries({ queryKey: ["loty-notes"] });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const add = async () => {
    const body = draft.trim(); if (!body) return;
    const { error } = await supabase.from("loty_notes").insert(userId ? { scheme_id: schemeId, body, author_id: userId } : { scheme_id: schemeId, body });
    if (error) { toast("Couldn't save the note", { description: needsSetup(error.message) ? setupHint : error.message }); return; }
    setDraft(""); refresh();
  };
  const pin = async (n: LotyNote) => { const { error } = await supabase.from("loty_notes").update({ pinned: !n.pinned }).eq("id", n.id); if (error) toast("Couldn't change that", { description: error.message }); refresh(); };
  const remove = async (n: LotyNote) => {
    if (!window.confirm("Delete this note?")) return;
    const { error } = await supabase.from("loty_notes").delete().eq("id", n.id);
    if (error) toast("Couldn't delete", { description: error.message }); refresh();
  };

  return createPortal(<>
    <div className="fixed inset-0 z-[60] bg-foreground/10" aria-hidden onClick={onClose}/>
    <aside role="dialog" aria-label={`Loty notes for ${buildingName}`} data-loty-notes
      className="soft-shadow fixed inset-0 z-[61] flex flex-col bg-card sm:inset-y-4 sm:left-auto sm:right-4 sm:w-[420px] sm:rounded-3xl sm:border sm:border-border/70">
      <div className="flex items-center justify-between gap-3 border-b border-border/70 px-5 py-4">
        <div className="min-w-0"><p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground"><StickyNote className="size-3.5"/>Loty notes · staff only</p>
          <p className="truncate text-sm font-medium">{buildingName}</p></div>
        <Button size="icon" variant="ghost" className="rounded-full" aria-label="Close notes" onClick={onClose}><X/></Button>
      </div>
      <div className="border-b border-border/70 p-4">
        <textarea value={draft} onChange={e => setDraft(e.target.value)} rows={3} maxLength={4000} aria-label="New note" placeholder="Add a note for the Loty team…"
          onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void add(); } }}
          className="w-full resize-none rounded-2xl border border-border/70 bg-background px-3.5 py-2.5 text-[14px] leading-5 outline-none focus:border-primary/50"/>
        <div className="mt-2 flex items-center justify-between"><p className="text-[11px] text-muted-foreground">Enter to save · Shift + Enter for a new line</p>
          <Button size="sm" className="rounded-full" disabled={!draft.trim()} onClick={() => void add()}>Add note</Button></div>
      </div>
      <ul className="flex-1 space-y-2 overflow-y-auto p-4">
        {notes.isLoading && <li className="text-[13px] text-muted-foreground">Loading…</li>}
        {notes.isSuccess && list.length === 0 && <li className="py-8 text-center text-[13px] text-muted-foreground">No notes yet. Keep track of calls, preferences and anything the team should know.</li>}
        {list.map(n => <li key={n.id} data-note className={`rounded-2xl border p-3 ${n.pinned ? "border-amber-300 bg-amber-50/60 dark:bg-amber-500/10" : "border-border/70"}`}>
          <p className="whitespace-pre-wrap break-words text-[14px] leading-5">{n.body}</p>
          <div className="mt-2 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
            <span>{n.pinned ? "Pinned · " : ""}{n.author_name ?? "Loty"} · {new Date(n.created_at).toLocaleString("en-AU", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}</span>
            <span className="flex gap-1">
              <button type="button" onClick={() => void pin(n)} aria-label={n.pinned ? "Unpin note" : "Pin note"} className="grid size-6 place-items-center rounded-full hover:bg-secondary">{n.pinned ? <PinOff className="size-3.5"/> : <Pin className="size-3.5"/>}</button>
              {n.author_id === userId && <button type="button" onClick={() => void remove(n)} aria-label="Delete note" className="grid size-6 place-items-center rounded-full hover:bg-secondary hover:text-destructive"><Trash2 className="size-3.5"/></button>}
            </span>
          </div>
        </li>)}
      </ul>
    </aside>
  </>, document.body);
}
