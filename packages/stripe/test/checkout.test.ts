import { getTestInstance } from "better-auth/test";
import type Stripe from "stripe";
import { describe, expect, vi } from "vitest";
import { stripe } from "../src";
import { stripeClient } from "../src/client";
import type { StripeOptions, Subscription } from "../src/types";
import type { StripeMock } from "./_fixtures";
import {
	TEST_LOOKUP_KEYS,
	TEST_PRICES,
	TEST_WEBHOOK_SECRET,
	test,
} from "./_fixtures";

const testUser = {
	email: "test@email.com",
	password: "password",
	name: "Test User",
};

describe("stripe checkout", () => {
	describe("line item replacement on plan change", () => {
		const buildLineItemOptions = (mock: StripeMock): StripeOptions => ({
			stripeClient: mock as unknown as Stripe,
			stripeWebhookSecret: TEST_WEBHOOK_SECRET,
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
		}) => {
			vi.clearAllMocks();

			const { client, auth, sessionSetter } = await getTestInstance(
				{
					database: memory,
					plugins: [stripe(buildLineItemOptions(stripeMock))],
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
		}) => {
			vi.clearAllMocks();

			const { client, auth, sessionSetter } = await getTestInstance(
				{
					database: memory,
					plugins: [stripe(buildLineItemOptions(stripeMock))],
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
		const buildAsymmetricOptions = (mock: StripeMock): StripeOptions => ({
			stripeClient: mock as unknown as Stripe,
			stripeWebhookSecret: TEST_WEBHOOK_SECRET,
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
		}) => {
			vi.clearAllMocks();

			const { client, auth, sessionSetter } = await getTestInstance(
				{
					database: memory,
					plugins: [stripe(buildAsymmetricOptions(stripeMock))],
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
		}) => {
			vi.clearAllMocks();

			const { client, auth, sessionSetter } = await getTestInstance(
				{
					database: memory,
					plugins: [stripe(buildAsymmetricOptions(stripeMock))],
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
		const buildAsymmetricOptions = (mock: StripeMock): StripeOptions => ({
			stripeClient: mock as unknown as Stripe,
			stripeWebhookSecret: TEST_WEBHOOK_SECRET,
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
		}) => {
			vi.clearAllMocks();

			const { client, auth, sessionSetter } = await getTestInstance(
				{
					database: memory,
					plugins: [stripe(buildAsymmetricOptions(stripeMock))],
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
		}) => {
			vi.clearAllMocks();

			const { client, auth, sessionSetter } = await getTestInstance(
				{
					database: memory,
					plugins: [stripe(buildAsymmetricOptions(stripeMock))],
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
												id: TEST_PRICES.starter,
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
			stripeForTest.checkout.sessions.retrieve.mockResolvedValue({
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
			expect(updated?.periodStart?.getTime()).not.toBeNaN();
			expect(updated?.periodEnd).toBeInstanceOf(Date);
			expect(updated?.periodEnd?.getTime()).not.toBeNaN();
		});

		test("should redirect without update when checkoutSessionId is missing", async ({
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
												id: TEST_PRICES.starter,
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

			stripeForTest.checkout.sessions.retrieve.mockResolvedValue({
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
		const buildTrialOptions = (mock: StripeMock): StripeOptions => ({
			stripeClient: mock as unknown as Stripe,
			stripeWebhookSecret: TEST_WEBHOOK_SECRET,
			createCustomerOnSignUp: true,
			subscription: {
				enabled: true,
				plans: [
					{
						priceId: TEST_PRICES.starter,
						name: "starter",
						lookupKey: TEST_LOOKUP_KEYS.starter,
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
		}) => {
			const { client, sessionSetter } = await getTestInstance(
				{
					database: memory,
					plugins: [stripe(buildTrialOptions(stripeMock))],
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
							priceId: TEST_PRICES.starter,
							name: "starter",
							lookupKey: TEST_LOOKUP_KEYS.starter,
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
							priceId: TEST_PRICES.starter,
							name: "starter",
							lookupKey: TEST_LOOKUP_KEYS.starter,
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
							priceId: TEST_PRICES.starter,
							name: "starter",
							lookupKey: TEST_LOOKUP_KEYS.starter,
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
							priceId: TEST_PRICES.starter,
							name: "starter",
							lookupKey: TEST_LOOKUP_KEYS.starter,
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
							priceId: TEST_PRICES.starter,
							name: "starter",
							lookupKey: TEST_LOOKUP_KEYS.starter,
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
							priceId: TEST_PRICES.starter,
							name: "starter",
							lookupKey: TEST_LOOKUP_KEYS.starter,
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
		}) => {
			const { client, sessionSetter } = await getTestInstance(
				{
					database: memory,
					plugins: [stripe(buildTrialOptions(stripeMock))],
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
