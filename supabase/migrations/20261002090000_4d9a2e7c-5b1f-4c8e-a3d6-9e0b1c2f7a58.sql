-- Finance RFI: reverse a levy payment (audited), user-chosen financial years, and
-- assigning a paid cost to a budget line without needing the Treasurer.

CREATE OR REPLACE FUNCTION public.finance_transaction_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  uid uuid := auth.uid();
  is_admin boolean := uid IS NULL AND COALESCE(auth.role(), '') <> 'anon';
  in_grace boolean := false;
  tracked text[] := ARRAY['direction','fund_id','category','description','supplier','amount','occurred_on','status','notes','budget_line_item_id','work_order_id','levy_id','insurance_claim_id'];
  -- Linking a cost to a budget line (like linking a work order) isn't a money change.
  money_fields text[] := ARRAY['direction','fund_id','category','description','supplier','amount','occurred_on','status','notes'];
  o jsonb; n jsonb; diff jsonb := '{}'::jsonb; f text; money_changed boolean := false; act text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.created_by := COALESCE(NEW.created_by, uid);
    INSERT INTO finance_transaction_history (transaction_id, scheme_id, action, changes, reason, actor_user_id, actor_label)
    VALUES (NEW.id, NEW.scheme_id, 'created',
            jsonb_build_object('amount', NEW.amount, 'status', NEW.status, 'direction', NEW.direction, 'description', NEW.description),
            NEW.change_reason, uid, finance_actor_label(uid));
    NEW.change_reason := NULL;
    RETURN NEW;
  END IF;

  -- The person who recorded it gets 24 hours to fix their own mistakes.
  in_grace := uid IS NOT NULL AND OLD.created_by = uid AND OLD.created_at > now() - interval '24 hours';

  IF TG_OP = 'DELETE' THEN
    IF NOT EXISTS (SELECT 1 FROM schemes WHERE id = OLD.scheme_id) THEN RETURN OLD; END IF;
    IF OLD.status = 'Paid' AND NOT is_admin AND NOT in_grace THEN
      RAISE EXCEPTION 'Paid transactions can''t be deleted after 24 hours. Void it instead.' USING ERRCODE = 'P0001';
    END IF;
    INSERT INTO finance_transaction_history (transaction_id, scheme_id, action, changes, actor_user_id, actor_label)
    VALUES (OLD.id, OLD.scheme_id, 'deleted',
            jsonb_build_object('amount', OLD.amount, 'status', OLD.status, 'description', OLD.description), uid, finance_actor_label(uid));
    RETURN OLD;
  END IF;

  NEW.created_by := OLD.created_by; -- never reassigned
  o := to_jsonb(OLD); n := to_jsonb(NEW);
  FOREACH f IN ARRAY tracked LOOP
    IF o->f IS DISTINCT FROM n->f THEN
      diff := diff || jsonb_build_object(f, jsonb_build_object('from', o->f, 'to', n->f));
      IF f = ANY(money_fields) THEN money_changed := true; END IF;
    END IF;
  END LOOP;
  IF OLD.voided_at IS NULL AND NEW.voided_at IS NOT NULL THEN act := 'voided'; money_changed := true;
  ELSIF OLD.voided_at IS NOT NULL AND NEW.voided_at IS NULL THEN
    RAISE EXCEPTION 'A voided transaction can''t be restored. Add a new one instead.' USING ERRCODE = 'P0001';
  ELSIF OLD.voided_at IS NOT NULL AND money_changed THEN
    RAISE EXCEPTION 'A voided transaction can''t be edited.' USING ERRCODE = 'P0001';
  ELSE act := 'edited';
  END IF;

  IF diff = '{}'::jsonb AND act = 'edited' THEN NEW.change_reason := NULL; RETURN NEW; END IF;

  IF OLD.status = 'Paid' AND money_changed AND NOT is_admin AND NOT in_grace THEN
    IF NOT can_manage_paid_finance(uid, OLD.scheme_id) THEN
      RAISE EXCEPTION 'Only the Treasurer can change a paid transaction after 24 hours.' USING ERRCODE = 'P0001';
    END IF;
    IF act = 'voided' THEN
      IF COALESCE(btrim(NEW.void_reason), '') = '' THEN RAISE EXCEPTION 'Give a reason for voiding this transaction.' USING ERRCODE = 'P0001'; END IF;
    ELSIF COALESCE(btrim(NEW.change_reason), '') = '' THEN
      RAISE EXCEPTION 'Give a reason for changing a paid transaction.' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  IF act = 'voided' THEN NEW.voided_by := uid; END IF;
  INSERT INTO finance_transaction_history (transaction_id, scheme_id, action, changes, reason, actor_user_id, actor_label)
  VALUES (NEW.id, NEW.scheme_id, act, diff,
          COALESCE(CASE WHEN act = 'voided' THEN NEW.void_reason ELSE NEW.change_reason END, CASE WHEN in_grace THEN 'Corrected within 24 hours' END),
          uid, finance_actor_label(uid));
  NEW.change_reason := NULL;
  RETURN NEW;
END;
$$;


CREATE TABLE public.levy_payment_reversals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  levy_id uuid NOT NULL REFERENCES public.levies(id) ON DELETE CASCADE,
  reason text NOT NULL,
  previous_paid_at timestamptz,
  actor_user_id uuid,
  actor_label text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.levy_payment_reversals TO authenticated, anon;
GRANT ALL ON public.levy_payment_reversals TO service_role;
ALTER TABLE public.levy_payment_reversals ENABLE ROW LEVEL SECURITY;
CREATE POLICY levy_reversals_select ON public.levy_payment_reversals FOR SELECT TO authenticated, anon USING (true);

-- Puts a paid levy back to unpaid and voids the income it recorded (kept, crossed out).
CREATE OR REPLACE FUNCTION public.reverse_levy_payment(_levy uuid, _reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); l record; sch uuid; own_recent boolean;
BEGIN
  IF COALESCE(btrim(_reason), '') = '' THEN RAISE EXCEPTION 'Give a reason for reversing this payment.' USING ERRCODE = 'P0001'; END IF;
  SELECT lv.*, b.scheme_id AS sid INTO l FROM levies lv JOIN budgets b ON b.id = lv.budget_id WHERE lv.id = _levy;
  IF NOT FOUND THEN RAISE EXCEPTION 'Levy not found.' USING ERRCODE = 'P0001'; END IF;
  IF l.status <> 'Paid' THEN RAISE EXCEPTION 'This levy isn''t marked paid.' USING ERRCODE = 'P0001'; END IF;
  sch := l.sid;
  own_recent := EXISTS (SELECT 1 FROM finance_transactions WHERE levy_id = _levy AND created_by = uid AND created_at > now() - interval '24 hours');
  IF uid IS NULL OR NOT (can_manage_paid_finance(uid, sch) OR own_recent) THEN
    RAISE EXCEPTION 'Only the Treasurer can reverse a levy payment.' USING ERRCODE = 'P0001';
  END IF;
  INSERT INTO levy_payment_reversals (levy_id, reason, previous_paid_at, actor_user_id, actor_label)
  VALUES (_levy, btrim(_reason), l.paid_at, uid, finance_actor_label(uid));
  UPDATE finance_transactions SET voided_at = now(), void_reason = 'Levy payment reversed: ' || btrim(_reason)
    WHERE levy_id = _levy AND voided_at IS NULL;
  UPDATE levies SET status = 'Pending', paid_at = NULL WHERE id = _levy;
END;
$$;
GRANT EXECUTE ON FUNCTION public.reverse_levy_payment(uuid, text) TO authenticated;

CREATE TABLE public.financial_years (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scheme_id uuid NOT NULL REFERENCES public.schemes(id) ON DELETE CASCADE,
  start_year integer NOT NULL CHECK (start_year BETWEEN 1990 AND 2100),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (scheme_id, start_year)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.financial_years TO authenticated, anon;
GRANT ALL ON public.financial_years TO service_role;
ALTER TABLE public.financial_years ENABLE ROW LEVEL SECURITY;
CREATE POLICY prototype_open_access ON public.financial_years FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY financial_years_select ON public.financial_years FOR SELECT TO authenticated USING (true);
CREATE POLICY financial_years_write ON public.financial_years FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'Committee')) WITH CHECK (public.has_role(auth.uid(), 'Committee'));
