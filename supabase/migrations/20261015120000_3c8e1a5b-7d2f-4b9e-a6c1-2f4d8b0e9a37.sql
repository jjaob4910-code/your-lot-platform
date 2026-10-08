-- Audit round 4: track when owners were invited and levies were chased, and let owners reply
-- to an AGM notice (attending, apologies, or a proxy). Safe to run more than once.

ALTER TABLE public.lots ADD COLUMN IF NOT EXISTS invited_at timestamptz;
ALTER TABLE public.levies ADD COLUMN IF NOT EXISTS reminded_at timestamptz;

CREATE TABLE IF NOT EXISTS public.agm_rsvps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id uuid NOT NULL REFERENCES public.agm_meetings(id) ON DELETE CASCADE,
  lot_id uuid NOT NULL REFERENCES public.lots(id) ON DELETE CASCADE,
  status text NOT NULL CHECK (status IN ('Attending', 'Apologies', 'Proxy')),
  proxy_name text CHECK (proxy_name IS NULL OR length(btrim(proxy_name)) BETWEEN 1 AND 200),
  responded_by uuid DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (meeting_id, lot_id),
  CHECK (status <> 'Proxy' OR proxy_name IS NOT NULL)
);
ALTER TABLE public.agm_rsvps ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.agm_rsvps TO authenticated;
GRANT ALL ON public.agm_rsvps TO service_role;

DROP POLICY IF EXISTS rsvp_read ON public.agm_rsvps;
DROP POLICY IF EXISTS rsvp_owner_write ON public.agm_rsvps;
DROP POLICY IF EXISTS rsvp_owner_update ON public.agm_rsvps;
DROP POLICY IF EXISTS rsvp_delete ON public.agm_rsvps;
-- Owners see and change their own lot's reply; the committee sees every reply in its building.
CREATE POLICY rsvp_read ON public.agm_rsvps FOR SELECT TO authenticated
  USING (public.owns_lot(lot_id) OR public.is_committee((SELECT scheme_id FROM public.agm_meetings WHERE id = meeting_id)));
CREATE POLICY rsvp_owner_write ON public.agm_rsvps FOR INSERT TO authenticated
  WITH CHECK (public.owns_lot(lot_id) OR public.is_committee((SELECT scheme_id FROM public.agm_meetings WHERE id = meeting_id)));
CREATE POLICY rsvp_owner_update ON public.agm_rsvps FOR UPDATE TO authenticated
  USING (public.owns_lot(lot_id) OR public.is_committee((SELECT scheme_id FROM public.agm_meetings WHERE id = meeting_id)))
  WITH CHECK (public.owns_lot(lot_id) OR public.is_committee((SELECT scheme_id FROM public.agm_meetings WHERE id = meeting_id)));
CREATE POLICY rsvp_delete ON public.agm_rsvps FOR DELETE TO authenticated
  USING (public.owns_lot(lot_id) OR public.is_committee((SELECT scheme_id FROM public.agm_meetings WHERE id = meeting_id)));

-- Budgets can be levied in one annual payment or four quarterly instalments.
ALTER TABLE public.budgets ADD COLUMN IF NOT EXISTS instalments integer NOT NULL DEFAULT 1;
DO $$ BEGIN
  ALTER TABLE public.budgets ADD CONSTRAINT budgets_instalments_check CHECK (instalments IN (1, 4));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE OR REPLACE FUNCTION public.generate_levies_for_budget()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  _total numeric := NEW.total_amount;
  _lots integer;
  _n integer := COALESCE(NEW.instalments, 1);
BEGIN
  SELECT count(*) INTO _lots FROM public.lots WHERE scheme_id = NEW.scheme_id;
  IF _lots = 0 THEN RETURN NEW; END IF;

  -- Each lot's yearly share, split into instalments three months apart. The last instalment
  -- takes any rounding so the instalments add up to the share exactly.
  INSERT INTO public.levies (lot_id, budget_id, amount, due_date, status, label)
  SELECT s.id, NEW.id,
         CASE WHEN i < _n THEN ROUND(s.share / _n, 2) ELSE s.share - ROUND(s.share / _n, 2) * (_n - 1) END,
         (NEW.levy_due_date + make_interval(months => (i - 1) * 3))::date, 'Pending',
         CASE WHEN _n > 1 THEN 'Instalment ' || i || ' of ' || _n END
  FROM (
    SELECT l.id, CASE WHEN NEW.allocation_method = 'Equal' THEN ROUND(_total / _lots, 2)
                      ELSE ROUND((l.entitlement_percent / 100.0) * _total, 2) END AS share
    FROM public.lots l WHERE l.scheme_id = NEW.scheme_id
  ) s CROSS JOIN generate_series(1, _n) AS i;

  RETURN NEW;
END;
$function$;
