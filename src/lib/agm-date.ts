// One answer to "when is the next AGM?", shared by the dashboard, calendar and settings.
// The AGM tab's meetings are the source of truth; the building's own next_agm_date is only
// a fallback for buildings that haven't scheduled a meeting in the AGM tab yet.
type MeetingDate = { id: string; meeting_date: string | null; stage?: string | null };

export function nextAgm(meetings: MeetingDate[], fallback: string | null): { date: string | null; meetingId: string | null } {
  const today = new Date().toISOString().slice(0, 10);
  const upcoming = meetings
    .filter(m => m.meeting_date && m.meeting_date.slice(0, 10) >= today && m.stage !== "Published")
    .sort((a, b) => a.meeting_date!.localeCompare(b.meeting_date!))[0];
  if (upcoming) return { date: upcoming.meeting_date!.slice(0, 10), meetingId: upcoming.id };
  return { date: fallback, meetingId: null };
}

// Owners must get written notice before the AGM. 14 days is the usual minimum in Victoria;
// check your owners corporation's own rules.
export const AGM_NOTICE_DAYS = 14;

/** When the next meeting's notice must go out, while it hasn't been sent yet. */
export function agmNoticeDue(meetings: MeetingDate[]): { meetingId: string; due: string; meetingDate: string } | null {
  const next = nextAgm(meetings, null);
  const m = next.meetingId ? meetings.find(x => x.id === next.meetingId) : undefined;
  if (!m || !next.date || (m.stage && m.stage !== "Draft")) return null;
  const d = new Date(`${next.date}T00:00:00`); d.setDate(d.getDate() - AGM_NOTICE_DAYS);
  const due = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return { meetingId: m.id, due, meetingDate: next.date };
}
