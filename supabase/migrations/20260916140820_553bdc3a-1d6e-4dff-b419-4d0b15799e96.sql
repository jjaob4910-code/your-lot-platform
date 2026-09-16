ALTER TYPE public.maintenance_status ADD VALUE IF NOT EXISTS 'Awaiting approval' BEFORE 'Quoted';
ALTER TYPE public.maintenance_status ADD VALUE IF NOT EXISTS 'In progress' AFTER 'Approved';
ALTER TYPE public.maintenance_status ADD VALUE IF NOT EXISTS 'Closed' AFTER 'Complete';

ALTER TABLE public.maintenance_requests
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'Repair',
  ADD COLUMN IF NOT EXISTS priority text NOT NULL DEFAULT 'Normal',
  ADD COLUMN IF NOT EXISTS location text,
  ADD COLUMN IF NOT EXISTS estimated_cost numeric,
  ADD COLUMN IF NOT EXISTS approval_required boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS target_date date,
  ADD COLUMN IF NOT EXISTS closed_at timestamptz,
  ADD COLUMN IF NOT EXISTS outcome text,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS maintenance_requests_updated_at ON public.maintenance_requests;
CREATE TRIGGER maintenance_requests_updated_at BEFORE UPDATE ON public.maintenance_requests
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.work_order_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  work_order_id uuid NOT NULL REFERENCES public.maintenance_requests(id) ON DELETE CASCADE,
  storage_path text NOT NULL,
  caption text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.work_order_photos TO authenticated, anon;
GRANT ALL ON public.work_order_photos TO service_role;
ALTER TABLE public.work_order_photos ENABLE ROW LEVEL SECURITY;
CREATE POLICY prototype_open_access ON public.work_order_photos FOR ALL USING (true) WITH CHECK (true);

CREATE TABLE public.work_order_approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  work_order_id uuid NOT NULL REFERENCES public.maintenance_requests(id) ON DELETE CASCADE,
  lot_id uuid NOT NULL REFERENCES public.lots(id) ON DELETE CASCADE,
  decision text NOT NULL DEFAULT 'Pending',
  comment text,
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (work_order_id, lot_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.work_order_approvals TO authenticated, anon;
GRANT ALL ON public.work_order_approvals TO service_role;
ALTER TABLE public.work_order_approvals ENABLE ROW LEVEL SECURITY;
CREATE POLICY prototype_open_access ON public.work_order_approvals FOR ALL USING (true) WITH CHECK (true);

CREATE TABLE public.work_order_updates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  work_order_id uuid NOT NULL REFERENCES public.maintenance_requests(id) ON DELETE CASCADE,
  note text NOT NULL,
  status_at_time text,
  author_label text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.work_order_updates TO authenticated, anon;
GRANT ALL ON public.work_order_updates TO service_role;
ALTER TABLE public.work_order_updates ENABLE ROW LEVEL SECURITY;
CREATE POLICY prototype_open_access ON public.work_order_updates FOR ALL USING (true) WITH CHECK (true);