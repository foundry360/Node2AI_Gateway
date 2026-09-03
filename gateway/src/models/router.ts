/**
 * Selects a model ONLY from the policy-provided eligible set.
 * Never expands eligibility. Preference order: requested (if eligible) → first eligible.
 */
export function selectEligibleModel(input: {
  eligibleModels: string[];
  requestedModel?: string;
}): string {
  if (input.eligibleModels.length === 0) {
    throw new Error('No eligible models to select');
  }
  if (input.requestedModel && input.eligibleModels.includes(input.requestedModel)) {
    return input.requestedModel;
  }
  return input.eligibleModels[0]!;
}
