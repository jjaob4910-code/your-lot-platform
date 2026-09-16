CREATE TABLE public.document_folders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scheme_id uuid NOT NULL REFERENCES public.schemes(id) ON DELETE CASCADE,
  parent_id uuid REFERENCES public.document_folders(id) ON DELETE CASCADE,
  name text NOT NULL,
  icon text NOT NULL DEFAULT 'Folder',
  color text NOT NULL DEFAULT 'default',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.document_folders TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.document_folders TO anon;
GRANT ALL ON public.document_folders TO service_role;

ALTER TABLE public.document_folders ENABLE ROW LEVEL SECURITY;

CREATE POLICY prototype_open_access ON public.document_folders FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY document_folders_select ON public.document_folders FOR SELECT TO authenticated USING (true);
CREATE POLICY document_folders_write ON public.document_folders FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'Committee'::app_role)) WITH CHECK (has_role(auth.uid(), 'Committee'::app_role));

CREATE TRIGGER document_folders_updated_at BEFORE UPDATE ON public.document_folders
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.documents
  ADD COLUMN folder_id uuid REFERENCES public.document_folders(id) ON DELETE SET NULL,
  ADD COLUMN storage_path text,
  ADD COLUMN file_size bigint,
  ADD COLUMN mime_type text,
  ADD COLUMN shared_with_owners boolean NOT NULL DEFAULT false,
  ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();

CREATE TRIGGER documents_updated_at BEFORE UPDATE ON public.documents
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

GRANT SELECT, INSERT, UPDATE, DELETE ON public.documents TO anon;