CREATE TABLE public.finance_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scheme_id uuid NOT NULL REFERENCES public.schemes(id) ON DELETE CASCADE,
  direction text NOT NULL DEFAULT 'out',
  fund text NOT NULL DEFAULT 'Admin',
  category text,
  description text NOT NULL,
  supplier text,
  amount numeric NOT NULL DEFAULT 0,
  occurred_on date NOT NULL DEFAULT current_date,
  status text NOT NULL DEFAULT 'Paid',
  work_order_id uuid REFERENCES public.maintenance_requests(id) ON DELETE SET NULL,
  notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.finance_transactions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.finance_transactions TO anon;
GRANT ALL ON public.finance_transactions TO service_role;

ALTER TABLE public.finance_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY prototype_open_access ON public.finance_transactions FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY finance_select ON public.finance_transactions FOR SELECT TO authenticated USING (true);
CREATE POLICY finance_write ON public.finance_transactions FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'Committee'::app_role)) WITH CHECK (has_role(auth.uid(), 'Committee'::app_role));

CREATE INDEX finance_transactions_scheme_idx ON public.finance_transactions (scheme_id, occurred_on DESC);

CREATE TRIGGER finance_transactions_updated_at BEFORE UPDATE ON public.finance_transactions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.documents ADD COLUMN finance_transaction_id uuid REFERENCES public.finance_transactions(id) ON DELETE SET NULL;
CREATE INDEX documents_finance_transaction_idx ON public.documents (finance_transaction_id);