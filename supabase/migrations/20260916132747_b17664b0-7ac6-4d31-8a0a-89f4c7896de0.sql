DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['schemes','lots','committee_roles','budgets','levies','compliance_tasks','maintenance_requests','documents'] LOOP
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO anon', t);
    EXECUTE format('DROP POLICY IF EXISTS "prototype_open_access" ON public.%I', t);
    EXECUTE format('CREATE POLICY "prototype_open_access" ON public.%I FOR ALL TO anon USING (true) WITH CHECK (true)', t);
  END LOOP;
END $$;