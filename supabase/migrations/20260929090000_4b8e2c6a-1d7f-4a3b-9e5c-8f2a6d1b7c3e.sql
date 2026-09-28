-- Insurance claims: log a claim against a policy, follow it to a decision, and
-- record the payout into Finance only once it's actually received.
CREATE TABLE public.insurance_claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scheme_id uuid NOT NULL REFERENCES public.schemes(id) ON DELETE CASCADE,
  policy_id uuid REFERENCES public.insurance_policies(id) ON DELETE SET NULL,
  claim_number text,
  title text NOT NULL,
  description text,
  incident_date date,
  lodged_date date,
  status text NOT NULL DEFAULT 'Lodged' CHECK (status IN ('Draft','Lodged','Under assessment','Approved','Partially approved','Declined','Paid','Withdrawn')),
  responsible_lot_id uuid REFERENCES public.lots(id) ON DELETE SET NULL,
  responsible_name text,
  insurer_contact_name text,
  insurer_contact_phone text,
  insurer_contact_email text,
  claim_amount numeric(12,2),
  excess numeric(12,2),
  approved_amount numeric(12,2),
  decision_date date,
  decision_notes text,
  work_order_id uuid REFERENCES public.maintenance_requests(id) ON DELETE SET NULL,
  payout_received_at date,
  finance_transaction_id uuid REFERENCES public.finance_transactions(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX insurance_claims_scheme_idx ON public.insurance_claims (scheme_id, created_at DESC);
CREATE TRIGGER insurance_claims_updated_at BEFORE UPDATE ON public.insurance_claims
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.insurance_claim_updates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_id uuid NOT NULL REFERENCES public.insurance_claims(id) ON DELETE CASCADE,
  note text NOT NULL,
  author_label text,
  status_at_time text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX insurance_claim_updates_claim_idx ON public.insurance_claim_updates (claim_id, created_at);

ALTER TABLE public.documents
  ADD COLUMN insurance_claim_id uuid REFERENCES public.insurance_claims(id) ON DELETE CASCADE;
ALTER TABLE public.finance_transactions
  ADD COLUMN insurance_claim_id uuid REFERENCES public.insurance_claims(id) ON DELETE SET NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.insurance_claims, public.insurance_claim_updates TO authenticated, anon;
GRANT ALL ON public.insurance_claims, public.insurance_claim_updates TO service_role;
ALTER TABLE public.insurance_claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.insurance_claim_updates ENABLE ROW LEVEL SECURITY;

CREATE POLICY prototype_open_access ON public.insurance_claims FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY insurance_claims_select ON public.insurance_claims FOR SELECT TO authenticated USING (true);
CREATE POLICY insurance_claims_write ON public.insurance_claims FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'Committee')) WITH CHECK (public.has_role(auth.uid(), 'Committee'));

-- Anyone signed in can read the trail and add a note; only the committee edits or removes notes.
CREATE POLICY prototype_open_access ON public.insurance_claim_updates FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY insurance_claim_updates_select ON public.insurance_claim_updates FOR SELECT TO authenticated USING (true);
CREATE POLICY insurance_claim_updates_insert ON public.insurance_claim_updates FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY insurance_claim_updates_modify ON public.insurance_claim_updates FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'Committee')) WITH CHECK (public.has_role(auth.uid(), 'Committee'));
CREATE POLICY insurance_claim_updates_delete ON public.insurance_claim_updates FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'Committee'));
