import type { GenericEndpointContext, User } from "better-auth";
import type Stripe from "stripe";
import type { StripeOptions } from "./types";

/**
 * Finds an existing Stripe customer for a user, applying optional filtering.
 *
 * @param client - Stripe client instance
 * @param user - The user to find a customer for
 * @param options - Stripe plugin options
 * @param ctx - Endpoint context
 * @returns The matching Stripe customer, or undefined if none found
 */
export async function findExistingStripeCustomer(
	client: Stripe,
	user: User & Record<string, any>,
	options: StripeOptions,
	ctx: GenericEndpointContext,
): Promise<Stripe.Customer | undefined> {
	// Fetch more customers when filter is provided to allow filtering
	const limit = options.customerLookupFilter ? 25 : 1;

	const existingCustomers = await client.customers.list({
		email: user.email,
		limit,
	});

	if (existingCustomers.data.length === 0) {
		return undefined;
	}

	// If no filter is provided, use default behavior (first customer)
	if (!options.customerLookupFilter) {
		return existingCustomers.data[0];
	}

	// Apply the custom filter
	return await options.customerLookupFilter(
		{
			customers: existingCustomers.data,
			user,
		},
		ctx,
	);
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
