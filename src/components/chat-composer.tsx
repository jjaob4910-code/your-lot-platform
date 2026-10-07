import { forwardRef, useEffect, useImperativeHandle, useRef, useState, type KeyboardEvent } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Building2, CalendarDays, Coins, FileText, Gavel, LayoutDashboard, Link2, ShieldCheck, Wrench } from "lucide-react";
import { ICON_BY_CODE, LotyIcon } from "@/lib/chat-icons";

// The chat's message box. Loty icons, page links and @mentions show as chips while you type,
// but the message is still saved as plain text with codes (:heart:, #[Label](Target), @Name),
// so everything that reads messages keeps working.

export type ComposerHandle = {
  focus: () => void;
  clear: () => void;
  /** Fills the box from a saved message (for editing). */
  setText: (text: string) => void;
  /** Inserts plain text at the cursor (e.g. "@" or "#" to start a picker). */
  insertText: (text: string) => void;
  /** Inserts a chip for a token at the cursor, first removing the "@que" or "#que" being typed. */
  insertToken: (token: string, replaceTyped?: RegExp) => void;
};

const LINK_ICON: Record<string, typeof Wrench> = {
  Dashboard: LayoutDashboard, Lots: Building2, Insurance: ShieldCheck, "Work orders": Wrench, Finance: Coins, AGM: Gavel, Calendar: CalendarDays, Documents: FileText,
};
const TOKEN = /#\[([^\]\n]{1,80})\]\(([^)\n]{1,40})\)|:([a-z-]{2,20}):/g;

/** The chip's HTML for a token, or null if it isn't one. */
function chipHtml(token: string): string | null {
  const icon = /^:([a-z-]{2,20}):$/.exec(token);
  if (icon && ICON_BY_CODE.has(icon[1]!)) return renderToStaticMarkup(<LotyIcon code={icon[1]!}/>);
  const link = /^#\[([^\]\n]{1,80})\]\(([^)\n]{1,40})\)$/.exec(token);
  if (link) {
    const Icon = LINK_ICON[link[2]!.split("/")[0]!] ?? Link2;
    return renderToStaticMarkup(<span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 align-middle text-[13px] font-medium text-primary">
      <Icon className="size-3.5"/>{link[1]}</span>);
  }
  if (token.startsWith("@")) return renderToStaticMarkup(<span className="rounded px-0.5 font-medium text-primary">{token}</span>);
  return null;
}
function makeChip(token: string): HTMLElement | null {
  const html = chipHtml(token);
  if (!html) return null;
  const el = document.createElement("span");
  el.contentEditable = "false"; el.dataset["token"] = token; el.className = "mx-px inline-block align-middle";
  el.innerHTML = html;
  return el;
}

/** Back to plain text: chips become their codes, line breaks become "\n". */
function serialize(node: Node): string {
  let out = "";
  node.childNodes.forEach(n => {
    if (n.nodeType === Node.TEXT_NODE) out += (n.nodeValue ?? "").replace(/\u00a0/g, " ").replace(/\u200b/g, "");
    else if (n instanceof HTMLElement) {
      if (n.dataset["token"]) out += n.dataset["token"];
      else if (n.tagName === "BR") out += "\n";
      else { const inner = serialize(n); out += (n.tagName === "DIV" || n.tagName === "P") && out && !out.endsWith("\n") ? `\n${inner}` : inner; }
    }
  });
  return out;
}

export const ChatComposer = forwardRef<ComposerHandle, {
  onChange: (text: string, beforeCaret: string) => void;
  onKeyDown: (e: KeyboardEvent<HTMLDivElement>) => void;
  placeholder?: string;
}>(function ChatComposer({ onChange, onKeyDown, placeholder = "Message" }, ref) {
  const box = useRef<HTMLDivElement>(null);
  const lastRange = useRef<Range | null>(null);
  const [empty, setEmpty] = useState(true);

  // Remember where the cursor was, so pickers opened by a button still insert in the right place.
  useEffect(() => {
    const save = () => {
      const sel = window.getSelection();
      if (sel && sel.rangeCount && box.current?.contains(sel.anchorNode)) lastRange.current = sel.getRangeAt(0).cloneRange();
    };
    document.addEventListener("selectionchange", save);
    return () => document.removeEventListener("selectionchange", save);
  }, []);

  const emit = () => {
    const el = box.current; if (!el) return;
    const text = serialize(el);
    let before = text;
    const sel = window.getSelection();
    if (sel && sel.rangeCount && el.contains(sel.anchorNode)) {
      const r = document.createRange(); r.selectNodeContents(el); r.setEnd(sel.anchorNode!, sel.anchorOffset);
      const tmp = document.createElement("div"); tmp.appendChild(r.cloneContents()); before = serialize(tmp);
    }
    setEmpty(text.length === 0);
    onChange(text, before);
  };

  // A range at the cursor (or the end of the box).
  const caretRange = () => {
    const el = box.current!;
    const sel = window.getSelection();
    if (sel && sel.rangeCount && el.contains(sel.anchorNode)) return sel.getRangeAt(0);
    if (lastRange.current && el.contains(lastRange.current.startContainer)) return lastRange.current;
    const r = document.createRange(); r.selectNodeContents(el); r.collapse(false); return r;
  };
  const placeCaretAfter = (node: Node) => {
    const r = document.createRange(); r.setStartAfter(node); r.collapse(true);
    const sel = window.getSelection(); sel?.removeAllRanges(); sel?.addRange(r); lastRange.current = r.cloneRange();
  };
  const insertNodes = (nodes: Node[]) => {
    const el = box.current; if (!el) return;
    el.focus();
    const r = caretRange(); r.deleteContents();
    nodes.forEach(n => { r.insertNode(n); r.setStartAfter(n); r.collapse(true); });
    placeCaretAfter(nodes[nodes.length - 1]!);
    emit();
  };

  useImperativeHandle(ref, () => ({
    focus: () => { const el = box.current; if (!el) return; el.focus(); const r = document.createRange(); r.selectNodeContents(el); r.collapse(false); const s = window.getSelection(); s?.removeAllRanges(); s?.addRange(r); },
    clear: () => { if (box.current) box.current.innerHTML = ""; setEmpty(true); },
    setText: (text: string) => {
      const el = box.current; if (!el) return;
      el.innerHTML = "";
      let last = 0;
      for (const hit of text.matchAll(TOKEN)) {
        el.append(document.createTextNode(text.slice(last, hit.index)));
        el.append(makeChip(hit[0]) ?? document.createTextNode(hit[0]));
        last = hit.index! + hit[0].length;
      }
      el.append(document.createTextNode(text.slice(last)));
      setEmpty(!text);
      setTimeout(() => { el.focus(); const r = document.createRange(); r.selectNodeContents(el); r.collapse(false); const s = window.getSelection(); s?.removeAllRanges(); s?.addRange(r); }, 0);
    },
    insertText: (text: string) => {
      const el = box.current; if (!el) return;
      const before = serialize(el);
      insertNodes([document.createTextNode(`${before && !/\s$/.test(before) && !text.startsWith(" ") ? " " : ""}${text}`)]);
    },
    insertToken: (token: string, replaceTyped?: RegExp) => {
      const el = box.current; if (!el) return;
      el.focus();
      // Remove the "@sa" / "#fix" just typed, which sits right before the cursor.
      if (replaceTyped) {
        const r = caretRange();
        const node = r.startContainer;
        if (node.nodeType === Node.TEXT_NODE) {
          const hit = replaceTyped.exec((node.nodeValue ?? "").slice(0, r.startOffset));
          if (hit) { const del = document.createRange(); del.setStart(node, r.startOffset - hit[0].length); del.setEnd(node, r.startOffset); del.deleteContents(); const s = window.getSelection(); s?.removeAllRanges(); s?.addRange(del); lastRange.current = del.cloneRange(); }
        }
      }
      const chip = makeChip(token);
      insertNodes(chip ? [chip, document.createTextNode("\u00a0")] : [document.createTextNode(`${token} `)]);
    },
  }));

  return <div ref={box} role="textbox" aria-multiline="true" aria-label="Message" contentEditable suppressContentEditableWarning data-composer
    data-placeholder={placeholder} data-empty={empty ? "true" : undefined}
    onInput={emit} onKeyUp={e => { if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) emit(); }} onClick={emit}
    onKeyDown={e => {
      onKeyDown(e);
      if (e.defaultPrevented) return;
      if (e.key === "Enter" && e.shiftKey) { e.preventDefault(); insertNodes([document.createElement("br"), document.createTextNode("\u200b")]); }
    }}
    onPaste={e => { e.preventDefault(); const t = e.clipboardData.getData("text/plain"); if (t) insertNodes([document.createTextNode(t)]); }}
    className="max-h-32 min-h-[40px] flex-1 overflow-y-auto whitespace-pre-wrap break-words rounded-2xl border border-border/70 bg-background px-3.5 py-2.5 text-[14px] leading-5 outline-none focus:border-primary/50 data-[empty=true]:before:pointer-events-none data-[empty=true]:before:text-muted-foreground data-[empty=true]:before:content-[attr(data-placeholder)]"/>;
});
