export type PlanId = "STARTER" | "PROFESSIONAL" | "BUSINESS";

export interface PlanLimits {
  /** Max projects not in COMPLETED status; null = unlimited. */
  maxActiveProjects: number | null;
  /** Max active workers across the org; null = unlimited. */
  maxWorkers: number | null;
  /** Max active team members + pending invites; null = unlimited. */
  maxTeamAccounts: number | null;
  costReports: boolean;
  customBranding: boolean;
}

export interface Plan extends PlanLimits {
  id: PlanId;
  name: string;
  /** Monthly price in MYR; displayed only — charging happens in Phase B. */
  priceMyr: number;
}

/**
 * Must stay in lockstep with the public pricing section
 * (components/auth/PricingSection.tsx) — these are the limits customers
 * are shown before they sign up.
 */
export const PLANS: Record<PlanId, Plan> = {
  STARTER: {
    id: "STARTER",
    name: "Starter",
    priceMyr: 999,
    maxActiveProjects: 3,
    maxWorkers: 25,
    maxTeamAccounts: 5,
    costReports: false,
    customBranding: false,
  },
  PROFESSIONAL: {
    id: "PROFESSIONAL",
    name: "Professional",
    priceMyr: 1799,
    maxActiveProjects: null,
    maxWorkers: 100,
    maxTeamAccounts: 20,
    costReports: true,
    customBranding: true,
  },
  BUSINESS: {
    id: "BUSINESS",
    name: "Business",
    priceMyr: 1999,
    maxActiveProjects: null,
    maxWorkers: null,
    maxTeamAccounts: null,
    costReports: true,
    customBranding: true,
  },
};

export const TRIAL_DAYS = 14;

/** Every new organization trials the mainstream plan. */
export const TRIAL_PLAN: PlanId = "PROFESSIONAL";

export function withinLimit(limit: number | null, current: number): boolean {
  return limit === null || current < limit;
}
