-- AGM workspace: unlike the other three standard obligations, an AGM has real
-- history that matters (previous meetings' agendas and notes), so it gets its
-- own table rather than the overwrite-in-place action_drafts model.
CREATE TABLE public.agm_meetings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scheme_id uuid NOT NULL REFERENCES public.schemes(id) ON DELETE CASCADE,
  title text NOT NULL,
  meeting_date date,
  agenda jsonb NOT NULL DEFAULT '[]'::jsonb,
  notes text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'Draft' CHECK (status IN ('Draft', 'Published')),
  created_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz
);
CREATE INDEX agm_meetings_scheme_idx ON public.agm_meetings (scheme_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.agm_meetings TO authenticated, anon;
GRANT ALL ON public.agm_meetings TO service_role;
ALTER TABLE public.agm_meetings ENABLE ROW LEVEL SECURITY;
CREATE POLICY prototype_open_access ON public.agm_meetings FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY agm_meetings_select ON public.agm_meetings FOR SELECT TO authenticated USING (true);
CREATE POLICY agm_meetings_write ON public.agm_meetings FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'Committee')) WITH CHECK (public.has_role(auth.uid(), 'Committee'));
