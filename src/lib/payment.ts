// How an owner pays their levy, worked out from the committee's details in Settings.
export type PaySettings = {
  pay_account_name?: string | null; pay_bsb?: string | null; pay_account_number?: string | null;
  pay_reference?: string | null; pay_other?: string | null;
} | null | undefined;

export type PaymentDetails = { accountName: string; bsb: string; accountNumber: string; reference: string; other: string };

/** Null until the committee has added at least an account or another way to pay. */
export function paymentDetails(settings: PaySettings, lotNumber: number | null | undefined): PaymentDetails | null {
  const bsb = settings?.pay_bsb?.trim() ?? "";
  const accountNumber = settings?.pay_account_number?.trim() ?? "";
  const other = settings?.pay_other?.trim() ?? "";
  if (!(bsb && accountNumber) && !other) return null;
  const template = settings?.pay_reference?.trim() || "LOT{lot}";
  return {
    accountName: settings?.pay_account_name?.trim() ?? "",
    bsb, accountNumber, other,
    reference: lotNumber != null ? template.replace(/\{lot\}/gi, String(lotNumber)) : template,
  };
}

/** Plain-text block for emails and invoices. */
export function paymentText(p: PaymentDetails | null): string {
  if (!p) return "";
  return [
    "How to pay:",
    ...(p.bsb && p.accountNumber ? [
      p.accountName ? `  Account name: ${p.accountName}` : "",
      `  BSB: ${p.bsb}`,
      `  Account number: ${p.accountNumber}`,
      `  Reference: ${p.reference}`,
    ] : []),
    p.other ? `  ${p.other}` : "",
  ].filter(Boolean).join("\n");
}

// The open building's payment settings, set by the dashboard, so levy emails and invoices built
// deep inside Finance can include them without threading props through every component.
let currentSettings: PaySettings = null;
export const setCurrentPaySettings = (s: PaySettings) => { currentSettings = s; };
export const currentPayment = (lotNumber: number | null | undefined) => paymentDetails(currentSettings, lotNumber);
