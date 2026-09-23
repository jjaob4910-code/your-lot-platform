CREATE TABLE public.compliance_widgets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scheme_id uuid NOT NULL REFERENCES public.schemes(id) ON DELETE CASCADE,
  label text NOT NULL,
  is_standard boolean NOT NULL DEFAULT false,
  standard_key text,
  default_detail text,
  enabled boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX compliance_widgets_scheme_standard_key_uidx
  ON public.compliance_widgets (scheme_id, standard_key) WHERE standard_key IS NOT NULL;
CREATE TRIGGER compliance_widgets_set_updated_at BEFORE UPDATE ON public.compliance_widgets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

GRANT SELECT, INSERT, UPDATE, DELETE ON public.compliance_widgets TO authenticated;
GRANT ALL ON public.compliance_widgets TO service_role;
ALTER TABLE public.compliance_widgets ENABLE ROW LEVEL SECURITY;
CREATE POLICY compliance_widgets_select ON public.compliance_widgets FOR SELECT TO authenticated USING (true);
CREATE POLICY compliance_widgets_write ON public.compliance_widgets FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'Committee')) WITH CHECK (public.has_role(auth.uid(), 'Committee'));

-- A task only has meaning as an instance of its widget's obligation, so it cascades with the
-- widget. Standard widgets are never hard-deleted (only toggled off), so this only ever fires
-- for custom widgets — a committee member's own optional item, no shared record involved.
-- documents.compliance_task_id is already ON DELETE SET NULL, so evidence files attached to
-- a cascaded task survive, just unlinked.
ALTER TABLE public.compliance_tasks
  ADD COLUMN widget_id uuid REFERENCES public.compliance_widgets(id) ON DELETE CASCADE;

INSERT INTO public.compliance_widgets (scheme_id, label, is_standard, standard_key, default_detail, sort_order) VALUES
  ('11111111-1111-1111-1111-111111111111','AGM Notice',true,'agm_notice','Written notice to every owner ahead of the annual general meeting.',0),
  ('11111111-1111-1111-1111-111111111111','Insurance Renewal',true,'insurance_renewal','Keep building insurance current, renewed before the policy lapses.',1),
  ('11111111-1111-1111-1111-111111111111','Financial Statements',true,'financial_statements','Prepare the annual financial statements: what came in, what went out.',2),
  ('11111111-1111-1111-1111-111111111111','Maintenance Plan',true,'maintenance_plan','Keep a maintenance plan for the building''s common property up to date, including fire safety certification.',3);

UPDATE public.compliance_tasks t SET widget_id = w.id
FROM public.compliance_widgets w
WHERE w.scheme_id = '11111111-1111-1111-1111-111111111111' AND t.scheme_id = w.scheme_id
  AND ((t.task_name = 'Annual general meeting notice' AND w.standard_key = 'agm_notice')
    OR (t.task_name = 'Building insurance renewal' AND w.standard_key = 'insurance_renewal')
    OR (t.task_name = 'Annual financial statements' AND w.standard_key = 'financial_statements')
    OR (t.task_name = 'Annual fire safety statement' AND w.standard_key = 'maintenance_plan'));
