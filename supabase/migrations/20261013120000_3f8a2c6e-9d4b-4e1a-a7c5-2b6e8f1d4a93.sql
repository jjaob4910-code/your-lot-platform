-- Loty staff tools, round 2: photo framing, who looks after each building, the team list,
-- and a record of arrears follow-ups. Staff only. Safe to run more than once.

-- Where the cover photo is framed ("x% y%"), and the Loty staff member responsible.
ALTER TABLE public.loty_buildings ADD COLUMN IF NOT EXISTS cover_pos text NOT NULL DEFAULT '50% 50%';
ALTER TABLE public.loty_buildings ADD COLUMN IF NOT EXISTS assigned_to uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- The Loty team, for assigning buildings.
CREATE OR REPLACE FUNCTION public.loty_staff_list()
RETURNS TABLE (user_id uuid, name text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_loty_staff() THEN RAISE EXCEPTION 'Loty staff only'; END IF;
  RETURN QUERY SELECT s.user_id, COALESCE(NULLIF(btrim(p.full_name), ''), split_part(u.email, '@', 1))
  FROM public.loty_staff s JOIN auth.users u ON u.id = s.user_id LEFT JOIN public.profiles p ON p.id = s.user_id
  ORDER BY 2;
END $$;
GRANT EXECUTE ON FUNCTION public.loty_staff_list() TO authenticated;

-- Each step taken to chase an overdue levy.
CREATE TABLE IF NOT EXISTS public.loty_followups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  levy_id uuid NOT NULL REFERENCES public.levies(id) ON DELETE CASCADE,
  scheme_id uuid NOT NULL REFERENCES public.schemes(id) ON DELETE CASCADE,
  stage text NOT NULL CHECK (stage IN ('Reminder 1', 'Reminder 2', 'Final notice', 'Phone call', 'Payment plan', 'Note')),
  note text,
  created_by uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  created_by_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS loty_followups_levy ON public.loty_followups (levy_id, created_at DESC);
ALTER TABLE public.loty_followups ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, DELETE ON public.loty_followups TO authenticated;
DROP POLICY IF EXISTS staff_read ON public.loty_followups;
DROP POLICY IF EXISTS staff_add ON public.loty_followups;
DROP POLICY IF EXISTS author_delete ON public.loty_followups;
CREATE POLICY staff_read ON public.loty_followups FOR SELECT TO authenticated USING (public.is_loty_staff());
CREATE POLICY staff_add ON public.loty_followups FOR INSERT TO authenticated WITH CHECK (public.is_loty_staff() AND created_by = auth.uid());
CREATE POLICY author_delete ON public.loty_followups FOR DELETE TO authenticated USING (public.is_loty_staff() AND created_by = auth.uid());
CREATE OR REPLACE FUNCTION public.loty_followup_stamp() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  NEW.created_by := auth.uid(); NEW.created_at := now();
  NEW.created_by_name := COALESCE((SELECT NULLIF(btrim(full_name), '') FROM public.profiles WHERE id = auth.uid()),
                                  (SELECT split_part(email, '@', 1) FROM auth.users WHERE id = auth.uid()), 'Loty');
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS loty_followup_stamp ON public.loty_followups;
CREATE TRIGGER loty_followup_stamp BEFORE INSERT ON public.loty_followups FOR EACH ROW EXECUTE FUNCTION public.loty_followup_stamp();
