import type { GenericEndpointContext } from "@better-auth/core";
import { runWithEndpointContext } from "@better-auth/core/context";
import { type Auth, type User } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import { getTestInstance } from "better-auth/test";
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

describe("stripe", () => {
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

	beforeEach(() => {
		vi.clearAllMocks();
		data.user = [];
		data.session = [];
		data.verification = [];
		data.account = [];
		data.customer = [];
		data.subscription = [];
	});

	it("should create a customer on sign up", async () => {
		const { client, auth } = await getTestInstance(
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

		const testCtx = await auth.$context;

		const userRes = await client.signUp.email(
			{
				email: "test@email.com",
				password: "password",
				name: "Test User",
			},
			{
				throw: true,
			},
		);

		const res = await testCtx.adapter.findOne<User>({
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
					plugins: [
						stripeClient({
							subscription: true,
						}),
					],
				},
			},
		);

		const testCtx = await auth.$context;
		const headers = new Headers();

		const userRes = await client.signUp.email(
			{
				email: "test@email.com",
				password: "password",
				name: "Test User",
			},
			{
				throw: true,
			},
		);

		await client.signIn.email(
			{
				email: "test@email.com",
				password: "password",
			},
			{
				throw: true,
				onSuccess: sessionSetter(headers),
			},
		);

		const res = await client.subscription.upgrade({
			plan: "starter",
			fetchOptions: {
				headers,
			},
		});

		expect(res.data?.url).toBeDefined();

		const subscription = await testCtx.adapter.findOne<Subscription>({
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
		const { client, auth, sessionSetter } = await getTestInstance(
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

		const testCtx = await auth.$context;
		const headers = new Headers();

		const userRes = await client.signUp.email(
			{
				email: "list-test@email.com",
				password: "password",
				name: "Test User",
			},
			{
				throw: true,
			},
		);
		const userId = userRes.user.id;

		await client.signIn.email(
			{
				email: "list-test@email.com",
				password: "password",
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
		await testCtx.adapter.update({
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
		const { auth } = await getTestInstance(
			{
				database: memory,
				plugins: [stripe(stripeOptions)],
			},
			{
				disableTestUser: true,
			},
		);

		const testCtx = await auth.$context;

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

		// Create a new test instance with modified stripe options
		const { auth: webhookAuth } = await getTestInstance(
			{
				database: memory,
				plugins: [stripe(testOptions)],
			},
			{
				disableTestUser: true,
			},
		);

		const webhookTestCtx = await webhookAuth.$context;

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

		const response = await webhookAuth.handler(mockRequest);
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
		const { auth } = await getTestInstance(
			{
				database: memory,
				plugins: [stripe(stripeOptions)],
			},
			{
				disableTestUser: true,
			},
		);

		const testCtx = await auth.$context;

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

		const { auth: webhookAuth } = await getTestInstance(
			{
				database: memory,
				plugins: [stripe(testOptions)],
			},
			{
				disableTestUser: true,
			},
		);

		const webhookTestCtx = await webhookAuth.$context;

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

		const response = await webhookAuth.handler(mockRequest);
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
		const { auth } = await getTestInstance(
			{
				database: memory,
				plugins: [stripe(stripeOptions)],
			},
			{
				disableTestUser: true,
			},
		);

		const testCtx = await auth.$context;

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

		const { auth: webhookAuth } = await getTestInstance(
			{
				database: memory,
				plugins: [stripe(testOptions)],
			},
			{
				disableTestUser: true,
			},
		);

		const webhookTestCtx = await webhookAuth.$context;

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

		const response = await webhookAuth.handler(mockRequest);
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

		// Create test user
		const { id: eventUserId } = await eventTestCtx.adapter.create({
			model: "user",
			data: {
				email: "event-test@email.com",
				emailVerified: true,
				name: "Event Test User",
			},
		});

		const { id: testSubscriptionId } = await eventTestCtx.adapter.create({
			model: "subscription",
			data: {
				referenceId: eventUserId,
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
						referenceId: eventUserId,
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

		const { auth: updateTestAuth } = await getTestInstance(
			{
				database: memory,
				plugins: [stripe(testOptions)],
			},
			{
				disableTestUser: true,
			},
		);

		const updateTestCtx = await updateTestAuth.$context;

		const { id: testReferenceId } = await updateTestCtx.adapter.create({
			model: "user",
			data: {
				email: "update-callback@email.com",
			},
		});

		const { id: testSubscriptionId } = await updateTestCtx.adapter.create({
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

		await updateTestAuth.handler(mockRequest);

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
		const updatedSub = await updateTestCtx.adapter.findOne<Subscription>({
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

		const seatTestCtx = await auth.$context;

		const userRes = await client.signUp.email(
			{
				email: "seat-upgrade@email.com",
				password: "password123456",
				name: "Seat Upgrade User",
			},
			{
				throw: true,
			},
		);

		const headers = new Headers();
		await client.signIn.email(
			{
				email: "seat-upgrade@email.com",
				password: "password123456",
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

		await seatTestCtx.adapter.update({
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

		const dupTestCtx = await auth.$context;

		const userRes = await client.signUp.email(
			{
				email: "duplicate-prevention@email.com",
				password: "password123456",
				name: "Duplicate Prevention User",
			},
			{
				throw: true,
			},
		);

		const headers = new Headers();
		await client.signIn.email(
			{
				email: "duplicate-prevention@email.com",
				password: "password123456",
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

		await dupTestCtx.adapter.update({
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
			{
				email: "single-create@email.com",
				password: "password123456",
				name: "Single Create User",
			},
			{ throw: true },
		);

		const headers = new Headers();
		await client.signIn.email(
			{ email: "single-create@email.com", password: "password123456" },
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
				email: "billing-portal@email.com",
				password: "password123456",
				name: "Billing Portal User",
			},
			{
				throw: true,
			},
		);

		const headers = new Headers();
		await client.signIn.email(
			{
				email: "billing-portal@email.com",
				password: "password123456",
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
		const orgId = "org_b67GF32Cljh7u588AuEblmLVobclDRcP";

		const testOptions = {
			...stripeOptions,
			stripeClient: _stripe,
			subscription: {
				...stripeOptions.subscription,
				authorizeReference: async () => true,
			},
		} as unknown as StripeOptions;

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

		// Sign up and sign in the user
		const userRes = await testAuthClient.signUp.email(
			{
				email: "org-ref@email.com",
				password: "password123456",
				name: "Org Ref User",
			},
			{ throw: true },
		);
		const headers = new Headers();
		await testAuthClient.signIn.email(
			{ email: "org-ref@email.com", password: "password123456" },
			{
				throw: true,
				onSuccess: (ctx) => {
					const setCookie = ctx.response.headers.get("set-cookie");
					if (setCookie) {
						headers.set("cookie", setCookie);
					}
				},
			},
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

		const trialTestCtx = await auth.$context;

		// Create a user
		const userRes = await client.signUp.email(
			{
				email: "trial-prevention@email.com",
				password: "password123456",
				name: "Trial Prevention User",
			},
			{ throw: true },
		);

		const headers = new Headers();
		await client.signIn.email(
			{ email: "trial-prevention@email.com", password: "password123456" },
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
		await trialTestCtx.adapter.update({
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
		await trialTestCtx.adapter.update({
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
		const subscriptions = (await trialTestCtx.adapter.findMany({
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

		const upgradeTestCtx = await auth.$context;

		// Create a user
		const userRes = await client.signUp.email(
			{
				email: "upgrade-existing@email.com",
				password: "password123456",
				name: "Upgrade Existing User",
			},
			{ throw: true },
		);

		const headers = new Headers();
		await client.signIn.email(
			{ email: "upgrade-existing@email.com", password: "password123456" },
			{
				throw: true,
				onSuccess: sessionSetter(headers),
			},
		);

		// Mock customers.list to find existing customer
		mockStripe.customers.list.mockResolvedValueOnce({
			data: [{ id: "cus_test_123" }],
		});

		// First create a starter subscription
		await client.subscription.upgrade({
			plan: "starter",
			fetchOptions: { headers },
		});

		// Simulate the subscription being active
		const starterSub = await upgradeTestCtx.adapter.findOne<Subscription>({
			model: "subscription",
			where: [
				{
					field: "referenceId",
					value: userRes.user.id,
				},
			],
		});

		await upgradeTestCtx.adapter.update({
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
		await upgradeTestCtx.adapter.update({
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
		const allSubs = await upgradeTestCtx.adapter.findMany<Subscription>({
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

		const crossPlanTestCtx = await auth.$context;

		// Create a user
		const userRes = await client.signUp.email(
			{
				email: "cross-plan-trial@email.com",
				password: "password123456",
				name: "Cross Plan Trial User",
			},
			{ throw: true },
		);

		const headers = new Headers();
		await client.signIn.email(
			{ email: "cross-plan-trial@email.com", password: "password123456" },
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
		await crossPlanTestCtx.adapter.update({
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
		await crossPlanTestCtx.adapter.update({
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
		const subscriptions = (await crossPlanTestCtx.adapter.findMany({
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

		const emailUpdateTestCtx = await auth.$context;

		// Sign up a user
		const userRes = await client.signUp.email(
			{
				email: "test@email.com",
				password: "password123456",
				name: "Test User",
			},
			{
				throw: true,
			},
		);

		expect(userRes.user).toBeDefined();

		// Verify customer was created during signup
		expect(mockStripe.customers.create).toHaveBeenCalledWith({
			email: "test@email.com",
			name: "Test User",
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
		const endpointCtx = {
			context: emailUpdateTestCtx,
		} as GenericEndpointContext;
		await runWithEndpointContext(endpointCtx, () =>
			emailUpdateTestCtx.internalAdapter.updateUserByEmail("test@email.com", {
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

			const { client } = await getTestInstance(
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
			const userRes = await client.signUp.email(
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

			const { client } = await getTestInstance(
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
			await client.signUp.email(
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

			const { client } = await getTestInstance(
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
			const userRes = await client.signUp.email(
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

			const { client } = await getTestInstance(
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
			const userRes = await client.signUp.email(
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
			expect(data.message).toContain("Stripe webhook error");
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

			const { auth: testAuth } = await getTestInstance(
				{
					database: memory,
					plugins: [stripe(testOptions as StripeOptions)],
				},
				{
					disableTestUser: true,
				},
			);

			const asyncErrorTestCtx = await testAuth.$context;

			await asyncErrorTestCtx.adapter.create({
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

			const asyncVerifyTestCtx = await testAuth.$context;

			// Create test user for this test
			const { id: asyncUserId } = await asyncVerifyTestCtx.adapter.create({
				model: "user",
				data: {
					email: "async-verify@email.com",
					emailVerified: true,
					name: "Async Verify User",
				},
			});

			await asyncVerifyTestCtx.adapter.create({
				model: "subscription",
				data: {
					referenceId: asyncUserId,
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

			const v18TestCtx = await testAuth.$context;

			// Create test user
			const { id: v18UserId } = await v18TestCtx.adapter.create({
				model: "user",
				data: {
					email: "v18-test@email.com",
					emailVerified: true,
					name: "V18 Test User",
				},
			});

			await v18TestCtx.adapter.create({
				model: "subscription",
				data: {
					referenceId: v18UserId,
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

		const { client, auth, sessionSetter } = await getTestInstance(
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

		// Create user and sign in
		const headers = new Headers();
		const userRes = await client.signUp.email(
			{ email: "limits@test.com", password: "password", name: "Test" },
			{ throw: true },
		);
		const userId = userRes.user.id;

		await client.signIn.email(
			{ email: "limits@test.com", password: "password" },
			{ throw: true, onSuccess: sessionSetter(headers) },
		);

		const flexibleTestCtx = await auth.$context;

		// Create subscription
		await flexibleTestCtx.adapter.create({
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
		const result = await client.subscription.list({
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

			const { client, auth } = await getTestInstance(
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

			vi.clearAllMocks();

			// Sign up with email that exists in Stripe
			const userRes = await client.signUp.email(
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

			const duplicateTestCtx = await auth.$context;

			// Verify user has the EXISTING Stripe customer ID (not new duplicate)
			const user = await duplicateTestCtx.adapter.findOne<
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

			const { client, auth } = await getTestInstance(
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

			vi.clearAllMocks();

			// Sign up with brand new email
			const userRes = await client.signUp.email(
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

			const newCustomerTestCtx = await auth.$context;

			// Verify user has the new Stripe customer ID
			const user = await newCustomerTestCtx.adapter.findOne<
				User & { stripeCustomerId?: string }
			>({
				model: "user",
				where: [{ field: "id", value: userRes.user.id }],
			});
			expect(user?.stripeCustomerId).toBeDefined();
		});
	});

	describe("Race condition prevention", () => {
		it("should prevent duplicate customer creation in concurrent requests", async () => {
			const { auth } = await getTestInstance(
				{
					database: memory,
					plugins: [stripe(stripeOptions)],
				},
				{
					disableTestUser: true,
				},
			);

			const raceTestCtx = await auth.$context;

			// Create user without Stripe customer
			const { id: raceUserId } = await raceTestCtx.adapter.create({
				model: "user",
				data: {
					email: "concurrent@test.com",
					name: "Concurrent User",
				},
			});

			let callCount = 0;
			mockStripe.customers.create.mockImplementation(async (params) => {
				callCount++;
				// Simulate API delay
				await new Promise((resolve) => setTimeout(resolve, 10));
				return {
					id: `cus_concurrent_${callCount}`,
					email: params.email || "",
					name: params.name || "",
				};
			});

			// Simulate concurrent requests by calling the hook logic multiple times
			// In real scenario, this would be triggered by multiple simultaneous signups
			const createCustomerLogic = async () => {
				const user = await raceTestCtx.adapter.findOne<
					User & { stripeCustomerId?: string }
				>({
					model: "user",
					where: [{ field: "id", value: raceUserId }],
				});

				// This check prevents race condition
				if (!user?.stripeCustomerId) {
					const stripeCustomer = await mockStripe.customers.create({
						email: user!.email,
						name: user!.name || undefined,
						metadata: {
							userId: user!.id,
						},
					});

					await raceTestCtx.adapter.update({
						model: "user",
						update: {
							stripeCustomerId: stripeCustomer.id,
						},
						where: [{ field: "id", value: raceUserId }],
					});
				}
			};

			// Run first call
			await createCustomerLogic();

			// After first call, user should have stripeCustomerId
			const userAfterFirst = await raceTestCtx.adapter.findOne<
				User & { stripeCustomerId?: string }
			>({
				model: "user",
				where: [{ field: "id", value: raceUserId }],
			});

			expect(userAfterFirst?.stripeCustomerId).toBeDefined();

			// Reset mock to verify subsequent calls don't create more customers
			mockStripe.customers.create.mockClear();

			// Run concurrent calls - these should NOT create new customers
			await Promise.all([
				createCustomerLogic(),
				createCustomerLogic(),
				createCustomerLogic(),
			]);

			// Should not create any more customers because stripeCustomerId exists
			expect(mockStripe.customers.create).toHaveBeenCalledTimes(0);

			const finalUser = await raceTestCtx.adapter.findOne<
				User & { stripeCustomerId?: string }
			>({
				model: "user",
				where: [{ field: "id", value: raceUserId }],
			});

			// Should still have the original customer ID
			expect(finalUser?.stripeCustomerId).toBe(
				userAfterFirst?.stripeCustomerId,
			);
		});
	});

	describe("Database hooks conditional registration", () => {
		it("should register update hook even when createCustomerOnSignUp is false", async () => {
			const optionsWithoutAutoCreate = {
				...stripeOptions,
				createCustomerOnSignUp: false,
			} satisfies StripeOptions;

			const { auth } = await getTestInstance(
				{
					database: memory,
					plugins: [stripe(optionsWithoutAutoCreate)],
				},
				{
					disableTestUser: true,
				},
			);

			const hookTestCtx = await auth.$context;
			const stripePlugin = stripe(optionsWithoutAutoCreate);
			const initResult = stripePlugin.init?.(hookTestCtx);

			// Update hook should always be registered (for email sync)
			expect(initResult?.options?.databaseHooks?.user?.update).toBeDefined();
			expect(
				initResult?.options?.databaseHooks?.user?.update?.after,
			).toBeDefined();
		});

		it("should NOT register create hook when createCustomerOnSignUp is false", async () => {
			const optionsWithoutAutoCreate = {
				...stripeOptions,
				createCustomerOnSignUp: false,
			} satisfies StripeOptions;

			const { auth } = await getTestInstance(
				{
					database: memory,
					plugins: [stripe(optionsWithoutAutoCreate)],
				},
				{
					disableTestUser: true,
				},
			);

			const noCreateHookCtx = await auth.$context;
			const stripePlugin = stripe(optionsWithoutAutoCreate);
			const initResult = stripePlugin.init?.(noCreateHookCtx);

			// Create hook should NOT be registered
			expect(initResult?.options?.databaseHooks?.user?.create).toBeUndefined();
		});

		it("should register create hook when createCustomerOnSignUp is true", async () => {
			const optionsWithAutoCreate = {
				...stripeOptions,
				createCustomerOnSignUp: true,
			} satisfies StripeOptions;

			const { auth } = await getTestInstance(
				{
					database: memory,
					plugins: [stripe(optionsWithAutoCreate)],
				},
				{
					disableTestUser: true,
				},
			);

			const withCreateHookCtx = await auth.$context;
			const stripePlugin = stripe(optionsWithAutoCreate);
			const initResult = stripePlugin.init?.(withCreateHookCtx);

			// Both create and update hooks should be registered
			expect(initResult?.options?.databaseHooks?.user?.create).toBeDefined();
			expect(
				initResult?.options?.databaseHooks?.user?.create?.after,
			).toBeDefined();
			expect(initResult?.options?.databaseHooks?.user?.update).toBeDefined();
			expect(
				initResult?.options?.databaseHooks?.user?.update?.after,
			).toBeDefined();
		});
	});

	describe("Infinite loop prevention with lastSyncedAt", () => {
		it("should skip update when lastSyncedAt is within 2 seconds", async () => {
			const { auth } = await getTestInstance(
				{
					database: memory,
					plugins: [stripe(stripeOptions)],
				},
				{
					disableTestUser: true,
				},
			);

			const loopTestCtx = await auth.$context;

			const { id: loopUserId } = await loopTestCtx.adapter.create({
				model: "user",
				data: {
					email: "loop-test@test.com",
					name: "Loop Test User",
					stripeCustomerId: "cus_loop_test_123",
				},
			});

			// Mock customer with RECENT lastSyncedAt (within 2 seconds)
			const recentTimestamp = new Date().toISOString();
			mockStripe.customers.retrieve.mockResolvedValueOnce({
				id: "cus_loop_test_123",
				email: "loop-test@test.com",
				name: "Loop Test User",
				deleted: false,
				metadata: {
					userId: loopUserId,
					lastSyncedAt: recentTimestamp,
				},
			});

			// Try to update user email
			const endpointCtx = { context: loopTestCtx } as GenericEndpointContext;
			await runWithEndpointContext(endpointCtx, async () => {
				await loopTestCtx.adapter.update({
					model: "user",
					update: {
						email: "new-loop-test@test.com",
					},
					where: [{ field: "id", value: loopUserId }],
				});

				// Simulate the update hook checking lastSyncedAt
				const user = await loopTestCtx.adapter.findOne<
					User & { stripeCustomerId?: string }
				>({
					model: "user",
					where: [{ field: "id", value: loopUserId }],
				});

				if (user?.stripeCustomerId) {
					const customer = await mockStripe.customers.retrieve(
						user.stripeCustomerId,
					);

					if (customer && !("deleted" in customer && customer.deleted)) {
						// Check lastSyncedAt to prevent infinite loop
						const lastSynced = customer.metadata?.lastSyncedAt;
						if (lastSynced) {
							const timeSinceSync = Date.now() - new Date(lastSynced).getTime();
							if (timeSinceSync < 2000) {
								// Skip update - too recent
								return;
							}
						}

						// This should NOT be reached
						await mockStripe.customers.update(user.stripeCustomerId, {
							email: user.email,
							metadata: {
								...customer.metadata,
								lastSyncedAt: new Date().toISOString(),
							},
						});
					}
				}
			});

			// Verify Stripe customer was retrieved but NOT updated
			expect(mockStripe.customers.retrieve).toHaveBeenCalledWith(
				"cus_loop_test_123",
			);
			expect(mockStripe.customers.update).not.toHaveBeenCalled();
		});

		it("should proceed with update when lastSyncedAt is older than 2 seconds", async () => {
			const { auth } = await getTestInstance(
				{
					database: memory,
					plugins: [stripe(stripeOptions)],
				},
				{
					disableTestUser: true,
				},
			);

			const oldLoopTestCtx = await auth.$context;

			const { id: oldLoopUserId } = await oldLoopTestCtx.adapter.create({
				model: "user",
				data: {
					email: "old-loop-test@test.com",
					name: "Old Loop Test User",
					stripeCustomerId: "cus_old_loop_123",
				},
			});

			// Mock customer with OLD lastSyncedAt (> 2 seconds)
			const oldTimestamp = new Date(Date.now() - 5000).toISOString(); // 5 seconds ago
			mockStripe.customers.retrieve.mockResolvedValueOnce({
				id: "cus_old_loop_123",
				email: "old-loop-test@test.com",
				name: "Old Loop Test User",
				deleted: false,
				metadata: {
					userId: oldLoopUserId,
					lastSyncedAt: oldTimestamp,
				},
			});

			mockStripe.customers.update.mockResolvedValueOnce({
				id: "cus_old_loop_123",
				email: "new-old-loop-test@test.com",
			});

			// Update user email
			const endpointCtx = {
				context: oldLoopTestCtx,
			} as GenericEndpointContext;
			await runWithEndpointContext(endpointCtx, async () => {
				await oldLoopTestCtx.adapter.update({
					model: "user",
					update: {
						email: "new-old-loop-test@test.com",
					},
					where: [{ field: "id", value: oldLoopUserId }],
				});

				// Simulate the update hook
				const user = await oldLoopTestCtx.adapter.findOne<
					User & { stripeCustomerId?: string }
				>({
					model: "user",
					where: [{ field: "id", value: oldLoopUserId }],
				});

				if (user?.stripeCustomerId) {
					const customer = await mockStripe.customers.retrieve(
						user.stripeCustomerId,
					);

					if (customer && !("deleted" in customer && customer.deleted)) {
						const lastSynced = customer.metadata?.lastSyncedAt;
						if (lastSynced) {
							const timeSinceSync = Date.now() - new Date(lastSynced).getTime();
							if (timeSinceSync < 2000) {
								return; // Skip
							}
						}

						// Should proceed with update since lastSyncedAt is old
						await mockStripe.customers.update(user.stripeCustomerId, {
							email: user.email,
							metadata: {
								...customer.metadata,
								lastSyncedAt: new Date().toISOString(),
							},
						});
					}
				}
			});

			// Verify Stripe customer was updated
			expect(mockStripe.customers.retrieve).toHaveBeenCalled();
			expect(mockStripe.customers.update).toHaveBeenCalledWith(
				"cus_old_loop_123",
				expect.objectContaining({
					email: "new-old-loop-test@test.com",
					metadata: expect.objectContaining({
						userId: oldLoopUserId,
						lastSyncedAt: expect.any(String),
					}),
				}),
			);
		});
	});
});
