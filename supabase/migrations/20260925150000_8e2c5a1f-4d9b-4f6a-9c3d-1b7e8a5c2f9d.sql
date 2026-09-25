-- One row per signed-in user, tracking when they last opened the notification
-- bell. Unlike every other table in this app, this is genuinely per-user data
-- with real auth already in place for the dashboard, so it has no anon
-- prototype-access policy — only the owning user can read or write their row.
CREATE TABLE public.notification_reads (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  last_read_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.notification_reads TO authenticated;
GRANT ALL ON public.notification_reads TO service_role;
ALTER TABLE public.notification_reads ENABLE ROW LEVEL SECURITY;
CREATE POLICY notification_reads_own ON public.notification_reads FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
