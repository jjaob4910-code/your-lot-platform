# Your Lot Platform

Build a landing page and dashboard prototype for "Your Lot" — a self-management 

SaaS platform for small residential owners corporations (townhouse strata/body 

corporate schemes of 6–10 dwellings) in Australia.

BRAND & DESIGN SYSTEM

- Overall feel: premium fintech SaaS (think Ramp, Mercury, Linear) applied to 

  property/strata management — calm, trustworthy, never corporate-cold

- Background: warm creamy off-white (#F5F1E8), never pure white

- Primary text: charcoal near-black (#1A1A1A)

- Accent colour: muted forest green (#2F4B3C) for CTAs, active states, and 

  highlights — avoid generic SaaS blue

- Supporting chip colours: soft pastel yellow, dusty blue, clay orange for 

  small badges/tags, used sparingly

- Typography: bold geometric sans-serif for headings (Poppins or similar), 

  clean grotesk for body text (Inter) — generous line-height, tight heading 

  letter-spacing

- Components: rounded corners (12–16px), soft drop shadows, no harsh gradients

- Use shadcn/ui components throughout for consistency

PAGES / ROUTES

1. Landing page (/)

   - Sticky nav: "Your Lot" wordmark left, links (Platform, Pricing, How it works, 

     Resources) centre, "Log in" + solid dark-green pill "Get Started" button right

   - Hero: small-caps eyebrow label "SELF-MANAGED OC PLATFORM", bold two-line 

     headline "Run your owners corporation yourself", subheading about automating 

     levies, compliance and maintenance without a manager, CTA button

   - Below hero: a bordered device-frame mockup showing the dashboard layout 

     (see spec below), with mac-style traffic-light dots top left

   - Logo strip: "Trusted by committees across Merri-bek" with 4-5 muted 

     greyscale placeholder wordmarks

   - Three-column feature grid: "Levy & Trust Engine" / "Compliance Hub" / 

     "Maintenance Workflow" — icon, heading, one-line description each

   - Mid-page callout section: "Offload the busy work. Keep the control." with 

     a bordered panel describing automated reminders and compliance tracking

   - Pricing teaser section: two cards — "Self-Serve" (per-lot/year) and 

     "Managed-Lite" (base + per-lot) — with a short feature list each and a 

     "Compare plans" link to /pricing

   - Testimonial section: 3 cards with placeholder avatar, name, short quote 

     from a fictional committee chairperson

   - Closing CTA band on textured cream background: bold centred headline, 

     dark-green pill button

2. Dashboard (/dashboard) — build the full layout and components, but leave 

   all data fields EMPTY or showing placeholder/zero states for now — no mock 

   numbers, no fake charts, no fake activity yet

   - Left sidebar nav: Dashboard, Levies, Maintenance, Insurance, Compliance, 

     Documents, Settings — with icons, active state highlighted in dark green

   - Top bar: scheme name selector dropdown, notification bell, avatar

   - Metric cards row: four empty-state cards with labels only ("Levies 

     Collected", "Compliance Score", "Open Maintenance Requests", "Next AGM") 

     and a placeholder like "—" or "No data yet" instead of numbers

   - Main chart area: empty state with a placeholder message ("Levy data will 

     appear here once payments are recorded") rather than a populated graph

   - Compliance checklist panel: show the list item labels (AGM notice, 

     insurance renewal, financial statement, maintenance plan) but leave 

     status/dates blank or marked "Not started"

   - Maintenance requests table: show column headers only (Title, Submitted by, 

     Status, Date) with an empty-state row ("No requests yet")

   - Recent activity feed: empty-state message ("Activity will show up here")

3. Pricing page (/pricing)

   - Two-column comparison: Self-Serve vs Managed-Lite, feature checklist 

     format, price per lot per year clearly displayed, CTA button on each

FUNCTIONALITY (prototype-level)

- Focus entirely on layout, spacing, and visual design — no backend, no mock 

  data population yet

- Sidebar navigation should actually switch between dashboard sections 

  (can be tabs within one page if easier than separate routes)

- Make the whole thing fully responsive — mobile view should collapse the 

  sidebar into a bottom nav or hamburger menu

TONE

Confident, calm, minimal copy. No stock-photo clichés. Every section should 

look like a real, funded SaaS product — not a template.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/181ebc1b-239f-4505-8358-febb8af6262e).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
