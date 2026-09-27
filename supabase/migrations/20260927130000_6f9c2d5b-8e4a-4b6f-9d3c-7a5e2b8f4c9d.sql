-- The AGM dashboard needs more than a bare date: what time it starts, where it is
-- held, and a video-call link for owners joining remotely.
alter table public.agm_meetings
  add column meeting_time text,
  add column location text,
  add column video_link text;
