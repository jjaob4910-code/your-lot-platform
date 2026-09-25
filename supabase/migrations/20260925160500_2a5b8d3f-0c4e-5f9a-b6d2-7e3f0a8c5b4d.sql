-- Lets a transaction be matched to the budget line item it was spent against,
-- so Finance can compute real spend-vs-budget per line rather than just per
-- fund, and flag anything paid with no matching (or exceeded) budget line as
-- needing to be reported at the AGM. Mirrors the existing
-- documents.budget_line_item_id pattern.
ALTER TABLE public.finance_transactions
  ADD COLUMN budget_line_item_id uuid REFERENCES public.budget_line_items(id) ON DELETE SET NULL;
CREATE INDEX finance_transactions_budget_line_item_idx ON public.finance_transactions (budget_line_item_id);
