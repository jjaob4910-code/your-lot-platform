import { createPortal } from "react-dom";
import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, AtSign, Building2, CalendarDays, Camera, Check, CheckCheck, Coins, FileText, Gavel, LayoutDashboard, Link2, Mail, MessageCircle, MoreHorizontal, Pencil, Phone, Send, ShieldCheck, SmilePlus, Trash2, Wrench, X } from "lucide-react";
import { CHAT_ICONS, ICON_BY_CODE, ICON_PATTERN, LotyIcon, REACTIONS } from "@/lib/chat-icons";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useBuildingContacts } from "./who-runs";
import { ChatComposer, type ComposerHandle } from "./chat-composer";

// The building chat: one conversation for everyone in the building. Opens from the speech
// bubble in the header. Names, labels and photos come from each person's profile and lot;
// the database stamps them so nobody can post as someone else.

export type ChatMessage = {
  id: string; scheme_id: string; user_id: string; author_name: string; author_label: string | null;
  body: string; created_at: string; edited_at: string | null; deleted_at: string | null; mentions?: string[] | null;
};
export type ChatMember = { user_id: string; name: string; label: string | null; avatar_url: string | null; role: string; last_read_at: string | null };

/** Opens the chat from anywhere (e.g. a bell item). */
export const OPEN_CHAT_EVENT = "loty-open-chat";
export const openChat = () => window.dispatchEvent(new Event(OPEN_CHAT_EVENT));

export function useChatMessages(schemeId?: string | null) {
  return useQuery({
    queryKey: ["chat", schemeId], enabled: !!schemeId,
    queryFn: async () => {
      const { data, error } = await supabase.from("chat_messages").select("*").eq("scheme_id", schemeId!).order("created_at", { ascending: false }).limit(300);
      if (error) throw error;
      return ((data ?? []) as ChatMessage[]).sort((a, b) => a.created_at.localeCompare(b.created_at));
    },
    refetchInterval: 30000, // backstop if live updates drop
  });
}
export function useChatMembers(schemeId?: string | null) {
  return useQuery({
    queryKey: ["chat-members", schemeId], enabled: !!schemeId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("chat_members", { _scheme: schemeId! });
      if (error) return [] as ChatMember[]; // before the chat upgrade is applied
      return (Array.isArray(data) ? data : []) as ChatMember[];
    },
    refetchInterval: 60000,
  });
}

export type ChatReaction = { message_id: string; user_id: string; emoji: string };
function useChatReactions(schemeId?: string | null) {
  return useQuery({
    queryKey: ["chat-reactions", schemeId], enabled: !!schemeId,
    queryFn: async () => {
      const { data, error } = await supabase.from("chat_reactions").select("message_id, user_id, emoji").eq("scheme_id", schemeId!);
      if (error) return [] as ChatReaction[]; // before the chat upgrade is applied
      return (data ?? []) as ChatReaction[];
    },
  });
}

/** Something in the app a message can link to: a page, or an item on a page. */
export type ChatLinkTarget = { label: string; target: string; kind: "page" | "work-order" | "meeting" | "document" };
const LINK_ICON: Record<string, typeof Wrench> = {
  Dashboard: LayoutDashboard, Lots: Building2, Insurance: ShieldCheck, "Work orders": Wrench, Finance: Coins, AGM: Gavel, Calendar: CalendarDays, Documents: FileText,
};
const linkIcon = (target: string) => LINK_ICON[target.split("/")[0]!] ?? Link2;
export const PAGE_LINKS: ChatLinkTarget[] = [
  ["Dashboard", "Dashboard"], ["Lots", "Lots"], ["Insurance", "Insurance"], ["Work orders", "Work orders"], ["Finance · Budget", "Finance/Budget"],
  ["Finance · Levies", "Finance/Levies"], ["Finance · Cashflow", "Finance/Cashflow"], ["AGM", "AGM"], ["Calendar", "Calendar"], ["Documents", "Documents"],
].map(([label, target]) => ({ label: label!, target: target!, kind: "page" as const }));
// Links are stored in the message as #[Label](Target); icons as :code:; mentions as @Name.
const LINK_PATTERN = /#\[([^\]\n]{1,80})\]\(([^)\n]{1,40})\)/g;

const missingMentions = (message: string) => /mentions/i.test(message) && /column|schema cache/i.test(message);

/** Messages after my last read that mention me: for the bell. */
export function unreadMentions(messages: ChatMessage[], members: ChatMember[], userId?: string) {
  const me = members.find(m => m.user_id === userId);
  const since = me?.last_read_at ?? "";
  return messages.filter(m => m.user_id !== userId && !m.deleted_at && m.created_at > since && (m.mentions ?? []).includes(userId ?? ""));
}

const time = (iso: string) => new Date(iso).toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit" });
const dayLabel = (iso: string) => {
  const d = new Date(iso); const today = new Date(); const y = new Date(); y.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === y.toDateString()) return "Yesterday";
  return d.toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short", year: d.getFullYear() === today.getFullYear() ? undefined : "numeric" });
};
const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]!.toUpperCase()).join("") || "?";
const TONES = ["bg-sky-100 text-sky-800", "bg-amber-100 text-amber-800", "bg-emerald-100 text-emerald-800", "bg-rose-100 text-rose-800", "bg-violet-100 text-violet-800", "bg-teal-100 text-teal-800"];
const toneFor = (id: string) => TONES[[...String(id ?? "")].reduce((t, c) => t + c.charCodeAt(0), 0) % TONES.length]!;
const listNames = (names: string[]) => names.length <= 2 ? names.join(" and ") : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;

function Avatar({ id, name, url, size = 8 }: { id: string; name: string; url?: string | null | undefined; size?: 6 | 8 | 10 | 16 }) {
  const cls = { 6: "size-6 text-[9px]", 8: "size-8 text-[11px]", 10: "size-10 text-[13px]", 16: "size-16 text-lg" }[size];
  return url ? <img src={url} alt="" className={`${cls} shrink-0 rounded-full object-cover`}/>
    : <span className={`${cls} grid shrink-0 place-items-center rounded-full font-semibold ${toneFor(id)}`} aria-hidden>{initials(name)}</span>;
}

type View = { kind: "chat" } | { kind: "people" } | { kind: "person"; id: string } | { kind: "me" };

export function BuildingChat({ schemeId, userId, myName, buildingName, chatName, isCommittee, settingsId, onRenamed, goTo, linkTargets = [] }: {
  schemeId?: string | undefined; userId?: string | undefined; myName: string; buildingName?: string | undefined;
  chatName?: string | null | undefined; isCommittee: boolean; settingsId?: string | null | undefined; onRenamed: () => void;
  /** Opens a page of the app (closing the chat), for links in messages. */
  goTo: (target: string) => void;
  /** Work orders, meetings and documents people can link to, alongside the pages. */
  linkTargets?: ChatLinkTarget[];
}) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<View>({ kind: "chat" });
  const [draft, setDraft] = useState("");
  const [picked, setPicked] = useState<ChatMember[]>([]);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionIndex, setMentionIndex] = useState(0);
  const [editing, setEditing] = useState<ChatMessage | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [showReaders, setShowReaders] = useState(false);
  const [renameError, setRenameError] = useState<string | null>(null);
  const [linkQuery, setLinkQuery] = useState<string | null>(null);
  const [linkIndex, setLinkIndex] = useState(0);
  const [iconsOpen, setIconsOpen] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<ComposerHandle>(null);
  const atBottom = useRef(true);
  const title = chatName?.trim() || `${buildingName ?? "Building"} chat`;

  const messages = useChatMessages(schemeId);
  const membersQ = useChatMembers(schemeId);
  const reactionsQ = useChatReactions(schemeId);
  const reactionsBy = useMemo(() => {
    const map = new Map<string, Map<string, string[]>>();
    for (const r of reactionsQ.data ?? []) {
      const byEmoji = map.get(r.message_id) ?? new Map<string, string[]>();
      byEmoji.set(r.emoji, [...(byEmoji.get(r.emoji) ?? []), r.user_id]); map.set(r.message_id, byEmoji);
    }
    return map;
  }, [reactionsQ.data]);
  const list = useMemo(() => messages.data ?? [], [messages.data]);
  const members = useMemo(() => membersQ.data ?? [], [membersQ.data]);
  const byId = useMemo(() => new Map(members.map(m => [m.user_id, m])), [members]);
  const me = byId.get(userId ?? "");
  const lastRead = me?.last_read_at ?? "";

  // Live: messages and read receipts update without refreshing.
  useEffect(() => {
    if (!schemeId) return;
    const channel = supabase.channel(`chat-${schemeId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "chat_messages", filter: `scheme_id=eq.${schemeId}` },
        () => void queryClient.invalidateQueries({ queryKey: ["chat", schemeId] }))
      .on("postgres_changes", { event: "*", schema: "public", table: "chat_reads", filter: `scheme_id=eq.${schemeId}` },
        () => void queryClient.invalidateQueries({ queryKey: ["chat-members", schemeId] }))
      .on("postgres_changes", { event: "*", schema: "public", table: "chat_reactions", filter: `scheme_id=eq.${schemeId}` },
        () => void queryClient.invalidateQueries({ queryKey: ["chat-reactions", schemeId] }))
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [schemeId, queryClient]);

  useEffect(() => {
    const show = () => { setOpen(true); setView({ kind: "chat" }); };
    window.addEventListener(OPEN_CHAT_EVENT, show);
    return () => window.removeEventListener(OPEN_CHAT_EVENT, show);
  }, []);

  const unread = list.filter(m => m.user_id !== userId && !m.deleted_at && m.created_at > lastRead);
  const mentioned = unread.some(m => (m.mentions ?? []).includes(userId ?? ""));
  // Where you'd read up to when you opened the chat, so the "New" line stays put while you read.
  const [readMark, setReadMark] = useState<string | null>(null);
  useEffect(() => { if (!open) setReadMark(null); else if (readMark === null && membersQ.isSuccess) setReadMark(lastRead); }, [open, readMark, lastRead, membersQ.isSuccess]);
  const firstUnreadId = useMemo(() => (readMark ? list.find(m => m.user_id !== userId && m.created_at > readMark)?.id ?? null : null), [list, readMark, userId]);

  // Reading the chat records how far you've read, for your unread count and others' receipts.
  const newest = list.reduce((max, m) => (m.created_at > max && !m.id.startsWith("temp-") ? m.created_at : max), "");
  const written = useRef("");
  useEffect(() => {
    if (!open || view.kind !== "chat" || !userId || !schemeId || !newest || newest <= lastRead || written.current >= newest) return;
    written.current = newest; // once per newest message, even if saving fails
    void supabase.from("chat_reads").upsert({ scheme_id: schemeId, user_id: userId, last_read_at: newest })
      .then(() => queryClient.invalidateQueries({ queryKey: ["chat-members", schemeId] }));
  }, [open, view.kind, newest, lastRead, userId, schemeId, queryClient]);

  useLayoutEffect(() => {
    const el = listRef.current;
    if (el && open && atBottom.current) el.scrollTop = el.scrollHeight;
  }, [list.length, open, view.kind]);
  useEffect(() => { if (open && view.kind === "chat") { atBottom.current = true; setTimeout(() => inputRef.current?.focus(), 50); } }, [open, view.kind]);

  // ── @mentions ──
  const mentionable = members.filter(m => m.user_id !== userId);
  const matches = mentionQuery === null ? [] : mentionable.filter(m => m.name.toLowerCase().includes(mentionQuery.toLowerCase())).slice(0, 6);
  const onDraft = (value: string, before: string) => {
    setDraft(value);
    const at = /(?:^|\s)@([^\s@]{0,30})$/.exec(before);
    setMentionQuery(at ? at[1]! : null); setMentionIndex(0);
    const hash = /(?:^|\s)#([^\s#[]{0,30})$/.exec(before);
    setLinkQuery(hash ? hash[1]! : null); setLinkIndex(0);
  };
  const allLinks = [...PAGE_LINKS, ...linkTargets];
  const linkMatches = linkQuery === null ? [] : allLinks.filter(l => l.label.toLowerCase().includes(linkQuery.toLowerCase())).slice(0, 8);
  // Picked icons, links and people go into the box as chips; the saved text keeps their codes.
  const pickLink = (l: ChatLinkTarget) => { inputRef.current?.insertToken(`#[${l.label.replace(/[\]\n]/g, "")}](${l.target})`, /#([^\s#[]{0,30})$/); setLinkQuery(null); };
  const pickIcon = (code: string) => { inputRef.current?.insertToken(`:${code}:`); setIconsOpen(false); };
  const addPicked = (m: ChatMember) => setPicked(p => p.some(x => x.user_id === m.user_id) ? p : [...p, m]);
  const pickMention = (m: ChatMember) => { inputRef.current?.insertToken(`@${m.name}`, /@([^\s@]{0,30})$/); addPicked(m); setMentionQuery(null); };
  const mentionMember = (m: ChatMember) => { setView({ kind: "chat" }); addPicked(m); setTimeout(() => inputRef.current?.insertToken(`@${m.name}`), 60); };

  const send = async () => {
    const body = draft.trim();
    if (!body || !schemeId) return;
    const mentions = picked.filter(m => body.includes(`@${m.name}`)).map(m => m.user_id);
    setMentionQuery(null); setLinkQuery(null);
    if (editing) {
      const patch: { body: string; mentions?: string[] } = mentions.length ? { body, mentions } : { body };
      let { error } = await supabase.from("chat_messages").update(patch).eq("id", editing.id);
      if (error && missingMentions(error.message)) ({ error } = await supabase.from("chat_messages").update({ body }).eq("id", editing.id));
      if (error) { toast("Could not save your edit", { description: error.message }); return; }
      setEditing(null); setDraft(""); setPicked([]); inputRef.current?.clear();
    } else {
      setDraft(""); setPicked([]); inputRef.current?.clear(); atBottom.current = true;
      const temp: ChatMessage = { id: `temp-${Date.now()}`, scheme_id: schemeId, user_id: userId ?? "", author_name: myName, author_label: null, body, created_at: new Date().toISOString(), edited_at: null, deleted_at: null, mentions };
      queryClient.setQueryData<ChatMessage[]>(["chat", schemeId], old => [...(old ?? []), temp]);
      // Mentions are only sent when there are some, and dropped if the database doesn't have them yet,
      // so text, icons and links always go through.
      const row: { scheme_id: string; body: string; author_name: string; mentions?: string[] } = { scheme_id: schemeId, body, author_name: myName };
      let { error } = await supabase.from("chat_messages").insert(mentions.length ? { ...row, mentions } : row);
      if (error && missingMentions(error.message)) ({ error } = await supabase.from("chat_messages").insert(row));
      if (error) {
        queryClient.setQueryData<ChatMessage[]>(["chat", schemeId], old => (old ?? []).filter(m => m.id !== temp.id));
        setDraft(body); inputRef.current?.setText(body); toast("Message not sent", { description: error.message }); return;
      }
    }
    void queryClient.invalidateQueries({ queryKey: ["chat", schemeId] });
  };
  const remove = async (m: ChatMessage) => {
    const { error } = await supabase.from("chat_messages").update({ deleted_at: new Date().toISOString() }).eq("id", m.id);
    if (error) { toast("Could not delete", { description: error.message }); return; }
    void queryClient.invalidateQueries({ queryKey: ["chat", schemeId] });
  };
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (linkMatches.length && linkQuery !== null) {
      if (e.key === "ArrowDown") { e.preventDefault(); setLinkIndex(i => (i + 1) % linkMatches.length); return; }
      if (e.key === "ArrowUp") { e.preventDefault(); setLinkIndex(i => (i - 1 + linkMatches.length) % linkMatches.length); return; }
      if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); pickLink(linkMatches[linkIndex]!); return; }
      if (e.key === "Escape") { e.stopPropagation(); setLinkQuery(null); return; }
    }
    if (matches.length && mentionQuery !== null) {
      if (e.key === "ArrowDown") { e.preventDefault(); setMentionIndex(i => (i + 1) % matches.length); return; }
      if (e.key === "ArrowUp") { e.preventDefault(); setMentionIndex(i => (i - 1 + matches.length) % matches.length); return; }
      if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); pickMention(matches[mentionIndex]!); return; }
      if (e.key === "Escape") { e.stopPropagation(); setMentionQuery(null); return; }
    }
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void send(); }
    if (e.key === "Escape" && editing) { e.stopPropagation(); setEditing(null); setDraft(""); inputRef.current?.clear(); }
  };

  const rename = async (name: string) => {
    if (!schemeId) return;
    const trimmed = name.trim();
    const value = !trimmed || trimmed === `${buildingName ?? "Building"} chat` ? null : trimmed;
    if (value === (chatName?.trim() || null)) { setRenaming(false); return; }
    const { error } = settingsId
      ? await supabase.from("scheme_settings").update({ chat_name: value }).eq("id", settingsId)
      : await supabase.from("scheme_settings").insert({ scheme_id: schemeId, chat_name: value });
    if (error) {
      setRenameError(/chat_name|column|schema cache/i.test(error.message)
        ? "Renaming needs the chat upgrade set up in Supabase first." : `Couldn't save: ${error.message}`);
      return;
    }
    setRenaming(false); setRenameError(null); onRenamed(); toast(value ? `Chat renamed to “${value}”` : "Chat name reset");
  };

  // Turns a message's text into: link chips #[Label](Target), Loty icons :code:, and @Name mentions
  // (a mention of you stands out more).
  const mentionRe = useMemo(() => {
    const names = members.map(x => x.name).filter(Boolean).sort((a, b) => b.length - a.length);
    return names.length ? new RegExp(`@(${names.map(n => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "g") : null;
  }, [members]);
  const iconsOnly = (body: string) => body.replace(ICON_PATTERN, (m, c: string) => (ICON_BY_CODE.has(c) ? "" : m)).trim() === "" && /:([a-z-]{2,20}):/.test(body);
  const renderBody = (m: ChatMessage, mine: boolean): ReactNode => {
    const big = iconsOnly(m.body);
    const out: ReactNode[] = []; let k = 0;
    const mentions = (text: string) => {
      if (!mentionRe || !text.includes("@")) { out.push(text); return; }
      let last = 0;
      for (const hit of text.matchAll(mentionRe)) {
        out.push(text.slice(last, hit.index));
        const isMe = me && hit[1] === me.name;
        out.push(<span key={k++} data-mention className={`rounded px-0.5 font-medium ${mine ? "bg-primary-foreground/20" : isMe ? "bg-amber-200/80 text-amber-950" : "text-primary"}`}>{hit[0]}</span>);
        last = hit.index! + hit[0].length;
      }
      out.push(text.slice(last));
    };
    const icons = (text: string) => {
      let last = 0;
      for (const hit of text.matchAll(ICON_PATTERN)) {
        if (!ICON_BY_CODE.has(hit[1]!)) continue;
        mentions(text.slice(last, hit.index));
        out.push(<LotyIcon key={k++} code={hit[1]!} size={big ? "lg" : "sm"} onPrimary={mine && !big}/>);
        last = hit.index! + hit[0].length;
      }
      mentions(text.slice(last));
    };
    let last = 0;
    for (const hit of m.body.matchAll(LINK_PATTERN)) {
      icons(m.body.slice(last, hit.index));
      const [, label, target] = hit; const Icon = linkIcon(target!);
      out.push(<button key={k++} type="button" data-chat-link={target} onClick={() => { setOpen(false); goTo(target!); }}
        className={`mx-0.5 inline-flex max-w-full items-center gap-1 rounded-full px-2 py-0.5 align-middle text-[13px] font-medium underline-offset-2 hover:underline ${mine ? "bg-primary-foreground/20 text-primary-foreground" : "bg-card text-primary ring-1 ring-primary/20"}`}>
        <Icon className="size-3.5 shrink-0"/><span className="truncate">{label}</span></button>);
      last = hit.index! + hit[0].length;
    }
    icons(m.body.slice(last));
    return big ? <span className="flex flex-wrap gap-1.5">{out}</span> : out;
  };

  const toggleReaction = async (m: ChatMessage, code: string) => {
    if (!schemeId || !userId) return;
    const mine = reactionsBy.get(m.id)?.get(code)?.includes(userId);
    const key = ["chat-reactions", schemeId];
    queryClient.setQueryData<ChatReaction[]>(key, old => mine ? (old ?? []).filter(r => !(r.message_id === m.id && r.user_id === userId && r.emoji === code)) : [...(old ?? []), { message_id: m.id, user_id: userId, emoji: code }]);
    const { error } = mine
      ? await supabase.from("chat_reactions").delete().eq("message_id", m.id).eq("user_id", userId).eq("emoji", code)
      : await supabase.from("chat_reactions").insert({ message_id: m.id, scheme_id: schemeId, user_id: userId, emoji: code });
    if (error) toast("Couldn't save your reaction", { description: /chat_reactions|schema cache/i.test(error.message) ? "Reactions need the chat upgrade set up in Supabase first." : error.message });
    void queryClient.invalidateQueries({ queryKey: key });
  };

  // Read receipts for your most recent message.
  const myLast = [...list].reverse().find(m => m.user_id === userId && !m.deleted_at);
  const readers = myLast && !myLast.id.startsWith("temp-") ? members.filter(m => m.user_id !== userId && m.last_read_at && m.last_read_at >= myLast.created_at) : [];
  const receipt = !myLast ? null : myLast.id.startsWith("temp-") ? "Sending…"
    : readers.length === 0 ? "Delivered" : readers.length <= 2 ? `Read by ${listNames(readers.map(r => r.name.split(" ")[0]!))}` : `Read by ${readers.length}`;

  const person = view.kind === "person" ? byId.get(view.id) : null;
  const sortedPeople = [...members].sort((a, b) => {
    const rank = (m: ChatMember) => (m.role === "Loty" || m.role === "Manager" ? 0 : m.role === "Committee" ? 1 : 2);
    return rank(a) - rank(b) || (a.label ?? "").localeCompare(b.label ?? "", undefined, { numeric: true });
  });

  return <>
    <Button size="icon" variant="ghost" className="relative rounded-full" aria-label={unread.length ? `Building chat, ${unread.length} unread${mentioned ? ", you were mentioned" : ""}` : "Building chat"}
      aria-expanded={open} onClick={() => { setOpen(o => !o); setView({ kind: "chat" }); }} data-chat-button>
      <MessageCircle/>
      {unread.length > 0 && <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-destructive px-1 text-[10px] font-semibold leading-none text-white">{mentioned ? "@" : unread.length > 99 ? "99+" : unread.length}</span>}
    </Button>
    {/* Rendered on the page body: the header's blur would otherwise trap a fixed panel inside it. */}
    {open && createPortal(<div role="dialog" aria-label={title} data-chat-panel
      onKeyDown={e => { if (e.key === "Escape" && !editing && mentionQuery === null && !renaming) { if (view.kind !== "chat") setView({ kind: "chat" }); else setOpen(false); } }}
      className="soft-shadow fixed inset-0 z-50 flex flex-col bg-card sm:inset-auto sm:right-4 sm:top-[76px] sm:h-[min(640px,calc(100vh-96px))] sm:w-[400px] sm:rounded-3xl sm:border sm:border-border/70">

      {/* Header */}
      <div className="flex items-center gap-2 border-b border-border/70 px-4 py-3">
        {view.kind !== "chat" && <Button size="icon" variant="ghost" className="rounded-full" aria-label="Back to chat" onClick={() => setView({ kind: "chat" })}><ArrowLeft/></Button>}
        <div className="min-w-0 flex-1">
          {renaming
            ? <form onSubmit={e => { e.preventDefault(); void rename(String(new FormData(e.currentTarget).get("name") ?? "")); }} className="flex items-center gap-1">
                <Input name="name" autoFocus defaultValue={title} aria-label="Chat name" maxLength={60} className="h-8"
                  onFocus={e => { const v = e.currentTarget.value.length; e.currentTarget.setSelectionRange(v, v); }}
                  onChange={() => setRenameError(null)}
                  onKeyDown={e => { if (e.key === "Escape") { e.stopPropagation(); setRenaming(false); setRenameError(null); } }}/>
                <Button type="submit" size="icon" variant="ghost" className="size-8 rounded-full" aria-label="Save name"><Check className="size-4"/></Button>
              </form>
            : <div className="flex items-center gap-1">
                <p className="truncate text-sm font-medium" data-chat-title>{view.kind === "people" ? "People" : view.kind === "me" ? "Your profile" : view.kind === "person" ? person?.name ?? "Profile" : title}</p>
                {view.kind === "chat" && isCommittee && <button type="button" aria-label="Rename chat" onClick={() => setRenaming(true)} className="grid size-6 place-items-center rounded-full text-muted-foreground hover:bg-secondary"><Pencil className="size-3"/></button>}
              </div>}
          {renaming && renameError && <p role="alert" className="mt-1 text-[11px] text-destructive" data-rename-error>{renameError}</p>}
          {view.kind === "chat" && !renaming && <button type="button" onClick={() => setView({ kind: "people" })} className="mt-0.5 flex items-center gap-1.5 text-[12px] text-muted-foreground hover:text-foreground" data-people-button>
            <span className="flex -space-x-1.5">{sortedPeople.slice(0, 4).map(m => <span key={m.user_id} className="rounded-full ring-2 ring-card"><Avatar id={m.user_id} name={m.name} url={m.avatar_url} size={6}/></span>)}</span>
            {members.length} {members.length === 1 ? "person" : "people"}
          </button>}
        </div>
        {view.kind === "chat" && <button type="button" onClick={() => setView({ kind: "me" })} aria-label="Your profile" className="rounded-full" data-my-profile>
          <Avatar id={userId ?? "me"} name={me?.name ?? myName} url={me?.avatar_url}/></button>}
        <Button size="icon" variant="ghost" className="rounded-full" aria-label="Close chat" onClick={() => setOpen(false)}><X/></Button>
      </div>

      {view.kind === "people" && <ul className="flex-1 divide-y divide-border/60 overflow-y-auto px-2 py-1" data-people-list>
        {sortedPeople.map(m => <li key={m.user_id}><button type="button" onClick={() => setView({ kind: "person", id: m.user_id })} className="flex w-full items-center gap-3 rounded-xl px-2 py-2.5 text-left hover:bg-secondary/60">
          <Avatar id={m.user_id} name={m.name} url={m.avatar_url} size={10}/>
          <span className="min-w-0"><span className="block truncate text-sm font-medium">{m.name}{m.user_id === userId ? " (you)" : ""}</span>
            {m.label && <span className="block text-[12px] text-muted-foreground">{m.label}</span>}</span>
        </button></li>)}
      </ul>}

      {view.kind === "person" && person && <PersonCard person={person} schemeId={schemeId} isMe={person.user_id === userId}
        onMention={() => mentionMember(person)} onEditMe={() => setView({ kind: "me" })}/>}

      {view.kind === "me" && <MyProfile userId={userId} current={me} fallbackName={myName} onSaved={() => { void queryClient.invalidateQueries({ queryKey: ["chat-members", schemeId] }); setView({ kind: "chat" }); }}/>}

      {view.kind === "chat" && <>
        <div ref={listRef} onScroll={e => { const el = e.currentTarget; atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60; }}
          className="flex-1 overflow-y-auto px-4 py-4" aria-live="polite">
          {messages.isLoading && <p className="py-10 text-center text-[13px] text-muted-foreground">Loading…</p>}
          {messages.isSuccess && list.length === 0 && <div className="py-12 text-center">
            <MessageCircle className="mx-auto size-8 text-muted-foreground/60"/>
            <p className="mt-3 text-sm font-medium">No messages yet</p>
            <p className="mt-1 text-[13px] text-muted-foreground">Say hello, or let everyone know about an issue or update. Type @ to mention someone.</p>
          </div>}
          {list.map((m, i) => {
            const prev = list[i - 1];
            const mine = m.user_id === userId;
            const who = byId.get(m.user_id);
            const name = who?.name ?? m.author_name;
            const label = who?.label ?? m.author_label;
            const newDay = !prev || dayLabel(prev.created_at) !== dayLabel(m.created_at);
            const grouped = !newDay && prev && prev.user_id === m.user_id && new Date(m.created_at).getTime() - new Date(prev.created_at).getTime() < 5 * 60000;
            const mentionsMe = !mine && (m.mentions ?? []).includes(userId ?? "");
            return <Fragment key={m.id}>
              {newDay && <p className="my-3 text-center text-[11px] font-medium text-muted-foreground">{dayLabel(m.created_at)}</p>}
              {m.id === firstUnreadId && <p className="my-2 flex items-center gap-2 text-[11px] font-medium text-destructive"><span className="h-px flex-1 bg-destructive/40"/>New<span className="h-px flex-1 bg-destructive/40"/></p>}
              <div className={`group flex gap-2 ${mine ? "flex-row-reverse" : ""} ${grouped ? "mt-0.5" : "mt-3"}`} data-chat-message={mine ? "mine" : "theirs"}>
                {mine && <div className="w-6 shrink-0 self-end">{!grouped && <button type="button" onClick={() => setView({ kind: "me" })} aria-label="Your profile" data-my-bubble><Avatar id={m.user_id} name={name} url={who?.avatar_url} size={6}/></button>}</div>}
                {!mine && <div className="w-8 shrink-0">{!grouped && <button type="button" onClick={() => setView({ kind: "person", id: m.user_id })} aria-label={`${name}'s profile`}><Avatar id={m.user_id} name={name} url={who?.avatar_url}/></button>}</div>}
                <div className={`flex min-w-0 max-w-[78%] flex-col ${mine ? "items-end" : "items-start"}`}>
                  {!grouped && <p className="mb-1 px-1 text-[12px]" data-chat-author>
                    {mine ? <span className="font-medium">You</span>
                      : <button type="button" className="font-medium hover:underline" onClick={() => setView({ kind: "person", id: m.user_id })}>{name}</button>}
                    {!mine && label ? <span className="text-muted-foreground"> · {label}</span> : null}</p>}
                  <div className={`flex items-center gap-1 ${mine ? "" : "flex-row-reverse justify-end"}`}>
                    {!m.deleted_at && !m.id.startsWith("temp-") && <ReactPicker onPick={code => void toggleReaction(m, code)}/>}
                    {mine && !m.deleted_at && !m.id.startsWith("temp-") && <OwnMenu onEdit={() => { setEditing(m); setDraft(m.body); inputRef.current?.setText(m.body); setPicked(members.filter(x => (m.mentions ?? []).includes(x.user_id))); inputRef.current?.focus(); }} onDelete={() => void remove(m)}/>}
                    <div className={`whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2 text-[14px] leading-5 ${m.deleted_at ? "border border-dashed border-border bg-transparent italic text-muted-foreground"
                      : iconsOnly(m.body) ? "bg-transparent px-0 py-0.5"
                      : mine ? "rounded-br-md bg-primary text-primary-foreground" : mentionsMe ? "rounded-bl-md bg-amber-50 ring-1 ring-amber-300 dark:bg-amber-500/10" : "rounded-bl-md bg-secondary"}`}>{m.deleted_at ? "Message deleted" : renderBody(m, mine)}</div>
                  </div>
                  {reactionsBy.get(m.id) && <div className={`mt-1 flex flex-wrap gap-1 ${mine ? "justify-end" : ""}`} data-reactions>
                    {[...reactionsBy.get(m.id)!.entries()].map(([code, users]) => { const mineToo = users.includes(userId ?? "");
                      return <button key={code} type="button" onClick={() => void toggleReaction(m, code)} title={listNames(users.map(u => u === userId ? "You" : byId.get(u)?.name ?? "Someone"))}
                        aria-label={`${ICON_BY_CODE.get(code)?.label ?? code}, ${users.length}${mineToo ? ", including you" : ""}`}
                        className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[11px] font-medium tabular-nums ${mineToo ? "border-primary/40 bg-primary/10 text-primary" : "border-border bg-card text-muted-foreground hover:bg-secondary"}`}>
                        <LotyIcon code={code}/>{users.length}</button>; })}
                  </div>}
                  <p className="mt-0.5 px-1 text-[10px] text-muted-foreground">{m.id.startsWith("temp-") ? "" : time(m.created_at)}{m.edited_at && !m.deleted_at ? " · edited" : ""}</p>
                  {myLast && m.id === myLast.id && receipt && <button type="button" data-receipt onClick={() => setShowReaders(s => !s)} disabled={!readers.length}
                    className="mt-0.5 flex items-center gap-1 px-1 text-[11px] text-muted-foreground enabled:hover:text-foreground">
                    {readers.length ? <CheckCheck className="size-3.5 text-primary"/> : receipt === "Delivered" ? <Check className="size-3.5"/> : null}{receipt}
                  </button>}
                  {myLast && m.id === myLast.id && showReaders && readers.length > 0 && <div className="mt-1 rounded-xl border border-border/70 bg-card p-2 text-[12px]" data-readers>
                    {readers.map(r => <p key={r.user_id} className="flex items-center gap-2 py-0.5"><Avatar id={r.user_id} name={r.name} url={r.avatar_url} size={6}/>{r.name}<span className="ml-auto pl-3 text-muted-foreground">{r.last_read_at ? time(r.last_read_at) : ""}</span></p>)}
                  </div>}
                </div>
              </div>
            </Fragment>;
          })}
        </div>

        <div className="relative border-t border-border/70 p-3">
          {matches.length > 0 && mentionQuery !== null && <ul role="listbox" aria-label="Mention someone" data-mention-list
            className="absolute inset-x-3 bottom-full mb-2 overflow-hidden rounded-2xl border border-border/70 bg-card p-1 shadow-lg">
            {matches.map((m, i) => <li key={m.user_id} role="option" aria-selected={i === mentionIndex}>
              <button type="button" onMouseDown={e => { e.preventDefault(); pickMention(m); }} className={`flex w-full items-center gap-2 rounded-xl px-2 py-1.5 text-left text-[13px] ${i === mentionIndex ? "bg-secondary" : "hover:bg-secondary/60"}`}>
                <Avatar id={m.user_id} name={m.name} url={m.avatar_url} size={6}/><span className="font-medium">{m.name}</span>{m.label && <span className="text-muted-foreground">{m.label}</span>}
              </button></li>)}
          </ul>}
          {linkMatches.length > 0 && linkQuery !== null && <ul role="listbox" aria-label="Link to a page" data-link-list
            className="absolute inset-x-3 bottom-full mb-2 max-h-64 overflow-y-auto rounded-2xl border border-border/70 bg-card p-1 shadow-lg">
            {linkMatches.map((l, i) => { const Icon = linkIcon(l.target); return <li key={`${l.kind}-${l.label}`} role="option" aria-selected={i === linkIndex}>
              <button type="button" onMouseDown={e => { e.preventDefault(); pickLink(l); }} className={`flex w-full items-center gap-2 rounded-xl px-2 py-1.5 text-left text-[13px] ${i === linkIndex ? "bg-secondary" : "hover:bg-secondary/60"}`}>
                <Icon className="size-4 text-primary"/><span className="truncate font-medium">{l.label}</span>
                <span className="ml-auto shrink-0 text-[11px] text-muted-foreground">{l.kind === "page" ? "Page" : l.kind === "work-order" ? "Work order" : l.kind === "meeting" ? "Meeting" : "Document"}</span>
              </button></li>; })}
          </ul>}
          {iconsOpen && <div data-icon-picker className="absolute inset-x-3 bottom-full mb-2 rounded-2xl border border-border/70 bg-card p-3 shadow-lg">
            {(["Reactions", "Building"] as const).map(g => <div key={g} className="mb-2 last:mb-0">
              <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{g}</p>
              <div className="grid grid-cols-6 gap-1">{CHAT_ICONS.filter(i => i.group === g).map(i =>
                <button key={i.code} type="button" title={i.label} aria-label={`Insert ${i.label}`} onMouseDown={e => { e.preventDefault(); pickIcon(i.code); }}
                  className="grid place-items-center rounded-xl py-1.5 hover:bg-secondary"><LotyIcon code={i.code} size="md"/></button>)}</div>
            </div>)}
          </div>}
          {editing && <div className="mb-2 flex items-center justify-between rounded-xl bg-secondary px-3 py-1.5 text-[12px]"><span>Editing your message</span>
            <button type="button" className="text-muted-foreground hover:text-foreground" onClick={() => { setEditing(null); setDraft(""); inputRef.current?.clear(); }}>Cancel</button></div>}
          <div className="flex items-end gap-2">
            <ChatComposer ref={inputRef} onChange={onDraft} onKeyDown={onKey}/>
            <Button size="icon" variant="ghost" className="size-10 shrink-0 rounded-full" aria-label="Loty icons" aria-expanded={iconsOpen} onClick={() => { setIconsOpen(o => !o); setLinkQuery(null); setMentionQuery(null); }}><SmilePlus className="size-4"/></Button>
            <Button size="icon" variant="ghost" className="size-10 shrink-0 rounded-full max-sm:hidden" aria-label="Link to a page" onClick={() => { setIconsOpen(false); inputRef.current?.insertText("#"); }}><Link2 className="size-4"/></Button>
            <Button size="icon" variant="ghost" className="size-10 shrink-0 rounded-full max-sm:hidden" aria-label="Mention someone" onClick={() => { setIconsOpen(false); inputRef.current?.insertText("@"); }}><AtSign className="size-4"/></Button>
            <Button size="icon" className="size-10 shrink-0 rounded-full" aria-label={editing ? "Save edit" : "Send"} disabled={!draft.trim()} onClick={() => void send()}><Send className="size-4"/></Button>
          </div>
          <p className="mt-1.5 px-1 text-[10px] text-muted-foreground">Enter to send · Shift + Enter for a new line · @ to mention · # to link a page</p>
        </div>
      </>}
    </div>, document.body)}
  </>;
}

/** Someone's profile: photo, name, lot and role. Contact details only for the committee, manager and Loty. */
function PersonCard({ person, schemeId, isMe, onMention, onEditMe }: { person: ChatMember; schemeId?: string | undefined; isMe: boolean; onMention: () => void; onEditMe: () => void }) {
  const contacts = useBuildingContacts(schemeId);
  const contact = person.role !== "Owner" ? (contacts.data ?? []).find(c => c.name === person.name) : undefined;
  return <div className="flex-1 overflow-y-auto px-6 py-8 text-center" data-person-card>
    <div className="mx-auto w-fit"><Avatar id={person.user_id} name={person.name} url={person.avatar_url} size={16}/></div>
    <p className="mt-3 text-lg font-medium">{person.name}</p>
    {person.label && <p className="text-[13px] text-muted-foreground">{person.label}</p>}
    <p className="mt-1 text-[12px] text-muted-foreground">{person.role === "Loty" || person.role === "Manager" ? "Building manager" : person.role === "Committee" ? "Committee member" : "Owner"}</p>
    {contact && (contact.email || contact.phone) && <div className="mx-auto mt-5 max-w-xs space-y-1.5 text-[13px]">
      {contact.email && <a href={`mailto:${contact.email}`} className="flex items-center justify-center gap-1.5 text-primary hover:underline"><Mail className="size-3.5"/>{contact.email}</a>}
      {contact.phone && <a href={`tel:${contact.phone.replace(/\s/g, "")}`} className="flex items-center justify-center gap-1.5 text-primary hover:underline"><Phone className="size-3.5"/>{contact.phone}</a>}
    </div>}
    <div className="mt-6 flex justify-center gap-2">
      {isMe ? <Button className="rounded-full" onClick={onEditMe}><Pencil className="size-3.5"/>Edit your profile</Button>
        : <Button className="rounded-full" onClick={onMention}><AtSign className="size-3.5"/>Mention {person.name.split(" ")[0]}</Button>}
    </div>
    {!isMe && person.role === "Owner" && <p className="mx-auto mt-4 max-w-xs text-[11px] text-muted-foreground">Owners' contact details are kept private. Message them here.</p>}
  </div>;
}

/** Your own name and photo, used in every building you belong to. */
function MyProfile({ userId, current, fallbackName, onSaved }: { userId?: string | undefined; current?: ChatMember | undefined; fallbackName: string; onSaved: () => void }) {
  const [name, setName] = useState(current?.name ?? fallbackName);
  const [photo, setPhoto] = useState<string | null>(current?.avatar_url ?? null);
  const [busy, setBusy] = useState(false);
  const upload = async (file: File) => {
    if (!userId) return;
    if (!file.type.startsWith("image/")) { toast("Choose an image"); return; }
    if (file.size > 2 * 1024 * 1024) { toast("That photo is over 2 MB", { description: "Choose a smaller one." }); return; }
    setBusy(true);
    const path = `${userId}/${Date.now()}.${file.name.split(".").pop()?.toLowerCase() || "jpg"}`;
    const { error } = await supabase.storage.from("avatars").upload(path, file, { upsert: true, contentType: file.type });
    setBusy(false);
    if (error) { toast("Could not upload the photo", { description: error.message }); return; }
    setPhoto(supabase.storage.from("avatars").getPublicUrl(path).data.publicUrl);
  };
  const save = async () => {
    if (!userId) return;
    const { error } = await supabase.from("profiles").update({ full_name: name.trim() || null, avatar_url: photo }).eq("id", userId);
    if (error) { toast("Could not save your profile", { description: error.message }); return; }
    toast("Profile saved", { description: "Everyone in your buildings sees this name and photo." }); onSaved();
  };
  return <div className="flex-1 overflow-y-auto px-6 py-8" data-my-profile-form>
    <div className="mx-auto w-fit text-center">
      <div className="relative w-fit"><Avatar id={userId ?? "me"} name={name || fallbackName} url={photo} size={16}/>
        <label className="absolute -bottom-1 -right-1 grid size-7 cursor-pointer place-items-center rounded-full border border-border bg-card shadow-sm hover:bg-secondary" aria-label="Change photo">
          <Camera className="size-3.5"/><input type="file" accept="image/*" className="sr-only" onChange={e => { const f = e.target.files?.[0]; if (f) void upload(f); }}/></label></div>
      {photo && <button type="button" className="mt-2 text-[12px] text-muted-foreground hover:underline" onClick={() => setPhoto(null)}>Remove photo</button>}
    </div>
    <label className="mt-6 block text-[12px] font-medium text-muted-foreground" htmlFor="chat_full_name">Your name</label>
    <Input id="chat_full_name" value={name} onChange={e => setName(e.target.value)} maxLength={60} className="mt-1"/>
    <p className="mt-1 text-[11px] text-muted-foreground">Shown on your messages, in mentions and to everyone in your buildings.</p>
    <Button className="mt-5 w-full rounded-full" disabled={busy} onClick={() => void save()}>{busy ? "Uploading…" : "Save profile"}</Button>
  </div>;
}

/** Quick reactions with Loty icons. */
function ReactPicker({ onPick }: { onPick: (code: string) => void }) {
  const [open, setOpen] = useState(false);
  return <Popover open={open} onOpenChange={setOpen}>
    <PopoverTrigger asChild><button type="button" aria-label="React" className="grid size-6 place-items-center rounded-full text-muted-foreground opacity-0 transition-opacity hover:bg-secondary focus:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100"><SmilePlus className="size-4"/></button></PopoverTrigger>
    <PopoverContent align="center" className="flex w-auto gap-1 rounded-full p-1.5" data-react-picker>
      {REACTIONS.map(code => <button key={code} type="button" aria-label={`React with ${ICON_BY_CODE.get(code)?.label}`} onClick={() => { setOpen(false); onPick(code); }}
        className="rounded-full p-0.5 transition-transform hover:scale-110"><LotyIcon code={code} size="md"/></button>)}
    </PopoverContent>
  </Popover>;
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
