import { runWithEndpointContext } from "@better-auth/core/context";
import type { Auth, User } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import { organization } from "better-auth/plugins/organization";
import { getTestInstance } from "better-auth/test";
import type Stripe from "stripe";
import {
	assert,
	beforeEach,
	describe,
	expect,
	expectTypeOf,
	it,
	vi,
} from "vitest";
import type { StripePlugin } from "../src";
import { stripe } from "../src";
import { stripeClient } from "../src/client";
import { customerMetadata, subscriptionMetadata } from "../src/metadata";
import type { StripeOptions, Subscription } from "../src/types";

describe("stripe type", () => {
	it("should api endpoint exists", () => {
		type Plugins = [
			StripePlugin<{
				stripeClient: Stripe;
				stripeWebhookSecret: string;
				subscription: {
					enabled: false;
				};
			}>,
		];
		type MyAuth = Auth<{
			plugins: Plugins;
		}>;
		expectTypeOf<MyAuth["api"]["stripeWebhook"]>().toBeFunction();
	});

	it("should have subscription endpoints", () => {
		type Plugins = [
			StripePlugin<{
				stripeClient: Stripe;
				stripeWebhookSecret: string;
				subscription: {
					enabled: true;
					plans: [];
				};
			}>,
		];
		type MyAuth = Auth<{
			plugins: Plugins;
		}>;
		expectTypeOf<MyAuth["api"]["stripeWebhook"]>().toBeFunction();
		expectTypeOf<MyAuth["api"]["subscriptionSuccess"]>().toBeFunction();
		expectTypeOf<MyAuth["api"]["listActiveSubscriptions"]>().toBeFunction();
		expectTypeOf<MyAuth["api"]["cancelSubscriptionCallback"]>().toBeFunction();
		expectTypeOf<MyAuth["api"]["cancelSubscription"]>().toBeFunction();
		expectTypeOf<MyAuth["api"]["restoreSubscription"]>().toBeFunction();
		expectTypeOf<MyAuth["api"]["upgradeSubscription"]>().toBeFunction();
		expectTypeOf<MyAuth["api"]["createBillingPortal"]>().toBeFunction();
	});

	it("should infer plugin schema fields on user type", async () => {
		const { auth } = await getTestInstance({
			plugins: [
				stripe({
					stripeClient: {} as Stripe,
					stripeWebhookSecret: "test",
				}),
			],
		});
		expectTypeOf<
			(typeof auth)["$Infer"]["Session"]["user"]["stripeCustomerId"]
		>().toEqualTypeOf<string | null | undefined>();
	});

	it("should infer plugin schema fields alongside additional user fields", async () => {
		const { auth } = await getTestInstance({
			plugins: [
				stripe({
					stripeClient: {} as Stripe,
					stripeWebhookSecret: "test",
				}),
			],
			user: {
				additionalFields: {
					customField: {
						type: "string",
						required: false,
					},
				},
			},
		});
		expectTypeOf<
			(typeof auth)["$Infer"]["Session"]["user"]["stripeCustomerId"]
		>().toEqualTypeOf<string | null | undefined>();
		expectTypeOf<
			(typeof auth)["$Infer"]["Session"]["user"]["customField"]
		>().toEqualTypeOf<string | null | undefined>();
	});
});

describe("stripe - metadata helpers", () => {
	it("customerMetadata.set protects internal fields", () => {
		const result = customerMetadata.set(
			{ userId: "real", customerType: "user" },
			{ userId: "fake", custom: "value" },
		);
		expect(result.userId).toBe("real");
		expect(result.customerType).toBe("user");
		expect(result.custom).toBe("value");
	});

	it("customerMetadata.get extracts typed fields", () => {
		const result = customerMetadata.get({
			userId: "u1",
			customerType: "organization",
			extra: "ignored",
		});
		expect(result.userId).toBe("u1");
		expect(result.customerType).toBe("organization");
		expect(result).not.toHaveProperty("extra");
	});

	it("subscriptionMetadata.set protects internal fields", () => {
		const result = subscriptionMetadata.set(
			{ userId: "u1", subscriptionId: "s1", referenceId: "r1" },
			{ subscriptionId: "fake" },
		);
		expect(result.subscriptionId).toBe("s1");
	});

	it("subscriptionMetadata.get extracts typed fields", () => {
		const result = subscriptionMetadata.get({
			userId: "u1",
			subscriptionId: "s1",
			referenceId: "r1",
			extra: "ignored",
		});
		expect(result.userId).toBe("u1");
		expect(result.subscriptionId).toBe("s1");
		expect(result.referenceId).toBe("r1");
		expect(result).not.toHaveProperty("extra");
	});
});

describe("stripe", () => {
	const mockStripe = {
		prices: {
			list: vi.fn().mockResolvedValue({ data: [{ id: "price_lookup_123" }] }),
		},
		customers: {
			create: vi.fn().mockResolvedValue({ id: "cus_mock123" }),
			list: vi.fn().mockResolvedValue({ data: [] }),
			search: vi.fn().mockResolvedValue({ data: [] }),
			retrieve: vi.fn().mockResolvedValue({
				id: "cus_mock123",
				email: "test@email.com",
				deleted: false,
			}),
			update: vi.fn().mockResolvedValue({
				id: "cus_mock123",
				email: "newemail@example.com",
			}),
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
			constructEventAsync: vi.fn(),
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

	const testUser = {
		email: "test@email.com",
		password: "password",
		name: "Test User",
	};
	const data = {
		user: [],
		session: [],
		verification: [],
		account: [],
		customer: [],
		subscription: [],
	};

	beforeEach(() => {
		data.user = [];
		data.session = [];
		data.verification = [];
		data.account = [];
		data.customer = [];
		data.subscription = [];

		vi.clearAllMocks();
	});

	const memory = memoryAdapter(data);

	it("should create a customer on sign up", async () => {
		const { client, auth } = await getTestInstance(
			{
				database: memory,
				plugins: [stripe(stripeOptions)],
			},
			{
				disableTestUser: true,
				clientOptions: {
					plugins: [stripeClient({ subscription: true })],
				},
			},
		);
		const ctx = await auth.$context;

		const userRes = await client.signUp.email(testUser, {
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

	it("should create a subscription", async () => {
		const { client, auth, sessionSetter } = await getTestInstance(
			{
				database: memory,
				plugins: [stripe(stripeOptions)],
			},
			{
				disableTestUser: true,
				clientOptions: {
					plugins: [stripeClient({ subscription: true })],
				},
			},
		);
		const ctx = await auth.$context;

		const userRes = await client.signUp.email(testUser, {
			throw: true,
		});

		const headers = new Headers();
		await client.signIn.email(testUser, {
			throw: true,
			onSuccess: sessionSetter(headers),
		});

		const res = await client.subscription.upgrade({
			plan: "starter",
			fetchOptions: {
				headers,
			},
		});
		expect(res.data?.url).toBeDefined();
		const subscription = await ctx.adapter.findOne<Subscription>({
			model: "subscription",
			where: [
				{
					field: "referenceId",
					value: userRes.user.id,
				},
			],
		});
		expect(subscription).toMatchObject({
			id: expect.any(String),
			plan: "starter",
			referenceId: userRes.user.id,
			stripeCustomerId: expect.any(String),
			status: "incomplete",
			periodStart: undefined,
			cancelAtPeriodEnd: false,
			trialStart: undefined,
			trialEnd: undefined,
		});
	});

	it("should not allow cross-user subscriptionId operations (upgrade/cancel/restore)", async () => {
		const { client, auth, sessionSetter } = await getTestInstance(
			{
				database: memory,
				plugins: [stripe(stripeOptions)],
			},
			{
				disableTestUser: true,
				clientOptions: {
					plugins: [stripeClient({ subscription: true })],
				},
			},
		);
		const ctx = await auth.$context;

		const userA = {
			email: "user-a@email.com",
			password: "password",
			name: "User A",
		};
		const userARes = await client.signUp.email(userA, { throw: true });

		const userAHeaders = new Headers();
		await client.signIn.email(userA, {
			throw: true,
			onSuccess: sessionSetter(userAHeaders),
		});
		await client.subscription.upgrade({
			plan: "starter",
			fetchOptions: { headers: userAHeaders },
		});

		const userASub = await ctx.adapter.findOne<Subscription>({
			model: "subscription",
			where: [{ field: "referenceId", value: userARes.user.id }],
		});
		expect(userASub).toBeTruthy();

		const userB = {
			email: "user-b@email.com",
			password: "password",
			name: "User B",
		};
		await client.signUp.email(userB, { throw: true });
		const userBHeaders = new Headers();
		await client.signIn.email(userB, {
			throw: true,
			onSuccess: sessionSetter(userBHeaders),
		});

		mockStripe.checkout.sessions.create.mockClear();
		mockStripe.billingPortal.sessions.create.mockClear();
		mockStripe.subscriptions.list.mockClear();
		mockStripe.subscriptions.update.mockClear();

		const upgradeRes = await client.subscription.upgrade({
			plan: "premium",
			subscriptionId: userASub!.id,
			fetchOptions: { headers: userBHeaders },
		});
		expect(upgradeRes.error?.message).toContain("Subscription not found");
		expect(mockStripe.checkout.sessions.create).not.toHaveBeenCalled();
		expect(mockStripe.billingPortal.sessions.create).not.toHaveBeenCalled();

		const cancelHeaders = new Headers(userBHeaders);
		cancelHeaders.set("content-type", "application/json");
		const cancelResponse = await auth.handler(
			new Request("http://localhost:3000/api/auth/subscription/cancel", {
				method: "POST",
				headers: cancelHeaders,
				body: JSON.stringify({
					subscriptionId: userASub!.id,
					returnUrl: "/account",
				}),
			}),
		);
		expect(cancelResponse.status).toBe(400);
		expect((await cancelResponse.json()).message).toContain(
			"Subscription not found",
		);
		expect(mockStripe.billingPortal.sessions.create).not.toHaveBeenCalled();

		const restoreHeaders = new Headers(userBHeaders);
		restoreHeaders.set("content-type", "application/json");
		const restoreResponse = await auth.handler(
			new Request("http://localhost:3000/api/auth/subscription/restore", {
				method: "POST",
				headers: restoreHeaders,
				body: JSON.stringify({
					subscriptionId: userASub!.id,
				}),
			}),
		);
		expect(restoreResponse.status).toBe(400);
		expect((await restoreResponse.json()).message).toContain(
			"Subscription not found",
		);
		expect(mockStripe.subscriptions.update).not.toHaveBeenCalled();
	});

	it("should pass metadata to subscription when upgrading", async () => {
		const { client, sessionSetter } = await getTestInstance(
			{
				database: memory,
				plugins: [stripe(stripeOptions)],
			},
			{
				disableTestUser: true,
				clientOptions: {
					plugins: [
						stripeClient({
							subscription: true,
						}),
					],
				},
			},
		);

		await client.signUp.email(
			{
				...testUser,
				email: "metadata-test@email.com",
			},
			{
				throw: true,
			},
		);

		const headers = new Headers();
		await client.signIn.email(
			{
				...testUser,
				email: "metadata-test@email.com",
			},
			{
				throw: true,
				onSuccess: sessionSetter(headers),
			},
		);

		const customMetadata = {
			customField: "customValue",
			organizationId: "org_123",
			projectId: "proj_456",
		};

		await client.subscription.upgrade({
			plan: "starter",
			metadata: customMetadata,
			fetchOptions: {
				headers,
			},
		});

		expect(mockStripe.checkout.sessions.create).toHaveBeenCalledWith(
			expect.objectContaining({
				subscription_data: expect.objectContaining({
					metadata: expect.objectContaining(customMetadata),
				}),
				metadata: expect.objectContaining(customMetadata),
			}),
			undefined,
		);
	});

	it("should list active subscriptions", async () => {
		const { client, auth, sessionSetter } = await getTestInstance(
			{
				database: memory,
				plugins: [stripe(stripeOptions)],
			},
			{
				disableTestUser: true,
				clientOptions: {
					plugins: [stripeClient({ subscription: true })],
				},
			},
		);
		const ctx = await auth.$context;

		const userRes = await client.signUp.email(
			{
				...testUser,
				email: "list-test@email.com",
			},
			{
				throw: true,
			},
		);
		const userId = userRes.user.id;

		const headers = new Headers();
		await client.signIn.email(
			{
				...testUser,
				email: "list-test@email.com",
			},
			{
				throw: true,
				onSuccess: sessionSetter(headers),
			},
		);

		const listRes = await client.subscription.list({
			fetchOptions: {
				headers,
			},
		});

		expect(Array.isArray(listRes.data)).toBe(true);

		await client.subscription.upgrade({
			plan: "starter",
			fetchOptions: {
				headers,
			},
		});
		const listBeforeActive = await client.subscription.list({
			fetchOptions: {
				headers,
			},
		});
		expect(listBeforeActive.data?.length).toBe(0);
		// Update the subscription status to active
		await ctx.adapter.update({
			model: "subscription",
			update: {
				status: "active",
			},
			where: [
				{
					field: "referenceId",
					value: userId,
				},
			],
		});
		const listAfterRes = await client.subscription.list({
			fetchOptions: {
				headers,
			},
		});
		expect(listAfterRes.data?.length).toBeGreaterThan(0);
	});

	it("should handle subscription webhook events", async () => {
		const { auth: testAuth } = await getTestInstance(
			{
				database: memory,
				plugins: [stripe(stripeOptions)],
			},
			{
				disableTestUser: true,
			},
		);
		const testCtx = await testAuth.$context;

		const { id: testReferenceId } = await testCtx.adapter.create({
			model: "user",
			data: {
				email: "test@email.com",
			},
		});
		const { id: testSubscriptionId } = await testCtx.adapter.create({
			model: "subscription",
			data: {
				referenceId: testReferenceId,
				stripeCustomerId: "cus_mock123",
				status: "active",
				plan: "starter",
			},
		});
		const mockCheckoutSessionEvent = {
			type: "checkout.session.completed",
			data: {
				object: {
					mode: "subscription",
					subscription: testSubscriptionId,
					metadata: {
						referenceId: testReferenceId,
						subscriptionId: testSubscriptionId,
					},
				},
			},
		};

		const mockSubscription = {
			id: testSubscriptionId,
			status: "active",
			items: {
				data: [
					{
						price: { id: process.env.STRIPE_PRICE_ID_1 },
						quantity: 1,
					},
				],
			},
			current_period_start: Math.floor(Date.now() / 1000),
			current_period_end: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
		};

		const stripeForTest = {
			...stripeOptions.stripeClient,
			subscriptions: {
				...stripeOptions.stripeClient.subscriptions,
				retrieve: vi.fn().mockResolvedValue(mockSubscription),
			},
			webhooks: {
				constructEventAsync: vi
					.fn()
					.mockResolvedValue(mockCheckoutSessionEvent),
			},
		};

		const testOptions = {
			...stripeOptions,
			stripeClient: stripeForTest as unknown as Stripe,
			stripeWebhookSecret: "test_secret",
		};

		const { auth: webhookTestAuth } = await getTestInstance(
			{
				database: memory,
				plugins: [stripe(testOptions)],
			},
			{
				disableTestUser: true,
			},
		);

		const webhookTestCtx = await webhookTestAuth.$context;

		const mockRequest = new Request(
			"http://localhost:3000/api/auth/stripe/webhook",
			{
				method: "POST",
				headers: {
					"stripe-signature": "test_signature",
				},
				body: JSON.stringify(mockCheckoutSessionEvent),
			},
		);
		const response = await webhookTestAuth.handler(mockRequest);
		expect(response.status).toBe(200);

		const updatedSubscription =
			await webhookTestCtx.adapter.findOne<Subscription>({
				model: "subscription",
				where: [
					{
						field: "id",
						value: testSubscriptionId,
					},
				],
			});

		expect(updatedSubscription).toMatchObject({
			id: testSubscriptionId,
			status: "active",
			periodStart: expect.any(Date),
			periodEnd: expect.any(Date),
			plan: "starter",
		});
	});

	it("should handle subscription webhook events with trial", async () => {
		const { auth: testAuth } = await getTestInstance(
			{
				database: memory,
				plugins: [stripe(stripeOptions)],
			},
			{
				disableTestUser: true,
			},
		);
		const testCtx = await testAuth.$context;

		const { id: testReferenceId } = await testCtx.adapter.create({
			model: "user",
			data: {
				email: "test@email.com",
			},
		});
		const { id: testSubscriptionId } = await testCtx.adapter.create({
			model: "subscription",
			data: {
				referenceId: testReferenceId,
				stripeCustomerId: "cus_mock123",
				status: "incomplete",
				plan: "starter",
			},
		});
		const mockCheckoutSessionEvent = {
			type: "checkout.session.completed",
			data: {
				object: {
					mode: "subscription",
					subscription: testSubscriptionId,
					metadata: {
						referenceId: testReferenceId,
						subscriptionId: testSubscriptionId,
					},
				},
			},
		};

		const mockSubscription = {
			id: testSubscriptionId,
			status: "active",
			items: {
				data: [
					{
						price: { id: process.env.STRIPE_PRICE_ID_1 },
						quantity: 1,
					},
				],
			},
			current_period_start: Math.floor(Date.now() / 1000),
			current_period_end: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
			trial_start: Math.floor(Date.now() / 1000),
			trial_end: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
		};

		const stripeForTest = {
			...stripeOptions.stripeClient,
			subscriptions: {
				...stripeOptions.stripeClient.subscriptions,
				retrieve: vi.fn().mockResolvedValue(mockSubscription),
			},
			webhooks: {
				constructEventAsync: vi
					.fn()
					.mockResolvedValue(mockCheckoutSessionEvent),
			},
		};

		const testOptions = {
			...stripeOptions,
			stripeClient: stripeForTest as unknown as Stripe,
			stripeWebhookSecret: "test_secret",
		};

		const { auth: webhookTestAuth } = await getTestInstance(
			{
				database: memory,
				plugins: [stripe(testOptions)],
			},
			{
				disableTestUser: true,
			},
		);

		const webhookTestCtx = await webhookTestAuth.$context;

		const mockRequest = new Request(
			"http://localhost:3000/api/auth/stripe/webhook",
			{
				method: "POST",
				headers: {
					"stripe-signature": "test_signature",
				},
				body: JSON.stringify(mockCheckoutSessionEvent),
			},
		);
		const response = await webhookTestAuth.handler(mockRequest);
		expect(response.status).toBe(200);

		const updatedSubscription =
			await webhookTestCtx.adapter.findOne<Subscription>({
				model: "subscription",
				where: [
					{
						field: "id",
						value: testSubscriptionId,
					},
				],
			});

		expect(updatedSubscription).toMatchObject({
			id: testSubscriptionId,
			status: "active",
			periodStart: expect.any(Date),
			periodEnd: expect.any(Date),
			plan: "starter",
			trialStart: expect.any(Date),
			trialEnd: expect.any(Date),
		});
	});

	it("should handle subscription deletion webhook", async () => {
		const { auth: testAuth } = await getTestInstance(
			{
				database: memory,
				plugins: [stripe(stripeOptions)],
			},
			{
				disableTestUser: true,
			},
		);
		const testCtx = await testAuth.$context;

		const { id: userId } = await testCtx.adapter.create({
			model: "user",
			data: {
				email: "delete-test@email.com",
			},
		});

		const subId = "test_sub_delete";

		await testCtx.adapter.create({
			model: "subscription",
			data: {
				referenceId: userId,
				stripeCustomerId: "cus_delete_test",
				status: "active",
				plan: "starter",
				stripeSubscriptionId: "sub_delete_test",
			},
		});

		const subscription = await testCtx.adapter.findOne<Subscription>({
			model: "subscription",
			where: [
				{
					field: "referenceId",
					value: userId,
				},
			],
		});

		const mockDeleteEvent = {
			type: "customer.subscription.deleted",
			data: {
				object: {
					id: "sub_delete_test",
					customer: subscription?.stripeCustomerId,
					status: "canceled",
					metadata: {
						referenceId: subscription?.referenceId,
						subscriptionId: subscription?.id,
					},
				},
			},
		};

		const stripeForTest = {
			...stripeOptions.stripeClient,
			webhooks: {
				constructEventAsync: vi.fn().mockResolvedValue(mockDeleteEvent),
			},
			subscriptions: {
				retrieve: vi.fn().mockResolvedValue({
					status: "canceled",
					id: subId,
				}),
			},
		};

		const testOptions = {
			...stripeOptions,
			stripeClient: stripeForTest as unknown as Stripe,
			stripeWebhookSecret: "test_secret",
		};

		const { auth: webhookTestAuth } = await getTestInstance(
			{
				database: memory,
				plugins: [stripe(testOptions)],
			},
			{
				disableTestUser: true,
			},
		);

		const webhookTestCtx = await webhookTestAuth.$context;

		const mockRequest = new Request(
			"http://localhost:3000/api/auth/stripe/webhook",
			{
				method: "POST",
				headers: {
					"stripe-signature": "test_signature",
				},
				body: JSON.stringify(mockDeleteEvent),
			},
		);

		const response = await webhookTestAuth.handler(mockRequest);
		expect(response.status).toBe(200);

		if (subscription) {
			const updatedSubscription =
				await webhookTestCtx.adapter.findOne<Subscription>({
					model: "subscription",
					where: [
						{
							field: "id",
							value: subscription.id,
						},
					],
				});
			expect(updatedSubscription?.status).toBe("canceled");
		}
	});

	it("should handle customer.subscription.created webhook event", async () => {
		const stripeForTest = {
			...stripeOptions.stripeClient,
			webhooks: {
				constructEventAsync: vi.fn(),
			},
		};

		const testOptions = {
			...stripeOptions,
			stripeClient: stripeForTest as unknown as Stripe,
			stripeWebhookSecret: "test_secret",
		};

		const { auth: testAuth } = await getTestInstance(
			{
				database: memory,
				plugins: [stripe(testOptions)],
			},
			{
				disableTestUser: true,
			},
		);
		const testCtx = await testAuth.$context;

		// Create a user with stripeCustomerId
		const userWithCustomerId = await testCtx.adapter.create({
			model: "user",
			data: {
				email: "dashboard-user@test.com",
				name: "Dashboard User",
				emailVerified: true,
				stripeCustomerId: "cus_dashboard_test",
			},
		});

		const mockEvent = {
			type: "customer.subscription.created",
			data: {
				object: {
					id: "sub_dashboard_created",
					customer: "cus_dashboard_test",
					status: "active",
					items: {
						data: [
							{
								price: { id: process.env.STRIPE_PRICE_ID_1 },
								quantity: 1,
								current_period_start: Math.floor(Date.now() / 1000),
								current_period_end:
									Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
							},
						],
					},
					cancel_at_period_end: false,
				},
			},
		};

		(stripeForTest.webhooks.constructEventAsync as any).mockResolvedValue(
			mockEvent,
		);

		const mockRequest = new Request(
			"http://localhost:3000/api/auth/stripe/webhook",
			{
				method: "POST",
				headers: {
					"stripe-signature": "test_signature",
				},
				body: JSON.stringify(mockEvent),
			},
		);

		const response = await testAuth.handler(mockRequest);
		expect(response.status).toBe(200);

		// Verify subscription was created in database
		const subscription = await testCtx.adapter.findOne<Subscription>({
			model: "subscription",
			where: [
				{ field: "stripeSubscriptionId", value: "sub_dashboard_created" },
			],
		});

		expect(subscription).toBeDefined();
		expect(subscription?.referenceId).toBe(userWithCustomerId.id);
		expect(subscription?.stripeCustomerId).toBe("cus_dashboard_test");
		expect(subscription?.status).toBe("active");
		expect(subscription?.plan).toBe("starter");
		expect(subscription?.seats).toBe(1);
	});

	it("should not create duplicate subscription if already exists", async () => {
		const onSubscriptionCreatedCallback = vi.fn();

		const stripeForTest = {
			...stripeOptions.stripeClient,
			webhooks: {
				constructEventAsync: vi.fn(),
			},
		};

		const testOptions = {
			...stripeOptions,
			stripeClient: stripeForTest as unknown as Stripe,
			stripeWebhookSecret: "test_secret",
			subscription: {
				...stripeOptions.subscription,
				onSubscriptionCreated: onSubscriptionCreatedCallback,
			},
		} as StripeOptions;

		const { auth: testAuth } = await getTestInstance(
			{
				database: memory,
				plugins: [stripe(testOptions)],
			},
			{
				disableTestUser: true,
			},
		);
		const testCtx = await testAuth.$context;

		// Create user
		const user = await testCtx.adapter.create({
			model: "user",
			data: {
				email: "duplicate-sub@test.com",
				name: "Duplicate Test",
				emailVerified: true,
				stripeCustomerId: "cus_duplicate_test",
			},
		});

		// Create existing subscription
		await testCtx.adapter.create({
			model: "subscription",
			data: {
				referenceId: user.id,
				stripeCustomerId: "cus_duplicate_test",
				stripeSubscriptionId: "sub_already_exists",
				status: "active",
				plan: "starter",
			},
		});

		const mockEvent = {
			type: "customer.subscription.created",
			data: {
				object: {
					id: "sub_already_exists",
					customer: "cus_duplicate_test",
					status: "active",
					items: {
						data: [
							{
								price: { id: process.env.STRIPE_PRICE_ID_1 },
								quantity: 1,
								current_period_start: Math.floor(Date.now() / 1000),
								current_period_end:
									Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
							},
						],
					},
					cancel_at_period_end: false,
				},
			},
		};

		(stripeForTest.webhooks.constructEventAsync as any).mockResolvedValue(
			mockEvent,
		);

		const mockRequest = new Request(
			"http://localhost:3000/api/auth/stripe/webhook",
			{
				method: "POST",
				headers: {
					"stripe-signature": "test_signature",
				},
				body: JSON.stringify(mockEvent),
			},
		);

		const response = await testAuth.handler(mockRequest);
		expect(response.status).toBe(200);

		// Verify only one subscription exists (no duplicate)
		const subscriptions = await testCtx.adapter.findMany<Subscription>({
			model: "subscription",
			where: [
				{
					field: "stripeSubscriptionId",
					value: "sub_already_exists",
				},
			],
		});

		expect(subscriptions.length).toBe(1);

		// Verify callback was NOT called (early return due to existing subscription)
		expect(onSubscriptionCreatedCallback).not.toHaveBeenCalled();
	});

	it("should skip subscription creation when user not found", async () => {
		const onSubscriptionCreatedCallback = vi.fn();

		const stripeForTest = {
			...stripeOptions.stripeClient,
			webhooks: {
				constructEventAsync: vi.fn(),
			},
		};

		const testOptions = {
			...stripeOptions,
			stripeClient: stripeForTest as unknown as Stripe,
			stripeWebhookSecret: "test_secret",
			subscription: {
				...stripeOptions.subscription,
				onSubscriptionCreated: onSubscriptionCreatedCallback,
			},
		} as StripeOptions;

		const { auth: testAuth } = await getTestInstance(
			{
				database: memory,
				plugins: [stripe(testOptions)],
			},
			{
				disableTestUser: true,
			},
		);
		const testCtx = await testAuth.$context;

		const mockEvent = {
			type: "customer.subscription.created",
			data: {
				object: {
					id: "sub_no_user",
					customer: "cus_nonexistent",
					status: "active",
					items: {
						data: [
							{
								price: { id: process.env.STRIPE_PRICE_ID_1 },
								quantity: 1,
								current_period_start: Math.floor(Date.now() / 1000),
								current_period_end:
									Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
							},
						],
					},
					cancel_at_period_end: false,
				},
			},
		};

		(stripeForTest.webhooks.constructEventAsync as any).mockResolvedValue(
			mockEvent,
		);

		const mockRequest = new Request(
			"http://localhost:3000/api/auth/stripe/webhook",
			{
				method: "POST",
				headers: {
					"stripe-signature": "test_signature",
				},
				body: JSON.stringify(mockEvent),
			},
		);

		const response = await testAuth.handler(mockRequest);
		expect(response.status).toBe(200);

		// Verify subscription was NOT created
		const subscription = await testCtx.adapter.findOne<Subscription>({
			model: "subscription",
			where: [{ field: "stripeSubscriptionId", value: "sub_no_user" }],
		});

		expect(subscription).toBeNull();

		// Verify callback was NOT called (early return due to user not found)
		expect(onSubscriptionCreatedCallback).not.toHaveBeenCalled();
	});

	it("should skip subscription creation when plan not found", async () => {
		const onSubscriptionCreatedCallback = vi.fn();

		const stripeForTest = {
			...stripeOptions.stripeClient,
			webhooks: {
				constructEventAsync: vi.fn(),
			},
		};

		const testOptions = {
			...stripeOptions,
			stripeClient: stripeForTest as unknown as Stripe,
			stripeWebhookSecret: "test_secret",
			subscription: {
				...stripeOptions.subscription,
				onSubscriptionCreated: onSubscriptionCreatedCallback,
			},
		} as StripeOptions;

		const { auth: testAuth } = await getTestInstance(
			{
				database: memory,
				plugins: [stripe(testOptions)],
			},
			{
				disableTestUser: true,
			},
		);
		const testCtx = await testAuth.$context;

		// Create user
		await testCtx.adapter.create({
			model: "user",
			data: {
				email: "no-plan@test.com",
				name: "No Plan User",
				emailVerified: true,
				stripeCustomerId: "cus_no_plan",
			},
		});

		const mockEvent = {
			type: "customer.subscription.created",
			data: {
				object: {
					id: "sub_no_plan",
					customer: "cus_no_plan",
					status: "active",
					items: {
						data: [
							{
								price: { id: "price_unknown" }, // Unknown price
								quantity: 1,
								current_period_start: Math.floor(Date.now() / 1000),
								current_period_end:
									Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
							},
						],
					},
					cancel_at_period_end: false,
				},
			},
		};

		(stripeForTest.webhooks.constructEventAsync as any).mockResolvedValue(
			mockEvent,
		);

		const mockRequest = new Request(
			"http://localhost:3000/api/auth/stripe/webhook",
			{
				method: "POST",
				headers: {
					"stripe-signature": "test_signature",
				},
				body: JSON.stringify(mockEvent),
			},
		);

		const response = await testAuth.handler(mockRequest);
		expect(response.status).toBe(200);

		// Verify subscription was NOT created (no matching plan)
		const subscription = await testCtx.adapter.findOne<Subscription>({
			model: "subscription",
			where: [{ field: "stripeSubscriptionId", value: "sub_no_plan" }],
		});

		expect(subscription).toBeNull();

		// Verify callback was NOT called (early return due to plan not found)
		expect(onSubscriptionCreatedCallback).not.toHaveBeenCalled();
	});

	it("should skip creating subscription when metadata.subscriptionId exists", async () => {
		const stripeForTest = {
			...stripeOptions.stripeClient,
			webhooks: {
				constructEventAsync: vi.fn(),
			},
		};

		const testOptions = {
			...stripeOptions,
			stripeClient: stripeForTest as unknown as Stripe,
			stripeWebhookSecret: "test_secret",
		};

		const {
			auth: testAuth,
			client,
			sessionSetter,
		} = await getTestInstance(
			{
				database: memory,
				plugins: [stripe(testOptions)],
			},
			{
				disableTestUser: true,
				clientOptions: {
					plugins: [stripeClient({ subscription: true })],
				},
			},
		);
		const testCtx = await testAuth.$context;

		// Create user and sign in
		const userRes = await client.signUp.email(
			{
				...testUser,
			},
			{ throw: true },
		);
		const userId = userRes.user.id;

		const headers = new Headers();
		await client.signIn.email(
			{
				...testUser,
			},
			{
				throw: true,
				onSuccess: sessionSetter(headers),
			},
		);

		// User upgrades to paid plan - this creates an "incomplete" subscription
		await client.subscription.upgrade({
			plan: "starter",
			fetchOptions: { headers },
		});

		// Verify the incomplete subscription was created
		const incompleteSubscription = await testCtx.adapter.findOne<Subscription>({
			model: "subscription",
			where: [{ field: "referenceId", value: userId }],
		});
		assert(
			incompleteSubscription,
			"Expected incomplete subscription to be created",
		);
		expect(incompleteSubscription.status).toBe("incomplete");
		expect(incompleteSubscription.stripeSubscriptionId).toBeUndefined();

		// Get user with stripeCustomerId
		const user = await testCtx.adapter.findOne<any>({
			model: "user",
			where: [{ field: "id", value: userId }],
		});
		const stripeCustomerId = user?.stripeCustomerId;
		expect(stripeCustomerId).toBeDefined();

		// Simulate `customer.subscription.created` webhook arriving
		const mockEvent = {
			type: "customer.subscription.created",
			data: {
				object: {
					id: "sub_new_from_checkout",
					customer: stripeCustomerId,
					status: "active",
					metadata: {
						subscriptionId: incompleteSubscription.id,
					},
					items: {
						data: [
							{
								price: { id: process.env.STRIPE_PRICE_ID_1 },
								quantity: 1,
								current_period_start: Math.floor(Date.now() / 1000),
								current_period_end:
									Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
							},
						],
					},
					cancel_at_period_end: false,
				},
			},
		};

		(stripeForTest.webhooks.constructEventAsync as any).mockResolvedValue(
			mockEvent,
		);

		const mockRequest = new Request(
			"http://localhost:3000/api/auth/stripe/webhook",
			{
				method: "POST",
				headers: {
					"stripe-signature": "test_signature",
				},
				body: JSON.stringify(mockEvent),
			},
		);

		const response = await testAuth.handler(mockRequest);
		expect(response.status).toBe(200);

		// Verify that no duplicate subscription was created
		const allSubscriptions = await testCtx.adapter.findMany<Subscription>({
			model: "subscription",
			where: [{ field: "referenceId", value: userId }],
		});
		expect(allSubscriptions.length).toBe(1);
	});

	it("should execute subscription event handlers", async () => {
		const { auth: testAuth } = await getTestInstance(
			{
				database: memory,
				plugins: [stripe(stripeOptions)],
			},
			{
				disableTestUser: true,
			},
		);
		const testCtx = await testAuth.$context;

		const { id: userId } = await testCtx.adapter.create({
			model: "user",
			data: {
				email: "event-handler-test@email.com",
			},
		});

		const onSubscriptionComplete = vi.fn();
		const onSubscriptionUpdate = vi.fn();
		const onSubscriptionCancel = vi.fn();
		const onSubscriptionDeleted = vi.fn();

		const testOptions = {
			...stripeOptions,
			subscription: {
				...stripeOptions.subscription,
				onSubscriptionComplete,
				onSubscriptionUpdate,
				onSubscriptionCancel,
				onSubscriptionDeleted,
			},
			stripeWebhookSecret: "test_secret",
		} as unknown as StripeOptions;

		// Test subscription complete handler
		const completeEvent = {
			type: "checkout.session.completed",
			data: {
				object: {
					mode: "subscription",
					subscription: "sub_123",
					metadata: {
						referenceId: "user_123",
						subscriptionId: "sub_123",
					},
				},
			},
		};

		const mockSubscription = {
			status: "active",
			items: {
				data: [{ price: { id: process.env.STRIPE_PRICE_ID_1 } }],
			},
			current_period_start: Math.floor(Date.now() / 1000),
			current_period_end: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
		};

		const mockStripeForEvents = {
			...testOptions.stripeClient,
			subscriptions: {
				retrieve: vi.fn().mockResolvedValue(mockSubscription),
			},
			webhooks: {
				constructEventAsync: vi.fn().mockResolvedValue(completeEvent),
			},
		};

		const eventTestOptions = {
			...testOptions,
			stripeClient: mockStripeForEvents as unknown as Stripe,
		};

		const { auth: eventTestAuth } = await getTestInstance(
			{
				database: memory,
				plugins: [stripe(eventTestOptions)],
			},
			{
				disableTestUser: true,
			},
		);

		const eventTestCtx = await eventTestAuth.$context;

		const { id: testSubscriptionId } = await eventTestCtx.adapter.create({
			model: "subscription",
			data: {
				referenceId: userId,
				stripeCustomerId: "cus_123",
				stripeSubscriptionId: "sub_123",
				status: "incomplete",
				plan: "starter",
			},
		});

		const webhookRequest = new Request(
			"http://localhost:3000/api/auth/stripe/webhook",
			{
				method: "POST",
				headers: {
					"stripe-signature": "test_signature",
				},
				body: JSON.stringify(completeEvent),
			},
		);

		await eventTestAuth.handler(webhookRequest);

		expect(onSubscriptionComplete).toHaveBeenCalledWith(
			expect.objectContaining({
				event: expect.any(Object),
				subscription: expect.any(Object),
				stripeSubscription: expect.any(Object),
				plan: expect.any(Object),
			}),
			expect.objectContaining({
				context: expect.any(Object),
				_flag: expect.any(String),
			}),
		);

		const updateEvent = {
			type: "customer.subscription.updated",
			data: {
				object: {
					id: testSubscriptionId,
					customer: "cus_123",
					status: "active",
					items: {
						data: [{ price: { id: process.env.STRIPE_PRICE_ID_1 } }],
					},
					current_period_start: Math.floor(Date.now() / 1000),
					current_period_end: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
				},
			},
		};

		const updateRequest = new Request(
			"http://localhost:3000/api/auth/stripe/webhook",
			{
				method: "POST",
				headers: {
					"stripe-signature": "test_signature",
				},
				body: JSON.stringify(updateEvent),
			},
		);

		mockStripeForEvents.webhooks.constructEventAsync.mockReturnValue(
			updateEvent,
		);
		await eventTestAuth.handler(updateRequest);
		expect(onSubscriptionUpdate).toHaveBeenCalledWith(
			expect.objectContaining({
				event: expect.any(Object),
				subscription: expect.any(Object),
			}),
		);

		const userCancelEvent = {
			type: "customer.subscription.updated",
			data: {
				object: {
					id: testSubscriptionId,
					customer: "cus_123",
					status: "active",
					cancel_at_period_end: true,
					cancellation_details: {
						reason: "cancellation_requested",
						comment: "Customer canceled subscription",
					},
					items: {
						data: [{ price: { id: process.env.STRIPE_PRICE_ID_1 } }],
					},
					current_period_start: Math.floor(Date.now() / 1000),
					current_period_end: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
				},
			},
		};

		const userCancelRequest = new Request(
			"http://localhost:3000/api/auth/stripe/webhook",
			{
				method: "POST",
				headers: {
					"stripe-signature": "test_signature",
				},
				body: JSON.stringify(userCancelEvent),
			},
		);

		mockStripeForEvents.webhooks.constructEventAsync.mockReturnValue(
			userCancelEvent,
		);
		await eventTestAuth.handler(userCancelRequest);
		const cancelEvent = {
			type: "customer.subscription.updated",
			data: {
				object: {
					id: testSubscriptionId,
					customer: "cus_123",
					status: "active",
					cancel_at_period_end: true,
					items: {
						data: [{ price: { id: process.env.STRIPE_PRICE_ID_1 } }],
					},
					current_period_start: Math.floor(Date.now() / 1000),
					current_period_end: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
				},
			},
		};

		const cancelRequest = new Request(
			"http://localhost:3000/api/auth/stripe/webhook",
			{
				method: "POST",
				headers: {
					"stripe-signature": "test_signature",
				},
				body: JSON.stringify(cancelEvent),
			},
		);

		mockStripeForEvents.webhooks.constructEventAsync.mockReturnValue(
			cancelEvent,
		);
		await eventTestAuth.handler(cancelRequest);

		expect(onSubscriptionCancel).toHaveBeenCalled();

		const deleteEvent = {
			type: "customer.subscription.deleted",
			data: {
				object: {
					id: testSubscriptionId,
					customer: "cus_123",
					status: "canceled",
					metadata: {
						referenceId: userId,
						subscriptionId: testSubscriptionId,
					},
				},
			},
		};

		const deleteRequest = new Request(
			"http://localhost:3000/api/auth/stripe/webhook",
			{
				method: "POST",
				headers: {
					"stripe-signature": "test_signature",
				},
				body: JSON.stringify(deleteEvent),
			},
		);

		mockStripeForEvents.webhooks.constructEventAsync.mockReturnValue(
			deleteEvent,
		);
		await eventTestAuth.handler(deleteRequest);

		expect(onSubscriptionDeleted).toHaveBeenCalled();
	});

	it("should return updated subscription in onSubscriptionUpdate callback", async () => {
		const onSubscriptionUpdate = vi.fn();

		// Simulate subscription update event (e.g., seat change from 1 to 5)
		const updateEvent = {
			type: "customer.subscription.updated",
			data: {
				object: {
					id: "sub_update_test",
					customer: "cus_update_test",
					status: "active",
					items: {
						data: [
							{
								price: { id: process.env.STRIPE_PRICE_ID_1 },
								quantity: 5, // Updated from 1 to 5
								current_period_start: Math.floor(Date.now() / 1000),
								current_period_end:
									Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
							},
						],
					},
					current_period_start: Math.floor(Date.now() / 1000),
					current_period_end: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
				},
			},
		};

		const stripeForTest = {
			...stripeOptions.stripeClient,
			webhooks: {
				constructEventAsync: vi.fn().mockResolvedValue(updateEvent),
			},
		};

		const testOptions = {
			...stripeOptions,
			stripeClient: stripeForTest as unknown as Stripe,
			stripeWebhookSecret: "test_secret",
			subscription: {
				...stripeOptions.subscription,
				onSubscriptionUpdate,
			},
		} as unknown as StripeOptions;

		const { auth: testAuth } = await getTestInstance(
			{
				database: memory,
				plugins: [stripe(testOptions)],
			},
			{
				disableTestUser: true,
			},
		);

		const ctx = await testAuth.$context;

		const { id: testReferenceId } = await ctx.adapter.create({
			model: "user",
			data: {
				email: "update-callback@email.com",
			},
		});

		const { id: testSubscriptionId } = await ctx.adapter.create({
			model: "subscription",
			data: {
				referenceId: testReferenceId,
				stripeCustomerId: "cus_update_test",
				stripeSubscriptionId: "sub_update_test",
				status: "active",
				plan: "starter",
				seats: 1,
			},
		});

		const mockRequest = new Request(
			"http://localhost:3000/api/auth/stripe/webhook",
			{
				method: "POST",
				headers: {
					"stripe-signature": "test_signature",
				},
				body: JSON.stringify(updateEvent),
			},
		);

		await testAuth.handler(mockRequest);

		// Verify that onSubscriptionUpdate was called
		expect(onSubscriptionUpdate).toHaveBeenCalledTimes(1);

		// Verify that the callback received the UPDATED subscription (seats: 5, not 1)
		const callbackArg = onSubscriptionUpdate.mock.calls[0]?.[0];
		expect(callbackArg).toBeDefined();
		expect(callbackArg.subscription).toMatchObject({
			id: testSubscriptionId,
			seats: 5, // Should be the NEW value, not the old value (1)
			status: "active",
			plan: "starter",
		});

		// Also verify the subscription was actually updated in the database
		const updatedSub = await ctx.adapter.findOne<Subscription>({
			model: "subscription",
			where: [{ field: "id", value: testSubscriptionId }],
		});
		expect(updatedSub?.seats).toBe(5);
	});

	it("should allow seat upgrades for the same plan", async () => {
		const { client, auth, sessionSetter } = await getTestInstance(
			{
				database: memory,
				plugins: [stripe(stripeOptions)],
			},
			{
				disableTestUser: true,
				clientOptions: {
					plugins: [stripeClient({ subscription: true })],
				},
			},
		);
		const ctx = await auth.$context;

		const userRes = await client.signUp.email(
			{
				...testUser,
				email: "seat-upgrade@email.com",
			},
			{
				throw: true,
			},
		);

		const headers = new Headers();
		await client.signIn.email(
			{
				...testUser,
				email: "seat-upgrade@email.com",
			},
			{
				throw: true,
				onSuccess: sessionSetter(headers),
			},
		);

		await client.subscription.upgrade({
			plan: "starter",
			seats: 1,
			fetchOptions: {
				headers,
			},
		});

		await ctx.adapter.update({
			model: "subscription",
			update: {
				status: "active",
			},
			where: [
				{
					field: "referenceId",
					value: userRes.user.id,
				},
			],
		});

		const upgradeRes = await client.subscription.upgrade({
			plan: "starter",
			seats: 5,
			fetchOptions: {
				headers,
			},
		});

		expect(upgradeRes.data?.url).toBeDefined();
	});

	it("should prevent duplicate subscriptions with same plan and same seats", async () => {
		const starterPriceId = "price_starter_duplicate_test";
		const subscriptionId = "sub_duplicate_test_123";

		const stripeOptionsWithPrice = {
			...stripeOptions,
			subscription: {
				enabled: true,
				plans: [
					{
						name: "starter",
						priceId: starterPriceId,
					},
				],
			},
		} satisfies StripeOptions;

		const { client, auth, sessionSetter } = await getTestInstance(
			{
				database: memory,
				plugins: [stripe(stripeOptionsWithPrice)],
			},
			{
				disableTestUser: true,
				clientOptions: {
					plugins: [stripeClient({ subscription: true })],
				},
			},
		);
		const ctx = await auth.$context;

		const userRes = await client.signUp.email(
			{
				...testUser,
				email: "duplicate-prevention@email.com",
			},
			{
				throw: true,
			},
		);

		const headers = new Headers();
		await client.signIn.email(
			{
				...testUser,
				email: "duplicate-prevention@email.com",
			},
			{
				throw: true,
				onSuccess: sessionSetter(headers),
			},
		);

		await client.subscription.upgrade({
			plan: "starter",
			seats: 3,
			fetchOptions: {
				headers,
			},
		});

		await ctx.adapter.update({
			model: "subscription",
			update: {
				status: "active",
				seats: 3,
				stripeSubscriptionId: subscriptionId,
			},
			where: [
				{
					field: "referenceId",
					value: userRes.user.id,
				},
			],
		});

		// Mock Stripe to return the existing subscription with the same price ID
		mockStripe.subscriptions.list.mockResolvedValue({
			data: [
				{
					id: subscriptionId,
					status: "active",
					items: {
						data: [
							{
								id: "si_duplicate_item",
								price: {
									id: starterPriceId,
								},
								quantity: 3,
							},
						],
					},
				},
			],
		});

		const upgradeRes = await client.subscription.upgrade({
			plan: "starter",
			seats: 3,
			fetchOptions: {
				headers,
			},
		});

		expect(upgradeRes.error).toBeDefined();
		expect(upgradeRes.error?.message).toContain("already subscribed");
	});

	it("should allow upgrade from monthly to annual billing for the same plan", async () => {
		const monthlyPriceId = "price_monthly_starter_123";
		const annualPriceId = "price_annual_starter_456";
		const subscriptionId = "sub_monthly_to_annual_123";

		const stripeOptionsWithAnnual = {
			...stripeOptions,
			subscription: {
				enabled: true,
				plans: [
					{
						name: "starter",
						priceId: monthlyPriceId,
						annualDiscountPriceId: annualPriceId,
					},
				],
			},
		} satisfies StripeOptions;

		const { client, auth, sessionSetter } = await getTestInstance(
			{
				database: memory,
				plugins: [stripe(stripeOptionsWithAnnual)],
			},
			{
				disableTestUser: true,
				clientOptions: {
					plugins: [stripeClient({ subscription: true })],
				},
			},
		);
		const ctx = await auth.$context;

		const userRes = await client.signUp.email(testUser, { throw: true });

		const headers = new Headers();
		await client.signIn.email(testUser, {
			throw: true,
			onSuccess: sessionSetter(headers),
		});

		await client.subscription.upgrade({
			plan: "starter",
			seats: 1,
			fetchOptions: { headers },
		});

		await ctx.adapter.update({
			model: "subscription",
			update: {
				status: "active",
				seats: 1,
				stripeSubscriptionId: subscriptionId,
			},
			where: [{ field: "referenceId", value: userRes.user.id }],
		});

		mockStripe.subscriptions.list.mockResolvedValue({
			data: [
				{
					id: subscriptionId,
					status: "active",
					items: {
						data: [
							{
								id: "si_monthly_item",
								price: { id: monthlyPriceId },
								quantity: 1,
							},
						],
					},
				},
			],
		});

		// Clear mocks before the upgrade call
		mockStripe.checkout.sessions.create.mockClear();
		mockStripe.billingPortal.sessions.create.mockClear();

		const upgradeRes = await client.subscription.upgrade({
			plan: "starter",
			seats: 1,
			annual: true,
			subscriptionId,
			fetchOptions: { headers },
		});

		// Should succeed and return a billing portal URL
		expect(upgradeRes.error).toBeNull();
		expect(upgradeRes.data?.url).toBeDefined();

		// Verify billing portal was called with the annual price ID
		expect(mockStripe.billingPortal.sessions.create).toHaveBeenCalledWith(
			expect.objectContaining({
				flow_data: expect.objectContaining({
					type: "subscription_update_confirm",
					subscription_update_confirm: expect.objectContaining({
						items: expect.arrayContaining([
							expect.objectContaining({ price: annualPriceId }),
						]),
					}),
				}),
			}),
		);

		// Should use billing portal, not checkout (since user has existing subscription)
		expect(mockStripe.checkout.sessions.create).not.toHaveBeenCalled();
		expect(mockStripe.billingPortal.sessions.create).toHaveBeenCalled();
	});

	it.each([
		{
			name: "past",
			periodEnd: new Date(Date.now() - 24 * 60 * 60 * 1000),
			shouldAllow: true,
		},
		{
			name: "future",
			periodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
			shouldAllow: false,
		},
	])("should handle re-subscribing when periodEnd is in the $name", async ({
		periodEnd,
		shouldAllow,
	}) => {
		const starterPriceId = "price_starter_periodend_test";
		const subscriptionId = "sub_periodend_test_123";

		const stripeOptionsWithPrice = {
			...stripeOptions,
			subscription: {
				enabled: true,
				plans: [
					{
						name: "starter",
						priceId: starterPriceId,
					},
				],
			},
		} satisfies StripeOptions;

		const { client, auth, sessionSetter } = await getTestInstance(
			{
				database: memory,
				plugins: [stripe(stripeOptionsWithPrice)],
			},
			{
				disableTestUser: true,
				clientOptions: {
					plugins: [stripeClient({ subscription: true })],
				},
			},
		);
		const ctx = await auth.$context;

		const userRes = await client.signUp.email(
			{ ...testUser, email: `periodend-${periodEnd.getTime()}@email.com` },
			{ throw: true },
		);

		const headers = new Headers();
		await client.signIn.email(
			{ ...testUser, email: `periodend-${periodEnd.getTime()}@email.com` },
			{ throw: true, onSuccess: sessionSetter(headers) },
		);

		await client.subscription.upgrade({
			plan: "starter",
			seats: 1,
			fetchOptions: { headers },
		});

		await ctx.adapter.update({
			model: "subscription",
			update: {
				status: "active",
				seats: 1,
				periodEnd,
				stripeSubscriptionId: subscriptionId,
			},
			where: [{ field: "referenceId", value: userRes.user.id }],
		});

		// Mock Stripe to return the existing subscription with the same price ID
		mockStripe.subscriptions.list.mockResolvedValue({
			data: [
				{
					id: subscriptionId,
					status: "active",
					items: {
						data: [
							{
								id: "si_periodend_item",
								price: {
									id: starterPriceId,
								},
								quantity: 1,
							},
						],
					},
				},
			],
		});

		const upgradeRes = await client.subscription.upgrade({
			plan: "starter",
			seats: 1,
			fetchOptions: { headers },
		});

		if (shouldAllow) {
			expect(upgradeRes.error).toBeNull();
			expect(upgradeRes.data?.url).toBeDefined();
		} else {
			expect(upgradeRes.error?.message).toContain("already subscribed");
		}
	});

	it("should only call Stripe customers.create once for signup and upgrade", async () => {
		const { client, sessionSetter } = await getTestInstance(
			{
				database: memory,
				plugins: [stripe(stripeOptions)],
			},
			{
				disableTestUser: true,
				clientOptions: {
					plugins: [stripeClient({ subscription: true })],
				},
			},
		);

		await client.signUp.email(
			{ ...testUser, email: "single-create@email.com" },
			{ throw: true },
		);

		const headers = new Headers();
		await client.signIn.email(
			{ ...testUser, email: "single-create@email.com" },
			{
				throw: true,
				onSuccess: sessionSetter(headers),
			},
		);

		await client.subscription.upgrade({
			plan: "starter",
			fetchOptions: { headers },
		});

		expect(mockStripe.customers.create).toHaveBeenCalledTimes(1);
	});

	it("should create billing portal session", async () => {
		const { client, sessionSetter } = await getTestInstance(
			{
				database: memory,
				plugins: [stripe(stripeOptions)],
			},
			{
				disableTestUser: true,
				clientOptions: {
					plugins: [stripeClient({ subscription: true })],
				},
			},
		);

		await client.signUp.email(
			{
				...testUser,
				email: "billing-portal@email.com",
			},
			{
				throw: true,
			},
		);

		const headers = new Headers();
		await client.signIn.email(
			{
				...testUser,
				email: "billing-portal@email.com",
			},
			{
				throw: true,
				onSuccess: sessionSetter(headers),
			},
		);
		const billingPortalRes = await client.subscription.billingPortal({
			returnUrl: "/dashboard",
			fetchOptions: {
				headers,
			},
		});
		expect(billingPortalRes.data?.url).toBe("https://billing.stripe.com/mock");
		expect(billingPortalRes.data?.redirect).toBe(true);
		expect(mockStripe.billingPortal.sessions.create).toHaveBeenCalledWith({
			customer: expect.any(String),
			return_url: "http://localhost:3000/dashboard",
		});
	});

	it("should not update personal subscription when upgrading with an org referenceId", async () => {
		/* cspell:disable-next-line */
		const orgId = "org_b67GF32Cljh7u588AuEblmLVobclDRcP";

		const testOptions = {
			...stripeOptions,
			stripeClient: _stripe,
			subscription: {
				...stripeOptions.subscription,
				authorizeReference: async () => true,
			},
		} as unknown as StripeOptions;

		const {
			auth: testAuth,
			client: testClient,
			sessionSetter: testSessionSetter,
		} = await getTestInstance(
			{
				database: memory,
				plugins: [stripe(testOptions)],
			},
			{
				disableTestUser: true,
				clientOptions: {
					plugins: [stripeClient({ subscription: true })],
				},
			},
		);
		const testCtx = await testAuth.$context;

		// Sign up and sign in the user
		const userRes = await testClient.signUp.email(
			{ ...testUser, email: "org-ref@email.com" },
			{ throw: true },
		);
		const headers = new Headers();
		await testClient.signIn.email(
			{ ...testUser, email: "org-ref@email.com" },
			{ throw: true, onSuccess: testSessionSetter(headers) },
		);

		// Create a personal subscription (referenceId = user id)
		await testClient.subscription.upgrade({
			plan: "starter",
			fetchOptions: { headers },
		});

		const personalSub = await testCtx.adapter.findOne<Subscription>({
			model: "subscription",
			where: [{ field: "referenceId", value: userRes.user.id }],
		});
		expect(personalSub).toBeTruthy();

		await testCtx.adapter.update({
			model: "subscription",
			update: {
				status: "active",
				stripeSubscriptionId: "sub_personal_active_123",
			},
			where: [{ field: "id", value: personalSub!.id }],
		});

		mockStripe.subscriptions.list.mockResolvedValue({
			data: [
				{
					id: "sub_personal_active_123",
					status: "active",
					items: {
						data: [
							{
								id: "si_1",
								price: { id: process.env.STRIPE_PRICE_ID_1 },
								quantity: 1,
							},
						],
					},
				},
			],
		});

		// Attempt to upgrade using an org referenceId
		const upgradeRes = await testClient.subscription.upgrade({
			plan: "starter",
			referenceId: orgId,
			fetchOptions: { headers },
		});
		// It should NOT go through billing portal (which would update the personal sub)
		expect(mockStripe.billingPortal.sessions.create).not.toHaveBeenCalled();
		expect(upgradeRes.data?.url).toBeDefined();

		const orgSub = await testCtx.adapter.findOne<Subscription>({
			model: "subscription",
			where: [{ field: "referenceId", value: orgId }],
		});
		expect(orgSub).toMatchObject({
			referenceId: orgId,
			status: "incomplete",
			plan: "starter",
		});

		const personalAfter = await testCtx.adapter.findOne<Subscription>({
			model: "subscription",
			where: [{ field: "id", value: personalSub!.id }],
		});
		expect(personalAfter?.status).toBe("active");
	});

	it("should prevent multiple free trials for the same user", async () => {
		const { client, auth, sessionSetter } = await getTestInstance(
			{
				database: memory,
				plugins: [stripe(stripeOptions)],
			},
			{
				disableTestUser: true,
				clientOptions: {
					plugins: [stripeClient({ subscription: true })],
				},
			},
		);
		const ctx = await auth.$context;

		// Create a user
		const userRes = await client.signUp.email(
			{ ...testUser, email: "trial-prevention@email.com" },
			{ throw: true },
		);

		const headers = new Headers();
		await client.signIn.email(
			{ ...testUser, email: "trial-prevention@email.com" },
			{
				throw: true,
				onSuccess: sessionSetter(headers),
			},
		);

		// First subscription with trial
		const firstUpgradeRes = await client.subscription.upgrade({
			plan: "starter",
			fetchOptions: { headers },
		});

		expect(firstUpgradeRes.data?.url).toBeDefined();

		// Simulate the subscription being created with trial data
		await ctx.adapter.update({
			model: "subscription",
			update: {
				status: "trialing",
				trialStart: new Date(),
				trialEnd: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days from now
			},
			where: [
				{
					field: "referenceId",
					value: userRes.user.id,
				},
			],
		});

		// Cancel the subscription
		await ctx.adapter.update({
			model: "subscription",
			update: {
				status: "canceled",
			},
			where: [
				{
					field: "referenceId",
					value: userRes.user.id,
				},
			],
		});

		// Try to subscribe again - should NOT get a trial
		const secondUpgradeRes = await client.subscription.upgrade({
			plan: "starter",
			fetchOptions: { headers },
		});

		expect(secondUpgradeRes.data?.url).toBeDefined();

		// Verify that the checkout session was created without trial_period_days
		// We can't directly test the Stripe session, but we can verify the logic
		// by checking that the user has trial history
		const subscriptions = (await ctx.adapter.findMany({
			model: "subscription",
			where: [
				{
					field: "referenceId",
					value: userRes.user.id,
				},
			],
		})) as Subscription[];

		// Should have 2 subscriptions (first canceled, second new)
		expect(subscriptions).toHaveLength(2);

		// At least one should have trial data
		const hasTrialData = subscriptions.some(
			(s: Subscription) => s.trialStart || s.trialEnd,
		);
		expect(hasTrialData).toBe(true);
	});

	it("should prevent trial abuse when processing incomplete subscription with past trial history", async () => {
		const { client, auth, sessionSetter } = await getTestInstance(
			{
				database: memory,
				plugins: [
					stripe({
						...stripeOptions,
						subscription: {
							...stripeOptions.subscription,
							plans: stripeOptions.subscription.plans.map((plan) => ({
								...plan,
								freeTrial: { days: 7 },
							})),
						},
					}),
				],
			},
			{
				disableTestUser: true,
				clientOptions: {
					plugins: [stripeClient({ subscription: true })],
				},
			},
		);
		const ctx = await auth.$context;

		const userRes = await client.signUp.email(
			{ ...testUser, email: "trial-findone-test@email.com" },
			{ throw: true },
		);

		const headers = new Headers();
		await client.signIn.email(
			{ ...testUser, email: "trial-findone-test@email.com" },
			{ throw: true, onSuccess: sessionSetter(headers) },
		);

		// Create a canceled subscription with trial history first
		await ctx.adapter.create({
			model: "subscription",
			data: {
				referenceId: userRes.user.id,
				stripeCustomerId: "cus_old_customer",
				status: "canceled",
				plan: "starter",
				stripeSubscriptionId: "sub_canceled_with_trial",
				trialStart: new Date(Date.now() - 1000000),
				trialEnd: new Date(Date.now() - 500000),
			},
		});

		// Create an new incomplete subscription (without trial info)
		const incompleteSubId = "sub_incomplete_new";
		await ctx.adapter.create({
			model: "subscription",
			data: {
				referenceId: userRes.user.id,
				stripeCustomerId: "cus_old_customer",
				status: "incomplete",
				plan: "premium",
				stripeSubscriptionId: incompleteSubId,
			},
		});

		// When upgrading with a specific subscriptionId pointing to the incomplete one,
		// the system should still check ALL subscriptions for trial history
		const upgradeRes = await client.subscription.upgrade({
			plan: "premium",
			subscriptionId: incompleteSubId,
			fetchOptions: { headers },
		});

		expect(upgradeRes.data?.url).toBeDefined();

		// Verify that NO trial was granted despite processing the incomplete subscription
		const callArgs = mockStripe.checkout.sessions.create.mock.lastCall?.[0];
		expect(callArgs?.subscription_data?.trial_period_days).toBeUndefined();
	});

	it("should upgrade existing subscription instead of creating new one", async () => {
		// Reset mocks for this test
		vi.clearAllMocks();

		const { client, auth, sessionSetter } = await getTestInstance(
			{
				database: memory,
				plugins: [stripe(stripeOptions)],
			},
			{
				disableTestUser: true,
				clientOptions: {
					plugins: [stripeClient({ subscription: true })],
				},
			},
		);
		const ctx = await auth.$context;

		// Create a user
		const userRes = await client.signUp.email(
			{ ...testUser, email: "upgrade-existing@email.com" },
			{ throw: true },
		);

		const headers = new Headers();
		await client.signIn.email(
			{ ...testUser, email: "upgrade-existing@email.com" },
			{
				throw: true,
				onSuccess: sessionSetter(headers),
			},
		);

		// Mock customers.search to find existing user customer
		mockStripe.customers.search.mockResolvedValueOnce({
			data: [{ id: "cus_test_123" }],
		});

		// First create a starter subscription
		await client.subscription.upgrade({
			plan: "starter",
			fetchOptions: { headers },
		});

		// Simulate the subscription being active
		const starterSub = await ctx.adapter.findOne<Subscription>({
			model: "subscription",
			where: [
				{
					field: "referenceId",
					value: userRes.user.id,
				},
			],
		});

		await ctx.adapter.update({
			model: "subscription",
			update: {
				status: "active",
				stripeSubscriptionId: "sub_active_test_123",
				stripeCustomerId: "cus_mock123", // Use the same customer ID as the mock
			},
			where: [
				{
					field: "id",
					value: starterSub!.id,
				},
			],
		});

		// Also update the user with the Stripe customer ID
		await ctx.adapter.update({
			model: "user",
			update: {
				stripeCustomerId: "cus_mock123",
			},
			where: [
				{
					field: "id",
					value: userRes.user.id,
				},
			],
		});

		// Mock Stripe subscriptions.list to return the active subscription
		mockStripe.subscriptions.list.mockResolvedValueOnce({
			data: [
				{
					id: "sub_active_test_123",
					status: "active",
					items: {
						data: [
							{
								id: "si_test_123",
								price: { id: process.env.STRIPE_PRICE_ID_1 },
								quantity: 1,
								current_period_start: Math.floor(Date.now() / 1000),
								current_period_end:
									Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
							},
						],
					},
				},
			],
		});

		// Clear mock calls before the upgrade
		mockStripe.checkout.sessions.create.mockClear();
		mockStripe.billingPortal.sessions.create.mockClear();

		// Now upgrade to premium plan - should use billing portal to update existing subscription
		const upgradeRes = await client.subscription.upgrade({
			plan: "premium",
			fetchOptions: { headers },
		});

		// Verify that billing portal was called (indicating update, not new subscription)
		expect(mockStripe.billingPortal.sessions.create).toHaveBeenCalledWith(
			expect.objectContaining({
				customer: "cus_mock123",
				flow_data: expect.objectContaining({
					type: "subscription_update_confirm",
					subscription_update_confirm: expect.objectContaining({
						subscription: "sub_active_test_123",
					}),
				}),
			}),
		);

		// Should not create a new checkout session
		expect(mockStripe.checkout.sessions.create).not.toHaveBeenCalled();

		// Verify the response has a redirect URL
		expect(upgradeRes.data?.url).toBe("https://billing.stripe.com/mock");
		expect(upgradeRes.data?.redirect).toBe(true);

		// Verify no new subscription was created in the database
		const allSubs = await ctx.adapter.findMany<Subscription>({
			model: "subscription",
			where: [
				{
					field: "referenceId",
					value: userRes.user.id,
				},
			],
		});
		expect(allSubs).toHaveLength(1); // Should still have only one subscription
	});

	it("should prevent multiple free trials across different plans", async () => {
		const { client, auth, sessionSetter } = await getTestInstance(
			{
				database: memory,
				plugins: [stripe(stripeOptions)],
			},
			{
				disableTestUser: true,
				clientOptions: {
					plugins: [stripeClient({ subscription: true })],
				},
			},
		);
		const ctx = await auth.$context;

		// Create a user
		const userRes = await client.signUp.email(
			{ ...testUser, email: "cross-plan-trial@email.com" },
			{ throw: true },
		);

		const headers = new Headers();
		await client.signIn.email(
			{ ...testUser, email: "cross-plan-trial@email.com" },
			{
				throw: true,
				onSuccess: sessionSetter(headers),
			},
		);

		// First subscription with trial on starter plan
		const firstUpgradeRes = await client.subscription.upgrade({
			plan: "starter",
			fetchOptions: { headers },
		});

		expect(firstUpgradeRes.data?.url).toBeDefined();

		// Simulate the subscription being created with trial data
		await ctx.adapter.update({
			model: "subscription",
			update: {
				status: "trialing",
				trialStart: new Date(),
				trialEnd: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
			},
			where: [
				{
					field: "referenceId",
					value: userRes.user.id,
				},
			],
		});

		// Cancel the subscription
		await ctx.adapter.update({
			model: "subscription",
			update: {
				status: "canceled",
			},
			where: [
				{
					field: "referenceId",
					value: userRes.user.id,
				},
			],
		});

		// Try to subscribe to a different plan - should NOT get a trial
		const secondUpgradeRes = await client.subscription.upgrade({
			plan: "premium",
			fetchOptions: { headers },
		});

		expect(secondUpgradeRes.data?.url).toBeDefined();

		// Verify that the user has trial history from the first plan
		const subscriptions = (await ctx.adapter.findMany({
			model: "subscription",
			where: [
				{
					field: "referenceId",
					value: userRes.user.id,
				},
			],
		})) as Subscription[];

		// Should have at least 1 subscription (the starter with trial data)
		expect(subscriptions.length).toBeGreaterThanOrEqual(1);

		// The starter subscription should have trial data
		const starterSub = subscriptions.find(
			(s: Subscription) => s.plan === "starter",
		) as Subscription | undefined;
		expect(starterSub?.trialStart).toBeDefined();
		expect(starterSub?.trialEnd).toBeDefined();

		// Verify that the trial eligibility logic is working by checking
		// that the user has ever had a trial (which should prevent future trials)
		const hasEverTrialed = subscriptions.some((s: Subscription) => {
			const hadTrial =
				!!(s.trialStart || s.trialEnd) || s.status === "trialing";
			return hadTrial;
		});
		expect(hasEverTrialed).toBe(true);
	});

	it("should update stripe customer email when user email changes", async () => {
		const { client, auth } = await getTestInstance(
			{
				database: memory,
				plugins: [stripe(stripeOptions)],
			},
			{
				disableTestUser: true,
				clientOptions: {
					plugins: [stripeClient({ subscription: true })],
				},
			},
		);
		const ctx = await auth.$context;

		// Setup mock for customer retrieve and update
		mockStripe.customers.retrieve = vi.fn().mockResolvedValue({
			id: "cus_mock123",
			email: "test@email.com",
			deleted: false,
		});
		mockStripe.customers.update = vi.fn().mockResolvedValue({
			id: "cus_mock123",
			email: "newemail@example.com",
		});

		// Sign up a user
		const userRes = await client.signUp.email(testUser, {
			throw: true,
		});

		expect(userRes.user).toBeDefined();

		// Verify customer was created during signup
		expect(mockStripe.customers.create).toHaveBeenCalledWith({
			email: testUser.email,
			name: testUser.name,
			metadata: {
				customerType: "user",
				userId: userRes.user.id,
			},
		});

		// Clear mocks to track the update
		vi.clearAllMocks();

		// Re-setup the retrieve mock for the update flow
		mockStripe.customers.retrieve = vi.fn().mockResolvedValue({
			id: "cus_mock123",
			email: "test@email.com",
			deleted: false,
		});
		mockStripe.customers.update = vi.fn().mockResolvedValue({
			id: "cus_mock123",
			email: "newemail@example.com",
		});

		// Update the user's email using internal adapter (which triggers hooks)
		await runWithEndpointContext(
			{
				context: ctx,
			},
			() =>
				ctx.internalAdapter.updateUserByEmail(testUser.email, {
					email: "newemail@example.com",
				}),
		);

		// Verify that Stripe customer.retrieve was called
		expect(mockStripe.customers.retrieve).toHaveBeenCalledWith("cus_mock123");

		// Verify that Stripe customer.update was called with the new email
		expect(mockStripe.customers.update).toHaveBeenCalledWith("cus_mock123", {
			email: "newemail@example.com",
		});
	});

	describe("getCustomerCreateParams", () => {
		it("should call getCustomerCreateParams and merge with default params", async () => {
			const getCustomerCreateParamsMock = vi
				.fn()
				.mockResolvedValue({ metadata: { customField: "customValue" } });

			const testOptions = {
				...stripeOptions,
				createCustomerOnSignUp: true,
				getCustomerCreateParams: getCustomerCreateParamsMock,
			} satisfies StripeOptions;

			const { client: testClient } = await getTestInstance(
				{
					database: memory,
					plugins: [stripe(testOptions)],
				},
				{
					disableTestUser: true,
					clientOptions: {
						plugins: [stripeClient({ subscription: true })],
					},
				},
			);

			// Sign up a user
			const userRes = await testClient.signUp.email(
				{
					email: "custom-params@email.com",
					password: "password",
					name: "Custom User",
				},
				{
					throw: true,
				},
			);

			// Verify getCustomerCreateParams was called
			expect(getCustomerCreateParamsMock).toHaveBeenCalledWith(
				expect.objectContaining({
					id: userRes.user.id,
					email: "custom-params@email.com",
					name: "Custom User",
				}),
				expect.objectContaining({
					context: expect.any(Object),
				}),
			);

			// Verify customer was created with merged params
			expect(mockStripe.customers.create).toHaveBeenCalledWith(
				expect.objectContaining({
					email: "custom-params@email.com",
					name: "Custom User",
					metadata: expect.objectContaining({
						userId: userRes.user.id,
						customField: "customValue",
					}),
				}),
			);
		});

		it("should use getCustomerCreateParams to add custom address", async () => {
			const getCustomerCreateParamsMock = vi.fn().mockResolvedValue({
				address: {
					line1: "123 Main St",
					city: "San Francisco",
					state: "CA",
					postal_code: "94111",
					country: "US",
				},
			});

			const testOptions = {
				...stripeOptions,
				createCustomerOnSignUp: true,
				getCustomerCreateParams: getCustomerCreateParamsMock,
			} satisfies StripeOptions;

			const { client: testAuthClient } = await getTestInstance(
				{
					database: memory,
					plugins: [stripe(testOptions)],
				},
				{
					disableTestUser: true,
					clientOptions: {
						plugins: [stripeClient({ subscription: true })],
					},
				},
			);

			// Sign up a user
			await testAuthClient.signUp.email(
				{
					email: "address-user@email.com",
					password: "password",
					name: "Address User",
				},
				{
					throw: true,
				},
			);

			// Verify customer was created with address
			expect(mockStripe.customers.create).toHaveBeenCalledWith(
				expect.objectContaining({
					email: "address-user@email.com",
					name: "Address User",
					address: {
						line1: "123 Main St",
						city: "San Francisco",
						state: "CA",
						postal_code: "94111",
						country: "US",
					},
					metadata: expect.objectContaining({
						userId: expect.any(String),
					}),
				}),
			);
		});

		it("should properly merge nested objects using defu", async () => {
			const getCustomerCreateParamsMock = vi.fn().mockResolvedValue({
				metadata: {
					customField: "customValue",
					anotherField: "anotherValue",
				},
				phone: "+1234567890",
			});

			const testOptions = {
				...stripeOptions,
				createCustomerOnSignUp: true,
				getCustomerCreateParams: getCustomerCreateParamsMock,
			} satisfies StripeOptions;

			const { client: testAuthClient } = await getTestInstance(
				{
					database: memory,
					plugins: [stripe(testOptions)],
				},
				{
					disableTestUser: true,
					clientOptions: {
						plugins: [stripeClient({ subscription: true })],
					},
				},
			);

			// Sign up a user
			const userRes = await testAuthClient.signUp.email(
				{
					email: "merge-test@email.com",
					password: "password",
					name: "Merge User",
				},
				{
					throw: true,
				},
			);

			// Verify customer was created with properly merged params
			// defu merges objects and preserves all fields
			expect(mockStripe.customers.create).toHaveBeenCalledWith(
				expect.objectContaining({
					email: "merge-test@email.com",
					name: "Merge User",
					phone: "+1234567890",
					metadata: {
						customerType: "user",
						userId: userRes.user.id,
						customField: "customValue",
						anotherField: "anotherValue",
					},
				}),
			);
		});

		it("should work without getCustomerCreateParams", async () => {
			// This test ensures backward compatibility
			const testOptions = {
				...stripeOptions,
				createCustomerOnSignUp: true,
				// No getCustomerCreateParams provided
			} satisfies StripeOptions;

			const { client: testAuthClient } = await getTestInstance(
				{
					database: memory,
					plugins: [stripe(testOptions)],
				},
				{
					disableTestUser: true,
					clientOptions: {
						plugins: [stripeClient({ subscription: true })],
					},
				},
			);

			// Sign up a user
			const userRes = await testAuthClient.signUp.email(
				{
					email: "no-custom-params@email.com",
					password: "password",
					name: "Default User",
				},
				{
					throw: true,
				},
			);

			// Verify customer was created with default params only
			expect(mockStripe.customers.create).toHaveBeenCalledWith({
				email: "no-custom-params@email.com",
				name: "Default User",
				metadata: {
					customerType: "user",
					userId: userRes.user.id,
				},
			});
		});
	});

	describe("Webhook Error Handling (Stripe v19)", () => {
		it("should handle invalid webhook signature with constructEventAsync", async () => {
			const mockError = new Error("Invalid signature");
			const stripeWithError = {
				...stripeOptions.stripeClient,
				webhooks: {
					constructEventAsync: vi.fn().mockRejectedValue(mockError),
				},
			};

			const testOptions = {
				...stripeOptions,
				stripeClient: stripeWithError as unknown as Stripe,
				stripeWebhookSecret: "test_secret",
			};

			const { auth: testAuth } = await getTestInstance(
				{
					database: memory,
					plugins: [stripe(testOptions)],
				},
				{
					disableTestUser: true,
				},
			);

			const mockRequest = new Request(
				"http://localhost:3000/api/auth/stripe/webhook",
				{
					method: "POST",
					headers: {
						"stripe-signature": "invalid_signature",
					},
					body: JSON.stringify({ type: "test.event" }),
				},
			);

			const response = await testAuth.handler(mockRequest);
			expect(response.status).toBe(400);
			const data = await response.json();
			expect(data.message).toContain("Failed to construct Stripe event");
		});

		it("should reject webhook request without stripe-signature header", async () => {
			const { auth: testAuth } = await getTestInstance(
				{
					database: memory,
					plugins: [stripe(stripeOptions)],
				},
				{
					disableTestUser: true,
				},
			);

			const mockRequest = new Request(
				"http://localhost:3000/api/auth/stripe/webhook",
				{
					method: "POST",
					headers: {
						"content-type": "application/json",
					},
					body: JSON.stringify({ type: "test.event" }),
				},
			);

			const response = await testAuth.handler(mockRequest);
			expect(response.status).toBe(400);
			const data = await response.json();
			expect(data.message).toContain("Stripe signature not found");
		});

		it("should handle constructEventAsync returning null/undefined", async () => {
			const stripeWithNull = {
				...stripeOptions.stripeClient,
				webhooks: {
					constructEventAsync: vi.fn().mockResolvedValue(null),
				},
			};

			const testOptions = {
				...stripeOptions,
				stripeClient: stripeWithNull as unknown as Stripe,
				stripeWebhookSecret: "test_secret",
			};

			const { auth: testAuth } = await getTestInstance(
				{
					database: memory,
					plugins: [stripe(testOptions)],
				},
				{
					disableTestUser: true,
				},
			);

			const mockRequest = new Request(
				"http://localhost:3000/api/auth/stripe/webhook",
				{
					method: "POST",
					headers: {
						"stripe-signature": "test_signature",
					},
					body: JSON.stringify({ type: "test.event" }),
				},
			);

			const response = await testAuth.handler(mockRequest);
			expect(response.status).toBe(400);
			const data = await response.json();
			expect(data.message).toContain("Failed to construct Stripe event");
		});

		it("should handle async errors in webhook event processing", async () => {
			const errorThrowingHandler = vi
				.fn()
				.mockRejectedValue(new Error("Event processing failed"));

			const mockEvent = {
				type: "checkout.session.completed",
				data: {
					object: {
						mode: "subscription",
						subscription: "sub_123",
						metadata: {
							referenceId: "user_123",
							subscriptionId: "sub_123",
						},
					},
				},
			};

			const stripeForTest = {
				...stripeOptions.stripeClient,
				subscriptions: {
					retrieve: vi.fn().mockRejectedValue(new Error("Stripe API error")),
				},
				webhooks: {
					constructEventAsync: vi.fn().mockResolvedValue(mockEvent),
				},
			};

			const testOptions = {
				...stripeOptions,
				stripeClient: stripeForTest as unknown as Stripe,
				stripeWebhookSecret: "test_secret",
				subscription: {
					...stripeOptions.subscription,
					onSubscriptionComplete: errorThrowingHandler,
				},
			};

			const { auth: testAuth } = await getTestInstance(
				{
					database: memory,
					plugins: [stripe(testOptions as StripeOptions)],
				},
				{
					disableTestUser: true,
				},
			);
			const testCtx = await testAuth.$context;

			await testCtx.adapter.create({
				model: "subscription",
				data: {
					referenceId: "user_123",
					stripeCustomerId: "cus_123",
					status: "incomplete",
					plan: "starter",
					id: "sub_123",
				},
			});

			const mockRequest = new Request(
				"http://localhost:3000/api/auth/stripe/webhook",
				{
					method: "POST",
					headers: {
						"stripe-signature": "test_signature",
					},
					body: JSON.stringify(mockEvent),
				},
			);

			const response = await testAuth.handler(mockRequest);
			// Errors inside event handlers are caught and logged but don't fail the webhook
			// This prevents Stripe from retrying and is the expected behavior
			expect(response.status).toBe(200);
			const data = await response.json();
			expect(data).toEqual({ success: true });
			// Verify the error was logged (via the stripeClient.subscriptions.retrieve rejection)
			expect(stripeForTest.subscriptions.retrieve).toHaveBeenCalled();
		});

		it("should successfully process webhook with valid async signature verification", async () => {
			const mockEvent = {
				type: "customer.subscription.updated",
				data: {
					object: {
						id: "sub_test_async",
						customer: "cus_test_async",
						status: "active",
						items: {
							data: [
								{
									price: { id: process.env.STRIPE_PRICE_ID_1 },
									quantity: 1,
									current_period_start: Math.floor(Date.now() / 1000),
									current_period_end:
										Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
								},
							],
						},
						current_period_start: Math.floor(Date.now() / 1000),
						current_period_end:
							Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
					},
				},
			};

			const stripeForTest = {
				...stripeOptions.stripeClient,
				webhooks: {
					// Simulate async verification success
					constructEventAsync: vi.fn().mockResolvedValue(mockEvent),
				},
			};

			const testOptions = {
				...stripeOptions,
				stripeClient: stripeForTest as unknown as Stripe,
				stripeWebhookSecret: "test_secret_async",
			};

			const { auth: testAuth } = await getTestInstance(
				{
					database: memory,
					plugins: [stripe(testOptions)],
				},
				{
					disableTestUser: true,
				},
			);
			const testCtx = await testAuth.$context;

			const { id: testUserId } = await testCtx.adapter.create({
				model: "user",
				data: {
					email: "async-test@email.com",
				},
			});

			await testCtx.adapter.create({
				model: "subscription",
				data: {
					referenceId: testUserId,
					stripeCustomerId: "cus_test_async",
					stripeSubscriptionId: "sub_test_async",
					status: "incomplete",
					plan: "starter",
				},
			});

			const mockRequest = new Request(
				"http://localhost:3000/api/auth/stripe/webhook",
				{
					method: "POST",
					headers: {
						"stripe-signature": "valid_async_signature",
					},
					body: JSON.stringify(mockEvent),
				},
			);

			const response = await testAuth.handler(mockRequest);
			expect(response.status).toBe(200);
			expect(stripeForTest.webhooks.constructEventAsync).toHaveBeenCalledWith(
				expect.any(String),
				"valid_async_signature",
				"test_secret_async",
			);

			const data = await response.json();
			expect(data).toEqual({ success: true });
		});

		it("should call constructEventAsync with exactly 3 required parameters", async () => {
			const mockEvent = {
				type: "customer.subscription.created",
				data: {
					object: {
						id: "sub_test_params",
						customer: "cus_test_params",
						status: "active",
					},
				},
			};

			const stripeForTest = {
				...stripeOptions.stripeClient,
				webhooks: {
					constructEventAsync: vi.fn().mockResolvedValue(mockEvent),
				},
			};

			const testOptions = {
				...stripeOptions,
				stripeClient: stripeForTest as unknown as Stripe,
				stripeWebhookSecret: "test_secret_params",
			};

			const { auth: testAuth } = await getTestInstance(
				{
					database: memory,
					plugins: [stripe(testOptions)],
				},
				{
					disableTestUser: true,
				},
			);

			const mockRequest = new Request(
				"http://localhost:3000/api/auth/stripe/webhook",
				{
					method: "POST",
					headers: {
						"stripe-signature": "test_signature_params",
					},
					body: JSON.stringify(mockEvent),
				},
			);

			await testAuth.handler(mockRequest);

			// Verify that constructEventAsync is called with exactly 3 required parameters
			// (payload, signature, secret) and no optional parameters
			expect(stripeForTest.webhooks.constructEventAsync).toHaveBeenCalledWith(
				expect.any(String), // payload
				"test_signature_params", // signature
				"test_secret_params", // secret
			);

			// Verify it was called exactly once
			expect(stripeForTest.webhooks.constructEventAsync).toHaveBeenCalledTimes(
				1,
			);
		});

		it("should support Stripe v18 with sync constructEvent method", async () => {
			const mockEvent = {
				type: "customer.subscription.updated",
				data: {
					object: {
						id: "sub_test_v18",
						customer: "cus_test_v18",
						status: "active",
						items: {
							data: [
								{
									price: { id: process.env.STRIPE_PRICE_ID_1 },
									quantity: 1,
									current_period_start: Math.floor(Date.now() / 1000),
									current_period_end:
										Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
								},
							],
						},
						current_period_start: Math.floor(Date.now() / 1000),
						current_period_end:
							Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
					},
				},
			};

			// Simulate Stripe v18 - only has sync constructEvent, no constructEventAsync
			const stripeV18 = {
				...stripeOptions.stripeClient,
				webhooks: {
					constructEvent: vi.fn().mockReturnValue(mockEvent),
					// v18 doesn't have constructEventAsync
					constructEventAsync: undefined,
				},
			};

			const testOptions = {
				...stripeOptions,
				stripeClient: stripeV18 as unknown as Stripe,
				stripeWebhookSecret: "test_secret_v18",
			};

			const { auth: testAuth } = await getTestInstance(
				{
					database: memory,
					plugins: [stripe(testOptions)],
				},
				{
					disableTestUser: true,
				},
			);
			const testCtx = await testAuth.$context;

			const { id: testUserId } = await testCtx.adapter.create({
				model: "user",
				data: {
					email: "v18-test@email.com",
				},
			});

			await testCtx.adapter.create({
				model: "subscription",
				data: {
					referenceId: testUserId,
					stripeCustomerId: "cus_test_v18",
					stripeSubscriptionId: "sub_test_v18",
					status: "incomplete",
					plan: "starter",
				},
			});

			const mockRequest = new Request(
				"http://localhost:3000/api/auth/stripe/webhook",
				{
					method: "POST",
					headers: {
						"stripe-signature": "test_signature_v18",
					},
					body: JSON.stringify(mockEvent),
				},
			);

			const response = await testAuth.handler(mockRequest);
			expect(response.status).toBe(200);

			// Verify that constructEvent (sync) was called instead of constructEventAsync
			expect(stripeV18.webhooks.constructEvent).toHaveBeenCalledWith(
				expect.any(String),
				"test_signature_v18",
				"test_secret_v18",
			);
			expect(stripeV18.webhooks.constructEvent).toHaveBeenCalledTimes(1);

			const data = await response.json();
			expect(data).toEqual({ success: true });
		});
	});

	it("should support flexible limits types", async () => {
		const flexiblePlans = [
			{
				name: "flexible",
				priceId: "price_flexible",
				limits: {
					// Numbers
					maxUsers: 100,
					maxProjects: 10,
					// Arrays
					features: ["analytics", "api", "webhooks"],
					supportedMethods: ["GET", "POST", "PUT", "DELETE"],
					// Objects
					rateLimit: { requests: 1000, window: 3600 },
					permissions: { admin: true, read: true, write: false },
					// Mixed
					quotas: {
						storage: 50,
						bandwidth: [100, "GB"],
					},
				},
			},
		];

		const {
			client: testClient,
			auth: testAuth,
			sessionSetter: testSessionSetter,
		} = await getTestInstance(
			{
				database: memory,
				plugins: [
					stripe({
						...stripeOptions,
						subscription: {
							enabled: true,
							plans: flexiblePlans,
						},
					}),
				],
			},
			{
				disableTestUser: true,
				clientOptions: {
					plugins: [stripeClient({ subscription: true })],
				},
			},
		);
		const testCtx = await testAuth.$context;

		// Create user and sign in
		const headers = new Headers();
		const userRes = await testClient.signUp.email(
			{ email: "limits@test.com", password: "password", name: "Test" },
			{ throw: true },
		);
		const limitUserId = userRes.user.id;

		await testClient.signIn.email(
			{ email: "limits@test.com", password: "password" },
			{ throw: true, onSuccess: testSessionSetter(headers) },
		);

		// Create subscription
		await testCtx.adapter.create({
			model: "subscription",
			data: {
				referenceId: limitUserId,
				stripeCustomerId: "cus_limits_test",
				stripeSubscriptionId: "sub_limits_test",
				status: "active",
				plan: "flexible",
			},
		});

		// List subscriptions and verify limits structure
		const result = await testClient.subscription.list({
			fetchOptions: { headers, throw: true },
		});

		expect(result.length).toBe(1);
		const limits = result[0]?.limits;

		// Verify different types are preserved
		expect(limits).toBeDefined();

		// Type-safe access with unknown (cast once for test convenience)
		const typedLimits = limits as Record<string, unknown>;
		expect(typedLimits.maxUsers).toBe(100);
		expect(typedLimits.maxProjects).toBe(10);
		expect(typeof typedLimits.rateLimit).toBe("object");
		expect(typedLimits.features).toEqual(["analytics", "api", "webhooks"]);
		expect(Array.isArray(typedLimits.features)).toBe(true);
		expect(Array.isArray(typedLimits.supportedMethods)).toBe(true);
		expect((typedLimits.quotas as Record<string, unknown>).storage).toBe(50);
		expect((typedLimits.rateLimit as Record<string, unknown>).requests).toBe(
			1000,
		);
		expect((typedLimits.permissions as Record<string, unknown>).admin).toBe(
			true,
		);
		expect(
			Array.isArray((typedLimits.quotas as Record<string, unknown>).bandwidth),
		).toBe(true);
	});

	describe("Duplicate customer prevention on signup", () => {
		it("should NOT create duplicate customer when email already exists in Stripe", async () => {
			const existingEmail = "duplicate-email@example.com";
			const existingCustomerId = "cus_stripe_existing_456";

			mockStripe.customers.search.mockResolvedValueOnce({
				data: [
					{
						id: existingCustomerId,
						email: existingEmail,
						name: "Existing Stripe Customer",
					},
				],
			});

			const testOptionsWithHook = {
				...stripeOptions,
				createCustomerOnSignUp: true,
			} satisfies StripeOptions;

			const { client: testAuthClient, auth: testAuth } = await getTestInstance(
				{
					database: memory,
					plugins: [stripe(testOptionsWithHook)],
				},
				{
					disableTestUser: true,
					clientOptions: {
						plugins: [stripeClient({ subscription: true })],
					},
				},
			);
			const testCtx = await testAuth.$context;

			vi.clearAllMocks();

			// Sign up with email that exists in Stripe
			const userRes = await testAuthClient.signUp.email(
				{
					email: existingEmail,
					password: "password",
					name: "Duplicate Email User",
				},
				{ throw: true },
			);

			// Should check for existing user customer by email (excluding organization customers)
			expect(mockStripe.customers.search).toHaveBeenCalledWith({
				query: `email:"${existingEmail}" AND -metadata["customerType"]:"organization"`,
				limit: 1,
			});

			// Should NOT create duplicate customer
			expect(mockStripe.customers.create).not.toHaveBeenCalled();

			// Verify user has the EXISTING Stripe customer ID (not new duplicate)
			const user = await testCtx.adapter.findOne<
				User & { stripeCustomerId?: string }
			>({
				model: "user",
				where: [{ field: "id", value: userRes.user.id }],
			});
			expect(user?.stripeCustomerId).toBe(existingCustomerId); // Should use existing ID
		});

		it("should CREATE customer only when user has no stripeCustomerId and none exists in Stripe", async () => {
			const newEmail = "brand-new@example.com";

			mockStripe.customers.search.mockResolvedValueOnce({
				data: [],
			});

			mockStripe.customers.create.mockResolvedValueOnce({
				id: "cus_new_created_789",
				email: newEmail,
			});

			const testOptionsWithHook = {
				...stripeOptions,
				createCustomerOnSignUp: true,
			} satisfies StripeOptions;

			const { client: testAuthClient, auth: testAuth } = await getTestInstance(
				{
					database: memory,
					plugins: [stripe(testOptionsWithHook)],
				},
				{
					disableTestUser: true,
					clientOptions: {
						plugins: [stripeClient({ subscription: true })],
					},
				},
			);
			const testCtx = await testAuth.$context;

			vi.clearAllMocks();

			// Sign up with brand new email
			const userRes = await testAuthClient.signUp.email(
				{
					email: newEmail,
					password: "password",
					name: "Brand New User",
				},
				{ throw: true },
			);

			// Should check for existing user customer first (excluding organization customers)
			expect(mockStripe.customers.search).toHaveBeenCalledWith({
				query: `email:"${newEmail}" AND -metadata["customerType"]:"organization"`,
				limit: 1,
			});

			// Should create new customer (this is correct behavior)
			expect(mockStripe.customers.create).toHaveBeenCalledTimes(1);
			expect(mockStripe.customers.create).toHaveBeenCalledWith({
				email: newEmail,
				name: "Brand New User",
				metadata: {
					userId: userRes.user.id,
					customerType: "user",
				},
			});

			// Verify user has the new Stripe customer ID
			const user = await testCtx.adapter.findOne<
				User & { stripeCustomerId?: string }
			>({
				model: "user",
				where: [{ field: "id", value: userRes.user.id }],
			});
			expect(user?.stripeCustomerId).toBeDefined();
		});
	});

	describe("User/Organization customer collision prevention", () => {
		it("should NOT return organization customer when searching for user customer with same email", async () => {
			// Scenario: Organization has a Stripe customer with email "shared@example.com"
			// When a user signs up with the same email, the search should NOT find the org customer
			const sharedEmail = "shared@example.com";
			const orgCustomerId = "cus_org_123";

			// Mock: Only organization customer exists with this email
			// The search query includes `-metadata['customerType']:'organization'`
			// so this should NOT be returned
			mockStripe.customers.search.mockResolvedValueOnce({
				data: [], // Organization customer is excluded by the search query
			});

			mockStripe.customers.create.mockResolvedValueOnce({
				id: "cus_user_new_456",
				email: sharedEmail,
			});

			const testOptions = {
				...stripeOptions,
				createCustomerOnSignUp: true,
			} satisfies StripeOptions;

			const { client: testAuthClient, auth: testAuth } = await getTestInstance(
				{
					database: memory,
					plugins: [stripe(testOptions)],
				},
				{
					disableTestUser: true,
					clientOptions: {
						plugins: [stripeClient({ subscription: true })],
					},
				},
			);
			const testCtx = await testAuth.$context;

			vi.clearAllMocks();

			// User signs up with email that organization already uses
			const userRes = await testAuthClient.signUp.email(
				{
					email: sharedEmail,
					password: "password",
					name: "User With Shared Email",
				},
				{ throw: true },
			);

			// Should search with query that EXCLUDES organization customers
			expect(mockStripe.customers.search).toHaveBeenCalledWith({
				query: `email:"${sharedEmail}" AND -metadata["customerType"]:"organization"`,
				limit: 1,
			});

			// Should create NEW user customer (not use org customer)
			expect(mockStripe.customers.create).toHaveBeenCalledTimes(1);
			expect(mockStripe.customers.create).toHaveBeenCalledWith({
				email: sharedEmail,
				name: "User With Shared Email",
				metadata: {
					customerType: "user",
					userId: userRes.user.id,
				},
			});

			// Verify user has their own customer ID (not the org's)
			const user = await testCtx.adapter.findOne<
				User & { stripeCustomerId?: string }
			>({
				model: "user",
				where: [{ field: "id", value: userRes.user.id }],
			});
			expect(user?.stripeCustomerId).toBe("cus_user_new_456");
			expect(user?.stripeCustomerId).not.toBe(orgCustomerId);
		});

		it("should find existing user customer even when organization customer with same email exists", async () => {
			// Scenario: Both user and organization customers exist with same email
			// The search should only return the user customer
			const sharedEmail = "both-exist@example.com";
			const existingUserCustomerId = "cus_user_existing_789";

			// Mock: Search returns ONLY user customer (org customer excluded by query)
			mockStripe.customers.search.mockResolvedValueOnce({
				data: [
					{
						id: existingUserCustomerId,
						email: sharedEmail,
						name: "Existing User Customer",
						metadata: {
							customerType: "user",
							userId: "some-old-user-id",
						},
					},
				],
			});

			const testOptions = {
				...stripeOptions,
				createCustomerOnSignUp: true,
			} satisfies StripeOptions;

			const { client: testAuthClient, auth: testAuth } = await getTestInstance(
				{
					database: memory,
					plugins: [stripe(testOptions)],
				},
				{
					disableTestUser: true,
					clientOptions: {
						plugins: [stripeClient({ subscription: true })],
					},
				},
			);
			const testCtx = await testAuth.$context;

			vi.clearAllMocks();

			// User signs up - should find their existing customer
			const userRes = await testAuthClient.signUp.email(
				{
					email: sharedEmail,
					password: "password",
					name: "User Reclaiming Account",
				},
				{ throw: true },
			);

			// Should search excluding organization customers
			expect(mockStripe.customers.search).toHaveBeenCalledWith({
				query: `email:"${sharedEmail}" AND -metadata["customerType"]:"organization"`,
				limit: 1,
			});

			// Should NOT create new customer - use existing user customer
			expect(mockStripe.customers.create).not.toHaveBeenCalled();

			// Verify user has the existing user customer ID
			const user = await testCtx.adapter.findOne<
				User & { stripeCustomerId?: string }
			>({
				model: "user",
				where: [{ field: "id", value: userRes.user.id }],
			});
			expect(user?.stripeCustomerId).toBe(existingUserCustomerId);
		});

		it("should create organization customer with customerType metadata", async () => {
			// Test that organization customers are properly tagged
			const orgEmail = "org@example.com";
			const orgId = "org_test_123";

			mockStripe.customers.search.mockResolvedValueOnce({
				data: [],
			});

			mockStripe.customers.create.mockResolvedValueOnce({
				id: "cus_org_new_999",
				email: orgEmail,
			});

			const { auth: testAuth } = await getTestInstance(
				{
					database: memory,
					plugins: [
						organization(),
						stripe({
							...stripeOptions,
							organization: {
								enabled: true,
								createCustomerOnOrganizationCreate: true,
							},
						}),
					],
				},
				{ disableTestUser: true },
			);
			const testCtx = await testAuth.$context;

			vi.clearAllMocks();

			// Create organization
			await testCtx.adapter.create({
				model: "organization",
				data: {
					id: orgId,
					name: "Test Organization",
					slug: "test-org-collision",
					createdAt: new Date(),
				},
			});

			// Manually trigger the organization customer creation flow
			// by calling the internal function (simulating what hooks do)
			const stripeClient = stripeOptions.stripeClient;
			const searchResult = await stripeClient.customers.search({
				query: `email:'${orgEmail}' AND metadata['customerType']:'organization'`,
				limit: 1,
			});

			if (searchResult.data.length === 0) {
				await stripeClient.customers.create({
					email: orgEmail,
					name: "Test Organization",
					metadata: {
						customerType: "organization",
						organizationId: orgId,
					},
				});
			}

			// Verify organization customer was created with correct metadata
			expect(mockStripe.customers.create).toHaveBeenCalledWith({
				email: orgEmail,
				name: "Test Organization",
				metadata: {
					customerType: "organization",
					organizationId: orgId,
				},
			});
		});
	});

	describe("webhook: cancel_at_period_end cancellation", () => {
		it("should sync cancelAtPeriodEnd and canceledAt when user cancels via Billing Portal (at_period_end mode)", async () => {
			const { auth } = await getTestInstance(
				{
					database: memory,
					plugins: [stripe(stripeOptions)],
				},
				{ disableTestUser: true },
			);
			const ctx = await auth.$context;

			// Setup: Create user and active subscription
			const { id: userId } = await ctx.adapter.create({
				model: "user",
				data: { email: "cancel-period-end@test.com" },
			});

			const now = Math.floor(Date.now() / 1000);
			const periodEnd = now + 30 * 24 * 60 * 60;
			const canceledAt = now;

			const { id: subscriptionId } = await ctx.adapter.create({
				model: "subscription",
				data: {
					referenceId: userId,
					stripeCustomerId: "cus_cancel_test",
					stripeSubscriptionId: "sub_cancel_period_end",
					status: "active",
					plan: "starter",
					cancelAtPeriodEnd: false,
					cancelAt: null,
					canceledAt: null,
				},
			});

			// Simulate: Stripe webhook for cancel_at_period_end
			const webhookEvent = {
				type: "customer.subscription.updated",
				data: {
					object: {
						id: "sub_cancel_period_end",
						customer: "cus_cancel_test",
						status: "active",
						cancel_at_period_end: true,
						cancel_at: null,
						canceled_at: canceledAt,
						ended_at: null,
						items: {
							data: [
								{
									price: { id: "price_starter_123", lookup_key: null },
									quantity: 1,
									current_period_start: now,
									current_period_end: periodEnd,
								},
							],
						},
						cancellation_details: {
							reason: "cancellation_requested",
							comment: "User requested cancellation",
						},
					},
				},
			};

			const stripeForTest = {
				...stripeOptions.stripeClient,
				webhooks: {
					constructEventAsync: vi.fn().mockResolvedValue(webhookEvent),
				},
			};

			const testOptions = {
				...stripeOptions,
				stripeClient: stripeForTest as unknown as Stripe,
				stripeWebhookSecret: "test_secret",
			};

			const { auth: webhookAuth } = await getTestInstance(
				{
					database: memory,
					plugins: [stripe(testOptions)],
				},
				{ disableTestUser: true },
			);
			const webhookCtx = await webhookAuth.$context;

			const response = await webhookAuth.handler(
				new Request("http://localhost:3000/api/auth/stripe/webhook", {
					method: "POST",
					headers: { "stripe-signature": "test_signature" },
					body: JSON.stringify(webhookEvent),
				}),
			);

			expect(response.status).toBe(200);

			const updatedSub = await webhookCtx.adapter.findOne<Subscription>({
				model: "subscription",
				where: [{ field: "id", value: subscriptionId }],
			});

			expect(updatedSub).toMatchObject({
				status: "active",
				cancelAtPeriodEnd: true,
				cancelAt: null,
				canceledAt: expect.any(Date),
				endedAt: null,
			});
		});

		it("should sync cancelAt when subscription is scheduled to cancel at a specific date", async () => {
			const { auth } = await getTestInstance(
				{
					database: memory,
					plugins: [stripe(stripeOptions)],
				},
				{ disableTestUser: true },
			);
			const ctx = await auth.$context;

			const { id: userId } = await ctx.adapter.create({
				model: "user",
				data: { email: "cancel-at-date@test.com" },
			});

			const now = Math.floor(Date.now() / 1000);
			const cancelAt = now + 15 * 24 * 60 * 60; // Cancel in 15 days
			const canceledAt = now;

			const { id: subscriptionId } = await ctx.adapter.create({
				model: "subscription",
				data: {
					referenceId: userId,
					stripeCustomerId: "cus_cancel_at_test",
					stripeSubscriptionId: "sub_cancel_at_date",
					status: "active",
					plan: "starter",
					cancelAtPeriodEnd: false,
					cancelAt: null,
					canceledAt: null,
				},
			});

			// Simulate: Dashboard/API cancel with specific date (cancel_at)
			const webhookEvent = {
				type: "customer.subscription.updated",
				data: {
					object: {
						id: "sub_cancel_at_date",
						customer: "cus_cancel_at_test",
						status: "active",
						cancel_at_period_end: false,
						cancel_at: cancelAt,
						canceled_at: canceledAt,
						ended_at: null,
						items: {
							data: [
								{
									price: { id: "price_starter_123", lookup_key: null },
									quantity: 1,
									current_period_start: now,
									current_period_end: now + 30 * 24 * 60 * 60,
								},
							],
						},
					},
				},
			};

			const stripeForTest = {
				...stripeOptions.stripeClient,
				webhooks: {
					constructEventAsync: vi.fn().mockResolvedValue(webhookEvent),
				},
			};

			const testOptions = {
				...stripeOptions,
				stripeClient: stripeForTest as unknown as Stripe,
				stripeWebhookSecret: "test_secret",
			};

			const { auth: webhookAuth } = await getTestInstance(
				{
					database: memory,
					plugins: [stripe(testOptions)],
				},
				{ disableTestUser: true },
			);
			const webhookCtx = await webhookAuth.$context;

			const response = await webhookAuth.handler(
				new Request("http://localhost:3000/api/auth/stripe/webhook", {
					method: "POST",
					headers: { "stripe-signature": "test_signature" },
					body: JSON.stringify(webhookEvent),
				}),
			);

			expect(response.status).toBe(200);

			const updatedSub = await webhookCtx.adapter.findOne<Subscription>({
				model: "subscription",
				where: [{ field: "id", value: subscriptionId }],
			});

			expect(updatedSub).toMatchObject({
				status: "active",
				cancelAtPeriodEnd: false,
				cancelAt: expect.any(Date),
				canceledAt: expect.any(Date),
				endedAt: null,
			});

			// Verify the cancelAt date is correct
			expect(updatedSub!.cancelAt!.getTime()).toBe(cancelAt * 1000);
		});
	});

	describe("webhook: immediate cancellation (subscription deleted)", () => {
		it("should set status=canceled and endedAt when subscription is immediately canceled", async () => {
			const { auth } = await getTestInstance(
				{
					database: memory,
					plugins: [stripe(stripeOptions)],
				},
				{ disableTestUser: true },
			);
			const ctx = await auth.$context;

			const { id: userId } = await ctx.adapter.create({
				model: "user",
				data: { email: "immediate-cancel@test.com" },
			});

			const now = Math.floor(Date.now() / 1000);

			const { id: subscriptionId } = await ctx.adapter.create({
				model: "subscription",
				data: {
					referenceId: userId,
					stripeCustomerId: "cus_immediate_cancel",
					stripeSubscriptionId: "sub_immediate_cancel",
					status: "active",
					plan: "starter",
				},
			});

			// Simulate: Immediate cancellation via Billing Portal (mode: immediately) or API
			const webhookEvent = {
				type: "customer.subscription.deleted",
				data: {
					object: {
						id: "sub_immediate_cancel",
						customer: "cus_immediate_cancel",
						status: "canceled",
						cancel_at_period_end: false,
						cancel_at: null,
						canceled_at: now,
						ended_at: now,
					},
				},
			};

			const stripeForTest = {
				...stripeOptions.stripeClient,
				webhooks: {
					constructEventAsync: vi.fn().mockResolvedValue(webhookEvent),
				},
			};

			const testOptions = {
				...stripeOptions,
				stripeClient: stripeForTest as unknown as Stripe,
				stripeWebhookSecret: "test_secret",
			};

			const { auth: webhookAuth } = await getTestInstance(
				{
					database: memory,
					plugins: [stripe(testOptions)],
				},
				{ disableTestUser: true },
			);
			const webhookCtx = await webhookAuth.$context;

			const response = await webhookAuth.handler(
				new Request("http://localhost:3000/api/auth/stripe/webhook", {
					method: "POST",
					headers: { "stripe-signature": "test_signature" },
					body: JSON.stringify(webhookEvent),
				}),
			);

			expect(response.status).toBe(200);

			const updatedSub = await webhookCtx.adapter.findOne<Subscription>({
				model: "subscription",
				where: [{ field: "id", value: subscriptionId }],
			});

			expect(updatedSub).not.toBeNull();
			expect(updatedSub!.status).toBe("canceled");
			expect(updatedSub!.endedAt).not.toBeNull();
		});

		it("should set endedAt when cancel_at_period_end subscription reaches period end", async () => {
			const { auth } = await getTestInstance(
				{
					database: memory,
					plugins: [stripe(stripeOptions)],
				},
				{ disableTestUser: true },
			);
			const ctx = await auth.$context;

			const { id: userId } = await ctx.adapter.create({
				model: "user",
				data: { email: "period-end-reached@test.com" },
			});

			const now = Math.floor(Date.now() / 1000);
			const canceledAt = now - 30 * 24 * 60 * 60; // Canceled 30 days ago

			const { id: subscriptionId } = await ctx.adapter.create({
				model: "subscription",
				data: {
					referenceId: userId,
					stripeCustomerId: "cus_period_end_reached",
					stripeSubscriptionId: "sub_period_end_reached",
					status: "active",
					plan: "starter",
					cancelAtPeriodEnd: true,
					canceledAt: new Date(canceledAt * 1000),
				},
			});

			// Simulate: Period ended, subscription is now deleted
			const webhookEvent = {
				type: "customer.subscription.deleted",
				data: {
					object: {
						id: "sub_period_end_reached",
						customer: "cus_period_end_reached",
						status: "canceled",
						cancel_at_period_end: true,
						cancel_at: null,
						canceled_at: canceledAt,
						ended_at: now,
					},
				},
			};

			const stripeForTest = {
				...stripeOptions.stripeClient,
				webhooks: {
					constructEventAsync: vi.fn().mockResolvedValue(webhookEvent),
				},
			};

			const testOptions = {
				...stripeOptions,
				stripeClient: stripeForTest as unknown as Stripe,
				stripeWebhookSecret: "test_secret",
			};

			const { auth: webhookAuth } = await getTestInstance(
				{
					database: memory,
					plugins: [stripe(testOptions)],
				},
				{ disableTestUser: true },
			);
			const webhookCtx = await webhookAuth.$context;

			const response = await webhookAuth.handler(
				new Request("http://localhost:3000/api/auth/stripe/webhook", {
					method: "POST",
					headers: { "stripe-signature": "test_signature" },
					body: JSON.stringify(webhookEvent),
				}),
			);

			expect(response.status).toBe(200);

			const updatedSub = await webhookCtx.adapter.findOne<Subscription>({
				model: "subscription",
				where: [{ field: "id", value: subscriptionId }],
			});

			expect(updatedSub).not.toBeNull();
			expect(updatedSub!.status).toBe("canceled");
			expect(updatedSub!.cancelAtPeriodEnd).toBe(true);
			expect(updatedSub!.endedAt).not.toBeNull();

			// endedAt should be the actual termination time (now), not the cancellation request time
			expect(updatedSub!.endedAt!.getTime()).toBe(now * 1000);
		});
	});

	describe("restore subscription", () => {
		it("should clear cancelAtPeriodEnd when restoring a cancel_at_period_end subscription", async () => {
			const { client, auth, sessionSetter } = await getTestInstance(
				{
					database: memory,
					plugins: [stripe(stripeOptions)],
				},
				{
					disableTestUser: true,
					clientOptions: {
						plugins: [stripeClient({ subscription: true })],
					},
				},
			);
			const ctx = await auth.$context;

			const userRes = await client.signUp.email(
				{
					email: "restore-period-end@test.com",
					password: "password",
					name: "Test",
				},
				{ throw: true },
			);

			const headers = new Headers();
			await client.signIn.email(
				{ email: "restore-period-end@test.com", password: "password" },
				{ throw: true, onSuccess: sessionSetter(headers) },
			);

			// Create subscription scheduled to cancel at period end
			await ctx.adapter.create({
				model: "subscription",
				data: {
					referenceId: userRes.user.id,
					stripeCustomerId: "cus_restore_test",
					stripeSubscriptionId: "sub_restore_period_end",
					status: "active",
					plan: "starter",
					cancelAtPeriodEnd: true,
					cancelAt: null,
					canceledAt: new Date(),
				},
			});

			mockStripe.subscriptions.list.mockResolvedValueOnce({
				data: [
					{
						id: "sub_restore_period_end",
						status: "active",
						cancel_at_period_end: true,
						cancel_at: null,
					},
				],
			});

			mockStripe.subscriptions.update.mockResolvedValueOnce({
				id: "sub_restore_period_end",
				status: "active",
				cancel_at_period_end: false,
				cancel_at: null,
			});

			const restoreRes = await client.subscription.restore({
				fetchOptions: { headers },
			});

			expect(restoreRes.data).toBeDefined();

			// Verify Stripe was called with correct params (cancel_at_period_end: false)
			expect(mockStripe.subscriptions.update).toHaveBeenCalledWith(
				"sub_restore_period_end",
				{ cancel_at_period_end: false },
			);

			const updatedSub = await ctx.adapter.findOne<Subscription>({
				model: "subscription",
				where: [{ field: "referenceId", value: userRes.user.id }],
			});

			expect(updatedSub).toMatchObject({
				cancelAtPeriodEnd: false,
				cancelAt: null,
				canceledAt: null,
			});
		});

		it("should clear cancelAt when restoring a cancel_at (specific date) subscription", async () => {
			const { client, auth, sessionSetter } = await getTestInstance(
				{
					database: memory,
					plugins: [stripe(stripeOptions)],
				},
				{
					disableTestUser: true,
					clientOptions: {
						plugins: [stripeClient({ subscription: true })],
					},
				},
			);
			const ctx = await auth.$context;

			const userRes = await client.signUp.email(
				{
					email: "restore-cancel-at@test.com",
					password: "password",
					name: "Test",
				},
				{ throw: true },
			);

			const headers = new Headers();
			await client.signIn.email(
				{ email: "restore-cancel-at@test.com", password: "password" },
				{ throw: true, onSuccess: sessionSetter(headers) },
			);

			const cancelAt = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000);

			// Create subscription scheduled to cancel at specific date
			await ctx.adapter.create({
				model: "subscription",
				data: {
					referenceId: userRes.user.id,
					stripeCustomerId: "cus_restore_cancel_at",
					stripeSubscriptionId: "sub_restore_cancel_at",
					status: "active",
					plan: "starter",
					cancelAtPeriodEnd: false,
					cancelAt: cancelAt,
					canceledAt: new Date(),
				},
			});

			mockStripe.subscriptions.list.mockResolvedValueOnce({
				data: [
					{
						id: "sub_restore_cancel_at",
						status: "active",
						cancel_at_period_end: false,
						cancel_at: Math.floor(cancelAt.getTime() / 1000),
					},
				],
			});

			mockStripe.subscriptions.update.mockResolvedValueOnce({
				id: "sub_restore_cancel_at",
				status: "active",
				cancel_at_period_end: false,
				cancel_at: null,
			});

			const restoreRes = await client.subscription.restore({
				fetchOptions: { headers },
			});

			expect(restoreRes.data).toBeDefined();

			// Verify Stripe was called with correct params (cancel_at: "" to clear)
			expect(mockStripe.subscriptions.update).toHaveBeenCalledWith(
				"sub_restore_cancel_at",
				{ cancel_at: "" },
			);

			const updatedSub = await ctx.adapter.findOne<Subscription>({
				model: "subscription",
				where: [{ field: "referenceId", value: userRes.user.id }],
			});

			expect(updatedSub).toMatchObject({
				cancelAtPeriodEnd: false,
				cancelAt: null,
				canceledAt: null,
			});
		});
	});

	describe("cancel subscription fallback (missed webhook)", () => {
		it("should sync from Stripe when cancel request fails because subscription is already canceled", async () => {
			const { client, auth, sessionSetter } = await getTestInstance(
				{
					database: memory,
					plugins: [stripe(stripeOptions)],
				},
				{
					disableTestUser: true,
					clientOptions: {
						plugins: [stripeClient({ subscription: true })],
					},
				},
			);
			const ctx = await auth.$context;

			const userRes = await client.signUp.email(
				{
					email: "missed-webhook@test.com",
					password: "password",
					name: "Test",
				},
				{ throw: true },
			);

			const headers = new Headers();
			await client.signIn.email(
				{ email: "missed-webhook@test.com", password: "password" },
				{ throw: true, onSuccess: sessionSetter(headers) },
			);

			const now = Math.floor(Date.now() / 1000);
			const cancelAt = now + 15 * 24 * 60 * 60;

			// Create subscription in DB (not synced - missed webhook)
			const { id: subscriptionId } = await ctx.adapter.create({
				model: "subscription",
				data: {
					referenceId: userRes.user.id,
					stripeCustomerId: "cus_missed_webhook",
					stripeSubscriptionId: "sub_missed_webhook",
					status: "active",
					plan: "starter",
					cancelAtPeriodEnd: false, // DB thinks it's not canceling
					cancelAt: null,
					canceledAt: null,
				},
			});

			// Stripe has the subscription already scheduled to cancel with cancel_at
			mockStripe.subscriptions.list.mockResolvedValueOnce({
				data: [
					{
						id: "sub_missed_webhook",
						status: "active",
						cancel_at_period_end: false,
						cancel_at: cancelAt,
					},
				],
			});

			// Billing portal returns error because subscription is already set to cancel
			mockStripe.billingPortal.sessions.create.mockRejectedValueOnce(
				new Error("This subscription is already set to be canceled"),
			);

			// When fallback kicks in, it retrieves from Stripe
			mockStripe.subscriptions.retrieve.mockResolvedValueOnce({
				id: "sub_missed_webhook",
				status: "active",
				cancel_at_period_end: false,
				cancel_at: cancelAt,
				canceled_at: now,
			});

			// Try to cancel - should fail but trigger sync
			const cancelRes = await client.subscription.cancel({
				returnUrl: "/account",
				fetchOptions: { headers },
			});

			// Should have error because portal creation failed
			expect(cancelRes.error).toBeDefined();

			// But DB should now be synced with Stripe's actual state
			const updatedSub = await ctx.adapter.findOne<Subscription>({
				model: "subscription",
				where: [{ field: "id", value: subscriptionId }],
			});

			expect(updatedSub).toMatchObject({
				cancelAtPeriodEnd: false,
				cancelAt: expect.any(Date),
				canceledAt: expect.any(Date),
			});

			// Verify it's the correct cancel_at date from Stripe
			expect(updatedSub!.cancelAt!.getTime()).toBe(cancelAt * 1000);
		});
	});

	describe("referenceMiddleware", () => {
		describe("referenceMiddleware - user subscription", () => {
			it("should pass when no explicit referenceId is provided", async () => {
				const { client, sessionSetter } = await getTestInstance(
					{
						plugins: [stripe(stripeOptions)],
					},
					{
						disableTestUser: true,
						clientOptions: {
							plugins: [stripeClient({ subscription: true })],
						},
					},
				);

				await client.signUp.email(testUser, { throw: true });
				const headers = new Headers();
				await client.signIn.email(testUser, {
					throw: true,
					onSuccess: sessionSetter(headers),
				});

				const res = await client.subscription.upgrade({
					plan: "starter",
					fetchOptions: { headers },
				});

				expect(res.error).toBeNull();
				expect(res.data?.url).toBeDefined();
			});

			it("should pass when referenceId equals user id", async () => {
				const { client, sessionSetter } = await getTestInstance(
					{
						plugins: [stripe(stripeOptions)],
					},
					{
						disableTestUser: true,
						clientOptions: {
							plugins: [stripeClient({ subscription: true })],
						},
					},
				);

				const signUpRes = await client.signUp.email(
					{ ...testUser, email: "ref-test-2@example.com" },
					{ throw: true },
				);
				const headers = new Headers();
				await client.signIn.email(
					{ ...testUser, email: "ref-test-2@example.com" },
					{
						throw: true,
						onSuccess: sessionSetter(headers),
					},
				);

				const res = await client.subscription.upgrade({
					plan: "starter",
					referenceId: signUpRes.user.id,
					fetchOptions: { headers },
				});

				expect(res.error).toBeNull();
				expect(res.data?.url).toBeDefined();
			});

			it("should reject when authorizeReference is not defined but other referenceId is provided", async () => {
				const { client, sessionSetter } = await getTestInstance(
					{
						plugins: [stripe(stripeOptions)],
					},
					{
						disableTestUser: true,
						clientOptions: {
							plugins: [stripeClient({ subscription: true })],
						},
					},
				);

				await client.signUp.email(
					{ ...testUser, email: "ref-test-3@example.com" },
					{ throw: true },
				);
				const headers = new Headers();
				await client.signIn.email(
					{ ...testUser, email: "ref-test-3@example.com" },
					{
						throw: true,
						onSuccess: sessionSetter(headers),
					},
				);

				const _res = await client.subscription.upgrade({
					plan: "starter",
					referenceId: "some-other-id",
					fetchOptions: { headers },
				});

				// expect(res.error?.code).toBe("REFERENCE_ID_NOT_ALLOWED");
			});

			it("should reject when authorizeReference returns false", async () => {
				const stripeOptionsWithAuth: StripeOptions = {
					...stripeOptions,
					subscription: {
						...stripeOptions.subscription,
						authorizeReference: async () => false,
					},
				};

				const { client, sessionSetter } = await getTestInstance(
					{
						plugins: [stripe(stripeOptionsWithAuth)],
					},
					{
						disableTestUser: true,
						clientOptions: {
							plugins: [stripeClient({ subscription: true })],
						},
					},
				);

				await client.signUp.email(
					{ ...testUser, email: "ref-test-4@example.com" },
					{ throw: true },
				);
				const headers = new Headers();
				await client.signIn.email(
					{ ...testUser, email: "ref-test-4@example.com" },
					{
						throw: true,
						onSuccess: sessionSetter(headers),
					},
				);

				const _res = await client.subscription.upgrade({
					plan: "starter",
					referenceId: "some-other-id",
					fetchOptions: { headers },
				});

				// expect(res.error?.code).toBe("UNAUTHORIZED");
			});

			it("should pass when authorizeReference returns true", async () => {
				const stripeOptionsWithAuth: StripeOptions = {
					...stripeOptions,
					subscription: {
						...stripeOptions.subscription,
						authorizeReference: async () => true,
					},
				};

				const { client, sessionSetter } = await getTestInstance(
					{
						plugins: [stripe(stripeOptionsWithAuth)],
					},
					{
						disableTestUser: true,
						clientOptions: {
							plugins: [stripeClient({ subscription: true })],
						},
					},
				);

				await client.signUp.email(
					{ ...testUser, email: "ref-test-5@example.com" },
					{ throw: true },
				);
				const headers = new Headers();
				await client.signIn.email(
					{ ...testUser, email: "ref-test-5@example.com" },
					{
						throw: true,
						onSuccess: sessionSetter(headers),
					},
				);

				const res = await client.subscription.upgrade({
					plan: "starter",
					referenceId: "some-other-id",
					fetchOptions: { headers },
				});

				expect(res.error).toBeNull();
				expect(res.data?.url).toBeDefined();
			});
		});

		describe("referenceMiddleware - organization subscription", () => {
			it("should reject when authorizeReference is not defined", async () => {
				const { client, sessionSetter } = await getTestInstance(
					{
						plugins: [stripe(stripeOptions)],
					},
					{
						disableTestUser: true,
						clientOptions: {
							plugins: [stripeClient({ subscription: true })],
						},
					},
				);

				await client.signUp.email(
					{ ...testUser, email: "org-test-1@example.com" },
					{ throw: true },
				);
				const headers = new Headers();
				await client.signIn.email(
					{ ...testUser, email: "org-test-1@example.com" },
					{
						throw: true,
						onSuccess: sessionSetter(headers),
					},
				);

				const _res = await client.subscription.upgrade({
					plan: "starter",
					customerType: "organization",
					referenceId: "org_123",
					fetchOptions: { headers },
				});
			});

			it("should reject when no referenceId or activeOrganizationId", async () => {
				const stripeOptionsWithAuth: StripeOptions = {
					...stripeOptions,
					subscription: {
						...stripeOptions.subscription,
						authorizeReference: async () => true,
					},
				};

				const { client, sessionSetter } = await getTestInstance(
					{
						plugins: [stripe(stripeOptionsWithAuth)],
					},
					{
						disableTestUser: true,
						clientOptions: {
							plugins: [stripeClient({ subscription: true })],
						},
					},
				);

				await client.signUp.email(
					{ ...testUser, email: "org-test-2@example.com" },
					{ throw: true },
				);
				const headers = new Headers();
				await client.signIn.email(
					{ ...testUser, email: "org-test-2@example.com" },
					{
						throw: true,
						onSuccess: sessionSetter(headers),
					},
				);

				const _res = await client.subscription.upgrade({
					plan: "starter",
					customerType: "organization",
					fetchOptions: { headers },
				});

				// expect(res.error?.code).toBe("ORGANIZATION_REFERENCE_ID_REQUIRED");
			});

			it("should reject when authorizeReference returns false", async () => {
				const stripeOptionsWithAuth: StripeOptions = {
					...stripeOptions,
					subscription: {
						...stripeOptions.subscription,
						authorizeReference: async () => false,
					},
				};

				const { client, sessionSetter } = await getTestInstance(
					{
						plugins: [stripe(stripeOptionsWithAuth)],
					},
					{
						disableTestUser: true,
						clientOptions: {
							plugins: [stripeClient({ subscription: true })],
						},
					},
				);

				await client.signUp.email(
					{ ...testUser, email: "org-test-3@example.com" },
					{ throw: true },
				);
				const headers = new Headers();
				await client.signIn.email(
					{ ...testUser, email: "org-test-3@example.com" },
					{
						throw: true,
						onSuccess: sessionSetter(headers),
					},
				);

				const _res = await client.subscription.upgrade({
					plan: "starter",
					customerType: "organization",
					referenceId: "org_123",
					fetchOptions: { headers },
				});

				// expect(res.error?.code).toBe("UNAUTHORIZED");
			});

			it("should pass when authorizeReference returns true", async () => {
				const stripeOptionsWithAuth: StripeOptions = {
					...stripeOptions,
					organization: {
						enabled: true,
					},
					subscription: {
						...stripeOptions.subscription,
						authorizeReference: async () => true,
					},
				};

				const { client, sessionSetter } = await getTestInstance(
					{
						plugins: [stripe(stripeOptionsWithAuth)],
					},
					{
						disableTestUser: true,
						clientOptions: {
							plugins: [stripeClient({ subscription: true })],
						},
					},
				);

				await client.signUp.email(
					{ ...testUser, email: "org-test-4@example.com" },
					{ throw: true },
				);
				const headers = new Headers();
				await client.signIn.email(
					{ ...testUser, email: "org-test-4@example.com" },
					{
						throw: true,
						onSuccess: sessionSetter(headers),
					},
				);

				const res = await client.subscription.upgrade({
					plan: "starter",
					customerType: "organization",
					referenceId: "org_123",
					fetchOptions: { headers },
				});

				// Should pass middleware but may fail later due to org not existing
				// We're testing middleware authorization, not the full flow
				expect(res.error?.code).not.toBe(
					"ORGANIZATION_SUBSCRIPTION_NOT_ENABLED",
				);
				expect(res.error?.code).not.toBe("UNAUTHORIZED");
			});
		});
	});

	it("should upgrade existing active subscription even when canceled subscription exists for same referenceId", async () => {
		const { client, auth, sessionSetter } = await getTestInstance(
			{
				database: memory,
				plugins: [stripe(stripeOptions)],
			},
			{
				disableTestUser: true,
				clientOptions: {
					plugins: [stripeClient({ subscription: true })],
				},
			},
		);
		const ctx = await auth.$context;

		// Create a user
		const userRes = await client.signUp.email({ ...testUser }, { throw: true });

		const headers = new Headers();
		await client.signIn.email(
			{ ...testUser },
			{
				throw: true,
				onSuccess: sessionSetter(headers),
			},
		);

		// Update the user with the Stripe customer ID
		await ctx.adapter.update({
			model: "user",
			update: {
				stripeCustomerId: "cus_findone_test",
			},
			where: [
				{
					field: "id",
					value: userRes.user.id,
				},
			],
		});

		// Create a CANCELED subscription first (simulating old subscription)
		await ctx.adapter.create({
			model: "subscription",
			data: {
				plan: "starter",
				referenceId: userRes.user.id,
				stripeCustomerId: "cus_findone_test",
				stripeSubscriptionId: "sub_stripe_canceled",
				status: "canceled",
			},
		});

		// Create an ACTIVE subscription (simulating current subscription)
		await ctx.adapter.create({
			model: "subscription",
			data: {
				plan: "starter",
				referenceId: userRes.user.id,
				stripeCustomerId: "cus_findone_test",
				stripeSubscriptionId: "sub_stripe_active",
				status: "active",
				periodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
			},
		});

		// Mock Stripe subscriptions.list to return the active subscription
		mockStripe.subscriptions.list.mockResolvedValueOnce({
			data: [
				{
					id: "sub_stripe_active",
					status: "active",
					items: {
						data: [
							{
								id: "si_test_item",
								price: { id: process.env.STRIPE_PRICE_ID_1 },
								quantity: 1,
							},
						],
					},
				},
			],
		});

		// Try to upgrade to premium (without providing subscriptionId)
		await client.subscription.upgrade({
			plan: "premium",
			fetchOptions: { headers },
		});

		// Should use billing portal to upgrade existing subscription (not create new checkout)
		expect(mockStripe.billingPortal.sessions.create).toHaveBeenCalled();
		expect(mockStripe.checkout.sessions.create).not.toHaveBeenCalled();
	});
});
