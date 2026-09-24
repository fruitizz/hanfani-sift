/** Pricing helpers shared by the Pricing page and unit tests. */

export interface PricedPlan {
  /** Monthly list price in USD, or null for custom. */
  monthly: number | null;
}

/**
 * Effective monthly amount shown in the UI.
 * Annual billing = 10× monthly (2 months free), rounded to the nearest dollar.
 */
export function perMonth(plan: PricedPlan, annual: boolean): number | null {
  if (plan.monthly === null || plan.monthly === 0) return plan.monthly;
  return annual ? Math.round((plan.monthly * 10) / 12) : plan.monthly;
}

/** Yearly total when annual billing is selected (10 × monthly list price). */
export function annualTotal(plan: PricedPlan): number | null {
  if (plan.monthly === null || plan.monthly === 0) return plan.monthly;
  return plan.monthly * 10;
}
