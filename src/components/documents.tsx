import { useMemo, useState, type DragEvent, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ChevronRight, Download, FileText, Folder, FolderOpen, FolderPlus, Gavel, Home, Image as ImageIcon,
  MoreHorizontal, Pencil, Receipt, Scale, ShieldCheck, Trash2, Upload, Users, Wrench,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export type DocFolder = {
  id: string; parent_id: string | null; name: string; icon: string; color: string;
  created_at: string; updated_at: string;
};
export type DocFile = {
  id: string; name: string; category: string | null; folder_id: string | null;
  storage_path: string | null; file_size: number | null; mime_type: string | null;
  shared_with_owners: boolean; uploaded_at: string; updated_at: string;
};

const icons = {
  Folder, Gavel, Receipt, ShieldCheck, Wrench, Users, Scale, ImageIcon, FileText, Home,
} as const;
type IconKey = keyof typeof icons;
const iconKeys = Object.keys(icons) as IconKey[];
const iconLabels: Record<IconKey, string> = {
  Folder: "Folder", Gavel: "Meetings", Receipt: "Invoices", ShieldCheck: "Insurance", Wrench: "Repairs",
  Users: "Owners", Scale: "Legal", ImageIcon: "Photos", FileText: "Notices", Home: "Building",
};

const colors: Record<string, string> = {
  default: "bg-secondary text-muted-foreground",
  blue: "bg-primary/10 text-primary",
  green: "bg-emerald-500/10 text-emerald-700",
  amber: "bg-amber-500/15 text-amber-700",
  rose: "bg-destructive/10 text-destructive",
  slate: "bg-foreground/10 text-foreground",
};
const colorKeys = Object.keys(colors);

const niceDate = (value: string) => new Date(value).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
const niceSize = (bytes: number | null) => {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
};

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <section className={`soft-shadow rounded-3xl border border-border/70 bg-card ${className}`}>{children}</section>;
}
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

function FolderIcon({ icon, color, size = "md" }: { icon: string; color: string; size?: "sm" | "md" }) {
  const Glyph = icons[(icon as IconKey)] ?? Folder;
  const box = size === "sm" ? "h-8 w-8 rounded-xl" : "h-11 w-11 rounded-2xl";
  return <span className={`inline-flex shrink-0 items-center justify-center ${box} ${colors[color] ?? colors["default"]}`}>
    <Glyph className={size === "sm" ? "h-4 w-4" : "h-5 w-5"}/>
  </span>;
}

export function DocumentsSection({ documents, isCommittee, schemeId, onChanged }: {
  documents: DocFile[]; isCommittee: boolean; schemeId?: string | undefined; onChanged: () => void;
}) {
  const queryClient = useQueryClient();
  const [path, setPath] = useState<DocFolder[]>([]);
  const [folderDialog, setFolderDialog] = useState<{ open: boolean; editing: DocFolder | null }>({ open: false, editing: null });
  const [uploading, setUploading] = useState(false);
  const [query, setQuery] = useState("");
  const [dragDoc, setDragDoc] = useState<DocFile | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);

  const current = path.length ? path[path.length - 1]! : null;
  const currentId = current?.id ?? null;

  const folders = useQuery({
    queryKey: ["document-folders"],
    queryFn: async () => {
      const { data, error } = await supabase.from("document_folders").select("*").order("name");
      if (error) throw error;
      return (data ?? []) as unknown as DocFolder[];
    },
  });
  const allFolders = folders.data ?? [];
  const refreshFolders = () => queryClient.invalidateQueries({ queryKey: ["document-folders"] });

  const searching = query.trim().length > 0;
  const visibleFolders = useMemo(() => searching
    ? allFolders.filter(f => f.name.toLowerCase().includes(query.toLowerCase()))
    : allFolders.filter(f => (f.parent_id ?? null) === currentId), [allFolders, currentId, query, searching]);
  const visibleFiles = useMemo(() => searching
    ? documents.filter(d => d.name.toLowerCase().includes(query.toLowerCase()))
    : documents.filter(d => (d.folder_id ?? null) === currentId), [documents, currentId, query, searching]);

  const countIn = (folderId: string) => {
    const ids = new Set<string>([folderId]);
    let added = true;
    while (added) {
      added = false;
      allFolders.forEach(f => { if (f.parent_id && ids.has(f.parent_id) && !ids.has(f.id)) { ids.add(f.id); added = true; } });
    }
    return documents.filter(d => d.folder_id && ids.has(d.folder_id)).length;
  };

  const saveFolder = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!schemeId) return;
    const form = new FormData(e.currentTarget);
    const payload = {
      name: String(form.get("name") ?? "").trim(),
      icon: String(form.get("icon") ?? "Folder"),
      color: String(form.get("color") ?? "default"),
    };
    if (!payload.name) return;
    const editing = folderDialog.editing;
    const { error } = editing
      ? await supabase.from("document_folders").update(payload).eq("id", editing.id)
      : await supabase.from("document_folders").insert({ ...payload, scheme_id: schemeId, parent_id: currentId });
    if (error) { toast("Could not save the folder", { description: error.message }); return; }
    if (editing) setPath(p => p.map(f => (f.id === editing.id ? { ...f, ...payload } : f)));
    setFolderDialog({ open: false, editing: null });
    refreshFolders();
    toast(editing ? "Folder updated" : "Folder created");
  };

  const deleteFolder = async (folder: DocFolder) => {
    const { error } = await supabase.from("document_folders").delete().eq("id", folder.id);
    if (error) { toast("Could not remove the folder", { description: error.message }); return; }
    refreshFolders(); onChanged(); toast("Folder removed");
  };

  const upload = async (files: FileList | File[] | null, folderId: string | null = currentId) => {
    if (!files?.length || !schemeId) return;
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        const path = `${schemeId}/${crypto.randomUUID()}-${file.name.replace(/[^\w.\-]/g, "_")}`;
        const { error: upErr } = await supabase.storage.from("documents").upload(path, file);
        if (upErr) throw upErr;
        const { error } = await supabase.from("documents").insert({
          scheme_id: schemeId, name: file.name,
          category: allFolders.find(f => f.id === folderId)?.name ?? "Other",
          folder_id: folderId, storage_path: path, file_size: file.size, mime_type: file.type,
        });
        if (error) throw error;
      }
      onChanged();
      toast(files.length > 1 ? `${files.length} files added` : "File added");
    } catch (err) {
      toast("Upload failed", { description: (err as Error).message });
    } finally { setUploading(false); }
  };

  const download = async (doc: DocFile) => {
    if (!doc.storage_path) { toast("No file attached to this record"); return; }
    const { data, error } = await supabase.storage.from("documents").createSignedUrl(doc.storage_path, 60, { download: doc.name });
    if (error || !data) { toast("Could not open the file", { description: error?.message }); return; }
    window.open(data.signedUrl, "_blank");
  };

  const share = async (doc: DocFile) => {
    const next = !doc.shared_with_owners;
    const { error } = await supabase.from("documents").update({ shared_with_owners: next }).eq("id", doc.id);
    if (error) { toast("Could not change sharing", { description: error.message }); return; }
    onChanged();
    toast(next ? "Shared with every owner" : "Sharing turned off");
  };

  const rename = async (doc: DocFile, name: string) => {
    const { error } = await supabase.from("documents").update({ name }).eq("id", doc.id);
    if (error) { toast("Could not rename", { description: error.message }); return; }
    onChanged(); toast("Renamed");
  };

  const removeDoc = async (doc: DocFile) => {
    if (doc.storage_path) await supabase.storage.from("documents").remove([doc.storage_path]);
    const { error } = await supabase.from("documents").delete().eq("id", doc.id);
    if (error) { toast("Could not remove it", { description: error.message }); return; }
    onChanged(); toast("Removed");
  };

  const moveDoc = async (doc: DocFile, folderId: string | null) => {
    const { error } = await supabase.from("documents").update({ folder_id: folderId }).eq("id", doc.id);
    if (error) { toast("Could not move it", { description: error.message }); return; }
    onChanged(); toast("Moved");
  };

  const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer.types).includes("Files");
  const canDrop = (e: DragEvent) => isCommittee && (hasFiles(e) || dragDoc !== null);
  const dragOver = (key: string) => (e: DragEvent) => {
    if (!canDrop(e)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = hasFiles(e) ? "copy" : "move";
    setDropTarget(key);
  };
  const dropOn = (key: string, folderId: string | null) => (e: DragEvent) => {
    if (!canDrop(e)) return;
    e.preventDefault();
    setDropTarget(null);
    if (hasFiles(e)) { void upload(e.dataTransfer.files, folderId); return; }
    const doc = dragDoc;
    setDragDoc(null);
    if (doc && (doc.folder_id ?? null) !== folderId) void moveDoc(doc, folderId);
  };
  const dropRing = (key: string) => (dropTarget === key ? "ring-2 ring-primary ring-offset-2 ring-offset-background" : "");

  return <div>
    <PageHead eyebrow="Your property" title="Documents" blurb="Minutes, certificates, invoices and plans, filed in folders you name yourself, ready to share with owners or download any time."
      action={isCommittee ? <div className="flex flex-wrap gap-2">
        <Button variant="outline" className="rounded-full" onClick={() => setFolderDialog({ open: true, editing: null })}><FolderPlus/> New folder</Button>
        <Button asChild className="rounded-full">
          <label>
            <Upload/> {uploading ? "Uploading" : "Upload"}
            <input type="file" multiple className="sr-only" onChange={e => { void upload(e.target.files); e.target.value = ""; }}/>
          </label>
        </Button>
      </div> : undefined}/>

    <div className="mt-10 flex flex-wrap items-center gap-3">
      <div className="flex flex-wrap items-center gap-1 text-[13px]">
        <button
          className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 font-medium hover:bg-secondary ${dropRing("root")}`}
          onClick={() => setPath([])}
          onDragOver={dragOver("root")}
          onDragLeave={() => setDropTarget(null)}
          onDrop={dropOn("root", null)}
        >
          <Home className="h-3.5 w-3.5"/> All documents
        </button>
        {path.map((folder, index) => <span key={folder.id} className="flex items-center gap-1">
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground"/>
          <button className="rounded-full px-3 py-1.5 font-medium hover:bg-secondary" onClick={() => setPath(p => p.slice(0, index + 1))}>{folder.name}</button>
        </span>)}
      </div>
      <Input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search folders and files" className="ml-auto h-9 w-full rounded-full sm:w-64"/>
    </div>

    {visibleFolders.length > 0 && <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {visibleFolders.map(folder => <div
        key={folder.id}
        onDragOver={dragOver(folder.id)}
        onDragLeave={() => setDropTarget(prev => (prev === folder.id ? null : prev))}
        onDrop={dropOn(folder.id, folder.id)}
        className={`rounded-3xl transition ${dropTarget === folder.id ? "ring-2 ring-primary ring-offset-2 ring-offset-background" : ""}`}
      ><Card className="group p-5">
        <div className="flex items-start gap-4">
          <button className="flex flex-1 items-start gap-4 text-left" onClick={() => { setQuery(""); setPath(p => (searching ? [folder] : [...p, folder])); }}>
            <FolderIcon icon={folder.icon} color={folder.color}/>
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium">{folder.name}</span>
              <span className="mt-1 block text-[12px] text-muted-foreground">{countIn(folder.id)} files · created {niceDate(folder.created_at)}</span>
              <span className="mt-0.5 block text-[12px] text-muted-foreground">Edited {niceDate(folder.updated_at)}</span>
            </span>
          </button>
          {isCommittee && <DropdownMenu>
            <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8 rounded-full"><MoreHorizontal className="h-4 w-4"/></Button></DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => setFolderDialog({ open: true, editing: folder })}><Pencil/> Rename and restyle</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => { void deleteFolder(folder); }} className="text-destructive"><Trash2/> Delete folder</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>}
        </div>
      </Card>)}
    </div>}

    <Card className="mt-6 overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-border/70 px-7 py-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          {searching ? "Matching files" : current ? current.name : "Files at the top level"}
        </p>
        <p className="text-[12px] text-muted-foreground">{visibleFiles.length} {visibleFiles.length === 1 ? "file" : "files"}</p>
      </div>
      <div className="divide-y divide-border/70">
        {visibleFiles.map(doc => <div key={doc.id} className="flex flex-wrap items-center gap-4 px-7 py-4">
          <FolderIcon icon="FileText" color="slate" size="sm"/>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{doc.name}</p>
            <p className="mt-1 text-[12px] text-muted-foreground">
              Added {niceDate(doc.uploaded_at)} · Edited {niceDate(doc.updated_at)}{doc.file_size ? ` · ${niceSize(doc.file_size)}` : ""}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {doc.shared_with_owners && <span className="rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-medium text-primary">Shared with owners</span>}
            <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full" onClick={() => { void download(doc); }} aria-label={`Download ${doc.name}`}><Download className="h-4 w-4"/></Button>
            {isCommittee && <DropdownMenu>
              <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8 rounded-full"><MoreHorizontal className="h-4 w-4"/></Button></DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuItem onSelect={() => { void share(doc); }}>
                  <Users/> {doc.shared_with_owners ? "Stop sharing with owners" : "Share with every owner"}
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => {
                  const name = window.prompt("New name", doc.name);
                  if (name && name.trim()) void rename(doc, name.trim());
                }}><Pencil/> Rename</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => { void moveDoc(doc, null); }} disabled={!doc.folder_id}><FolderOpen/> Move to top level</DropdownMenuItem>
                {allFolders.filter(f => f.id !== doc.folder_id).slice(0, 6).map(f =>
                  <DropdownMenuItem key={f.id} onSelect={() => { void moveDoc(doc, f.id); }}><Folder/> Move to {f.name}</DropdownMenuItem>)}
                <DropdownMenuItem onSelect={() => { void removeDoc(doc); }} className="text-destructive"><Trash2/> Delete</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>}
          </div>
        </div>)}
        {visibleFiles.length === 0 && <p className="px-7 py-12 text-center text-sm text-muted-foreground">
          {searching ? "Nothing matches that search." : "Nothing filed here yet. Upload a file or make a folder to get started."}
        </p>}
      </div>
    </Card>

    {folderDialog.open && <FolderDialog key={folderDialog.editing?.id ?? "new"} state={folderDialog} onClose={() => setFolderDialog({ open: false, editing: null })} onSubmit={saveFolder} parentName={current?.name ?? null}/>}
  </div>;
}

function FolderDialog({ state, onClose, onSubmit, parentName }: {
  state: { open: boolean; editing: DocFolder | null }; onClose: () => void;
  onSubmit: (e: FormEvent<HTMLFormElement>) => void; parentName: string | null;
}) {
  const editing = state.editing;
  const [icon, setIcon] = useState<string>(editing?.icon ?? "Folder");
  const [color, setColor] = useState<string>(editing?.color ?? "default");
  const key = `${editing?.id ?? "new"}-${state.open}`;

  return <Dialog open={state.open} onOpenChange={open => { if (!open) onClose(); }}>
    <DialogContent>
      <DialogHeader>
        <DialogTitle className="font-display tracking-[-0.02em]">{editing ? "Folder settings" : "New folder"}</DialogTitle>
        <DialogDescription>{editing ? "Change the name, icon or colour." : parentName ? `Inside ${parentName}.` : "At the top level."}</DialogDescription>
      </DialogHeader>
      <form key={key} onSubmit={onSubmit} className="space-y-5">
        <div className="space-y-2">
          <Label htmlFor="folder-name">Folder name</Label>
          <Input id="folder-name" name="name" defaultValue={editing?.name ?? ""} placeholder="Annual general meetings" required autoFocus/>
        </div>
        <input type="hidden" name="icon" value={icon}/>
        <input type="hidden" name="color" value={color}/>
        <div className="space-y-2">
          <Label>Icon</Label>
          <div className="flex flex-wrap gap-2">
            {iconKeys.map(k => {
              const Glyph = icons[k];
              return <button key={k} type="button" title={iconLabels[k]} onClick={() => setIcon(k)}
                className={`inline-flex h-10 w-10 items-center justify-center rounded-2xl border ${icon === k ? "border-primary bg-primary/10 text-primary" : "border-border/70 text-muted-foreground hover:bg-secondary"}`}>
                <Glyph className="h-4 w-4"/>
              </button>;
            })}
          </div>
        </div>
        <div className="space-y-2">
          <Label>Colour</Label>
          <div className="flex flex-wrap gap-2">
            {colorKeys.map(k => <button key={k} type="button" onClick={() => setColor(k)}
              className={`h-9 w-9 rounded-full border ${colors[k]} ${color === k ? "ring-2 ring-primary ring-offset-2 ring-offset-card" : "border-border/70"}`} aria-label={k}/>)}
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="ghost" className="rounded-full" onClick={onClose}>Cancel</Button>
          <Button type="submit" className="rounded-full">{editing ? "Save changes" : "Create folder"}</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>;
}
