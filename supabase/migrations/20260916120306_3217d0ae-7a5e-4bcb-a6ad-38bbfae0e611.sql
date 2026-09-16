
CREATE TYPE public.app_role AS ENUM ('Owner','Committee');
CREATE TYPE public.levy_status AS ENUM ('Pending','Paid','Overdue');
CREATE TYPE public.compliance_status AS ENUM ('Not Started','In Progress','Complete');
CREATE TYPE public.maintenance_status AS ENUM ('Requested','Quoted','Approved','Complete');

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text,
  display_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profiles_select_own" ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "profiles_update_own" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user_roles_select_own" ON public.user_roles FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE TABLE public.schemes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  address text NOT NULL,
  total_lots integer NOT NULL DEFAULT 0,
  tier text,
  next_agm_date date,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.schemes TO authenticated;
GRANT ALL ON public.schemes TO service_role;
ALTER TABLE public.schemes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "schemes_select" ON public.schemes FOR SELECT TO authenticated USING (true);
CREATE POLICY "schemes_write" ON public.schemes FOR ALL TO authenticated USING (public.has_role(auth.uid(),'Committee')) WITH CHECK (public.has_role(auth.uid(),'Committee'));

CREATE TABLE public.lots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scheme_id uuid NOT NULL REFERENCES public.schemes(id) ON DELETE CASCADE,
  lot_number integer NOT NULL,
  owner_name text,
  owner_email text,
  owner_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  entitlement_percent numeric(6,3) NOT NULL DEFAULT 0,
  occupied_status text NOT NULL DEFAULT 'Owner occupied',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lots TO authenticated;
GRANT ALL ON public.lots TO service_role;
ALTER TABLE public.lots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "lots_select" ON public.lots FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'Committee') OR owner_user_id = auth.uid());
CREATE POLICY "lots_write" ON public.lots FOR ALL TO authenticated USING (public.has_role(auth.uid(),'Committee')) WITH CHECK (public.has_role(auth.uid(),'Committee'));

CREATE OR REPLACE FUNCTION public.owns_lot(_lot_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.lots WHERE id = _lot_id AND owner_user_id = auth.uid())
$$;

CREATE TABLE public.committee_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lot_id uuid NOT NULL REFERENCES public.lots(id) ON DELETE CASCADE,
  role text NOT NULL
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.committee_roles TO authenticated;
GRANT ALL ON public.committee_roles TO service_role;
ALTER TABLE public.committee_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "committee_roles_select" ON public.committee_roles FOR SELECT TO authenticated USING (true);
CREATE POLICY "committee_roles_write" ON public.committee_roles FOR ALL TO authenticated USING (public.has_role(auth.uid(),'Committee')) WITH CHECK (public.has_role(auth.uid(),'Committee'));

CREATE TABLE public.budgets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scheme_id uuid NOT NULL REFERENCES public.schemes(id) ON DELETE CASCADE,
  financial_year text NOT NULL,
  admin_fund_total numeric(12,2) NOT NULL DEFAULT 0,
  maintenance_fund_total numeric(12,2) NOT NULL DEFAULT 0,
  levy_due_date date NOT NULL DEFAULT (now() + interval '30 days')::date,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.budgets TO authenticated;
GRANT ALL ON public.budgets TO service_role;
ALTER TABLE public.budgets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "budgets_select" ON public.budgets FOR SELECT TO authenticated USING (true);
CREATE POLICY "budgets_write" ON public.budgets FOR ALL TO authenticated USING (public.has_role(auth.uid(),'Committee')) WITH CHECK (public.has_role(auth.uid(),'Committee'));

CREATE TABLE public.levies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lot_id uuid NOT NULL REFERENCES public.lots(id) ON DELETE CASCADE,
  budget_id uuid NOT NULL REFERENCES public.budgets(id) ON DELETE CASCADE,
  amount numeric(12,2) NOT NULL DEFAULT 0,
  due_date date NOT NULL,
  status public.levy_status NOT NULL DEFAULT 'Pending',
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.levies TO authenticated;
GRANT ALL ON public.levies TO service_role;
ALTER TABLE public.levies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "levies_select" ON public.levies FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'Committee') OR public.owns_lot(lot_id));
CREATE POLICY "levies_write" ON public.levies FOR ALL TO authenticated USING (public.has_role(auth.uid(),'Committee')) WITH CHECK (public.has_role(auth.uid(),'Committee'));

CREATE OR REPLACE FUNCTION public.generate_levies_for_budget()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.levies (lot_id, budget_id, amount, due_date, status)
  SELECT l.id, NEW.id,
         ROUND((l.entitlement_percent / 100.0) * (NEW.admin_fund_total + NEW.maintenance_fund_total), 2),
         NEW.levy_due_date, 'Pending'
  FROM public.lots l
  WHERE l.scheme_id = NEW.scheme_id;
  RETURN NEW;
END;
$$;
CREATE TRIGGER budgets_generate_levies AFTER INSERT ON public.budgets
FOR EACH ROW EXECUTE FUNCTION public.generate_levies_for_budget();

CREATE TABLE public.compliance_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scheme_id uuid NOT NULL REFERENCES public.schemes(id) ON DELETE CASCADE,
  task_name text NOT NULL,
  detail text,
  due_date date NOT NULL,
  status public.compliance_status NOT NULL DEFAULT 'Not Started',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.compliance_tasks TO authenticated;
GRANT ALL ON public.compliance_tasks TO service_role;
ALTER TABLE public.compliance_tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "compliance_select" ON public.compliance_tasks FOR SELECT TO authenticated USING (true);
CREATE POLICY "compliance_write" ON public.compliance_tasks FOR ALL TO authenticated USING (public.has_role(auth.uid(),'Committee')) WITH CHECK (public.has_role(auth.uid(),'Committee'));

CREATE TABLE public.maintenance_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scheme_id uuid NOT NULL REFERENCES public.schemes(id) ON DELETE CASCADE,
  submitted_by_lot_id uuid REFERENCES public.lots(id) ON DELETE SET NULL,
  title text NOT NULL,
  description text,
  status public.maintenance_status NOT NULL DEFAULT 'Requested',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.maintenance_requests TO authenticated;
GRANT ALL ON public.maintenance_requests TO service_role;
ALTER TABLE public.maintenance_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "maintenance_select" ON public.maintenance_requests FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'Committee') OR public.owns_lot(submitted_by_lot_id));
CREATE POLICY "maintenance_insert" ON public.maintenance_requests FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'Committee') OR public.owns_lot(submitted_by_lot_id));
CREATE POLICY "maintenance_update" ON public.maintenance_requests FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'Committee')) WITH CHECK (public.has_role(auth.uid(),'Committee'));
CREATE POLICY "maintenance_delete" ON public.maintenance_requests FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(),'Committee'));

CREATE TABLE public.documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scheme_id uuid NOT NULL REFERENCES public.schemes(id) ON DELETE CASCADE,
  name text NOT NULL,
  category text,
  uploaded_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.documents TO authenticated;
GRANT ALL ON public.documents TO service_role;
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "documents_select" ON public.documents FOR SELECT TO authenticated USING (true);
CREATE POLICY "documents_write" ON public.documents FOR ALL TO authenticated USING (public.has_role(auth.uid(),'Committee')) WITH CHECK (public.has_role(auth.uid(),'Committee'));

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _role public.app_role;
BEGIN
  INSERT INTO public.profiles (id, email, display_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email,'@',1)))
  ON CONFLICT (id) DO NOTHING;

  _role := CASE WHEN COALESCE(NEW.raw_user_meta_data->>'role','Owner') = 'Committee'
                THEN 'Committee'::public.app_role ELSE 'Owner'::public.app_role END;
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, _role) ON CONFLICT DO NOTHING;

  UPDATE public.lots SET owner_user_id = NEW.id
  WHERE owner_user_id IS NULL AND lower(owner_email) = lower(NEW.email);

  RETURN NEW;
END;
$$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Seed data
INSERT INTO public.schemes (id, name, address, total_lots, tier, next_agm_date) VALUES
  ('11111111-1111-1111-1111-111111111111','Banksia Court','12 Banksia Street, Brunswick VIC 3056',8,'Tier 3',(now() + interval '46 days')::date);

INSERT INTO public.lots (id, scheme_id, lot_number, owner_name, owner_email, entitlement_percent, occupied_status) VALUES
 ('22222222-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111',1,'Jane Citizen','jane@example.com',13.500,'Owner occupied'),
 ('22222222-0000-0000-0000-000000000002','11111111-1111-1111-1111-111111111111',2,'Michael Tran','michael@example.com',12.000,'Tenanted'),
 ('22222222-0000-0000-0000-000000000003','11111111-1111-1111-1111-111111111111',3,'Priya Nair','priya@example.com',12.500,'Owner occupied'),
 ('22222222-0000-0000-0000-000000000004','11111111-1111-1111-1111-111111111111',4,'Tom Baker','tom@example.com',11.000,'Owner occupied'),
 ('22222222-0000-0000-0000-000000000005','11111111-1111-1111-1111-111111111111',5,'Sofia Rossi','sofia@example.com',13.000,'Tenanted'),
 ('22222222-0000-0000-0000-000000000006','11111111-1111-1111-1111-111111111111',6,'Daniel Okafor','daniel@example.com',12.000,'Owner occupied'),
 ('22222222-0000-0000-0000-000000000007','11111111-1111-1111-1111-111111111111',7,'Alice Wong','alice@example.com',13.000,'Owner occupied'),
 ('22222222-0000-0000-0000-000000000008','11111111-1111-1111-1111-111111111111',8,'Ben Harris','ben@example.com',13.000,'Tenanted');

INSERT INTO public.committee_roles (lot_id, role) VALUES
 ('22222222-0000-0000-0000-000000000001','Chairperson'),
 ('22222222-0000-0000-0000-000000000003','Secretary'),
 ('22222222-0000-0000-0000-000000000005','Treasurer');

INSERT INTO public.budgets (id, scheme_id, financial_year, admin_fund_total, maintenance_fund_total, levy_due_date) VALUES
 ('33333333-3333-3333-3333-333333333333','11111111-1111-1111-1111-111111111111','2025/26',28000.00,14000.00,(now() - interval '10 days')::date);

UPDATE public.levies SET status = 'Paid', paid_at = now() - interval '25 days', due_date = (now() - interval '40 days')::date
WHERE lot_id IN ('22222222-0000-0000-0000-000000000001','22222222-0000-0000-0000-000000000002');
UPDATE public.levies SET status = 'Paid', paid_at = now() - interval '55 days', due_date = (now() - interval '70 days')::date
WHERE lot_id IN ('22222222-0000-0000-0000-000000000003','22222222-0000-0000-0000-000000000004');
UPDATE public.levies SET status = 'Paid', paid_at = now() - interval '5 days'
WHERE lot_id = '22222222-0000-0000-0000-000000000005';

INSERT INTO public.compliance_tasks (scheme_id, task_name, detail, due_date, status) VALUES
 ('11111111-1111-1111-1111-111111111111','Annual fire safety statement','Certification by an accredited practitioner',(now() + interval '9 days')::date,'In Progress'),
 ('11111111-1111-1111-1111-111111111111','Building insurance renewal','Cover must never lapse',(now() + interval '63 days')::date,'Not Started'),
 ('11111111-1111-1111-1111-111111111111','Annual general meeting notice','Written notice to every owner',(now() + interval '25 days')::date,'Not Started'),
 ('11111111-1111-1111-1111-111111111111','Annual financial statements','What came in, what went out',(now() - interval '6 days')::date,'Complete');

INSERT INTO public.maintenance_requests (scheme_id, submitted_by_lot_id, title, description, status, created_at) VALUES
 ('11111111-1111-1111-1111-111111111111','22222222-0000-0000-0000-000000000002','Leaking gutter above carport','Water pooling near the bin store after rain','Quoted',now() - interval '12 days'),
 ('11111111-1111-1111-1111-111111111111','22222222-0000-0000-0000-000000000005','Front gate intercom not working','Buzzer has no sound at lots 4 to 8','Approved',now() - interval '6 days'),
 ('11111111-1111-1111-1111-111111111111','22222222-0000-0000-0000-000000000007','Stairwell light out','Level one landing, globe replacement','Requested',now() - interval '2 days');

INSERT INTO public.documents (scheme_id, name, category) VALUES
 ('11111111-1111-1111-1111-111111111111','AGM minutes 2025','Minutes'),
 ('11111111-1111-1111-1111-111111111111','Certificate of currency 2025/26','Insurance'),
 ('11111111-1111-1111-1111-111111111111','Plan of subdivision PS 12345','Plans');
