// Builds the AGM notice and minutes as simple, printable A4 PDFs in the browser.
// jsPDF is loaded on demand so it never weighs down the rest of the dashboard.

export type AgmPdfItem = {
  label: string; notes: string;
  discussion?: string; motion?: string; moved_by?: string; seconded_by?: string; outcome?: string;
};
export type AgmPdfMeeting = {
  title: string; meeting_date: string | null; meeting_time: string | null; location: string | null; video_link: string | null;
  agenda: AgmPdfItem[]; notes?: string;
};
export type AgmPdfScheme = { name: string; address: string | null } | null;

const longDate = (iso: string) => new Date(`${iso.slice(0, 10)}T00:00:00`).toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

async function pdfWriter(heading: string, scheme: AgmPdfScheme) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const left = 20, right = 190, bottom = 280;
  let y = 22;
  const ensure = (h: number) => { if (y + h > bottom) { doc.addPage(); y = 22; } };
  const text = (value: string, size: number, opts: { bold?: boolean; gap?: number; color?: number; indent?: number } = {}) => {
    doc.setFont("helvetica", opts.bold ? "bold" : "normal");
    doc.setFontSize(size);
    doc.setTextColor(opts.color ?? 20);
    const x = left + (opts.indent ?? 0);
    const lines = doc.splitTextToSize(value, right - x) as string[];
    const lineH = size * 0.45;
    for (const line of lines) { ensure(lineH); doc.text(line, x, y); y += lineH; }
    y += opts.gap ?? 2;
  };
  const rule = () => { ensure(6); doc.setDrawColor(210); doc.line(left, y, right, y); y += 6; };

  // Notes written in the notebook editor (HTML): keeps paragraphs, headings, bold/italic,
  // highlights, bullet and numbered lists and checklists. Plain text still works.
  type Run = { text: string; bold: boolean; italic: boolean; mark: boolean };
  const runsOf = (node: Node, st: { bold: boolean; italic: boolean; mark: boolean }, out: Run[]) => {
    node.childNodes.forEach(ch => {
      if (ch.nodeType === 3) { out.push({ text: ch.textContent ?? "", ...st }); return; }
      if (!(ch instanceof HTMLElement)) return;
      const t = ch.tagName;
      if (t === "BR") { out.push({ text: "\n", ...st }); return; }
      if (t === "UL" || t === "OL") return; // nested lists are written as their own blocks
      runsOf(ch, { bold: st.bold || t === "STRONG" || t === "B", italic: st.italic || t === "EM" || t === "I", mark: st.mark || t === "MARK" }, out);
    });
  };
  const writeRuns = (runs: Run[], size: number, x0: number, color: number) => {
    const lineH = size * 0.45;
    doc.setFontSize(size);
    let x = x0; ensure(lineH);
    const words: Run[] = [];
    for (const r of runs) for (const part of r.text.split(/(\s+|\n)/)) if (part) words.push({ ...r, text: part });
    for (const w of words) {
      if (w.text === "\n") { y += lineH; x = x0; ensure(lineH); continue; }
      doc.setFont("helvetica", w.bold && w.italic ? "bolditalic" : w.bold ? "bold" : w.italic ? "italic" : "normal");
      const width = doc.getTextWidth(w.text);
      if (/^\s+$/.test(w.text)) { if (x > x0) x += width; continue; }
      if (x + width > right && x > x0) { y += lineH; x = x0; ensure(lineH); }
      if (w.mark) { doc.setFillColor(253, 230, 120); doc.rect(x - 0.3, y - size * 0.33, width + 0.6, size * 0.42, "F"); }
      doc.setTextColor(color); doc.text(w.text, x, y); x += width;
    }
    y += lineH;
  };
  const rich = (value: string, size: number, opts: { indent?: number; color?: number; gap?: number } = {}) => {
    const base = left + (opts.indent ?? 0); const color = opts.color ?? 20;
    if (!value.trim().startsWith("<")) { text(value, size, opts); return; }
    const root = new DOMParser().parseFromString(`<div>${value}</div>`, "text/html").body.firstElementChild as HTMLElement;
    const block = (el: Element, depth: number) => {
      const t = el.tagName;
      if (t === "UL" || t === "OL") {
        const task = el.getAttribute("data-type") === "taskList";
        Array.from(el.children).forEach((li, i) => {
          const marker = task ? (li.getAttribute("data-checked") === "true" ? "[x]" : "[  ]") : t === "OL" ? `${i + 1}.` : "\u2022";
          const x = base + depth * 5;
          doc.setFont("helvetica", "normal"); doc.setFontSize(size); doc.setTextColor(color); ensure(size * 0.45); doc.text(marker, x, y);
          const runs: Run[] = []; runsOf(li, { bold: false, italic: false, mark: false }, runs);
          writeRuns(runs.filter(r => r.text.trim() || r.text === " "), size, x + (task ? 7 : 5), color);
          li.querySelectorAll(":scope > div > ul, :scope > div > ol, :scope > ul, :scope > ol").forEach(sub => block(sub, depth + 1));
          y += 0.6;
        });
        y += 1.2; return;
      }
      const runs: Run[] = []; runsOf(el, { bold: t === "H3", italic: false, mark: false }, runs);
      if (!runs.some(r => r.text.trim())) return;
      writeRuns(runs, t === "H3" ? size + 1.5 : size, base + (t === "BLOCKQUOTE" ? 4 : 0), t === "BLOCKQUOTE" ? 90 : color);
      y += 1.6;
    };
    Array.from(root.children).forEach(el => block(el, 0));
    y += (opts.gap ?? 2) - 1.6;
  };

  if (scheme?.name) text(scheme.name.toUpperCase(), 9, { bold: true, color: 110, gap: 1 });
  if (scheme?.address) text(scheme.address, 9, { color: 110, gap: 6 });
  text(heading, 20, { bold: true, gap: 4 });
  return { doc, text, rich, rule, space: (h: number) => { y += h; } };
}

function detailsBlock(w: Awaited<ReturnType<typeof pdfWriter>>, m: AgmPdfMeeting) {
  w.text(m.title || "Annual General Meeting", 13, { bold: true, gap: 3 });
  if (m.meeting_date) w.text(`Date: ${longDate(m.meeting_date)}${m.meeting_time ? ` at ${m.meeting_time}` : ""}`, 11, { gap: 1.5 });
  if (m.location) w.text(`Location: ${m.location}`, 11, { gap: 1.5 });
  if (m.video_link) w.text(`Join online: ${m.video_link}`, 11, { gap: 1.5 });
  w.space(3); w.rule();
}

export async function buildAgmNoticePdf(m: AgmPdfMeeting, scheme: AgmPdfScheme): Promise<Blob> {
  const w = await pdfWriter("Notice of Annual General Meeting", scheme);
  w.text("Notice is given to all lot owners that the annual general meeting of the owners corporation will be held as follows.", 11, { gap: 5 });
  detailsBlock(w, m);
  w.text("Agenda", 14, { bold: true, gap: 3 });
  m.agenda.filter(a => a.label.trim()).forEach((a, i) => {
    w.text(`${i + 1}. ${a.label}`, 11.5, { bold: true, gap: a.notes ? 1 : 3 });
    if (a.notes && a.notes.replace(/<[^>]*>/g, "").trim()) w.rich(a.notes, 10.5, { indent: 6, color: 60, gap: 3 });
  });
  w.space(4); w.rule();
  w.text(`Issued ${longDate(new Date().toISOString())}. If you can't attend, you can send your apologies or appoint a proxy through the committee.`, 9.5, { color: 110 });
  return w.doc.output("blob");
}

export async function buildAgmMinutesPdf(m: AgmPdfMeeting, scheme: AgmPdfScheme, attendance: { lot: string; status: string }[]): Promise<Blob> {
  const w = await pdfWriter("Minutes of Annual General Meeting", scheme);
  detailsBlock(w, m);
  if (attendance.length) {
    w.text("Attendance", 14, { bold: true, gap: 3 });
    for (const status of ["Present", "Proxy", "Apologies"]) {
      const lots = attendance.filter(a => a.status === status).map(a => a.lot);
      if (lots.length) w.text(`${status}: ${lots.join(", ")}`, 10.5, { gap: 2 });
    }
    w.space(3); w.rule();
  }
  w.text("Business", 14, { bold: true, gap: 3 });
  m.agenda.filter(a => a.label.trim()).forEach((a, i) => {
    w.text(`${i + 1}. ${a.label}`, 11.5, { bold: true, gap: 1.5 });
    if (a.discussion && a.discussion.replace(/<[^>]*>/g, "").trim()) w.rich(a.discussion, 10.5, { indent: 6, gap: 2 });
    if (a.motion) {
      w.text(`Motion: ${a.motion}`, 10.5, { indent: 6, bold: true, gap: 1 });
      const who = [a.moved_by ? `Moved: ${a.moved_by}` : "", a.seconded_by ? `Seconded: ${a.seconded_by}` : "", a.outcome ? `Result: ${a.outcome}` : ""].filter(Boolean).join("   ");
      if (who) w.text(who, 10, { indent: 6, color: 70, gap: 2 });
    }
    w.space(2);
  });
  if (m.notes && m.notes.replace(/<[^>]*>/g, "").trim()) { w.rule(); w.text("Meeting notes", 14, { bold: true, gap: 3 }); w.rich(m.notes, 10.5, { gap: 3 }); }
  w.rule();
  w.text(`Minutes recorded ${longDate(new Date().toISOString())}.`, 9.5, { color: 110 });
  return w.doc.output("blob");
}
