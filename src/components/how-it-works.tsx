import { useState } from "react";
import { ChevronDown } from "lucide-react";

// A short, foldable "How this works" under each page intro: the few steps that page is for,
// worded for whoever is reading. Open/closed is remembered per page on this device.

export type HowPage = "finance" | "workOrders" | "insurance" | "agm" | "documents";

const STEPS: Record<HowPage, { committee: string[]; owner: string[] }> = {
  finance: {
    committee: ["Set this year's budget. Loty splits it into each lot's levy by entitlement.", "Send the levy notices. Each owner gets their amount, due date and how to pay.", "Mark levies paid as the money arrives, and send reminders to anyone overdue.", "Record expenses as you pay them, so the funds and cashflow stay accurate."],
    owner: ["Your levy is your share of the building's budget, worked out from your lot entitlement.", "Pay it by the due date using the details under How to pay, with your own reference.", "The committee marks it paid once the money arrives.", "Below, see what the building's money is being spent on this year."],
  },
  workOrders: {
    committee: ["Log the job, or pick up a problem an owner reported.", "Collect quotes and choose one. Ask owners to approve it if it's a big spend.", "Mark the works done, then record the payment. It lands in Finance for you."],
    owner: ["Report a problem in your lot or the common areas, with a photo if you can.", "The committee takes it from there: quotes, approval and the repair.", "If owners need to approve the spend, you'll be asked to vote here."],
  },
  insurance: {
    committee: ["Add each policy with its insurer, premium, excess and renewal date.", "Attach the policy documents. They file themselves in Documents.", "Log a claim when something happens and follow it through to payout.", "Loty reminds you before each renewal."],
    owner: ["See what the building is insured for and when it renews.", "Your own contents and lot fit-out usually need your own policy.", "Tell the committee if something happens that might need a claim."],
  },
  agm: {
    committee: ["Build the agenda. Owners can suggest items while it's in draft.", "Send the notice to owners before the deadline.", "On the day, record who's there, the votes and the minutes.", "Publish the minutes so every owner can read them."],
    owner: ["Suggest an item for the agenda before the notice goes out.", "Read the notice and agenda, then attend or send a proxy.", "Read the minutes afterwards to see what was decided."],
  },
  documents: {
    committee: ["Make folders that suit your building.", "Upload files, then share the ones owners should see.", "Minutes, policies and invoices attached elsewhere file themselves here."],
    owner: ["Here are the files your committee has shared with owners.", "Open or download anything, any time."],
  },
};

const read = (k: string) => { try { return localStorage.getItem(k) === "1"; } catch { return false; } };
const write = (k: string, v: boolean) => { try { localStorage.setItem(k, v ? "1" : "0"); } catch { /* private window */ } };

export function HowItWorks({ page, committee }: { page: HowPage; committee: boolean }) {
  const key = `loty-how-${page}`;
  const [open, setOpen] = useState(() => read(key));
  const steps = STEPS[page][committee ? "committee" : "owner"];
  return <div className="-mt-4 mb-6" data-how={page}>
    <button type="button" aria-expanded={open} onClick={() => { setOpen(!open); write(key, !open); }}
      className="inline-flex items-center gap-1 text-[13px] font-medium text-primary hover:underline">
      How this works <ChevronDown className={`size-3.5 transition-transform ${open ? "rotate-180" : ""}`}/>
    </button>
    {open && <ol className="mt-2 max-w-2xl list-decimal space-y-1 pl-5 text-[13px] text-muted-foreground">
      {steps.map(s => <li key={s}>{s}</li>)}
    </ol>}
  </div>;
}
