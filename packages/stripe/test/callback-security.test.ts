import { organizationClient } from "better-auth/client/plugins";
import { organization } from "better-auth/plugins/organization";
import { getTestInstance } from "better-auth/test";
import type Stripe from "stripe";
import { describe, expect, it, vi } from "vitest";
import { stripe } from "../src";
import { stripeClient } from "../src/client";
import type { StripeOptions, Subscription } from "../src/types";

/**
 * Security tests for Stripe callback endpoints
 *
 * Issue 1: No subscription ownership authorization check after fetching subscription by ID
 *          from query params - any authenticated user could provide another user's/org's subscriptionId
 *
 * Issue 2: Early-exit throw ctx.redirect() calls inside try blocks get caught by catch handlers
 *          and logged as errors, polluting error logs with non-error conditions
 */
describe("stripe callback security", () => {
	const createMockStripe = () => ({
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
					id: "cs_mock123",
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
	});

	const testUser1 = {
		email: "user1@example.com",
		password: "password123",
		name: "User One",
	};

	const testUser2 = {
		email: "user2@example.com",
		password: "password123",
		name: "User Two",
	};

	describe("cancelSubscriptionCallback - ownership authorization", () => {
		/**
		 * @see https://github.com/better-auth/better-auth/issues/TBD
		 * Tests that a user cannot manipulate another user's subscription via the cancel callback endpoint
		 */
		it("should not allow a user to access another user's subscription", async () => {
			const mockStripe = createMockStripe();
			// Mock stripe to return active subscription with pending cancel
			mockStripe.subscriptions.list.mockResolvedValue({
				data: [
					{
						id: "sub_user1_123",
						status: "active",
						cancel_at_period_end: true,
						cancel_at: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
						canceled_at: Math.floor(Date.now() / 1000),
						cancellation_details: { reason: "cancellation_requested" },
					},
				],
			});

			const stripeOptions: StripeOptions = {
				stripeClient: mockStripe as unknown as Stripe,
				stripeWebhookSecret: "whsec_test",
				subscription: {
					enabled: true,
					plans: [
						{ priceId: "price_starter", name: "starter" },
						{ priceId: "price_premium", name: "premium" },
					],
				},
			};

			const { client, auth, sessionSetter } = await getTestInstance(
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
			const ctx = await auth.$context;

			// Create user1 and their subscription
			await client.signUp.email(testUser1, { throw: true });
			const headers1 = new Headers();
			await client.signIn.email(testUser1, {
				throw: true,
				onSuccess: sessionSetter(headers1),
			});

			// Get user1's ID
			const user1 = await ctx.adapter.findOne<{ id: string }>({
				model: "user",
				where: [{ field: "email", value: testUser1.email }],
			});

			// Create user1's subscription
			const user1Subscription = await ctx.adapter.create<Subscription>({
				model: "subscription",
				data: {
					referenceId: user1!.id,
					stripeCustomerId: "cus_user1_123",
					stripeSubscriptionId: "sub_user1_123",
					status: "active",
					plan: "starter",
				},
			});

			// Create user2 and sign in
			await client.signUp.email(testUser2, { throw: true });
			const headers2 = new Headers();
			await client.signIn.email(testUser2, {
				throw: true,
				onSuccess: sessionSetter(headers2),
			});

			// User2 tries to access user1's subscription via cancel callback
			const callbackUrl = new URL(
				"http://localhost:3000/api/auth/subscription/cancel/callback",
			);
			callbackUrl.searchParams.set("callbackURL", "/dashboard");
			callbackUrl.searchParams.set("subscriptionId", user1Subscription.id);

			const response = await auth.handler(
				new Request(callbackUrl.toString(), {
					method: "GET",
					headers: headers2, // User2's session
				}),
			);

			// Should redirect (302) but NOT process the cancellation
			expect(response.status).toBe(302);

			// Verify user1's subscription was NOT modified by user2
			const unchangedSub = await ctx.adapter.findOne<Subscription>({
				model: "subscription",
				where: [{ field: "id", value: user1Subscription.id }],
			});

			// The subscription should remain unchanged - no cancel fields should be set
			// If the ownership check is missing, these fields would be updated
			expect(unchangedSub?.cancelAtPeriodEnd).toBeFalsy();
			expect(unchangedSub?.cancelAt).toBeNull();
			expect(unchangedSub?.canceledAt).toBeNull();

			// Stripe API should NOT have been called with user1's customer ID
			expect(mockStripe.subscriptions.list).not.toHaveBeenCalledWith(
				expect.objectContaining({
					customer: "cus_user1_123",
				}),
			);
		});
	});

	describe("subscriptionSuccess - ownership authorization", () => {
		/**
		 * @see https://github.com/better-auth/better-auth/issues/TBD
		 * Tests that a user cannot manipulate another user's subscription via the success callback endpoint
		 */
		it("should not allow a user to access another user's subscription", async () => {
			const mockStripe = createMockStripe();
			// Mock stripe to return active subscription
			mockStripe.subscriptions.list.mockResolvedValue({
				data: [
					{
						id: "sub_user1_123",
						status: "active",
						cancel_at_period_end: false,
						items: {
							data: [
								{
									price: {
										id: "price_starter",
										recurring: { interval: "month" },
									},
									current_period_start: Math.floor(Date.now() / 1000),
									current_period_end:
										Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
								},
							],
						},
					},
				],
			});

			const stripeOptions: StripeOptions = {
				stripeClient: mockStripe as unknown as Stripe,
				stripeWebhookSecret: "whsec_test",
				subscription: {
					enabled: true,
					plans: [
						{ priceId: "price_starter", name: "starter" },
						{ priceId: "price_premium", name: "premium" },
					],
				},
			};

			const { client, auth, sessionSetter } = await getTestInstance(
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
			const ctx = await auth.$context;

			// Create user1 and their subscription
			await client.signUp.email(testUser1, { throw: true });
			const headers1 = new Headers();
			await client.signIn.email(testUser1, {
				throw: true,
				onSuccess: sessionSetter(headers1),
			});

			// Get user1's ID
			const user1 = await ctx.adapter.findOne<{
				id: string;
				stripeCustomerId?: string;
			}>({
				model: "user",
				where: [{ field: "email", value: testUser1.email }],
			});

			// Create user1's subscription (incomplete status - waiting for payment)
			const user1Subscription = await ctx.adapter.create<Subscription>({
				model: "subscription",
				data: {
					referenceId: user1!.id,
					stripeCustomerId: "cus_user1_123",
					stripeSubscriptionId: "sub_user1_123",
					status: "incomplete",
					plan: "starter",
				},
			});

			// Create user2 and sign in
			await client.signUp.email(testUser2, { throw: true });
			const headers2 = new Headers();
			await client.signIn.email(testUser2, {
				throw: true,
				onSuccess: sessionSetter(headers2),
			});

			// User2 tries to access user1's subscription via success callback
			const successUrl = new URL(
				"http://localhost:3000/api/auth/subscription/success",
			);
			successUrl.searchParams.set("callbackURL", "/dashboard");
			successUrl.searchParams.set("subscriptionId", user1Subscription.id);

			const response = await auth.handler(
				new Request(successUrl.toString(), {
					method: "GET",
					headers: headers2, // User2's session
				}),
			);

			// Should redirect (302) but NOT process the subscription update
			expect(response.status).toBe(302);

			// Verify user1's subscription was NOT modified by user2
			const unchangedSub = await ctx.adapter.findOne<Subscription>({
				model: "subscription",
				where: [{ field: "id", value: user1Subscription.id }],
			});

			// The subscription should remain incomplete - not updated to active
			// If the ownership check is missing, this would be updated to "active"
			expect(unchangedSub?.status).toBe("incomplete");
		});
	});

	describe("organization subscription access", () => {
		/**
		 * Tests that organization members CAN access their organization's subscription
		 */
		it("should allow organization member to access org subscription via cancel callback", async () => {
			const mockStripe = createMockStripe();
			// Mock stripe to return active subscription with pending cancel
			mockStripe.subscriptions.list.mockResolvedValue({
				data: [
					{
						id: "sub_org_123",
						status: "active",
						cancel_at_period_end: true,
						cancel_at: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
						canceled_at: Math.floor(Date.now() / 1000),
						cancellation_details: { reason: "cancellation_requested" },
					},
				],
			});

			const stripeOptions: StripeOptions = {
				stripeClient: mockStripe as unknown as Stripe,
				stripeWebhookSecret: "whsec_test",
				organization: {
					enabled: true,
				},
				subscription: {
					enabled: true,
					plans: [{ priceId: "price_starter", name: "starter" }],
					authorizeReference: async () => true,
				},
			};

			const { client, auth, sessionSetter } = await getTestInstance(
				{
					plugins: [organization(), stripe(stripeOptions)],
				},
				{
					disableTestUser: true,
					clientOptions: {
						plugins: [
							organizationClient(),
							stripeClient({ subscription: true }),
						],
					},
				},
			);
			const ctx = await auth.$context;

			// Create user and sign in
			await client.signUp.email(testUser1, { throw: true });
			const headers = new Headers();
			await client.signIn.email(testUser1, {
				throw: true,
				onSuccess: sessionSetter(headers),
			});

			// Create organization
			const org = await client.organization.create({
				name: "Test Org",
				slug: "test-org",
				fetchOptions: { headers },
			});
			const orgId = org.data?.id as string;

			// Create organization subscription
			const orgSubscription = await ctx.adapter.create<Subscription>({
				model: "subscription",
				data: {
					referenceId: orgId, // Organization owns the subscription
					stripeCustomerId: "cus_org_123",
					stripeSubscriptionId: "sub_org_123",
					status: "active",
					plan: "starter",
				},
			});

			// User (who is an org member) accesses the org's subscription
			const callbackUrl = new URL(
				"http://localhost:3000/api/auth/subscription/cancel/callback",
			);
			callbackUrl.searchParams.set("callbackURL", "/dashboard");
			callbackUrl.searchParams.set("subscriptionId", orgSubscription.id);

			const response = await auth.handler(
				new Request(callbackUrl.toString(), {
					method: "GET",
					headers,
				}),
			);

			// Should redirect (302) and process the cancellation since user is org member
			expect(response.status).toBe(302);

			// Verify subscription WAS updated (member has access)
			const updatedSub = await ctx.adapter.findOne<Subscription>({
				model: "subscription",
				where: [{ field: "id", value: orgSubscription.id }],
			});

			expect(updatedSub?.cancelAtPeriodEnd).toBe(true);
		});

		/**
		 * Tests that non-members cannot access organization subscriptions
		 */
		it("should not allow non-member to access org subscription", async () => {
			const mockStripe = createMockStripe();
			mockStripe.subscriptions.list.mockResolvedValue({
				data: [
					{
						id: "sub_org_123",
						status: "active",
						cancel_at_period_end: true,
						cancel_at: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
						canceled_at: Math.floor(Date.now() / 1000),
						cancellation_details: { reason: "cancellation_requested" },
					},
				],
			});

			const stripeOptions: StripeOptions = {
				stripeClient: mockStripe as unknown as Stripe,
				stripeWebhookSecret: "whsec_test",
				organization: {
					enabled: true,
				},
				subscription: {
					enabled: true,
					plans: [{ priceId: "price_starter", name: "starter" }],
					authorizeReference: async () => true,
				},
			};

			const { client, auth, sessionSetter } = await getTestInstance(
				{
					plugins: [organization(), stripe(stripeOptions)],
				},
				{
					disableTestUser: true,
					clientOptions: {
						plugins: [
							organizationClient(),
							stripeClient({ subscription: true }),
						],
					},
				},
			);
			const ctx = await auth.$context;

			// Create user1 (org owner) and sign in
			await client.signUp.email(testUser1, { throw: true });
			const headers1 = new Headers();
			await client.signIn.email(testUser1, {
				throw: true,
				onSuccess: sessionSetter(headers1),
			});

			// Create organization
			const org = await client.organization.create({
				name: "Test Org",
				slug: "test-org-security",
				fetchOptions: { headers: headers1 },
			});
			const orgId = org.data?.id as string;

			// Create organization subscription
			const orgSubscription = await ctx.adapter.create<Subscription>({
				model: "subscription",
				data: {
					referenceId: orgId,
					stripeCustomerId: "cus_org_123",
					stripeSubscriptionId: "sub_org_123",
					status: "active",
					plan: "starter",
				},
			});

			// Create user2 (NOT an org member) and sign in
			await client.signUp.email(testUser2, { throw: true });
			const headers2 = new Headers();
			await client.signIn.email(testUser2, {
				throw: true,
				onSuccess: sessionSetter(headers2),
			});

			// User2 tries to access org subscription they're not a member of
			const callbackUrl = new URL(
				"http://localhost:3000/api/auth/subscription/cancel/callback",
			);
			callbackUrl.searchParams.set("callbackURL", "/dashboard");
			callbackUrl.searchParams.set("subscriptionId", orgSubscription.id);

			const response = await auth.handler(
				new Request(callbackUrl.toString(), {
					method: "GET",
					headers: headers2, // Non-member's session
				}),
			);

			// Should redirect but NOT process the cancellation
			expect(response.status).toBe(302);

			// Verify subscription was NOT modified
			const unchangedSub = await ctx.adapter.findOne<Subscription>({
				model: "subscription",
				where: [{ field: "id", value: orgSubscription.id }],
			});

			expect(unchangedSub?.cancelAtPeriodEnd).toBeFalsy();
		});
	});

	describe("redirect logging behavior", () => {
		/**
		 * Tests that redirect exceptions in callback endpoints are not logged as errors
		 */
		it("should not log redirect as error in cancelSubscriptionCallback", async () => {
			const mockStripe = createMockStripe();
			const errorLogs: string[] = [];

			const stripeOptions: StripeOptions = {
				stripeClient: mockStripe as unknown as Stripe,
				stripeWebhookSecret: "whsec_test",
				subscription: {
					enabled: true,
					plans: [{ priceId: "price_starter", name: "starter" }],
				},
			};

			const { client, auth, sessionSetter } = await getTestInstance(
				{
					plugins: [stripe(stripeOptions)],
					logger: {
						level: "error",
						log: () => {},
						error: (message: string, ...args: unknown[]) => {
							errorLogs.push(String(message));
						},
						warn: () => {},
						info: () => {},
						debug: () => {},
						success: () => {},
					},
				},
				{
					disableTestUser: true,
					clientOptions: {
						plugins: [stripeClient({ subscription: true })],
					},
				},
			);
			const ctx = await auth.$context;

			// Create user and sign in
			await client.signUp.email(testUser1, { throw: true });
			const headers = new Headers();
			await client.signIn.email(testUser1, {
				throw: true,
				onSuccess: sessionSetter(headers),
			});

			const user = await ctx.adapter.findOne<{ id: string }>({
				model: "user",
				where: [{ field: "email", value: testUser1.email }],
			});

			// Create a subscription that is already canceled (should trigger early redirect)
			const subscription = await ctx.adapter.create<Subscription>({
				model: "subscription",
				data: {
					referenceId: user!.id,
					stripeCustomerId: "cus_user1_123",
					stripeSubscriptionId: "sub_user1_123",
					status: "canceled", // Already canceled - will trigger early exit
					plan: "starter",
				},
			});

			// Call the cancel callback - this should redirect without logging an error
			const callbackUrl = new URL(
				"http://localhost:3000/api/auth/subscription/cancel/callback",
			);
			callbackUrl.searchParams.set("callbackURL", "/dashboard");
			callbackUrl.searchParams.set("subscriptionId", subscription.id);

			const response = await auth.handler(
				new Request(callbackUrl.toString(), {
					method: "GET",
					headers,
				}),
			);

			// Should redirect successfully
			expect(response.status).toBe(302);

			// Should NOT have logged any error about checking subscription status
			// If the redirect is caught by the catch block, it will log an error
			const hasSubscriptionError = errorLogs.some(
				(log) =>
					log.includes("Error checking subscription status") ||
					log.includes("redirect"),
			);
			expect(hasSubscriptionError).toBe(false);
		});
	});
});
