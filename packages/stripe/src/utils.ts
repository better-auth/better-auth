import type Stripe from "stripe";
import type { StripeOptions, Subscription } from "./types";

export async function getPlans(
	subscriptionOptions: StripeOptions["subscription"],
) {
	if (subscriptionOptions?.enabled) {
		return typeof subscriptionOptions.plans === "function"
			? await subscriptionOptions.plans()
			: subscriptionOptions.plans;
	}
	throw new Error("Subscriptions are not enabled in the Stripe options.");
}

export async function getPlanByPriceInfo(
	options: StripeOptions,
	priceId: string,
	priceLookupKey: string | null,
) {
	return await getPlans(options.subscription).then((res) =>
		res?.find(
			(plan) =>
				plan.priceId === priceId ||
				plan.annualDiscountPriceId === priceId ||
				(priceLookupKey &&
					(plan.lookupKey === priceLookupKey ||
						plan.annualDiscountLookupKey === priceLookupKey)),
		),
	);
}

export async function getPlanByName(options: StripeOptions, name: string) {
	return await getPlans(options.subscription).then((res) =>
		res?.find((plan) => plan.name.toLowerCase() === name.toLowerCase()),
	);
}

/**
 * Checks if a subscription is in an available state (active or trialing)
 */
export function isActiveOrTrialing(
	sub: Subscription | Stripe.Subscription,
): boolean {
	return sub.status === "active" || sub.status === "trialing";
}

/**
 * Check if a subscription is scheduled to be canceled (DB subscription object)
 */
export function isPendingCancel(sub: Subscription): boolean {
	return !!(sub.cancelAtPeriodEnd || sub.cancelAt);
}

/**
 * Check if a Stripe subscription is scheduled to be canceled (Stripe API response)
 */
export function isStripePendingCancel(stripeSub: Stripe.Subscription): boolean {
	return !!(stripeSub.cancel_at_period_end || stripeSub.cancel_at);
}

/**
 * Check if two group IDs match. Treats undefined/null as the same "default" group.
 * This allows backwards compatibility where existing subscriptions without groupId
 * are treated as belonging to the same default group.
 */
export function groupsMatch(
	groupA: string | undefined | null,
	groupB: string | undefined | null,
): boolean {
	// Both undefined/null means same "default" group
	if (!groupA && !groupB) return true;
	return groupA === groupB;
}
