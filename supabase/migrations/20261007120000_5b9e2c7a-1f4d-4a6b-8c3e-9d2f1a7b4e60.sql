-- How owners pay their levies: shown on the owner's Finance page, levy invoices and reminder emails.
-- pay_reference is a template; {lot} becomes the lot number (e.g. LOT{lot} → LOT7).
ALTER TABLE public.scheme_settings
  ADD COLUMN IF NOT EXISTS pay_account_name text,
  ADD COLUMN IF NOT EXISTS pay_bsb text,
  ADD COLUMN IF NOT EXISTS pay_account_number text,
  ADD COLUMN IF NOT EXISTS pay_reference text NOT NULL DEFAULT 'LOT{lot}',
  ADD COLUMN IF NOT EXISTS pay_other text;
