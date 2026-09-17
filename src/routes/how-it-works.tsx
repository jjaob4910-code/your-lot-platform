import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Building2, CalendarDays, Check, Coins, FileCheck2, Files, LayoutDashboard, Landmark, ShieldCheck, Users, UsersRound, WalletCards, Wrench } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/how-it-works")({
  head: () => ({ meta: [
    { title: "How it works | Loty" },
    { name: "description", content: "See how Loty gets your owners corporation set up in an afternoon, and how each part of the dashboard replaces a manager." },
    { property: "og:title", content: "How Loty works" },
    { property: "og:description", content: "A guided setup for your building, then a dashboard that runs levies, compliance and repairs for you." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
  ]}),
  component: HowItWorksPage,
});

const steps = [
  {
    number: "01", icon: Building2, title: "Add your building",
    body: "Scheme name, address and lot count. This becomes the one place everything else attaches to.",
    visual: <div className="w-full max-w-[220px] space-y-3 rounded-xl border border-border bg-background p-4" aria-hidden="true">
      <div className="flex items-center gap-2"><Building2 className="size-4 text-primary" /><span className="h-2 w-28 rounded-full bg-muted" /></div>
      <span className="block h-2 w-full rounded-full bg-muted" />
      <span className="block h-2 w-3/4 rounded-full bg-muted" />
      <span className="inline-flex rounded-full bg-secondary px-2.5 py-1 text-[10px] font-medium">8 lots</span>
    </div>,
  },
  {
    number: "02", icon: Users, title: "Add your lots and owners",
    body: "Add each lot with its number, owner, entitlement and occupancy status. Committee members can add these one at a time, whenever the information is ready — there is no file to prepare first.",
    visual: <div className="w-full max-w-[220px] space-y-2" aria-hidden="true">
      <div className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-[11px] font-medium"><Users className="size-3.5 text-primary" />Lot 1 · J. Smith</div>
      <div className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-[11px] text-muted-foreground"><Users className="size-3.5" />Lot 2 · —</div>
      <div className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-[11px] text-muted-foreground"><Users className="size-3.5" />Lot 3 · —</div>
    </div>,
  },
  {
    number: "03", icon: Landmark, title: "Create your first budget",
    body: "Set your admin and maintenance fund totals, choose entitlement or equal share, and set a due date. The moment you save it, Loty issues a levy notice to every lot automatically.",
    visual: <div className="w-full max-w-[220px] space-y-2" aria-hidden="true">
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-lg border border-border bg-background p-2.5"><p className="text-[9px] text-muted-foreground">Admin fund</p><p className="mt-1 text-xs font-medium">$12,000</p></div>
        <div className="rounded-lg border border-border bg-background p-2.5"><p className="text-[9px] text-muted-foreground">Maintenance</p><p className="mt-1 text-xs font-medium">$8,000</p></div>
      </div>
      {["Lot 1", "Lot 2", "Lot 3"].map(lot => <div key={lot} className="flex items-center gap-2 rounded-lg bg-secondary px-3 py-1.5 text-[10px] font-medium">
        <span className="grid size-4 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground"><Check className="size-2.5" /></span>Levy notice · {lot}
      </div>)}
    </div>,
  },
  {
    number: "04", icon: UsersRound, title: "Invite your committee and owners",
    body: "Bring people in as Committee or Owner. Committee sees and manages everything; owners see their own lot and their own levies, nothing more.",
    visual: <div className="w-full max-w-[220px] space-y-2" aria-hidden="true">
      {["Owner", "Committee", "Adviser"].map((role, index) => <div key={role} className={`flex items-center gap-3 rounded-xl border px-3 py-2 text-[11px] font-medium ${index === 1 ? "border-primary bg-secondary" : "border-border bg-background"}`}>
        <UsersRound className="size-3.5 text-muted-foreground" />{role}<span className="ml-auto text-[9px] text-muted-foreground">Right access</span>
      </div>)}
    </div>,
  },
] as const;

function SetupSteps() {
  return <div className="mt-16 grid gap-3">
    {steps.map(step => {
      const Icon = step.icon;
      return <article key={step.number} className="grid gap-6 rounded-2xl border border-border bg-card p-6 sm:grid-cols-[auto_1fr_.9fr] sm:items-center sm:p-8">
        <span className="font-display text-5xl font-medium text-primary/25">{step.number}</span>
        <div>
          <Icon className="mb-3 size-5 text-primary" />
          <h3 className="text-xl font-medium">{step.title}</h3>
          <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">{step.body}</p>
        </div>
        <div className="flex justify-center sm:justify-end">{step.visual}</div>
      </article>;
    })}
  </div>;
}

const features = [
  { icon: LayoutDashboard, title: "Dashboard", blurb: "At-a-glance command centre: levies collected and outstanding, your compliance score, open repairs and days to your next AGM, all on one screen." },
  { icon: Building2, title: "Lots", blurb: "Who owns what and who lives there. Open a lot to see that owner's details." },
  { icon: WalletCards, title: "Levies", blurb: "Set what is to be paid and how it is split, then track exactly who still owes and how close they are to their due date." },
  { icon: Wrench, title: "Work orders", blurb: "Log a repair job or a general request, gather the owners' approval, then track every step to completion with photos and a dated trail." },
  { icon: Coins, title: "Finance", blurb: "Fund balances, what is coming in against what is going out, and a forecast you can take to the next meeting — plus a month-by-month budget planner and an owner-ready report." },
  { icon: ShieldCheck, title: "Insurance", blurb: "Every policy on your building in one place: who underwrites it, what it cost, the policy number and when it renews. Attach the certificate of currency and it files itself under Insurance in your documents." },
  { icon: FileCheck2, title: "Compliance", blurb: "The things the law expects each year, in plain English, with dates attached. Attach the paperwork and it files itself under Compliance in your documents." },
  { icon: CalendarDays, title: "Calendar", blurb: "Meetings, renewals, levies and repairs in one place. Drag anything to a new day, open it for the detail, and add your own events and reminders." },
  { icon: Files, title: "Documents", blurb: "Minutes, certificates, invoices and plans, filed in folders you name yourself, ready to share with owners or download any time." },
] as const;

function FeatureTour() {
  return <div className="mt-16 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
    {features.map((feature, index) => {
      const Icon = feature.icon;
      return <article key={feature.title} className={`flex flex-col rounded-2xl border border-border p-6 sm:p-7 ${index % 3 === 2 ? "bg-secondary/55" : "bg-card"}`}>
        <Icon className="mb-4 size-5 text-primary" />
        <h3 className="text-lg font-medium">{feature.title}</h3>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">{feature.blurb}</p>
      </article>;
    })}
  </div>;
}

function HowItWorksPage() {
  return <div className="relative isolate min-h-screen bg-background">
    <SiteHeader />
    <main>
      <section className="mx-auto max-w-6xl px-5 pb-16 pt-20 sm:px-8 sm:pt-28">
        <div className="max-w-3xl">
          <p className="mb-7 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">How it works</p>
          <h1 className="text-5xl font-medium leading-[1.02] sm:text-6xl lg:text-7xl">From spreadsheet chaos to one place, in about an afternoon.</h1>
          <div className="mt-8 flex max-w-2xl flex-col items-start gap-6">
            <p className="max-w-xl text-base font-light leading-7 text-muted-foreground sm:text-lg">There are two parts to this: getting your building's information into Loty, and then using the dashboard to run it. Neither one needs a manager, and neither takes long.</p>
            <Button asChild className="rounded-sm"><Link to="/dashboard">Take a look <ArrowRight /></Link></Button>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 py-24 sm:px-8 sm:py-32">
        <div className="grid gap-12 lg:grid-cols-[.75fr_1.25fr]">
          <div><p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Setting up</p><h2 className="mt-5 max-w-md text-4xl font-medium leading-tight sm:text-5xl">Four steps, and your committee is running the show.</h2></div>
          <p className="max-w-lg self-end text-base leading-7 text-muted-foreground">There is no bulk import to wrestle with. You add your building once, add your lots as you go, and the moment you create your first budget, Loty writes every owner's levy notice for you.</p>
        </div>
        <SetupSteps />
      </section>

      <section className="mx-auto max-w-6xl px-5 py-24 sm:px-8 sm:py-32">
        <div className="grid gap-12 lg:grid-cols-[.75fr_1.25fr]">
          <div><p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Once you're set up</p><h2 className="mt-5 max-w-md text-4xl font-medium leading-tight sm:text-5xl">Nine sections. Everything a manager used to do.</h2></div>
          <p className="max-w-lg self-end text-base leading-7 text-muted-foreground">This is the same dashboard your committee and owners will use every week, laid out exactly the way it is laid out inside the app.</p>
        </div>
        <FeatureTour />
      </section>

      <section className="bg-primary py-24 text-primary-foreground sm:py-32">
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-5 sm:px-8 lg:grid-cols-[1.1fr_1fr] lg:gap-20">
          <div><h2 className="text-4xl font-medium leading-[1.05] tracking-tight sm:text-6xl">See it running with your own numbers.</h2></div>
          <div className="lg:border-l lg:border-primary-foreground/15 lg:pl-14">
            <p className="max-w-md text-lg leading-8 text-primary-foreground/80">Set up your building today and your first levy notices can be out the door by this evening.</p>
            <div className="mt-9 flex flex-col items-start gap-3">
              <Button asChild size="lg" variant="secondary" className="rounded-sm font-medium"><Link to="/dashboard">Get started <ArrowRight /></Link></Button>
              <p className="text-xs text-primary-foreground/60">Set up in minutes · No manager required</p>
            </div>
          </div>
        </div>
      </section>
    </main>
    <footer className="border-t border-border px-5 py-10"><div className="mx-auto flex max-w-6xl flex-col gap-5 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between"><p className="font-display text-base font-semibold text-foreground">Loty</p><p>For small Australian owners corporations.</p><div className="flex gap-5"><Link to="/pricing">Pricing</Link><Link to="/dashboard">Log in</Link></div></div></footer>
  </div>;
}
