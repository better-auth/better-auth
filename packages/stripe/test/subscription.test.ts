import { getTestInstance } from "better-auth/test";
import type Stripe from "stripe";
import { describe, expect, vi } from "vitest";
import { stripe } from "../src";
import { stripeClient } from "../src/client";
import type { StripeOptions, Subscription } from "../src/types";
import {
	createPrice,
	createSubscriptionEvent,
	createSubscriptionItem,
} from "./_factories";
import { TEST_PRICES, test } from "./_fixtures";

describe("stripe subscription", () => {
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
						priceId: TEST_PRICES.premium,
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
		} satisfies StripeOptions;

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
		} satisfies StripeOptions;

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
								price: { id: TEST_PRICES.starter },
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
								price: { id: TEST_PRICES.starter },
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
			const webhookEvent = createSubscriptionEvent(
				"customer.subscription.deleted",
				{
					id: "sub_trial_deleted_propagate",
					customer: "cus_trial_deleted_propagate",
					status: "canceled",
					trial_start: trialStart,
					trial_end: trialEnd,
					canceled_at: now,
					ended_at: now,
				},
			);

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
			const webhookEvent = createSubscriptionEvent(
				"customer.subscription.updated",
				{
					id: "sub_trial_updated_propagate",
					customer: "cus_trial_updated_propagate",
					trial_start: trialStart,
					trial_end: trialEnd,
					metadata: { subscriptionId },
					items: {
						object: "list",
						data: [
							createSubscriptionItem({
								id: "si_test_item",
								price: createPrice({
									id: TEST_PRICES.starter,
								}),
								current_period_start: now,
								current_period_end: periodEnd,
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
			const deleteEvent = createSubscriptionEvent(
				"customer.subscription.deleted",
				{
					id: "sub_trial_abuse_old",
					customer: "cus_trial_abuse",
					status: "canceled",
					trial_start: trialStart,
					trial_end: trialEnd,
					canceled_at: now,
					ended_at: now,
				},
			);

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
								price: { id: TEST_PRICES.starter },
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
								price: { id: TEST_PRICES.premium },
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
								price: { id: TEST_PRICES.premium },
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
								price: { id: TEST_PRICES.starter },
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
								price: { id: TEST_PRICES.starter },
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
});
