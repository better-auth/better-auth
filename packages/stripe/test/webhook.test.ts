import type { User } from "better-auth";
import type { memoryAdapter } from "better-auth/adapters/memory";
import { getTestInstance } from "better-auth/test";
import Stripe from "stripe";
import { assert, describe, expect, vi } from "vitest";
import { stripe } from "../src";
import { stripeClient } from "../src/client";
import type { StripeOptions, StripePlan, Subscription } from "../src/types";
import {
	createCheckoutSessionCompletedEvent,
	createPrice,
	createSubscription,
	createSubscriptionEvent,
	createSubscriptionItem,
} from "./_factories";
import type { StripeMock } from "./_fixtures";
import { TEST_PRICES, test } from "./_fixtures";

const testUser = {
	email: "test@email.com",
	password: "password",
	name: "Test User",
};

describe("stripe webhook", () => {
	test("should handle subscription webhook events", async ({
		memory,
		stripeOptions,
	}) => {
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

		const mockSubscription = createSubscription({
			id: testSubscriptionId,
			items: {
				object: "list",
				data: [
					createSubscriptionItem({
						price: createPrice({
							id: TEST_PRICES.starter,
						}),
					}),
				],
				has_more: false,
				url: "/v1/subscription_items",
			},
		});

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
		expect(updatedSubscription?.periodStart?.getTime()).not.toBeNaN();
		expect(updatedSubscription?.periodEnd?.getTime()).not.toBeNaN();
	});

	test("should handle subscription webhook events with trial", async ({
		memory,
		stripeOptions,
	}) => {
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

		const now = Math.floor(Date.now() / 1000);
		const mockSubscription = createSubscription({
			id: testSubscriptionId,
			items: {
				object: "list",
				data: [
					createSubscriptionItem({
						price: createPrice({
							id: TEST_PRICES.starter,
						}),
					}),
				],
				has_more: false,
				url: "/v1/subscription_items",
			},
			trial_start: now,
			trial_end: now + 30 * 24 * 60 * 60,
		});

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
		expect(updatedSubscription?.periodStart?.getTime()).not.toBeNaN();
		expect(updatedSubscription?.periodEnd?.getTime()).not.toBeNaN();
		expect(updatedSubscription?.trialStart?.getTime()).not.toBeNaN();
		expect(updatedSubscription?.trialEnd?.getTime()).not.toBeNaN();
	});

	test("should handle subscription deletion webhook", async ({
		memory,
		stripeOptions,
	}) => {
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

	test("should handle customer.subscription.created webhook event", async ({
		memory,
		stripeOptions,
	}) => {
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
								price: {
									id: TEST_PRICES.starter,
									recurring: {
										interval: "year",
									},
								},
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

		stripeForTest.webhooks.constructEventAsync.mockResolvedValue(mockEvent);

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
		expect(subscription?.billingInterval).toBe("year");
	});

	test("should store billingInterval as year for annual subscriptions", async ({
		memory,
		stripeOptions,
	}) => {
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
				email: "annual-user@test.com",
				name: "Annual User",
				emailVerified: true,
				stripeCustomerId: "cus_annual_test",
			},
		});

		const mockEvent = {
			type: "customer.subscription.created",
			data: {
				object: {
					id: "sub_annual_created",
					customer: "cus_annual_test",
					status: "active",
					items: {
						data: [
							{
								price: {
									id: TEST_PRICES.starter,
									recurring: { interval: "year" },
								},
								quantity: 1,
								current_period_start: Math.floor(Date.now() / 1000),
								current_period_end:
									Math.floor(Date.now() / 1000) + 365 * 24 * 60 * 60,
							},
						],
					},
					cancel_at_period_end: false,
				},
			},
		};

		stripeForTest.webhooks.constructEventAsync.mockResolvedValue(mockEvent);

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

		// Verify subscription was created with annual billing interval
		const subscription = await testCtx.adapter.findOne<Subscription>({
			model: "subscription",
			where: [{ field: "stripeSubscriptionId", value: "sub_annual_created" }],
		});

		expect(subscription).toBeDefined();
		expect(subscription?.referenceId).toBe(userWithCustomerId.id);
		expect(subscription?.billingInterval).toBe("year");
	});
	test("should not create duplicate subscription if already exists", async ({
		memory,
		stripeOptions,
	}) => {
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
								price: { id: TEST_PRICES.starter },
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

		stripeForTest.webhooks.constructEventAsync.mockResolvedValue(mockEvent);

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

	test("should skip subscription creation when user not found", async ({
		memory,
		stripeOptions,
	}) => {
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
								price: { id: TEST_PRICES.starter },
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

		stripeForTest.webhooks.constructEventAsync.mockResolvedValue(mockEvent);

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

	test("should skip subscription creation when plan not found", async ({
		memory,
		stripeOptions,
	}) => {
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

		stripeForTest.webhooks.constructEventAsync.mockResolvedValue(mockEvent);

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

	test("should skip creating subscription when metadata.subscriptionId exists", async ({
		memory,
		stripeOptions,
	}) => {
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
		const user = await testCtx.adapter.findOne<
			User & { stripeCustomerId?: string }
		>({
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
								price: { id: TEST_PRICES.starter },
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

		stripeForTest.webhooks.constructEventAsync.mockResolvedValue(mockEvent);

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

	test("should execute subscription event handlers", async ({
		memory,
		stripeOptions,
	}) => {
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
		} satisfies StripeOptions;

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

		const mockSubscription = createSubscription({
			items: {
				object: "list",
				data: [
					createSubscriptionItem({
						price: createPrice({
							id: TEST_PRICES.starter,
						}),
					}),
				],
				has_more: false,
				url: "/v1/subscription_items",
			},
		});

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
		// Point the checkout at the row it completes.
		completeEvent.data.object.metadata.subscriptionId = testSubscriptionId;

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
				subscription: expect.objectContaining({ id: testSubscriptionId }),
				stripeSubscription: expect.any(Object),
				plan: expect.any(Object),
			}),
			expect.objectContaining({
				context: expect.any(Object),
				_flag: expect.any(String),
			}),
		);

		const updateEvent = createSubscriptionEvent(
			"customer.subscription.updated",
			{
				id: testSubscriptionId,
				customer: "cus_123",
				items: {
					object: "list",
					data: [
						createSubscriptionItem({
							price: createPrice({
								id: TEST_PRICES.starter,
							}),
						}),
					],
					has_more: false,
					url: "/v1/subscription_items",
				},
			},
		);

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

		const userCancelEvent = createSubscriptionEvent(
			"customer.subscription.updated",
			{
				id: testSubscriptionId,
				customer: "cus_123",
				cancel_at_period_end: true,
				cancellation_details: {
					reason: "cancellation_requested",
					comment: "Customer canceled subscription",
					feedback: null,
				},
				items: {
					object: "list",
					data: [
						createSubscriptionItem({
							price: createPrice({
								id: TEST_PRICES.starter,
							}),
						}),
					],
					has_more: false,
					url: "/v1/subscription_items",
				},
			},
		);

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
		const cancelEvent = createSubscriptionEvent(
			"customer.subscription.updated",
			{
				id: testSubscriptionId,
				customer: "cus_123",
				cancel_at_period_end: true,
				items: {
					object: "list",
					data: [
						createSubscriptionItem({
							price: createPrice({
								id: TEST_PRICES.starter,
							}),
						}),
					],
					has_more: false,
					url: "/v1/subscription_items",
				},
			},
		);

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

	test("should return updated subscription in onSubscriptionUpdate callback", async ({
		memory,
		stripeOptions,
	}) => {
		const onSubscriptionUpdate = vi.fn();

		// Simulate subscription update event (e.g., seat change from 1 to 5)
		const updateEvent = createSubscriptionEvent(
			"customer.subscription.updated",
			{
				id: "sub_update_test",
				customer: "cus_update_test",
				items: {
					object: "list",
					data: [
						createSubscriptionItem({
							price: createPrice({
								id: TEST_PRICES.starter,
							}),
							quantity: 5, // Updated from 1 to 5
						}),
					],
					has_more: false,
					url: "/v1/subscription_items",
				},
			},
		);
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
		} satisfies StripeOptions;

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

	test("should sync stripeScheduleId from webhook when schedule is present", async ({
		memory,
		stripeOptions,
	}) => {
		const updateEvent = {
			type: "customer.subscription.updated",
			data: {
				object: {
					id: "sub_schedule_sync",
					customer: "cus_schedule_sync",
					status: "active",
					schedule: "sub_schedule_from_stripe",
					items: {
						data: [
							{
								price: { id: TEST_PRICES.starter },
								quantity: 1,
								current_period_start: Math.floor(Date.now() / 1000),
								current_period_end:
									Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
							},
						],
					},
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
		} satisfies StripeOptions;

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

		const { id: userId } = await ctx.adapter.create({
			model: "user",
			data: { email: "schedule-sync@email.com" },
		});

		await ctx.adapter.create({
			model: "subscription",
			data: {
				referenceId: userId,
				stripeCustomerId: "cus_schedule_sync",
				stripeSubscriptionId: "sub_schedule_sync",
				status: "active",
				plan: "starter",
			},
		});

		await testAuth.handler(
			new Request("http://localhost:3000/api/auth/stripe/webhook", {
				method: "POST",
				headers: { "stripe-signature": "test_signature" },
				body: JSON.stringify(updateEvent),
			}),
		);

		const sub = await ctx.adapter.findOne<Subscription>({
			model: "subscription",
			where: [{ field: "stripeSubscriptionId", value: "sub_schedule_sync" }],
		});
		expect(sub?.stripeScheduleId).toBe("sub_schedule_from_stripe");
	});

	test("should clear stripeScheduleId from webhook when schedule is removed", async ({
		memory,
		stripeOptions,
	}) => {
		const updateEvent = {
			type: "customer.subscription.updated",
			data: {
				object: {
					id: "sub_schedule_clear",
					customer: "cus_schedule_clear",
					status: "active",
					schedule: null,
					items: {
						data: [
							{
								price: { id: TEST_PRICES.starter },
								quantity: 1,
								current_period_start: Math.floor(Date.now() / 1000),
								current_period_end:
									Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
							},
						],
					},
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
		} satisfies StripeOptions;

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

		const { id: userId } = await ctx.adapter.create({
			model: "user",
			data: { email: "schedule-clear@email.com" },
		});

		await ctx.adapter.create({
			model: "subscription",
			data: {
				referenceId: userId,
				stripeCustomerId: "cus_schedule_clear",
				stripeSubscriptionId: "sub_schedule_clear",
				status: "active",
				plan: "starter",
				stripeScheduleId: "sub_schedule_old",
			},
		});

		await testAuth.handler(
			new Request("http://localhost:3000/api/auth/stripe/webhook", {
				method: "POST",
				headers: { "stripe-signature": "test_signature" },
				body: JSON.stringify(updateEvent),
			}),
		);

		const sub = await ctx.adapter.findOne<Subscription>({
			model: "subscription",
			where: [{ field: "stripeSubscriptionId", value: "sub_schedule_clear" }],
		});
		expect(sub?.stripeScheduleId).toBeNull();
	});

	test("should clear stripeScheduleId on subscription deleted webhook", async ({
		memory,
		stripeOptions,
	}) => {
		const deleteEvent = {
			type: "customer.subscription.deleted",
			data: {
				object: {
					id: "sub_delete_schedule",
					customer: "cus_delete_schedule",
					status: "canceled",
					metadata: {},
				},
			},
		};

		const stripeForTest = {
			...stripeOptions.stripeClient,
			webhooks: {
				constructEventAsync: vi.fn().mockResolvedValue(deleteEvent),
			},
		};

		const testOptions = {
			...stripeOptions,
			stripeClient: stripeForTest as unknown as Stripe,
			stripeWebhookSecret: "test_secret",
		} satisfies StripeOptions;

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

		const { id: userId } = await ctx.adapter.create({
			model: "user",
			data: { email: "delete-schedule@email.com" },
		});

		await ctx.adapter.create({
			model: "subscription",
			data: {
				referenceId: userId,
				stripeCustomerId: "cus_delete_schedule",
				stripeSubscriptionId: "sub_delete_schedule",
				status: "active",
				plan: "starter",
				stripeScheduleId: "sub_schedule_will_be_cleared",
			},
		});

		await testAuth.handler(
			new Request("http://localhost:3000/api/auth/stripe/webhook", {
				method: "POST",
				headers: { "stripe-signature": "test_signature" },
				body: JSON.stringify(deleteEvent),
			}),
		);

		const sub = await ctx.adapter.findOne<Subscription>({
			model: "subscription",
			where: [{ field: "stripeSubscriptionId", value: "sub_delete_schedule" }],
		});
		expect(sub?.stripeScheduleId).toBeNull();
		expect(sub?.status).toBe("canceled");
	});

	describe("Webhook Error Handling (Stripe v19)", () => {
		test("should handle invalid webhook signature with constructEventAsync", async ({
			memory,
			stripeOptions,
		}) => {
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

		test("should reject webhook request without stripe-signature header", async ({
			memory,
			stripeOptions,
		}) => {
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

		test("should handle constructEventAsync returning null/undefined", async ({
			memory,
			stripeOptions,
		}) => {
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

		test("should fail the webhook when the Stripe API call in checkout.session.completed fails", async ({
			memory,
			stripeOptions,
		}) => {
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
			// A failed Stripe API call means the subscription was not saved, so the
			// webhook must return a non-2xx response and let Stripe retry it.
			expect(response.status).toBe(400);
			expect(stripeForTest.subscriptions.retrieve).toHaveBeenCalled();
			expect(errorThrowingHandler).not.toHaveBeenCalled();
		});

		test("should successfully process webhook with valid async signature verification", async ({
			memory,
			stripeOptions,
		}) => {
			const mockEvent = createSubscriptionEvent(
				"customer.subscription.updated",
				{
					id: "sub_test_async",
					customer: "cus_test_async",
					items: {
						object: "list",
						data: [
							createSubscriptionItem({
								price: createPrice({
									id: TEST_PRICES.starter,
								}),
							}),
						],
						has_more: false,
						url: "/v1/subscription_items",
					},
				},
			);

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

		test("should call constructEventAsync with exactly 3 required parameters", async ({
			memory,
			stripeOptions,
		}) => {
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

		test("should support Stripe v18 with sync constructEvent method", async ({
			memory,
			stripeOptions,
		}) => {
			const mockEvent = createSubscriptionEvent(
				"customer.subscription.updated",
				{
					id: "sub_test_v18",
					customer: "cus_test_v18",
					items: {
						object: "list",
						data: [
							createSubscriptionItem({
								price: createPrice({
									id: TEST_PRICES.starter,
								}),
							}),
						],
						has_more: false,
						url: "/v1/subscription_items",
					},
				},
			);

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
	describe("webhook: cancel_at_period_end cancellation", () => {
		test("should sync cancelAtPeriodEnd and canceledAt when user cancels via Billing Portal (at_period_end mode)", async ({
			memory,
			stripeOptions,
		}) => {
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

		test("should sync cancelAt when subscription is scheduled to cancel at a specific date", async ({
			memory,
			stripeOptions,
		}) => {
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

		/**
		 * @see https://github.com/better-auth/better-auth/issues/9321
		 */
		test("should pass stripeSubscription to onSubscriptionUpdate", async ({
			memory,
			stripeOptions,
		}) => {
			const onSubscriptionUpdate = vi.fn();

			const now = Math.floor(Date.now() / 1000);
			const cancelAt = now + 15 * 24 * 60 * 60;

			const webhookEvent = {
				type: "customer.subscription.updated",
				data: {
					object: {
						id: "sub_9321",
						customer: "cus_9321",
						status: "active",
						cancel_at_period_end: true,
						cancel_at: cancelAt,
						canceled_at: now,
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

			const constructEventAsync = vi.fn().mockResolvedValue(webhookEvent);
			const stripeForTest = {
				...stripeOptions.stripeClient,
				webhooks: { constructEventAsync },
			};

			const testOptions = {
				...stripeOptions,
				stripeClient: stripeForTest as unknown as Stripe,
				stripeWebhookSecret: "test_secret",
				subscription: {
					...stripeOptions.subscription,
					onSubscriptionUpdate,
				},
			} satisfies StripeOptions;

			const { auth: webhookAuth } = await getTestInstance(
				{ database: memory, plugins: [stripe(testOptions)] },
				{ disableTestUser: true },
			);
			const webhookCtx = await webhookAuth.$context;

			const { id: userId } = await webhookCtx.adapter.create({
				model: "user",
				data: { email: "9321@test.com" },
			});
			await webhookCtx.adapter.create({
				model: "subscription",
				data: {
					referenceId: userId,
					stripeCustomerId: "cus_9321",
					stripeSubscriptionId: "sub_9321",
					status: "active",
					plan: "starter",
				},
			});

			await webhookAuth.handler(
				new Request("http://localhost:3000/api/auth/stripe/webhook", {
					method: "POST",
					headers: { "stripe-signature": "test_signature" },
					body: JSON.stringify(webhookEvent),
				}),
			);

			expect(onSubscriptionUpdate).toHaveBeenCalledWith(
				expect.objectContaining({
					stripeSubscription: expect.any(Object),
				}),
			);
		});

		test("should pass the post-update subscription row to onSubscriptionCancel (symmetry with onSubscriptionUpdate)", async ({
			memory,
			stripeOptions,
		}) => {
			const onSubscriptionCancel = vi.fn();

			const now = Math.floor(Date.now() / 1000);
			const periodEnd = now + 30 * 24 * 60 * 60;
			const cancelAt = now + 15 * 24 * 60 * 60;

			const cancelEvent = {
				type: "customer.subscription.updated",
				data: {
					object: {
						id: "sub_cancel_timing",
						customer: "cus_cancel_timing",
						status: "active",
						cancel_at_period_end: true,
						cancel_at: cancelAt,
						canceled_at: now,
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
							feedback: null,
							comment: null,
						},
					},
				},
			};

			const constructEventAsync = vi.fn().mockResolvedValue(cancelEvent);
			const stripeForTest = {
				...stripeOptions.stripeClient,
				webhooks: { constructEventAsync },
			};

			const testOptions = {
				...stripeOptions,
				stripeClient: stripeForTest as unknown as Stripe,
				stripeWebhookSecret: "test_secret",
				subscription: {
					...stripeOptions.subscription,
					onSubscriptionCancel,
				},
			} satisfies StripeOptions;

			const { auth: webhookAuth } = await getTestInstance(
				{
					database: memory,
					plugins: [stripe(testOptions)],
				},
				{ disableTestUser: true },
			);
			const webhookCtx = await webhookAuth.$context;

			const { id: userId } = await webhookCtx.adapter.create({
				model: "user",
				data: { email: "cancel-timing@test.com" },
			});

			await webhookCtx.adapter.create({
				model: "subscription",
				data: {
					referenceId: userId,
					stripeCustomerId: "cus_cancel_timing",
					stripeSubscriptionId: "sub_cancel_timing",
					status: "active",
					plan: "starter",
					cancelAtPeriodEnd: false,
					cancelAt: null,
					canceledAt: null,
				},
			});

			await webhookAuth.handler(
				new Request("http://localhost:3000/api/auth/stripe/webhook", {
					method: "POST",
					headers: { "stripe-signature": "test_signature" },
					body: JSON.stringify(cancelEvent),
				}),
			);

			expect(onSubscriptionCancel).toHaveBeenCalledTimes(1);
			const arg = onSubscriptionCancel.mock.calls[0]?.[0];
			expect(arg.subscription).toMatchObject({
				cancelAtPeriodEnd: true,
				cancelAt: expect.any(Date),
				canceledAt: expect.any(Date),
			});
		});
	});
	describe("webhook: immediate cancellation (subscription deleted)", () => {
		test("should set status=canceled and endedAt when subscription is immediately canceled", async ({
			memory,
			stripeOptions,
		}) => {
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

		test("should set endedAt when cancel_at_period_end subscription reaches period end", async ({
			memory,
			stripeOptions,
		}) => {
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
});

/**
 * @see https://github.com/better-auth/better-auth/issues/10534
 */
describe("stripe webhook: acknowledgement when processing fails", () => {
	const starterItems = {
		object: "list" as const,
		data: [
			createSubscriptionItem({
				price: createPrice({ id: TEST_PRICES.starter }),
			}),
		],
		has_more: false,
		url: "/v1/subscription_items",
	};

	function sendWebhook(
		auth: { handler: (request: Request) => Promise<Response> },
		event: Stripe.Event,
	) {
		return auth.handler(
			new Request("http://localhost:3000/api/auth/stripe/webhook", {
				method: "POST",
				headers: { "stripe-signature": "test_signature" },
				body: JSON.stringify(event),
			}),
		);
	}

	test("returns non-2xx when saving checkout.session.completed fails, then applies it once on retry", async ({
		memory,
		stripeOptions,
		stripeMock,
	}) => {
		const onEvent = vi.fn();
		const onSubscriptionComplete = vi.fn();
		const { auth } = await getTestInstance(
			{
				database: memory,
				plugins: [
					stripe({
						...stripeOptions,
						onEvent,
						subscription: {
							...stripeOptions.subscription,
							onSubscriptionComplete,
						},
					}),
				],
			},
			{ disableTestUser: true },
		);
		const ctx = await auth.$context;
		const user = await ctx.adapter.create({
			model: "user",
			data: { email: "checkout-fail@email.com" },
		});
		const row = await ctx.adapter.create<Subscription>({
			model: "subscription",
			data: {
				referenceId: user.id,
				stripeCustomerId: "cus_checkout_fail",
				status: "incomplete",
				plan: "starter",
			},
		});
		const event = createCheckoutSessionCompletedEvent({
			subscription: "sub_checkout_fail",
			metadata: { referenceId: user.id, subscriptionId: row.id },
		});
		stripeMock.webhooks.constructEventAsync.mockResolvedValue(event);
		stripeMock.subscriptions.retrieve.mockResolvedValue(
			createSubscription({ id: "sub_checkout_fail", items: starterItems }),
		);

		vi.spyOn(ctx.adapter, "update").mockRejectedValueOnce(
			new Error("database unavailable"),
		);
		const failed = await sendWebhook(auth, event);
		expect(failed.status).toBeGreaterThanOrEqual(400);
		expect(onEvent).not.toHaveBeenCalled();
		expect(onSubscriptionComplete).not.toHaveBeenCalled();
		const unchanged = await ctx.adapter.findOne<Subscription>({
			model: "subscription",
			where: [{ field: "id", value: row.id }],
		});
		expect(unchanged?.status).toBe("incomplete");

		// Stripe redelivers the same event.
		const retried = await sendWebhook(auth, event);
		expect(retried.status).toBe(200);
		const saved = await ctx.adapter.findOne<Subscription>({
			model: "subscription",
			where: [{ field: "id", value: row.id }],
		});
		expect(saved).toMatchObject({
			status: "active",
			stripeSubscriptionId: "sub_checkout_fail",
		});
		expect(onSubscriptionComplete).toHaveBeenCalledTimes(1);
		expect(onEvent).toHaveBeenCalledTimes(1);
	});

	test("returns non-2xx when creating the row for customer.subscription.created fails, and the retry creates exactly one row", async ({
		memory,
		stripeOptions,
		stripeMock,
	}) => {
		const onSubscriptionCreated = vi.fn();
		const { auth } = await getTestInstance(
			{
				database: memory,
				plugins: [
					stripe({
						...stripeOptions,
						subscription: {
							...stripeOptions.subscription,
							onSubscriptionCreated,
						},
					}),
				],
			},
			{ disableTestUser: true },
		);
		const ctx = await auth.$context;
		await ctx.adapter.create({
			model: "user",
			data: {
				email: "created-fail@email.com",
				stripeCustomerId: "cus_created_fail",
			},
		});
		const event = createSubscriptionEvent("customer.subscription.created", {
			id: "sub_created_fail",
			customer: "cus_created_fail",
			items: starterItems,
		});
		stripeMock.webhooks.constructEventAsync.mockResolvedValue(event);

		vi.spyOn(ctx.adapter, "create").mockRejectedValueOnce(
			new Error("database unavailable"),
		);
		const failed = await sendWebhook(auth, event);
		expect(failed.status).toBeGreaterThanOrEqual(400);
		expect(onSubscriptionCreated).not.toHaveBeenCalled();

		const retried = await sendWebhook(auth, event);
		expect(retried.status).toBe(200);
		const rows = await ctx.adapter.findMany<Subscription>({
			model: "subscription",
			where: [{ field: "stripeSubscriptionId", value: "sub_created_fail" }],
		});
		expect(rows).toHaveLength(1);
		expect(onSubscriptionCreated).toHaveBeenCalledTimes(1);
	});

	test("returns non-2xx when saving customer.subscription.updated fails, and the retry still fires onSubscriptionCancel once", async ({
		memory,
		stripeOptions,
		stripeMock,
	}) => {
		const onSubscriptionCancel = vi.fn();
		const { auth } = await getTestInstance(
			{
				database: memory,
				plugins: [
					stripe({
						...stripeOptions,
						subscription: {
							...stripeOptions.subscription,
							onSubscriptionCancel,
						},
					}),
				],
			},
			{ disableTestUser: true },
		);
		const ctx = await auth.$context;
		const row = await ctx.adapter.create<Subscription>({
			model: "subscription",
			data: {
				referenceId: "user_updated_fail",
				stripeCustomerId: "cus_updated_fail",
				stripeSubscriptionId: "sub_updated_fail",
				status: "active",
				plan: "starter",
				cancelAtPeriodEnd: false,
			},
		});
		const event = createSubscriptionEvent("customer.subscription.updated", {
			id: "sub_updated_fail",
			customer: "cus_updated_fail",
			status: "active",
			cancel_at_period_end: true,
			items: starterItems,
		});
		stripeMock.webhooks.constructEventAsync.mockResolvedValue(event);

		vi.spyOn(ctx.adapter, "update").mockRejectedValueOnce(
			new Error("database unavailable"),
		);
		const failed = await sendWebhook(auth, event);
		expect(failed.status).toBeGreaterThanOrEqual(400);
		expect(onSubscriptionCancel).not.toHaveBeenCalled();

		const retried = await sendWebhook(auth, event);
		expect(retried.status).toBe(200);
		const saved = await ctx.adapter.findOne<Subscription>({
			model: "subscription",
			where: [{ field: "id", value: row.id }],
		});
		expect(saved?.cancelAtPeriodEnd).toBe(true);
		expect(onSubscriptionCancel).toHaveBeenCalledTimes(1);
	});

	test("returns non-2xx when saving customer.subscription.deleted fails", async ({
		memory,
		stripeOptions,
		stripeMock,
	}) => {
		const { auth } = await getTestInstance(
			{ database: memory, plugins: [stripe(stripeOptions)] },
			{ disableTestUser: true },
		);
		const ctx = await auth.$context;
		const row = await ctx.adapter.create<Subscription>({
			model: "subscription",
			data: {
				referenceId: "user_deleted_fail",
				stripeCustomerId: "cus_deleted_fail",
				stripeSubscriptionId: "sub_deleted_fail",
				status: "active",
				plan: "starter",
			},
		});
		const event = createSubscriptionEvent("customer.subscription.deleted", {
			id: "sub_deleted_fail",
			customer: "cus_deleted_fail",
			status: "canceled",
			items: starterItems,
		});
		stripeMock.webhooks.constructEventAsync.mockResolvedValue(event);

		vi.spyOn(ctx.adapter, "update").mockRejectedValueOnce(
			new Error("database unavailable"),
		);
		const failed = await sendWebhook(auth, event);
		expect(failed.status).toBeGreaterThanOrEqual(400);
		const unchanged = await ctx.adapter.findOne<Subscription>({
			model: "subscription",
			where: [{ field: "id", value: row.id }],
		});
		expect(unchanged?.status).toBe("active");

		const retried = await sendWebhook(auth, event);
		expect(retried.status).toBe(200);
		const saved = await ctx.adapter.findOne<Subscription>({
			model: "subscription",
			where: [{ field: "id", value: row.id }],
		});
		expect(saved?.status).toBe("canceled");
	});

	test("acknowledges the webhook when a lifecycle callback throws after the row is saved", async ({
		memory,
		stripeOptions,
		stripeMock,
	}) => {
		const onEvent = vi.fn();
		const onSubscriptionComplete = vi
			.fn()
			.mockRejectedValue(new Error("welcome email failed"));
		const { auth } = await getTestInstance(
			{
				database: memory,
				plugins: [
					stripe({
						...stripeOptions,
						onEvent,
						subscription: {
							...stripeOptions.subscription,
							onSubscriptionComplete,
						},
					}),
				],
			},
			{ disableTestUser: true },
		);
		const ctx = await auth.$context;
		const user = await ctx.adapter.create({
			model: "user",
			data: { email: "hook-fail@email.com" },
		});
		const row = await ctx.adapter.create<Subscription>({
			model: "subscription",
			data: {
				referenceId: user.id,
				stripeCustomerId: "cus_hook_fail",
				status: "incomplete",
				plan: "starter",
			},
		});
		const event = createCheckoutSessionCompletedEvent({
			subscription: "sub_hook_fail",
			metadata: { referenceId: user.id, subscriptionId: row.id },
		});
		stripeMock.webhooks.constructEventAsync.mockResolvedValue(event);
		stripeMock.subscriptions.retrieve.mockResolvedValue(
			createSubscription({ id: "sub_hook_fail", items: starterItems }),
		);
		const logError = vi.spyOn(ctx.logger, "error");

		const response = await sendWebhook(auth, event);
		expect(response.status).toBe(200);
		expect(onSubscriptionComplete).toHaveBeenCalledTimes(1);
		expect(onEvent).toHaveBeenCalledTimes(1);
		const saved = await ctx.adapter.findOne<Subscription>({
			model: "subscription",
			where: [{ field: "id", value: row.id }],
		});
		expect(saved?.status).toBe("active");
		expect(logError).toHaveBeenCalledWith(
			expect.stringContaining("onSubscriptionComplete failed"),
			expect.any(Error),
		);
	});

	test("a throwing lifecycle callback does not stop the next one", async ({
		memory,
		stripeOptions,
		stripeMock,
	}) => {
		const onSubscriptionCancel = vi
			.fn()
			.mockRejectedValue(new Error("cancel email failed"));
		const onSubscriptionUpdate = vi.fn();
		const { auth } = await getTestInstance(
			{
				database: memory,
				plugins: [
					stripe({
						...stripeOptions,
						subscription: {
							...stripeOptions.subscription,
							onSubscriptionCancel,
							onSubscriptionUpdate,
						},
					}),
				],
			},
			{ disableTestUser: true },
		);
		const ctx = await auth.$context;
		await ctx.adapter.create<Subscription>({
			model: "subscription",
			data: {
				referenceId: "user_hook_chain",
				stripeCustomerId: "cus_hook_chain",
				stripeSubscriptionId: "sub_hook_chain",
				status: "active",
				plan: "starter",
				cancelAtPeriodEnd: false,
			},
		});
		const event = createSubscriptionEvent("customer.subscription.updated", {
			id: "sub_hook_chain",
			customer: "cus_hook_chain",
			status: "active",
			cancel_at_period_end: true,
			items: starterItems,
		});
		stripeMock.webhooks.constructEventAsync.mockResolvedValue(event);

		const response = await sendWebhook(auth, event);
		expect(response.status).toBe(200);
		expect(onSubscriptionCancel).toHaveBeenCalledTimes(1);
		expect(onSubscriptionUpdate).toHaveBeenCalledTimes(1);
	});

	test("acknowledges checkout.session.completed for a one-time payment without calling Stripe", async ({
		memory,
		stripeOptions,
		stripeMock,
	}) => {
		const onEvent = vi.fn();
		const { auth } = await getTestInstance(
			{ database: memory, plugins: [stripe({ ...stripeOptions, onEvent })] },
			{ disableTestUser: true },
		);
		const event = createCheckoutSessionCompletedEvent({
			mode: "payment",
			subscription: null,
		});
		stripeMock.webhooks.constructEventAsync.mockResolvedValue(event);

		const response = await sendWebhook(auth, event);
		expect(response.status).toBe(200);
		expect(stripeMock.subscriptions.retrieve).not.toHaveBeenCalled();
		expect(onEvent).toHaveBeenCalledTimes(1);
	});

	test("acknowledges customer.subscription.updated for a subscription the app does not track", async ({
		memory,
		stripeOptions,
		stripeMock,
	}) => {
		const onEvent = vi.fn();
		const { auth } = await getTestInstance(
			{ database: memory, plugins: [stripe({ ...stripeOptions, onEvent })] },
			{ disableTestUser: true },
		);
		const event = createSubscriptionEvent("customer.subscription.updated", {
			id: "sub_untracked",
			customer: "cus_untracked",
			items: starterItems,
		});
		stripeMock.webhooks.constructEventAsync.mockResolvedValue(event);

		const response = await sendWebhook(auth, event);
		expect(response.status).toBe(200);
		expect(onEvent).toHaveBeenCalledTimes(1);
	});

	test("returns non-2xx for checkout.session.completed when the app has no row for the subscription, without calling hooks", async ({
		memory,
		stripeOptions,
		stripeMock,
	}) => {
		const onEvent = vi.fn();
		const onSubscriptionComplete = vi.fn();
		const onTrialStart = vi.fn();
		const { auth } = await getTestInstance(
			{
				database: memory,
				plugins: [
					stripe({
						...stripeOptions,
						onEvent,
						subscription: {
							...stripeOptions.subscription,
							plans: [
								{
									...stripeOptions.subscription.plans[0]!,
									freeTrial: { days: 14, onTrialStart },
								},
							],
							onSubscriptionComplete,
						},
					}),
				],
			},
			{ disableTestUser: true },
		);
		const ctx = await auth.$context;
		// The placeholder row the checkout points to is gone, so both the update
		// and the fallback lookup find nothing.
		const event = createCheckoutSessionCompletedEvent({
			subscription: "sub_checkout_no_row",
			metadata: { referenceId: "user_no_row", subscriptionId: "sub_row_gone" },
		});
		stripeMock.webhooks.constructEventAsync.mockResolvedValue(event);
		const now = Math.floor(Date.now() / 1000);
		stripeMock.subscriptions.retrieve.mockResolvedValue(
			createSubscription({
				id: "sub_checkout_no_row",
				status: "trialing",
				trial_start: now,
				trial_end: now + 14 * 24 * 60 * 60,
				items: starterItems,
			}),
		);
		const logError = vi.spyOn(ctx.logger, "error");

		const response = await sendWebhook(auth, event);
		expect(response.status).toBeGreaterThanOrEqual(400);
		expect(logError).toHaveBeenCalledWith(
			expect.stringContaining(
				`Subscription sub_row_gone not found for event ${event.id}`,
			),
		);
		expect(onTrialStart).not.toHaveBeenCalled();
		expect(onSubscriptionComplete).not.toHaveBeenCalled();
		expect(onEvent).not.toHaveBeenCalled();
	});

	test("acknowledges customer.subscription.updated without calling hooks when the update finds no row", async ({
		memory,
		stripeOptions,
		stripeMock,
	}) => {
		const onEvent = vi.fn();
		const onSubscriptionUpdate = vi.fn();
		const onSubscriptionCancel = vi.fn();
		const onTrialEnd = vi.fn();
		const { auth } = await getTestInstance(
			{
				database: memory,
				plugins: [
					stripe({
						...stripeOptions,
						onEvent,
						subscription: {
							...stripeOptions.subscription,
							plans: [
								{
									...stripeOptions.subscription.plans[0]!,
									freeTrial: { days: 14, onTrialEnd },
								},
							],
							onSubscriptionUpdate,
							onSubscriptionCancel,
						},
					}),
				],
			},
			{ disableTestUser: true },
		);
		const ctx = await auth.$context;
		await ctx.adapter.create<Subscription>({
			model: "subscription",
			data: {
				referenceId: "user_updated_null",
				stripeCustomerId: "cus_updated_null",
				stripeSubscriptionId: "sub_updated_null",
				status: "trialing",
				plan: "starter",
				cancelAtPeriodEnd: false,
			},
		});
		const event = createSubscriptionEvent("customer.subscription.updated", {
			id: "sub_updated_null",
			customer: "cus_updated_null",
			status: "active",
			cancel_at_period_end: true,
			items: starterItems,
		});
		stripeMock.webhooks.constructEventAsync.mockResolvedValue(event);
		// The row was found, then deleted before the update ran.
		vi.spyOn(ctx.adapter, "update").mockResolvedValueOnce(null);
		const logWarn = vi.spyOn(ctx.logger, "warn");

		const response = await sendWebhook(auth, event);
		expect(response.status).toBe(200);
		expect(onSubscriptionCancel).not.toHaveBeenCalled();
		expect(onSubscriptionUpdate).not.toHaveBeenCalled();
		expect(onTrialEnd).not.toHaveBeenCalled();
		expect(onEvent).toHaveBeenCalledTimes(1);
		expect(logWarn).toHaveBeenCalledWith(
			expect.stringContaining(`update returned no row`),
		);
		expect(logWarn).toHaveBeenCalledWith(expect.stringContaining(event.id));
	});

	test("acknowledges customer.subscription.deleted without calling hooks when the update finds no row", async ({
		memory,
		stripeOptions,
		stripeMock,
	}) => {
		const onEvent = vi.fn();
		const onSubscriptionDeleted = vi.fn();
		const { auth } = await getTestInstance(
			{
				database: memory,
				plugins: [
					stripe({
						...stripeOptions,
						onEvent,
						subscription: {
							...stripeOptions.subscription,
							onSubscriptionDeleted,
						},
					}),
				],
			},
			{ disableTestUser: true },
		);
		const ctx = await auth.$context;
		await ctx.adapter.create<Subscription>({
			model: "subscription",
			data: {
				referenceId: "user_deleted_null",
				stripeCustomerId: "cus_deleted_null",
				stripeSubscriptionId: "sub_deleted_null",
				status: "active",
				plan: "starter",
			},
		});
		const event = createSubscriptionEvent("customer.subscription.deleted", {
			id: "sub_deleted_null",
			customer: "cus_deleted_null",
			status: "canceled",
			items: starterItems,
		});
		stripeMock.webhooks.constructEventAsync.mockResolvedValue(event);
		vi.spyOn(ctx.adapter, "update").mockResolvedValueOnce(null);
		const logWarn = vi.spyOn(ctx.logger, "warn");

		const response = await sendWebhook(auth, event);
		expect(response.status).toBe(200);
		expect(onSubscriptionDeleted).not.toHaveBeenCalled();
		expect(onEvent).toHaveBeenCalledTimes(1);
		expect(logWarn).toHaveBeenCalledWith(expect.stringContaining(event.id));
	});

	test("acknowledges checkout.session.completed and saves the row when onTrialStart throws", async ({
		memory,
		stripeOptions,
		stripeMock,
	}) => {
		const onEvent = vi.fn();
		const onSubscriptionComplete = vi.fn();
		const onTrialStart = vi
			.fn()
			.mockRejectedValue(new Error("trial email failed"));
		const { auth } = await getTestInstance(
			{
				database: memory,
				plugins: [
					stripe({
						...stripeOptions,
						onEvent,
						subscription: {
							...stripeOptions.subscription,
							plans: [
								{
									...stripeOptions.subscription.plans[0]!,
									freeTrial: { days: 14, onTrialStart },
								},
							],
							onSubscriptionComplete,
						},
					}),
				],
			},
			{ disableTestUser: true },
		);
		const ctx = await auth.$context;
		const user = await ctx.adapter.create({
			model: "user",
			data: { email: "trial-start-fail@email.com" },
		});
		const row = await ctx.adapter.create<Subscription>({
			model: "subscription",
			data: {
				referenceId: user.id,
				stripeCustomerId: "cus_trial_start_fail",
				status: "incomplete",
				plan: "starter",
			},
		});
		const event = createCheckoutSessionCompletedEvent({
			subscription: "sub_trial_start_fail",
			metadata: { referenceId: user.id, subscriptionId: row.id },
		});
		stripeMock.webhooks.constructEventAsync.mockResolvedValue(event);
		const now = Math.floor(Date.now() / 1000);
		stripeMock.subscriptions.retrieve.mockResolvedValue(
			createSubscription({
				id: "sub_trial_start_fail",
				status: "trialing",
				trial_start: now,
				trial_end: now + 14 * 24 * 60 * 60,
				items: starterItems,
			}),
		);
		const logError = vi.spyOn(ctx.logger, "error");

		const response = await sendWebhook(auth, event);
		expect(response.status).toBe(200);
		expect(onTrialStart).toHaveBeenCalledTimes(1);
		expect(onTrialStart).toHaveBeenCalledWith(
			expect.objectContaining({ id: row.id, status: "trialing" }),
		);
		expect(onSubscriptionComplete).toHaveBeenCalledTimes(1);
		expect(onEvent).toHaveBeenCalledTimes(1);
		const saved = await ctx.adapter.findOne<Subscription>({
			model: "subscription",
			where: [{ field: "id", value: row.id }],
		});
		expect(saved).toMatchObject({
			status: "trialing",
			stripeSubscriptionId: "sub_trial_start_fail",
		});
		expect(saved?.trialStart).toBeInstanceOf(Date);
		expect(logError).toHaveBeenCalledWith(
			expect.stringContaining("onTrialStart failed"),
			expect.any(Error),
		);
	});

	for (const { hook, status } of [
		{ hook: "onTrialEnd", status: "active" },
		{ hook: "onTrialExpired", status: "incomplete_expired" },
	] as const) {
		test(`acknowledges customer.subscription.updated and saves the row when ${hook} throws`, async ({
			memory,
			stripeOptions,
			stripeMock,
		}) => {
			const onEvent = vi.fn();
			const onSubscriptionUpdate = vi.fn();
			const trialHook = vi
				.fn()
				.mockRejectedValue(new Error(`${hook} callback failed`));
			const { auth } = await getTestInstance(
				{
					database: memory,
					plugins: [
						stripe({
							...stripeOptions,
							onEvent,
							subscription: {
								...stripeOptions.subscription,
								plans: [
									{
										...stripeOptions.subscription.plans[0]!,
										freeTrial: { days: 14, [hook]: trialHook },
									},
								],
								onSubscriptionUpdate,
							},
						}),
					],
				},
				{ disableTestUser: true },
			);
			const ctx = await auth.$context;
			const row = await ctx.adapter.create<Subscription>({
				model: "subscription",
				data: {
					referenceId: `user_${hook}_fail`,
					stripeCustomerId: `cus_${hook}_fail`,
					stripeSubscriptionId: `sub_${hook}_fail`,
					status: "trialing",
					plan: "starter",
				},
			});
			const event = createSubscriptionEvent("customer.subscription.updated", {
				id: `sub_${hook}_fail`,
				customer: `cus_${hook}_fail`,
				status,
				items: starterItems,
			});
			stripeMock.webhooks.constructEventAsync.mockResolvedValue(event);
			const logError = vi.spyOn(ctx.logger, "error");

			const response = await sendWebhook(auth, event);
			expect(response.status).toBe(200);
			expect(trialHook).toHaveBeenCalledTimes(1);
			expect(onSubscriptionUpdate).toHaveBeenCalledTimes(1);
			expect(onEvent).toHaveBeenCalledTimes(1);
			const saved = await ctx.adapter.findOne<Subscription>({
				model: "subscription",
				where: [{ field: "id", value: row.id }],
			});
			expect(saved?.status).toBe(status);
			expect(logError).toHaveBeenCalledWith(
				expect.stringContaining(`${hook} failed`),
				expect.any(Error),
			);
		});
	}

	async function setupCheckoutWithRetrieveError(
		{
			memory,
			stripeOptions,
			stripeMock,
		}: {
			memory: ReturnType<typeof memoryAdapter>;
			stripeOptions: StripeOptions & {
				subscription: { enabled: true; plans: StripePlan[] };
			};
			stripeMock: StripeMock;
		},
		error: unknown,
		eventOverrides: Partial<Stripe.Event> = {},
	) {
		const onEvent = vi.fn();
		const onSubscriptionComplete = vi.fn();
		const onTrialStart = vi.fn();
		const { auth } = await getTestInstance(
			{
				database: memory,
				plugins: [
					stripe({
						...stripeOptions,
						onEvent,
						subscription: {
							...stripeOptions.subscription,
							plans: [
								{
									...stripeOptions.subscription.plans[0]!,
									freeTrial: { days: 14, onTrialStart },
								},
							],
							onSubscriptionComplete,
						},
					}),
				],
			},
			{ disableTestUser: true },
		);
		const ctx = await auth.$context;
		const row = await ctx.adapter.create<Subscription>({
			model: "subscription",
			data: {
				referenceId: "user_retrieve_error",
				stripeCustomerId: "cus_retrieve_error",
				status: "incomplete",
				plan: "starter",
			},
		});
		const event = {
			...createCheckoutSessionCompletedEvent({
				subscription: "sub_retrieve_error",
				metadata: {
					referenceId: "user_retrieve_error",
					subscriptionId: row.id,
				},
			}),
			...eventOverrides,
		} as Stripe.Event;
		stripeMock.webhooks.constructEventAsync.mockResolvedValue(event);
		stripeMock.subscriptions.retrieve.mockRejectedValue(error);
		const logWarn = vi.spyOn(ctx.logger, "warn");
		const logError = vi.spyOn(ctx.logger, "error");
		const response = await sendWebhook(auth, event);
		const saved = await ctx.adapter.findOne<Subscription>({
			model: "subscription",
			where: [{ field: "id", value: row.id }],
		});
		return {
			response,
			event,
			saved,
			logWarn,
			logError,
			onEvent,
			onSubscriptionComplete,
			onTrialStart,
		};
	}

	test("acknowledges checkout.session.completed without hooks when Stripe rejects the request as invalid", async ({
		memory,
		stripeOptions,
		stripeMock,
	}) => {
		const result = await setupCheckoutWithRetrieveError(
			{ memory, stripeOptions, stripeMock },
			new Stripe.errors.StripeInvalidRequestError({
				statusCode: 400,
				code: "parameter_invalid_empty",
				message: "Invalid request",
			}),
		);
		expect(result.response.status).toBe(200);
		expect(result.onSubscriptionComplete).not.toHaveBeenCalled();
		expect(result.onTrialStart).not.toHaveBeenCalled();
		expect(result.onEvent).toHaveBeenCalledTimes(1);
		expect(result.saved?.status).toBe("incomplete");
		expect(result.logWarn).toHaveBeenCalledWith(
			expect.stringContaining(
				`subscriptions.retrieve failed for event ${result.event.id} (checkout.session.completed, test mode) with StripeInvalidRequestError 400 (parameter_invalid_empty)`,
			),
		);
		expect(result.logWarn).toHaveBeenCalledWith(
			expect.stringContaining("Stripe won't retry because of this error"),
		);
	});

	test("returns non-2xx and logs the account and mode when Stripe returns a 404 for a Connect event", async ({
		memory,
		stripeOptions,
		stripeMock,
	}) => {
		const result = await setupCheckoutWithRetrieveError(
			{ memory, stripeOptions, stripeMock },
			new Stripe.errors.StripeInvalidRequestError({
				statusCode: 404,
				code: "resource_missing",
				message: "No such subscription: 'sub_retrieve_error'",
			}),
			{ account: "acct_connected", livemode: true },
		);
		expect(result.response.status).toBeGreaterThanOrEqual(400);
		expect(result.onSubscriptionComplete).not.toHaveBeenCalled();
		expect(result.onEvent).not.toHaveBeenCalled();
		expect(result.saved?.status).toBe("incomplete");
		expect(result.logError).toHaveBeenCalledWith(
			expect.stringContaining(
				`subscriptions.retrieve failed for event ${result.event.id} (checkout.session.completed, live mode, account acct_connected) with StripeInvalidRequestError 404 (resource_missing)`,
			),
		);
	});

	for (const { name, error } of [
		{
			name: "a 500 from Stripe",
			error: new Stripe.errors.StripeAPIError({
				statusCode: 500,
				message: "Internal error",
			}),
		},
		{
			name: "a 429 rate limit",
			error: new Stripe.errors.StripeRateLimitError({
				statusCode: 429,
				code: "rate_limit",
				message: "Too many requests",
			}),
		},
		{
			name: "a rate limit reported as a 400",
			error: new Stripe.errors.StripeRateLimitError({
				statusCode: 400,
				code: "rate_limit",
				message: "Too many requests",
			}),
		},
		{
			name: "a 404 for a missing object",
			error: new Stripe.errors.StripeInvalidRequestError({
				statusCode: 404,
				code: "resource_missing",
				message: "No such subscription: 'sub_retrieve_error'",
			}),
		},
		{
			name: "a 403 for a missing permission",
			error: new Stripe.errors.StripePermissionError({
				statusCode: 403,
				message: "The provided key does not have access to this resource",
			}),
		},
		{
			name: "a 401 for an invalid API key",
			error: new Stripe.errors.StripeAuthenticationError({
				statusCode: 401,
				message: "Invalid API Key provided",
			}),
		},
		{
			name: "a connection error",
			error: new Stripe.errors.StripeConnectionError({
				message: "An error occurred with our connection to Stripe",
			}),
		},
		{
			name: "an error that doesn't come from Stripe",
			error: new Error("socket hang up"),
		},
	]) {
		test(`returns non-2xx for checkout.session.completed when Stripe fails with ${name}`, async ({
			memory,
			stripeOptions,
			stripeMock,
		}) => {
			const result = await setupCheckoutWithRetrieveError(
				{ memory, stripeOptions, stripeMock },
				error,
			);
			expect(result.response.status).toBeGreaterThanOrEqual(400);
			expect(result.onSubscriptionComplete).not.toHaveBeenCalled();
			expect(result.onTrialStart).not.toHaveBeenCalled();
			expect(result.onEvent).not.toHaveBeenCalled();
			expect(result.saved?.status).toBe("incomplete");
		});
	}
});
