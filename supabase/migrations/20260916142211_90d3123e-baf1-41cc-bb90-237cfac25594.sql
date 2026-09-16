CREATE TABLE public.calendar_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scheme_id uuid NOT NULL REFERENCES public.schemes(id) ON DELETE CASCADE,
  title text NOT NULL,
  notes text,
  event_date date NOT NULL,
  kind text NOT NULL DEFAULT 'Event',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.calendar_events TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.calendar_events TO anon;
GRANT ALL ON public.calendar_events TO service_role;

ALTER TABLE public.calendar_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY calendar_events_select ON public.calendar_events FOR SELECT TO authenticated USING (true);
CREATE POLICY calendar_events_write ON public.calendar_events FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'Committee'::app_role)) WITH CHECK (has_role(auth.uid(), 'Committee'::app_role));
CREATE POLICY prototype_open_access ON public.calendar_events FOR ALL TO anon USING (true) WITH CHECK (true);

CREATE TRIGGER calendar_events_updated_at BEFORE UPDATE ON public.calendar_events
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();