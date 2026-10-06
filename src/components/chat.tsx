import { createPortal } from "react-dom";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { MessageCircle, MoreHorizontal, Pencil, Send, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

// The building chat: one conversation for everyone in the building. Opens from the speech
// bubble in the header. Names come from each person's account and lot, set by the database.

export type ChatMessage = {
  id: string; scheme_id: string; user_id: string; author_name: string; author_label: string | null;
  body: string; created_at: string; edited_at: string | null; deleted_at: string | null;
};

const readKey = (userId: string, schemeId: string) => `loty-chat-read-${userId}-${schemeId}`;
const getRead = (k: string) => { try { return localStorage.getItem(k) ?? ""; } catch { return ""; } };
const setRead = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* storage unavailable */ } };

const time = (iso: string) => new Date(iso).toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit" });
const dayLabel = (iso: string) => {
  const d = new Date(iso); const today = new Date(); const y = new Date(); y.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === y.toDateString()) return "Yesterday";
  return d.toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short", year: d.getFullYear() === today.getFullYear() ? undefined : "numeric" });
};
const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]!.toUpperCase()).join("") || "?";

export function BuildingChat({ schemeId, userId, myName, buildingName }: {
  schemeId?: string | undefined; userId?: string | undefined; myName: string; buildingName?: string | undefined;
}) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [editing, setEditing] = useState<ChatMessage | null>(null);
  const [lastRead, setLastRead] = useState("");
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const atBottom = useRef(true);
  const key = ["chat", schemeId];

  const messages = useQuery({
    queryKey: key, enabled: !!schemeId,
    queryFn: async () => {
      const { data, error } = await supabase.from("chat_messages").select("*").eq("scheme_id", schemeId!).order("created_at", { ascending: false }).limit(300);
      if (error) throw error;
      return ((data ?? []) as ChatMessage[]).sort((a, b) => a.created_at.localeCompare(b.created_at));
    },
    refetchInterval: 30000, // backstop if live updates drop
  });

  // Live: new, edited and deleted messages appear without refreshing.
  useEffect(() => {
    if (!schemeId) return;
    const channel = supabase.channel(`chat-${schemeId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "chat_messages", filter: `scheme_id=eq.${schemeId}` },
        () => void queryClient.invalidateQueries({ queryKey: ["chat", schemeId] }))
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [schemeId, queryClient]);

  useEffect(() => { if (userId && schemeId) setLastRead(getRead(readKey(userId, schemeId))); }, [userId, schemeId]);

  const list = useMemo(() => messages.data ?? [], [messages.data]);
  const unread = list.filter(m => m.user_id !== userId && !m.deleted_at && m.created_at > lastRead).length;
  const firstUnreadId = useMemo(() => (open ? null : list.find(m => m.user_id !== userId && m.created_at > lastRead)?.id ?? null), [list, lastRead, userId, open]);

  // Opening the chat marks everything read.
  useEffect(() => {
    if (!open || !userId || !schemeId || !list.length) return;
    const newest = list.reduce((max, m) => (m.created_at > max ? m.created_at : max), "");
    if (newest > lastRead) { setRead(readKey(userId, schemeId), newest); setLastRead(newest); }
  }, [open, list, userId, schemeId, lastRead]);

  // Stay pinned to the newest message unless the reader has scrolled up.
  useLayoutEffect(() => {
    const el = listRef.current;
    if (el && open && atBottom.current) el.scrollTop = el.scrollHeight;
  }, [list.length, open]);
  useEffect(() => { if (open) { atBottom.current = true; setTimeout(() => inputRef.current?.focus(), 50); } }, [open]);

  const send = async () => {
    const body = draft.trim();
    if (!body || !schemeId) return;
    if (editing) {
      const { error } = await supabase.from("chat_messages").update({ body }).eq("id", editing.id);
      if (error) { toast("Could not save your edit", { description: error.message }); return; }
      setEditing(null); setDraft("");
    } else {
      setDraft(""); atBottom.current = true;
      // Shows straight away; the saved copy replaces it a moment later.
      const temp: ChatMessage = { id: `temp-${Date.now()}`, scheme_id: schemeId, user_id: userId ?? "", author_name: myName, author_label: null, body, created_at: new Date().toISOString(), edited_at: null, deleted_at: null };
      queryClient.setQueryData<ChatMessage[]>(key, old => [...(old ?? []), temp]);
      const { error } = await supabase.from("chat_messages").insert({ scheme_id: schemeId, body, author_name: myName });
      if (error) {
        queryClient.setQueryData<ChatMessage[]>(key, old => (old ?? []).filter(m => m.id !== temp.id));
        setDraft(body); toast("Message not sent", { description: error.message }); return;
      }
    }
    void queryClient.invalidateQueries({ queryKey: key });
  };
  const remove = async (m: ChatMessage) => {
    const { error } = await supabase.from("chat_messages").update({ deleted_at: new Date().toISOString() }).eq("id", m.id);
    if (error) { toast("Could not delete", { description: error.message }); return; }
    void queryClient.invalidateQueries({ queryKey: key });
  };
  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void send(); }
    if (e.key === "Escape" && editing) { e.stopPropagation(); setEditing(null); setDraft(""); }
  };

  return <>
    <Button size="icon" variant="ghost" className="relative rounded-full" aria-label={unread ? `Building chat, ${unread} unread` : "Building chat"} aria-expanded={open} onClick={() => setOpen(o => !o)} data-chat-button>
      <MessageCircle/>
      {unread > 0 && <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-destructive px-1 text-[10px] font-semibold leading-none text-white">{unread > 99 ? "99+" : unread}</span>}
    </Button>
    {/* Rendered on the page body: the header's blur would otherwise trap a fixed panel inside it. */}
    {open && createPortal(<div role="dialog" aria-label="Building chat" data-chat-panel
      onKeyDown={e => { if (e.key === "Escape" && !editing) setOpen(false); }}
      className="soft-shadow fixed inset-0 z-50 flex flex-col bg-card sm:inset-auto sm:right-4 sm:top-[76px] sm:h-[min(620px,calc(100vh-96px))] sm:w-[400px] sm:rounded-3xl sm:border sm:border-border/70">
      <div className="flex items-center justify-between gap-3 border-b border-border/70 px-5 py-4">
        <div className="min-w-0"><p className="truncate text-sm font-medium">{buildingName ?? "Building"} chat</p>
          <p className="text-[12px] text-muted-foreground">Everyone in the building can read this</p></div>
        <Button size="icon" variant="ghost" className="rounded-full" aria-label="Close chat" onClick={() => setOpen(false)}><X/></Button>
      </div>

      <div ref={listRef} onScroll={e => { const el = e.currentTarget; atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60; }}
        className="flex-1 overflow-y-auto px-4 py-4" aria-live="polite">
        {messages.isLoading && <p className="py-10 text-center text-[13px] text-muted-foreground">Loading…</p>}
        {messages.isSuccess && list.length === 0 && <div className="py-12 text-center">
          <MessageCircle className="mx-auto size-8 text-muted-foreground/60"/>
          <p className="mt-3 text-sm font-medium">No messages yet</p>
          <p className="mt-1 text-[13px] text-muted-foreground">Say hello, or let everyone know about an issue or update.</p>
        </div>}
        {list.map((m, i) => {
          const prev = list[i - 1];
          const mine = m.user_id === userId;
          const newDay = !prev || dayLabel(prev.created_at) !== dayLabel(m.created_at);
          const grouped = !newDay && prev && prev.user_id === m.user_id && new Date(m.created_at).getTime() - new Date(prev.created_at).getTime() < 5 * 60000;
          return <div key={m.id}>
            {newDay && <p className="my-3 text-center text-[11px] font-medium text-muted-foreground">{dayLabel(m.created_at)}</p>}
            {m.id === firstUnreadId && <p className="my-2 flex items-center gap-2 text-[11px] font-medium text-destructive"><span className="h-px flex-1 bg-destructive/40"/>New<span className="h-px flex-1 bg-destructive/40"/></p>}
            <div className={`group flex gap-2 ${mine ? "flex-row-reverse" : ""} ${grouped ? "mt-0.5" : "mt-3"}`} data-chat-message={mine ? "mine" : "theirs"}>
              {!mine && <div className="w-8 shrink-0">{!grouped && <span className="grid size-8 place-items-center rounded-full bg-secondary text-[11px] font-semibold" aria-hidden>{initials(m.author_name)}</span>}</div>}
              <div className={`flex min-w-0 max-w-[78%] flex-col ${mine ? "items-end" : "items-start"}`}>
                {!grouped && !mine && <p className="mb-1 px-1 text-[12px]"><span className="font-medium">{m.author_name}</span>{m.author_label ? <span className="text-muted-foreground"> · {m.author_label}</span> : null}</p>}
                <div className="flex items-center gap-1">
                  {mine && !m.deleted_at && !m.id.startsWith("temp-") && <OwnMenu onEdit={() => { setEditing(m); setDraft(m.body); inputRef.current?.focus(); }} onDelete={() => void remove(m)}/>}
                  <div className={`whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2 text-[14px] leading-5 ${m.deleted_at ? "border border-dashed border-border bg-transparent italic text-muted-foreground"
                    : mine ? "rounded-br-md bg-primary text-primary-foreground" : "rounded-bl-md bg-secondary"}`}>{m.deleted_at ? "Message deleted" : m.body}</div>
                </div>
                <p className="mt-0.5 px-1 text-[10px] text-muted-foreground">{m.id.startsWith("temp-") ? "Sending…" : time(m.created_at)}{m.edited_at && !m.deleted_at ? " · edited" : ""}</p>
              </div>
            </div>
          </div>;
        })}
      </div>

      <div className="border-t border-border/70 p-3">
        {editing && <div className="mb-2 flex items-center justify-between rounded-xl bg-secondary px-3 py-1.5 text-[12px]"><span>Editing your message</span>
          <button type="button" className="text-muted-foreground hover:text-foreground" onClick={() => { setEditing(null); setDraft(""); }}>Cancel</button></div>}
        <div className="flex items-end gap-2">
          <textarea ref={inputRef} value={draft} onChange={e => setDraft(e.target.value)} onKeyDown={onKey} rows={1} maxLength={4000}
            placeholder="Message everyone in the building" aria-label="Message"
            className="max-h-32 min-h-[40px] flex-1 resize-none rounded-2xl border border-border/70 bg-background px-3.5 py-2.5 text-[14px] leading-5 outline-none focus:border-primary/50"
            style={{ height: `${Math.min(128, 40 + (draft.split("\n").length - 1) * 20)}px` }}/>
          <Button size="icon" className="size-10 shrink-0 rounded-full" aria-label={editing ? "Save edit" : "Send"} disabled={!draft.trim()} onClick={() => void send()}><Send className="size-4"/></Button>
        </div>
        <p className="mt-1.5 px-1 text-[10px] text-muted-foreground">Enter to send · Shift + Enter for a new line</p>
      </div>
    </div>, document.body)}
  </>;
}

function OwnMenu({ onEdit, onDelete }: { onEdit: () => void; onDelete: () => void }) {
  const [open, setOpen] = useState(false);
  return <Popover open={open} onOpenChange={setOpen}>
    <PopoverTrigger asChild><button type="button" aria-label="Message options" className="grid size-6 place-items-center rounded-full text-muted-foreground opacity-0 transition-opacity hover:bg-secondary focus:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100"><MoreHorizontal className="size-4"/></button></PopoverTrigger>
    <PopoverContent align="end" className="w-36 p-1">
      <button type="button" className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[13px] hover:bg-secondary" onClick={() => { setOpen(false); onEdit(); }}><Pencil className="size-3.5"/>Edit</button>
      <button type="button" className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[13px] text-destructive hover:bg-secondary" onClick={() => { setOpen(false); onDelete(); }}><Trash2 className="size-3.5"/>Delete</button>
    </PopoverContent>
  </Popover>;
}
