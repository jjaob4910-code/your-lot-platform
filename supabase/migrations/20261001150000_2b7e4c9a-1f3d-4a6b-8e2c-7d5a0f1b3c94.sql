-- Budget lines can carry an actual expected date (not just a month), and a levy can be a
-- labelled extra charge tied to one fund (e.g. an added cost issued after levies were paid).
ALTER TABLE public.budget_line_items ADD COLUMN expected_date date;
ALTER TABLE public.levies
  ADD COLUMN label text,
  ADD COLUMN fund_id uuid REFERENCES public.budget_funds(id) ON DELETE SET NULL;
