-- Work orders become a workspace: an order is raised for any set of lots, moves
-- through its own chain of steps (a guided Works chain, or custom steps for a
-- Task), collects quotes from a shared contractor list, and files documents.

-- 1. Work order: which lots it's for (empty = common property), and its scope.
ALTER TABLE public.maintenance_requests
  ADD COLUMN lot_ids uuid[] NOT NULL DEFAULT '{}',
  ADD COLUMN scope_of_works text;
UPDATE public.maintenance_requests SET lot_ids = ARRAY[submitted_by_lot_id] WHERE submitted_by_lot_id IS NOT NULL;

-- Owners see jobs raised for any lot they own, and common-property jobs.
DROP POLICY maintenance_select ON public.maintenance_requests;
CREATE POLICY maintenance_select ON public.maintenance_requests FOR SELECT TO authenticated USING (
  public.has_role(auth.uid(), 'Committee')
  OR public.owns_lot(submitted_by_lot_id)
  OR cardinality(lot_ids) = 0
  OR EXISTS (SELECT 1 FROM unnest(lot_ids) AS l(id) WHERE public.owns_lot(l.id))
);

-- 2. The chain of steps an order moves through.
CREATE TABLE public.work_order_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  work_order_id uuid NOT NULL REFERENCES public.maintenance_requests(id) ON DELETE CASCADE,
  position integer NOT NULL,
  label text NOT NULL,
  step_type text NOT NULL DEFAULT 'custom' CHECK (step_type IN ('scope','quotes','approval','works','custom')),
  done_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX work_order_steps_order_idx ON public.work_order_steps (work_order_id, position);

-- 3. Shared contractor list.
CREATE TABLE public.contractors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scheme_id uuid NOT NULL REFERENCES public.schemes(id) ON DELETE CASCADE,
  name text NOT NULL,
  trade text,
  phone text,
  email text,
  abn text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 4. Quotes on a work order. Accepted quotes stay here until confirmed paid,
-- at which point a Finance transaction is recorded and linked.
CREATE TABLE public.work_order_quotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  work_order_id uuid NOT NULL REFERENCES public.maintenance_requests(id) ON DELETE CASCADE,
  contractor_id uuid REFERENCES public.contractors(id) ON DELETE SET NULL,
  amount numeric(12,2) NOT NULL DEFAULT 0,
  notes text,
  status text NOT NULL DEFAULT 'Received' CHECK (status IN ('Received','Accepted','Declined')),
  paid_at date,
  finance_transaction_id uuid REFERENCES public.finance_transactions(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX work_order_quotes_order_idx ON public.work_order_quotes (work_order_id);

-- 5. Documents can belong to a work order or one of its quotes.
ALTER TABLE public.documents
  ADD COLUMN work_order_id uuid REFERENCES public.maintenance_requests(id) ON DELETE CASCADE,
  ADD COLUMN work_order_quote_id uuid REFERENCES public.work_order_quotes(id) ON DELETE CASCADE;

-- RLS, same convention as the rest of the app.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['work_order_steps','contractors','work_order_quotes'] LOOP
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated, anon', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY prototype_open_access ON public.%I FOR ALL TO anon USING (true) WITH CHECK (true)', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (true)', t || '_select', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (public.has_role(auth.uid(), ''Committee'')) WITH CHECK (public.has_role(auth.uid(), ''Committee''))', t || '_write', t);
  END LOOP;
END $$;

-- 6. Backfill a step chain for every existing order, matching its status.
INSERT INTO public.work_order_steps (work_order_id, position, label, step_type, done_at)
SELECT m.id, s.pos, s.label, s.step_type,
  CASE WHEN m.status IN ('Complete','Closed') THEN coalesce(m.closed_at, m.updated_at)
       WHEN s.pos <= CASE m.status
         WHEN 'Awaiting approval' THEN 1 WHEN 'Quoted' THEN 1
         WHEN 'Approved' THEN 2 WHEN 'In progress' THEN 2 ELSE -1 END THEN m.updated_at
       ELSE NULL END
FROM public.maintenance_requests m
CROSS JOIN (VALUES (0,'Scope of works','scope'),(1,'Quotes','quotes'),(2,'Approval','approval'),(3,'Works','works')) AS s(pos,label,step_type)
WHERE m.kind = 'Repair';

INSERT INTO public.work_order_steps (work_order_id, position, label, step_type, done_at)
SELECT m.id, s.pos, s.label, 'custom',
  CASE WHEN m.status IN ('Complete','Closed') THEN coalesce(m.closed_at, m.updated_at) ELSE NULL END
FROM public.maintenance_requests m
CROSS JOIN (VALUES (0,'Plan'),(1,'Do'),(2,'Close out')) AS s(pos,label)
WHERE m.kind <> 'Repair';

-- 7. When a majority of lots approve, tick the approval step and move the order
-- on. Runs as the table owner, so it works whether an owner or the committee
-- casts the deciding vote (owners can't update work orders directly).
CREATE OR REPLACE FUNCTION public.work_order_apply_approval_majority()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  _total integer; _yes integer; _no integer;
BEGIN
  SELECT count(*), count(*) FILTER (WHERE decision = 'Approved'), count(*) FILTER (WHERE decision = 'Declined')
    INTO _total, _yes, _no
  FROM public.work_order_approvals WHERE work_order_id = NEW.work_order_id;

  IF _yes * 2 > _total THEN
    UPDATE public.work_order_steps SET done_at = now()
      WHERE work_order_id = NEW.work_order_id AND step_type = 'approval' AND done_at IS NULL;
    UPDATE public.maintenance_requests SET status = 'In progress'
      WHERE id = NEW.work_order_id AND status IN ('Requested','Awaiting approval','Quoted');
    INSERT INTO public.work_order_updates (work_order_id, note, author_label, status_at_time)
      SELECT NEW.work_order_id, 'Approved by a majority of lot owners.', 'Loty', 'In progress'
      WHERE NOT EXISTS (SELECT 1 FROM public.work_order_updates WHERE work_order_id = NEW.work_order_id AND note = 'Approved by a majority of lot owners.');
  ELSIF _no * 2 >= _total AND _total > 0 THEN
    INSERT INTO public.work_order_updates (work_order_id, note, author_label, status_at_time)
      SELECT NEW.work_order_id, 'Declined by a majority of lot owners.', 'Loty', NULL
      WHERE NOT EXISTS (SELECT 1 FROM public.work_order_updates WHERE work_order_id = NEW.work_order_id AND note = 'Declined by a majority of lot owners.');
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER work_order_approvals_majority
AFTER UPDATE OF decision ON public.work_order_approvals
FOR EACH ROW EXECUTE FUNCTION public.work_order_apply_approval_majority();
