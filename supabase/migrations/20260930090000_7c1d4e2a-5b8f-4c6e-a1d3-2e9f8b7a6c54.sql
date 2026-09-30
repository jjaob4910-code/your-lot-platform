-- Protect finance transactions: paid entries are locked to the Treasurer (or any
-- committee member when no Treasurer is set), can't be deleted, only voided, and
-- every change to any transaction is written to an append-only history by the
-- database itself so nothing can skip it.
ALTER TABLE public.finance_transactions
  ADD COLUMN voided_at timestamptz,
  ADD COLUMN voided_by uuid,
  ADD COLUMN void_reason text,
  ADD COLUMN change_reason text; -- set by the app alongside an edit; copied into history, then cleared

CREATE TABLE public.finance_transaction_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id uuid NOT NULL, -- no FK: history outlives a deleted planned entry
  scheme_id uuid NOT NULL,
  action text NOT NULL CHECK (action IN ('created','edited','voided','deleted')),
  changes jsonb NOT NULL DEFAULT '{}'::jsonb,
  reason text,
  actor_user_id uuid,
  actor_label text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX finance_transaction_history_tx_idx ON public.finance_transaction_history (transaction_id, created_at);
GRANT SELECT ON public.finance_transaction_history TO authenticated, anon;
GRANT ALL ON public.finance_transaction_history TO service_role;
ALTER TABLE public.finance_transaction_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY finance_history_select ON public.finance_transaction_history FOR SELECT TO authenticated, anon USING (true);

CREATE OR REPLACE FUNCTION public.scheme_has_treasurer(_scheme uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM committee_roles cr JOIN lots l ON l.id = cr.lot_id
                 WHERE l.scheme_id = _scheme AND cr.role = 'Treasurer');
$$;

CREATE OR REPLACE FUNCTION public.can_manage_paid_finance(_user uuid, _scheme uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _user IS NOT NULL AND (
    EXISTS (SELECT 1 FROM committee_roles cr JOIN lots l ON l.id = cr.lot_id
            WHERE l.scheme_id = _scheme AND cr.role = 'Treasurer' AND l.owner_user_id = _user)
    OR (NOT public.scheme_has_treasurer(_scheme) AND public.has_role(_user, 'Committee'))
  );
$$;
GRANT EXECUTE ON FUNCTION public.scheme_has_treasurer(uuid), public.can_manage_paid_finance(uuid, uuid) TO authenticated, anon;

CREATE OR REPLACE FUNCTION public.finance_actor_label(_user uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, auth AS $$
  SELECT COALESCE(
    (SELECT owner_name FROM lots WHERE owner_user_id = _user AND owner_name IS NOT NULL LIMIT 1),
    (SELECT email FROM auth.users WHERE id = _user),
    'System');
$$;

CREATE OR REPLACE FUNCTION public.finance_transaction_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  uid uuid := auth.uid();
  -- Service role or the SQL editor (no signed-in user, not the anon key).
  is_admin boolean := uid IS NULL AND COALESCE(auth.role(), '') <> 'anon';
  tracked text[] := ARRAY['direction','fund_id','category','description','supplier','amount','occurred_on','status','notes','budget_line_item_id','work_order_id','levy_id','insurance_claim_id'];
  money_fields text[] := ARRAY['direction','fund_id','category','description','supplier','amount','occurred_on','status','notes','budget_line_item_id'];
  o jsonb; n jsonb; diff jsonb := '{}'::jsonb; f text; money_changed boolean := false; act text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO finance_transaction_history (transaction_id, scheme_id, action, changes, reason, actor_user_id, actor_label)
    VALUES (NEW.id, NEW.scheme_id, 'created',
            jsonb_build_object('amount', NEW.amount, 'status', NEW.status, 'direction', NEW.direction, 'description', NEW.description),
            NEW.change_reason, uid, finance_actor_label(uid));
    NEW.change_reason := NULL;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    -- A scheme being deleted takes its ledger with it.
    IF NOT EXISTS (SELECT 1 FROM schemes WHERE id = OLD.scheme_id) THEN RETURN OLD; END IF;
    IF OLD.status = 'Paid' AND NOT is_admin THEN
      RAISE EXCEPTION 'Paid transactions can''t be deleted. Void it instead.' USING ERRCODE = 'P0001';
    END IF;
    INSERT INTO finance_transaction_history (transaction_id, scheme_id, action, changes, actor_user_id, actor_label)
    VALUES (OLD.id, OLD.scheme_id, 'deleted',
            jsonb_build_object('amount', OLD.amount, 'status', OLD.status, 'description', OLD.description), uid, finance_actor_label(uid));
    RETURN OLD;
  END IF;

  -- UPDATE
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

  -- Paid entries: only the Treasurer (or committee when none is set), and always with a reason.
  -- Link columns cleared by a deleted work order, levy or claim pass through (and are still logged).
  IF OLD.status = 'Paid' AND money_changed AND NOT is_admin THEN
    IF NOT can_manage_paid_finance(uid, OLD.scheme_id) THEN
      RAISE EXCEPTION 'Only the Treasurer can change a paid transaction.' USING ERRCODE = 'P0001';
    END IF;
    IF act = 'voided' THEN
      IF COALESCE(btrim(NEW.void_reason), '') = '' THEN RAISE EXCEPTION 'Give a reason for voiding this transaction.' USING ERRCODE = 'P0001'; END IF;
    ELSIF COALESCE(btrim(NEW.change_reason), '') = '' THEN
      RAISE EXCEPTION 'Give a reason for changing a paid transaction.' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  IF act = 'voided' THEN NEW.voided_by := uid; END IF;
  INSERT INTO finance_transaction_history (transaction_id, scheme_id, action, changes, reason, actor_user_id, actor_label)
  VALUES (NEW.id, NEW.scheme_id, act, diff, CASE WHEN act = 'voided' THEN NEW.void_reason ELSE NEW.change_reason END, uid, finance_actor_label(uid));
  NEW.change_reason := NULL;
  RETURN NEW;
END;
$$;

CREATE TRIGGER finance_transactions_guard_ins BEFORE INSERT ON public.finance_transactions
  FOR EACH ROW EXECUTE FUNCTION public.finance_transaction_guard();
CREATE TRIGGER finance_transactions_guard_upd BEFORE UPDATE ON public.finance_transactions
  FOR EACH ROW EXECUTE FUNCTION public.finance_transaction_guard();
CREATE TRIGGER finance_transactions_guard_del BEFORE DELETE ON public.finance_transactions
  FOR EACH ROW EXECUTE FUNCTION public.finance_transaction_guard();
