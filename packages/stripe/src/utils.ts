import type {
	BetterAuthPlugin,
	GenericEndpointContext,
} from "@better-auth/core";
import type { Session, User } from "better-auth";
import type { OrganizationOptions } from "better-auth/plugins/organization";
import type Stripe from "stripe";
import type { StripeOptions, WithActiveOrganizationId } from "./types";

/**
 * Type guard to check if a plugin is an organization plugin with valid options
 * @internal
 */
function isOrganizationPlugin(
	plugin: BetterAuthPlugin,
): plugin is BetterAuthPlugin & { options: OrganizationOptions } {
	// Organization plugin always has options object (even if empty)
	// We don't check for organizationHooks because Stripe plugin will inject it
	return (
		plugin.id === "organization" &&
		!!plugin.options &&
		typeof plugin.options === "object"
	);
}

/**
 * Get organization plugin from plugins array with type safety
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

/**
 * Get reference ID from request body, session, or user ID
 *
 * Priority: ctx.body.referenceId -> session.activeOrganizationId -> user.id
 */
export function getReferenceId(
	bodyReferenceId: string | undefined,
	session: {
		user: User;
		session: Session & WithActiveOrganizationId;
	},
): string {
	return (
		bodyReferenceId || session.session.activeOrganizationId || session.user.id
	);
}

export function getUrl(ctx: GenericEndpointContext, url: string) {
	if (/^[a-zA-Z][a-zA-Z0-9+\-.]*:/.test(url)) {
		return url;
	}
	return `${ctx.context.options.baseURL}${
		url.startsWith("/") ? url : `/${url}`
	}`;
}

export async function resolvePriceIdFromLookupKey(
	stripeClient: Stripe,
	lookupKey: string,
): Promise<string | undefined> {
	if (!lookupKey) return undefined;
	const prices = await stripeClient.prices.list({
		lookup_keys: [lookupKey],
		active: true,
		limit: 1,
	});
	return prices.data[0]?.id;
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
