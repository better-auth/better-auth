import type { BetterAuthPlugin } from "@better-auth/core";
import type { OrganizationOptions } from "better-auth/plugins/organization";
import type Stripe from "stripe";
import type { StripeOptions, Subscription } from "./types";

/**
 * Type guard to check if a plugin is an organization plugin with valid options
 */
function isOrganizationPlugin(
	plugin: BetterAuthPlugin,
): plugin is BetterAuthPlugin & { options: OrganizationOptions } {
	return (
		plugin.id === "organization" &&
		!!plugin.options &&
		typeof plugin.options === "object"
	);
}

/**
 * Get organization plugin from plugins array
 * Returns null if plugin not found or doesn't have valid options
 */
export function getOrganizationPlugin(
	plugins: BetterAuthPlugin[] | undefined,
): (BetterAuthPlugin & { options: OrganizationOptions }) | null {
	if (!plugins) return null;

	const orgPlugin = plugins.find((p) => p.id === "organization");
	if (!orgPlugin) return null;

	if (!isOrganizationPlugin(orgPlugin)) {
		return null;
	}

	return orgPlugin;
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
