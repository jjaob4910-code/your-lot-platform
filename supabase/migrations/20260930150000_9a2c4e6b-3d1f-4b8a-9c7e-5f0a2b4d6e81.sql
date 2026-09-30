-- AGM notebook: a meeting moves Draft → Notice sent → Minutes → Published. `status`
-- stays Draft until Published so existing checks keep working. Owners can suggest
-- agenda items while the agenda is still a draft.
ALTER TABLE public.agm_meetings
  ADD COLUMN stage text NOT NULL DEFAULT 'Draft' CHECK (stage IN ('Draft','Notice sent','Minutes','Published')),
  ADD COLUMN notice_sent_at timestamptz,
  ADD COLUMN notice_document_id uuid REFERENCES public.documents(id) ON DELETE SET NULL,
  ADD COLUMN minutes_document_id uuid REFERENCES public.documents(id) ON DELETE SET NULL,
  ADD COLUMN attendance jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
UPDATE public.agm_meetings SET stage = 'Published' WHERE status = 'Published';
CREATE TRIGGER agm_meetings_updated_at BEFORE UPDATE ON public.agm_meetings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.agm_suggestions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id uuid NOT NULL REFERENCES public.agm_meetings(id) ON DELETE CASCADE,
  lot_id uuid REFERENCES public.lots(id) ON DELETE SET NULL,
  title text NOT NULL,
  details text,
  status text NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending','Added','Declined')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX agm_suggestions_meeting_idx ON public.agm_suggestions (meeting_id, created_at);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.agm_suggestions TO authenticated, anon;
GRANT ALL ON public.agm_suggestions TO service_role;
ALTER TABLE public.agm_suggestions ENABLE ROW LEVEL SECURITY;
CREATE POLICY prototype_open_access ON public.agm_suggestions FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY agm_suggestions_select ON public.agm_suggestions FOR SELECT TO authenticated USING (true);
CREATE POLICY agm_suggestions_owner_insert ON public.agm_suggestions FOR INSERT TO authenticated
  WITH CHECK (status = 'Pending' AND (public.has_role(auth.uid(), 'Committee') OR (lot_id IS NOT NULL AND public.owns_lot(lot_id))));
CREATE POLICY agm_suggestions_committee_update ON public.agm_suggestions FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'Committee')) WITH CHECK (public.has_role(auth.uid(), 'Committee'));
CREATE POLICY agm_suggestions_committee_delete ON public.agm_suggestions FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'Committee'));
