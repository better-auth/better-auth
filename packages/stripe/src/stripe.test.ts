import { betterAuth } from "better-auth";
import { stripe } from ".";
import Stripe from "stripe";
import { createAuthClient } from "better-auth/client";
import { stripeClient } from "./client";
import type { Customer, StripeOptions, Subscription } from "./types";
import { bearer } from "better-auth/plugins";
import { setCookieToHeader } from "better-auth/cookies";

describe("stripe", async () => {
	const _stripe = new Stripe(process.env.STRIPE_KEY!);
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
				},
				{
					priceId: process.env.STRIPE_PRICE_ID_2!,
					name: "premium",
				},
			],
		},
	} satisfies StripeOptions;
	const auth = betterAuth({
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

	it.only("should create a customer on sign up", async () => {
		const userRes = await authClient.signUp.email(testUser, {
			throw: true,
		});
		const res = await ctx.adapter.findOne<Customer>({
			model: "customer",
			where: [
				{
					field: "userId",
					value: userRes.user.id,
				},
			],
		});
		expect(res).toMatchObject({
			id: expect.any(String),
			userId: userRes.user.id,
			stripeCustomerId: expect.any(String),
		});
	});

	let customerId = "";
	let subscriptionId = "";
	let referenceId = "";
	it.only("should create a subscription", async () => {
		const headers = new Headers();
		const userRes = await authClient.signIn.email(testUser, {
			throw: true,
			onSuccess: setCookieToHeader(headers),
		});
		referenceId = userRes.user.id;
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
					value: referenceId,
				},
			],
		});
		customerId = subscription!.stripeCustomerId!;
		subscriptionId = subscription!.id;
		expect(subscription).toMatchObject({
			id: expect.any(String),
			plan: "starter",
			referenceId: referenceId,
			stripeCustomerId: expect.any(String),
			status: "incomplete",
			periodStart: undefined,
			cancelAtPeriodEnd: undefined,
		});
	});

	it.only("should list active subscriptions", async () => {
		const { headers } = await getHeader();
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
					value: referenceId,
				},
			],
		});
		const listAfterRes = await authClient.subscription.list({
			fetchOptions: {
				headers,
			},
		});
		console.log(listAfterRes);
		expect(listAfterRes.data?.length).toBeGreaterThan(0);
	});

	it("should handle subscription webhook events", async () => {
		// Mock a checkout.session.completed event
		const mockCheckoutSessionEvent = {
			type: "checkout.session.completed",
			data: {
				object: {
					mode: "subscription",
					subscription: "sub_123456",
					metadata: {
						referenceId: "user_123",
						subscriptionId: subscriptionId,
					},
				},
			},
		};

		// Mock the Stripe client responses
		const mockSubscription = {
			id: "sub_123456",
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

		// Create a test-specific stripe instance with mocked methods
		const stripeForTest = {
			...stripeOptions.stripeClient,
			subscriptions: {
				retrieve: jest.fn().mockResolvedValue(mockSubscription),
			},
			webhooks: {
				constructEvent: jest.fn().mockReturnValue(mockCheckoutSessionEvent),
			},
		};

		// Override the stripe client for this test
		const testOptions = {
			...stripeOptions,
			stripeClient: stripeForTest,
		};

		// Initialize the handler with the test options
		const testAuth = betterAuth({
			baseURL: "http://localhost:3000",
			emailAndPassword: {
				enabled: true,
			},
			plugins: [stripe(testOptions)],
		});

		const testCtx = await testAuth.$context;

		// Create a mock request with signature
		const mockRequest = new Request(
			"http://localhost:3000/api/stripe/webhook",
			{
				method: "POST",
				headers: {
					"stripe-signature": "test_signature",
				},
				body: JSON.stringify(mockCheckoutSessionEvent),
			},
		);

		// Process the webhook
		const response = await testAuth.handler(mockRequest);
		expect(response.status).toBe(200);

		// Verify the subscription was updated
		const updatedSubscription = await testCtx.adapter.findOne<Subscription>({
			model: "subscription",
			where: [
				{
					field: "id",
					value: subscriptionId,
				},
			],
		});

		expect(updatedSubscription).toMatchObject({
			id: subscriptionId,
			status: "active",
			periodStart: expect.any(Date),
			periodEnd: expect.any(Date),
		});
	});

	it("should handle subscription deletion webhook", async () => {
		// Set up a subscription in the database
		const { headers, response: userRes } = await getHeader();
		const subscription = await ctx.adapter.findOne<Subscription>({
			model: "subscription",
			where: [
				{
					field: "referenceId",
					value: userRes.user.id,
				},
			],
		});

		// Mock the subscription deleted event
		const mockDeleteEvent = {
			type: "customer.subscription.deleted",
			data: {
				object: {
					id: "sub_deleted",
					customer: subscription?.stripeCustomerId,
					status: "canceled",
				},
			},
		};

		// Create a test-specific stripe instance with mocked methods
		const stripeForTest = {
			...stripeOptions.stripeClient,
			webhooks: {
				constructEvent: jest.fn().mockReturnValue(mockDeleteEvent),
			},
		};

		// Override the stripe client for this test
		const testOptions = {
			...stripeOptions,
			stripeClient: stripeForTest,
		};

		// Initialize the handler with the test options
		const testAuth = betterAuth({
			baseURL: "http://localhost:3000",
			emailAndPassword: {
				enabled: true,
			},
			plugins: [stripe(testOptions)],
		});

		// Create a mock request with signature
		const mockRequest = new Request(
			"http://localhost:3000/api/stripe/webhook",
			{
				method: "POST",
				headers: {
					"stripe-signature": "test_signature",
				},
				body: JSON.stringify(mockDeleteEvent),
			},
		);

		// Process the webhook
		const response = await testAuth.handler(mockRequest);
		expect(response.status).toBe(200);

		// Verify the subscription was marked as canceled
		if (subscription) {
			// Update the stripeSubscriptionId in our test database first for this test
			await ctx.adapter.update({
				model: "subscription",
				update: {
					stripeSubscriptionId: "sub_deleted",
				},
				where: [
					{
						field: "id",
						value: subscription.id,
					},
				],
			});

			const updatedSubscription = await ctx.adapter.findOne<Subscription>({
				model: "subscription",
				where: [
					{
						field: "stripeSubscriptionId",
						value: "sub_deleted",
					},
				],
			});

			expect(updatedSubscription?.status).toBe("canceled");
		}
	});

	it("should test schema structure", async () => {
		// Verify the schema structure was properly created in the database
		const models = await ctx.adapter.introspect();

		// Check the Customer model exists
		const customerModel = models.find((m) => m.name === "customer");
		expect(customerModel).toBeDefined();
		expect(customerModel?.fields).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ name: "stripeCustomerId" }),
				expect.objectContaining({ name: "userId" }),
			]),
		);

		// Check the Subscription model exists
		const subscriptionModel = models.find((m) => m.name === "subscription");
		expect(subscriptionModel).toBeDefined();
		expect(subscriptionModel?.fields).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ name: "plan" }),
				expect.objectContaining({ name: "status" }),
				expect.objectContaining({ name: "referenceId" }),
				expect.objectContaining({ name: "stripeCustomerId" }),
			]),
		);
	});

	it("should cancel a subscription", async () => {
		const { headers, response: userRes } = await getHeader();

		// First create a subscription
		await authClient.subscription.upgrade({
			plan: "starter",
			fetchOptions: {
				headers,
			},
		});

		// Mock the Stripe client's billingPortal.sessions.create method
		const originalCreate = _stripe.billingPortal.sessions.create;
		_stripe.billingPortal.sessions.create = jest.fn().mockResolvedValue({
			url: "https://stripe.com/billing/portal",
		});

		// Call the cancel subscription endpoint
		const cancelRes = await authClient.subscription.cancel({
			returnUrl: "/account",
			fetchOptions: {
				headers,
			},
		});

		// Restore the original method
		_stripe.billingPortal.sessions.create = originalCreate;

		expect(cancelRes).toMatchObject({
			url: "https://stripe.com/billing/portal",
			redirect: true,
		});
	});
});
