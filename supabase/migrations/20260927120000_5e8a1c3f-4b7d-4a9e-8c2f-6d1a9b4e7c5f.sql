-- Levies: track when a levy notice/email was last sent, and snapshot the
-- amount at send time so the UI can detect "amount changed since sent".
ALTER TABLE public.levies
  ADD COLUMN notified_at timestamptz,
  ADD COLUMN notified_amount numeric;

-- Notices: allow optionally targeting a single lot (owner) instead of the
-- whole scheme. NULL lot_id = broadcast (today's behavior, unchanged).
ALTER TABLE public.notices
  ADD COLUMN lot_id uuid REFERENCES public.lots(id) ON DELETE CASCADE,
  ADD COLUMN levy_id uuid REFERENCES public.levies(id) ON DELETE SET NULL;

-- Finance transactions: link a transaction back to the levy it was raised
-- from, for traceability and to avoid double-creating rows on repeat clicks.
ALTER TABLE public.finance_transactions
  ADD COLUMN levy_id uuid REFERENCES public.levies(id) ON DELETE SET NULL;

CREATE INDEX finance_transactions_levy_id_idx ON public.finance_transactions (levy_id);
CREATE INDEX notices_lot_id_idx ON public.notices (lot_id);
