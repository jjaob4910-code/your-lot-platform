import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, BellRing, Building2, Check, FileText, Landmark, UsersRound, Wrench } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { DashboardPreview } from "@/components/dashboard-preview";
import { PlanCard } from "@/components/plan-card";
import { Button } from "@/components/ui/button";


export const Route = createFileRoute("/")({
  head: () => ({ meta: [
    { title: "Loty | Owners corporation software" },
    { name: "description", content: "Run your own owners corporation. Tools for levies, compliance and paperwork, at a fraction of what you pay a manager." },
    { property: "og:title", content: "Loty | Owners corporation software" },
    { property: "og:description", content: "Take back control: run your own owners corporation with tools for levies, compliance and paperwork." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
  ]}),
  component: HomePage,
});

function ServiceBento() {
  return (
    <div className="mt-16 grid gap-3 md:grid-cols-6">
      <article className="relative min-h-[310px] overflow-hidden rounded-2xl border border-border bg-card p-6 md:col-span-4 sm:p-8">
        <div className="absolute inset-x-0 top-10 z-0 flex flex-col gap-4 opacity-80" aria-hidden="true">
          {[
            { label: "Levy notice ready", position: "mr-12" },
            { label: "Payment recorded", position: "ml-8 mr-8" },
            { label: "Records up to date", position: "ml-14" },
          ].map(({ label, position }) => (
            <div key={label} className={`flex items-center gap-3 border-y border-border/70 bg-background/70 px-7 py-3 ${position}`}>
              <span className="grid size-7 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground"><Check className="size-3.5" /></span>
              <span className="text-xs font-medium text-foreground">{label}</span>
              <span className="ml-auto h-1.5 w-16 rounded-full bg-muted" />
            </div>
          ))}
        </div>
        <div className="relative z-10 mt-44 flex flex-col bg-card pt-4">
          <Landmark className="mb-4 size-5 text-primary" />
          <h3 className="text-xl font-medium">Levies without the spreadsheet chase</h3>
          <p className="mt-2 max-w-lg text-sm leading-6 text-muted-foreground">Prepare notices, see what has been paid and keep clean records in one place. You know where your property stands without rebuilding the numbers every month.</p>
        </div>
      </article>

      <article className="flex min-h-[310px] flex-col rounded-2xl border border-border bg-secondary/55 p-6 md:col-span-2 sm:p-8">
        <div className="flex flex-1 items-center justify-center" aria-hidden="true">
          <div className="relative grid size-36 place-items-center rounded-full border-[12px] border-muted bg-card">
            <BellRing className="size-7 text-primary" />
            <span className="absolute -right-2 top-3 grid size-8 place-items-center rounded-full bg-primary text-primary-foreground"><Check className="size-4" /></span>
          </div>
        </div>
        <h3 className="mt-8 text-xl font-medium">Deadlines that come to you</h3>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">Insurance, meetings and recurring obligations stay visible, with a clear next step before anything becomes urgent.</p>
      </article>

      <article className="flex min-h-[280px] flex-col rounded-2xl border border-border bg-card p-6 md:col-span-2 sm:p-8">
        <div className="flex flex-1 flex-col justify-center gap-2" aria-hidden="true">
          {["Owner", "Committee", "Adviser"].map((role, index) => (
            <div key={role} className={`flex items-center gap-3 rounded-xl border px-4 py-3 ${index === 1 ? "border-primary bg-secondary" : "border-border bg-background"}`}>
              <UsersRound className="size-4 text-muted-foreground" />
              <span className="text-xs font-medium">{role}</span>
              <span className="ml-auto text-[10px] text-muted-foreground">Right access</span>
            </div>
          ))}
        </div>
        <h3 className="mt-7 text-lg font-medium">The right people stay in the loop</h3>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">Give each owner the information they need, without forwarding long email chains or exposing private records.</p>
      </article>

      <article className="flex min-h-[280px] flex-col rounded-2xl border border-border bg-primary p-6 text-primary-foreground md:col-span-2 sm:p-8">
        <div className="flex flex-1 items-center justify-center gap-3" aria-hidden="true">
          {[Wrench, FileText, Landmark].map((Icon, index) => (
            <span key={index} className="grid size-14 place-items-center rounded-2xl border border-primary-foreground/20 bg-primary-foreground/10"><Icon className="size-5" /></span>
          ))}
        </div>
        <h3 className="mt-7 text-lg font-medium">One home for every job and document</h3>
        <p className="mt-2 text-sm leading-6 text-primary-foreground/70">Maintenance decisions, quotes and records remain connected, so anyone can understand what happened and what comes next.</p>
      </article>

      <article className="flex min-h-[280px] flex-col rounded-2xl border border-border bg-card p-6 md:col-span-2 sm:p-8">
        <div className="flex flex-1 items-center justify-center" aria-hidden="true">
          <div className="w-full max-w-[220px] space-y-3 rounded-xl border border-border bg-background p-4">
            <div className="flex items-center gap-2"><Building2 className="size-4 text-primary" /><span className="h-2 w-24 rounded-full bg-muted" /></div>
            <div className="grid grid-cols-2 gap-2"><span className="h-14 rounded-lg bg-secondary" /><span className="h-14 rounded-lg bg-muted" /></div>
            <span className="block h-2 w-full rounded-full bg-muted" />
          </div>
        </div>
        <h3 className="mt-7 text-lg font-medium">Your property at a glance</h3>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">Open one clear view and know what needs attention. No hunting through folders, inboxes or someone else&rsquo;s filing system.</p>
      </article>

      <article className="relative min-h-[250px] overflow-hidden rounded-2xl border border-border bg-secondary/55 p-6 md:col-span-6 sm:p-8">
        <div className="grid h-full items-end gap-8 md:grid-cols-[.8fr_1.2fr]">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Less administration, more certainty</p>
            <h3 className="mt-4 max-w-md text-2xl font-medium sm:text-3xl">Pick up where you left off. Everything is already in context.</h3>
            <p className="mt-3 max-w-lg text-sm leading-6 text-muted-foreground">Your records, decisions and next actions stay together, giving your committee a repeatable way to run the property in minutes, not another evening.</p>
          </div>
          <div className="grid grid-cols-[120px_1fr] gap-3 rounded-2xl border border-border bg-card p-4" aria-hidden="true">
            <div className="space-y-3 border-r border-border pr-3"><span className="block h-2 w-16 rounded-full bg-primary" />{[1,2,3,4].map(i=><span key={i} className="block h-2 rounded-full bg-muted" />)}</div>
            <div className="grid grid-cols-2 gap-3"><span className="h-16 rounded-xl bg-muted" /><span className="h-16 rounded-xl bg-secondary" /><span className="col-span-2 h-10 rounded-xl border border-border" /></div>
          </div>
        </div>
      </article>
    </div>
  );
}

const benefits = ["Easy to use", "Fair price", "More control", "Streamlined", "Everything in one place", "Set up in minutes", "No spreadsheets", "Made for 6 to 10 lots"];

function HomePage() {
  return <div className="relative isolate min-h-screen bg-background">
    
    <SiteHeader />
    <main>
      <section className="mx-auto max-w-6xl px-5 pb-16 pt-20 sm:px-8 sm:pt-28">
        <div className="max-w-4xl">
          <p className="mb-7 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">For self-managed owners corporations</p>
          <h1 className="max-w-4xl text-5xl font-medium leading-[1.02] sm:text-6xl lg:text-7xl">You&rsquo;ve paid a levy every year. Have you ever seen the manager?</h1>
          <div className="mt-8 flex max-w-2xl flex-col items-start gap-6">
            <p className="max-w-xl text-base font-light leading-7 text-muted-foreground sm:text-lg">Take back control. Run your own owners corporation with tools that handle the levies, compliance and paperwork for you, instead of paying someone else to do less than you could do yourself.</p>
            <Button asChild className="rounded-sm"><Link to="/dashboard">Take Control <ArrowRight /></Link></Button>
          </div>
        </div>
        
        <div className="mt-20 backdrop-dots relative py-8 sm:px-8 sm:py-14"><DashboardPreview /></div>
      </section>

      <section className="overflow-hidden border-y border-border py-8"><div className="mx-auto flex max-w-6xl flex-col gap-6 px-5 sm:px-8 md:flex-row md:items-center md:gap-12"><p className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Designed around Australian OC requirements</p><div className="marquee-mask min-w-0 flex-1 overflow-hidden"><div className="marquee-track items-center" aria-hidden="true">{[...benefits, ...benefits].map((benefit, index) => (<span key={index} className="flex items-center whitespace-nowrap pr-12 font-display text-sm font-medium text-foreground/80">{benefit}<span className="ml-12 size-1.5 rounded-full bg-primary/50" /></span>))}</div></div></div></section>

      <section className="mx-auto max-w-6xl px-5 py-24 sm:px-8 sm:py-32">
        <div className="grid gap-12 lg:grid-cols-[.75fr_1.25fr]"><div><p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">How we solve it</p><h2 className="mt-5 max-w-md text-4xl font-medium leading-tight sm:text-5xl">Built to be easy. Priced to be fair.</h2></div><p className="max-w-lg self-end text-base leading-7 text-muted-foreground">Running your own owners corporation shouldn&rsquo;t require a manager, a degree or a mystery invoice. Loty gives you the tools to do it yourself, at a fraction of what you&rsquo;re paying now.</p></div>
        <ServiceBento />
      </section>

      <section className="bg-primary py-24 text-primary-foreground sm:py-32"><div className="mx-auto grid max-w-6xl items-center gap-12 px-5 sm:px-8 lg:grid-cols-[1.1fr_1fr] lg:gap-20"><div><h2 className="text-4xl font-medium leading-[1.05] tracking-tight sm:text-6xl">Offload the busy work.<br/>Keep the control.</h2></div><div className="lg:border-l lg:border-primary-foreground/15 lg:pl-14"><p className="max-w-md text-lg leading-8 text-primary-foreground/80">Loty gives committees a repeatable way to handle obligations, decisions and records, without handing the scheme to a manager.</p><div className="mt-9 flex flex-col items-start gap-3"><Button asChild size="lg" variant="secondary" className="rounded-sm font-medium"><Link to="/dashboard">Try Now <ArrowRight /></Link></Button><p className="text-xs text-primary-foreground/60">Set up in minutes · No manager required</p></div></div></div></section>

      <section className="mx-auto max-w-6xl px-5 py-24 sm:px-8 sm:py-32"><div className="flex flex-col justify-between gap-6 sm:flex-row sm:items-end"><div><p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Annual pricing</p><h2 className="mt-5 text-4xl font-medium sm:text-5xl">Choose your level of support.</h2></div><Button asChild variant="link"><Link to="/pricing">Full comparison <ArrowRight /></Link></Button></div><div className="mt-14 grid gap-5 md:grid-cols-2"><PlanCard compact name="Self-Serve" price="$149" detail="For committees ready to run the scheme." features={["Levy and trust records","Compliance calendar","Maintenance requests"]}/><PlanCard compact featured name="Managed-Lite" price="$249" detail="For committees wanting an expert safety net." features={["Everything in Self-Serve","Annual records review","Priority support"]}/></div></section>

      <section className="border-t border-border px-5 py-24 text-center sm:py-32"><p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Your scheme, clearly run</p><h2 className="mx-auto mt-5 max-w-3xl text-4xl font-medium leading-tight sm:text-6xl">A better way to manage the place you own.</h2><Button asChild size="lg" className="mt-9 rounded-sm"><Link to="/dashboard">Get started <ArrowRight /></Link></Button></section>
    </main>
    <footer className="border-t border-border px-5 py-10"><div className="mx-auto flex max-w-6xl flex-col gap-5 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between"><p className="font-display text-base font-semibold text-foreground">Loty</p><p>For small Australian owners corporations.</p><div className="flex gap-5"><Link to="/pricing">Pricing</Link><Link to="/dashboard">Log in</Link></div></div></footer>
  </div>;
}