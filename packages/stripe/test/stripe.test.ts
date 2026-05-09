import { getTestInstance } from "better-auth/test";
import type Stripe from "stripe";
import { assert, describe, expect, vi } from "vitest";
import { stripe } from "../src";
import { stripeClient } from "../src/client";
import type { StripeOptions, Subscription } from "../src/types";
import { test } from "./_fixtures";

describe("stripe", () => {
	const testUser = {
		email: "test@email.com",
		password: "password",
		name: "Test User",
	};

	test("should create a subscription", async ({
		stripeMock,
		memory,
		stripeOptions,
	}) => {
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

	test("should not allow cross-user subscriptionId operations (upgrade/cancel/restore)", async ({
		stripeMock,
		memory,
		stripeOptions,
	}) => {
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

		stripeMock.checkout.sessions.create.mockClear();
		stripeMock.billingPortal.sessions.create.mockClear();
		stripeMock.subscriptions.list.mockClear();
		stripeMock.subscriptions.update.mockClear();
		stripeMock.subscriptionSchedules.list.mockClear();

		const upgradeRes = await client.subscription.upgrade({
			plan: "premium",
			subscriptionId: userASub!.id,
			fetchOptions: { headers: userBHeaders },
		});
		expect(upgradeRes.error?.message).toContain("Subscription not found");
		expect(stripeMock.checkout.sessions.create).not.toHaveBeenCalled();
		expect(stripeMock.billingPortal.sessions.create).not.toHaveBeenCalled();

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
		expect(stripeMock.billingPortal.sessions.create).not.toHaveBeenCalled();

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
		expect(stripeMock.subscriptions.update).not.toHaveBeenCalled();
	});

	test("should pass metadata to subscription when upgrading", async ({
		stripeMock,
		memory,
		stripeOptions,
	}) => {
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

		expect(stripeMock.checkout.sessions.create).toHaveBeenCalledWith(
			expect.objectContaining({
				subscription_data: expect.objectContaining({
					metadata: expect.objectContaining(customMetadata),
				}),
				metadata: expect.objectContaining(customMetadata),
			}),
			undefined,
		);
	});

	test("should list active subscriptions", async ({
		stripeMock,
		memory,
		stripeOptions,
	}) => {
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

	/**
	 * @see https://github.com/better-auth/better-auth/issues/7721
	 */
	test("should return annualDiscountPriceId when subscription billingInterval is year", async ({
		stripeMock,
		memory,
		stripeOptions,
	}) => {
		const annualPriceId = "price_annual_starter";
		const monthlyPriceId = "price_monthly_starter";
		const optionsWithAnnual = {
			...stripeOptions,
			subscription: {
				enabled: true,
				plans: [
					{
						priceId: monthlyPriceId,
						annualDiscountPriceId: annualPriceId,
						name: "starter",
					},
					{
						priceId: process.env.STRIPE_PRICE_ID_2!,
						name: "premium",
					},
				],
			},
		} satisfies StripeOptions;

		const { client, auth, sessionSetter } = await getTestInstance(
			{
				database: memory,
				plugins: [stripe(optionsWithAnnual)],
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
				email: "annual-test@email.com",
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
				email: "annual-test@email.com",
			},
			{
				throw: true,
				onSuccess: sessionSetter(headers),
			},
		);

		await client.subscription.upgrade({
			plan: "starter",
			fetchOptions: {
				headers,
			},
		});

		// Simulate an active annual subscription
		await ctx.adapter.update({
			model: "subscription",
			update: {
				status: "active",
				billingInterval: "year",
			},
			where: [
				{
					field: "referenceId",
					value: userId,
				},
			],
		});

		const listRes = await client.subscription.list({
			fetchOptions: {
				headers,
			},
		});

		expect(listRes.data?.length).toBeGreaterThan(0);
		expect(listRes.data?.[0]?.priceId).toBe(annualPriceId);

		// Verify monthly subscription returns monthly priceId
		await ctx.adapter.update({
			model: "subscription",
			update: {
				billingInterval: "month",
			},
			where: [
				{
					field: "referenceId",
					value: userId,
				},
			],
		});

		const monthlyListRes = await client.subscription.list({
			fetchOptions: {
				headers,
			},
		});

		expect(monthlyListRes.data?.[0]?.priceId).toBe(monthlyPriceId);
	});

	test("should handle subscription webhook events", async ({
		stripeMock,
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

	test("should handle subscription webhook events with trial", async ({
		stripeMock,
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

	test("should handle subscription deletion webhook", async ({
		stripeMock,
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
		stripeMock,
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
									id: process.env.STRIPE_PRICE_ID_1,
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
		expect(subscription?.billingInterval).toBe("year");
	});

	test("should store billingInterval as year for annual subscriptions", async ({
		stripeMock,
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
									id: process.env.STRIPE_PRICE_ID_1,
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

		// Verify subscription was created with annual billing interval
		const subscription = await testCtx.adapter.findOne<Subscription>({
			model: "subscription",
			where: [{ field: "stripeSubscriptionId", value: "sub_annual_created" }],
		});

		expect(subscription).toBeDefined();
		expect(subscription?.referenceId).toBe(userWithCustomerId.id);
		expect(subscription?.billingInterval).toBe("year");
	});

	test("should return billingInterval in subscription.list() response", async ({
		stripeMock,
		memory,
		stripeOptions,
	}) => {
		const {
			client,
			auth: testAuth,
			sessionSetter,
		} = await getTestInstance(
			{ database: memory, plugins: [stripe(stripeOptions)] },
			{
				disableTestUser: true,
				clientOptions: { plugins: [stripeClient({ subscription: true })] },
			},
		);

		const testCtx = await testAuth.$context;

		const headers = new Headers();
		const userRes = await client.signUp.email(
			{
				email: "billing-interval-test@example.com",
				password: "password",
				name: "Test",
			},
			{ throw: true, onSuccess: sessionSetter(headers) },
		);
		await testCtx.adapter.create({
			model: "subscription",
			data: {
				referenceId: userRes.user.id,
				stripeCustomerId: "cus_1",
				stripeSubscriptionId: "sub_1",
				status: "active",
				plan: "starter",
				billingInterval: "year",
			},
		});

		const result = await client.subscription.list({
			fetchOptions: { headers, throw: true },
		});

		expect(result[0]?.billingInterval).toBe("year");
	});

	test("should not create duplicate subscription if already exists", async ({
		stripeMock,
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

	test("should skip subscription creation when user not found", async ({
		stripeMock,
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

	test("should skip subscription creation when plan not found", async ({
		stripeMock,
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

	test("should skip creating subscription when metadata.subscriptionId exists", async ({
		stripeMock,
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

	test("should execute subscription event handlers", async ({
		stripeMock,
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

	test("should return updated subscription in onSubscriptionUpdate callback", async ({
		stripeMock,
		memory,
		stripeOptions,
	}) => {
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

	test("should sync stripeScheduleId from webhook when schedule is present", async ({
		stripeMock,
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
								price: { id: process.env.STRIPE_PRICE_ID_1 },
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
		stripeMock,
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
								price: { id: process.env.STRIPE_PRICE_ID_1 },
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
		stripeMock,
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

	test("should allow seat upgrades for the same plan", async ({
		stripeMock,
		memory,
		stripeOptions,
	}) => {
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

	test("should prevent duplicate subscriptions with same plan and same seats", async ({
		stripeMock,
		memory,
		stripeOptions,
	}) => {
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
		stripeMock.subscriptions.list.mockResolvedValue({
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

	test("should allow upgrade from monthly to annual billing for the same plan", async ({
		stripeMock,
		memory,
		stripeOptions,
	}) => {
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

		stripeMock.subscriptions.list.mockResolvedValue({
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
		stripeMock.checkout.sessions.create.mockClear();
		stripeMock.billingPortal.sessions.create.mockClear();

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
		expect(stripeMock.billingPortal.sessions.create).toHaveBeenCalledWith(
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
		expect(stripeMock.checkout.sessions.create).not.toHaveBeenCalled();
		expect(stripeMock.billingPortal.sessions.create).toHaveBeenCalled();
	});

	test.for([
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
	}, { stripeMock, memory, stripeOptions }) => {
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
		stripeMock.subscriptions.list.mockResolvedValue({
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

	test("should create billing portal session", async ({
		stripeMock,
		memory,
		stripeOptions,
	}) => {
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
		expect(stripeMock.billingPortal.sessions.create).toHaveBeenCalledWith({
			customer: expect.any(String),
			return_url: "http://localhost:3000/dashboard",
		});
	});

	test("should create billing portal session for an existing custom referenceId", async ({
		stripeMock,
		memory,
		stripeOptions,
	}) => {
		// cspell:disable-next-line -- random test workspace ID
		const customReferenceId = "workspace_b67GF32Cljh7u588AuEblmLVobclDRcP";

		const testOptions = {
			...stripeOptions,
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

		const userRes = await testClient.signUp.email(
			{ ...testUser, email: "custom-ref-billing-portal@email.com" },
			{ throw: true },
		);
		const headers = new Headers();
		await testClient.signIn.email(
			{ ...testUser, email: "custom-ref-billing-portal@email.com" },
			{ throw: true, onSuccess: testSessionSetter(headers) },
		);

		await testCtx.adapter.update({
			model: "user",
			update: { stripeCustomerId: null },
			where: [{ field: "id", value: userRes.user.id }],
		});
		await testCtx.adapter.create<Subscription>({
			model: "subscription",
			data: {
				referenceId: customReferenceId,
				stripeCustomerId: "cus_custom_reference",
				status: "active",
				plan: "starter",
			},
		});

		stripeMock.billingPortal.sessions.create.mockClear();

		const billingPortalRes = await testClient.subscription.billingPortal({
			referenceId: customReferenceId,
			returnUrl: "/dashboard",
			fetchOptions: {
				headers,
			},
		});

		expect(billingPortalRes.error).toBeNull();
		expect(billingPortalRes.data?.url).toBe("https://billing.stripe.com/mock");
		expect(stripeMock.billingPortal.sessions.create).toHaveBeenCalledWith({
			customer: "cus_custom_reference",
			return_url: "http://localhost:3000/dashboard",
		});
	});

	test("should not update personal subscription when upgrading with a custom referenceId", async ({
		stripeMock,
		memory,
		stripeOptions,
	}) => {
		// cspell:disable-next-line -- random test workspace ID
		const customReferenceId = "workspace_b67GF32Cljh7u588AuEblmLVobclDRcP";

		const testOptions = {
			...stripeOptions,
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

		stripeMock.subscriptions.list.mockResolvedValue({
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

		// Attempt to upgrade using a custom referenceId
		const upgradeRes = await testClient.subscription.upgrade({
			plan: "starter",
			referenceId: customReferenceId,
			fetchOptions: { headers },
		});
		// It should NOT go through billing portal (which would update the personal sub)
		expect(stripeMock.billingPortal.sessions.create).not.toHaveBeenCalled();
		expect(upgradeRes.data?.url).toBeDefined();

		const orgSub = await testCtx.adapter.findOne<Subscription>({
			model: "subscription",
			where: [{ field: "referenceId", value: customReferenceId }],
		});
		expect(orgSub).toMatchObject({
			referenceId: customReferenceId,
			status: "incomplete",
			plan: "starter",
		});

		const personalAfter = await testCtx.adapter.findOne<Subscription>({
			model: "subscription",
			where: [{ field: "id", value: personalSub!.id }],
		});
		expect(personalAfter?.status).toBe("active");
	});

	test("should prevent multiple free trials for the same user", async ({
		stripeMock,
		memory,
		stripeOptions,
	}) => {
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

	test("should upgrade existing subscription instead of creating new one", async ({
		stripeMock,
		memory,
		stripeOptions,
	}) => {
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
		stripeMock.customers.search.mockResolvedValueOnce({
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
		stripeMock.subscriptions.list.mockResolvedValueOnce({
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
		stripeMock.checkout.sessions.create.mockClear();
		stripeMock.billingPortal.sessions.create.mockClear();

		// Now upgrade to premium plan - should use billing portal to update existing subscription
		const upgradeRes = await client.subscription.upgrade({
			plan: "premium",
			fetchOptions: { headers },
		});

		// Verify that billing portal was called (indicating update, not new subscription)
		expect(stripeMock.billingPortal.sessions.create).toHaveBeenCalledWith(
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
		expect(stripeMock.checkout.sessions.create).not.toHaveBeenCalled();

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

	test("should prevent multiple free trials across different plans", async ({
		stripeMock,
		memory,
		stripeOptions,
	}) => {
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

	describe("Webhook Error Handling (Stripe v19)", () => {
		test("should handle invalid webhook signature with constructEventAsync", async ({
			stripeMock,
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
			stripeMock,
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
			stripeMock,
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

		test("should handle async errors in webhook event processing", async ({
			stripeMock,
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
			// Errors inside event handlers are caught and logged but don't fail the webhook
			// This prevents Stripe from retrying and is the expected behavior
			expect(response.status).toBe(200);
			const data = await response.json();
			expect(data).toEqual({ success: true });
			// Verify the error was logged (via the stripeClient.subscriptions.retrieve rejection)
			expect(stripeForTest.subscriptions.retrieve).toHaveBeenCalled();
		});

		test("should successfully process webhook with valid async signature verification", async ({
			stripeMock,
			memory,
			stripeOptions,
		}) => {
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

		test("should call constructEventAsync with exactly 3 required parameters", async ({
			stripeMock,
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
			stripeMock,
			memory,
			stripeOptions,
		}) => {
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

	test("should support flexible limits types", async ({
		stripeMock,
		memory,
		stripeOptions,
	}) => {
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

	describe("webhook: cancel_at_period_end cancellation", () => {
		test("should sync cancelAtPeriodEnd and canceledAt when user cancels via Billing Portal (at_period_end mode)", async ({
			stripeMock,
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
			stripeMock,
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
			stripeMock,
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
			} as unknown as StripeOptions;

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
			stripeMock,
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
			} as unknown as StripeOptions;

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
			stripeMock,
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
			stripeMock,
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

	/**
	 * @see https://github.com/better-auth/better-auth/issues/6863
	 */
	describe("trial abuse prevention", () => {
		test("should check all subscriptions for trial history even when processing a specific incomplete subscription", async ({
			stripeMock,
			memory,
			stripeOptions,
		}) => {
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
			const callArgs = stripeMock.checkout.sessions.create.mock.lastCall?.[0];
			expect(callArgs?.subscription_data?.trial_period_days).toBeUndefined();
		});

		test("should propagate trial data from Stripe event on subscription.deleted", async ({
			stripeMock,
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
				data: { email: "trial-deleted-propagate@test.com" },
			});

			const now = Math.floor(Date.now() / 1000);
			const trialStart = now - 3 * 24 * 60 * 60; // 3 days ago
			const trialEnd = now + 4 * 24 * 60 * 60; // 4 days from now

			// Create subscription WITHOUT trial data (simulates checkout.session.completed webhook failure)
			const { id: subscriptionId } = await ctx.adapter.create({
				model: "subscription",
				data: {
					referenceId: userId,
					stripeCustomerId: "cus_trial_deleted_propagate",
					stripeSubscriptionId: "sub_trial_deleted_propagate",
					status: "trialing",
					plan: "starter",
					// Note: no trialStart/trialEnd set (simulating missed checkout webhook)
				},
			});

			// customer.subscription.deleted fires with trial data from Stripe
			const webhookEvent = {
				type: "customer.subscription.deleted",
				data: {
					object: {
						id: "sub_trial_deleted_propagate",
						customer: "cus_trial_deleted_propagate",
						status: "canceled",
						trial_start: trialStart,
						trial_end: trialEnd,
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
			// Trial data should be propagated from the Stripe event
			expect(updatedSub!.trialStart).not.toBeNull();
			expect(updatedSub!.trialEnd).not.toBeNull();
			expect(updatedSub!.trialStart!.getTime()).toBe(trialStart * 1000);
			expect(updatedSub!.trialEnd!.getTime()).toBe(trialEnd * 1000);
		});

		test("should propagate trial data from Stripe event on subscription.updated", async ({
			stripeMock,
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
				data: { email: "trial-updated-propagate@test.com" },
			});

			const now = Math.floor(Date.now() / 1000);
			const trialStart = now - 7 * 24 * 60 * 60; // 7 days ago
			const trialEnd = now; // Trial just ended
			const periodEnd = now + 30 * 24 * 60 * 60; // 30 days from now

			// Create subscription WITHOUT trial data (simulates checkout.session.completed webhook failure)
			const { id: subscriptionId } = await ctx.adapter.create({
				model: "subscription",
				data: {
					referenceId: userId,
					stripeCustomerId: "cus_trial_updated_propagate",
					stripeSubscriptionId: "sub_trial_updated_propagate",
					status: "trialing",
					plan: "starter",
					// Note: no trialStart/trialEnd set
				},
			});

			// customer.subscription.updated fires when trial ends (status: trialing → active)
			const webhookEvent = {
				type: "customer.subscription.updated",
				data: {
					object: {
						id: "sub_trial_updated_propagate",
						customer: "cus_trial_updated_propagate",
						status: "active",
						trial_start: trialStart,
						trial_end: trialEnd,
						cancel_at_period_end: false,
						cancel_at: null,
						canceled_at: null,
						ended_at: null,
						metadata: {
							subscriptionId,
						},
						items: {
							data: [
								{
									id: "si_test_item",
									price: { id: process.env.STRIPE_PRICE_ID_1 },
									quantity: 1,
									current_period_start: now,
									current_period_end: periodEnd,
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

			expect(updatedSub).not.toBeNull();
			expect(updatedSub!.status).toBe("active");
			// Trial data should be propagated from the Stripe event
			expect(updatedSub!.trialStart).not.toBeNull();
			expect(updatedSub!.trialEnd).not.toBeNull();
			expect(updatedSub!.trialStart!.getTime()).toBe(trialStart * 1000);
			expect(updatedSub!.trialEnd!.getTime()).toBe(trialEnd * 1000);
		});

		test("should prevent trial abuse after subscription canceled during trial", async ({
			stripeMock,
			memory,
			stripeOptions,
		}) => {
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
				{ ...testUser, email: "trial-abuse-cancel@email.com" },
				{ throw: true },
			);

			const headers = new Headers();
			await client.signIn.email(
				{ ...testUser, email: "trial-abuse-cancel@email.com" },
				{ throw: true, onSuccess: sessionSetter(headers) },
			);

			const now = Math.floor(Date.now() / 1000);
			const trialStart = now - 3 * 24 * 60 * 60;
			const trialEnd = now + 4 * 24 * 60 * 60;

			// Step 1: Create a subscription that was trialing (simulates checkout completed
			// but trial data was NOT set in DB due to webhook failure)
			await ctx.adapter.create({
				model: "subscription",
				data: {
					referenceId: userRes.user.id,
					stripeCustomerId: "cus_trial_abuse",
					stripeSubscriptionId: "sub_trial_abuse_old",
					status: "canceled",
					plan: "starter",
					// No trialStart/trialEnd — simulates the scenario where
					// onCheckoutSessionCompleted failed to set trial data
				},
			});

			// Step 2: Simulate customer.subscription.deleted with trial data from Stripe
			const deleteEvent = {
				type: "customer.subscription.deleted" as const,
				data: {
					object: {
						id: "sub_trial_abuse_old",
						customer: "cus_trial_abuse",
						status: "canceled" as const,
						trial_start: trialStart,
						trial_end: trialEnd,
						cancel_at_period_end: false,
						cancel_at: null,
						canceled_at: now,
						ended_at: now,
					},
				},
			};

			const stripeForWebhook = {
				...stripeOptions.stripeClient,
				webhooks: {
					constructEventAsync: vi.fn().mockResolvedValue(deleteEvent),
				},
			};

			const webhookOptions = {
				...stripeOptions,
				stripeClient: stripeForWebhook as unknown as Stripe,
				stripeWebhookSecret: "test_secret",
				subscription: {
					...stripeOptions.subscription,
					plans: stripeOptions.subscription.plans.map((plan) => ({
						...plan,
						freeTrial: { days: 7 },
					})),
				},
			};

			const { auth: webhookAuth } = await getTestInstance(
				{
					database: memory,
					plugins: [stripe(webhookOptions)],
				},
				{ disableTestUser: true },
			);

			await webhookAuth.handler(
				new Request("http://localhost:3000/api/auth/stripe/webhook", {
					method: "POST",
					headers: { "stripe-signature": "test_signature" },
					body: JSON.stringify(deleteEvent),
				}),
			);

			// Step 3: User tries to subscribe again — should NOT get a trial
			const upgradeRes = await client.subscription.upgrade({
				plan: "starter",
				fetchOptions: { headers },
			});

			expect(upgradeRes.data?.url).toBeDefined();

			// Verify no trial was granted (trial_period_days should be absent)
			const callArgs = stripeMock.checkout.sessions.create.mock.lastCall?.[0];
			expect(callArgs?.subscription_data?.trial_period_days).toBeUndefined();
		});
	});

	describe("restore subscription", () => {
		test("should clear cancelAtPeriodEnd when restoring a cancel_at_period_end subscription", async ({
			stripeMock,
			memory,
			stripeOptions,
		}) => {
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

			stripeMock.subscriptions.list.mockResolvedValueOnce({
				data: [
					{
						id: "sub_restore_period_end",
						status: "active",
						cancel_at_period_end: true,
						cancel_at: null,
					},
				],
			});

			stripeMock.subscriptions.update.mockResolvedValueOnce({
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
			expect(stripeMock.subscriptions.update).toHaveBeenCalledWith(
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

		test("should clear cancelAt when restoring a cancel_at (specific date) subscription", async ({
			stripeMock,
			memory,
			stripeOptions,
		}) => {
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

			stripeMock.subscriptions.list.mockResolvedValueOnce({
				data: [
					{
						id: "sub_restore_cancel_at",
						status: "active",
						cancel_at_period_end: false,
						cancel_at: Math.floor(cancelAt.getTime() / 1000),
					},
				],
			});

			stripeMock.subscriptions.update.mockResolvedValueOnce({
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
			expect(stripeMock.subscriptions.update).toHaveBeenCalledWith(
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

		test("should release schedule and clear stripeScheduleId when restoring a pending schedule", async ({
			stripeMock,
			memory,
			stripeOptions,
		}) => {
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

			const userRes = await client.signUp.email(
				{
					email: "restore-schedule@test.com",
					password: "password",
					name: "Test",
				},
				{ throw: true },
			);

			const headers = new Headers();
			await client.signIn.email(
				{ email: "restore-schedule@test.com", password: "password" },
				{ throw: true, onSuccess: sessionSetter(headers) },
			);

			await ctx.adapter.create({
				model: "subscription",
				data: {
					referenceId: userRes.user.id,
					stripeCustomerId: "cus_restore_schedule",
					stripeSubscriptionId: "sub_restore_schedule",
					status: "active",
					plan: "premium",
					stripeScheduleId: "sub_schedule_pending",
				},
			});

			stripeMock.subscriptions.retrieve.mockResolvedValueOnce({
				id: "sub_restore_schedule",
				status: "active",
			});

			const restoreRes = await client.subscription.restore({
				fetchOptions: { headers },
			});

			expect(restoreRes.data).toBeDefined();

			// Should release the schedule
			expect(stripeMock.subscriptionSchedules.release).toHaveBeenCalledWith(
				"sub_schedule_pending",
			);

			// Should NOT call subscriptions.update (that's for cancel restore)
			expect(stripeMock.subscriptions.update).not.toHaveBeenCalled();

			// DB should have stripeScheduleId cleared
			const updatedSub = await ctx.adapter.findOne<Subscription>({
				model: "subscription",
				where: [{ field: "referenceId", value: userRes.user.id }],
			});
			expect(updatedSub?.stripeScheduleId).toBeNull();
		});

		test("should reject restore when no pending cancel and no pending schedule", async ({
			stripeMock,
			memory,
			stripeOptions,
		}) => {
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

			const userRes = await client.signUp.email(
				{
					email: "restore-noop@test.com",
					password: "password",
					name: "Test",
				},
				{ throw: true },
			);

			const headers = new Headers();
			await client.signIn.email(
				{ email: "restore-noop@test.com", password: "password" },
				{ throw: true, onSuccess: sessionSetter(headers) },
			);

			await ctx.adapter.create({
				model: "subscription",
				data: {
					referenceId: userRes.user.id,
					stripeCustomerId: "cus_restore_noop",
					stripeSubscriptionId: "sub_restore_noop",
					status: "active",
					plan: "starter",
				},
			});

			const restoreRes = await client.subscription.restore({
				fetchOptions: { headers },
			});

			expect(restoreRes.error?.status).toBe(400);
		});
	});

	describe("cancel subscription fallback (missed webhook)", () => {
		test("should sync from Stripe when cancel request fails because subscription is already canceled", async ({
			stripeMock,
			memory,
			stripeOptions,
		}) => {
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
			stripeMock.subscriptions.list.mockResolvedValueOnce({
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
			stripeMock.billingPortal.sessions.create.mockRejectedValueOnce(
				new Error("This subscription is already set to be canceled"),
			);

			// When fallback kicks in, it retrieves from Stripe
			stripeMock.subscriptions.retrieve.mockResolvedValueOnce({
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

	test("should upgrade existing active subscription even when canceled subscription exists for same referenceId", async ({
		stripeMock,
		memory,
		stripeOptions,
	}) => {
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
		stripeMock.subscriptions.list.mockResolvedValueOnce({
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
		expect(stripeMock.billingPortal.sessions.create).toHaveBeenCalled();
		expect(stripeMock.checkout.sessions.create).not.toHaveBeenCalled();
	});

	test("should schedule plan change at period end when scheduleAtPeriodEnd is true", async ({
		stripeMock,
		memory,
		stripeOptions,
	}) => {
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

		const userRes = await client.signUp.email(
			{ ...testUser, email: "schedule-downgrade@email.com" },
			{ throw: true },
		);

		const headers = new Headers();
		await client.signIn.email(
			{ ...testUser, email: "schedule-downgrade@email.com" },
			{ throw: true, onSuccess: sessionSetter(headers) },
		);

		// Set up an active subscription on the premium plan
		await ctx.adapter.create({
			model: "subscription",
			data: {
				plan: "premium",
				referenceId: userRes.user.id,
				status: "active",
				stripeSubscriptionId: "sub_schedule_test",
				stripeCustomerId: "cus_mock123",
			},
		});

		await ctx.adapter.update({
			model: "user",
			update: { stripeCustomerId: "cus_mock123" },
			where: [{ field: "id", value: userRes.user.id }],
		});

		// Mock Stripe subscriptions.list to return active premium subscription
		stripeMock.subscriptions.list.mockResolvedValueOnce({
			data: [
				{
					id: "sub_schedule_test",
					status: "active",
					items: {
						data: [
							{
								id: "si_premium_123",
								price: { id: process.env.STRIPE_PRICE_ID_2 },
								quantity: 1,
								current_period_start: Math.floor(Date.now() / 1000),
								current_period_end: Math.floor(Date.now() / 1000) + 30 * 86400,
							},
						],
					},
				},
			],
		});

		// Downgrade to starter with scheduleAtPeriodEnd
		const res = await client.subscription.upgrade({
			plan: "starter",
			scheduleAtPeriodEnd: true,
			fetchOptions: { headers },
		});

		// Should use Subscription Schedules, not billing portal or checkout
		expect(stripeMock.subscriptionSchedules.create).toHaveBeenCalledWith({
			from_subscription: "sub_schedule_test",
		});
		expect(stripeMock.subscriptionSchedules.update).toHaveBeenCalledWith(
			"sub_sched_mock",
			expect.objectContaining({
				metadata: { source: "@better-auth/stripe" },
				end_behavior: "release",
				phases: expect.arrayContaining([
					expect.objectContaining({
						proration_behavior: "none",
					}),
				]),
			}),
		);
		expect(stripeMock.billingPortal.sessions.create).not.toHaveBeenCalled();
		expect(stripeMock.checkout.sessions.create).not.toHaveBeenCalled();
		expect(stripeMock.subscriptions.update).not.toHaveBeenCalled();

		// Plan should remain unchanged (webhook handles it at period end),
		// but stripeScheduleId should be stored so clients can detect pending changes
		const sub = await ctx.adapter.findOne<Subscription>({
			model: "subscription",
			where: [{ field: "referenceId", value: userRes.user.id }],
		});
		expect(sub?.plan).toBe("premium"); // Still on premium, not starter
		expect(sub?.stripeScheduleId).toBe("sub_sched_mock");

		expect(res.data?.url).toBeDefined();
		expect(res.data?.redirect).toBe(true);
	});

	test("should release existing schedule before scheduling a new one", async ({
		stripeMock,
		memory,
		stripeOptions,
	}) => {
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

		const userRes = await client.signUp.email(
			{ ...testUser, email: "release-schedule@email.com" },
			{ throw: true },
		);

		const headers = new Headers();
		await client.signIn.email(
			{ ...testUser, email: "release-schedule@email.com" },
			{ throw: true, onSuccess: sessionSetter(headers) },
		);

		await ctx.adapter.create({
			model: "subscription",
			data: {
				plan: "premium",
				referenceId: userRes.user.id,
				status: "active",
				stripeSubscriptionId: "sub_with_schedule",
				stripeCustomerId: "cus_mock123",
			},
		});

		await ctx.adapter.update({
			model: "user",
			update: { stripeCustomerId: "cus_mock123" },
			where: [{ field: "id", value: userRes.user.id }],
		});

		stripeMock.subscriptions.list.mockResolvedValueOnce({
			data: [
				{
					id: "sub_with_schedule",
					status: "active",
					schedule: "sub_sched_existing",
					items: {
						data: [
							{
								id: "si_premium_456",
								price: { id: process.env.STRIPE_PRICE_ID_2 },
								quantity: 1,
								current_period_start: Math.floor(Date.now() / 1000),
								current_period_end: Math.floor(Date.now() / 1000) + 30 * 86400,
							},
						],
					},
				},
			],
		});

		// Mock an existing active schedule for this subscription
		stripeMock.subscriptionSchedules.list.mockResolvedValueOnce({
			data: [
				{
					id: "sub_sched_existing",
					subscription: "sub_with_schedule",
					status: "active",
					metadata: { source: "@better-auth/stripe" },
				},
			],
		});

		await client.subscription.upgrade({
			plan: "starter",
			scheduleAtPeriodEnd: true,
			fetchOptions: { headers },
		});

		// Should release the existing schedule first
		expect(stripeMock.subscriptionSchedules.release).toHaveBeenCalledWith(
			"sub_sched_existing",
		);

		// Then create a new one
		expect(stripeMock.subscriptionSchedules.create).toHaveBeenCalledWith({
			from_subscription: "sub_with_schedule",
		});
	});

	test("should release existing schedule before immediate upgrade", async ({
		stripeMock,
		memory,
		stripeOptions,
	}) => {
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

		const userRes = await client.signUp.email(
			{ ...testUser, email: "release-then-upgrade@email.com" },
			{ throw: true },
		);

		const headers = new Headers();
		await client.signIn.email(
			{ ...testUser, email: "release-then-upgrade@email.com" },
			{ throw: true, onSuccess: sessionSetter(headers) },
		);

		await ctx.adapter.create({
			model: "subscription",
			data: {
				plan: "starter",
				referenceId: userRes.user.id,
				status: "active",
				stripeSubscriptionId: "sub_scheduled_then_upgrade",
				stripeCustomerId: "cus_mock123",
			},
		});

		await ctx.adapter.update({
			model: "user",
			update: { stripeCustomerId: "cus_mock123" },
			where: [{ field: "id", value: userRes.user.id }],
		});

		stripeMock.subscriptions.list.mockResolvedValueOnce({
			data: [
				{
					id: "sub_scheduled_then_upgrade",
					status: "active",
					schedule: "sub_schedule_old",
					items: {
						data: [
							{
								id: "si_starter_789",
								price: { id: process.env.STRIPE_PRICE_ID_1 },
								quantity: 1,
								current_period_start: Math.floor(Date.now() / 1000),
								current_period_end: Math.floor(Date.now() / 1000) + 30 * 86400,
							},
						],
					},
				},
			],
		});

		// Mock an existing active schedule (from a previous downgrade scheduling)
		stripeMock.subscriptionSchedules.list.mockResolvedValueOnce({
			data: [
				{
					id: "sub_schedule_old",
					subscription: "sub_scheduled_then_upgrade",
					status: "active",
					metadata: { source: "@better-auth/stripe" },
				},
			],
		});

		// Immediate upgrade (no scheduleAtPeriodEnd)
		await client.subscription.upgrade({
			plan: "premium",
			fetchOptions: { headers },
		});

		// Should release the existing schedule
		expect(stripeMock.subscriptionSchedules.release).toHaveBeenCalledWith(
			"sub_schedule_old",
		);

		// Should use billing portal for immediate upgrade, not schedules
		expect(stripeMock.billingPortal.sessions.create).toHaveBeenCalled();
		expect(stripeMock.subscriptionSchedules.create).not.toHaveBeenCalled();
	});

	test("should not release schedules created outside the plugin", async ({
		stripeMock,
		memory,
		stripeOptions,
	}) => {
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

		const userRes = await client.signUp.email(
			{ ...testUser, email: "external-schedule@email.com" },
			{ throw: true },
		);

		const headers = new Headers();
		await client.signIn.email(
			{ ...testUser, email: "external-schedule@email.com" },
			{ throw: true, onSuccess: sessionSetter(headers) },
		);

		await ctx.adapter.create({
			model: "subscription",
			data: {
				plan: "starter",
				referenceId: userRes.user.id,
				status: "active",
				stripeSubscriptionId: "sub_external_schedule",
				stripeCustomerId: "cus_mock123",
			},
		});

		await ctx.adapter.update({
			model: "user",
			update: { stripeCustomerId: "cus_mock123" },
			where: [{ field: "id", value: userRes.user.id }],
		});

		stripeMock.subscriptions.list.mockResolvedValueOnce({
			data: [
				{
					id: "sub_external_schedule",
					status: "active",
					schedule: "sub_sched_external",
					items: {
						data: [
							{
								id: "si_ext",
								price: { id: process.env.STRIPE_PRICE_ID_1 },
								quantity: 1,
							},
						],
					},
				},
			],
		});

		// Schedule created externally (no @better-auth/stripe metadata)
		stripeMock.subscriptionSchedules.list.mockResolvedValueOnce({
			data: [
				{
					id: "sub_sched_external",
					subscription: "sub_external_schedule",
					status: "active",
					metadata: {}, // no source field
				},
			],
		});

		await client.subscription.upgrade({
			plan: "premium",
			fetchOptions: { headers },
		});

		// Should NOT release the external schedule
		expect(stripeMock.subscriptionSchedules.release).not.toHaveBeenCalled();

		// Should still proceed with the upgrade via billing portal
		expect(stripeMock.billingPortal.sessions.create).toHaveBeenCalled();
	});

	describe("line item replacement on plan change", () => {
		const buildLineItemOptions = (mock: Stripe): StripeOptions => ({
			stripeClient: mock,
			stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET!,
			createCustomerOnSignUp: true,
			subscription: {
				enabled: true,
				plans: [
					{
						priceId: "price_starter_base",
						name: "starter",
						lineItems: [
							{ price: "price_starter_events" },
							{ price: "price_starter_security" },
						],
					},
					{
						priceId: "price_pro_base",
						name: "pro",
						lineItems: [
							{ price: "price_pro_events" },
							{ price: "price_pro_security" },
						],
					},
				],
			},
		});

		test("should swap line item prices when upgrading immediately", async ({
			stripeMock,
			memory,
			stripeOptions,
		}) => {
			vi.clearAllMocks();

			const { client, auth, sessionSetter } = await getTestInstance(
				{
					database: memory,
					plugins: [
						stripe(buildLineItemOptions(stripeMock as unknown as Stripe)),
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
				{ ...testUser, email: "lineitem-upgrade@email.com" },
				{ throw: true },
			);

			const headers = new Headers();
			await client.signIn.email(
				{ ...testUser, email: "lineitem-upgrade@email.com" },
				{ throw: true, onSuccess: sessionSetter(headers) },
			);

			await ctx.adapter.create({
				model: "subscription",
				data: {
					plan: "starter",
					referenceId: userRes.user.id,
					status: "active",
					stripeSubscriptionId: "sub_lineitem",
					stripeCustomerId: "cus_mock123",
				},
			});

			await ctx.adapter.update({
				model: "user",
				update: { stripeCustomerId: "cus_mock123" },
				where: [{ field: "id", value: userRes.user.id }],
			});

			stripeMock.subscriptions.list.mockResolvedValueOnce({
				data: [
					{
						id: "sub_lineitem",
						status: "active",
						items: {
							data: [
								{
									id: "si_base",
									price: { id: "price_starter_base" },
									quantity: 1,
								},
								{
									id: "si_events",
									price: { id: "price_starter_events" },
									quantity: undefined,
								},
								{
									id: "si_security",
									price: { id: "price_starter_security" },
									quantity: undefined,
								},
							],
						},
					},
				],
			});

			stripeMock.subscriptions.update.mockResolvedValueOnce({
				id: "sub_lineitem",
				status: "active",
			});

			await client.subscription.upgrade({
				plan: "pro",
				fetchOptions: { headers },
			});

			// Should use subscriptions.update (not billing portal)
			// because line item prices changed between plans
			expect(stripeMock.subscriptions.update).toHaveBeenCalled();
			expect(stripeMock.billingPortal.sessions.create).not.toHaveBeenCalled();

			const updateCall = stripeMock.subscriptions.update.mock.calls[0]!;
			expect(updateCall[0]).toBe("sub_lineitem");
			const items = updateCall[1]!.items;

			// Multiset diff: base update + 2 deletes + 2 adds
			expect(items).toHaveLength(5);
			expect(items).toContainEqual(
				expect.objectContaining({ id: "si_base", price: "price_pro_base" }),
			);
			expect(items).toContainEqual(
				expect.objectContaining({ id: "si_events", deleted: true }),
			);
			expect(items).toContainEqual(
				expect.objectContaining({ id: "si_security", deleted: true }),
			);
			expect(items).toContainEqual(
				expect.objectContaining({ price: "price_pro_events" }),
			);
			expect(items).toContainEqual(
				expect.objectContaining({ price: "price_pro_security" }),
			);
		});

		test("should swap line item prices in scheduled phase", async ({
			stripeMock,
			memory,
			stripeOptions,
		}) => {
			vi.clearAllMocks();

			const { client, auth, sessionSetter } = await getTestInstance(
				{
					database: memory,
					plugins: [
						stripe(buildLineItemOptions(stripeMock as unknown as Stripe)),
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
				{ ...testUser, email: "lineitem-schedule@email.com" },
				{ throw: true },
			);

			const headers = new Headers();
			await client.signIn.email(
				{ ...testUser, email: "lineitem-schedule@email.com" },
				{ throw: true, onSuccess: sessionSetter(headers) },
			);

			await ctx.adapter.create({
				model: "subscription",
				data: {
					plan: "pro",
					referenceId: userRes.user.id,
					status: "active",
					stripeSubscriptionId: "sub_lineitem_sched",
					stripeCustomerId: "cus_mock123",
				},
			});

			await ctx.adapter.update({
				model: "user",
				update: { stripeCustomerId: "cus_mock123" },
				where: [{ field: "id", value: userRes.user.id }],
			});

			const now = Math.floor(Date.now() / 1000);
			const periodEnd = now + 30 * 86400;

			stripeMock.subscriptions.list.mockResolvedValueOnce({
				data: [
					{
						id: "sub_lineitem_sched",
						status: "active",
						items: {
							data: [
								{
									id: "si_base",
									price: { id: "price_pro_base" },
									quantity: 1,
								},
								{
									id: "si_events",
									price: { id: "price_pro_events" },
									quantity: undefined,
								},
								{
									id: "si_security",
									price: { id: "price_pro_security" },
									quantity: undefined,
								},
							],
						},
					},
				],
			});

			stripeMock.subscriptionSchedules.create.mockResolvedValueOnce({
				id: "sub_sched_lineitem",
				phases: [
					{
						start_date: now,
						end_date: periodEnd,
						items: [
							{ price: { id: "price_pro_base" }, quantity: 1 },
							{ price: { id: "price_pro_events" }, quantity: undefined },
							{ price: { id: "price_pro_security" }, quantity: undefined },
						],
					},
				],
			});

			await client.subscription.upgrade({
				plan: "starter",
				scheduleAtPeriodEnd: true,
				fetchOptions: { headers },
			});

			expect(stripeMock.subscriptionSchedules.create).toHaveBeenCalled();
			expect(stripeMock.subscriptionSchedules.update).toHaveBeenCalled();

			const scheduleUpdate =
				stripeMock.subscriptionSchedules.update.mock.calls[0]!;
			const phase2Items = scheduleUpdate[1]!.phases[1].items;

			// Multiset diff: base in-place, old line items removed, new added
			expect(phase2Items).toHaveLength(3);
			expect(phase2Items).toContainEqual(
				expect.objectContaining({ price: "price_starter_base" }),
			);
			expect(phase2Items).toContainEqual(
				expect.objectContaining({ price: "price_starter_events" }),
			);
			expect(phase2Items).toContainEqual(
				expect.objectContaining({ price: "price_starter_security" }),
			);
		});
	});

	describe("line item add/remove on asymmetric plan change", () => {
		const buildAsymmetricOptions = (mock: Stripe): StripeOptions => ({
			stripeClient: mock,
			stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET!,
			createCustomerOnSignUp: true,
			subscription: {
				enabled: true,
				plans: [
					{
						priceId: "price_basic_base",
						name: "basic",
						lineItems: [{ price: "price_basic_events" }],
					},
					{
						priceId: "price_premium_base",
						name: "premium",
						lineItems: [
							{ price: "price_premium_events" },
							{ price: "price_premium_security" },
						],
					},
				],
			},
		});

		test("should add new line items when upgrading to a plan with more items", async ({
			stripeMock,
			memory,
			stripeOptions,
		}) => {
			vi.clearAllMocks();

			const { client, auth, sessionSetter } = await getTestInstance(
				{
					database: memory,
					plugins: [
						stripe(buildAsymmetricOptions(stripeMock as unknown as Stripe)),
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
				{ ...testUser, email: "asymmetric-up@email.com" },
				{ throw: true },
			);

			const headers = new Headers();
			await client.signIn.email(
				{ ...testUser, email: "asymmetric-up@email.com" },
				{ throw: true, onSuccess: sessionSetter(headers) },
			);

			await ctx.adapter.create({
				model: "subscription",
				data: {
					plan: "basic",
					referenceId: userRes.user.id,
					status: "active",
					stripeSubscriptionId: "sub_asym_up",
					stripeCustomerId: "cus_mock123",
				},
			});

			await ctx.adapter.update({
				model: "user",
				update: { stripeCustomerId: "cus_mock123" },
				where: [{ field: "id", value: userRes.user.id }],
			});

			stripeMock.subscriptions.list.mockResolvedValueOnce({
				data: [
					{
						id: "sub_asym_up",
						status: "active",
						items: {
							data: [
								{
									id: "si_base",
									price: { id: "price_basic_base" },
									quantity: 1,
								},
								{
									id: "si_events",
									price: { id: "price_basic_events" },
									quantity: undefined,
								},
							],
						},
					},
				],
			});

			stripeMock.subscriptions.update.mockResolvedValueOnce({
				id: "sub_asym_up",
				status: "active",
			});

			await client.subscription.upgrade({
				plan: "premium",
				fetchOptions: { headers },
			});

			expect(stripeMock.subscriptions.update).toHaveBeenCalled();
			const updateCall = stripeMock.subscriptions.update.mock.calls[0]!;
			const items = updateCall[1]!.items;

			// Multiset diff: base update + 1 delete + 2 adds
			expect(items).toHaveLength(4);
			expect(items).toContainEqual(
				expect.objectContaining({
					id: "si_base",
					price: "price_premium_base",
				}),
			);
			expect(items).toContainEqual(
				expect.objectContaining({ id: "si_events", deleted: true }),
			);
			expect(items).toContainEqual(
				expect.objectContaining({ price: "price_premium_events" }),
			);
			expect(items).toContainEqual(
				expect.objectContaining({ price: "price_premium_security" }),
			);
		});

		test("should remove extra line items when downgrading to a plan with fewer items", async ({
			stripeMock,
			memory,
			stripeOptions,
		}) => {
			vi.clearAllMocks();

			const { client, auth, sessionSetter } = await getTestInstance(
				{
					database: memory,
					plugins: [
						stripe(buildAsymmetricOptions(stripeMock as unknown as Stripe)),
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
				{ ...testUser, email: "asymmetric-down@email.com" },
				{ throw: true },
			);

			const headers = new Headers();
			await client.signIn.email(
				{ ...testUser, email: "asymmetric-down@email.com" },
				{ throw: true, onSuccess: sessionSetter(headers) },
			);

			await ctx.adapter.create({
				model: "subscription",
				data: {
					plan: "premium",
					referenceId: userRes.user.id,
					status: "active",
					stripeSubscriptionId: "sub_asym_down",
					stripeCustomerId: "cus_mock123",
				},
			});

			await ctx.adapter.update({
				model: "user",
				update: { stripeCustomerId: "cus_mock123" },
				where: [{ field: "id", value: userRes.user.id }],
			});

			stripeMock.subscriptions.list.mockResolvedValueOnce({
				data: [
					{
						id: "sub_asym_down",
						status: "active",
						items: {
							data: [
								{
									id: "si_base",
									price: { id: "price_premium_base" },
									quantity: 1,
								},
								{
									id: "si_events",
									price: { id: "price_premium_events" },
									quantity: undefined,
								},
								{
									id: "si_security",
									price: { id: "price_premium_security" },
									quantity: undefined,
								},
							],
						},
					},
				],
			});

			stripeMock.subscriptions.update.mockResolvedValueOnce({
				id: "sub_asym_down",
				status: "active",
			});

			await client.subscription.upgrade({
				plan: "basic",
				fetchOptions: { headers },
			});

			expect(stripeMock.subscriptions.update).toHaveBeenCalled();
			const updateCall = stripeMock.subscriptions.update.mock.calls[0]!;
			const items = updateCall[1]!.items;

			// Multiset diff: base update + 2 deletes + 1 add
			expect(items).toHaveLength(4);
			expect(items).toContainEqual(
				expect.objectContaining({
					id: "si_base",
					price: "price_basic_base",
				}),
			);
			expect(items).toContainEqual(
				expect.objectContaining({ id: "si_events", deleted: true }),
			);
			expect(items).toContainEqual(
				expect.objectContaining({ id: "si_security", deleted: true }),
			);
			expect(items).toContainEqual(
				expect.objectContaining({ price: "price_basic_events" }),
			);
		});
	});

	describe("duplicate line item prevention", () => {
		const buildAsymmetricOptions = (mock: Stripe): StripeOptions => ({
			stripeClient: mock,
			stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET!,
			createCustomerOnSignUp: true,
			subscription: {
				enabled: true,
				plans: [
					{
						priceId: "price_basic_base",
						name: "basic",
						lineItems: [{ price: "price_basic_events" }],
					},
					{
						priceId: "price_premium_base",
						name: "premium",
						lineItems: [
							{ price: "price_premium_events" },
							{ price: "price_premium_security" },
						],
					},
				],
			},
		});

		test("should not duplicate line items already present in the subscription (immediate)", async ({
			stripeMock,
			memory,
			stripeOptions,
		}) => {
			vi.clearAllMocks();

			const { client, auth, sessionSetter } = await getTestInstance(
				{
					database: memory,
					plugins: [
						stripe(buildAsymmetricOptions(stripeMock as unknown as Stripe)),
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
				{ ...testUser, email: "dup-lineitem@email.com" },
				{ throw: true },
			);

			const headers = new Headers();
			await client.signIn.email(
				{ ...testUser, email: "dup-lineitem@email.com" },
				{ throw: true, onSuccess: sessionSetter(headers) },
			);

			await ctx.adapter.create({
				model: "subscription",
				data: {
					plan: "basic",
					referenceId: userRes.user.id,
					status: "active",
					stripeSubscriptionId: "sub_dup",
					stripeCustomerId: "cus_mock123",
				},
			});

			await ctx.adapter.update({
				model: "user",
				update: { stripeCustomerId: "cus_mock123" },
				where: [{ field: "id", value: userRes.user.id }],
			});

			// Subscription already has price_premium_security (shouldn't be there)
			stripeMock.subscriptions.list.mockResolvedValueOnce({
				data: [
					{
						id: "sub_dup",
						status: "active",
						items: {
							data: [
								{
									id: "si_base",
									price: { id: "price_basic_base" },
									quantity: 1,
								},
								{
									id: "si_events",
									price: { id: "price_basic_events" },
									quantity: undefined,
								},
								{
									id: "si_stale",
									price: { id: "price_premium_security" },
									quantity: undefined,
								},
							],
						},
					},
				],
			});

			await client.subscription.upgrade({
				plan: "premium",
				fetchOptions: { headers },
			});

			expect(stripeMock.subscriptions.update).toHaveBeenCalled();
			const updateCall = stripeMock.subscriptions.update.mock.calls[0]!;
			const items = updateCall[1]!.items;

			// si_stale already carries price_premium_security, so the API call
			// should NOT add it again. Stripe keeps items not in the update list.
			const securityAdds = items.filter(
				(i: Record<string, unknown>) =>
					!i.id && i.price === "price_premium_security",
			);
			expect(securityAdds).toHaveLength(0);
		});

		test("should not duplicate line items already present in scheduled phase", async ({
			stripeMock,
			memory,
			stripeOptions,
		}) => {
			vi.clearAllMocks();

			const { client, auth, sessionSetter } = await getTestInstance(
				{
					database: memory,
					plugins: [
						stripe(buildAsymmetricOptions(stripeMock as unknown as Stripe)),
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
				{ ...testUser, email: "dup-lineitem-sched@email.com" },
				{ throw: true },
			);

			const headers = new Headers();
			await client.signIn.email(
				{ ...testUser, email: "dup-lineitem-sched@email.com" },
				{ throw: true, onSuccess: sessionSetter(headers) },
			);

			await ctx.adapter.create({
				model: "subscription",
				data: {
					plan: "basic",
					referenceId: userRes.user.id,
					status: "active",
					stripeSubscriptionId: "sub_dup_sched",
					stripeCustomerId: "cus_mock123",
				},
			});

			await ctx.adapter.update({
				model: "user",
				update: { stripeCustomerId: "cus_mock123" },
				where: [{ field: "id", value: userRes.user.id }],
			});

			const now = Math.floor(Date.now() / 1000);
			const periodEnd = now + 30 * 86400;

			stripeMock.subscriptions.list.mockResolvedValueOnce({
				data: [
					{
						id: "sub_dup_sched",
						status: "active",
						items: {
							data: [
								{
									id: "si_base",
									price: { id: "price_basic_base" },
									quantity: 1,
								},
								{
									id: "si_events",
									price: { id: "price_basic_events" },
									quantity: undefined,
								},
								{
									id: "si_stale",
									price: { id: "price_premium_security" },
									quantity: undefined,
								},
							],
						},
					},
				],
			});

			stripeMock.subscriptionSchedules.create.mockResolvedValueOnce({
				id: "sub_sched_dup",
				phases: [
					{
						start_date: now,
						end_date: periodEnd,
						items: [
							{ price: { id: "price_basic_base" }, quantity: 1 },
							{ price: { id: "price_basic_events" }, quantity: undefined },
							{ price: { id: "price_premium_security" }, quantity: undefined },
						],
					},
				],
			});

			await client.subscription.upgrade({
				plan: "premium",
				scheduleAtPeriodEnd: true,
				fetchOptions: { headers },
			});

			expect(stripeMock.subscriptionSchedules.update).toHaveBeenCalled();
			const scheduleUpdate =
				stripeMock.subscriptionSchedules.update.mock.calls[0]!;
			const phase2Items = scheduleUpdate[1]!.phases[1].items;

			// price_premium_security should appear only once
			const securityItems = phase2Items.filter(
				(i: { price: string }) => i.price === "price_premium_security",
			);
			expect(securityItems).toHaveLength(1);
		});
	});

	describe("subscriptionSuccess - checkoutSessionId flow", () => {
		test("should update subscription via checkoutSessionId and redirect", async ({
			stripeMock,
			memory,
			stripeOptions,
		}) => {
			const testSubscriptionId = "sub_success_test";
			const testCheckoutSessionId = "cs_test_123";
			const testCustomerId = "cus_success_test";

			const stripeForTest = {
				...stripeOptions.stripeClient,
				checkout: {
					sessions: {
						...stripeOptions.stripeClient.checkout.sessions,
						retrieve: vi.fn(),
					},
				},
				subscriptions: {
					...stripeOptions.stripeClient.subscriptions,
					list: vi.fn().mockResolvedValue({
						data: [
							{
								id: testSubscriptionId,
								status: "active",
								cancel_at_period_end: false,
								cancel_at: null,
								canceled_at: null,
								trial_start: null,
								trial_end: null,
								items: {
									data: [
										{
											price: {
												id: process.env.STRIPE_PRICE_ID_1,
												recurring: { interval: "month" },
											},
											quantity: 1,
											current_period_start: Math.floor(Date.now() / 1000),
											current_period_end:
												Math.floor(Date.now() / 1000) + 30 * 86400,
										},
									],
								},
							},
						],
					}),
				},
			};

			const testOptions = {
				...stripeOptions,
				stripeClient: stripeForTest as unknown as Stripe,
			};

			const {
				client,
				auth: testAuth,
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

			const headers = new Headers();
			const userRes = await client.signUp.email(
				{
					email: "success-flow@test.com",
					password: "password",
					name: "Success Test",
				},
				{ throw: true },
			);
			await client.signIn.email(
				{ email: "success-flow@test.com", password: "password" },
				{ throw: true, onSuccess: sessionSetter(headers) },
			);

			// Create incomplete subscription in DB
			const sub = await testCtx.adapter.create({
				model: "subscription",
				data: {
					referenceId: userRes.user.id,
					stripeCustomerId: testCustomerId,
					status: "incomplete",
					plan: "starter",
				},
			});

			// Mock checkout session to return correct subscriptionId
			(stripeForTest.checkout.sessions.retrieve as any).mockResolvedValue({
				id: testCheckoutSessionId,
				metadata: {
					userId: userRes.user.id,
					subscriptionId: sub.id,
					referenceId: userRes.user.id,
				},
			});

			const callbackURL = "/dashboard";
			const url = `http://localhost:3000/api/auth/subscription/success?callbackURL=${encodeURIComponent(callbackURL)}&checkoutSessionId=${testCheckoutSessionId}`;
			const response = await testAuth.handler(
				new Request(url, {
					method: "GET",
					headers,
					redirect: "manual",
				}),
			);

			// Should redirect
			expect(response.status).toBe(302);
			expect(response.headers.get("location")).toContain(callbackURL);

			// Verify checkout session was retrieved
			expect(stripeForTest.checkout.sessions.retrieve).toHaveBeenCalledWith(
				testCheckoutSessionId,
			);

			// Verify subscription was updated in DB
			const updated = await testCtx.adapter.findOne<Subscription>({
				model: "subscription",
				where: [{ field: "id", value: sub.id }],
			});
			expect(updated?.status).toBe("active");
			expect(updated?.stripeSubscriptionId).toBe(testSubscriptionId);
			expect(updated?.periodStart).toBeInstanceOf(Date);
			expect(updated?.periodEnd).toBeInstanceOf(Date);
		});

		test("should redirect without update when checkoutSessionId is missing", async ({
			stripeMock,
			memory,
			stripeOptions,
		}) => {
			const {
				client,
				auth: testAuth,
				sessionSetter,
			} = await getTestInstance(
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

			const headers = new Headers();
			await client.signUp.email(
				{
					email: "no-session-id@test.com",
					password: "password",
					name: "No Session",
				},
				{ throw: true },
			);
			await client.signIn.email(
				{ email: "no-session-id@test.com", password: "password" },
				{ throw: true, onSuccess: sessionSetter(headers) },
			);

			const callbackURL = "/dashboard";
			const url = `http://localhost:3000/api/auth/subscription/success?callbackURL=${encodeURIComponent(callbackURL)}`;
			const response = await testAuth.handler(
				new Request(url, {
					method: "GET",
					headers,
					redirect: "manual",
				}),
			);

			// Should redirect without any Stripe calls
			expect(response.status).toBe(302);
			expect(response.headers.get("location")).toContain(callbackURL);
		});

		/**
		 * @see https://github.com/better-auth/better-auth/issues/8255
		 */
		test("should replace {CHECKOUT_SESSION_ID} placeholder in callbackURL with actual session ID", async ({
			stripeMock,
			memory,
			stripeOptions,
		}) => {
			const testSubscriptionId = "sub_placeholder_test";
			const testCheckoutSessionId = "cs_placeholder_456";
			const testCustomerId = "cus_placeholder_test";

			const stripeForTest = {
				...stripeOptions.stripeClient,
				checkout: {
					sessions: {
						...stripeOptions.stripeClient.checkout.sessions,
						retrieve: vi.fn(),
					},
				},
				subscriptions: {
					...stripeOptions.stripeClient.subscriptions,
					list: vi.fn().mockResolvedValue({
						data: [
							{
								id: testSubscriptionId,
								status: "active",
								cancel_at_period_end: false,
								cancel_at: null,
								canceled_at: null,
								trial_start: null,
								trial_end: null,
								items: {
									data: [
										{
											price: {
												id: process.env.STRIPE_PRICE_ID_1,
												recurring: { interval: "month" },
											},
											quantity: 1,
											current_period_start: Math.floor(Date.now() / 1000),
											current_period_end:
												Math.floor(Date.now() / 1000) + 30 * 86400,
										},
									],
								},
							},
						],
					}),
				},
			};

			const testOptions = {
				...stripeOptions,
				stripeClient: stripeForTest as unknown as Stripe,
			};

			const {
				client,
				auth: testAuth,
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

			const headers = new Headers();
			const userRes = await client.signUp.email(
				{
					email: "placeholder-test@test.com",
					password: "password",
					name: "Placeholder Test",
				},
				{ throw: true },
			);
			await client.signIn.email(
				{ email: "placeholder-test@test.com", password: "password" },
				{ throw: true, onSuccess: sessionSetter(headers) },
			);

			const sub = await testCtx.adapter.create({
				model: "subscription",
				data: {
					referenceId: userRes.user.id,
					stripeCustomerId: testCustomerId,
					status: "incomplete",
					plan: "starter",
				},
			});

			(stripeForTest.checkout.sessions.retrieve as any).mockResolvedValue({
				id: testCheckoutSessionId,
				metadata: {
					userId: userRes.user.id,
					subscriptionId: sub.id,
					referenceId: userRes.user.id,
				},
			});

			// User passes {CHECKOUT_SESSION_ID} in their successUrl, which gets
			// URL-encoded inside callbackURL. Stripe can only replace the literal
			// (unencoded) placeholder, so the encoded version stays as-is.
			// Better Auth should replace it with the actual session ID before redirecting.
			const callbackURL =
				"http://localhost:5173/billing/success?session_id={CHECKOUT_SESSION_ID}";
			const url = `http://localhost:3000/api/auth/subscription/success?callbackURL=${encodeURIComponent(callbackURL)}&checkoutSessionId=${testCheckoutSessionId}`;
			const response = await testAuth.handler(
				new Request(url, {
					method: "GET",
					headers,
					redirect: "manual",
				}),
			);

			expect(response.status).toBe(302);
			const location = response.headers.get("location")!;
			// The placeholder must be replaced with the actual checkout session ID
			expect(location).toContain(`session_id=${testCheckoutSessionId}`);
			// The literal placeholder must NOT remain in the redirect URL
			expect(location).not.toContain("{CHECKOUT_SESSION_ID}");
			expect(location).not.toContain("%7BCHECKOUT_SESSION_ID%7D");
		});

		test("should redirect when checkout session retrieval fails", async ({
			stripeMock,
			memory,
			stripeOptions,
		}) => {
			const stripeForTest = {
				...stripeOptions.stripeClient,
				checkout: {
					sessions: {
						...stripeOptions.stripeClient.checkout.sessions,
						retrieve: vi.fn().mockRejectedValue(new Error("Invalid session")),
					},
				},
			};

			const testOptions = {
				...stripeOptions,
				stripeClient: stripeForTest as unknown as Stripe,
			};

			const {
				client,
				auth: testAuth,
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

			const headers = new Headers();
			await client.signUp.email(
				{
					email: "bad-session@test.com",
					password: "password",
					name: "Bad Session",
				},
				{ throw: true },
			);
			await client.signIn.email(
				{ email: "bad-session@test.com", password: "password" },
				{ throw: true, onSuccess: sessionSetter(headers) },
			);

			const callbackURL = "/dashboard";
			const url = `http://localhost:3000/api/auth/subscription/success?callbackURL=${encodeURIComponent(callbackURL)}&checkoutSessionId=cs_invalid`;
			const response = await testAuth.handler(
				new Request(url, {
					method: "GET",
					headers,
					redirect: "manual",
				}),
			);

			// Should redirect gracefully
			expect(response.status).toBe(302);
			expect(response.headers.get("location")).toContain(callbackURL);
		});
	});

	/**
	 * @see https://github.com/better-auth/better-auth/issues/8920
	 */
	describe("metered usage pricing", () => {
		test("should not include quantity for metered base price in checkout session", async ({
			stripeMock,
			memory,
			stripeOptions,
		}) => {
			vi.clearAllMocks();

			const meteredPriceId = "price_metered_base";

			const meteredMockStripe = {
				...stripeMock,
				prices: {
					...stripeMock.prices,
					retrieve: vi.fn().mockResolvedValue({
						id: meteredPriceId,
						recurring: {
							usage_type: "metered",
							interval: "month",
						},
					}),
				},
			};

			const meteredStripeOptions = {
				stripeClient: meteredMockStripe as unknown as Stripe,
				stripeWebhookSecret: "test",
				createCustomerOnSignUp: true,
				subscription: {
					enabled: true,
					plans: [
						{
							name: "metered-plan",
							priceId: meteredPriceId,
						},
					],
				},
			} satisfies StripeOptions;

			const { client, sessionSetter } = await getTestInstance(
				{
					database: memory,
					plugins: [stripe(meteredStripeOptions)],
				},
				{
					disableTestUser: true,
					clientOptions: {
						plugins: [stripeClient({ subscription: true })],
					},
				},
			);

			const headers = new Headers();
			await client.signUp.email(
				{ email: "metered@test.com", password: "password", name: "Metered" },
				{ throw: true },
			);
			await client.signIn.email(
				{ email: "metered@test.com", password: "password" },
				{ throw: true, onSuccess: sessionSetter(headers) },
			);

			await client.subscription.upgrade({
				plan: "metered-plan",
				fetchOptions: { headers },
			});

			expect(meteredMockStripe.checkout.sessions.create).toHaveBeenCalled();
			const createCall =
				meteredMockStripe.checkout.sessions.create.mock.calls[0][0];
			const baseLineItem = createCall.line_items.find(
				(item: { price: string }) => item.price === meteredPriceId,
			);

			expect(baseLineItem).toBeDefined();
			expect(baseLineItem).not.toHaveProperty("quantity");
		});

		test("should still include quantity for licensed base price in checkout session", async ({
			stripeMock,
			memory,
			stripeOptions,
		}) => {
			vi.clearAllMocks();

			const licensedPriceId = "price_licensed_base";

			const licensedMockStripe = {
				...stripeMock,
				prices: {
					...stripeMock.prices,
					retrieve: vi.fn().mockResolvedValue({
						id: licensedPriceId,
						recurring: {
							usage_type: "licensed",
							interval: "month",
						},
					}),
				},
			};

			const licensedStripeOptions = {
				stripeClient: licensedMockStripe as unknown as Stripe,
				stripeWebhookSecret: "test",
				createCustomerOnSignUp: true,
				subscription: {
					enabled: true,
					plans: [
						{
							name: "licensed-plan",
							priceId: licensedPriceId,
						},
					],
				},
			} satisfies StripeOptions;

			const { client, sessionSetter } = await getTestInstance(
				{
					database: memory,
					plugins: [stripe(licensedStripeOptions)],
				},
				{
					disableTestUser: true,
					clientOptions: {
						plugins: [stripeClient({ subscription: true })],
					},
				},
			);

			const headers = new Headers();
			await client.signUp.email(
				{
					email: "licensed@test.com",
					password: "password",
					name: "Licensed",
				},
				{ throw: true },
			);
			await client.signIn.email(
				{ email: "licensed@test.com", password: "password" },
				{ throw: true, onSuccess: sessionSetter(headers) },
			);

			await client.subscription.upgrade({
				plan: "licensed-plan",
				fetchOptions: { headers },
			});

			expect(licensedMockStripe.checkout.sessions.create).toHaveBeenCalled();
			const createCall =
				licensedMockStripe.checkout.sessions.create.mock.calls[0][0];
			const baseLineItem = createCall.line_items.find(
				(item: { price: string }) => item.price === licensedPriceId,
			);

			expect(baseLineItem).toBeDefined();
			expect(baseLineItem).toHaveProperty("quantity", 1);
		});

		test("should not include quantity for metered price during billing portal upgrade", async ({
			stripeMock,
			memory,
			stripeOptions,
		}) => {
			vi.clearAllMocks();

			const oldPriceId = "price_old_licensed";
			const meteredPriceId = "price_metered_upgrade";
			const subscriptionId = "sub_metered_upgrade";

			const upgradeMockStripe = {
				...stripeMock,
				prices: {
					...stripeMock.prices,
					retrieve: vi.fn().mockResolvedValue({
						id: meteredPriceId,
						recurring: {
							usage_type: "metered",
							interval: "month",
						},
					}),
				},
				subscriptions: {
					...stripeMock.subscriptions,
					list: vi.fn().mockResolvedValue({
						data: [
							{
								id: subscriptionId,
								status: "active",
								items: {
									data: [
										{
											id: "si_old",
											price: {
												id: oldPriceId,
												recurring: {
													usage_type: "licensed",
													interval: "month",
												},
											},
											quantity: 1,
										},
									],
								},
								schedule: null,
							},
						],
					}),
					update: vi.fn().mockResolvedValue({}),
				},
				subscriptionSchedules: {
					...stripeMock.subscriptionSchedules,
					list: vi.fn().mockResolvedValue({ data: [] }),
				},
			};

			const upgradeStripeOptions = {
				stripeClient: upgradeMockStripe as unknown as Stripe,
				stripeWebhookSecret: "test",
				createCustomerOnSignUp: true,
				subscription: {
					enabled: true,
					plans: [
						{
							name: "old-plan",
							priceId: oldPriceId,
						},
						{
							name: "metered-plan",
							priceId: meteredPriceId,
						},
					],
				},
			} satisfies StripeOptions;

			const { client, auth, sessionSetter } = await getTestInstance(
				{
					database: memory,
					plugins: [stripe(upgradeStripeOptions)],
				},
				{
					disableTestUser: true,
					clientOptions: {
						plugins: [stripeClient({ subscription: true })],
					},
				},
			);
			const ctx = await auth.$context;

			const headers = new Headers();
			const userRes = await client.signUp.email(
				{
					email: "metered-upgrade@test.com",
					password: "password",
					name: "Upgrade",
				},
				{ throw: true },
			);
			await client.signIn.email(
				{ email: "metered-upgrade@test.com", password: "password" },
				{ throw: true, onSuccess: sessionSetter(headers) },
			);

			await ctx.adapter.create({
				model: "subscription",
				data: {
					id: "db_sub_metered_upgrade",
					plan: "old-plan",
					referenceId: userRes.user.id,
					stripeCustomerId: "cus_mock123",
					stripeSubscriptionId: subscriptionId,
					status: "active",
					createdAt: new Date(),
					updatedAt: new Date(),
				},
			});

			await client.subscription.upgrade({
				plan: "metered-plan",
				fetchOptions: { headers },
			});

			expect(
				upgradeMockStripe.billingPortal.sessions.create,
			).toHaveBeenCalled();
			const portalCall =
				upgradeMockStripe.billingPortal.sessions.create.mock.calls[0][0];
			const portalItem =
				portalCall.flow_data.subscription_update_confirm.items[0];

			expect(portalItem.price).toBe(meteredPriceId);
			expect(portalItem).not.toHaveProperty("quantity");
		});

		test("should not include quantity for metered price during direct subscription upgrade", async ({
			stripeMock,
			memory,
			stripeOptions,
		}) => {
			vi.clearAllMocks();

			const oldPriceId = "price_old_licensed";
			const meteredPriceId = "price_metered_direct";
			const subscriptionId = "sub_metered_direct";

			const upgradeMockStripe = {
				...stripeMock,
				prices: {
					...stripeMock.prices,
					retrieve: vi.fn().mockResolvedValue({
						id: meteredPriceId,
						recurring: {
							usage_type: "metered",
							interval: "month",
						},
					}),
				},
				subscriptions: {
					...stripeMock.subscriptions,
					list: vi.fn().mockResolvedValue({
						data: [
							{
								id: subscriptionId,
								status: "active",
								items: {
									data: [
										{
											id: "si_old",
											price: {
												id: oldPriceId,
												recurring: {
													usage_type: "licensed",
													interval: "month",
												},
											},
											quantity: 1,
										},
									],
								},
								schedule: null,
							},
						],
					}),
					update: vi.fn().mockResolvedValue({}),
				},
				subscriptionSchedules: {
					...stripeMock.subscriptionSchedules,
					list: vi.fn().mockResolvedValue({ data: [] }),
				},
			};

			const upgradeStripeOptions = {
				stripeClient: upgradeMockStripe as unknown as Stripe,
				stripeWebhookSecret: "test",
				createCustomerOnSignUp: true,
				subscription: {
					enabled: true,
					plans: [
						{
							name: "old-plan",
							priceId: oldPriceId,
							lineItems: [{ price: "price_addon_old" }],
						},
						{
							name: "metered-plan",
							priceId: meteredPriceId,
						},
					],
				},
			} satisfies StripeOptions;

			const { client, auth, sessionSetter } = await getTestInstance(
				{
					database: memory,
					plugins: [stripe(upgradeStripeOptions)],
				},
				{
					disableTestUser: true,
					clientOptions: {
						plugins: [stripeClient({ subscription: true })],
					},
				},
			);
			const ctx = await auth.$context;

			const headers = new Headers();
			const userRes = await client.signUp.email(
				{
					email: "metered-direct@test.com",
					password: "password",
					name: "Direct",
				},
				{ throw: true },
			);
			await client.signIn.email(
				{ email: "metered-direct@test.com", password: "password" },
				{ throw: true, onSuccess: sessionSetter(headers) },
			);

			await ctx.adapter.create({
				model: "subscription",
				data: {
					id: "db_sub_metered_direct",
					plan: "old-plan",
					referenceId: userRes.user.id,
					stripeCustomerId: "cus_mock123",
					stripeSubscriptionId: subscriptionId,
					status: "active",
					createdAt: new Date(),
					updatedAt: new Date(),
				},
			});

			await client.subscription.upgrade({
				plan: "metered-plan",
				fetchOptions: { headers },
			});

			expect(upgradeMockStripe.subscriptions.update).toHaveBeenCalled();
			const updateCall =
				upgradeMockStripe.subscriptions.update.mock.calls[0][1];
			const meteredItem = updateCall.items.find(
				(item: { price?: string }) => item.price === meteredPriceId,
			);

			expect(meteredItem).toBeDefined();
			expect(meteredItem).not.toHaveProperty("quantity");
		});

		test("should not include quantity for metered price during scheduled upgrade", async ({
			stripeMock,
			memory,
			stripeOptions,
		}) => {
			vi.clearAllMocks();

			const oldPriceId = "price_old_scheduled";
			const meteredPriceId = "price_metered_scheduled";
			const subscriptionId = "sub_metered_scheduled";

			const scheduleMockStripe = {
				...stripeMock,
				prices: {
					...stripeMock.prices,
					retrieve: vi.fn().mockResolvedValue({
						id: meteredPriceId,
						recurring: {
							usage_type: "metered",
							interval: "month",
						},
					}),
				},
				subscriptions: {
					...stripeMock.subscriptions,
					list: vi.fn().mockResolvedValue({
						data: [
							{
								id: subscriptionId,
								status: "active",
								items: {
									data: [
										{
											id: "si_old_scheduled",
											price: {
												id: oldPriceId,
												recurring: {
													usage_type: "licensed",
													interval: "month",
												},
											},
											quantity: 1,
											current_period_start: Math.floor(Date.now() / 1000),
											current_period_end:
												Math.floor(Date.now() / 1000) + 30 * 86400,
										},
									],
								},
								schedule: null,
							},
						],
					}),
				},
				subscriptionSchedules: {
					...stripeMock.subscriptionSchedules,
					list: vi.fn().mockResolvedValue({ data: [] }),
					create: vi.fn().mockResolvedValue({
						id: "sub_sched_metered",
						phases: [
							{
								start_date: Math.floor(Date.now() / 1000),
								end_date: Math.floor(Date.now() / 1000) + 30 * 86400,
								items: [
									{
										price: oldPriceId,
										quantity: 1,
									},
								],
							},
						],
					}),
					update: vi.fn().mockResolvedValue({}),
				},
			};

			const scheduleStripeOptions = {
				stripeClient: scheduleMockStripe as unknown as Stripe,
				stripeWebhookSecret: "test",
				createCustomerOnSignUp: true,
				subscription: {
					enabled: true,
					plans: [
						{
							name: "old-plan",
							priceId: oldPriceId,
						},
						{
							name: "metered-plan",
							priceId: meteredPriceId,
						},
					],
				},
			} satisfies StripeOptions;

			const { client, auth, sessionSetter } = await getTestInstance(
				{
					database: memory,
					plugins: [stripe(scheduleStripeOptions)],
				},
				{
					disableTestUser: true,
					clientOptions: {
						plugins: [stripeClient({ subscription: true })],
					},
				},
			);
			const ctx = await auth.$context;

			const headers = new Headers();
			const userRes = await client.signUp.email(
				{
					email: "metered-schedule@test.com",
					password: "password",
					name: "Schedule",
				},
				{ throw: true },
			);
			await client.signIn.email(
				{ email: "metered-schedule@test.com", password: "password" },
				{ throw: true, onSuccess: sessionSetter(headers) },
			);

			await ctx.adapter.create({
				model: "subscription",
				data: {
					id: "db_sub_metered_scheduled",
					plan: "old-plan",
					referenceId: userRes.user.id,
					stripeCustomerId: "cus_mock123",
					stripeSubscriptionId: subscriptionId,
					status: "active",
					createdAt: new Date(),
					updatedAt: new Date(),
				},
			});

			await client.subscription.upgrade({
				plan: "metered-plan",
				scheduleAtPeriodEnd: true,
				fetchOptions: { headers },
			});

			expect(
				scheduleMockStripe.subscriptionSchedules.update,
			).toHaveBeenCalled();
			const scheduleUpdate =
				scheduleMockStripe.subscriptionSchedules.update.mock.calls[0][1];
			const newPhase = scheduleUpdate.phases[1];
			const meteredItem = newPhase.items.find(
				(item: { price: string }) => item.price === meteredPriceId,
			);

			expect(meteredItem).toBeDefined();
			expect(meteredItem).not.toHaveProperty("quantity");
		});
	});

	/**
	 * @see https://github.com/better-auth/better-auth/issues/9129
	 * @see https://github.com/better-auth/better-auth/issues/9130
	 */
	describe("getCheckoutSessionParams subscription_data merge", () => {
		const buildTrialOptions = (mock: Stripe): StripeOptions => ({
			stripeClient: mock,
			stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET ?? "test_secret",
			createCustomerOnSignUp: true,
			subscription: {
				enabled: true,
				plans: [
					{
						priceId: process.env.STRIPE_PRICE_ID_1 ?? "price_test_1",
						name: "starter",
						lookupKey: "lookup_key_123",
						freeTrial: { days: 14 },
					},
				],
				getCheckoutSessionParams: async () => ({
					params: {
						payment_method_collection: "if_required" as const,
						subscription_data: {
							trial_settings: {
								end_behavior: {
									missing_payment_method: "cancel" as const,
								},
							},
						},
					},
				}),
			},
		});

		test("preserves plan freeTrial when getCheckoutSessionParams returns custom subscription_data", async ({
			stripeMock,
			memory,
			stripeOptions,
		}) => {
			const { client, sessionSetter } = await getTestInstance(
				{
					database: memory,
					plugins: [stripe(buildTrialOptions(stripeMock as unknown as Stripe))],
				},
				{
					disableTestUser: true,
					clientOptions: {
						plugins: [stripeClient({ subscription: true })],
					},
				},
			);

			const email = "trial-merge@email.com";
			await client.signUp.email({ ...testUser, email }, { throw: true });
			const headers = new Headers();
			await client.signIn.email(
				{ ...testUser, email },
				{ throw: true, onSuccess: sessionSetter(headers) },
			);

			stripeMock.checkout.sessions.create.mockClear();
			await client.subscription.upgrade({
				plan: "starter",
				fetchOptions: { headers },
			});

			expect(stripeMock.checkout.sessions.create).toHaveBeenCalledWith(
				expect.objectContaining({
					subscription_data: expect.objectContaining({
						trial_period_days: 14,
						trial_settings: {
							end_behavior: { missing_payment_method: "cancel" },
						},
					}),
				}),
				undefined,
			);
		});

		test("does not let getCheckoutSessionParams override library-owned flow-routing fields", async ({
			stripeMock,
			memory,
			stripeOptions,
		}) => {
			const hijackOptions = {
				...stripeOptions,
				subscription: {
					enabled: true,
					plans: [
						{
							priceId: process.env.STRIPE_PRICE_ID_1!,
							name: "starter",
							lookupKey: "lookup_key_123",
						},
					],
					getCheckoutSessionParams: async () => ({
						params: {
							success_url: "https://attacker.example/success",
							cancel_url: "https://attacker.example/cancel",
							mode: "payment" as const,
							client_reference_id: "attacker-controlled",
							customer: "cus_attacker",
							customer_email: "attacker@example.com",
							line_items: [{ price: "price_attacker", quantity: 99 }],
						},
					}),
				},
			} satisfies StripeOptions;

			const { client, sessionSetter } = await getTestInstance(
				{
					database: memory,
					plugins: [stripe(hijackOptions)],
				},
				{
					disableTestUser: true,
					clientOptions: {
						plugins: [stripeClient({ subscription: true })],
					},
				},
			);

			const email = "hijack-attempt@email.com";
			await client.signUp.email({ ...testUser, email }, { throw: true });
			const headers = new Headers();
			await client.signIn.email(
				{ ...testUser, email },
				{ throw: true, onSuccess: sessionSetter(headers) },
			);

			stripeMock.checkout.sessions.create.mockClear();
			await client.subscription.upgrade({
				plan: "starter",
				fetchOptions: { headers },
			});

			const callArgs = stripeMock.checkout.sessions.create.mock.calls[0]?.[0];
			expect(callArgs).toBeDefined();
			expect(callArgs.mode).toBe("subscription");
			expect(callArgs.client_reference_id).not.toBe("attacker-controlled");
			expect(callArgs.customer).not.toBe("cus_attacker");
			expect(callArgs.customer_email).not.toBe("attacker@example.com");
			expect(callArgs.success_url).not.toBe("https://attacker.example/success");
			expect(callArgs.success_url).toContain("/subscription/success");
			expect(callArgs.cancel_url).not.toBe("https://attacker.example/cancel");
			expect(callArgs.line_items).not.toEqual([
				{ price: "price_attacker", quantity: 99 },
			]);
			expect(callArgs.line_items[0].price).toBe("price_lookup_123");
		});

		test("passes UX-only params from getCheckoutSessionParams through to Stripe", async ({
			stripeMock,
			memory,
			stripeOptions,
		}) => {
			const passthroughOptions = {
				...stripeOptions,
				subscription: {
					enabled: true,
					plans: [
						{
							priceId: process.env.STRIPE_PRICE_ID_1!,
							name: "starter",
							lookupKey: "lookup_key_123",
						},
					],
					getCheckoutSessionParams: async () => ({
						params: {
							allow_promotion_codes: true,
							payment_method_collection: "if_required" as const,
							tax_id_collection: { enabled: true },
							custom_text: {
								submit: { message: "Welcome aboard" },
							},
							billing_address_collection: "required" as const,
						},
					}),
				},
			} satisfies StripeOptions;

			const { client, sessionSetter } = await getTestInstance(
				{
					database: memory,
					plugins: [stripe(passthroughOptions)],
				},
				{
					disableTestUser: true,
					clientOptions: {
						plugins: [stripeClient({ subscription: true })],
					},
				},
			);

			const email = "passthrough@email.com";
			await client.signUp.email({ ...testUser, email }, { throw: true });
			const headers = new Headers();
			await client.signIn.email(
				{ ...testUser, email },
				{ throw: true, onSuccess: sessionSetter(headers) },
			);

			stripeMock.checkout.sessions.create.mockClear();
			await client.subscription.upgrade({
				plan: "starter",
				fetchOptions: { headers },
			});

			expect(stripeMock.checkout.sessions.create).toHaveBeenCalledWith(
				expect.objectContaining({
					allow_promotion_codes: true,
					payment_method_collection: "if_required",
					tax_id_collection: { enabled: true },
					custom_text: { submit: { message: "Welcome aboard" } },
					billing_address_collection: "required",
				}),
				undefined,
			);
		});

		test("lets getCheckoutSessionParams override customer_update", async ({
			stripeMock,
			memory,
			stripeOptions,
		}) => {
			const overrideOptions = {
				...stripeOptions,
				subscription: {
					enabled: true,
					plans: [
						{
							priceId: process.env.STRIPE_PRICE_ID_1!,
							name: "starter",
							lookupKey: "lookup_key_123",
						},
					],
					getCheckoutSessionParams: async () => ({
						params: {
							customer_update: { name: "never" } as const,
						},
					}),
				},
			} satisfies StripeOptions;

			const { client, sessionSetter } = await getTestInstance(
				{
					database: memory,
					plugins: [stripe(overrideOptions)],
				},
				{
					disableTestUser: true,
					clientOptions: {
						plugins: [stripeClient({ subscription: true })],
					},
				},
			);

			const email = "customer-update-override@email.com";
			await client.signUp.email({ ...testUser, email }, { throw: true });
			const headers = new Headers();
			await client.signIn.email(
				{ ...testUser, email },
				{ throw: true, onSuccess: sessionSetter(headers) },
			);

			stripeMock.checkout.sessions.create.mockClear();
			await client.subscription.upgrade({
				plan: "starter",
				fetchOptions: { headers },
			});

			const callArgs = stripeMock.checkout.sessions.create.mock.calls[0]?.[0];
			expect(callArgs.customer_update).toEqual({ name: "never" });
		});

		test("falls back to library default customer_update when getCheckoutSessionParams omits it", async ({
			stripeMock,
			memory,
			stripeOptions,
		}) => {
			const defaultOptions = {
				...stripeOptions,
				subscription: {
					enabled: true,
					plans: [
						{
							priceId: process.env.STRIPE_PRICE_ID_1!,
							name: "starter",
							lookupKey: "lookup_key_123",
						},
					],
					getCheckoutSessionParams: async () => ({
						params: {
							allow_promotion_codes: true,
						},
					}),
				},
			} satisfies StripeOptions;

			const { client, sessionSetter } = await getTestInstance(
				{
					database: memory,
					plugins: [stripe(defaultOptions)],
				},
				{
					disableTestUser: true,
					clientOptions: {
						plugins: [stripeClient({ subscription: true })],
					},
				},
			);

			const email = "customer-update-default@email.com";
			await client.signUp.email({ ...testUser, email }, { throw: true });
			const headers = new Headers();
			await client.signIn.email(
				{ ...testUser, email },
				{ throw: true, onSuccess: sessionSetter(headers) },
			);

			stripeMock.checkout.sessions.create.mockClear();
			await client.subscription.upgrade({
				plan: "starter",
				fetchOptions: { headers },
			});

			const callArgs = stripeMock.checkout.sessions.create.mock.calls[0]?.[0];
			expect(callArgs.customer_update).toEqual({
				name: "auto",
				address: "auto",
			});
		});

		test("uses request-time locale over getCheckoutSessionParams locale", async ({
			stripeMock,
			memory,
			stripeOptions,
		}) => {
			const localeOptions = {
				...stripeOptions,
				subscription: {
					enabled: true,
					plans: [
						{
							priceId: process.env.STRIPE_PRICE_ID_1!,
							name: "starter",
							lookupKey: "lookup_key_123",
						},
					],
					getCheckoutSessionParams: async () => ({
						params: {
							locale: "ko" as const,
						},
					}),
				},
			} satisfies StripeOptions;

			const { client, sessionSetter } = await getTestInstance(
				{
					database: memory,
					plugins: [stripe(localeOptions)],
				},
				{
					disableTestUser: true,
					clientOptions: {
						plugins: [stripeClient({ subscription: true })],
					},
				},
			);

			const email = "locale-request-wins@email.com";
			await client.signUp.email({ ...testUser, email }, { throw: true });
			const headers = new Headers();
			await client.signIn.email(
				{ ...testUser, email },
				{ throw: true, onSuccess: sessionSetter(headers) },
			);

			stripeMock.checkout.sessions.create.mockClear();
			await client.subscription.upgrade({
				plan: "starter",
				locale: "en",
				fetchOptions: { headers },
			});

			const callArgs = stripeMock.checkout.sessions.create.mock.calls[0]?.[0];
			expect(callArgs.locale).toBe("en");
		});

		test("falls back to getCheckoutSessionParams locale when request omits locale", async ({
			stripeMock,
			memory,
			stripeOptions,
		}) => {
			const localeOptions = {
				...stripeOptions,
				subscription: {
					enabled: true,
					plans: [
						{
							priceId: process.env.STRIPE_PRICE_ID_1!,
							name: "starter",
							lookupKey: "lookup_key_123",
						},
					],
					getCheckoutSessionParams: async () => ({
						params: {
							locale: "ko" as const,
						},
					}),
				},
			} satisfies StripeOptions;

			const { client, sessionSetter } = await getTestInstance(
				{
					database: memory,
					plugins: [stripe(localeOptions)],
				},
				{
					disableTestUser: true,
					clientOptions: {
						plugins: [stripeClient({ subscription: true })],
					},
				},
			);

			const email = "locale-fallback@email.com";
			await client.signUp.email({ ...testUser, email }, { throw: true });
			const headers = new Headers();
			await client.signIn.email(
				{ ...testUser, email },
				{ throw: true, onSuccess: sessionSetter(headers) },
			);

			stripeMock.checkout.sessions.create.mockClear();
			await client.subscription.upgrade({
				plan: "starter",
				fetchOptions: { headers },
			});

			const callArgs = stripeMock.checkout.sessions.create.mock.calls[0]?.[0];
			expect(callArgs.locale).toBe("ko");
		});

		test("preserves internal subscription metadata when getCheckoutSessionParams returns custom subscription_data", async ({
			stripeMock,
			memory,
			stripeOptions,
		}) => {
			const { client, sessionSetter } = await getTestInstance(
				{
					database: memory,
					plugins: [stripe(buildTrialOptions(stripeMock as unknown as Stripe))],
				},
				{
					disableTestUser: true,
					clientOptions: {
						plugins: [stripeClient({ subscription: true })],
					},
				},
			);

			const email = "metadata-merge@email.com";
			await client.signUp.email({ ...testUser, email }, { throw: true });
			const headers = new Headers();
			await client.signIn.email(
				{ ...testUser, email },
				{ throw: true, onSuccess: sessionSetter(headers) },
			);

			stripeMock.checkout.sessions.create.mockClear();
			await client.subscription.upgrade({
				plan: "starter",
				fetchOptions: { headers },
			});

			expect(stripeMock.checkout.sessions.create).toHaveBeenCalledWith(
				expect.objectContaining({
					subscription_data: expect.objectContaining({
						metadata: expect.objectContaining({
							subscriptionId: expect.any(String),
							userId: expect.any(String),
							referenceId: expect.any(String),
						}),
					}),
				}),
				undefined,
			);
		});
	});
});
