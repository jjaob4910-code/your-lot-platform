import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, FileCheck2, Landmark, Wrench } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { DashboardPreview } from "@/components/dashboard-preview";
import { PlanCard } from "@/components/plan-card";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  head: () => ({ meta: [
    { title: "Your Lot — Owners corporation software" },
    { name: "description", content: "A refined operating system for self-managed Australian owners corporations." },
    { property: "og:title", content: "Your Lot — Owners corporation software" },
    { property: "og:description", content: "Levies, compliance and maintenance in one clear workspace." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
  ]}),
  component: HomePage,
});

const features = [
  { icon: Landmark, title: "Levy records", text: "Issue levies, record payments and keep trust records ready for review." },
  { icon: FileCheck2, title: "Compliance", text: "See what is required and keep every recurring obligation in view." },
  { icon: Wrench, title: "Maintenance", text: "Move requests from first report to a clear committee decision." },
];

function HomePage() {
  return <div className="min-h-screen bg-background">
    <SiteHeader />
    <main>
      <section className="mx-auto max-w-6xl px-5 pb-16 pt-20 sm:px-8 sm:pt-28">
        <div className="max-w-4xl">
          <p className="mb-7 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">For self-managed owners corporations</p>
          <h1 className="max-w-4xl text-5xl font-medium leading-[1.02] sm:text-7xl lg:text-[5.4rem]">Strata management,<br/>refined for small schemes.</h1>
          <div className="mt-8 flex max-w-2xl flex-col items-start gap-7 sm:flex-row sm:items-end sm:justify-between">
            <p className="max-w-xl text-base font-light leading-7 text-muted-foreground sm:text-lg">A single operating system for Australian owners corporations. Clear levy records, recurring compliance and transparent maintenance.</p>
            <Button asChild className="shrink-0 rounded-sm"><Link to="/dashboard">View platform <ArrowRight /></Link></Button>
          </div>
        </div>
        <div className="cream-grid relative mt-20 py-8 sm:px-8 sm:py-14"><DashboardPreview /></div>
      </section>

      <section className="border-y border-border py-10"><div className="mx-auto flex max-w-6xl flex-col gap-7 px-5 sm:px-8 md:flex-row md:items-center md:justify-between"><p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Designed around Australian OC requirements</p><div className="flex flex-wrap gap-x-10 gap-y-3 font-display text-xs font-medium text-muted-foreground"><span>Levy records</span><span>Annual meetings</span><span>Insurance</span><span>Owner register</span></div></div></section>

      <section className="mx-auto max-w-6xl px-5 py-24 sm:px-8 sm:py-32">
        <div className="grid gap-12 lg:grid-cols-[.75fr_1.25fr]"><div><p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">One clear workspace</p><h2 className="mt-5 max-w-sm text-4xl font-medium leading-tight sm:text-5xl">Built for capable committees.</h2></div><p className="max-w-lg self-end text-base leading-7 text-muted-foreground">Enough structure to run the scheme properly. None of the complexity designed for large strata portfolios.</p></div>
        <div className="mt-16 grid border-y border-border md:grid-cols-3">{features.map(({icon:Icon,title,text},i)=><article key={title} className={`py-8 md:px-8 ${i>0?"border-t border-border md:border-l md:border-t-0":""}`}><span className="grid size-9 place-items-center rounded-md border border-border"><Icon className="size-4"/></span><h3 className="mt-12 text-lg font-medium">{title}</h3><p className="mt-3 text-sm leading-6 text-muted-foreground">{text}</p></article>)}</div>
      </section>

      <section className="bg-primary py-24 text-primary-foreground sm:py-32"><div className="mx-auto grid max-w-6xl gap-12 px-5 sm:px-8 lg:grid-cols-2"><h2 className="text-4xl font-medium leading-tight sm:text-6xl">Offload the busy work.<br/>Keep the control.</h2><div className="max-w-lg self-end"><p className="text-base font-light leading-7 text-primary-foreground/65">Your Lot gives committees a repeatable way to handle obligations, decisions and records—without handing the scheme to a manager.</p><Button asChild variant="secondary" className="mt-8 rounded-sm"><Link to="/dashboard">Explore the workspace <ArrowRight /></Link></Button></div></div></section>

      <section className="mx-auto max-w-6xl px-5 py-24 sm:px-8 sm:py-32"><div className="flex flex-col justify-between gap-6 sm:flex-row sm:items-end"><div><p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Annual pricing</p><h2 className="mt-5 text-4xl font-medium sm:text-5xl">Choose your level of support.</h2></div><Button asChild variant="link"><Link to="/pricing">Full comparison <ArrowRight /></Link></Button></div><div className="mt-14 grid gap-5 md:grid-cols-2"><PlanCard compact name="Self-Serve" price="$149" detail="For committees ready to run the scheme." features={["Levy and trust records","Compliance calendar","Maintenance requests"]}/><PlanCard compact featured name="Managed-Lite" price="$249" detail="For committees wanting an expert safety net." features={["Everything in Self-Serve","Annual records review","Priority support"]}/></div></section>

      <section className="border-t border-border px-5 py-24 text-center sm:py-32"><p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Your scheme, clearly run</p><h2 className="mx-auto mt-5 max-w-3xl text-4xl font-medium leading-tight sm:text-6xl">A better way to manage the place you own.</h2><Button asChild size="lg" className="mt-9 rounded-sm"><Link to="/dashboard">Get started <ArrowRight /></Link></Button></section>
    </main>
    <footer className="border-t border-border px-5 py-10"><div className="mx-auto flex max-w-6xl flex-col gap-5 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between"><p className="font-display text-base font-semibold text-foreground">Your Lot</p><p>For small Australian owners corporations.</p><div className="flex gap-5"><Link to="/pricing">Pricing</Link><Link to="/dashboard">Log in</Link></div></div></footer>
  </div>;
}