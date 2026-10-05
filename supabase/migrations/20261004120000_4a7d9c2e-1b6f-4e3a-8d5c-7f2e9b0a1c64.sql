-- Personal dashboards: rows with user_id NULL are the scheme's default layout (set by the
-- committee); each person gets their own copy on first visit and arranges it freely.
-- size: S/M/L/XL/Full. config: per-widget settings (e.g. a private note's text and colour).
ALTER TABLE public.dashboard_widgets
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS size text NOT NULL DEFAULT 'M' CHECK (size IN ('S','M','L','XL','Full')),
  ADD COLUMN IF NOT EXISTS config jsonb NOT NULL DEFAULT '{}'::jsonb;
DROP INDEX IF EXISTS public.dashboard_widgets_scheme_type_uidx;
CREATE INDEX IF NOT EXISTS dashboard_widgets_scheme_user_idx ON public.dashboard_widgets (scheme_id, user_id);

-- "Your lot" is no longer offered on the dashboard.
DELETE FROM public.dashboard_widgets WHERE widget_type = 'my_lot';
-- Keep today's sizes for the existing default layout.
UPDATE public.dashboard_widgets SET size = CASE widget_type
  WHEN 'work_orders' THEN 'Full' WHEN 'levies_chart' THEN 'L' ELSE size END;
UPDATE public.dashboard_widgets SET widget_type = 'levies' WHERE widget_type = 'levies_chart';
UPDATE public.dashboard_widgets SET widget_type = 'year_glance' WHERE widget_type = 'obligations';

DROP POLICY IF EXISTS dashboard_widgets_select ON public.dashboard_widgets;
DROP POLICY IF EXISTS dashboard_widgets_write ON public.dashboard_widgets;
DROP POLICY IF EXISTS dashboard_widgets_own ON public.dashboard_widgets;
DROP POLICY IF EXISTS dashboard_widgets_defaults ON public.dashboard_widgets;
CREATE POLICY dashboard_widgets_select ON public.dashboard_widgets FOR SELECT TO authenticated
  USING (user_id IS NULL OR user_id = auth.uid());
CREATE POLICY dashboard_widgets_own ON public.dashboard_widgets FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY dashboard_widgets_defaults ON public.dashboard_widgets FOR ALL TO authenticated
  USING (user_id IS NULL AND public.has_role(auth.uid(), 'Committee'))
  WITH CHECK (user_id IS NULL AND public.has_role(auth.uid(), 'Committee'));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.dashboard_widgets TO anon;
DROP POLICY IF EXISTS prototype_open_access ON public.dashboard_widgets;
CREATE POLICY prototype_open_access ON public.dashboard_widgets FOR ALL TO anon USING (true) WITH CHECK (true);
