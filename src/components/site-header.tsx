import { Link } from "@tanstack/react-router";
import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

const links = [
  { label: "Platform", to: "/" as const },
  { label: "Pricing", to: "/pricing" as const },
  { label: "How it works", to: "/" as const },
  { label: "Resources", to: "/" as const },
];

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-border/70 bg-background/95 backdrop-blur">
      <div className="mx-auto grid h-18 max-w-7xl grid-cols-[minmax(0,1fr)_auto] items-center gap-4 px-5 sm:px-8 lg:grid-cols-[1fr_auto_1fr]">
        <Link to="/" className="font-display text-xl font-semibold text-foreground">Your Lot<span className="text-primary">.</span></Link>
        <nav className="hidden items-center gap-8 text-sm font-medium lg:flex" aria-label="Main navigation">
          {links.map((link) => <Link key={link.label} to={link.to} className="text-muted-foreground transition-colors hover:text-foreground">{link.label}</Link>)}
        </nav>
        <div className="hidden items-center justify-end gap-3 lg:flex">
          <Button asChild variant="ghost"><Link to="/dashboard">Log in</Link></Button>
          <Button asChild className="rounded-full px-5"><Link to="/dashboard">Get started</Link></Button>
        </div>
        <Sheet>
          <SheetTrigger asChild><Button size="icon" variant="ghost" className="lg:hidden" aria-label="Open menu"><Menu /></Button></SheetTrigger>
          <SheetContent className="w-[86%]">
            <SheetTitle className="font-display text-xl">Your Lot.</SheetTitle>
            <nav className="mt-10 flex flex-col gap-2">
              {links.map((link) => <Button key={link.label} asChild variant="ghost" className="justify-start"><Link to={link.to}>{link.label}</Link></Button>)}
              <Button asChild className="mt-4 rounded-full"><Link to="/dashboard">Get started</Link></Button>
            </nav>
          </SheetContent>
        </Sheet>
      </div>
    </header>
  );
}