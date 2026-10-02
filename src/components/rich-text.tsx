import { useEffect } from "react";
import { EditorContent, useEditor, useEditorState, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import Highlight from "@tiptap/extension-highlight";
import Placeholder from "@tiptap/extension-placeholder";
import { Bold, Heading2, Highlighter, Italic, Link2, List, ListChecks, ListOrdered, Redo2, Underline, Undo2 } from "lucide-react";

// Older notes were plain text; show them as paragraphs instead of one run-on line.
export function toRichHtml(value: string | null | undefined) {
  const v = value ?? "";
  if (v.trim() === "" || v.trimStart().startsWith("<")) return v;
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return v.split(/\n{2,}/).map(p => `<p>${esc(p).replace(/\n/g, "<br>")}</p>`).join("");
}
export const isRichEmpty = (html: string | null | undefined) => !html || html.replace(/<[^>]*>/g, "").trim() === "" && !/data-checked/.test(html);

const extensions = (placeholder?: string) => [
  StarterKit.configure({ heading: { levels: [3] }, link: { openOnClick: false, autolink: true } }),
  TaskList,
  TaskItem.configure({ nested: true }),
  Highlight,
  Placeholder.configure({ placeholder: placeholder ?? "Write something…" }),
];

function ToolButton({ on, active, label, children }: { on: () => void; active?: boolean; label: string; children: React.ReactNode }) {
  return <button type="button" aria-label={label} title={label} aria-pressed={!!active} onMouseDown={e => e.preventDefault()} onClick={on}
    className={`grid size-8 shrink-0 place-items-center rounded-lg text-muted-foreground transition hover:bg-secondary hover:text-foreground ${active ? "bg-secondary text-foreground" : ""}`}>{children}</button>;
}

function Toolbar({ editor }: { editor: Editor }) {
  const s = useEditorState({ editor, selector: ({ editor: e }) => ({
    bold: e.isActive("bold"), italic: e.isActive("italic"), underline: e.isActive("underline"), highlight: e.isActive("highlight"),
    heading: e.isActive("heading"), bullet: e.isActive("bulletList"), ordered: e.isActive("orderedList"), task: e.isActive("taskList"), link: e.isActive("link"),
  }) });
  const c = () => editor.chain().focus();
  const setLink = () => {
    if (s.link) { c().unsetLink().run(); return; }
    const url = window.prompt("Link address");
    if (url) c().extendMarkRange("link").setLink({ href: /^https?:\/\//.test(url) ? url : `https://${url}` }).run();
  };
  // Scrolls sideways within itself on narrow screens rather than widening the page.
  return <div className="flex max-w-full items-center gap-0.5 overflow-x-auto border-b border-border/60 px-1.5 py-1" role="toolbar" aria-label="Formatting">
    <ToolButton label="Bold" active={s.bold} on={() => c().toggleBold().run()}><Bold className="size-4" /></ToolButton>
    <ToolButton label="Italic" active={s.italic} on={() => c().toggleItalic().run()}><Italic className="size-4" /></ToolButton>
    <ToolButton label="Underline" active={s.underline} on={() => c().toggleUnderline().run()}><Underline className="size-4" /></ToolButton>
    <ToolButton label="Highlight" active={s.highlight} on={() => c().toggleHighlight().run()}><Highlighter className="size-4" /></ToolButton>
    <span className="mx-1 h-5 w-px shrink-0 bg-border" />
    <ToolButton label="Heading" active={s.heading} on={() => c().toggleHeading({ level: 3 }).run()}><Heading2 className="size-4" /></ToolButton>
    <ToolButton label="Bullet list" active={s.bullet} on={() => c().toggleBulletList().run()}><List className="size-4" /></ToolButton>
    <ToolButton label="Numbered list" active={s.ordered} on={() => c().toggleOrderedList().run()}><ListOrdered className="size-4" /></ToolButton>
    <ToolButton label="Checklist" active={s.task} on={() => c().toggleTaskList().run()}><ListChecks className="size-4" /></ToolButton>
    <ToolButton label="Link" active={s.link} on={setLink}><Link2 className="size-4" /></ToolButton>
    <span className="mx-1 h-5 w-px shrink-0 bg-border" />
    <ToolButton label="Undo" on={() => c().undo().run()}><Undo2 className="size-4" /></ToolButton>
    <ToolButton label="Redo" on={() => c().redo().run()}><Redo2 className="size-4" /></ToolButton>
  </div>;
}

/** A document-style editor that grows with its content. `onChange` receives HTML. */
export function RichTextEditor({ value, onChange, placeholder, ariaLabel, minHeight = 64 }: {
  value: string; onChange: (html: string) => void; placeholder?: string; ariaLabel?: string; minHeight?: number;
}) {
  const editor = useEditor({
    extensions: extensions(placeholder),
    content: toRichHtml(value),
    immediatelyRender: false,
    editorProps: { attributes: { class: "rt-content outline-none", ...(ariaLabel ? { "aria-label": ariaLabel } : {}), style: `min-height:${minHeight}px` } },
    onUpdate: ({ editor: e }) => onChange(e.isEmpty ? "" : e.getHTML()),
  });
  // Follow outside changes (e.g. another item's content loaded) without fighting the cursor.
  useEffect(() => {
    if (editor && !editor.isFocused && toRichHtml(value) !== editor.getHTML() && !(value === "" && editor.isEmpty)) editor.commands.setContent(toRichHtml(value), { emitUpdate: false });
  }, [value, editor]);
  return <div className="rt group/rt min-w-0 rounded-xl border border-transparent transition focus-within:border-border focus-within:bg-background/60 hover:border-border/60">
    <div className="hidden group-focus-within/rt:block">{editor && <Toolbar editor={editor} />}</div>
    <div className="px-3 py-2 text-[14px] leading-6"><EditorContent editor={editor} /></div>
  </div>;
}

/** Read-only render of editor HTML (only the allowed formatting is kept). */
export function RichTextView({ value, className = "" }: { value: string | null | undefined; className?: string }) {
  const editor = useEditor({ extensions: extensions(""), content: toRichHtml(value), editable: false, immediatelyRender: false,
    editorProps: { attributes: { class: "rt-content" } } });
  useEffect(() => { if (editor) editor.commands.setContent(toRichHtml(value), { emitUpdate: false }); }, [value, editor]);
  if (isRichEmpty(value)) return null;
  return <div className={`rt text-[14px] leading-6 ${className}`}><EditorContent editor={editor} /></div>;
}
