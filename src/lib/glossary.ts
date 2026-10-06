// Plain-English meanings behind the "?" help buttons. Written for an owner who has never
// been on a committee.
export const GLOSSARY = {
  oc: { term: "Owners corporation", text: "The legal group made up of every lot owner. It looks after the shared parts of the building and pays for them through levies." },
  committee: { term: "Committee", text: "Owners elected at the AGM to run things day to day: budgets, repairs, insurance and records." },
  levy: { term: "Levy", text: "Your share of the building's running costs, billed to each lot by the owners corporation." },
  entitlement: { term: "Lot entitlement", text: "Your lot's share of the building, set on the plan of subdivision. It decides how much of each levy you pay and how much your vote counts." },
  adminFund: { term: "Admin fund", text: "Money for regular running costs, like insurance, cleaning, gardening and power for common areas." },
  maintenanceFund: { term: "Maintenance fund", text: "Money saved for bigger or less frequent work, like repainting, roof repairs or replacing a gate." },
  funds: { term: "Funds", text: "The building keeps its money in separate funds. The admin fund pays regular running costs; the maintenance fund is saved for bigger or less frequent work." },
  budget: { term: "Budget", text: "What the building expects to spend this financial year (1 July to 30 June). Levies are worked out from it." },
  committed: { term: "Committed", text: "Money already promised, like an accepted quote, but not yet paid." },
  void: { term: "Void", text: "Cancels a payment that was recorded by mistake. It stays in the history so nothing disappears." },
  projection: { term: "Projection", text: "Where the fund is likely to end the year if spending continues as planned." },
  treasurer: { term: "Treasurer", text: "The committee member who looks after the money. Once set, only they can change payments more than 24 hours old." },
  sumInsured: { term: "Sum insured", text: "The most the insurer would pay to rebuild the building." },
  premium: { term: "Premium", text: "What the building pays each year for the policy." },
  excess: { term: "Excess", text: "The part of each claim the building pays itself before the insurer pays the rest." },
  broker: { term: "Broker", text: "An adviser who arranges the policy with the insurer, if the building uses one." },
  workOrder: { term: "Work order", text: "A record of a repair or job, from the first report through quotes and approval to payment." },
  quote: { term: "Quote", text: "A trade's price for the job. The committee accepts one before work starts." },
  approval: { term: "Owners' approval", text: "Some jobs need a vote from the affected owners before the committee can go ahead." },
  agm: { term: "AGM", text: "The annual general meeting, where owners review the year, approve the budget and elect the committee." },
  notice: { term: "Notice", text: "The formal letter telling owners when the AGM is and what will be discussed, sent at least 14 days before." },
  proxy: { term: "Proxy", text: "Someone you choose to vote for you at a meeting you can't attend." },
  minutes: { term: "Minutes", text: "The official record of what was discussed and decided at a meeting." },
} as const;
export type GlossaryKey = keyof typeof GLOSSARY;
