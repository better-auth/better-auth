import { betterAuth, type User } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import Stripe from "stripe";
import { stripe } from ".";
import { vi } from "vitest";
import { AggregationFormula } from "./types";
import type { StripeOptions } from "./types";
import { createAuthClient } from "better-auth/client";
import { bearer } from "better-auth/plugins";
import { stripeClient } from "./client";

describe("metered", () => {
	const mockStripe = {
		prices: {
			list: vi.fn().mockResolvedValue({ data: [{ id: "price_lookup_123" }] }),
		},
		customers: {
			create: vi.fn().mockResolvedValue({ id: "cus_mock123" }),
		},
		checkout: {
			sessions: {
				create: vi.fn().mockResolvedValue({
					url: "https://checkout.stripe.com/mock",
					id: "",
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
		webhooks: {
			constructEvent: vi.fn(),
		},
		v2: {
			billing: {
				meterEvents: {
					create: vi.fn().mockResolvedValue({
						object: "v2.billing.meter_event",
						id: "evt_123",
						event_name: "api_calls",
						status: "active",
						payload: {
							value: "1",
							stripe_customer_id: "cus_mock123",
						},
					}),
				},
			},
		},
		billing: {
			meters: {
				create: vi.fn().mockResolvedValue({
					id: "meter_123",
					display_name: "API Calls",
					event_name: "api_calls",
					status: "active",
				}),
				retrieve: vi.fn().mockResolvedValue({
					id: "meter_123",
					display_name: "Update API Calls",
					event_name: "api_calls",
					status: "active",
					status_transitions: {
						deactivated_at: Date.now(),
					},
				}),
				deactivate: vi.fn().mockResolvedValue({
					id: "meter_123",
					display_name: "Update API Calls",
					event_name: "api_calls",
					status: "active",
					status_transitions: {
						deactivated_at: Date.now(),
					},
				}),
				reactivate: vi.fn().mockResolvedValue({
					id: "meter_123",
					display_name: "Update API Calls",
					event_name: "api_calls",
					status: "active",
					status_transitions: {
						deactivated_at: null,
					},
				}),
				list: vi.fn().mockResolvedValue({
					data: [
						{
							id: "meter_123",
							display_name: "Update API Calls",
							event_name: "api_calls",
							status: "active",
						},
						{
							id: "meter_1234",
							display_name: "API Calls",
							event_name: "api_calls",
							status: "active",
						},
					],
				}),
				update: vi.fn().mockImplementation((id, { display_name }) => {
					if (id === "meter_123") {
						return Promise.resolve({
							id: "meter_123",
							display_name,
							event_name: "api_calls",
							status: "active",
						});
					}
					return Promise.reject(new Error("Meter not found"));
				}),
				event: vi.fn().mockImplementation(({ event_name }) => {
					return Promise.resolve({
						object: "v2.billing.meter_event",
						id: "meter_123",
						event_name: "api_calls",
						status: "active",
					});
				}),
			},
		},
	};

	const _stripe = mockStripe as unknown as Stripe;

	const stripeOptions = {
		stripeClient: _stripe,
		stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET!,
		createCustomerOnSignUp: true,
		subscription: {
			enabled: true,
			plans: [
				{
					priceId: process.env.STRIPE_PRICE_ID_1!,
					name: "starter",
					lookupKey: "lookup_key_123",
				},
				{
					priceId: process.env.STRIPE_PRICE_ID_2!,
					name: "premium",
					lookupKey: "lookup_key_234",
				},
			],
		},
	} satisfies StripeOptions;

	// Define the shape of our database tables
	interface DatabaseTables {
		[key: string]: any[];
		user: any[];
		session: any[];
		verification: any[];
		account: any[];
		customer: any[];
		subscription: any[];
	}

	const data: DatabaseTables = {
		user: [],
		session: [],
		verification: [],
		account: [],
		customer: [],
		subscription: [],
	};
	const memory = memoryAdapter(data);

	const auth = betterAuth({
		database: memory,
		baseURL: "http://localhost:3000",
		emailAndPassword: {
			enabled: true,
		},
		plugins: [stripe(stripeOptions)],
	});

	const authClient = createAuthClient({
		baseURL: "http://localhost:3000",
		plugins: [
			bearer(),
			stripeClient({
				subscription: true,
			}),
		],
		fetchOptions: {
			customFetchImpl: async (url, init) => {
				return auth.handler(new Request(url, init));
			},
		},
	});

	const testUser = {
		email: "test@email.com",
		password: "password",
		name: "Test User",
	};

	it("should create a customer on sign up", async () => {
		const ctx = await auth.$context;
		const userRes = await authClient.signUp.email(testUser, {
			throw: true,
		});
		const res = await ctx.adapter.findOne<User>({
			model: "user",
			where: [
				{
					field: "id",
					value: userRes.user.id,
				},
			],
		});
		expect(res).toMatchObject({
			id: expect.any(String),
			stripeCustomerId: expect.any(String),
		});
	});

	it("should create a metered billing", async () => {
		var res = await authClient.meteredBilling.create({
			displayName: "API Calls",
			eventName: "api_calls",
			aggregationFormula: AggregationFormula.COUNT,
			stripeCustomerId: "cus_mock123",
		});
		expect(res.data?.id).toBe("meter_123");
		expect(res.data?.display_name).toBe("API Calls");
		expect(res.data?.event_name).toBe("api_calls");
		expect(res.data?.status).toBe("active");
	});

	it("should update a metered billing", async () => {
		var res = await authClient.meteredBilling.update({
			meterId: "meter_123",
			updatedDisplayName: "Update API Calls",
		});
		expect(res.data?.id).toBe("meter_123");
		expect(res.data?.display_name).toBe("Update API Calls");
	});

	it("should retrieve a metered billing", async () => {
		var res = await authClient.meteredBilling.retrieve({
			meterId: "meter_123",
		});
		expect(res.data?.id).toBe("meter_123");
		expect(res.data?.display_name).toBe("Update API Calls");
	});

	it("should deactivate a metered billing", async () => {
		var res = await authClient.meteredBilling.deactivate({
			meterId: "meter_123",
		});
		expect(res.data?.id).toBe("meter_123");
		expect(res.data?.status).toBe("active");
		expect(res.data?.status_transitions.deactivated_at).toBeLessThan(
			Date.now(),
		);
	});

	it("should reactivate a metered billing", async () => {
		var res = await authClient.meteredBilling.reactivate({
			meterId: "meter_123",
		});
		expect(res.data?.id).toBe("meter_123");
		expect(res.data?.status).toBe("active");
		expect(res.data?.status_transitions?.deactivated_at).toBe(null);
	});

	it("should create a metered event", async () => {
		const res = await authClient.meteredBilling.event({
			value: "1",
			eventName: "api_calls",
			stripeCustomerId: "cus_mock123",
		});

		expect(res).toBeDefined();
		expect(res.data?.object).toBe("v2.billing.meter_event");
		expect(res.data?.event_name).toBe("api_calls");
		expect(res.data?.payload).toBeDefined();
		expect(res.data?.payload?.value).toBe("1");
		expect(res.data?.payload?.stripe_customer_id).toBe("cus_mock123");
	});
});
