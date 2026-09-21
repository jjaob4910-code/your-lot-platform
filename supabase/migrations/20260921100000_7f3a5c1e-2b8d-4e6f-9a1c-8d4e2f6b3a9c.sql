CREATE TABLE public.budget_line_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  budget_id uuid NOT NULL REFERENCES public.budgets(id) ON DELETE CASCADE,
  scheme_id uuid NOT NULL REFERENCES public.schemes(id) ON DELETE CASCADE,
  fund text NOT NULL DEFAULT 'Admin' CHECK (fund IN ('Admin', 'Maintenance')),
  description text NOT NULL,
  amount numeric(12,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX budget_line_items_budget_idx ON public.budget_line_items (budget_id);
CREATE TRIGGER budget_line_items_set_updated_at BEFORE UPDATE ON public.budget_line_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

GRANT SELECT, INSERT, UPDATE, DELETE ON public.budget_line_items TO authenticated;
GRANT ALL ON public.budget_line_items TO service_role;
ALTER TABLE public.budget_line_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY budget_line_items_select ON public.budget_line_items FOR SELECT TO authenticated USING (true);
CREATE POLICY budget_line_items_write ON public.budget_line_items FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'Committee')) WITH CHECK (public.has_role(auth.uid(), 'Committee'));

-- Audit trail for budget edits. Snapshots BOTH the aggregate totals AND the full line-item
-- composition (as jsonb) on each side, so "revert" restores what the budget actually looked
-- like, not just its two totals. Evidence *files* on line items are not part of the snapshot
-- (files are never deleted, only unlinked when a line item is removed, so they can always be
-- found again in Documents rather than needing to be restored).
CREATE TABLE public.budget_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  budget_id uuid NOT NULL REFERENCES public.budgets(id) ON DELETE CASCADE,
  scheme_id uuid NOT NULL REFERENCES public.schemes(id) ON DELETE CASCADE,
  reason text NOT NULL,
  previous_admin_fund_total numeric(12,2) NOT NULL,
  previous_maintenance_fund_total numeric(12,2) NOT NULL,
  previous_allocation_method text NOT NULL,
  previous_levy_due_date date NOT NULL,
  previous_line_items jsonb NOT NULL DEFAULT '[]'::jsonb,
  new_admin_fund_total numeric(12,2) NOT NULL,
  new_maintenance_fund_total numeric(12,2) NOT NULL,
  new_allocation_method text NOT NULL,
  new_levy_due_date date NOT NULL,
  new_line_items jsonb NOT NULL DEFAULT '[]'::jsonb,
  levies_recalculated boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);
CREATE INDEX budget_revisions_budget_idx ON public.budget_revisions (budget_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.budget_revisions TO authenticated;
GRANT ALL ON public.budget_revisions TO service_role;
ALTER TABLE public.budget_revisions ENABLE ROW LEVEL SECURITY;
CREATE POLICY budget_revisions_select ON public.budget_revisions FOR SELECT TO authenticated USING (true);
CREATE POLICY budget_revisions_write ON public.budget_revisions FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'Committee')) WITH CHECK (public.has_role(auth.uid(), 'Committee'));
