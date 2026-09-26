-- Finance redesign: budget line items carry their own "when" instead of a
-- separate forecast-lines table, so scheduling a cost is one field on the
-- same spreadsheet row rather than a second, disconnected planning tool.
ALTER TABLE public.budget_line_items ADD COLUMN expected_month integer CHECK (expected_month BETWEEN 1 AND 12);

DROP TABLE public.budget_forecast_lines;
