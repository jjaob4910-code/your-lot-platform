-- Room for genuine mistakes: whoever recorded a transaction can edit or delete it
-- freely for 24 hours (still logged in its history). After that, paid entries lock
-- to the Treasurer as before. Budgets can be deleted until any of their levies is paid.
ALTER TABLE public.finance_transactions ADD COLUMN created_by uuid DEFAULT auth.uid();

CREATE OR REPLACE FUNCTION public.finance_transaction_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  uid uuid := auth.uid();
  is_admin boolean := uid IS NULL AND COALESCE(auth.role(), '') <> 'anon';
  in_grace boolean := false;
  tracked text[] := ARRAY['direction','fund_id','category','description','supplier','amount','occurred_on','status','notes','budget_line_item_id','work_order_id','levy_id','insurance_claim_id'];
  money_fields text[] := ARRAY['direction','fund_id','category','description','supplier','amount','occurred_on','status','notes','budget_line_item_id'];
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

-- A budget can be deleted (taking its unpaid levies with it) until any levy is paid.
CREATE OR REPLACE FUNCTION public.budget_delete_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM schemes WHERE id = OLD.scheme_id) THEN RETURN OLD; END IF;
  -- Service role / SQL editor (no signed-in user, not the anon key) may clean up.
  IF auth.uid() IS NULL AND COALESCE(auth.role(), '') <> 'anon' THEN RETURN OLD; END IF;
  IF EXISTS (SELECT 1 FROM levies WHERE budget_id = OLD.id AND status = 'Paid') THEN
    RAISE EXCEPTION 'This budget has paid levies, so it can''t be deleted. Edit it instead.' USING ERRCODE = 'P0001';
  END IF;
  RETURN OLD;
END;
$$;
CREATE TRIGGER budgets_delete_guard BEFORE DELETE ON public.budgets
  FOR EACH ROW EXECUTE FUNCTION public.budget_delete_guard();
