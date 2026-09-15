import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, BellRing, FileCheck2, Landmark, Quote, Wrench } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { DashboardPreview } from "@/components/dashboard-preview";
import { PlanCard } from "@/components/plan-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export const Route = createFileRoute("/")({
  head: () => ({ meta: [
    { title: "Your Lot — Self-manage your owners corporation" },
    { name: "description", content: "Run levies, compliance and maintenance for your small Australian owners corporation without a strata manager." },
    { property: "og:title", content: "Your Lot — Owners corporation management" },
    { property: "og:description", content: "A calm, capable platform for self-managed owners corporations." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
  ]}),
  component: HomePage,
});

const features = [
  { icon: Landmark, tone: "bg-chip-yellow", title: "Levy & Trust Engine", text: "Issue levies, track payments and keep trust records in order." },
  { icon: FileCheck2, tone: "bg-chip-blue", title: "Compliance Hub", text: "Know what is due, what is done and what needs attention." },
  { icon: Wrench, tone: "bg-chip-clay", title: "Maintenance Workflow", text: "Collect requests, organise quotes and keep owners informed." },
];

function HomePage() {
  return <div className="min-h-screen bg-background">
    <SiteHeader />
    <main>
      <section className="mx-auto max-w-7xl px-5 pb-14 pt-16 sm:px-8 sm:pt-24">
        <div className="grid items-end gap-10 lg:grid-cols-[1.3fr_.7fr]">
          <div><p className="mb-5 text-xs font-semibold uppercase tracking-[0.18em] text-primary">Self-managed OC platform</p><h1 className="max-w-3xl text-4xl font-semibold leading-[1.06] sm:text-6xl lg:text-7xl">Run your owners corporation yourself</h1></div>
          <div className="pb-2"><p className="max-w-md text-base leading-7 text-muted-foreground">Automate levies, compliance and maintenance for your small scheme—without handing control to a manager.</p><Button asChild size="lg" className="mt-7 rounded-full px-6"><Link to="/dashboard">Explore the platform <ArrowRight /></Link></Button></div>
        </div>
        <div className="cream-grid mt-14 rounded-2xl border border-border p-3 sm:p-8 lg:p-14"><DashboardPreview /></div>
      </section>

      <section className="border-y border-border bg-card/55 py-8"><div className="mx-auto max-w-6xl px-5 text-center"><p className="text-xs font-medium text-muted-foreground">Trusted by committees across Merri-bek</p><div className="mt-6 grid grid-cols-2 gap-5 font-display text-sm text-muted-foreground/70 sm:grid-cols-5"><span>BRUNSWICK ROW</span><span>COBURG MEWS</span><span>LYGON COURT</span><span>SUMNER PLACE</span><span className="col-span-2 sm:col-span-1">NICHOLSON SIX</span></div></div></section>

      <section className="mx-auto max-w-7xl px-5 py-20 sm:px-8 sm:py-28"><div className="max-w-2xl"><p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">One shared workspace</p><h2 className="mt-4 text-3xl font-semibold sm:text-5xl">Built for small, capable committees</h2><p className="mt-5 leading-7 text-muted-foreground">The essential tools to run a six-to-ten lot scheme, without enterprise clutter.</p></div><div className="mt-12 grid gap-px overflow-hidden rounded-2xl border border-border bg-border md:grid-cols-3">{features.map(({icon: Icon, tone, title, text}) => <div key={title} className="bg-card p-7 sm:p-9"><div className={`grid size-12 place-items-center rounded-xl ${tone}`}><Icon className="size-5" /></div><h3 className="mt-12 text-xl font-semibold">{title}</h3><p className="mt-3 text-sm leading-6 text-muted-foreground">{text}</p></div>)}</div></section>

      <section className="border-y border-border bg-card/45 py-20 sm:py-28"><div className="mx-auto max-w-6xl px-5 sm:px-8"><div className="mx-auto max-w-2xl text-center"><h2 className="text-3xl font-semibold sm:text-5xl">Offload the busy work.<br/>Keep the control.</h2><p className="mt-5 leading-7 text-muted-foreground">Your Lot quietly keeps the routine moving while your committee stays in charge.</p></div><div className="mt-12 grid overflow-hidden rounded-2xl border border-border bg-card soft-shadow md:grid-cols-[.9fr_1.1fr]"><div className="p-8 sm:p-12"><span className="inline-flex rounded-full bg-chip-yellow px-3 py-1 text-xs font-semibold">Always on</span><h3 className="mt-6 text-2xl font-semibold">Nothing important slips through</h3><p className="mt-4 text-sm leading-7 text-muted-foreground">Automatic levy reminders and a clear compliance calendar help the committee act before deadlines arrive.</p></div><div className="cream-grid flex min-h-72 items-center justify-center border-t border-border p-8 md:border-l md:border-t-0"><div className="w-full max-w-sm rounded-xl border border-border bg-surface-raised p-5 shadow"><div className="flex items-center gap-3"><div className="grid size-10 place-items-center rounded-lg bg-accent"><BellRing className="size-5 text-primary"/></div><div><p className="text-sm font-semibold">Upcoming reminder</p><p className="text-xs text-muted-foreground">Insurance renewal</p></div></div><div className="mt-5 h-2 rounded-full bg-muted"><div className="h-2 w-2/3 rounded-full bg-primary"/></div></div></div></div></div></section>

      <section className="mx-auto max-w-6xl px-5 py-20 sm:px-8 sm:py-28"><div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end"><div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Straightforward pricing</p><h2 className="mt-4 text-3xl font-semibold sm:text-5xl">Choose how much help you need</h2></div><Button asChild variant="link"><Link to="/pricing">Compare plans <ArrowRight /></Link></Button></div><div className="mt-10 grid gap-5 md:grid-cols-2"><PlanCard compact name="Self-Serve" price="$149" detail="For hands-on committees ready to run the scheme." features={["Levy and trust records", "Compliance calendar", "Maintenance requests"]}/><PlanCard compact featured name="Managed-Lite" price="$249" detail="For committees that want guidance when it matters." features={["Everything in Self-Serve", "Annual records review", "Priority committee support"]}/></div></section>

      <section className="border-y border-border bg-secondary/60 py-20"><div className="mx-auto max-w-6xl px-5 sm:px-8"><h2 className="max-w-xl text-3xl font-semibold sm:text-4xl">Clearer committees. Calmer neighbours.</h2><div className="mt-10 grid gap-4 md:grid-cols-3">{[
        ["Mia Chen", "Chair, Brunswick", "We finally know what is due and who is handling it, without another spreadsheet."],
        ["David O'Connor", "Treasurer, Coburg", "The committee has control, but the repetitive follow-up no longer takes over my week."],
        ["Anika Shah", "Secretary, Carlton North", "It gives our small scheme the structure we needed without feeling overbuilt."],
      ].map(([name, role, quote], i) => <Card key={name} className="bg-card"><CardContent className="p-7"><Quote className="size-5 text-primary"/><p className="mt-6 min-h-24 text-base leading-7">“{quote}”</p><div className="mt-8 flex items-center gap-3"><div className={`grid size-10 place-items-center rounded-full ${["bg-chip-yellow","bg-chip-blue","bg-chip-clay"][i]} font-semibold`}>{name?.charAt(0)}</div><div><p className="text-sm font-semibold">{name}</p><p className="text-xs text-muted-foreground">{role}</p></div></div></CardContent></Card>)}</div></div></section>

      <section className="cream-grid px-5 py-24 text-center"><h2 className="mx-auto max-w-2xl text-3xl font-semibold sm:text-5xl">A better-run scheme starts with one clear place.</h2><p className="mx-auto mt-5 max-w-lg text-muted-foreground">Built for neighbours who want less admin and more confidence.</p><Button asChild size="lg" className="mt-8 rounded-full px-7"><Link to="/dashboard">Get started <ArrowRight /></Link></Button></section>
    </main>
    <footer className="border-t border-border bg-card px-5 py-10"><div className="mx-auto flex max-w-7xl flex-col gap-6 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-display text-lg font-semibold">Your Lot.</p><p className="mt-1 text-xs text-muted-foreground">Made for small Australian owners corporations.</p></div><div className="flex gap-6 text-xs text-muted-foreground"><Link to="/pricing">Pricing</Link><Link to="/dashboard">Log in</Link><span>Privacy</span></div></div></footer>
  </div>;
}