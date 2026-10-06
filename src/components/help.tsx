import { CircleHelp } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { GLOSSARY, type GlossaryKey } from "@/lib/glossary";

/** A small "?" that explains a term in plain English. Opens on click or tap, so it works on phones. */
export function Help({ term, className = "" }: { term: GlossaryKey; className?: string }) {
  const g = GLOSSARY[term];
  return <Popover>
    <PopoverTrigger asChild>
      <button type="button" aria-label={`What does “${g.term}” mean?`} data-help={term}
        onClick={e => e.stopPropagation()}
        className={`inline-grid size-4 shrink-0 translate-y-[-1px] place-items-center rounded-full align-middle text-muted-foreground/80 transition hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${className}`}>
        <CircleHelp className="size-3.5"/>
      </button>
    </PopoverTrigger>
    <PopoverContent side="top" collisionPadding={12} className="w-72 max-w-[calc(100vw-24px)] p-3 text-[13px] leading-5 normal-case tracking-normal" onClick={e => e.stopPropagation()}>
      <p className="font-medium text-foreground">{g.term}</p>
      <p className="mt-1 font-normal text-muted-foreground">{g.text}</p>
    </PopoverContent>
  </Popover>;
}
