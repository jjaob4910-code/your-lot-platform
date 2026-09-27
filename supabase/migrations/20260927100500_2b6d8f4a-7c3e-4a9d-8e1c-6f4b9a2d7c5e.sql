-- budget_revisions previously snapshotted the two fixed fund totals by name; now that a
-- scheme can have any number of funds, snapshot one grand total plus a name->amount map.
ALTER TABLE public.budget_revisions RENAME COLUMN previous_admin_fund_total TO previous_total;
ALTER TABLE public.budget_revisions RENAME COLUMN new_admin_fund_total TO new_total;
UPDATE public.budget_revisions SET previous_total = previous_total + previous_maintenance_fund_total,
  new_total = new_total + new_maintenance_fund_total;
ALTER TABLE public.budget_revisions DROP COLUMN previous_maintenance_fund_total;
ALTER TABLE public.budget_revisions DROP COLUMN new_maintenance_fund_total;
ALTER TABLE public.budget_revisions ADD COLUMN previous_fund_totals jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.budget_revisions ADD COLUMN new_fund_totals jsonb NOT NULL DEFAULT '{}'::jsonb;
