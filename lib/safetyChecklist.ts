/**
 * The default site safety checklist.
 *
 * Grouped roughly the way a Malaysian site walk actually goes — PPE and
 * access first because that is what stops you at the gate, then the specific
 * hazards, then the paperwork.
 *
 * This is a *template*. Filled-in items are copied onto the inspection when
 * it is filed, never referenced, so editing this list never changes what a
 * past inspection says was checked. That distinction is the whole point of
 * keeping a compliance record rather than a to-do list.
 */
export interface ChecklistTemplateItem {
  category: string;
  item: string;
}

export const SAFETY_CHECKLIST: ChecklistTemplateItem[] = [
  { category: "PPE", item: "Hard hats worn by everyone on site" },
  { category: "PPE", item: "Safety boots and high-visibility vests worn" },
  { category: "PPE", item: "Eye and hearing protection available where needed" },

  { category: "Access & egress", item: "Walkways clear and level" },
  { category: "Access & egress", item: "Emergency exits unobstructed and signed" },
  { category: "Access & egress", item: "Site fencing and gate control intact" },

  { category: "Working at height", item: "Scaffolding inspected and tagged" },
  { category: "Working at height", item: "Guardrails and toe boards in place" },
  { category: "Working at height", item: "Ladders secured and at the correct angle" },
  { category: "Working at height", item: "Openings and edges protected" },

  { category: "Electrical", item: "Temporary wiring in good condition" },
  { category: "Electrical", item: "Distribution boards locked and labelled" },
  { category: "Electrical", item: "Earth leakage protection in place" },

  { category: "Plant & machinery", item: "Operators certified for the plant they run" },
  { category: "Plant & machinery", item: "Guards and safety devices fitted and working" },
  { category: "Plant & machinery", item: "Lifting gear inspected and within date" },

  { category: "Excavation", item: "Excavations shored or battered" },
  { category: "Excavation", item: "Edge protection and access ladders provided" },

  { category: "Fire & emergency", item: "Extinguishers present, serviced and accessible" },
  { category: "Fire & emergency", item: "Assembly point signed and known to workers" },
  { category: "Fire & emergency", item: "First aid kit stocked and a trained first-aider on site" },

  { category: "Housekeeping", item: "Materials stacked safely" },
  { category: "Housekeeping", item: "Waste and debris cleared" },
  { category: "Housekeeping", item: "Spills and standing water dealt with" },

  { category: "Records", item: "Toolbox talk held and recorded" },
  { category: "Records", item: "Workers' CIDB cards valid" },
  { category: "Records", item: "Previous inspection findings actioned" },
];

/** The categories, in template order, for grouping the form and the record. */
export const SAFETY_CATEGORIES: string[] = [...new Set(SAFETY_CHECKLIST.map((i) => i.category))];
