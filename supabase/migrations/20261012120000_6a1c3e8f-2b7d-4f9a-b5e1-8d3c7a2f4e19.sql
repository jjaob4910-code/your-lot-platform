-- Loty staff tools: a colour and cover photo per building, and private notes.
-- Visible to Loty staff only; owners and committees never see any of it. Safe to run more than once.

CREATE TABLE IF NOT EXISTS public.loty_buildings (
  scheme_id uuid PRIMARY KEY REFERENCES public.schemes(id) ON DELETE CASCADE,
  color text CHECK (color IN ('blue','green','amber','red','purple','grey')),
  cover_path text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.loty_buildings ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.loty_buildings TO authenticated;
DROP POLICY IF EXISTS staff_all ON public.loty_buildings;
CREATE POLICY staff_all ON public.loty_buildings FOR ALL TO authenticated USING (public.is_loty_staff()) WITH CHECK (public.is_loty_staff());

CREATE TABLE IF NOT EXISTS public.loty_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scheme_id uuid NOT NULL REFERENCES public.schemes(id) ON DELETE CASCADE,
  author_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  author_name text,
  body text NOT NULL CHECK (length(btrim(body)) BETWEEN 1 AND 4000),
  pinned boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS loty_notes_scheme ON public.loty_notes (scheme_id, created_at DESC);
ALTER TABLE public.loty_notes ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.loty_notes TO authenticated;
DROP POLICY IF EXISTS staff_read ON public.loty_notes;
DROP POLICY IF EXISTS staff_add ON public.loty_notes;
DROP POLICY IF EXISTS staff_pin ON public.loty_notes;
DROP POLICY IF EXISTS author_delete ON public.loty_notes;
CREATE POLICY staff_read ON public.loty_notes FOR SELECT TO authenticated USING (public.is_loty_staff());
CREATE POLICY staff_add ON public.loty_notes FOR INSERT TO authenticated WITH CHECK (public.is_loty_staff() AND author_id = auth.uid());
CREATE POLICY staff_pin ON public.loty_notes FOR UPDATE TO authenticated USING (public.is_loty_staff()) WITH CHECK (public.is_loty_staff());
CREATE POLICY author_delete ON public.loty_notes FOR DELETE TO authenticated USING (public.is_loty_staff() AND author_id = auth.uid());

-- Only the pin can change after a note is written; the author's name comes from their profile.
CREATE OR REPLACE FUNCTION public.loty_note_stamp() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    NEW.scheme_id := OLD.scheme_id; NEW.author_id := OLD.author_id; NEW.author_name := OLD.author_name;
    NEW.body := OLD.body; NEW.created_at := OLD.created_at;
    RETURN NEW;
  END IF;
  NEW.author_id := auth.uid(); NEW.created_at := now();
  NEW.author_name := COALESCE((SELECT NULLIF(btrim(full_name), '') FROM public.profiles WHERE id = auth.uid()),
                              (SELECT split_part(email, '@', 1) FROM auth.users WHERE id = auth.uid()), 'Loty');
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS loty_note_stamp ON public.loty_notes;
CREATE TRIGGER loty_note_stamp BEFORE INSERT OR UPDATE ON public.loty_notes FOR EACH ROW EXECUTE FUNCTION public.loty_note_stamp();

-- Cover photos: private, staff only; the app shows them through short-lived signed links.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('loty-covers', 'loty-covers', false, 5242880, ARRAY['image/jpeg','image/png','image/webp'])
ON CONFLICT (id) DO UPDATE SET public = false, file_size_limit = 5242880, allowed_mime_types = EXCLUDED.allowed_mime_types;
DROP POLICY IF EXISTS loty_covers_staff ON storage.objects;
CREATE POLICY loty_covers_staff ON storage.objects FOR ALL TO authenticated
  USING (bucket_id = 'loty-covers' AND public.is_loty_staff()) WITH CHECK (bucket_id = 'loty-covers' AND public.is_loty_staff());
