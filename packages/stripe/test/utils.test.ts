import type Stripe from "stripe";
import { describe, expect, it } from "vitest";
import type { StripeOptions } from "../src/types";
import { escapeStripeSearchValue, resolvePlanItem } from "../src/utils";

describe("escapeStripeSearchValue", () => {
	it("should escape double quotes", () => {
		expect(escapeStripeSearchValue('test"value')).toBe('test\\"value');
	});

	it("should handle strings without quotes", () => {
		expect(escapeStripeSearchValue("simple")).toBe("simple");
	});

	it("should escape multiple quotes", () => {
		expect(escapeStripeSearchValue('"a" and "b"')).toBe('\\"a\\" and \\"b\\"');
	});
});

describe("resolvePlanItem", () => {
	const options = {
		subscription: {
			enabled: true,
			plans: [
				{ name: "starter", priceId: "price_starter" },
				{ name: "premium", priceId: "price_premium" },
			],
		},
	} as StripeOptions;

	it("should return item and plan for single-item subscriptions", async () => {
		const items = [
			{ price: { id: "price_starter", lookup_key: null } },
		] as Stripe.SubscriptionItem[];

		const result = await resolvePlanItem(options, items);
		expect(result?.item.price.id).toBe("price_starter");
		expect(result?.plan?.name).toBe("starter");
	});

	it("should return undefined for empty items", async () => {
		const result = await resolvePlanItem(options, []);
		expect(result).toBeUndefined();
	});

	it("should return item without plan for unmatched single-item", async () => {
		const items = [
			{ price: { id: "price_unknown", lookup_key: null } },
		] as Stripe.SubscriptionItem[];

		const result = await resolvePlanItem(options, items);
		expect(result?.item.price.id).toBe("price_unknown");
		expect(result?.plan).toBeUndefined();
	});

	it("should return matching plan item from multi-item subscription", async () => {
		const items = [
			{ price: { id: "price_seat_addon", lookup_key: null } },
			{ price: { id: "price_starter", lookup_key: null } },
		] as Stripe.SubscriptionItem[];

		const result = await resolvePlanItem(options, items);
		expect(result?.item.price.id).toBe("price_starter");
		expect(result?.plan?.name).toBe("starter");
	});

	it("should return undefined when no plan matches in multi-item", async () => {
		const items = [
			{ price: { id: "price_unknown_1", lookup_key: null } },
			{ price: { id: "price_unknown_2", lookup_key: null } },
		] as Stripe.SubscriptionItem[];

		const result = await resolvePlanItem(options, items);
		expect(result).toBeUndefined();
	});

	it("should match by lookup key", async () => {
		const optionsWithLookup = {
			subscription: {
				enabled: true,
				plans: [
					{ name: "starter", lookupKey: "lookup_starter" },
					{ name: "premium", lookupKey: "lookup_premium" },
				],
			},
		} as StripeOptions;

		const items = [
			{ price: { id: "price_seat", lookup_key: null } },
			{ price: { id: "price_foo", lookup_key: "lookup_premium" } },
		] as Stripe.SubscriptionItem[];

		const result = await resolvePlanItem(optionsWithLookup, items);
		expect(result?.item.price.id).toBe("price_foo");
		expect(result?.plan?.name).toBe("premium");
	});
});
