import type Stripe from "stripe";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { StripeOptions } from "../src/types";
import {
	createMeterIdResolver,
	escapeStripeSearchValue,
	resolvePlanItem,
	validateEventName,
} from "../src/utils";

/**
 * Create a mock that mimics Stripe's list()
 */
function mockStripeList<T>(data: T[]) {
	return {
		data,
		has_more: false,
		async *[Symbol.asyncIterator]() {
			for (const item of data) yield item;
		},
	};
}

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

describe("validateEventName", () => {
	const meters = [
		{ eventName: "stripe_meter_emails" },
		{ eventName: "stripe_meter_api" },
	];

	it("should accept a registered event name", () => {
		expect(validateEventName(meters, "stripe_meter_emails")).toBe(
			"stripe_meter_emails",
		);
	});

	it("should throw for an unknown event name", () => {
		expect(() => validateEventName(meters, "unknown")).toThrow();
	});

	it("should throw when meters is undefined", () => {
		expect(() => validateEventName(undefined, "stripe_meter_emails")).toThrow();
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

describe("createMeterIdResolver", () => {
	afterEach(() => {
		vi.useRealTimers();
	});

	it("should resolve meter IDs from Stripe", async () => {
		const mockClient = {
			billing: {
				meters: {
					list: vi.fn().mockReturnValue(
						mockStripeList([
							{ event_name: "api_calls", id: "meter_abc" },
							{ event_name: "emails", id: "meter_def" },
						]),
					),
				},
			},
		} as unknown as Stripe;

		const resolver = createMeterIdResolver(mockClient);
		const result = await resolver();

		expect(result.get("api_calls")).toBe("meter_abc");
		expect(result.get("emails")).toBe("meter_def");
		expect(mockClient.billing.meters.list).toHaveBeenCalledWith({
			status: "active",
			limit: 100,
		});
	});

	it("should cache results within TTL", async () => {
		const listFn = vi
			.fn()
			.mockReturnValue(
				mockStripeList([{ event_name: "api_calls", id: "meter_abc" }]),
			);
		const mockClient = {
			billing: { meters: { list: listFn } },
		} as unknown as Stripe;

		const resolver = createMeterIdResolver(mockClient);
		await resolver();
		await resolver();
		await resolver();

		expect(listFn).toHaveBeenCalledTimes(1);
	});

	it("should refresh cache after TTL expires", async () => {
		const listFn = vi
			.fn()
			.mockReturnValue(
				mockStripeList([{ event_name: "api_calls", id: "meter_abc" }]),
			);
		const mockClient = {
			billing: { meters: { list: listFn } },
		} as unknown as Stripe;

		const resolver = createMeterIdResolver(mockClient);
		await resolver();
		expect(listFn).toHaveBeenCalledTimes(1);

		// Simulate TTL expiry by advancing time
		vi.useFakeTimers();
		vi.advanceTimersByTime(5 * 60 * 1000 + 1);

		await resolver();
		expect(listFn).toHaveBeenCalledTimes(2);
	});
});
