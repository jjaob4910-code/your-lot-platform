// Builds the AGM notice and minutes as simple, printable A4 PDFs in the browser.
// jsPDF is loaded on demand so it never weighs down the rest of the dashboard.

export type AgmPdfItem = {
  label: string; notes: string;
  discussion?: string; motion?: string; moved_by?: string; seconded_by?: string; outcome?: string;
};
export type AgmPdfMeeting = {
  title: string; meeting_date: string | null; meeting_time: string | null; location: string | null; video_link: string | null;
  agenda: AgmPdfItem[];
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

  if (scheme?.name) text(scheme.name.toUpperCase(), 9, { bold: true, color: 110, gap: 1 });
  if (scheme?.address) text(scheme.address, 9, { color: 110, gap: 6 });
  text(heading, 20, { bold: true, gap: 4 });
  return { doc, text, rule, space: (h: number) => { y += h; } };
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
    if (a.notes) w.text(a.notes, 10.5, { indent: 6, color: 70, gap: 3 });
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
    if (a.discussion) w.text(a.discussion, 10.5, { indent: 6, gap: 2 });
    if (a.motion) {
      w.text(`Motion: ${a.motion}`, 10.5, { indent: 6, bold: true, gap: 1 });
      const who = [a.moved_by ? `Moved: ${a.moved_by}` : "", a.seconded_by ? `Seconded: ${a.seconded_by}` : "", a.outcome ? `Result: ${a.outcome}` : ""].filter(Boolean).join("   ");
      if (who) w.text(who, 10, { indent: 6, color: 70, gap: 2 });
    }
    w.space(2);
  });
  w.rule();
  w.text(`Minutes recorded ${longDate(new Date().toISOString())}.`, 9.5, { color: 110 });
  return w.doc.output("blob");
}
