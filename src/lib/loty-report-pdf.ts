// A one-page-or-so monthly management report for one building, built in the browser.
// jsPDF is loaded on demand so it never weighs down the rest of the app.

import { supabase } from "@/integrations/supabase/client";
import { daysUntil, money, niceDate } from "@/lib/format";

type Summary = { name: string; address: string | null; cash: number };

/** Gathers the month's figures for a building and downloads the report. */
export async function downloadMonthlyReport(schemeId: string, s: Summary, month: string /* YYYY-MM */) {
  const start = `${month}-01`;
  const endD = new Date(`${start}T00:00:00`); endD.setMonth(endD.getMonth() + 1);
  const end = endD.toISOString().slice(0, 10);
  const monthName = new Date(`${start}T00:00:00`).toLocaleDateString("en-AU", { month: "long", year: "numeric" });

  const [lotsQ, jobsQ, insQ, agmQ, actQ] = await Promise.all([
    supabase.from("lots").select("id, lot_number, owner_name").eq("scheme_id", schemeId),
    supabase.from("maintenance_requests").select("id, title, created_at, closed_at").eq("scheme_id", schemeId),
    supabase.from("insurance_policies").select("policy_type, insurer, renewal_date").eq("scheme_id", schemeId),
    supabase.from("agm_meetings").select("title, meeting_date, notice_sent_at").eq("scheme_id", schemeId),
    supabase.from("loty_activity").select("actor_name, summary, action, created_at").eq("scheme_id", schemeId).gte("created_at", start).lt("created_at", end),
  ]);
  const lots = lotsQ.data ?? [];
  const lotById = new Map(lots.map(l => [l.id as string, l]));
  const levQ = lots.length ? await supabase.from("levies").select("lot_id, amount, due_date, status, paid_at").in("lot_id", lots.map(l => l.id as string)) : { data: [] };
  const levies = levQ.data ?? [];
  const paidThisMonth = levies.filter(v => v.status === "Paid" && v.paid_at && String(v.paid_at) >= start && String(v.paid_at) < end);
  const owing = levies.filter(v => v.status !== "Paid" && String(v.status) !== "Void");
  const overdue = owing.filter(v => daysUntil(String(v.due_date)) < 0);
  const jobs = jobsQ.data ?? [];
  const opened = jobs.filter(j => String(j.created_at) >= start && String(j.created_at) < end);
  const closed = jobs.filter(j => j.closed_at && String(j.closed_at) >= start && String(j.closed_at) < end);
  const open = jobs.filter(j => !j.closed_at);
  const today = new Date().toISOString().slice(0, 10);
  const nextAgm = (agmQ.data ?? []).filter(m => m.meeting_date && String(m.meeting_date) >= today).sort((a, b) => String(a.meeting_date).localeCompare(String(b.meeting_date)))[0];
  const renewals = (insQ.data ?? []).filter(p => p.renewal_date && String(p.renewal_date) >= today).sort((a, b) => String(a.renewal_date).localeCompare(String(b.renewal_date)));
  const sum = (xs: { amount: unknown }[]) => xs.reduce((t, x) => t + Number(x.amount), 0);

  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const left = 20, right = 190, bottom = 280;
  let y = 22;
  const ensure = (h: number) => { if (y + h > bottom) { doc.addPage(); y = 22; } };
  const text = (value: string, size: number, opts: { bold?: boolean; gap?: number; color?: number } = {}) => {
    doc.setFont("helvetica", opts.bold ? "bold" : "normal"); doc.setFontSize(size); doc.setTextColor(opts.color ?? 20);
    for (const line of doc.splitTextToSize(value, right - left) as string[]) { ensure(size * 0.45); doc.text(line, left, y); y += size * 0.45; }
    y += opts.gap ?? 2;
  };
  const row = (label: string, value: string) => {
    ensure(6); doc.setFont("helvetica", "normal"); doc.setFontSize(10); doc.setTextColor(90); doc.text(label, left, y);
    doc.setTextColor(20); doc.setFont("helvetica", "bold"); doc.text(value, right, y, { align: "right" }); y += 6;
  };
  const heading = (t: string) => { y += 3; ensure(12); doc.setDrawColor(215); doc.line(left, y, right, y); y += 6; text(t.toUpperCase(), 9, { bold: true, color: 90, gap: 3 }); };

  text("Monthly management report", 9, { color: 110, gap: 1 });
  text(s.name, 20, { bold: true, gap: 1 });
  text([s.address, monthName].filter(Boolean).join(" · "), 11, { color: 90, gap: 4 });
  text(`Prepared by Loty on ${niceDate(today)}.`, 9, { color: 120 });

  heading("Money");
  row("Cash held today", money(Number(s.cash)));
  row(`Levies received in ${monthName}`, `${paidThisMonth.length} · ${money(sum(paidThisMonth))}`);
  row("Levies still owing", `${owing.length} · ${money(sum(owing))}`);
  row("Of which overdue", `${overdue.length} · ${money(sum(overdue))}`);
  if (overdue.length) {
    y += 1;
    for (const v of overdue.slice(0, 15)) { const l = lotById.get(v.lot_id as string); text(`Lot ${l?.lot_number ?? "?"}${l?.owner_name ? ` (${l.owner_name})` : ""}: ${money(Number(v.amount))}, due ${niceDate(String(v.due_date))}, ${-daysUntil(String(v.due_date))} days overdue`, 9, { color: 60, gap: 0.5 }); }
  }

  heading("Repairs and work orders");
  row(`Opened in ${monthName}`, String(opened.length));
  row(`Completed in ${monthName}`, String(closed.length));
  row("Still open", String(open.length));
  for (const j of open.slice(0, 10)) text(`• ${j.title} (open since ${niceDate(String(j.created_at))})`, 9, { color: 60, gap: 0.5 });

  heading("Coming up");
  row("Next AGM", nextAgm ? `${niceDate(String(nextAgm.meeting_date))}${nextAgm.notice_sent_at ? " · notice sent" : " · notice not sent yet"}` : "Not scheduled");
  if (renewals.length) for (const p of renewals.slice(0, 4)) row(`${p.policy_type} insurance renews`, `${niceDate(String(p.renewal_date))}${p.insurer ? ` · ${p.insurer}` : ""}`);
  else row("Insurance renewals", "None on file");

  const act = actQ.data ?? [];
  if (act.length) {
    heading(`What Loty did in ${monthName}`);
    for (const a of act.slice(0, 25)) text(`${niceDate(String(a.created_at))} · ${a.actor_name ?? "Loty"} ${a.action} ${a.summary ?? ""}`, 9, { color: 60, gap: 0.5 });
    if (act.length > 25) text(`…and ${act.length - 25} more.`, 9, { color: 110 });
  }

  doc.save(`${s.name.replace(/[^\w\s-]/g, "").trim() || "Building"} - ${monthName} report.pdf`);
}
