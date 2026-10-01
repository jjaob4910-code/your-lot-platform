-- Recurring transactions: a rule that drops a Scheduled (Approved) entry into the
-- ledger on each due date. Someone still confirms it with Mark paid.
CREATE TABLE public.recurring_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scheme_id uuid NOT NULL REFERENCES public.schemes(id) ON DELETE CASCADE,
  direction text NOT NULL CHECK (direction IN ('in','out')),
  fund_id uuid NOT NULL REFERENCES public.budget_funds(id) ON DELETE CASCADE,
  category text,
  description text NOT NULL,
  supplier text,
  amount numeric(12,2) NOT NULL CHECK (amount > 0),
  budget_line_item_id uuid REFERENCES public.budget_line_items(id) ON DELETE SET NULL,
  frequency text NOT NULL CHECK (frequency IN ('Weekly','Fortnightly','Monthly','Quarterly','Annually')),
  next_date date NOT NULL,
  end_date date,
  active boolean NOT NULL DEFAULT true,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.finance_transactions ADD COLUMN recurring_id uuid REFERENCES public.recurring_transactions(id) ON DELETE SET NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.recurring_transactions TO authenticated, anon;
GRANT ALL ON public.recurring_transactions TO service_role;
ALTER TABLE public.recurring_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY prototype_open_access ON public.recurring_transactions FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY recurring_select ON public.recurring_transactions FOR SELECT TO authenticated USING (true);
CREATE POLICY recurring_write ON public.recurring_transactions FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'Committee')) WITH CHECK (public.has_role(auth.uid(), 'Committee'));

CREATE OR REPLACE FUNCTION public.recurring_step(_d date, _freq text)
RETURNS date LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE _freq
    WHEN 'Weekly' THEN _d + 7
    WHEN 'Fortnightly' THEN _d + 14
    WHEN 'Monthly' THEN (_d + interval '1 month')::date
    WHEN 'Quarterly' THEN (_d + interval '3 months')::date
    ELSE (_d + interval '1 year')::date END;
$$;

-- Catches every active rule up to today: one Approved entry per missed date. Safe to call
-- repeatedly (next_date only ever moves forward). Called when the Finance page opens.
CREATE OR REPLACE FUNCTION public.generate_recurring_transactions(_scheme uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record; d date; made integer := 0; guard integer;
BEGIN
  FOR r IN SELECT * FROM recurring_transactions WHERE scheme_id = _scheme AND active AND next_date <= current_date FOR UPDATE LOOP
    d := r.next_date; guard := 0;
    WHILE d <= current_date AND (r.end_date IS NULL OR d <= r.end_date) AND guard < 400 LOOP
      INSERT INTO finance_transactions (scheme_id, direction, fund_id, category, description, supplier, amount, occurred_on, status, budget_line_item_id, recurring_id, created_by)
      VALUES (r.scheme_id, r.direction, r.fund_id, r.category, r.description, r.supplier, r.amount, d, 'Approved', r.budget_line_item_id, r.id, r.created_by);
      made := made + 1; guard := guard + 1;
      d := recurring_step(d, r.frequency);
    END LOOP;
    UPDATE recurring_transactions SET next_date = d, active = (r.end_date IS NULL OR d <= r.end_date) WHERE id = r.id;
  END LOOP;
  RETURN made;
END;
$$;
GRANT EXECUTE ON FUNCTION public.generate_recurring_transactions(uuid) TO authenticated, anon;
