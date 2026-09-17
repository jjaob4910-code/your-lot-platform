CREATE TABLE public.budget_forecast_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scheme_id uuid NOT NULL REFERENCES public.schemes(id) ON DELETE CASCADE,
  financial_year text NOT NULL,
  direction text NOT NULL DEFAULT 'out',
  fund text NOT NULL DEFAULT 'Admin',
  category text,
  label text NOT NULL,
  amount numeric(12,2) NOT NULL DEFAULT 0,
  expected_month smallint NOT NULL DEFAULT 7,
  notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT budget_forecast_lines_month_check CHECK (expected_month BETWEEN 1 AND 12)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.budget_forecast_lines TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.budget_forecast_lines TO anon;
GRANT ALL ON public.budget_forecast_lines TO service_role;

ALTER TABLE public.budget_forecast_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY prototype_open_access ON public.budget_forecast_lines FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY budget_forecast_lines_select ON public.budget_forecast_lines FOR SELECT TO authenticated USING (true);
CREATE POLICY budget_forecast_lines_write ON public.budget_forecast_lines FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'Committee'::app_role)) WITH CHECK (has_role(auth.uid(), 'Committee'::app_role));

CREATE INDEX budget_forecast_lines_scheme_idx ON public.budget_forecast_lines (scheme_id, financial_year, expected_month);

CREATE TRIGGER budget_forecast_lines_updated_at BEFORE UPDATE ON public.budget_forecast_lines
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
