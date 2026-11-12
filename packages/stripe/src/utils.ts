import type { GenericEndpointContext } from "better-auth";
import type Stripe from "stripe";
import type {
	BillingPortalSessionParamsData,
	BillingPortalSessionParamsResult,
	StripeOptions,
	StripePlan,
	Subscription,
	SubscriptionOptions,
} from "./types";

/**
 * Resolves Billing Portal session params from the current plan's
 * `billingPortalConfiguration` and `getBillingPortalSessionParams`, dropping
 * fields the plugin manages so callers cannot redirect the session to another
 * customer or bypass the validated return URL.
 *
 * `getData` is only called when a plan sets `billingPortalConfiguration` or
 * `getBillingPortalSessionParams` is configured, so callers can defer lookups
 * the default flow does not need. Request options are returned as a tuple to
 * spread into `create()`, so the call is unchanged when none are provided.
 */
export async function resolveBillingPortalSessionParams(
	options: StripeOptions,
	getData: (
		plans: StripePlan[],
	) => BillingPortalSessionParamsData | Promise<BillingPortalSessionParamsData>,
	ctx: GenericEndpointContext,
): Promise<{
	params: Stripe.BillingPortal.SessionCreateParams;
	requestOptions: [] | [Stripe.RequestOptions];
}> {
	const subscriptionOptions = options.subscription as SubscriptionOptions;
	const getParams = subscriptionOptions.getBillingPortalSessionParams;
	// Plans are only needed for optional portal settings, so a failing plan
	// provider must not block access to the billing portal or cancellation.
	const plans = await getPlans(options.subscription).catch((error) => {
		ctx.context.logger.error(
			"Failed to resolve plans for Billing Portal session; using the default portal configuration",
			error,
		);
		return [];
	});
	if (!getParams && !plans.some((plan) => plan.billingPortalConfiguration)) {
		return { params: {}, requestOptions: [] };
	}
	const data = await getData(plans);
	const currentPlan = data.subscription
		? findPlanByName(plans, data.subscription.plan)
		: undefined;
	const result: BillingPortalSessionParamsResult | undefined = getParams
		? await getParams(data, ctx)
		: undefined;
	const {
		customer: _customer,
		customer_account: _customerAccount,
		return_url: _returnUrl,
		flow_data: _flowData,
		...params
	} = result?.params ?? {};
	const configuration =
		params.configuration ?? currentPlan?.billingPortalConfiguration;
	return {
		params: configuration ? { ...params, configuration } : params,
		requestOptions: result?.options ? [result.options] : [],
	};
}

export function findPlanByName(plans: StripePlan[], name: string) {
	return plans.find((plan) => plan.name.toLowerCase() === name.toLowerCase());
}

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
		findPlanByName(res, name),
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
