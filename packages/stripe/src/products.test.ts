import { betterAuth, type User } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import Stripe from "stripe";
import { stripe } from ".";
import { vi } from "vitest";
import type { StripeOptions } from "./types";
import { createAuthClient } from "better-auth/client";
import { bearer } from "better-auth/plugins";
import { stripeClient } from "./client";
import { setCookieToHeader } from "better-auth/cookies";

describe("metered", () => {
	var sampleProduct = {
		id: "prod_NWjs8kKbJWmuuc",
		object: "product",
		active: true,
		created: 1678833149,
		default_price: null,
		description: null,
		images: [],
		marketing_features: [],
		livemode: false,
		metadata: {},
		name: "Gold Plan",
		package_dimensions: null,
		shippable: null,
		statement_descriptor: null,
		tax_code: null,
		unit_label: null,
		updated: 1678833149,
		url: null,
	};

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
		products: {
			create: vi.fn().mockResolvedValue(sampleProduct),
			update: vi.fn().mockResolvedValue({
				id: "prod_NWjs8kKbJWmuuc",
				object: "product",
				active: true,
				created: 1678833149,
				default_price: null,
				description: null,
				images: [],
				marketing_features: [],
				livemode: false,
				metadata: {},
				name: "Gold Plan 2",
				package_dimensions: null,
				shippable: null,
				statement_descriptor: null,
				tax_code: null,
				unit_label: null,
				updated: 1678833149,
				url: null,
			}),
			del: vi.fn().mockResolvedValue({
				id: "prod_NWjs8kKbJWmuuc",
				object: "product",
				deleted: true,
			}),
			retrieve: vi.fn().mockResolvedValue(sampleProduct),
			list: vi.fn().mockResolvedValue({
				object: "list",
				url: "/v1/products",
				has_more: false,
				data: [
					{
						id: "prod_NWjs8kKbJWmuuc",
						object: "product",
						active: true,
						created: 1678833149,
						default_price: null,
						description: null,
						images: [],
						marketing_features: [],
						livemode: false,
						metadata: {},
						name: "Gold Plan",
						package_dimensions: null,
						shippable: null,
						statement_descriptor: null,
						tax_code: null,
						unit_label: null,
						updated: 1678833149,
						url: null,
					},
				],
			}),
			search: vi.fn().mockResolvedValue({
				object: "search_result",
				url: "/v1/products/search",
				has_more: false,
				data: [
					{
						id: "prod_NZOkxQ8eTZEHwN",
						object: "product",
						active: true,
						created: 1679446501,
						default_price: null,
						description: null,
						images: [],
						livemode: false,
						metadata: {
							order_id: "6735",
						},
						name: "Gold Plan",
						package_dimensions: null,
						shippable: null,
						statement_descriptor: null,
						tax_code: null,
						unit_label: null,
						updated: 1679446501,
						url: null,
					},
				],
			}),
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

	const headers = new Headers();

	it("should create a customer on sign up", async () => {
		const ctx = await auth.$context;
		const userRes = await authClient.signUp.email(testUser, {
			throw: true,
		});
		await authClient.signIn.email(testUser, {
			throw: true,
			onSuccess: setCookieToHeader(headers),
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

	it("should create a new product", async () => {
		var res = await authClient.products.create({
			name: "Gold Plan",
			defaultPrice: {
				currency: "usd",
				unitAmount: 1000,
			},
			fetchOptions: {
				headers,
			},
		});
		expect(res.data!.product["name"]).toBe("Gold Plan");
	});

	it("should update a product", async () => {
		var res = await authClient.products.update({
			productId: "prod_NWjs8kKbJWmuuc",
			name: "Gold Plan 2",
			fetchOptions: {
				headers,
			},
		});
		expect(res.data!.product["name"]).toBe("Gold Plan 2");
	});

	it("should delete a product", async () => {
		var res = await authClient.products.delete({
			productId: "prod_NWjs8kKbJWmuuc",
			fetchOptions: {
				headers,
			},
		});
		expect(res.data!["product"]["id"]).toBe("prod_NWjs8kKbJWmuuc");
		expect(res.data!["product"]["deleted"]).toBe(true);
	});

	it("should retrieve a product", async () => {
		var res = await authClient.products.retrieve({
			productId: "prod_NWjs8kKbJWmuuc",
			fetchOptions: {
				headers,
			},
		});
		expect(res.data!.product["id"]).toBe("prod_NWjs8kKbJWmuuc");
	});

	it("should list products", async () => {
		var res = await authClient.products.list({
			active: true,
			fetchOptions: {
				headers,
			},
		});
		expect(res.data!.product.data!.length).toBeGreaterThan(0);
	});

	it("should search products", async () => {
		var res = await authClient.products.search({
			searchQuery: "active:'true' AND metadata['order_id']:'6735'",
			fetchOptions: {
				headers,
			},
		});
		expect(res.data!.product.data!.length).toBeGreaterThan(0);
		expect(res.data!.product.data![0].metadata["order_id"]).toBe("6735");
	});
});
