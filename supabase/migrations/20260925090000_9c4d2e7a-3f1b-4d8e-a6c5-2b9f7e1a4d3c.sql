-- Shared, per-building dashboard widget layout. Everyone viewing a scheme's dashboard sees
-- the same arrangement, matching how the rest of this app treats "the user" as one shared
-- committee identity per building (isCommittee/myLot are not yet resolved from real auth).
CREATE TABLE public.dashboard_widgets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scheme_id uuid NOT NULL REFERENCES public.schemes(id) ON DELETE CASCADE,
  widget_type text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX dashboard_widgets_scheme_type_uidx ON public.dashboard_widgets (scheme_id, widget_type);
CREATE TRIGGER dashboard_widgets_set_updated_at BEFORE UPDATE ON public.dashboard_widgets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

GRANT SELECT, INSERT, UPDATE, DELETE ON public.dashboard_widgets TO authenticated;
GRANT ALL ON public.dashboard_widgets TO service_role;
ALTER TABLE public.dashboard_widgets ENABLE ROW LEVEL SECURITY;
CREATE POLICY dashboard_widgets_select ON public.dashboard_widgets FOR SELECT TO authenticated USING (true);
CREATE POLICY dashboard_widgets_write ON public.dashboard_widgets FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'Committee')) WITH CHECK (public.has_role(auth.uid(), 'Committee'));

-- Notice board: committee posts, everyone can read and reply.
CREATE TABLE public.notices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scheme_id uuid NOT NULL REFERENCES public.schemes(id) ON DELETE CASCADE,
  title text NOT NULL,
  message text NOT NULL,
  pinned boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX notices_scheme_idx ON public.notices (scheme_id, pinned DESC, created_at DESC);
CREATE TRIGGER notices_set_updated_at BEFORE UPDATE ON public.notices
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

GRANT SELECT, INSERT, UPDATE, DELETE ON public.notices TO authenticated;
GRANT ALL ON public.notices TO service_role;
ALTER TABLE public.notices ENABLE ROW LEVEL SECURITY;
CREATE POLICY notices_select ON public.notices FOR SELECT TO authenticated USING (true);
CREATE POLICY notices_write ON public.notices FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'Committee')) WITH CHECK (public.has_role(auth.uid(), 'Committee'));

-- Replies: anyone can post one (owners engaging with a notice), only committee moderates/removes.
CREATE TABLE public.notice_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notice_id uuid NOT NULL REFERENCES public.notices(id) ON DELETE CASCADE,
  scheme_id uuid NOT NULL REFERENCES public.schemes(id) ON DELETE CASCADE,
  author_name text,
  message text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX notice_comments_notice_idx ON public.notice_comments (notice_id, created_at);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.notice_comments TO authenticated;
GRANT ALL ON public.notice_comments TO service_role;
ALTER TABLE public.notice_comments ENABLE ROW LEVEL SECURITY;
CREATE POLICY notice_comments_select ON public.notice_comments FOR SELECT TO authenticated USING (true);
CREATE POLICY notice_comments_insert ON public.notice_comments FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY notice_comments_update ON public.notice_comments FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'Committee')) WITH CHECK (public.has_role(auth.uid(), 'Committee'));
CREATE POLICY notice_comments_delete ON public.notice_comments FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'Committee'));
