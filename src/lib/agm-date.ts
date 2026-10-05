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
