import { createFileRoute } from "@tanstack/react-router";
import { SiteHeader } from "@/components/site-header";
import { PlanCard } from "@/components/plan-card";


export const Route = createFileRoute("/pricing")({
  head: () => ({ meta: [
    { title: "Pricing — Your Lot" },
    { name: "description", content: "Simple annual pricing for self-managed owners corporations with 6–10 lots." },
    { property: "og:title", content: "Your Lot pricing" },
    { property: "og:description", content: "Choose Self-Serve or Managed-Lite support for your owners corporation." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
  ]}), component: PricingPage,
});

function PricingPage() {
  return <div className="relative isolate min-h-screen bg-background"><BackdropTexture/><SiteHeader/><main className="mx-auto max-w-6xl px-5 py-20 sm:px-8 sm:py-28"><div className="max-w-4xl"><p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Simple annual pricing</p><h1 className="mt-6 text-5xl font-medium leading-[1.05] sm:text-7xl">The right level of help,<br/>without the overhead.</h1><p className="mt-7 max-w-xl text-lg font-light leading-7 text-muted-foreground">Clear per-lot pricing for six-to-ten lot schemes. No hidden modules or enterprise complexity.</p></div><div className="mt-20 grid gap-5 md:grid-cols-2"><PlanCard name="Self-Serve" price="$149" detail="Per lot, billed annually. For confident committees that want one reliable workspace." features={["Levy notices and payment records", "Owners corporation trust records", "Compliance calendar and reminders", "Maintenance request workflow", "Document register", "Committee access"]}/><PlanCard featured name="Managed-Lite" price="$249" detail="Per lot, billed annually. For committees wanting an expert safety net." features={["Everything in Self-Serve", "Annual compliance records review", "AGM preparation checklist", "Priority committee support", "Document health check", "Guided annual setup"]}/></div><div className="mt-10 flex flex-col justify-between gap-3 border-t border-border pt-6 text-xs text-muted-foreground sm:flex-row"><p>Prices include GST.</p><p>Available for owners corporations of 6–10 lots.</p></div></main></div>;
}