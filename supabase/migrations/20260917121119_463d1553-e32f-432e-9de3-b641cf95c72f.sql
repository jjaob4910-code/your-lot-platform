CREATE TABLE public.insurance_policies (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  scheme_id uuid NOT NULL REFERENCES public.schemes(id) ON DELETE CASCADE,
  policy_type text NOT NULL DEFAULT 'Building',
  insurer text,
  broker text,
  broker_contact text,
  policy_number text,
  sum_insured numeric,
  excess numeric,
  premium numeric,
  start_date date,
  renewal_date date,
  notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.insurance_policies TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.insurance_policies TO anon;
GRANT ALL ON public.insurance_policies TO service_role;

ALTER TABLE public.insurance_policies ENABLE ROW LEVEL SECURITY;

CREATE POLICY prototype_open_access ON public.insurance_policies FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY insurance_select ON public.insurance_policies FOR SELECT TO authenticated USING (true);
CREATE POLICY insurance_write ON public.insurance_policies FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'Committee'::app_role)) WITH CHECK (has_role(auth.uid(), 'Committee'::app_role));

CREATE TRIGGER insurance_policies_updated_at BEFORE UPDATE ON public.insurance_policies
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.documents ADD COLUMN insurance_policy_id uuid REFERENCES public.insurance_policies(id) ON DELETE SET NULL;
CREATE INDEX documents_insurance_policy_id_idx ON public.documents(insurance_policy_id);