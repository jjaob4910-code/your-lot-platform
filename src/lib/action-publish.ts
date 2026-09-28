import { supabase } from "@/integrations/supabase/client";

export type Task = { id: string; task_name: string; detail: string | null; due_date: string; status: string; widget_id: string | null; created_at: string };
export type ActionDraft = { id: string; scheme_id: string; standard_key: string; content: string };
export type ComplianceWidget = {
  id: string; scheme_id: string; label: string; is_standard: boolean; standard_key: string | null;
  default_detail: string | null; enabled: boolean; sort_order: number;
};

export const COMPLIANCE_FOLDER = "Actions";

const daysUntil = (date: string) => Math.ceil((new Date(date + "T00:00:00").getTime() - new Date(new Date().toDateString()).getTime()) / 86400000);

export function urgencyTone(dueDate: string | null | undefined, done: boolean) {
  if (done) return { label: "Done", className: "text-muted-foreground" };
  if (!dueDate) return { label: "Not started", className: "text-muted-foreground" };
  const left = daysUntil(dueDate);
  if (left < 0) return { label: `${Math.abs(left)} days overdue`, className: "font-medium text-destructive" };
  if (left < 14) return { label: `${left} days left`, className: "text-destructive" };
  return { label: `${left} days left`, className: "text-muted-foreground" };
}

export function currentTaskFor(widget: ComplianceWidget, tasks: Task[]) {
  return tasks.filter(t => t.widget_id === widget.id).sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
}

export async function ensureActionsFolder(schemeId: string) {
  const { data } = await supabase.from("document_folders").select("id").eq("scheme_id", schemeId).eq("name", COMPLIANCE_FOLDER).maybeSingle();
  if (data?.id) return data.id as string;
  const { data: made, error } = await supabase.from("document_folders")
    .insert({ scheme_id: schemeId, name: COMPLIANCE_FOLDER, icon: "ShieldCheck", color: "green" }).select("id").single();
  if (error) throw error;
  return made.id as string;
}

// Turns a preview + the committee's own notes into a filed document, and marks
// the obligation's task Complete — the shared "publish" behavior for every
// standard Action (Insurance Renewal, Financial Statements, Maintenance Plan,
// AGM Notice), so publishing always leaves the same trail in Documents and in
// the obligation's own status, whichever one it was.
export async function publishActionDocument(schemeId: string, widget: ComplianceWidget, existingTaskId: string | null, text: string) {
  const folderId = await ensureActionsFolder(schemeId);
  const fileName = `${widget.label} — ${new Date().toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })}.txt`;
  const path = `${schemeId}/${crypto.randomUUID()}-${fileName.replace(/[^\w.\- ]/g, "_")}`;
  const blob = new Blob([text], { type: "text/plain" });
  const { error: upErr } = await supabase.storage.from("documents").upload(path, blob);
  if (upErr) throw upErr;

  const taskId = existingTaskId ?? (await supabase.from("compliance_tasks").insert({
    scheme_id: schemeId, widget_id: widget.id, task_name: widget.label,
    detail: widget.default_detail, due_date: new Date().toISOString().slice(0, 10), status: "Complete",
  }).select("id").single()).data?.id as string | undefined;
  if (!taskId) throw new Error("Could not create the obligation record");
  if (existingTaskId) {
    const { error } = await supabase.from("compliance_tasks").update({ status: "Complete" }).eq("id", existingTaskId);
    if (error) throw error;
  }

  const { error } = await supabase.from("documents").insert({
    scheme_id: schemeId, name: fileName, category: widget.label, folder_id: folderId,
    compliance_task_id: taskId, storage_path: path, file_size: blob.size, mime_type: "text/plain",
  });
  if (error) throw error;
  return taskId;
}

export async function ensureStandardWidget(schemeId: string, existing: ComplianceWidget[], spec: { key: string; label: string; detail: string }) {
  if (existing.some(w => w.standard_key === spec.key)) return false;
  const { error } = await supabase.from("compliance_widgets").insert({
    scheme_id: schemeId, label: spec.label, is_standard: true, standard_key: spec.key,
    default_detail: spec.detail, enabled: true, sort_order: existing.length,
  });
  if (error) throw error;
  return true;
}

// Each standing obligation is managed on the tab it's about, so reminders for it
// (notification bell, calendar) should deep-link there rather than all to AGM.
const OBLIGATION_TAB: Record<string, string> = {
  agm_notice: "AGM", insurance_renewal: "Insurance", financial_statements: "Finance", maintenance_plan: "Work orders",
};
export const obligationTab = (standardKey: string | null | undefined) => (standardKey && OBLIGATION_TAB[standardKey]) || "AGM";

// Obligations no longer managed anywhere in the app. Their old rows stay in the
// database but are hidden from the checklist, bell and calendar.
const RETIRED_OBLIGATIONS = new Set(["insurance_renewal", "maintenance_plan"]);
export const isRetiredObligation = (standardKey: string | null | undefined) => !!standardKey && RETIRED_OBLIGATIONS.has(standardKey);
