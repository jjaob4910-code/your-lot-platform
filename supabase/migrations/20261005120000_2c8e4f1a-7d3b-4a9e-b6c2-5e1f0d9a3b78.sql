-- AGM list order set by the committee (NULL = newest first), and when attendance was confirmed
-- so the minutes can collapse it to a summary.
ALTER TABLE public.agm_meetings
  ADD COLUMN IF NOT EXISTS sort_order integer,
  ADD COLUMN IF NOT EXISTS attendance_confirmed_at timestamptz;
