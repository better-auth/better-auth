import { memoryAdapter } from "better-auth/adapters/memory";
import type Stripe from "stripe";
import { test as baseTest, vi } from "vitest";
import type { StripeOptions } from "../src/types";

export function createStripeMock(
	overrides: {
		customerId?: string;
		customerEmail?: string;
		checkoutSessionId?: string;
	} = {},
) {
	const customerId = overrides.customerId ?? "cus_mock123";
	const customerEmail = overrides.customerEmail ?? "test@email.com";
	const checkoutSessionId = overrides.checkoutSessionId ?? "";
	return {
		prices: {
			list: vi.fn().mockResolvedValue({ data: [{ id: "price_lookup_123" }] }),
			retrieve: vi.fn().mockImplementation((priceId: string) =>
				Promise.resolve({
					id: priceId,
					recurring: { usage_type: "licensed", interval: "month" },
				}),
			),
		},
		customers: {
			create: vi.fn().mockResolvedValue({ id: customerId }),
			list: vi.fn().mockResolvedValue({ data: [] }),
			search: vi.fn().mockResolvedValue({ data: [] }),
			retrieve: vi.fn().mockResolvedValue({
				id: customerId,
				email: customerEmail,
				deleted: false,
			}),
			update: vi.fn().mockResolvedValue({
				id: customerId,
				email: customerEmail,
			}),
			del: vi.fn().mockResolvedValue({ id: customerId, deleted: true }),
		},
		checkout: {
			sessions: {
				create: vi.fn().mockResolvedValue({
					url: "https://checkout.stripe.com/mock",
					id: checkoutSessionId,
				}),
			},
		},
		billingPortal: {
			sessions: {
				create: vi
					.fn()
					.mockResolvedValue({ url: "https://billing.stripe.com/mock" }),
			},
		},
		subscriptions: {
			retrieve: vi.fn(),
			list: vi.fn().mockResolvedValue({ data: [] }),
			update: vi.fn(),
		},
		subscriptionSchedules: {
			list: vi.fn().mockResolvedValue({ data: [] }),
			create: vi.fn().mockResolvedValue({
				id: "sub_sched_mock",
				phases: [
					{
						start_date: Math.floor(Date.now() / 1000),
						end_date: Math.floor(Date.now() / 1000) + 30 * 86400,
						items: [{ price: "price_mock", quantity: 1 }],
					},
				],
			}),
			retrieve: vi
				.fn()
				.mockResolvedValue({ id: "sub_sched_mock", status: "active" }),
			update: vi.fn().mockResolvedValue({}),
			release: vi.fn().mockResolvedValue({}),
		},
		webhooks: { constructEventAsync: vi.fn() },
	};
}

function createStripeOptions(stripeMock: ReturnType<typeof createStripeMock>) {
	return {
		stripeClient: stripeMock as unknown as Stripe,
		stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET ?? "test_secret",
		createCustomerOnSignUp: true,
		subscription: {
			enabled: true,
			plans: [
				{
					priceId: process.env.STRIPE_PRICE_ID_1 ?? "price_test_1",
					name: "starter",
					lookupKey: "lookup_key_123",
				},
				{
					priceId: process.env.STRIPE_PRICE_ID_2 ?? "price_test_2",
					name: "premium",
					lookupKey: "lookup_key_234",
				},
			],
		},
	} satisfies StripeOptions;
}

export const test = baseTest.extend<{
	stripeMock: ReturnType<typeof createStripeMock>;
	memory: ReturnType<typeof memoryAdapter>;
	stripeOptions: ReturnType<typeof createStripeOptions>;
}>({
	stripeMock: async ({}, use) => use(createStripeMock()),
	memory: async ({}, use) =>
		use(
			memoryAdapter({
				user: [],
				session: [],
				verification: [],
				account: [],
				customer: [],
				subscription: [],
			}),
		),
	stripeOptions: async ({ stripeMock }, use) =>
		use(createStripeOptions(stripeMock)),
});
