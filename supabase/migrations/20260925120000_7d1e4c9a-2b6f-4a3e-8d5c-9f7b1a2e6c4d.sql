-- Backing table for the new Settings page's "App preferences" section: one row per
-- scheme, matching the same anon-prototype + Committee-write RLS convention used by
-- insurance_policies/calendar_events/finance_transactions.
CREATE TABLE public.scheme_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scheme_id uuid NOT NULL REFERENCES public.schemes(id) ON DELETE CASCADE UNIQUE,
  notify_new_work_order boolean NOT NULL DEFAULT true,
  notify_new_document boolean NOT NULL DEFAULT true,
  notify_levy_due boolean NOT NULL DEFAULT true,
  currency_code text NOT NULL DEFAULT 'AUD',
  date_format text NOT NULL DEFAULT 'DD/MM/YYYY',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.scheme_settings TO authenticated, anon;
GRANT ALL ON public.scheme_settings TO service_role;
ALTER TABLE public.scheme_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY prototype_open_access ON public.scheme_settings FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY scheme_settings_select ON public.scheme_settings FOR SELECT TO authenticated USING (true);
CREATE POLICY scheme_settings_write ON public.scheme_settings FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'Committee')) WITH CHECK (public.has_role(auth.uid(), 'Committee'));

CREATE TRIGGER scheme_settings_updated_at BEFORE UPDATE ON public.scheme_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
