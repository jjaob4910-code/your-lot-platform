-- Documents and photos attached to an AGM agenda item (uploaded or picked from Documents).
CREATE TABLE public.agm_item_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id uuid NOT NULL REFERENCES public.agm_meetings(id) ON DELETE CASCADE,
  item_id text NOT NULL,
  document_id uuid NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (meeting_id, item_id, document_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.agm_item_attachments TO authenticated, anon;
GRANT ALL ON public.agm_item_attachments TO service_role;
ALTER TABLE public.agm_item_attachments ENABLE ROW LEVEL SECURITY;
CREATE POLICY prototype_open_access ON public.agm_item_attachments FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY agm_attachments_select ON public.agm_item_attachments FOR SELECT TO authenticated USING (true);
CREATE POLICY agm_attachments_write ON public.agm_item_attachments FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'Committee')) WITH CHECK (public.has_role(auth.uid(), 'Committee'));
