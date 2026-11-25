import type { DBAdapter, Where } from "@better-auth/core/db/adapter";
import type Stripe from "stripe";
import type { StripeOptions, StripePlan, Subscription } from "./types";

/**
 * Adapter `where` clause matching {@link isActiveOrTrialing}.
 */
export const activeOrTrialingStatusWhere = {
	field: "status",
	operator: "in",
	value: ["active", "trialing"],
} satisfies Where;

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
 * Load the current active or trialing subscription for a reference without
 * scanning canceled history, which `findMany` would cap at
 * `advanced.database.defaultFindManyLimit`.
 */
export function findActiveOrTrialingSubscription(
	adapter: Pick<DBAdapter, "findOne">,
	referenceId: string,
) {
	return adapter.findOne<Subscription>({
		model: "subscription",
		where: [
			{ field: "referenceId", value: referenceId },
			activeOrTrialingStatusWhere,
		],
	});
}

/**
 * Whether this reference has ever used a trial.
 *
 * Adapter `where` is a flat AND/OR list without portable grouping, so
 * `(trialStart != null) OR (trialEnd != null) OR (status = trialing)`
 * cannot be expressed in one query. Three existence checks short-circuit
 * in JS instead of loading every subscription row.
 */
export async function hasReferenceEverTrialed(
	adapter: Pick<DBAdapter, "count">,
	referenceId: string,
): Promise<boolean> {
	const referenceIdWhere: Where = {
		field: "referenceId",
		value: referenceId,
	};
	const trialStartCount = await adapter.count({
		model: "subscription",
		where: [
			referenceIdWhere,
			{ field: "trialStart", operator: "ne", value: null },
		],
	});
	if (trialStartCount > 0) {
		return true;
	}
	const trialEndCount = await adapter.count({
		model: "subscription",
		where: [
			referenceIdWhere,
			{ field: "trialEnd", operator: "ne", value: null },
		],
	});
	if (trialEndCount > 0) {
		return true;
	}
	const trialingCount = await adapter.count({
		model: "subscription",
		where: [referenceIdWhere, { field: "status", value: "trialing" }],
	});
	return trialingCount > 0;
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
 * Escapes a value for use in Stripe search queries.
 * Stripe search query uses backslash escaping inside double-quoted
 * string values, so literal backslashes must be escaped before quotes.
 *
 * @see https://docs.stripe.com/search#search-query-language
 */
export function escapeStripeSearchValue(value: string): string {
	return value.replaceAll("\\", "\\\\").replaceAll('"', '\\"');
}

/**
 * Resolve the quantity for a subscription by checking the seat item first,
 * then falling back to the plan item's quantity.
 */
export function resolveQuantity(
	items: Stripe.SubscriptionItem[],
	planItem: Stripe.SubscriptionItem,
	seatPriceId?: string,
): number {
	if (seatPriceId) {
		const seatItem = items.find((item) => item.price.id === seatPriceId);
		if (seatItem) return seatItem.quantity ?? 1;
	}
	return planItem.quantity ?? 1;
}

/**
 * Resolve the plan-matching subscription item and its plan config
 * from a (possibly multi-item) Stripe subscription.
 *
 * - Iterates items to find one whose price matches a configured plan.
 * - For single-item subscriptions, returns the item even without a plan match.
 */
export async function resolvePlanItem(
	options: StripeOptions,
	items: Stripe.SubscriptionItem[],
): Promise<
	{ item: Stripe.SubscriptionItem; plan: StripePlan | undefined } | undefined
> {
	const first = items[0];
	if (!first) return undefined;
	const plans = await getPlans(options.subscription);
	for (const item of items) {
		const plan = plans?.find(
			(p) =>
				p.priceId === item.price.id ||
				p.annualDiscountPriceId === item.price.id ||
				(item.price.lookup_key &&
					(p.lookupKey === item.price.lookup_key ||
						p.annualDiscountLookupKey === item.price.lookup_key)),
		);
		if (plan) return { item, plan };
	}
	return items.length === 1 ? { item: first, plan: undefined } : undefined;
}
