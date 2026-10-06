-- Building chat: everyone in a building (owners, committee, and Loty on managed buildings) can
-- message each other. Each message records who sent it; people can edit or delete their own.
-- Messages arrive live through Supabase Realtime. Safe to run more than once.

CREATE TABLE IF NOT EXISTS public.chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scheme_id uuid NOT NULL REFERENCES public.schemes(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  author_name text NOT NULL,
  author_label text,            -- e.g. "Lot 2", "Committee · Treasurer", "Loty"
  body text NOT NULL CHECK (length(btrim(body)) BETWEEN 1 AND 4000),
  created_at timestamptz NOT NULL DEFAULT now(),
  edited_at timestamptz,
  deleted_at timestamptz
);
CREATE INDEX IF NOT EXISTS chat_messages_scheme_created ON public.chat_messages (scheme_id, created_at DESC);
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON public.chat_messages TO authenticated;

DROP POLICY IF EXISTS member_read ON public.chat_messages;
DROP POLICY IF EXISTS member_post ON public.chat_messages;
DROP POLICY IF EXISTS own_edit ON public.chat_messages;
CREATE POLICY member_read ON public.chat_messages FOR SELECT TO authenticated USING (public.is_member(scheme_id));
CREATE POLICY member_post ON public.chat_messages FOR INSERT TO authenticated
  WITH CHECK (public.is_member(scheme_id) AND user_id = auth.uid() AND deleted_at IS NULL AND edited_at IS NULL);
-- Edit or delete (soft, so the conversation keeps its shape) your own messages only.
CREATE POLICY own_edit ON public.chat_messages FOR UPDATE TO authenticated
  USING (user_id = auth.uid() AND public.is_member(scheme_id)) WITH CHECK (user_id = auth.uid());

-- Names can't be faked: the sender's name and label are set from their account and lot.
CREATE OR REPLACE FUNCTION public.chat_stamp_author() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _m public.scheme_members; _lot public.lots; _pos text;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    -- Only the text can change, and deleting blanks it.
    NEW.scheme_id := OLD.scheme_id; NEW.user_id := OLD.user_id; NEW.created_at := OLD.created_at;
    NEW.author_name := OLD.author_name; NEW.author_label := OLD.author_label;
    IF NEW.deleted_at IS NOT NULL THEN NEW.body := 'Message deleted'; ELSIF NEW.body IS DISTINCT FROM OLD.body THEN NEW.edited_at := now(); END IF;
    RETURN NEW;
  END IF;
  SELECT * INTO _m FROM public.scheme_members WHERE scheme_id = NEW.scheme_id AND user_id = auth.uid();
  SELECT * INTO _lot FROM public.lots WHERE scheme_id = NEW.scheme_id AND owner_user_id = auth.uid() ORDER BY lot_number LIMIT 1;
  IF _lot.id IS NOT NULL THEN SELECT role INTO _pos FROM public.committee_roles WHERE lot_id = _lot.id LIMIT 1; END IF;
  NEW.user_id := auth.uid(); NEW.created_at := now(); NEW.edited_at := NULL; NEW.deleted_at := NULL;
  IF _m.id IS NULL AND public.loty_manages(NEW.scheme_id) THEN
    NEW.author_name := COALESCE((SELECT display_name FROM public.profiles WHERE id = auth.uid()), 'Loty');
    NEW.author_label := 'Loty';
  ELSE
    NEW.author_name := COALESCE(NULLIF(btrim(_lot.owner_name), ''), (SELECT display_name FROM public.profiles WHERE id = auth.uid()), 'Member');
    NEW.author_label := concat_ws(' · ',
      CASE WHEN _lot.id IS NOT NULL THEN 'Lot ' || _lot.lot_number END,
      CASE WHEN _m.role = 'Manager' THEN 'Manager' WHEN _m.role = 'Committee' THEN COALESCE(NULLIF(_pos, 'Member'), 'Committee') END);
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS chat_stamp_author ON public.chat_messages;
CREATE TRIGGER chat_stamp_author BEFORE INSERT OR UPDATE ON public.chat_messages FOR EACH ROW EXECUTE FUNCTION public.chat_stamp_author();

-- Live updates.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
     AND NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'chat_messages') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_messages;
  END IF;
END $$;
