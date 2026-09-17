import { Link } from "@tanstack/react-router";
import { ArrowUpRight, Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

const links = [
  { label: "Platform", to: "/" as const },
  { label: "Pricing", to: "/pricing" as const },
  { label: "How it works", to: "/how-it-works" as const },
  { label: "Resources", to: "/" as const },
];

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5 sm:px-8">
        <Link to="/" className="flex items-center gap-2 font-display text-lg font-semibold">
          <span className="grid size-5 grid-cols-2 gap-0.5">{[0,1,2,3].map(i => <span key={i} className="rounded-[2px] bg-primary" />)}</span>Loty
        </Link>
        <nav className="hidden items-center gap-7 text-xs font-medium text-muted-foreground md:flex" aria-label="Main navigation">
          {links.map(link => <Link key={link.label} to={link.to} className="transition-colors hover:text-foreground">{link.label}</Link>)}
        </nav>
        <div className="hidden items-center gap-5 md:flex">
          <Button asChild variant="ghost" size="sm"><Link to="/dashboard">Dashboard</Link></Button>
          <Button asChild size="sm" className="rounded-sm"><Link to="/dashboard">Get started <ArrowUpRight /></Link></Button>
        </div>
        <Sheet>
          <SheetTrigger asChild><Button size="icon" variant="ghost" className="md:hidden" aria-label="Open menu"><Menu /></Button></SheetTrigger>
          <SheetContent className="w-[86%]"><SheetTitle className="font-display">Loty</SheetTitle><nav className="mt-10 flex flex-col gap-2">{links.map(link => <Button key={link.label} asChild variant="ghost" className="justify-start"><Link to={link.to}>{link.label}</Link></Button>)}<Button asChild className="mt-4"><Link to="/dashboard">Get started</Link></Button></nav></SheetContent>
        </Sheet>
      </div>
    </header>
  );
}