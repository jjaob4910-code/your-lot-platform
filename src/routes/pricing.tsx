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
  return <div className="min-h-screen"><SiteHeader/><main className="mx-auto max-w-6xl px-5 py-16 sm:px-8 sm:py-24"><div className="mx-auto max-w-3xl text-center"><p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Simple annual pricing</p><h1 className="mt-5 text-4xl font-semibold sm:text-6xl">A plan that fits your committee</h1><p className="mx-auto mt-6 max-w-xl leading-7 text-muted-foreground">Clear per-lot pricing for small schemes. No lock-in, hidden modules or enterprise overhead.</p></div><div className="mt-14 grid gap-6 md:grid-cols-2"><PlanCard name="Self-Serve" price="$149" detail="Per lot, billed annually. Best for confident committees that want one reliable workspace." features={["Levy notices and payment records", "Owners corporation trust records", "Compliance calendar and reminders", "Maintenance request workflow", "Document register", "Committee access"]}/><PlanCard featured name="Managed-Lite" price="$249" detail="Per lot, billed annually. A supported option for committees wanting an expert safety net." features={["Everything in Self-Serve", "Annual compliance records review", "AGM preparation checklist", "Priority committee support", "Document health check", "Guided annual setup"]}/></div><p className="mt-8 text-center text-sm text-muted-foreground">Prices include GST. Available for owners corporations of 6–10 lots.</p></main></div>;
}