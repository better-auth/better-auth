import type { GenericEndpointContext } from "@better-auth/core";
import type Stripe from "stripe";
import type { StripeOptions } from "./types";

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
