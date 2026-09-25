-- One editable draft per scheme + standard obligation (Insurance Renewal,
-- Financial Statements, Maintenance Plan) in the Actions workspace. Overwritten
-- on each save rather than versioned — unlike agm_meetings, these don't need
-- history, just a place to keep the committee's in-progress commentary before
-- it's published as a document.
CREATE TABLE public.action_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scheme_id uuid NOT NULL REFERENCES public.schemes(id) ON DELETE CASCADE,
  standard_key text NOT NULL,
  content text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX action_drafts_scheme_key_uidx ON public.action_drafts (scheme_id, standard_key);
CREATE TRIGGER action_drafts_updated_at BEFORE UPDATE ON public.action_drafts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

GRANT SELECT, INSERT, UPDATE, DELETE ON public.action_drafts TO authenticated, anon;
GRANT ALL ON public.action_drafts TO service_role;
ALTER TABLE public.action_drafts ENABLE ROW LEVEL SECURITY;
CREATE POLICY prototype_open_access ON public.action_drafts FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY action_drafts_select ON public.action_drafts FOR SELECT TO authenticated USING (true);
CREATE POLICY action_drafts_write ON public.action_drafts FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'Committee')) WITH CHECK (public.has_role(auth.uid(), 'Committee'));
