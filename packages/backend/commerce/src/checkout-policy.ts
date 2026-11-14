/** Fixture policy is explicit and cannot be mistaken for an approved launch policy. */
export interface SyntheticCheckoutPolicy {
  readonly environment: 'local' | 'test';
  readonly customerId: string;
  readonly quoteLifetimeSeconds: number;
  readonly acceptanceWindowSeconds: number;
}
/**
 * LIVE cash-on-delivery checkout for any registered customer. Only non-synthetic sellers,
 * products and categories can be ordered; sellers (or their couriers) deliver and collect.
 */
export interface LiveCheckoutPolicy {
  readonly environment: 'live';
  readonly quoteLifetimeSeconds: number;
  readonly acceptanceWindowSeconds: number;
}
export type CheckoutPolicy = SyntheticCheckoutPolicy | LiveCheckoutPolicy;

export function validateSyntheticCheckoutPolicy(policy: SyntheticCheckoutPolicy): void {
  const minimumSeconds = policy.environment === 'test' ? 1 : 60;
  if (
    !['local', 'test'].includes(policy.environment) ||
    !Number.isInteger(policy.quoteLifetimeSeconds) ||
    policy.quoteLifetimeSeconds < minimumSeconds ||
    policy.quoteLifetimeSeconds > 3600 ||
    !Number.isInteger(policy.acceptanceWindowSeconds) ||
    policy.acceptanceWindowSeconds < minimumSeconds ||
    policy.acceptanceWindowSeconds > 86400
  ) {
    throw new Error(
      'Explicit LOCAL/TEST checkout fixture policy with bounded deadlines is required',
    );
  }
}

export function validateCheckoutPolicy(policy: CheckoutPolicy): void {
  if (policy.environment !== 'live') {
    validateSyntheticCheckoutPolicy(policy);
    return;
  }
  if (
    !Number.isInteger(policy.quoteLifetimeSeconds) ||
    policy.quoteLifetimeSeconds < 60 ||
    policy.quoteLifetimeSeconds > 3600 ||
    !Number.isInteger(policy.acceptanceWindowSeconds) ||
    policy.acceptanceWindowSeconds < 3600 ||
    policy.acceptanceWindowSeconds > 7 * 86400
  ) {
    throw new Error('Live checkout policy requires bounded quote and acceptance windows');
  }
}
