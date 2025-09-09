import type { StripeOptions, Storage } from "./types";
import type Stripe from "stripe";

/**
 * Key prefix used when persisting lookupKey → priceId mappings in secondaryStorage.
 * Exported in case other modules need to share the same cache namespace.
 */
export const PRICE_ID_CACHE_KEY_PREFIX = "stripe-priceid-";

/**
 * Resolve a Stripe lookupKey to its actual priceId.
 * Results are cached in Better Auth `secondaryStorage` when provided.
 *
 * A 24-hour TTL is used by default so the mapping is refreshed daily but we
 * avoid hammering Stripe on every request.
 */
async function resolvePriceId(
	client: Stripe,
	lookupKey: string,
	storage?: Storage,
): Promise<string | undefined> {
	if (!lookupKey) return undefined;
	const cacheKey = `${PRICE_ID_CACHE_KEY_PREFIX}${lookupKey}`;
	try {
		if (storage) {
			const cached = await storage.get(cacheKey);
			if (cached) return cached;
		}
		const prices = await client.prices.list({
			lookup_keys: [lookupKey],
			active: true,
			limit: 1,
		});
		const id = prices.data[0]?.id;
		if (id && storage) {
			// Cache for 24h (can be tweaked by replacing the literal below)
			await storage.set(cacheKey, id, 60 * 60 * 24);
		}
		return id;
	} catch (error) {
		console.error(
			`[better-auth][stripe] Failed to resolve price ID for lookup key "${lookupKey}":`,
			error,
		);
		return undefined;
	}
}

export async function getPlans(options: StripeOptions) {
	return typeof options?.subscription?.plans === "function"
		? await options.subscription?.plans()
		: options.subscription?.plans;
}

export async function getPlanByPriceId(
	options: StripeOptions,
	priceId: string,
) {
	return await getPlans(options).then(async (res) => {
		if (!res) return undefined;

		// First, try direct priceId matches as before
		const directMatch = res.find(
			(plan) =>
				plan.priceId === priceId || plan.annualDiscountPriceId === priceId,
		);
		if (directMatch) return directMatch;

		// Fallback – resolve lookup keys to price ids concurrently
		const { stripeClient } = options;
		if (!stripeClient) return undefined;

		// 1. Collect unique lookup keys across all plans
		const lookupKeys = new Set<string>();
		for (const p of res) {
			if (p.lookupKey) lookupKeys.add(p.lookupKey);
			if (p.annualDiscountLookupKey) lookupKeys.add(p.annualDiscountLookupKey);
		}

		const storage = options.secondaryStorage;

		// 2. Resolve all keys concurrently using secondaryStorage for caching
		const keyArray = Array.from(lookupKeys);
		const resolvedIds = await Promise.all(
			keyArray.map((k) => resolvePriceId(stripeClient, k, storage)),
		);
		const keyToId = keyArray.reduce<Record<string, string | undefined>>(
			(acc, key, idx) => {
				acc[key] = resolvedIds[idx];
				return acc;
			},
			{},
		);

		// 3. Use resolved IDs to match and return the correct plan
		for (const plan of res) {
			if (plan.lookupKey && keyToId[plan.lookupKey] === priceId) return plan;
			if (
				plan.annualDiscountLookupKey &&
				keyToId[plan.annualDiscountLookupKey] === priceId
			)
				return plan;
		}
		return undefined;
	});
}

export async function getPlanByName(options: StripeOptions, name: string) {
	return await getPlans(options).then((res) =>
		res?.find((plan) => plan.name.toLowerCase() === name.toLowerCase()),
	);
}

export type { Storage };
