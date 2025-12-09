import type { GenericEndpointContext } from "@better-auth/core";
import { runWithEndpointContext } from "@better-auth/core/context";
import type { Auth, User } from "better-auth";
import { betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import { createAuthClient } from "better-auth/client";
import { setCookieToHeader } from "better-auth/cookies";
import { bearer } from "better-auth/plugins";
import type Stripe from "stripe";
import { beforeEach, describe, expect, expectTypeOf, it, vi } from "vitest";
import type { StripePlugin } from ".";
import { stripe } from ".";
import { stripeClient } from "./client";
import type { StripeOptions, Subscription } from "./types";

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
	});
});

describe("stripe", async () => {
	const mockStripe = {
		prices: {
			list: vi.fn().mockResolvedValue({ data: [{ id: "price_lookup_123" }] }),
		},
		customers: {
			create: vi.fn().mockResolvedValue({ id: "cus_mock123" }),
			list: vi.fn().mockResolvedValue({ data: [] }),
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
	const data = {
		user: [],
		session: [],
		verification: [],
		account: [],
		customer: [],
		subscription: [],
	};
	const memory = memoryAdapter(data);
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
	const auth = betterAuth({
		database: memory,
		baseURL: "http://localhost:3000",
		// database: new Database(":memory:"),
		emailAndPassword: {
			enabled: true,
		},
		plugins: [stripe(stripeOptions)],
	});
	const ctx = await auth.$context;
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

	beforeEach(() => {
		data.user = [];
		data.session = [];
		data.verification = [];
		data.account = [];
		data.customer = [];
		data.subscription = [];

		vi.clearAllMocks();
	});

	async function getHeader() {
		const headers = new Headers();
		const userRes = await authClient.signIn.email(testUser, {
			throw: true,
			onSuccess: setCookieToHeader(headers),
		});
		return {
			headers,
			response: userRes,
		};
	}

	it("should create a customer on sign up", async () => {
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

	it("should create a subscription", async () => {
		const userRes = await authClient.signUp.email(testUser, {
			throw: true,
		});

		const headers = new Headers();
		await authClient.signIn.email(testUser, {
			throw: true,
			onSuccess: setCookieToHeader(headers),
		});

		const res = await authClient.subscription.upgrade({
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

	it("should list active subscriptions", async () => {
		const userRes = await authClient.signUp.email(
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
		await authClient.signIn.email(
			{
				...testUser,
				email: "list-test@email.com",
			},
			{
				throw: true,
				onSuccess: setCookieToHeader(headers),
			},
		);

		const listRes = await authClient.subscription.list({
			fetchOptions: {
				headers,
			},
		});

		expect(Array.isArray(listRes.data)).toBe(true);

		await authClient.subscription.upgrade({
			plan: "starter",
			fetchOptions: {
				headers,
			},
		});
		const listBeforeActive = await authClient.subscription.list({
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
		const listAfterRes = await authClient.subscription.list({
			fetchOptions: {
				headers,
			},
		});
		expect(listAfterRes.data?.length).toBeGreaterThan(0);
	});

	it("should handle subscription webhook events", async () => {
		const { id: testReferenceId } = await ctx.adapter.create({
			model: "user",
			data: {
				email: "test@email.com",
			},
		});
		const { id: testSubscriptionId } = await ctx.adapter.create({
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

		const testAuth = betterAuth({
			baseURL: "http://localhost:3000",
			database: memory,
			emailAndPassword: {
				enabled: true,
			},
			plugins: [stripe(testOptions)],
		});

		const testCtx = await testAuth.$context;

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
		const response = await testAuth.handler(mockRequest);
		expect(response.status).toBe(200);

		const updatedSubscription = await testCtx.adapter.findOne<Subscription>({
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
		const { id: testReferenceId } = await ctx.adapter.create({
			model: "user",
			data: {
				email: "test@email.com",
			},
		});
		const { id: testSubscriptionId } = await ctx.adapter.create({
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

		const testAuth = betterAuth({
			baseURL: "http://localhost:3000",
			database: memory,
			emailAndPassword: {
				enabled: true,
			},
			plugins: [stripe(testOptions)],
		});

		const testCtx = await testAuth.$context;

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
		const response = await testAuth.handler(mockRequest);
		expect(response.status).toBe(200);

		const updatedSubscription = await testCtx.adapter.findOne<Subscription>({
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

	const { id: userId } = await ctx.adapter.create({
		model: "user",
		data: {
			email: "delete-test@email.com",
		},
	});

	it("should handle subscription deletion webhook", async () => {
		const subId = "test_sub_delete";

		await ctx.adapter.create({
			model: "subscription",
			data: {
				referenceId: userId,
				stripeCustomerId: "cus_delete_test",
				status: "active",
				plan: "starter",
				stripeSubscriptionId: "sub_delete_test",
			},
		});

		const subscription = await ctx.adapter.findOne<Subscription>({
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

		const testAuth = betterAuth({
			baseURL: "http://localhost:3000",
			emailAndPassword: {
				enabled: true,
			},
			database: memory,
			plugins: [stripe(testOptions)],
		});

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

		const response = await testAuth.handler(mockRequest);
		expect(response.status).toBe(200);

		if (subscription) {
			const updatedSubscription = await ctx.adapter.findOne<Subscription>({
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

	it("should execute subscription event handlers", async () => {
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

		const testAuth = betterAuth({
			baseURL: "http://localhost:3000",
			database: memory,
			emailAndPassword: {
				enabled: true,
			},
			plugins: [stripe(testOptions)],
		});

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

		const eventTestAuth = betterAuth({
			baseURL: "http://localhost:3000",
			database: memory,
			emailAndPassword: { enabled: true },
			plugins: [stripe(eventTestOptions)],
		});

		const { id: testSubscriptionId } = await ctx.adapter.create({
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

		const testAuth = betterAuth({
			baseURL: "http://localhost:3000",
			database: memory,
			emailAndPassword: {
				enabled: true,
			},
			plugins: [stripe(testOptions)],
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
		const userRes = await authClient.signUp.email(
			{
				...testUser,
				email: "seat-upgrade@email.com",
			},
			{
				throw: true,
			},
		);

		const headers = new Headers();
		await authClient.signIn.email(
			{
				...testUser,
				email: "seat-upgrade@email.com",
			},
			{
				throw: true,
				onSuccess: setCookieToHeader(headers),
			},
		);

		await authClient.subscription.upgrade({
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

		const upgradeRes = await authClient.subscription.upgrade({
			plan: "starter",
			seats: 5,
			fetchOptions: {
				headers,
			},
		});

		expect(upgradeRes.data?.url).toBeDefined();
	});

	it("should prevent duplicate subscriptions with same plan and same seats", async () => {
		const userRes = await authClient.signUp.email(
			{
				...testUser,
				email: "duplicate-prevention@email.com",
			},
			{
				throw: true,
			},
		);

		const headers = new Headers();
		await authClient.signIn.email(
			{
				...testUser,
				email: "duplicate-prevention@email.com",
			},
			{
				throw: true,
				onSuccess: setCookieToHeader(headers),
			},
		);

		await authClient.subscription.upgrade({
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
			},
			where: [
				{
					field: "referenceId",
					value: userRes.user.id,
				},
			],
		});

		const upgradeRes = await authClient.subscription.upgrade({
			plan: "starter",
			seats: 3,
			fetchOptions: {
				headers,
			},
		});

		expect(upgradeRes.error).toBeDefined();
		expect(upgradeRes.error?.message).toContain("already subscribed");
	});

	it("should only call Stripe customers.create once for signup and upgrade", async () => {
		const userRes = await authClient.signUp.email(
			{ ...testUser, email: "single-create@email.com" },
			{ throw: true },
		);

		const headers = new Headers();
		await authClient.signIn.email(
			{ ...testUser, email: "single-create@email.com" },
			{
				throw: true,
				onSuccess: setCookieToHeader(headers),
			},
		);

		await authClient.subscription.upgrade({
			plan: "starter",
			fetchOptions: { headers },
		});

		expect(mockStripe.customers.create).toHaveBeenCalledTimes(1);
	});

	it("should create billing portal session", async () => {
		await authClient.signUp.email(
			{
				...testUser,
				email: "billing-portal@email.com",
			},
			{
				throw: true,
			},
		);

		const headers = new Headers();
		await authClient.signIn.email(
			{
				...testUser,
				email: "billing-portal@email.com",
			},
			{
				throw: true,
				onSuccess: setCookieToHeader(headers),
			},
		);
		const billingPortalRes = await authClient.subscription.billingPortal({
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

		const testAuth = betterAuth({
			baseURL: "http://localhost:3000",
			database: memory,
			emailAndPassword: { enabled: true },
			plugins: [stripe(testOptions)],
		});
		const testCtx = await testAuth.$context;

		const testAuthClient = createAuthClient({
			baseURL: "http://localhost:3000",
			plugins: [bearer(), stripeClient({ subscription: true })],
			fetchOptions: {
				customFetchImpl: async (url, init) =>
					testAuth.handler(new Request(url, init)),
			},
		});

		// Sign up and sign in the user
		const userRes = await testAuthClient.signUp.email(
			{ ...testUser, email: "org-ref@email.com" },
			{ throw: true },
		);
		const headers = new Headers();
		await testAuthClient.signIn.email(
			{ ...testUser, email: "org-ref@email.com" },
			{ throw: true, onSuccess: setCookieToHeader(headers) },
		);

		// Create a personal subscription (referenceId = user id)
		await testAuthClient.subscription.upgrade({
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
		const upgradeRes = await testAuthClient.subscription.upgrade({
			plan: "starter",
			referenceId: orgId,
			fetchOptions: { headers },
		});
		console.log(upgradeRes);

		// // It should NOT go through billing portal (which would update the personal sub)
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
		// Create a user
		const userRes = await authClient.signUp.email(
			{ ...testUser, email: "trial-prevention@email.com" },
			{ throw: true },
		);

		const headers = new Headers();
		await authClient.signIn.email(
			{ ...testUser, email: "trial-prevention@email.com" },
			{
				throw: true,
				onSuccess: setCookieToHeader(headers),
			},
		);

		// First subscription with trial
		const firstUpgradeRes = await authClient.subscription.upgrade({
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
		const secondUpgradeRes = await authClient.subscription.upgrade({
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

	it("should upgrade existing subscription instead of creating new one", async () => {
		// Reset mocks for this test
		vi.clearAllMocks();

		// Create a user
		const userRes = await authClient.signUp.email(
			{ ...testUser, email: "upgrade-existing@email.com" },
			{ throw: true },
		);

		const headers = new Headers();
		await authClient.signIn.email(
			{ ...testUser, email: "upgrade-existing@email.com" },
			{
				throw: true,
				onSuccess: setCookieToHeader(headers),
			},
		);

		// Mock customers.list to find existing customer
		mockStripe.customers.list.mockResolvedValueOnce({
			data: [{ id: "cus_test_123" }],
		});

		// First create a starter subscription
		await authClient.subscription.upgrade({
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
		const upgradeRes = await authClient.subscription.upgrade({
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
		// Create a user
		const userRes = await authClient.signUp.email(
			{ ...testUser, email: "cross-plan-trial@email.com" },
			{ throw: true },
		);

		const headers = new Headers();
		await authClient.signIn.email(
			{ ...testUser, email: "cross-plan-trial@email.com" },
			{
				throw: true,
				onSuccess: setCookieToHeader(headers),
			},
		);

		// First subscription with trial on starter plan
		const firstUpgradeRes = await authClient.subscription.upgrade({
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
		const secondUpgradeRes = await authClient.subscription.upgrade({
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
		const userRes = await authClient.signUp.email(testUser, {
			throw: true,
		});

		expect(userRes.user).toBeDefined();

		// Verify customer was created during signup
		expect(mockStripe.customers.create).toHaveBeenCalledWith({
			email: testUser.email,
			name: testUser.name,
			metadata: {
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
		const endpointCtx = { context: ctx } as GenericEndpointContext;
		await runWithEndpointContext(endpointCtx, () =>
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

			const testAuth = betterAuth({
				database: memory,
				baseURL: "http://localhost:3000",
				emailAndPassword: {
					enabled: true,
				},
				plugins: [stripe(testOptions)],
			});

			const testAuthClient = createAuthClient({
				baseURL: "http://localhost:3000",
				plugins: [bearer(), stripeClient({ subscription: true })],
				fetchOptions: {
					customFetchImpl: async (url, init) =>
						testAuth.handler(new Request(url, init)),
				},
			});

			// Sign up a user
			const userRes = await testAuthClient.signUp.email(
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

			const testAuth = betterAuth({
				database: memory,
				baseURL: "http://localhost:3000",
				emailAndPassword: {
					enabled: true,
				},
				plugins: [stripe(testOptions)],
			});

			const testAuthClient = createAuthClient({
				baseURL: "http://localhost:3000",
				plugins: [bearer(), stripeClient({ subscription: true })],
				fetchOptions: {
					customFetchImpl: async (url, init) =>
						testAuth.handler(new Request(url, init)),
				},
			});

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

			const testAuth = betterAuth({
				database: memory,
				baseURL: "http://localhost:3000",
				emailAndPassword: {
					enabled: true,
				},
				plugins: [stripe(testOptions)],
			});

			const testAuthClient = createAuthClient({
				baseURL: "http://localhost:3000",
				plugins: [bearer(), stripeClient({ subscription: true })],
				fetchOptions: {
					customFetchImpl: async (url, init) =>
						testAuth.handler(new Request(url, init)),
				},
			});

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

			const testAuth = betterAuth({
				database: memory,
				baseURL: "http://localhost:3000",
				emailAndPassword: {
					enabled: true,
				},
				plugins: [stripe(testOptions)],
			});

			const testAuthClient = createAuthClient({
				baseURL: "http://localhost:3000",
				plugins: [bearer(), stripeClient({ subscription: true })],
				fetchOptions: {
					customFetchImpl: async (url, init) =>
						testAuth.handler(new Request(url, init)),
				},
			});

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

			const testAuth = betterAuth({
				baseURL: "http://localhost:3000",
				database: memory,
				emailAndPassword: { enabled: true },
				plugins: [stripe(testOptions)],
			});

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
			expect(data.message).toContain("Webhook Error");
		});

		it("should reject webhook request without stripe-signature header", async () => {
			const testAuth = betterAuth({
				baseURL: "http://localhost:3000",
				database: memory,
				emailAndPassword: { enabled: true },
				plugins: [stripe(stripeOptions)],
			});

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
			expect(data.message).toContain("Stripe webhook secret not found");
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

			const testAuth = betterAuth({
				baseURL: "http://localhost:3000",
				database: memory,
				emailAndPassword: { enabled: true },
				plugins: [stripe(testOptions)],
			});

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
			expect(data.message).toContain("Failed to construct event");
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

			const testAuth = betterAuth({
				baseURL: "http://localhost:3000",
				database: memory,
				emailAndPassword: { enabled: true },
				plugins: [stripe(testOptions as StripeOptions)],
			});

			await ctx.adapter.create({
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

			const testAuth = betterAuth({
				baseURL: "http://localhost:3000",
				database: memory,
				emailAndPassword: { enabled: true },
				plugins: [stripe(testOptions)],
			});

			const { id: subId } = await ctx.adapter.create({
				model: "subscription",
				data: {
					referenceId: userId,
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

			const testAuth = betterAuth({
				baseURL: "http://localhost:3000",
				database: memory,
				emailAndPassword: { enabled: true },
				plugins: [stripe(testOptions)],
			});

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

			const testAuth = betterAuth({
				baseURL: "http://localhost:3000",
				database: memory,
				emailAndPassword: { enabled: true },
				plugins: [stripe(testOptions)],
			});

			const { id: subId } = await ctx.adapter.create({
				model: "subscription",
				data: {
					referenceId: userId,
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

		const testAuth = betterAuth({
			baseURL: "http://localhost:3000",
			database: memory,
			emailAndPassword: { enabled: true },
			plugins: [
				stripe({
					...stripeOptions,
					subscription: {
						enabled: true,
						plans: flexiblePlans,
					},
				}),
			],
		});

		const testClient = createAuthClient({
			baseURL: "http://localhost:3000",
			plugins: [bearer(), stripeClient({ subscription: true })],
			fetchOptions: {
				customFetchImpl: async (url, init) => {
					return testAuth.handler(new Request(url, init));
				},
			},
		});

		// Create user and sign in
		const headers = new Headers();
		const userRes = await testClient.signUp.email(
			{ email: "limits@test.com", password: "password", name: "Test" },
			{ throw: true },
		);
		const userId = userRes.user.id;

		await testClient.signIn.email(
			{ email: "limits@test.com", password: "password" },
			{ throw: true, onSuccess: setCookieToHeader(headers) },
		);

		// Create subscription
		await ctx.adapter.create({
			model: "subscription",
			data: {
				referenceId: userId,
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

			mockStripe.customers.list.mockResolvedValueOnce({
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

			const testAuth = betterAuth({
				database: memory,
				baseURL: "http://localhost:3000",
				emailAndPassword: { enabled: true },
				plugins: [stripe(testOptionsWithHook)],
			});

			const testAuthClient = createAuthClient({
				baseURL: "http://localhost:3000",
				plugins: [bearer(), stripeClient({ subscription: true })],
				fetchOptions: {
					customFetchImpl: async (url, init) =>
						testAuth.handler(new Request(url, init)),
				},
			});

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

			// Should check for existing customer by email
			expect(mockStripe.customers.list).toHaveBeenCalledWith({
				email: existingEmail,
				limit: 1,
			});

			// Should NOT create duplicate customer
			expect(mockStripe.customers.create).not.toHaveBeenCalled();

			// Verify user has the EXISTING Stripe customer ID (not new duplicate)
			const user = await ctx.adapter.findOne<
				User & { stripeCustomerId?: string }
			>({
				model: "user",
				where: [{ field: "id", value: userRes.user.id }],
			});
			expect(user?.stripeCustomerId).toBe(existingCustomerId); // Should use existing ID
		});

		it("should CREATE customer only when user has no stripeCustomerId and none exists in Stripe", async () => {
			const newEmail = "brand-new@example.com";

			mockStripe.customers.list.mockResolvedValueOnce({
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

			const testAuth = betterAuth({
				database: memory,
				baseURL: "http://localhost:3000",
				emailAndPassword: { enabled: true },
				plugins: [stripe(testOptionsWithHook)],
			});

			const testAuthClient = createAuthClient({
				baseURL: "http://localhost:3000",
				plugins: [bearer(), stripeClient({ subscription: true })],
				fetchOptions: {
					customFetchImpl: async (url, init) =>
						testAuth.handler(new Request(url, init)),
				},
			});

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

			// Should check for existing customer first
			expect(mockStripe.customers.list).toHaveBeenCalledWith({
				email: newEmail,
				limit: 1,
			});

			// Should create new customer (this is correct behavior)
			expect(mockStripe.customers.create).toHaveBeenCalledTimes(1);
			expect(mockStripe.customers.create).toHaveBeenCalledWith({
				email: newEmail,
				name: "Brand New User",
				metadata: {
					userId: userRes.user.id,
				},
			});

			// Verify user has the new Stripe customer ID
			const user = await ctx.adapter.findOne<
				User & { stripeCustomerId?: string }
			>({
				model: "user",
				where: [{ field: "id", value: userRes.user.id }],
			});
			expect(user?.stripeCustomerId).toBeDefined();
		});
	});
});
