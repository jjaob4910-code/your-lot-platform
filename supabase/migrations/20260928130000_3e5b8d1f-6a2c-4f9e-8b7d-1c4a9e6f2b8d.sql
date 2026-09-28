-- Owners can log a work order but can't write steps (committee-only), so give
-- an owner-logged order the default Task chain here instead.
CREATE OR REPLACE FUNCTION public.work_order_owner_default_steps()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.has_role(auth.uid(), 'Committee') THEN
    INSERT INTO public.work_order_steps (work_order_id, position, label, step_type)
    VALUES (NEW.id, 0, 'Plan', 'custom'), (NEW.id, 1, 'Do', 'custom'), (NEW.id, 2, 'Close out', 'custom');
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER maintenance_requests_owner_default_steps
AFTER INSERT ON public.maintenance_requests
FOR EACH ROW EXECUTE FUNCTION public.work_order_owner_default_steps();
