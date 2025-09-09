import { betterAuth, type User } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import { createAuthClient } from "better-auth/client";
import { setCookieToHeader } from "better-auth/cookies";
import { bearer } from "better-auth/plugins";
import Stripe from "stripe";
import { vi } from "vitest";
import { stripe } from ".";
import { stripeClient } from "./client";
import type { StripeOptions, Subscription } from "./types";
import { expect, describe, it, beforeEach } from "vitest";

describe("stripe", async () => {
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
});
