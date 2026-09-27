-- Custom, per-scheme fund list (replaces the hardcoded Admin/Maintenance pair), plus a
-- per-line "occurrence" so a weekly/fortnightly/monthly cost can be entered at its real
-- cadence instead of the committee doing the annualising by hand.

CREATE TABLE public.budget_funds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scheme_id uuid NOT NULL REFERENCES public.schemes(id) ON DELETE CASCADE,
  name text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.budget_funds TO authenticated, anon;
GRANT ALL ON public.budget_funds TO service_role;
ALTER TABLE public.budget_funds ENABLE ROW LEVEL SECURITY;
CREATE POLICY prototype_open_access ON public.budget_funds FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY budget_funds_select ON public.budget_funds FOR SELECT TO authenticated USING (true);
CREATE POLICY budget_funds_write ON public.budget_funds FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'Committee')) WITH CHECK (public.has_role(auth.uid(), 'Committee'));

CREATE TABLE public.budget_fund_totals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  budget_id uuid NOT NULL REFERENCES public.budgets(id) ON DELETE CASCADE,
  fund_id uuid NOT NULL REFERENCES public.budget_funds(id) ON DELETE RESTRICT,
  total numeric(12,2) NOT NULL DEFAULT 0,
  UNIQUE (budget_id, fund_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.budget_fund_totals TO authenticated, anon;
GRANT ALL ON public.budget_fund_totals TO service_role;
ALTER TABLE public.budget_fund_totals ENABLE ROW LEVEL SECURITY;
CREATE POLICY prototype_open_access ON public.budget_fund_totals FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY budget_fund_totals_select ON public.budget_fund_totals FOR SELECT TO authenticated USING (true);
CREATE POLICY budget_fund_totals_write ON public.budget_fund_totals FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'Committee')) WITH CHECK (public.has_role(auth.uid(), 'Committee'));

-- Seed each scheme's existing two funds as real rows, preserving today's names exactly.
INSERT INTO public.budget_funds (scheme_id, name, sort_order) SELECT id, 'Admin', 0 FROM public.schemes;
INSERT INTO public.budget_funds (scheme_id, name, sort_order) SELECT id, 'Maintenance', 1 FROM public.schemes;

-- budgets: replace the two fixed fund-total columns with one grand total (the levy
-- trigger below reads this), the per-fund breakdown now lives in budget_fund_totals.
ALTER TABLE public.budgets ADD COLUMN total_amount numeric(12,2) NOT NULL DEFAULT 0;
UPDATE public.budgets SET total_amount = admin_fund_total + maintenance_fund_total;

INSERT INTO public.budget_fund_totals (budget_id, fund_id, total)
SELECT b.id, f.id, b.admin_fund_total FROM public.budgets b
JOIN public.budget_funds f ON f.scheme_id = b.scheme_id AND f.name = 'Admin';
INSERT INTO public.budget_fund_totals (budget_id, fund_id, total)
SELECT b.id, f.id, b.maintenance_fund_total FROM public.budgets b
JOIN public.budget_funds f ON f.scheme_id = b.scheme_id AND f.name = 'Maintenance';

ALTER TABLE public.budgets DROP COLUMN admin_fund_total;
ALTER TABLE public.budgets DROP COLUMN maintenance_fund_total;

-- budget_line_items: fund free-text -> fund_id, plus the new occurrence field.
ALTER TABLE public.budget_line_items ADD COLUMN fund_id uuid REFERENCES public.budget_funds(id) ON DELETE RESTRICT;
UPDATE public.budget_line_items li SET fund_id = f.id
FROM public.budget_funds f WHERE f.scheme_id = li.scheme_id AND f.name = li.fund;
ALTER TABLE public.budget_line_items ALTER COLUMN fund_id SET NOT NULL;
ALTER TABLE public.budget_line_items DROP COLUMN fund;
ALTER TABLE public.budget_line_items ADD COLUMN occurrence text NOT NULL DEFAULT 'Annually'
  CHECK (occurrence IN ('Weekly', 'Fortnightly', 'Monthly', 'Annually'));

-- finance_transactions: same fund free-text -> fund_id conversion.
ALTER TABLE public.finance_transactions ADD COLUMN fund_id uuid REFERENCES public.budget_funds(id) ON DELETE RESTRICT;
UPDATE public.finance_transactions t SET fund_id = f.id
FROM public.budget_funds f WHERE f.scheme_id = t.scheme_id AND f.name = t.fund;
ALTER TABLE public.finance_transactions ALTER COLUMN fund_id SET NOT NULL;
ALTER TABLE public.finance_transactions DROP COLUMN fund;

-- The levy-issuing trigger now reads the budget's single total instead of the two
-- fixed fund columns it used to split — the per-fund breakdown is a display concern.
CREATE OR REPLACE FUNCTION public.generate_levies_for_budget()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  _total numeric := NEW.total_amount;
  _lots integer;
BEGIN
  SELECT count(*) INTO _lots FROM public.lots WHERE scheme_id = NEW.scheme_id;
  IF _lots = 0 THEN RETURN NEW; END IF;

  IF NEW.allocation_method = 'Equal' THEN
    INSERT INTO public.levies (lot_id, budget_id, amount, due_date, status)
    SELECT l.id, NEW.id, ROUND(_total / _lots, 2), NEW.levy_due_date, 'Pending'
    FROM public.lots l WHERE l.scheme_id = NEW.scheme_id;
  ELSE
    INSERT INTO public.levies (lot_id, budget_id, amount, due_date, status)
    SELECT l.id, NEW.id, ROUND((l.entitlement_percent / 100.0) * _total, 2), NEW.levy_due_date, 'Pending'
    FROM public.lots l WHERE l.scheme_id = NEW.scheme_id;
  END IF;

  RETURN NEW;
END;
$function$;
