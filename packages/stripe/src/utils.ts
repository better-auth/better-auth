import type { GenericEndpointContext } from "better-auth";
import { APIError } from "better-auth";
import type Stripe from "stripe";
import { STRIPE_ERROR_CODES } from "./error-codes";
import type {
	CustomerType,
	MeterConfig,
	StripeOptions,
	StripePlan,
	Subscription,
} from "./types";

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
 * Stripe search query uses double quotes for string values,
 * and double quotes within the value need to be escaped with backslash.
 *
 * @see https://docs.stripe.com/search#search-query-language
 */
export function escapeStripeSearchValue(value: string): string {
	return value.replace(/"/g, '\\"');
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

/**
 * Create a meter ID resolver scoped to a Stripe client instance.
 * Results are cached with a 5-minute TTL.
 */
export function createMeterIdResolver(stripeClient: Stripe) {
	let cache: Map<string, string> | null = null;
	let expiry = 0;

	return async (): Promise<Map<string, string>> => {
		if (cache && Date.now() < expiry) return cache;
		const result = new Map<string, string>();
		for await (const meter of stripeClient.billing.meters.list({
			status: "active",
			limit: 100,
		})) {
			result.set(meter.event_name, meter.id);
		}
		cache = result;
		expiry = Date.now() + 5 * 60 * 1000; // 5 min
		return cache;
	};
}

/**
 * Validate that the given event name is registered in the meters config.
 */
export function validateEventName(
	meters: MeterConfig[] | undefined,
	eventName: string,
): string {
	const exists = meters?.some((m) => m.eventName === eventName);
	if (!exists) {
		throw APIError.from("BAD_REQUEST", STRIPE_ERROR_CODES.UNKNOWN_METER);
	}
	return eventName;
}

/**
 * Resolve a referenceId + customerType to a Stripe customer ID via DB lookup.
 */
export async function resolveStripeCustomerId(
	ctx: GenericEndpointContext,
	referenceId: string,
	customerType: CustomerType,
): Promise<string> {
	const model = customerType === "organization" ? "organization" : "user";
	const record = await ctx.context.adapter.findOne<{
		stripeCustomerId?: string;
	}>({
		model,
		where: [{ field: "id", value: referenceId }],
	});
	if (!record?.stripeCustomerId) {
		throw APIError.from("BAD_REQUEST", STRIPE_ERROR_CODES.CUSTOMER_NOT_FOUND);
	}
	return record.stripeCustomerId;
}
