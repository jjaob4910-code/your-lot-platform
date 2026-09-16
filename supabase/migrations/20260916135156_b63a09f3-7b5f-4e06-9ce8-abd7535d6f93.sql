ALTER TABLE public.budgets
  ADD COLUMN IF NOT EXISTS allocation_method text NOT NULL DEFAULT 'Entitlement';

CREATE OR REPLACE FUNCTION public.generate_levies_for_budget()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _total numeric := NEW.admin_fund_total + NEW.maintenance_fund_total;
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