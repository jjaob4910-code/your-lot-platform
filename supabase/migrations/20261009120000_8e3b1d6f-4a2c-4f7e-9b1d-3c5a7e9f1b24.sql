-- Loty as the building manager.
-- Loty staff (added here, in the SQL editor, so nobody can add themselves) get full access to every
-- building Loty manages, without being members of it. Only staff can see the list of all buildings
-- and switch "Managed by Loty" on or off. Owners see "Loty" as their manager, with the team's contact.
-- Safe to run more than once.
--
-- To add a staff member after they've signed up to Loty:
--   INSERT INTO public.loty_staff (user_id) SELECT id FROM auth.users WHERE email = 'name@example.com' ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS public.loty_staff (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.loty_staff ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS own_row ON public.loty_staff;
CREATE POLICY own_row ON public.loty_staff FOR SELECT TO authenticated USING (user_id = auth.uid());

-- The team's contact details, shown to owners of managed buildings. One row.
CREATE TABLE IF NOT EXISTS public.loty_team (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  email text, phone text, updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.loty_team (id) VALUES (true) ON CONFLICT DO NOTHING;
ALTER TABLE public.loty_team ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.schemes ADD COLUMN IF NOT EXISTS managed_by_loty boolean NOT NULL DEFAULT false;
ALTER TABLE public.schemes ADD COLUMN IF NOT EXISTS managed_since timestamptz;

CREATE OR REPLACE FUNCTION public.is_loty_staff() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.loty_staff WHERE user_id = auth.uid())
$$;
GRANT EXECUTE ON FUNCTION public.is_loty_staff() TO authenticated;

DROP POLICY IF EXISTS member_read ON public.loty_team;
DROP POLICY IF EXISTS staff_write ON public.loty_team;
CREATE POLICY member_read ON public.loty_team FOR SELECT TO authenticated USING (true);
CREATE POLICY staff_write ON public.loty_team FOR UPDATE TO authenticated USING (public.is_loty_staff()) WITH CHECK (public.is_loty_staff());
GRANT SELECT, UPDATE ON public.loty_team TO authenticated;
GRANT SELECT ON public.loty_staff TO authenticated;

-- Staff act as the committee on managed buildings. Every access rule goes through these two.
CREATE OR REPLACE FUNCTION public.loty_manages(_scheme uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_loty_staff() AND EXISTS (SELECT 1 FROM public.schemes WHERE id = _scheme AND managed_by_loty)
$$;
CREATE OR REPLACE FUNCTION public.is_member(_scheme uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.scheme_members WHERE scheme_id = _scheme AND user_id = auth.uid())
      OR public.loty_manages(_scheme)
$$;
CREATE OR REPLACE FUNCTION public.is_committee(_scheme uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.scheme_members WHERE scheme_id = _scheme AND user_id = auth.uid() AND role IN ('Committee', 'Manager'))
      OR public.loty_manages(_scheme)
$$;
-- Older rules ask has_role(…, 'Committee'); staff count when they manage at least one building.
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
      OR EXISTS (SELECT 1 FROM public.scheme_members WHERE user_id = _user_id
                 AND (role = _role::text OR (_role::text = 'Committee' AND role = 'Manager')))
      OR (_role::text = 'Committee' AND EXISTS (SELECT 1 FROM public.loty_staff WHERE user_id = _user_id))
$$;

-- Who runs the building: Loty first when it manages it, then the committee.
DROP FUNCTION IF EXISTS public.committee_contacts(uuid);
CREATE FUNCTION public.committee_contacts(_scheme uuid)
RETURNS TABLE (name text, committee_role text, email text, phone text, company text, member_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT 'Loty'::text, 'Manager'::text, t.email, t.phone, NULL::text, NULL::uuid
  FROM public.schemes s CROSS JOIN public.loty_team t
  WHERE s.id = _scheme AND s.managed_by_loty AND public.is_member(_scheme)
  UNION ALL
  SELECT COALESCE(l.owner_name, p.display_name),
         CASE WHEN m.role = 'Manager' THEN 'Manager' ELSE cr.role END,
         COALESCE(l.owner_email, p.email), COALESCE(m.phone, l.owner_phone), m.company, m.id
  FROM public.scheme_members m
  LEFT JOIN public.profiles p ON p.id = m.user_id
  LEFT JOIN public.lots l ON l.owner_user_id = m.user_id AND l.scheme_id = m.scheme_id
  LEFT JOIN public.committee_roles cr ON cr.lot_id = l.id
  WHERE m.scheme_id = _scheme AND m.role IN ('Committee', 'Manager') AND public.is_member(_scheme)
$$;
GRANT EXECUTE ON FUNCTION public.committee_contacts(uuid) TO authenticated;

-- The portfolio: buildings the caller belongs to, plus every Loty-managed building for staff.
DROP FUNCTION IF EXISTS public.portfolio_summary();
CREATE FUNCTION public.portfolio_summary()
RETURNS TABLE (scheme_id uuid, name text, address text, role text, total_lots integer, cash numeric,
               levies_overdue integer, overdue_amount numeric, open_work_orders integer, approvals_waiting integer,
               next_agm date, agm_notice_sent boolean, next_renewal date, renewal_label text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT s.id, s.name, s.address,
    COALESCE((SELECT m.role FROM public.scheme_members m WHERE m.scheme_id = s.id AND m.user_id = auth.uid()), 'Loty'),
    s.total_lots,
    COALESCE((SELECT sum(CASE WHEN x.direction = 'in' THEN x.amount ELSE -x.amount END) FROM public.finance_transactions x
              WHERE x.scheme_id = s.id AND x.status = 'Paid' AND x.voided_at IS NULL AND NOT (x.direction = 'in' AND x.levy_id IS NOT NULL)), 0)
      + COALESCE((SELECT sum(v.amount) FROM public.levies v JOIN public.lots l ON l.id = v.lot_id WHERE l.scheme_id = s.id AND v.status = 'Paid'), 0),
    (SELECT count(*)::int FROM public.levies v JOIN public.lots l ON l.id = v.lot_id
       WHERE l.scheme_id = s.id AND v.status::text <> 'Paid' AND v.status::text <> 'Void' AND v.due_date < current_date),
    COALESCE((SELECT sum(v.amount) FROM public.levies v JOIN public.lots l ON l.id = v.lot_id
       WHERE l.scheme_id = s.id AND v.status::text <> 'Paid' AND v.status::text <> 'Void' AND v.due_date < current_date), 0),
    (SELECT count(*)::int FROM public.maintenance_requests w WHERE w.scheme_id = s.id AND w.closed_at IS NULL),
    (SELECT count(DISTINCT a.work_order_id)::int FROM public.work_order_approvals a
       JOIN public.maintenance_requests w ON w.id = a.work_order_id
       WHERE w.scheme_id = s.id AND w.closed_at IS NULL AND a.decision::text = 'Pending'),
    COALESCE((SELECT min(g.meeting_date)::date FROM public.agm_meetings g WHERE g.scheme_id = s.id AND g.meeting_date >= current_date), s.next_agm_date::date),
    (SELECT bool_or(g.notice_sent_at IS NOT NULL) FROM public.agm_meetings g WHERE g.scheme_id = s.id AND g.meeting_date >= current_date),
    (SELECT min(p.renewal_date)::date FROM public.insurance_policies p WHERE p.scheme_id = s.id AND p.renewal_date >= current_date),
    (SELECT p.policy_type::text FROM public.insurance_policies p WHERE p.scheme_id = s.id AND p.renewal_date >= current_date ORDER BY p.renewal_date LIMIT 1)
  FROM public.schemes s
  WHERE public.is_member(s.id)
  ORDER BY s.name
$$;
GRANT EXECUTE ON FUNCTION public.portfolio_summary() TO authenticated;

-- Staff only: every building on Loty, to choose which ones Loty manages.
CREATE OR REPLACE FUNCTION public.loty_all_buildings()
RETURNS TABLE (id uuid, name text, address text, total_lots integer, managed_by_loty boolean, managed_since timestamptz, members integer, created_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_loty_staff() THEN RAISE EXCEPTION 'Loty staff only'; END IF;
  RETURN QUERY SELECT s.id, s.name, s.address, s.total_lots, s.managed_by_loty, s.managed_since,
    (SELECT count(*)::int FROM public.scheme_members m WHERE m.scheme_id = s.id), s.created_at
  FROM public.schemes s ORDER BY s.name;
END $$;
GRANT EXECUTE ON FUNCTION public.loty_all_buildings() TO authenticated;

CREATE OR REPLACE FUNCTION public.loty_set_managed(_scheme uuid, _managed boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_loty_staff() THEN RAISE EXCEPTION 'Loty staff only'; END IF;
  UPDATE public.schemes SET managed_by_loty = _managed, managed_since = CASE WHEN _managed THEN COALESCE(managed_since, now()) ELSE NULL END
  WHERE id = _scheme;
END $$;
GRANT EXECUTE ON FUNCTION public.loty_set_managed(uuid, boolean) TO authenticated;

-- Committees can't switch Loty management on or off themselves.
CREATE OR REPLACE FUNCTION public.guard_managed_flag() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF (NEW.managed_by_loty IS DISTINCT FROM OLD.managed_by_loty OR NEW.managed_since IS DISTINCT FROM OLD.managed_since)
     AND auth.uid() IS NOT NULL AND NOT public.is_loty_staff() THEN
    RAISE EXCEPTION 'Only Loty can change who manages a building';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS guard_managed_flag ON public.schemes;
CREATE TRIGGER guard_managed_flag BEFORE UPDATE ON public.schemes FOR EACH ROW EXECUTE FUNCTION public.guard_managed_flag();
