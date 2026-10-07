-- Loty staff tools, round 3: an activity log of changes Loty staff make in buildings, a contact
-- log with committees, and each building's management agreement. Safe to run more than once.

-- ── Activity log ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.loty_activity (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scheme_id uuid NOT NULL REFERENCES public.schemes(id) ON DELETE CASCADE,
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_name text,
  table_name text NOT NULL,
  action text NOT NULL CHECK (action IN ('added', 'changed', 'removed')),
  summary text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS loty_activity_scheme ON public.loty_activity (scheme_id, created_at DESC);
ALTER TABLE public.loty_activity ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.loty_activity TO authenticated;
DROP POLICY IF EXISTS staff_or_committee_read ON public.loty_activity;
-- Loty staff see everything; a building's committee sees what Loty did in their building.
CREATE POLICY staff_or_committee_read ON public.loty_activity FOR SELECT TO authenticated
  USING (public.is_loty_staff() OR EXISTS (SELECT 1 FROM public.scheme_members m WHERE m.scheme_id = loty_activity.scheme_id AND m.user_id = auth.uid() AND m.role IN ('Committee', 'Manager')));

-- Records a change, but only when the person making it is Loty staff.
CREATE OR REPLACE FUNCTION public.loty_log_activity() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r jsonb; sid uuid; label text; what text;
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (SELECT 1 FROM public.loty_staff WHERE user_id = auth.uid()) THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  r := to_jsonb(COALESCE(NEW, OLD));
  sid := COALESCE(NULLIF(r->>'scheme_id', '')::uuid, CASE WHEN TG_TABLE_NAME = 'schemes' THEN (r->>'id')::uuid END,
                  CASE WHEN r ? 'lot_id' THEN (SELECT scheme_id FROM public.lots WHERE id = (r->>'lot_id')::uuid) END);
  IF sid IS NULL THEN RETURN COALESCE(NEW, OLD); END IF;
  what := CASE TG_TABLE_NAME
    WHEN 'lots' THEN 'lot' WHEN 'levies' THEN 'levy' WHEN 'budgets' THEN 'budget' WHEN 'finance_transactions' THEN 'transaction'
    WHEN 'maintenance_requests' THEN 'work order' WHEN 'insurance_policies' THEN 'insurance policy' WHEN 'agm_meetings' THEN 'meeting'
    WHEN 'documents' THEN 'document' WHEN 'notices' THEN 'notice' WHEN 'scheme_settings' THEN 'building settings' ELSE TG_TABLE_NAME END;
  label := COALESCE(r->>'title', r->>'name', r->>'description', r->>'policy_type', r->>'financial_year',
                    CASE WHEN r ? 'lot_number' THEN 'Lot ' || (r->>'lot_number') END,
                    CASE WHEN TG_TABLE_NAME = 'levies' THEN (SELECT 'Lot ' || lot_number FROM public.lots WHERE id = (r->>'lot_id')::uuid) END);
  IF r ? 'amount' THEN label := concat_ws(' · ', label, '$' || to_char((r->>'amount')::numeric, 'FM999,999,990.00')); END IF;
  IF TG_TABLE_NAME = 'levies' AND TG_OP = 'UPDATE' AND (to_jsonb(OLD)->>'status') IS DISTINCT FROM (r->>'status') THEN
    label := concat_ws(' · ', label, 'now ' || (r->>'status'));
  END IF;
  INSERT INTO public.loty_activity (scheme_id, actor_id, actor_name, table_name, action, summary)
  VALUES (sid, auth.uid(),
    COALESCE((SELECT NULLIF(btrim(full_name), '') FROM public.profiles WHERE id = auth.uid()), (SELECT split_part(email, '@', 1) FROM auth.users WHERE id = auth.uid()), 'Loty'),
    TG_TABLE_NAME, CASE TG_OP WHEN 'INSERT' THEN 'added' WHEN 'UPDATE' THEN 'changed' ELSE 'removed' END,
    concat_ws(' · ', what, NULLIF(label, '')));
  RETURN COALESCE(NEW, OLD);
END $$;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['lots','levies','budgets','finance_transactions','maintenance_requests','insurance_policies',
                           'agm_meetings','documents','notices','scheme_settings'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS loty_log_activity ON public.%I', t);
    EXECUTE format('CREATE TRIGGER loty_log_activity AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.loty_log_activity()', t);
  END LOOP;
END $$;

-- ── Contact log ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.loty_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scheme_id uuid NOT NULL REFERENCES public.schemes(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('Call', 'Email', 'Meeting', 'Other')),
  with_whom text,
  summary text NOT NULL CHECK (length(btrim(summary)) BETWEEN 1 AND 4000),
  follow_up_on date,
  created_by uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  created_by_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS loty_contacts_scheme ON public.loty_contacts (scheme_id, created_at DESC);
ALTER TABLE public.loty_contacts ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.loty_contacts TO authenticated;
DROP POLICY IF EXISTS staff_read ON public.loty_contacts;
DROP POLICY IF EXISTS staff_add ON public.loty_contacts;
DROP POLICY IF EXISTS staff_update ON public.loty_contacts;
DROP POLICY IF EXISTS author_delete ON public.loty_contacts;
CREATE POLICY staff_read ON public.loty_contacts FOR SELECT TO authenticated USING (public.is_loty_staff());
CREATE POLICY staff_add ON public.loty_contacts FOR INSERT TO authenticated WITH CHECK (public.is_loty_staff() AND created_by = auth.uid());
CREATE POLICY staff_update ON public.loty_contacts FOR UPDATE TO authenticated USING (public.is_loty_staff()) WITH CHECK (public.is_loty_staff());
CREATE POLICY author_delete ON public.loty_contacts FOR DELETE TO authenticated USING (public.is_loty_staff() AND created_by = auth.uid());
CREATE OR REPLACE FUNCTION public.loty_contact_stamp() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN NEW.created_by := OLD.created_by; NEW.created_by_name := OLD.created_by_name; NEW.created_at := OLD.created_at; RETURN NEW; END IF;
  NEW.created_by := auth.uid(); NEW.created_at := now();
  NEW.created_by_name := COALESCE((SELECT NULLIF(btrim(full_name), '') FROM public.profiles WHERE id = auth.uid()),
                                  (SELECT split_part(email, '@', 1) FROM auth.users WHERE id = auth.uid()), 'Loty');
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS loty_contact_stamp ON public.loty_contacts;
CREATE TRIGGER loty_contact_stamp BEFORE INSERT OR UPDATE ON public.loty_contacts FOR EACH ROW EXECUTE FUNCTION public.loty_contact_stamp();

-- ── Management agreements ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.loty_agreements (
  scheme_id uuid PRIMARY KEY REFERENCES public.schemes(id) ON DELETE CASCADE,
  fee_amount numeric(12,2),
  fee_period text NOT NULL DEFAULT 'quarter' CHECK (fee_period IN ('month', 'quarter', 'year')),
  start_date date,
  end_date date,
  notice_days integer NOT NULL DEFAULT 60 CHECK (notice_days BETWEEN 0 AND 365),
  scope text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.loty_agreements ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.loty_agreements TO authenticated;
DROP POLICY IF EXISTS staff_all ON public.loty_agreements;
CREATE POLICY staff_all ON public.loty_agreements FOR ALL TO authenticated USING (public.is_loty_staff()) WITH CHECK (public.is_loty_staff());
