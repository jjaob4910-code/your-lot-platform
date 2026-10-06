-- Buildings, membership and per-building access.
--
-- Until now every signed-in person could read every building, roles were app-wide and chosen
-- at sign-up, and the dashboard opened whichever building was created first. From here:
--   * scheme_members says who belongs to which building and as what (Committee or Owner).
--   * Whoever creates a building becomes its committee; everyone else joins by invite link
--     (scheme_invites) or, for owners, by signing up with the email on their lot.
--   * Every table is readable only by members of its building and writable only by that
--     building's committee, with the few owner actions (repairs, AGM suggestions, replies,
--     approval votes, personal dashboards) kept.
--   * Owners see only their own lot and levies; the ledger is committee-only. Owners get a
--     building summary through building_finance_summary() and committee contacts through
--     committee_contacts() instead.
-- Safe to run more than once.

-- ── Membership ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.scheme_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scheme_id uuid NOT NULL REFERENCES public.schemes(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('Committee', 'Owner')),
  lot_id uuid REFERENCES public.lots(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (scheme_id, user_id)
);
CREATE TABLE IF NOT EXISTS public.scheme_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scheme_id uuid NOT NULL REFERENCES public.schemes(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('Committee', 'Owner')),
  lot_id uuid REFERENCES public.lots(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now() + interval '30 days',
  used_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  used_at timestamptz
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.scheme_members, public.scheme_invites TO authenticated;
GRANT ALL ON public.scheme_members, public.scheme_invites TO service_role;
ALTER TABLE public.scheme_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scheme_invites ENABLE ROW LEVEL SECURITY;

-- ── Helpers (security definer so policies can call them without recursion) ────
CREATE OR REPLACE FUNCTION public.is_member(_scheme uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.scheme_members WHERE scheme_id = _scheme AND user_id = auth.uid())
$$;
CREATE OR REPLACE FUNCTION public.is_committee(_scheme uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.scheme_members WHERE scheme_id = _scheme AND user_id = auth.uid() AND role = 'Committee')
$$;
CREATE OR REPLACE FUNCTION public.scheme_of_lot(_id uuid) RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$ SELECT scheme_id FROM public.lots WHERE id = _id $$;
CREATE OR REPLACE FUNCTION public.scheme_of_budget(_id uuid) RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$ SELECT scheme_id FROM public.budgets WHERE id = _id $$;
CREATE OR REPLACE FUNCTION public.scheme_of_meeting(_id uuid) RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$ SELECT scheme_id FROM public.agm_meetings WHERE id = _id $$;
CREATE OR REPLACE FUNCTION public.scheme_of_work_order(_id uuid) RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$ SELECT scheme_id FROM public.maintenance_requests WHERE id = _id $$;
CREATE OR REPLACE FUNCTION public.scheme_of_claim(_id uuid) RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$ SELECT scheme_id FROM public.insurance_claims WHERE id = _id $$;
CREATE OR REPLACE FUNCTION public.scheme_of_levy(_id uuid) RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT l.scheme_id FROM public.levies v JOIN public.lots l ON l.id = v.lot_id WHERE v.id = _id
$$;
-- Can this person see this work order? Committee always; owners when it's common property or
-- touches a lot they own (the rule the app already used).
CREATE OR REPLACE FUNCTION public.can_see_work_order(_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.maintenance_requests m
    WHERE m.id = _id AND public.is_member(m.scheme_id) AND (
      public.is_committee(m.scheme_id) OR public.owns_lot(m.submitted_by_lot_id) OR cardinality(m.lot_ids) = 0
      OR EXISTS (SELECT 1 FROM unnest(m.lot_ids) l(id) WHERE public.owns_lot(l.id))))
$$;

-- Older functions (finance guard, levy reversal, recurring entries) ask has_role(...,'Committee').
-- Committee members added through invites should count too.
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
      OR EXISTS (SELECT 1 FROM public.scheme_members WHERE user_id = _user_id AND role = _role::text)
$$;

-- ── Backfill: everyone keeps access to the building that already exists ───────
INSERT INTO public.scheme_members (scheme_id, user_id, role)
SELECT s.id, r.user_id, r.role::text FROM public.user_roles r CROSS JOIN public.schemes s
ON CONFLICT (scheme_id, user_id) DO NOTHING;
UPDATE public.scheme_members m SET lot_id = l.id FROM public.lots l
WHERE l.owner_user_id = m.user_id AND l.scheme_id = m.scheme_id AND m.lot_id IS NULL;

-- ── Creating a building, invites and joining ──────────────────────────────────
CREATE OR REPLACE FUNCTION public.create_building(_name text, _address text, _total_lots integer)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in first'; END IF;
  INSERT INTO public.schemes (name, address, total_lots) VALUES (_name, _address, _total_lots) RETURNING id INTO _id;
  INSERT INTO public.scheme_members (scheme_id, user_id, role) VALUES (_id, auth.uid(), 'Committee');
  RETURN _id;
END $$;

CREATE OR REPLACE FUNCTION public.create_invite(_scheme uuid, _role text, _lot uuid DEFAULT NULL)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _token text := encode(extensions.gen_random_bytes(18), 'hex');
BEGIN
  IF NOT public.is_committee(_scheme) THEN RAISE EXCEPTION 'Only the committee can invite people'; END IF;
  IF _role NOT IN ('Committee', 'Owner') THEN RAISE EXCEPTION 'Unknown role'; END IF;
  IF _lot IS NOT NULL AND public.scheme_of_lot(_lot) IS DISTINCT FROM _scheme THEN RAISE EXCEPTION 'That lot is in another building'; END IF;
  INSERT INTO public.scheme_invites (scheme_id, role, lot_id, token, created_by) VALUES (_scheme, _role, _lot, _token, auth.uid());
  RETURN _token;
END $$;

-- Joins the building on the invite. Committee wins if someone is invited as both.
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
    SET role = CASE WHEN public.scheme_members.role = 'Committee' OR EXCLUDED.role = 'Committee' THEN 'Committee' ELSE 'Owner' END,
        lot_id = COALESCE(public.scheme_members.lot_id, EXCLUDED.lot_id);
  IF _inv.lot_id IS NOT NULL THEN
    UPDATE public.lots SET owner_user_id = _user WHERE id = _inv.lot_id AND owner_user_id IS NULL;
  END IF;
  UPDATE public.scheme_invites SET used_by = _user, used_at = now() WHERE id = _inv.id;
  RETURN _inv.scheme_id;
END $$;
CREATE OR REPLACE FUNCTION public.accept_invite(_token text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in first'; END IF;
  RETURN public.accept_invite_for(auth.uid(), _token);
END $$;

-- New accounts: no self-chosen roles. Owners are linked to lots carrying their email;
-- an invite token passed at sign-up is accepted straight away.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _lot record;
BEGIN
  INSERT INTO public.profiles (id, email, display_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)))
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'Owner') ON CONFLICT DO NOTHING;

  FOR _lot IN SELECT id, scheme_id FROM public.lots WHERE owner_user_id IS NULL AND lower(owner_email) = lower(NEW.email) LOOP
    UPDATE public.lots SET owner_user_id = NEW.id WHERE id = _lot.id;
    INSERT INTO public.scheme_members (scheme_id, user_id, role, lot_id) VALUES (_lot.scheme_id, NEW.id, 'Owner', _lot.id)
    ON CONFLICT (scheme_id, user_id) DO NOTHING;
  END LOOP;

  IF NEW.raw_user_meta_data ? 'invite' THEN
    BEGIN
      PERFORM public.accept_invite_for(NEW.id, NEW.raw_user_meta_data->>'invite');
    EXCEPTION WHEN OTHERS THEN NULL; -- a bad link shouldn't block sign-up; /join will explain
    END;
  END IF;
  RETURN NEW;
END $$;

-- Owners' view of their committee: names, positions and how to reach them.
CREATE OR REPLACE FUNCTION public.committee_contacts(_scheme uuid)
RETURNS TABLE (name text, committee_role text, email text, phone text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(l.owner_name, p.display_name), cr.role, COALESCE(l.owner_email, p.email), l.owner_phone
  FROM public.scheme_members m
  LEFT JOIN public.profiles p ON p.id = m.user_id
  LEFT JOIN public.lots l ON l.owner_user_id = m.user_id AND l.scheme_id = m.scheme_id
  LEFT JOIN public.committee_roles cr ON cr.lot_id = l.id
  WHERE m.scheme_id = _scheme AND m.role = 'Committee' AND public.is_member(_scheme)
$$;

-- Owners' view of the money: this year's budget, spending and balances by fund, and how much
-- of the year's levies has come in. No lot-by-lot detail and no ledger.
CREATE OR REPLACE FUNCTION public.building_finance_summary(_scheme uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _fy int := CASE WHEN extract(month FROM now()) >= 7 THEN extract(year FROM now())::int ELSE extract(year FROM now())::int - 1 END;
  _start date := make_date(_fy, 7, 1); _end date := make_date(_fy + 1, 6, 30);
  _budget public.budgets;
  _result jsonb;
BEGIN
  IF NOT public.is_member(_scheme) THEN RAISE EXCEPTION 'Not a member of this building'; END IF;
  SELECT * INTO _budget FROM public.budgets
  WHERE scheme_id = _scheme AND substring(financial_year FROM '\d{4}')::int = _fy ORDER BY created_at DESC LIMIT 1;

  SELECT jsonb_build_object(
    'financial_year', _fy,
    'budget_total', COALESCE(_budget.total_amount, 0),
    'funds', COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'id', f.id, 'name', f.name,
        'budget', COALESCE((SELECT t.total FROM public.budget_fund_totals t WHERE t.budget_id = _budget.id AND t.fund_id = f.id), 0),
        'spent', COALESCE((SELECT sum(x.amount) FROM public.finance_transactions x WHERE x.scheme_id = _scheme AND x.fund_id = f.id
                  AND x.direction = 'out' AND x.status = 'Paid' AND x.voided_at IS NULL AND x.occurred_on BETWEEN _start AND _end), 0),
        'balance',
          COALESCE((SELECT sum(x.amount) FROM public.finance_transactions x WHERE x.scheme_id = _scheme AND x.fund_id = f.id
                  AND x.direction = 'in' AND x.status = 'Paid' AND x.voided_at IS NULL AND x.levy_id IS NULL), 0)
        - COALESCE((SELECT sum(x.amount) FROM public.finance_transactions x WHERE x.scheme_id = _scheme AND x.fund_id = f.id
                  AND x.direction = 'out' AND x.status = 'Paid' AND x.voided_at IS NULL), 0)
        + COALESCE((SELECT sum(CASE WHEN v.fund_id IS NOT NULL THEN CASE WHEN v.fund_id = f.id THEN v.amount ELSE 0 END
                                    WHEN b.total_amount > 0 THEN v.amount * COALESCE(t.total, 0) / b.total_amount ELSE 0 END)
                  FROM public.levies v JOIN public.budgets b ON b.id = v.budget_id
                  LEFT JOIN public.budget_fund_totals t ON t.budget_id = b.id AND t.fund_id = f.id
                  WHERE b.scheme_id = _scheme AND v.status = 'Paid'), 0)
      ) ORDER BY f.sort_order) FROM public.budget_funds f WHERE f.scheme_id = _scheme), '[]'::jsonb),
    'levies_issued', COALESCE((SELECT sum(v.amount) FROM public.levies v WHERE v.budget_id = _budget.id AND v.status::text <> 'Void'), 0),
    'levies_paid', COALESCE((SELECT sum(v.amount) FROM public.levies v WHERE v.budget_id = _budget.id AND v.status = 'Paid'), 0)
  ) INTO _result;
  RETURN _result;
END $$;

REVOKE ALL ON FUNCTION public.accept_invite_for(uuid, text) FROM PUBLIC, anon, authenticated;
-- Policies call these as the signed-in user.
GRANT EXECUTE ON FUNCTION public.owns_lot(uuid), public.has_role(uuid, public.app_role), public.scheme_of_lot(uuid), public.scheme_of_budget(uuid),
  public.scheme_of_meeting(uuid), public.scheme_of_work_order(uuid), public.scheme_of_claim(uuid), public.scheme_of_levy(uuid),
  public.can_see_work_order(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_member(uuid), public.is_committee(uuid), public.create_building(text, text, integer),
  public.create_invite(uuid, text, uuid), public.accept_invite(text), public.committee_contacts(uuid),
  public.building_finance_summary(uuid) TO authenticated;

-- ── Access rules ──────────────────────────────────────────────────────────────
-- Drop every existing policy on the building tables, including the prototype's open access
-- for signed-out visitors, then add per-building rules.
DO $$
DECLARE p record;
BEGIN
  FOR p IN SELECT tablename, policyname FROM pg_policies WHERE schemaname = 'public' AND tablename IN (
    'action_drafts','agm_item_attachments','agm_meetings','agm_suggestions','budget_fund_totals','budget_funds','budget_line_items',
    'budget_revisions','budgets','calendar_events','committee_roles','compliance_tasks','compliance_widgets','contractors',
    'dashboard_widgets','document_folders','documents','finance_transaction_history','finance_transactions','financial_years',
    'insurance_claim_updates','insurance_claims','insurance_policies','levies','levy_payment_reversals','lots','maintenance_requests',
    'notice_comments','notices','recurring_transactions','scheme_settings','schemes','work_order_approvals','work_order_photos',
    'work_order_quotes','work_order_steps','work_order_updates','scheme_members','scheme_invites')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', p.policyname, p.tablename);
  END LOOP;
END $$;

-- Members read, committee writes.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['agm_meetings','budget_funds','budget_line_items','budget_revisions','budgets','calendar_events',
    'compliance_tasks','compliance_widgets','contractors','document_folders','financial_years','insurance_claims',
    'insurance_policies','scheme_settings'] LOOP
    EXECUTE format('CREATE POLICY member_read ON public.%I FOR SELECT TO authenticated USING (public.is_member(scheme_id))', t);
    EXECUTE format('CREATE POLICY committee_write ON public.%I FOR ALL TO authenticated USING (public.is_committee(scheme_id)) WITH CHECK (public.is_committee(scheme_id))', t);
  END LOOP;
  -- Committee only: the ledger, its history, recurring entries and drafts.
  FOREACH t IN ARRAY ARRAY['finance_transactions','finance_transaction_history','recurring_transactions','action_drafts'] LOOP
    EXECUTE format('CREATE POLICY committee_all ON public.%I FOR ALL TO authenticated USING (public.is_committee(scheme_id)) WITH CHECK (public.is_committee(scheme_id))', t);
  END LOOP;
END $$;

-- Buildings
CREATE POLICY member_read ON public.schemes FOR SELECT TO authenticated USING (public.is_member(id));
CREATE POLICY committee_update ON public.schemes FOR UPDATE TO authenticated USING (public.is_committee(id)) WITH CHECK (public.is_committee(id));
-- Membership and invites
CREATE POLICY member_read ON public.scheme_members FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.is_committee(scheme_id));
CREATE POLICY committee_write ON public.scheme_members FOR ALL TO authenticated USING (public.is_committee(scheme_id)) WITH CHECK (public.is_committee(scheme_id));
CREATE POLICY committee_all ON public.scheme_invites FOR ALL TO authenticated USING (public.is_committee(scheme_id)) WITH CHECK (public.is_committee(scheme_id));
-- Lots: owners see only their own
CREATE POLICY lot_read ON public.lots FOR SELECT TO authenticated USING (public.is_committee(scheme_id) OR owner_user_id = auth.uid());
CREATE POLICY committee_write ON public.lots FOR ALL TO authenticated USING (public.is_committee(scheme_id)) WITH CHECK (public.is_committee(scheme_id));
CREATE POLICY committee_read ON public.committee_roles FOR SELECT TO authenticated USING (public.is_member(public.scheme_of_lot(lot_id)));
CREATE POLICY committee_write ON public.committee_roles FOR ALL TO authenticated USING (public.is_committee(public.scheme_of_lot(lot_id))) WITH CHECK (public.is_committee(public.scheme_of_lot(lot_id)));
-- Levies: owners see only their own
CREATE POLICY levy_read ON public.levies FOR SELECT TO authenticated USING (public.is_committee(public.scheme_of_lot(lot_id)) OR public.owns_lot(lot_id));
CREATE POLICY committee_write ON public.levies FOR ALL TO authenticated USING (public.is_committee(public.scheme_of_lot(lot_id))) WITH CHECK (public.is_committee(public.scheme_of_lot(lot_id)));
CREATE POLICY committee_read ON public.levy_payment_reversals FOR SELECT TO authenticated USING (public.is_committee(public.scheme_of_levy(levy_id)));
CREATE POLICY member_read ON public.budget_fund_totals FOR SELECT TO authenticated USING (public.is_member(public.scheme_of_budget(budget_id)));
CREATE POLICY committee_write ON public.budget_fund_totals FOR ALL TO authenticated USING (public.is_committee(public.scheme_of_budget(budget_id))) WITH CHECK (public.is_committee(public.scheme_of_budget(budget_id)));
-- Documents: owners see what's shared with them
CREATE POLICY doc_read ON public.documents FOR SELECT TO authenticated USING (public.is_committee(scheme_id) OR (public.is_member(scheme_id) AND shared_with_owners));
CREATE POLICY committee_write ON public.documents FOR ALL TO authenticated USING (public.is_committee(scheme_id)) WITH CHECK (public.is_committee(scheme_id));
-- Notices: lot-targeted ones only for that lot; anyone in the building may reply
CREATE POLICY notice_read ON public.notices FOR SELECT TO authenticated USING (public.is_committee(scheme_id) OR (public.is_member(scheme_id) AND (lot_id IS NULL OR public.owns_lot(lot_id))));
CREATE POLICY committee_write ON public.notices FOR ALL TO authenticated USING (public.is_committee(scheme_id)) WITH CHECK (public.is_committee(scheme_id));
CREATE POLICY member_read ON public.notice_comments FOR SELECT TO authenticated USING (public.is_member(scheme_id));
CREATE POLICY member_reply ON public.notice_comments FOR INSERT TO authenticated WITH CHECK (public.is_member(scheme_id));
CREATE POLICY committee_manage ON public.notice_comments FOR UPDATE TO authenticated USING (public.is_committee(scheme_id)) WITH CHECK (public.is_committee(scheme_id));
CREATE POLICY committee_delete ON public.notice_comments FOR DELETE TO authenticated USING (public.is_committee(scheme_id));
-- Dashboards: the shared default plus each person's own
CREATE POLICY widget_read ON public.dashboard_widgets FOR SELECT TO authenticated USING (public.is_member(scheme_id) AND (user_id IS NULL OR user_id = auth.uid()));
CREATE POLICY widget_own ON public.dashboard_widgets FOR ALL TO authenticated USING (user_id = auth.uid() AND public.is_member(scheme_id)) WITH CHECK (user_id = auth.uid() AND public.is_member(scheme_id));
CREATE POLICY widget_defaults ON public.dashboard_widgets FOR ALL TO authenticated USING (user_id IS NULL AND public.is_committee(scheme_id)) WITH CHECK (user_id IS NULL AND public.is_committee(scheme_id));
-- AGM
CREATE POLICY member_read ON public.agm_item_attachments FOR SELECT TO authenticated USING (public.is_member(public.scheme_of_meeting(meeting_id)));
CREATE POLICY committee_write ON public.agm_item_attachments FOR ALL TO authenticated USING (public.is_committee(public.scheme_of_meeting(meeting_id))) WITH CHECK (public.is_committee(public.scheme_of_meeting(meeting_id)));
CREATE POLICY member_read ON public.agm_suggestions FOR SELECT TO authenticated USING (public.is_member(public.scheme_of_meeting(meeting_id)));
CREATE POLICY owner_suggest ON public.agm_suggestions FOR INSERT TO authenticated WITH CHECK (status = 'Pending' AND (public.is_committee(public.scheme_of_meeting(meeting_id)) OR (lot_id IS NOT NULL AND public.owns_lot(lot_id) AND public.is_member(public.scheme_of_meeting(meeting_id)))));
CREATE POLICY committee_update ON public.agm_suggestions FOR UPDATE TO authenticated USING (public.is_committee(public.scheme_of_meeting(meeting_id))) WITH CHECK (public.is_committee(public.scheme_of_meeting(meeting_id)));
CREATE POLICY committee_delete ON public.agm_suggestions FOR DELETE TO authenticated USING (public.is_committee(public.scheme_of_meeting(meeting_id)));
-- Insurance claim timeline
CREATE POLICY member_read ON public.insurance_claim_updates FOR SELECT TO authenticated USING (public.is_member(public.scheme_of_claim(claim_id)));
CREATE POLICY committee_write ON public.insurance_claim_updates FOR ALL TO authenticated USING (public.is_committee(public.scheme_of_claim(claim_id))) WITH CHECK (public.is_committee(public.scheme_of_claim(claim_id)));
-- Work orders: owners see common-property jobs and their own; owners may log a repair for their lot
CREATE POLICY wo_read ON public.maintenance_requests FOR SELECT TO authenticated USING (public.can_see_work_order(id));
CREATE POLICY wo_log ON public.maintenance_requests FOR INSERT TO authenticated WITH CHECK (public.is_committee(scheme_id) OR (public.is_member(scheme_id) AND public.owns_lot(submitted_by_lot_id)));
CREATE POLICY committee_update ON public.maintenance_requests FOR UPDATE TO authenticated USING (public.is_committee(scheme_id)) WITH CHECK (public.is_committee(scheme_id));
CREATE POLICY committee_delete ON public.maintenance_requests FOR DELETE TO authenticated USING (public.is_committee(scheme_id));
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['work_order_steps','work_order_quotes','work_order_updates','work_order_photos','work_order_approvals'] LOOP
    EXECUTE format('CREATE POLICY wo_read ON public.%I FOR SELECT TO authenticated USING (public.can_see_work_order(work_order_id))', t);
    EXECUTE format('CREATE POLICY committee_write ON public.%I FOR ALL TO authenticated USING (public.is_committee(public.scheme_of_work_order(work_order_id))) WITH CHECK (public.is_committee(public.scheme_of_work_order(work_order_id)))', t);
  END LOOP;
END $$;
-- Owners cast their own approval vote
CREATE POLICY owner_vote ON public.work_order_approvals FOR UPDATE TO authenticated USING (public.owns_lot(lot_id)) WITH CHECK (public.owns_lot(lot_id));
-- Owners can post an update on a job they can see (e.g. "the leak is back")
CREATE POLICY owner_update_note ON public.work_order_updates FOR INSERT TO authenticated WITH CHECK (public.can_see_work_order(work_order_id));

-- Signed-out visitors no longer get any access to building tables.
DO $$
DECLARE t text;
BEGIN
  FOR t IN SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
           WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname NOT IN ('profiles','user_roles','user_preferences','notification_reads') LOOP
    EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);
  END LOOP;
END $$;
