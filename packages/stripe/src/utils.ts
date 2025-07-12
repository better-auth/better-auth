import type { StripeOptions } from "./types";
import type Stripe from "stripe";

const priceIdCache = new Map<string, string>();

const CACHE_MAX_SIZE = 100;

function cacheSet(key: string, value: string) {
	if (priceIdCache.size >= CACHE_MAX_SIZE) {
		const oldestKey = priceIdCache.keys().next().value as string | undefined;
		if (oldestKey !== undefined) {
			priceIdCache.delete(oldestKey);
		}
	}
	priceIdCache.set(key, value);
}

async function resolvePriceId(
	client: Stripe,
	lookupKey: string,
): Promise<string | undefined> {
	if (!lookupKey) return undefined;
	if (priceIdCache.has(lookupKey)) return priceIdCache.get(lookupKey);
	try {
		const prices = await client.prices.list({
			lookup_keys: [lookupKey],
			active: true,
			limit: 1,
		});
		const id = prices.data[0]?.id;
		if (id) {
			cacheSet(lookupKey, id);
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

		// 2. Resolve all keys concurrently while leveraging cache
		const keyArray = Array.from(lookupKeys);
		const keyToId: Record<string, string | undefined> = {};
		// Fill from cache first
		for (const k of keyArray) {
			if (priceIdCache.has(k)) {
				keyToId[k] = priceIdCache.get(k);
			}
		}

		// Fetch remaining keys concurrently
		const keysToFetch = keyArray.filter((k) => keyToId[k] === undefined);
		if (keysToFetch.length) {
			const resolvedIds = await Promise.all(
				keysToFetch.map((k) => resolvePriceId(stripeClient, k)),
			);
			resolvedIds.forEach((id, idx) => {
				keyToId[keysToFetch[idx]] = id;
			});
		}

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
