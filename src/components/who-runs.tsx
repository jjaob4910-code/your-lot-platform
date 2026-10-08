import { useQuery } from "@tanstack/react-query";
import { Mail, Phone } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Help } from "@/components/help";

// Who runs the building, and what's expected of an owner, in plain words for everyone.
// Victoria's model: every lot owner is the owners corporation; the owners elect a committee;
// the committee may appoint a manager to run things day to day.

export type Contact = { name: string | null; committee_role: string | null; email: string | null; phone: string | null; company?: string | null; member_id?: string };

export function useBuildingContacts(schemeId?: string | null) {
  return useQuery({
    queryKey: ["committee-contacts", schemeId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("committee_contacts", { _scheme: schemeId! });
      if (error) throw error;
      return (Array.isArray(data) ? data : []) as Contact[];
    },
    enabled: !!schemeId,
  });
}

/** What each role does, in a sentence. */
export const ROLE_DUTIES: Record<string, string> = {
  Manager: "Runs the building day to day for the committee: levies, repairs, insurance, meetings and records.",
  Chairperson: "Chairs committee meetings and the AGM, and leads the committee's decisions.",
  Secretary: "Keeps the records and minutes, and sends notices to owners.",
  Treasurer: "Looks after the money: levies, payments and the accounts.",
  Member: "Elected by the owners at the AGM to make decisions between meetings.",
};
const ORDER = ["Manager", "Chairperson", "Secretary", "Treasurer", "Member"];
const roleOf = (c: Contact) => (c.committee_role && ORDER.includes(c.committee_role) ? c.committee_role : "Member");

/** The person to contact first: the manager, else the Chairperson, else any committee member. */
export const firstContact = (contacts: Contact[]) =>
  contacts.find(c => roleOf(c) === "Manager") ?? contacts.find(c => roleOf(c) === "Chairperson") ?? contacts[0] ?? null;

export function WhoRunsCard({ schemeId, compact = false }: { schemeId?: string | null | undefined; compact?: boolean }) {
  const contacts = useBuildingContacts(schemeId);
  const list = [...(contacts.data ?? [])].sort((a, b) => ORDER.indexOf(roleOf(a)) - ORDER.indexOf(roleOf(b)));
  const manager = list.find(c => roleOf(c) === "Manager");
  return <section className="soft-shadow rounded-3xl border border-border/70 bg-card p-5 sm:p-7" data-who-runs>
    <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Who runs this building <Help term="oc"/></p>
    <p className="mt-2 max-w-2xl text-[13px] leading-6 text-muted-foreground">
      Every lot owner, you included, is a member of the owners corporation, which owns and looks after the common property together.
      The owners elect a committee at the AGM to make decisions for them{manager?.name === "Loty" ? ", and Loty manages the building day to day for them." : manager ? ", and the committee has appointed a manager to run things day to day." : ". The committee runs things day to day, led by the Chairperson."}
    </p>
    <ul className="mt-4 divide-y divide-border/60">
      {list.map((c, i) => { const r = roleOf(c);
        return <li key={c.member_id ?? i} className="grid gap-1 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-4">
          <div className="min-w-0">
            <p className="text-sm"><span className="font-medium">{c.name ?? (r === "Manager" ? "Building manager" : "Committee member")}</span>
              <span className="text-muted-foreground"> · {r === "Member" ? "Committee member" : r === "Manager" ? "Building manager" : r}{c.company ? `, ${c.company}` : ""}</span></p>
            {!compact && <p className="text-[12px] text-muted-foreground">{ROLE_DUTIES[r]}</p>}
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-[13px]">
            {c.email && <a href={`mailto:${c.email}`} className="inline-flex items-center gap-1.5 text-primary hover:underline"><Mail className="size-3.5"/>{c.email}</a>}
            {c.phone && <a href={`tel:${c.phone.replace(/\s/g, "")}`} className="inline-flex items-center gap-1.5 text-primary hover:underline"><Phone className="size-3.5"/>{c.phone}</a>}
          </div>
        </li>; })}
      {contacts.isSuccess && list.length === 0 && <li className="py-3 text-sm text-muted-foreground">The committee hasn't been set up in Loty yet.</li>}
    </ul>
  </section>;
}

const DUTIES: [string, string][] = [
  ["Pay your levies by the due date", "They fund insurance, repairs and running the building. Finance shows what you owe and how to pay."],
  ["Insure your own contents", "The building's policy covers the building. Your belongings and fit-out usually need your own policy."],
  ["Follow the building's rules", "And keep your lot in good repair, so it doesn't affect your neighbours or the common property."],
  ["Report problems early", "Leaks, damage or safety issues in the common areas: report them in Work orders."],
  ["Keep your details up to date", "So notices and levies reach you. Let the committee know if your email, phone or address changes."],
  ["Have your say", "Come to the AGM and vote. If you can't make it, ask the committee about appointing a proxy."],
  ["Tell the committee if you sell or lease", "New owners and tenants need to be added so the records stay right."],
];

export function ResponsibilitiesCard({ schemeId }: { schemeId?: string | null | undefined }) {
  const contacts = useBuildingContacts(schemeId);
  const who = firstContact(contacts.data ?? []);
  return <section className="soft-shadow rounded-3xl border border-border/70 bg-card p-5 sm:p-7" data-responsibilities>
    <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Your responsibilities as an owner</p>
    <ul className="mt-4 grid gap-x-8 gap-y-3 sm:grid-cols-2">
      {DUTIES.map(([title, body]) => <li key={title} className="text-[13px] leading-5">
        <p className="font-medium">{title}</p><p className="text-muted-foreground">{body}</p>
      </li>)}
    </ul>
    {who && <p className="mt-5 rounded-2xl bg-secondary px-4 py-3 text-[13px]">
      <span className="font-medium">Questions? </span>Contact {who.name ?? "your committee"}{roleOf(who) === "Manager" ? ", your building manager" : roleOf(who) === "Chairperson" ? ", the Chairperson" : ""}
      {who.email ? <> at <a className="text-primary hover:underline" href={`mailto:${who.email}`}>{who.email}</a></> : null}{who.phone ? ` or ${who.phone}` : ""}.
    </p>}
  </section>;
}
