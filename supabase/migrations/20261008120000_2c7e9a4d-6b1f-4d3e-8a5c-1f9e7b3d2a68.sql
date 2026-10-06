-- Roles, owner visibility and a manager's portfolio.
--
-- 1. A third role, Manager: someone the committee appoints to run the building day to day.
--    They need not own a lot, can do everything the committee can, and can look after many buildings.
-- 2. Every owner can read the building's records (the ledger and every work order), while only the
--    committee and manager change them. Other owners' contact details and levy accounts stay private.
-- 3. portfolio_summary(): one row per building the caller belongs to, for the "My buildings" page.
-- Safe to run more than once.

-- ── Manager role ──────────────────────────────────────────────────────────────
ALTER TABLE public.scheme_members DROP CONSTRAINT IF EXISTS scheme_members_role_check;
ALTER TABLE public.scheme_members ADD CONSTRAINT scheme_members_role_check CHECK (role IN ('Committee', 'Owner', 'Manager'));
ALTER TABLE public.scheme_invites DROP CONSTRAINT IF EXISTS scheme_invites_role_check;
ALTER TABLE public.scheme_invites ADD CONSTRAINT scheme_invites_role_check CHECK (role IN ('Committee', 'Owner', 'Manager'));
-- How owners reach a manager: shown on "Who runs this building".
ALTER TABLE public.scheme_members ADD COLUMN IF NOT EXISTS company text;
ALTER TABLE public.scheme_members ADD COLUMN IF NOT EXISTS phone text;

-- A manager can do whatever the committee can.
CREATE OR REPLACE FUNCTION public.is_committee(_scheme uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.scheme_members WHERE scheme_id = _scheme AND user_id = auth.uid() AND role IN ('Committee', 'Manager'))
$$;
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
      OR EXISTS (SELECT 1 FROM public.scheme_members WHERE user_id = _user_id
                 AND (role = _role::text OR (_role::text = 'Committee' AND role = 'Manager')))
$$;

CREATE OR REPLACE FUNCTION public.create_invite(_scheme uuid, _role text, _lot uuid DEFAULT NULL)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _token text := encode(extensions.gen_random_bytes(18), 'hex');
BEGIN
  IF NOT public.is_committee(_scheme) THEN RAISE EXCEPTION 'Only the committee can invite people'; END IF;
  IF _role NOT IN ('Committee', 'Owner', 'Manager') THEN RAISE EXCEPTION 'Unknown role'; END IF;
  IF _role = 'Manager' THEN _lot := NULL; END IF;
  IF _lot IS NOT NULL AND public.scheme_of_lot(_lot) IS DISTINCT FROM _scheme THEN RAISE EXCEPTION 'That lot is in another building'; END IF;
  INSERT INTO public.scheme_invites (scheme_id, role, lot_id, token, created_by) VALUES (_scheme, _role, _lot, _token, auth.uid());
  RETURN _token;
END $$;

-- Joins the building on the invite, keeping the strongest role: Manager, then Committee, then Owner.
CREATE OR REPLACE FUNCTION public.accept_invite_for(_user uuid, _token text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _inv public.scheme_invites;
BEGIN
  SELECT * INTO _inv FROM public.scheme_invites WHERE token = _token FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'This invite link is not valid'; END IF;
  IF _inv.used_by IS NOT NULL AND _inv.used_by <> _user THEN RAISE EXCEPTION 'This invite link has already been used'; END IF;
  IF _inv.expires_at < now() THEN RAISE EXCEPTION 'This invite link has expired. Ask your committee for a new one'; END IF;
  INSERT INTO public.scheme_members (scheme_id, user_id, role, lot_id) VALUES (_inv.scheme_id, _user, _inv.role, _inv.lot_id)
  ON CONFLICT (scheme_id, user_id) DO UPDATE
    SET role = CASE WHEN 'Manager' IN (public.scheme_members.role, EXCLUDED.role) THEN 'Manager'
                    WHEN 'Committee' IN (public.scheme_members.role, EXCLUDED.role) THEN 'Committee' ELSE 'Owner' END,
        lot_id = COALESCE(public.scheme_members.lot_id, EXCLUDED.lot_id);
  IF _inv.lot_id IS NOT NULL THEN
    UPDATE public.lots SET owner_user_id = _user WHERE id = _inv.lot_id AND owner_user_id IS NULL;
  END IF;
  UPDATE public.scheme_invites SET used_by = _user, used_at = now() WHERE id = _inv.id;
  RETURN _inv.scheme_id;
END $$;

-- Who runs the building: the manager(s) and committee, with positions and contact details.
DROP FUNCTION IF EXISTS public.committee_contacts(uuid);
CREATE FUNCTION public.committee_contacts(_scheme uuid)
RETURNS TABLE (name text, committee_role text, email text, phone text, company text, member_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
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

-- ── Owners see the building's records ─────────────────────────────────────────
-- Every lot, without the owners' email and phone.
CREATE OR REPLACE FUNCTION public.building_lots(_scheme uuid)
RETURNS TABLE (id uuid, lot_number integer, owner_name text, entitlement_percent numeric, occupancy text, is_mine boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT l.id, l.lot_number, l.owner_name, l.entitlement_percent::numeric, l.occupied_status::text, l.owner_user_id = auth.uid()
  FROM public.lots l WHERE l.scheme_id = _scheme AND public.is_member(_scheme) ORDER BY l.lot_number
$$;
GRANT EXECUTE ON FUNCTION public.building_lots(uuid) TO authenticated;

-- The ledger: owners can read it; only the committee and manager write.
DROP POLICY IF EXISTS committee_all ON public.finance_transactions;
DROP POLICY IF EXISTS member_read ON public.finance_transactions;
DROP POLICY IF EXISTS committee_write ON public.finance_transactions;
CREATE POLICY member_read ON public.finance_transactions FOR SELECT TO authenticated USING (public.is_member(scheme_id));
CREATE POLICY committee_write ON public.finance_transactions FOR ALL TO authenticated USING (public.is_committee(scheme_id)) WITH CHECK (public.is_committee(scheme_id));

-- Every work order in the building.
CREATE OR REPLACE FUNCTION public.can_see_work_order(_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.maintenance_requests m WHERE m.id = _id AND public.is_member(m.scheme_id))
$$;

-- New files are shared with owners unless the committee keeps them back.
ALTER TABLE public.documents ALTER COLUMN shared_with_owners SET DEFAULT true;

-- ── Portfolio ─────────────────────────────────────────────────────────────────
-- One row per building the caller belongs to, with what needs attention.
CREATE OR REPLACE FUNCTION public.portfolio_summary()
RETURNS TABLE (scheme_id uuid, name text, address text, role text, total_lots integer, cash numeric,
               levies_overdue integer, overdue_amount numeric, open_work_orders integer, approvals_waiting integer,
               next_agm date, agm_notice_sent boolean, next_renewal date, renewal_label text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT s.id, s.name, s.address, m.role, s.total_lots,
    -- Same basis as building_finance_summary: receipts other than levies, less payments, plus levies paid.
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
  FROM public.scheme_members m JOIN public.schemes s ON s.id = m.scheme_id
  WHERE m.user_id = auth.uid()
  ORDER BY s.name
$$;
GRANT EXECUTE ON FUNCTION public.portfolio_summary() TO authenticated;
