import { HowItWorks } from "./how-it-works";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Copy } from "lucide-react";
import { toast } from "sonner";
import { Help } from "@/components/help";
import type { PaymentDetails } from "@/lib/payment";
import { supabase } from "@/integrations/supabase/client";
import { daysUntil, money, moneyCents, niceDate } from "@/lib/format";
import { budgetStartYear, currentFinancialYearStart, type Levy } from "@/lib/fund-balance";

type Summary = {
  financial_year: number; budget_total: number; levies_issued: number; levies_paid: number;
  funds: { id: string; name: string; budget: number; spent: number; balance: number }[];
};
type BudgetLine = { id: string; fund_id: string; description: string; amount: number; budget_id: string };
type Budget = { id: string; financial_year: string };

const fyLabel = (y: number) => `${y}/${String(y + 1).slice(2)}`;

type Tx = { id: string; direction: string; fund_id: string; description: string; supplier: string | null; amount: number; occurred_on: string; status: string; levy_id: string | null; voided_at?: string | null };

/** An owner's Finance page: what they owe and have paid, where the building's money goes, and every
 *  payment and receipt (read-only). Other owners' levy payments are rolled into one total. */
export function OwnerFinance({ schemeId, levies, myLotId, budgets, lineItems, payment, transactions = [], funds = [] }: {
  schemeId?: string | undefined; levies: Levy[]; myLotId: string | null; budgets: Budget[]; lineItems: BudgetLine[];
  transactions?: Tx[]; funds?: { id: string; name: string }[];
  /** How to pay, with this owner's own reference; null until the committee adds it. */
  payment: PaymentDetails | null;
}) {
  const summary = useQuery({
    queryKey: ["finance-summary", schemeId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("building_finance_summary", { _scheme: schemeId! });
      if (error) throw error;
      return data as unknown as Summary;
    },
    enabled: !!schemeId,
  });
  const mine = levies.filter(l => l.lot_id === myLotId).sort((a, b) => b.due_date.localeCompare(a.due_date));
  const owing = mine.filter(l => l.status !== "Paid");
  const owingTotal = owing.reduce((t, l) => t + Number(l.amount), 0);
  const fy = currentFinancialYearStart();
  const budget = budgets.find(b => budgetStartYear(b.financial_year) === fy);
  const lines = budget ? lineItems.filter(l => l.budget_id === budget.id).sort((a, b) => Number(b.amount) - Number(a.amount)) : [];
  const s = summary.data && Array.isArray(summary.data.funds) ? summary.data : null;
  const paidPct = s && s.levies_issued > 0 ? Math.round((s.levies_paid / s.levies_issued) * 100) : null;

  return <div>
    <div className="max-w-2xl">
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Your property</p>
      <h1 className="mt-4 text-4xl font-medium tracking-[-0.035em] sm:text-5xl">Finance</h1>
      <p className="mt-5 text-[15px] leading-7 text-muted-foreground">Your levies, and where the building's money goes this year.</p>
    </div>
    <div className="mt-4"><HowItWorks page="finance" committee={false}/></div>

    <section className="soft-shadow mt-10 rounded-3xl border border-border/70 bg-card p-5 sm:p-7">
      <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Your levies <Help term="levy"/></p>
      <p className="mt-3 font-display text-3xl font-medium tracking-[-0.03em]">{owing.length ? money(owingTotal) : "All paid"}</p>
      <p className="mt-1 text-[13px] text-muted-foreground">{owing.length ? `to pay across ${owing.length} ${owing.length === 1 ? "levy" : "levies"}` : mine.length ? "Nothing owing right now." : "No levies issued to your lot yet."}</p>
      {mine.length > 0 && <ul className="mt-5 divide-y divide-border/60 text-[13px]">
        {mine.map(l => { const left = daysUntil(l.due_date); const paid = l.status === "Paid";
          return <li key={l.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
            <span>{l.label || `Levy ${l.budgets?.financial_year ?? ""}`.trim()}<span className="text-muted-foreground"> · due {niceDate(l.due_date)}</span></span>
            <span className="flex items-center gap-3">
              <span className="tabular-nums">{money(Number(l.amount))}</span>
              <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium ${paid ? "bg-emerald-600/10 text-emerald-700 dark:text-emerald-400" : left < 0 ? "bg-destructive/10 text-destructive" : "bg-secondary text-muted-foreground"}`}>
                {paid ? `Paid${l.paid_at ? ` ${niceDate(l.paid_at)}` : ""}` : left < 0 ? `${-left} days overdue` : "To pay"}</span>
            </span>
          </li>; })}
      </ul>}
      <div id="how-to-pay" className="mt-6 rounded-2xl border border-border/70 bg-secondary/30 p-4">
        <p className="text-sm font-medium">How to pay</p>
        {payment
          ? <dl className="mt-3 grid gap-x-6 gap-y-2 text-[13px] sm:grid-cols-2">
              {payment.accountName && <PayRow label="Account name" value={payment.accountName}/>}
              {payment.bsb && <PayRow label="BSB" value={payment.bsb} copy/>}
              {payment.accountNumber && <PayRow label="Account number" value={payment.accountNumber} copy/>}
              {payment.bsb && <PayRow label="Your reference" value={payment.reference} copy hint="Use this so the treasurer knows the payment is yours."/>}
              {payment.other && <div className="sm:col-span-2"><dt className="text-muted-foreground">Other ways to pay</dt><dd>{payment.other}</dd></div>}
            </dl>
          : <p className="mt-1 text-[13px] text-muted-foreground">Your committee hasn't added payment details yet. Contact them to arrange payment.</p>}
        <p className="mt-3 text-[12px] text-muted-foreground">Your payment shows here as paid once the treasurer records it.</p>
      </div>
    </section>

    <section className="soft-shadow mt-6 rounded-3xl border border-border/70 bg-card p-5 sm:p-7">
      <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Building summary · {fyLabel(fy)} <Help term="funds"/></p>
      {summary.isLoading ? <p className="mt-3 text-sm text-muted-foreground">Loading…</p>
        : !s || !budget ? <p className="mt-3 text-sm text-muted-foreground">The committee hasn't set this year's budget yet.</p>
        : <>
          <div className="mt-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <p className="font-display text-3xl font-medium tracking-[-0.03em]">{money(Number(s.budget_total))}</p>
            <p className="flex items-center gap-1.5 text-[13px] text-muted-foreground"><Help term="budget"/>budgeted this year{paidPct !== null ? ` · ${paidPct}% of levies collected` : ""}</p>
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {s.funds.map(f => { const pct = Number(f.budget) > 0 ? Math.min(100, Math.round((Number(f.spent) / Number(f.budget)) * 100)) : 0;
              return <div key={f.id} className="rounded-2xl border border-border/70 p-4 text-[13px]">
                <p className="font-medium">{f.name} fund</p>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-secondary"><div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }}/></div>
                <p className="mt-2 text-muted-foreground">{money(Number(f.spent))} spent of {money(Number(f.budget))}</p>
                <p className="text-muted-foreground">Balance {money(Number(f.balance))}</p>
              </div>; })}
          </div>
          {lines.length > 0 && <>
            <p className="mt-6 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">What the budget covers</p>
            <ul className="mt-2 divide-y divide-border/60 text-[13px]">
              {lines.slice(0, 12).map(l => <li key={l.id} className="flex justify-between gap-3 py-2"><span>{l.description}</span><span className="tabular-nums text-muted-foreground">{money(Number(l.amount))}</span></li>)}
            </ul>
          </>}
        </>}
    </section>

    <OwnerLedger transactions={transactions} funds={funds}/>
  </div>;
}

/** Every payment and receipt the committee has recorded, newest first. Read-only. */
function OwnerLedger({ transactions, funds }: { transactions: Tx[]; funds: { id: string; name: string }[] }) {
  const [all, setAll] = useState(false);
  const rows = transactions.filter(t => !t.voided_at && !(t.direction === "in" && t.levy_id))
    .sort((a, b) => b.occurred_on.localeCompare(a.occurred_on));
  const fundName = (id: string) => funds.find(f => f.id === id)?.name;
  const shown = all ? rows : rows.slice(0, 8);
  return <section className="soft-shadow mt-6 rounded-3xl border border-border/70 bg-card p-5 sm:p-7" id="owner-ledger">
    <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Payments and receipts</p>
    <p className="mt-2 text-[13px] text-muted-foreground">Everything the committee has paid or received for the building. Levy payments from owners are counted in the summary above, not listed one by one.</p>
    {rows.length === 0 ? <p className="mt-4 text-sm text-muted-foreground">Nothing recorded yet.</p>
      : <ul className="mt-4 divide-y divide-border/60 text-[13px]">
        {shown.map(t => <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
          <span className="min-w-0">
            <span className="font-medium">{t.description}</span>
            <span className="block text-[12px] text-muted-foreground">{niceDate(t.occurred_on)}{t.supplier ? ` · ${t.supplier}` : ""}{fundName(t.fund_id) ? ` · ${fundName(t.fund_id)} fund` : ""}{t.status !== "Paid" ? ` · ${t.status}` : ""}</span>
          </span>
          <span className={`tabular-nums ${t.direction === "in" ? "text-emerald-700 dark:text-emerald-400" : ""}`}>{t.direction === "in" ? "+" : "−"}{moneyCents(Number(t.amount))}</span>
        </li>)}
      </ul>}
    {rows.length > 8 && <button type="button" onClick={() => setAll(!all)} className="mt-3 text-[13px] font-medium text-primary hover:underline">{all ? "Show fewer" : `Show all ${rows.length}`}</button>}
  </section>;
}

function PayRow({ label, value, copy, hint }: { label: string; value: string; copy?: boolean; hint?: string }) {
  const doCopy = async () => {
    try { await navigator.clipboard.writeText(value); toast(`${label} copied`); }
    catch { toast("Select it and copy", { description: "Your browser didn't allow copying." }); }
  };
  return <div className="min-w-0">
    <dt className="text-muted-foreground">{label}</dt>
    <dd className="flex items-center gap-2 font-medium tabular-nums">
      <span className="select-all">{value}</span>
      {copy && <button type="button" onClick={() => void doCopy()} aria-label={`Copy ${label.toLowerCase()}`} className="grid size-6 place-items-center rounded-full text-muted-foreground hover:bg-secondary hover:text-foreground"><Copy className="size-3.5"/></button>}
    </dd>
    {hint && <dd className="text-[11px] text-muted-foreground">{hint}</dd>}
  </div>;
}
