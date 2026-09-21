ALTER TABLE public.documents
  ADD COLUMN budget_line_item_id uuid REFERENCES public.budget_line_items(id) ON DELETE SET NULL,
  ADD COLUMN levy_id uuid REFERENCES public.levies(id) ON DELETE SET NULL;

CREATE INDEX documents_budget_line_item_idx ON public.documents (budget_line_item_id);
CREATE INDEX documents_levy_idx ON public.documents (levy_id);
