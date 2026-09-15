import { Check } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type PlanCardProps = { name: string; price: string; detail: string; features: string[]; featured?: boolean; compact?: boolean };

export function PlanCard({ name, price, detail, features, featured, compact }: PlanCardProps) {
  return (
    <Card className={featured ? "border-primary bg-primary text-primary-foreground shadow-none" : "bg-card shadow-none"}>
      <CardHeader className={compact ? "p-6" : "p-7 sm:p-9"}>
        <div className="flex items-start justify-between gap-4"><CardTitle className="font-display text-xl font-medium">{name}</CardTitle>{featured && <span className="rounded-full border border-primary-foreground/20 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.12em]">Supported</span>}</div>
        <div className="pt-5"><span className="font-display text-4xl font-semibold">{price}</span><span className={featured ? "text-primary-foreground/70" : "text-muted-foreground"}> / lot / year</span></div>
        <p className={featured ? "text-sm text-primary-foreground/75" : "text-sm text-muted-foreground"}>{detail}</p>
      </CardHeader>
      <CardContent className={compact ? "px-6 pb-6" : "px-7 pb-8 sm:px-9"}>
        <ul className="space-y-3">{features.map(feature => <li key={feature} className="flex gap-3 text-sm"><Check className={`mt-0.5 size-4 shrink-0 ${featured ? "text-primary-foreground/60" : "text-primary"}`} />{feature}</li>)}</ul>
        <Button asChild variant={featured ? "secondary" : "default"} className="mt-7 w-full rounded-sm"><Link to="/dashboard">Choose {name}</Link></Button>
      </CardContent>
    </Card>
  );
}