import { useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, X } from "lucide-react";
import { Button } from "@/components/ui/button";

// A short show-around for people who arrive by invite. Each step opens the page it talks about,
// so the person sees the real thing behind the card. It shows once per person per building on
// this device, and anyone can replay it from Settings.

type Step = { tab: string; title: string; body: string; expect?: string };

const ownerSteps = (building: string, lot: string | null, hasPayment: boolean): Step[] => [
  { tab: "Dashboard", title: `Welcome to ${building}`,
    body: `Loty is where your owners corporation keeps everything in one place${lot ? `, and you're here as the owner of ${lot}` : ""}. This quick tour shows you around. It takes about a minute.`,
    expect: "Your committee runs the building. You can see what's happening, pay your levies, report problems and have your say." },
  { tab: "Dashboard", title: "Your dashboard",
    body: "This is your home page. It shows the building's money, your levies, what's coming up and any notices from the committee.",
    expect: "Check back whenever you get an email from your committee. The latest is always here." },
  { tab: "Finance", title: "Your levies and how to pay",
    body: hasPayment
      ? "Levies are your share of the building's running costs. Here you'll see what you owe, when it's due, and the bank details to pay with your own reference."
      : "Levies are your share of the building's running costs. Here you'll see what you owe and when it's due. Your committee will add the bank details to pay.",
    expect: "The committee sends a levy notice before each due date and marks it paid once your money arrives." },
  { tab: "Lots", title: "Who runs this building",
    body: "Every lot owner, you included, is part of the owners corporation. The owners elect a committee to make decisions, and the committee may appoint a manager to run things day to day. Here's who they are and how to reach them.",
    expect: "Questions about levies, repairs or the rules go to the manager, or to the Chairperson if there's no manager." },
  { tab: "Dashboard", title: "Your responsibilities",
    body: "As an owner you pay your levies on time, insure your own contents, follow the building's rules, report problems early and keep your contact details up to date. The full list is at the bottom of your dashboard.",
    expect: "You can see all the building's records: the budget, every payment, every repair and every meeting." },
  { tab: "Work orders", title: "Report a problem",
    body: "Something broken in the common areas, or a leak into your lot? Report it here with a photo, and follow along as the committee gets it fixed.",
    expect: "For bigger jobs, owners may be asked to approve the spend. You'll get a notice and can vote right here." },
  { tab: "AGM", title: "Meetings",
    body: "Once a year the owners meet at the AGM. Suggest an item for the agenda, read the notice, and read the minutes afterwards.",
    expect: "You'll get the notice at least two weeks before the meeting. Can't make it? You can send a proxy." },
  { tab: "Documents", title: "Documents and insurance",
    body: "Minutes, certificates and plans the committee shares with owners live here. The Insurance page shows what the building is covered for and when it renews.",
    expect: "Your own contents usually need your own policy. The building's policy covers the building." },
  { tab: "Dashboard", title: "You're all set",
    body: "The bell at the top shows anything that needs you, like a levy due or a vote. Tap any ? next to a word you don't know for a plain explanation.",
    expect: "You can replay this tour any time from Settings." },
];

const committeeSteps = (building: string): Step[] => [
  { tab: "Dashboard", title: `Welcome to the ${building} committee`,
    body: "You've joined as a committee member, so you can help run the building: levies, repairs, insurance, meetings and records. Here's a quick look around.",
    expect: "Everything you change is shared with the rest of the committee straight away." },
  { tab: "Dashboard", title: "Your dashboard",
    body: "Your building's money, levies, the year's checklist and what's coming up. Use Customise to choose what you see." },
  { tab: "Lots", title: "Lots and owners",
    body: "Who owns each lot and their share of costs. Invite owners from here so they can see their levies and the building's notices." },
  { tab: "Finance", title: "Budget, levies and cashflow",
    body: "Set the budget, send levy notices, mark payments and record expenses. The funds and cashflow stay up to date as you go." },
  { tab: "Work orders", title: "Repairs and jobs",
    body: "Log a job, collect quotes, ask owners to approve big spends, then record the payment. Owners' reported problems land here too." },
  { tab: "AGM", title: "Meetings",
    body: "Build the agenda, send the notice, take attendance and minutes on the day, then publish them for owners." },
  { tab: "Dashboard", title: "You're all set",
    body: "The bell shows what needs attention. Tap any ? for a plain explanation of a term.",
    expect: "You can replay this tour any time from Settings." },
];

const managerSteps = (building: string): Step[] => [
  { tab: "Dashboard", title: `Welcome, manager of ${building}`,
    body: "The committee has appointed you to run this building day to day. You can do everything the committee can: levies, repairs, insurance, meetings and records.",
    expect: "Owners see your name and contact details under Who runs this building, so they'll come to you first." },
  { tab: "Finance", title: "Levies and the accounts",
    body: "Send levy notices, mark payments, chase arrears and record expenses. Owners can read the budget and every payment, but only you and the committee can change them." },
  { tab: "Work orders", title: "Repairs",
    body: "Owners' reported problems land here. Collect quotes, ask owners to approve big spends, then record the payment." },
  { tab: "AGM", title: "Meetings",
    body: "Build the agenda, send the notice on time, take the minutes and publish them." },
  { tab: "Dashboard", title: "All your buildings",
    body: "If you manage more than one building, All buildings at the top shows every one of them, with what needs action first.",
    expect: "You can replay this tour any time from Settings." },
];

const START_EVENT = "loty-start-tour";
/** Opens the tour from anywhere, e.g. a "Take the tour" button. */
export const startTour = () => window.dispatchEvent(new Event(START_EVENT));

const seenKey = (userId: string, schemeId: string) => `loty-tour-${userId}-${schemeId}`;
export const JUST_JOINED_KEY = "loty-just-joined";

export function WelcomeTour({ userId, schemeId, isCommittee, isManager = false, ready, building, lot, hasPayment, goTo }: {
  userId?: string | undefined; schemeId?: string | null | undefined; isCommittee: boolean; isManager?: boolean; ready: boolean;
  building: string; lot: string | null; hasPayment: boolean; goTo: (tab: string) => void;
}) {
  const [step, setStep] = useState<number | null>(null);
  const steps = isManager ? managerSteps(building) : isCommittee ? committeeSteps(building) : ownerSteps(building, lot, hasPayment);

  // Owners always get it once; committee members only when they've just arrived by invite.
  useEffect(() => {
    if (!ready || !userId || !schemeId) return;
    let seen = true, joined = false;
    try { seen = localStorage.getItem(seenKey(userId, schemeId)) === "1"; joined = sessionStorage.getItem(JUST_JOINED_KEY) === "1"; } catch { /* storage unavailable */ }
    if (!seen && (!isCommittee || joined)) setStep(0);
  }, [ready, userId, schemeId, isCommittee]);

  useEffect(() => {
    const open = () => setStep(0);
    window.addEventListener(START_EVENT, open);
    return () => window.removeEventListener(START_EVENT, open);
  }, []);

  const current = step === null ? null : steps[step];
  useEffect(() => { if (current) { goTo(current.tab); window.scrollTo({ top: 0 }); } }, [step]); // eslint-disable-line react-hooks/exhaustive-deps

  const close = () => {
    setStep(null);
    try { if (userId && schemeId) localStorage.setItem(seenKey(userId, schemeId), "1"); sessionStorage.removeItem(JUST_JOINED_KEY); } catch { /* storage unavailable */ }
    goTo("Dashboard");
  };

  useEffect(() => {
    if (step === null) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (step === null || !current) return null;
  const last = step === steps.length - 1;
  return <>
    <div className="fixed inset-0 z-40 bg-foreground/10" aria-hidden onClick={close}/>
    <div role="dialog" aria-modal="true" aria-labelledby="tour-title" data-tour-step={step}
      className="soft-shadow fixed inset-x-4 bottom-4 z-50 mx-auto max-w-md rounded-3xl border border-border/70 bg-card p-6 sm:inset-x-auto sm:right-6 sm:bottom-6">
      <div className="flex items-start justify-between gap-3">
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">{step === 0 ? "Welcome" : `${current.tab} · ${step} of ${steps.length - 1}`}</p>
        <button type="button" onClick={close} aria-label="Close the tour" className="-m-1 rounded-full p-1 text-muted-foreground hover:bg-secondary"><X className="size-4"/></button>
      </div>
      <h2 id="tour-title" className="mt-3 text-xl font-medium tracking-[-0.02em]">{current.title}</h2>
      <p className="mt-2 text-[14px] leading-6 text-muted-foreground">{current.body}</p>
      {current.expect && <p className="mt-3 rounded-2xl bg-secondary px-4 py-3 text-[13px] leading-5"><span className="font-medium">What to expect: </span>{current.expect}</p>}
      <div className="mt-5 flex items-center justify-between gap-3">
        <div className="flex gap-1.5" aria-hidden>{steps.map((_, i) => <span key={i} className={`size-1.5 rounded-full ${i === step ? "bg-primary" : "bg-border"}`}/>)}</div>
        <div className="flex gap-2">
          {step === 0
            ? <Button variant="ghost" size="sm" className="rounded-full" onClick={close}>Skip</Button>
            : <Button variant="ghost" size="sm" className="rounded-full" onClick={() => setStep(step - 1)}><ArrowLeft className="size-3.5"/>Back</Button>}
          <Button size="sm" className="rounded-full" autoFocus onClick={() => (last ? close() : setStep(step + 1))}>
            {step === 0 ? "Show me around" : last ? "Done" : "Next"}{!last && <ArrowRight className="size-3.5"/>}
          </Button>
        </div>
      </div>
    </div>
  </>;
}
