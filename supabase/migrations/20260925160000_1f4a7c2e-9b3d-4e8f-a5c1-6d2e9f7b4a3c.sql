-- Lets a budget line distinguish a known, recurring cost (insurance premium,
-- cleaning contract) from a one-off or estimated cost (a repair quote), so a
-- committee can see at a glance how much of the budget is locked-in vs. estimate.
ALTER TABLE public.budget_line_items
  ADD COLUMN cost_type text NOT NULL DEFAULT 'Variable' CHECK (cost_type IN ('Fixed', 'Variable'));
