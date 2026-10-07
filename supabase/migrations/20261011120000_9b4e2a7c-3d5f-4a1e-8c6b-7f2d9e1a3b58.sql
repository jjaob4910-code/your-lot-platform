-- Chat upgrade: profiles (name + photo), a nameable group chat, @mentions, and read receipts.
-- Safe to run more than once.

-- ── Profiles ──────────────────────────────────────────────────────────────────
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS full_name text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS avatar_url text;

-- Photos: public to view, each person writes only their own folder.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('avatars', 'avatars', true, 2097152, ARRAY['image/jpeg','image/png','image/webp','image/gif'])
ON CONFLICT (id) DO UPDATE SET public = true, file_size_limit = 2097152, allowed_mime_types = EXCLUDED.allowed_mime_types;
DROP POLICY IF EXISTS avatars_read ON storage.objects;
DROP POLICY IF EXISTS avatars_own_write ON storage.objects;
DROP POLICY IF EXISTS avatars_own_update ON storage.objects;
DROP POLICY IF EXISTS avatars_own_delete ON storage.objects;
CREATE POLICY avatars_read ON storage.objects FOR SELECT USING (bucket_id = 'avatars');
CREATE POLICY avatars_own_write ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY avatars_own_update ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY avatars_own_delete ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

-- The name someone goes by in a building: their own choice, else their lot's owner name, else their account name.
CREATE OR REPLACE FUNCTION public.member_name(_user uuid, _scheme uuid) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(NULLIF(btrim(p.full_name), ''),
    (SELECT NULLIF(btrim(l.owner_name), '') FROM public.lots l WHERE l.scheme_id = _scheme AND l.owner_user_id = _user ORDER BY l.lot_number LIMIT 1),
    NULLIF(btrim(p.display_name), ''), 'Member')
  FROM (SELECT 1) x LEFT JOIN public.profiles p ON p.id = _user
$$;

-- ── Group chat name ───────────────────────────────────────────────────────────
ALTER TABLE public.scheme_settings ADD COLUMN IF NOT EXISTS chat_name text;

-- ── Mentions and read receipts ───────────────────────────────────────────────
ALTER TABLE public.chat_messages ADD COLUMN IF NOT EXISTS mentions uuid[] NOT NULL DEFAULT '{}';

CREATE TABLE IF NOT EXISTS public.chat_reads (
  scheme_id uuid NOT NULL REFERENCES public.schemes(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  last_read_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (scheme_id, user_id)
);
ALTER TABLE public.chat_reads ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON public.chat_reads TO authenticated;
DROP POLICY IF EXISTS member_read ON public.chat_reads;
DROP POLICY IF EXISTS own_write ON public.chat_reads;
DROP POLICY IF EXISTS own_update ON public.chat_reads;
CREATE POLICY member_read ON public.chat_reads FOR SELECT TO authenticated USING (public.is_member(scheme_id));
CREATE POLICY own_write ON public.chat_reads FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid() AND public.is_member(scheme_id));
CREATE POLICY own_update ON public.chat_reads FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- Everyone in the chat: name, label, photo and how far they've read. No emails or phones.
CREATE OR REPLACE FUNCTION public.chat_members(_scheme uuid)
RETURNS TABLE (user_id uuid, name text, label text, avatar_url text, role text, last_read_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH people AS (
    SELECT m.user_id, m.role FROM public.scheme_members m WHERE m.scheme_id = _scheme
    UNION
    -- Loty staff who have taken part in a managed building's chat
    SELECT DISTINCT c.user_id, 'Loty' FROM public.chat_messages c
    WHERE c.scheme_id = _scheme AND c.author_label = 'Loty'
      AND NOT EXISTS (SELECT 1 FROM public.scheme_members m WHERE m.scheme_id = _scheme AND m.user_id = c.user_id)
  )
  SELECT pp.user_id,
    public.member_name(pp.user_id, _scheme),
    CASE WHEN pp.role = 'Loty' THEN 'Loty' ELSE concat_ws(' · ',
      (SELECT 'Lot ' || l.lot_number FROM public.lots l WHERE l.scheme_id = _scheme AND l.owner_user_id = pp.user_id ORDER BY l.lot_number LIMIT 1),
      CASE WHEN pp.role = 'Manager' THEN 'Manager'
           WHEN pp.role = 'Committee' THEN COALESCE(NULLIF((SELECT cr.role FROM public.committee_roles cr JOIN public.lots l ON l.id = cr.lot_id
                                                     WHERE l.scheme_id = _scheme AND l.owner_user_id = pp.user_id LIMIT 1), 'Member'), 'Committee') END) END,
    p.avatar_url, pp.role,
    (SELECT r.last_read_at FROM public.chat_reads r WHERE r.scheme_id = _scheme AND r.user_id = pp.user_id)
  FROM people pp LEFT JOIN public.profiles p ON p.id = pp.user_id
  WHERE public.is_member(_scheme)
$$;
GRANT EXECUTE ON FUNCTION public.chat_members(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.member_name(uuid, uuid) TO authenticated;

-- Stamp the author (now using their chosen name) and keep only real members as mentions.
CREATE OR REPLACE FUNCTION public.chat_stamp_author() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _m public.scheme_members; _lot public.lots; _pos text;
BEGIN
  NEW.mentions := COALESCE((SELECT array_agg(DISTINCT u) FROM unnest(NEW.mentions) u
    WHERE EXISTS (SELECT 1 FROM public.scheme_members m WHERE m.scheme_id = COALESCE(OLD.scheme_id, NEW.scheme_id) AND m.user_id = u)), '{}');
  IF TG_OP = 'UPDATE' THEN
    NEW.scheme_id := OLD.scheme_id; NEW.user_id := OLD.user_id; NEW.created_at := OLD.created_at;
    NEW.author_name := OLD.author_name; NEW.author_label := OLD.author_label;
    IF NEW.deleted_at IS NOT NULL THEN NEW.body := 'Message deleted'; NEW.mentions := '{}';
    ELSIF NEW.body IS DISTINCT FROM OLD.body THEN NEW.edited_at := now(); END IF;
    RETURN NEW;
  END IF;
  SELECT * INTO _m FROM public.scheme_members WHERE scheme_id = NEW.scheme_id AND user_id = auth.uid();
  SELECT * INTO _lot FROM public.lots WHERE scheme_id = NEW.scheme_id AND owner_user_id = auth.uid() ORDER BY lot_number LIMIT 1;
  IF _lot.id IS NOT NULL THEN SELECT role INTO _pos FROM public.committee_roles WHERE lot_id = _lot.id LIMIT 1; END IF;
  NEW.user_id := auth.uid(); NEW.created_at := now(); NEW.edited_at := NULL; NEW.deleted_at := NULL;
  NEW.author_name := public.member_name(auth.uid(), NEW.scheme_id);
  IF _m.id IS NULL AND public.loty_manages(NEW.scheme_id) THEN
    NEW.author_label := 'Loty';
  ELSE
    NEW.author_label := concat_ws(' · ',
      CASE WHEN _lot.id IS NOT NULL THEN 'Lot ' || _lot.lot_number END,
      CASE WHEN _m.role = 'Manager' THEN 'Manager' WHEN _m.role = 'Committee' THEN COALESCE(NULLIF(_pos, 'Member'), 'Committee') END);
  END IF;
  RETURN NEW;
END $$;

-- Live read receipts.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
     AND NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'chat_reads') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_reads;
  END IF;
END $$;

-- ── Reactions (Loty icons, stored by code such as 'thumbs-up') ───────────────
CREATE TABLE IF NOT EXISTS public.chat_reactions (
  message_id uuid NOT NULL REFERENCES public.chat_messages(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  scheme_id uuid NOT NULL REFERENCES public.schemes(id) ON DELETE CASCADE,
  emoji text NOT NULL CHECK (emoji ~ '^[a-z-]{1,20}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (message_id, user_id, emoji)
);
ALTER TABLE public.chat_reactions ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, DELETE ON public.chat_reactions TO authenticated;
DROP POLICY IF EXISTS member_read ON public.chat_reactions;
DROP POLICY IF EXISTS own_add ON public.chat_reactions;
DROP POLICY IF EXISTS own_remove ON public.chat_reactions;
CREATE POLICY member_read ON public.chat_reactions FOR SELECT TO authenticated USING (public.is_member(scheme_id));
CREATE POLICY own_add ON public.chat_reactions FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND public.is_member(scheme_id)
    AND EXISTS (SELECT 1 FROM public.chat_messages c WHERE c.id = message_id AND c.scheme_id = chat_reactions.scheme_id AND c.deleted_at IS NULL));
CREATE POLICY own_remove ON public.chat_reactions FOR DELETE TO authenticated USING (user_id = auth.uid());
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
     AND NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'chat_reactions') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_reactions;
  END IF;
END $$;
