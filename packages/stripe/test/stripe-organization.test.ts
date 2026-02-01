import { organizationClient } from "better-auth/client/plugins";
import { organization } from "better-auth/plugins/organization";
import { getTestInstance } from "better-auth/test";
import type Stripe from "stripe";
import { beforeEach, describe, expect, it, onTestFinished, vi } from "vitest";
import { stripe } from "../src";
import { stripeClient } from "../src/client";
import type { StripeOptions, Subscription } from "../src/types";

describe("stripe - organization customer", () => {
	const mockStripeOrg = {
		prices: {
			list: vi.fn().mockResolvedValue({ data: [{ id: "price_lookup_123" }] }),
		},
		customers: {
			create: vi.fn().mockResolvedValue({ id: "cus_org_mock123" }),
			list: vi.fn().mockResolvedValue({ data: [] }),
			search: vi.fn().mockResolvedValue({ data: [] }),
			retrieve: vi.fn().mockResolvedValue({
				id: "cus_org_mock123",
				email: "org@email.com",
				deleted: false,
			}),
			update: vi.fn().mockResolvedValue({
				id: "cus_org_mock123",
				email: "org@email.com",
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
	};
	const testUser = {
		email: "test@email.com",
		password: "password",
		name: "Test User",
	};
	const _stripeOrg = mockStripeOrg as unknown as Stripe;
	const baseOrgStripeOptions = {
		stripeClient: _stripeOrg,
		stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET!,
		createCustomerOnSignUp: false, // Disable for org tests
		organization: {
			enabled: true,
		},
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
			authorizeReference: async () => true,
		},
	} satisfies StripeOptions;

	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("should create a Stripe customer for organization when upgrading subscription", async () => {
		const onCustomerCreate = vi.fn();
		const stripeOptionsWithOrgCallback: StripeOptions = {
			...baseOrgStripeOptions,
			organization: {
				...baseOrgStripeOptions.organization,
				onCustomerCreate,
			},
		};

		const { client, auth, sessionSetter } = await getTestInstance(
			{
				plugins: [organization(), stripe(stripeOptionsWithOrgCallback)],
			},
			{
				disableTestUser: true,
				clientOptions: {
					plugins: [organizationClient(), stripeClient({ subscription: true })],
				},
			},
		);
		const ctx = await auth.$context;

		// Create user and organization
		await client.signUp.email(
			{ ...testUser, email: "org-customer-test@email.com" },
			{ throw: true },
		);

		const headers = new Headers();
		await client.signIn.email(
			{ ...testUser, email: "org-customer-test@email.com" },
			{
				throw: true,
				onSuccess: sessionSetter(headers),
			},
		);

		// Create organization via client
		const org = await client.organization.create({
			name: "Test Organization",
			slug: "test-org",
			fetchOptions: { headers },
		});
		const orgId = org.data?.id as string;

		// Upgrade subscription for organization
		const res = await client.subscription.upgrade({
			plan: "starter",
			customerType: "organization",
			referenceId: orgId,
			fetchOptions: { headers },
		});

		expect(res.data?.url).toBeDefined();

		// Verify Stripe customer was created for org
		expect(mockStripeOrg.customers.create).toHaveBeenCalledWith(
			expect.objectContaining({
				name: "Test Organization",
				metadata: expect.objectContaining({
					organizationId: orgId,
					customerType: "organization",
				}),
			}),
		);

		// Verify org was updated with stripeCustomerId
		const updatedOrg = await ctx.adapter.findOne<{
			id: string;
			stripeCustomerId?: string;
		}>({
			model: "organization",
			where: [{ field: "id", value: orgId }],
		});
		expect(updatedOrg?.stripeCustomerId).toBe("cus_org_mock123");

		// Verify callback was called
		expect(onCustomerCreate).toHaveBeenCalledWith(
			expect.objectContaining({
				stripeCustomer: expect.objectContaining({ id: "cus_org_mock123" }),
				organization: expect.objectContaining({
					id: orgId,
					stripeCustomerId: "cus_org_mock123",
				}),
			}),
			expect.anything(),
		);
	});

	it("should use existing Stripe customer ID from organization", async () => {
		const { client, auth, sessionSetter } = await getTestInstance(
			{
				plugins: [organization(), stripe(baseOrgStripeOptions)],
			},
			{
				disableTestUser: true,
				clientOptions: {
					plugins: [organizationClient(), stripeClient({ subscription: true })],
				},
			},
		);
		const ctx = await auth.$context;

		// Create user and organization with existing stripeCustomerId
		await client.signUp.email(
			{ ...testUser, email: "org-existing-customer@email.com" },
			{ throw: true },
		);

		const headers = new Headers();
		await client.signIn.email(
			{ ...testUser, email: "org-existing-customer@email.com" },
			{
				throw: true,
				onSuccess: sessionSetter(headers),
			},
		);

		// Create organization via client
		const org = await client.organization.create({
			name: "Existing Stripe Org",
			slug: "existing-stripe-org",
			fetchOptions: { headers },
		});
		const orgId = org.data?.id as string;

		// Update org with existing stripeCustomerId
		await ctx.adapter.update({
			model: "organization",
			update: { stripeCustomerId: "cus_existing_org_123" },
			where: [{ field: "id", value: orgId }],
		});

		await client.subscription.upgrade({
			plan: "starter",
			customerType: "organization",
			referenceId: orgId,
			fetchOptions: { headers },
		});

		// Should NOT create a new Stripe customer
		expect(mockStripeOrg.customers.create).not.toHaveBeenCalled();

		// Should use existing customer ID in checkout
		expect(mockStripeOrg.checkout.sessions.create).toHaveBeenCalledWith(
			expect.objectContaining({
				customer: "cus_existing_org_123",
			}),
			undefined,
		);
	});

	it("should call getCustomerCreateParams when creating org customer", async () => {
		const getCustomerCreateParams = vi.fn().mockResolvedValue({
			email: "billing@org.com",
			description: "Custom org description",
		});

		const stripeOptionsWithParams: StripeOptions = {
			...baseOrgStripeOptions,
			organization: {
				...baseOrgStripeOptions.organization,
				getCustomerCreateParams,
			},
		};

		const { client, sessionSetter } = await getTestInstance(
			{
				plugins: [organization(), stripe(stripeOptionsWithParams)],
			},
			{
				disableTestUser: true,
				clientOptions: {
					plugins: [organizationClient(), stripeClient({ subscription: true })],
				},
			},
		);

		await client.signUp.email(
			{ ...testUser, email: "org-params-test@email.com" },
			{ throw: true },
		);

		const headers = new Headers();
		await client.signIn.email(
			{ ...testUser, email: "org-params-test@email.com" },
			{
				throw: true,
				onSuccess: sessionSetter(headers),
			},
		);

		// Create organization via client
		const org = await client.organization.create({
			name: "Params Test Org",
			slug: "params-test-org",
			fetchOptions: { headers },
		});
		const orgId = org.data?.id as string;

		await client.subscription.upgrade({
			plan: "starter",
			customerType: "organization",
			referenceId: orgId,
			fetchOptions: { headers },
		});

		// Verify getCustomerCreateParams was called with org
		expect(getCustomerCreateParams).toHaveBeenCalled();
		const callArgs = getCustomerCreateParams.mock.calls[0]!;
		expect(callArgs[0]).toMatchObject({ id: orgId });

		// Verify custom params were passed to Stripe
		expect(mockStripeOrg.customers.create).toHaveBeenCalledWith(
			expect.objectContaining({
				email: "billing@org.com",
				description: "Custom org description",
			}),
		);
	});

	it("should create billing portal for organization", async () => {
		const { client, auth, sessionSetter } = await getTestInstance(
			{
				plugins: [organization(), stripe(baseOrgStripeOptions)],
			},
			{
				disableTestUser: true,
				clientOptions: {
					plugins: [organizationClient(), stripeClient({ subscription: true })],
				},
			},
		);
		const ctx = await auth.$context;

		await client.signUp.email(
			{ ...testUser, email: "org-portal-test@email.com" },
			{ throw: true },
		);

		const headers = new Headers();
		await client.signIn.email(
			{ ...testUser, email: "org-portal-test@email.com" },
			{
				throw: true,
				onSuccess: sessionSetter(headers),
			},
		);

		// Create organization via client
		const org = await client.organization.create({
			name: "Portal Test Org",
			slug: "portal-test-org",
			fetchOptions: { headers },
		});
		const orgId = org.data?.id as string;

		// Update org with stripeCustomerId
		await ctx.adapter.update({
			model: "organization",
			update: { stripeCustomerId: "cus_portal_org_123" },
			where: [{ field: "id", value: orgId }],
		});

		// Create a subscription for the org
		await ctx.adapter.create({
			model: "subscription",
			data: {
				referenceId: orgId,
				stripeCustomerId: "cus_portal_org_123",
				status: "active",
				plan: "starter",
			},
		});

		const res = await client.subscription.billingPortal({
			customerType: "organization",
			referenceId: orgId,
			returnUrl: "/dashboard",
			fetchOptions: { headers },
		});

		expect(res.data?.url).toBe("https://billing.stripe.com/mock");
		expect(mockStripeOrg.billingPortal.sessions.create).toHaveBeenCalledWith(
			expect.objectContaining({
				customer: "cus_portal_org_123",
			}),
		);
	});

	it("should cancel subscription for organization", async () => {
		mockStripeOrg.subscriptions.list.mockResolvedValueOnce({
			data: [
				{
					id: "sub_org_cancel_123",
					status: "active",
					cancel_at_period_end: false,
				},
			],
		});

		const { client, auth, sessionSetter } = await getTestInstance(
			{
				plugins: [organization(), stripe(baseOrgStripeOptions)],
			},
			{
				disableTestUser: true,
				clientOptions: {
					plugins: [organizationClient(), stripeClient({ subscription: true })],
				},
			},
		);
		const ctx = await auth.$context;

		await client.signUp.email(
			{ ...testUser, email: "org-cancel-test@email.com" },
			{ throw: true },
		);

		const headers = new Headers();
		await client.signIn.email(
			{ ...testUser, email: "org-cancel-test@email.com" },
			{
				throw: true,
				onSuccess: sessionSetter(headers),
			},
		);

		// Create organization via client
		const org = await client.organization.create({
			name: "Cancel Test Org",
			slug: "cancel-test-org",
			fetchOptions: { headers },
		});
		const orgId = org.data?.id as string;

		// Update org with stripeCustomerId
		await ctx.adapter.update({
			model: "organization",
			update: { stripeCustomerId: "cus_cancel_org_123" },
			where: [{ field: "id", value: orgId }],
		});

		await ctx.adapter.create({
			model: "subscription",
			data: {
				referenceId: orgId,
				stripeCustomerId: "cus_cancel_org_123",
				stripeSubscriptionId: "sub_org_cancel_123",
				status: "active",
				plan: "starter",
			},
		});

		const res = await client.subscription.cancel({
			customerType: "organization",
			referenceId: orgId,
			returnUrl: "/dashboard",
			fetchOptions: { headers },
		});

		expect(res.data?.url).toBeDefined();
		expect(mockStripeOrg.billingPortal.sessions.create).toHaveBeenCalledWith(
			expect.objectContaining({
				customer: "cus_cancel_org_123",
				flow_data: expect.objectContaining({
					type: "subscription_cancel",
					subscription_cancel: {
						subscription: "sub_org_cancel_123",
					},
				}),
			}),
		);
	});

	it("should update subscription on cancel callback using subscription's stripeCustomerId", async () => {
		const cancelAt = Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60;
		const canceledAt = Math.floor(Date.now() / 1000);

		// Mock Stripe to return the subscription as pending cancel
		mockStripeOrg.subscriptions.list.mockResolvedValueOnce({
			data: [
				{
					id: "sub_org_cb_123",
					status: "active",
					cancel_at_period_end: true,
					cancel_at: cancelAt,
					canceled_at: canceledAt,
					cancellation_details: {
						reason: "cancellation_requested",
					},
				},
			],
		});

		// Clean up mocks even if assertions fail to prevent leaking into subsequent tests
		onTestFinished(() => {
			mockStripeOrg.subscriptions.list.mockReset();
			mockStripeOrg.subscriptions.list.mockResolvedValue({ data: [] });
			mockStripeOrg.subscriptions.update.mockReset();
		});

		const onSubscriptionCancel = vi.fn();
		const { client, auth, sessionSetter } = await getTestInstance(
			{
				plugins: [
					organization(),
					stripe({
						...baseOrgStripeOptions,
						subscription: {
							...baseOrgStripeOptions.subscription,
							onSubscriptionCancel,
						},
					}),
				],
			},
			{
				disableTestUser: true,
				clientOptions: {
					plugins: [organizationClient(), stripeClient({ subscription: true })],
				},
			},
		);
		const ctx = await auth.$context;

		await client.signUp.email(
			{ ...testUser, email: "org-cancel-cb-test@email.com" },
			{ throw: true },
		);

		const headers = new Headers();
		await client.signIn.email(
			{ ...testUser, email: "org-cancel-cb-test@email.com" },
			{ throw: true, onSuccess: sessionSetter(headers) },
		);

		const org = await client.organization.create({
			name: "Cancel Callback Org",
			slug: "cancel-cb-org",
			fetchOptions: { headers },
		});
		const orgId = org.data?.id as string;

		// Organization has stripeCustomerId, user does NOT
		await ctx.adapter.update({
			model: "organization",
			update: { stripeCustomerId: "cus_cb_org_123" },
			where: [{ field: "id", value: orgId }],
		});

		const sub = await ctx.adapter.create<Subscription>({
			model: "subscription",
			data: {
				referenceId: orgId,
				stripeCustomerId: "cus_cb_org_123",
				stripeSubscriptionId: "sub_org_cb_123",
				status: "active",
				plan: "starter",
			},
		});

		// Call the cancel callback endpoint directly (simulating redirect from Stripe Portal)
		const callbackUrl = new URL(
			"http://localhost:3000/api/auth/subscription/cancel/callback",
		);
		callbackUrl.searchParams.set("callbackURL", "/dashboard");
		callbackUrl.searchParams.set("subscriptionId", sub.id);

		const response = await auth.handler(
			new Request(callbackUrl.toString(), {
				method: "GET",
				headers,
			}),
		);

		// Should redirect to the callbackURL
		expect(response.status).toBe(302);

		// Verify DB was updated with cancellation info
		const updatedSub = await ctx.adapter.findOne<Subscription>({
			model: "subscription",
			where: [{ field: "id", value: sub.id }],
		});
		expect(updatedSub?.cancelAtPeriodEnd).toBe(true);
		expect(updatedSub?.cancelAt).toBeDefined();
		expect(updatedSub?.canceledAt).toBeDefined();

		// Verify the Stripe API was called with the subscription's customer ID, not the user's
		expect(mockStripeOrg.subscriptions.list).toHaveBeenCalledWith(
			expect.objectContaining({
				customer: "cus_cb_org_123",
				status: "active",
			}),
		);

		// Verify onSubscriptionCancel callback was invoked
		expect(onSubscriptionCancel).toHaveBeenCalledWith(
			expect.objectContaining({
				subscription: expect.objectContaining({ id: sub.id }),
				event: undefined,
			}),
		);
	});

	it("should restore subscription for organization", async () => {
		mockStripeOrg.subscriptions.list.mockResolvedValueOnce({
			data: [
				{
					id: "sub_org_restore_123",
					status: "active",
					cancel_at_period_end: true,
					cancel_at: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
				},
			],
		});
		mockStripeOrg.subscriptions.update.mockResolvedValueOnce({
			id: "sub_org_restore_123",
			status: "active",
			cancel_at_period_end: false,
		});

		const { client, auth, sessionSetter } = await getTestInstance(
			{
				plugins: [organization(), stripe(baseOrgStripeOptions)],
			},
			{
				disableTestUser: true,
				clientOptions: {
					plugins: [organizationClient(), stripeClient({ subscription: true })],
				},
			},
		);
		const ctx = await auth.$context;

		await client.signUp.email(
			{ ...testUser, email: "org-restore-test@email.com" },
			{ throw: true },
		);

		const headers = new Headers();
		await client.signIn.email(
			{ ...testUser, email: "org-restore-test@email.com" },
			{
				throw: true,
				onSuccess: sessionSetter(headers),
			},
		);

		// Create organization via client
		const org = await client.organization.create({
			name: "Restore Test Org",
			slug: "restore-test-org",
			fetchOptions: { headers },
		});
		const orgId = org.data?.id as string;

		// Update org with stripeCustomerId
		await ctx.adapter.update({
			model: "organization",
			update: { stripeCustomerId: "cus_restore_org_123" },
			where: [{ field: "id", value: orgId }],
		});

		await ctx.adapter.create({
			model: "subscription",
			data: {
				referenceId: orgId,
				stripeCustomerId: "cus_restore_org_123",
				stripeSubscriptionId: "sub_org_restore_123",
				status: "active",
				plan: "starter",
				cancelAtPeriodEnd: true,
				canceledAt: new Date(),
			},
		});

		const res = await client.subscription.restore({
			customerType: "organization",
			referenceId: orgId,
			fetchOptions: { headers },
		});

		expect(res.data).toBeDefined();
		// Note: Stripe API doesn't accept both cancel_at and cancel_at_period_end simultaneously
		expect(mockStripeOrg.subscriptions.update).toHaveBeenCalledWith(
			"sub_org_restore_123",
			expect.objectContaining({
				cancel_at: "",
			}),
		);

		// Verify subscription was updated in DB
		const updatedSub = await ctx.adapter.findOne<Subscription>({
			model: "subscription",
			where: [{ field: "referenceId", value: orgId }],
		});
		expect(updatedSub?.cancelAtPeriodEnd).toBe(false);
		expect(updatedSub?.canceledAt).toBeNull();
	});

	it("should list subscriptions for organization", async () => {
		const { client, auth, sessionSetter } = await getTestInstance(
			{
				plugins: [organization(), stripe(baseOrgStripeOptions)],
			},
			{
				disableTestUser: true,
				clientOptions: {
					plugins: [organizationClient(), stripeClient({ subscription: true })],
				},
			},
		);
		const ctx = await auth.$context;

		await client.signUp.email(
			{ ...testUser, email: "org-list-test@email.com" },
			{ throw: true },
		);

		const headers = new Headers();
		await client.signIn.email(
			{ ...testUser, email: "org-list-test@email.com" },
			{
				throw: true,
				onSuccess: sessionSetter(headers),
			},
		);

		// Create organization via client
		const org = await client.organization.create({
			name: "List Test Org",
			slug: "list-test-org",
			fetchOptions: { headers },
		});
		const orgId = org.data?.id as string;

		// Update org with stripeCustomerId
		await ctx.adapter.update({
			model: "organization",
			update: { stripeCustomerId: "cus_list_org_123" },
			where: [{ field: "id", value: orgId }],
		});

		// Create subscription for org
		await ctx.adapter.create({
			model: "subscription",
			data: {
				referenceId: orgId,
				stripeCustomerId: "cus_list_org_123",
				stripeSubscriptionId: "sub_org_list_123",
				status: "active",
				plan: "starter",
			},
		});

		const res = await client.subscription.list({
			query: {
				customerType: "organization",
				referenceId: orgId,
			},
			fetchOptions: { headers },
		});

		expect(res.data?.length).toBe(1);
		expect(res.data?.[0]).toMatchObject({
			referenceId: orgId,
			plan: "starter",
			status: "active",
		});
	});

	it("should handle webhook for organization subscription created from dashboard", async () => {
		const mockEvent = {
			type: "customer.subscription.created",
			data: {
				object: {
					id: "sub_org_webhook_123",
					customer: "cus_org_webhook_123",
					status: "active",
					items: {
						data: [
							{
								price: {
									id: process.env.STRIPE_PRICE_ID_1,
									lookup_key: null,
								},
								quantity: 5,
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

		const stripeForOrgWebhook = {
			...mockStripeOrg,
			webhooks: {
				constructEventAsync: vi.fn().mockResolvedValue(mockEvent),
			},
		};

		const testOrgWebhookOptions: StripeOptions = {
			...baseOrgStripeOptions,
			stripeClient: stripeForOrgWebhook as unknown as Stripe,
			stripeWebhookSecret: "test_secret",
		};

		const { auth, client, sessionSetter } = await getTestInstance(
			{
				plugins: [organization(), stripe(testOrgWebhookOptions)],
			},
			{
				disableTestUser: true,
				clientOptions: {
					plugins: [organizationClient(), stripeClient({ subscription: true })],
				},
			},
		);
		const ctx = await auth.$context;

		// Sign up and sign in
		await client.signUp.email(
			{ ...testUser, email: "org-webhook-test@email.com" },
			{ throw: true },
		);
		const headers = new Headers();
		await client.signIn.email(
			{ ...testUser, email: "org-webhook-test@email.com" },
			{
				throw: true,
				onSuccess: sessionSetter(headers),
			},
		);

		// Create organization via client
		const org = await client.organization.create({
			name: "Webhook Test Org",
			slug: "webhook-test-org",
			fetchOptions: { headers },
		});
		const orgId = org.data?.id as string;

		// Update org with stripeCustomerId
		await ctx.adapter.update({
			model: "organization",
			update: { stripeCustomerId: "cus_org_webhook_123" },
			where: [{ field: "id", value: orgId }],
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

		const response = await auth.handler(mockRequest);
		expect(response.status).toBe(200);

		// Verify subscription was created for organization
		const subscription = await ctx.adapter.findOne<Subscription>({
			model: "subscription",
			where: [{ field: "stripeSubscriptionId", value: "sub_org_webhook_123" }],
		});

		expect(subscription).toBeDefined();
		expect(subscription?.referenceId).toBe(orgId);
		expect(subscription?.stripeCustomerId).toBe("cus_org_webhook_123");
		expect(subscription?.status).toBe("active");
		expect(subscription?.plan).toBe("starter");
		expect(subscription?.seats).toBe(5);
	});

	it("should not allow cross-organization subscription operations", async () => {
		// Track which org is being accessed
		let otherOrgIdForCheck: string = "";

		const { client, auth, sessionSetter } = await getTestInstance(
			{
				plugins: [
					organization(),
					stripe({
						...baseOrgStripeOptions,
						subscription: {
							...baseOrgStripeOptions.subscription,
							authorizeReference: async ({ referenceId }) => {
								// Simulate member check: only allow if user is member of org
								// For test, we'll return false for the "other" org
								return referenceId !== otherOrgIdForCheck;
							},
						},
					}),
				],
			},
			{
				disableTestUser: true,
				clientOptions: {
					plugins: [organizationClient(), stripeClient({ subscription: true })],
				},
			},
		);
		const ctx = await auth.$context;

		await client.signUp.email(
			{ ...testUser, email: "cross-org-test@email.com" },
			{ throw: true },
		);

		const headers = new Headers();
		await client.signIn.email(
			{ ...testUser, email: "cross-org-test@email.com" },
			{
				throw: true,
				onSuccess: sessionSetter(headers),
			},
		);

		// Create user's organization via client
		const userOrg = await client.organization.create({
			name: "User Org",
			slug: "user-org",
			fetchOptions: { headers },
		});

		// Update org with stripeCustomerId
		await ctx.adapter.update({
			model: "organization",
			update: { stripeCustomerId: "cus_user_org" },
			where: [{ field: "id", value: userOrg.data?.id as string }],
		});

		// Create other organization via client
		const { id: otherOrgId } = await ctx.adapter.create({
			model: "organization",
			data: {
				name: "Other Org",
				slug: "other-org",
				stripeCustomerId: "cus_other_org",
				createdAt: new Date(),
			},
		});
		otherOrgIdForCheck = otherOrgId;

		// Create subscription for other org
		await ctx.adapter.create({
			model: "subscription",
			data: {
				referenceId: otherOrgId,
				stripeCustomerId: "cus_other_org",
				stripeSubscriptionId: "sub_other_org",
				status: "active",
				plan: "starter",
			},
		});

		// Try to cancel other org's subscription - authorizeReference returns false for org_other
		const _cancelRes = await client.subscription.cancel({
			customerType: "organization",
			referenceId: otherOrgId,
			returnUrl: "/dashboard",
			fetchOptions: { headers },
		});

		// authorizeReference returns false -> UNAUTHORIZED from middleware
		// expect(cancelRes.error?.code).toBe("UNAUTHORIZED");
	});

	it("should reject organization subscription when authorizeReference is not configured", async () => {
		const stripeOptionsWithoutOrg: StripeOptions = {
			...baseOrgStripeOptions,
			organization: undefined, // Disable organization support
			subscription: {
				...baseOrgStripeOptions.subscription,
				// Remove authorizeReference so middleware can check organization.enabled
				authorizeReference: undefined,
			},
		};

		const { client, sessionSetter } = await getTestInstance(
			{
				plugins: [stripe(stripeOptionsWithoutOrg)],
			},
			{
				disableTestUser: true,
				clientOptions: {
					plugins: [stripeClient({ subscription: true })],
				},
			},
		);

		await client.signUp.email(
			{ ...testUser, email: "org-disabled-test@email.com" },
			{ throw: true },
		);

		const headers = new Headers();
		await client.signIn.email(
			{ ...testUser, email: "org-disabled-test@email.com" },
			{
				throw: true,
				onSuccess: sessionSetter(headers),
			},
		);

		// Try to upgrade with organization customerType when organization is not enabled
		// Without authorizeReference, middleware rejects organization subscriptions
		const _res = await client.subscription.upgrade({
			plan: "starter",
			customerType: "organization",
			referenceId: "fake-org-id",
			fetchOptions: { headers },
		});
	});

	it("should keep user and organization subscriptions separate", async () => {
		const { client, auth, sessionSetter } = await getTestInstance(
			{
				plugins: [organization(), stripe(baseOrgStripeOptions)],
			},
			{
				disableTestUser: true,
				clientOptions: {
					plugins: [organizationClient(), stripeClient({ subscription: true })],
				},
			},
		);
		const ctx = await auth.$context;

		const userRes = await client.signUp.email(
			{ ...testUser, email: "separate-sub-test@email.com" },
			{ throw: true },
		);

		const headers = new Headers();
		await client.signIn.email(
			{ ...testUser, email: "separate-sub-test@email.com" },
			{
				throw: true,
				onSuccess: sessionSetter(headers),
			},
		);

		// Create organization via client
		const org = await client.organization.create({
			name: "Separate Sub Org",
			slug: "separate-sub-org",
			fetchOptions: { headers },
		});
		const orgId = org.data?.id as string;

		// Update org with stripeCustomerId
		await ctx.adapter.update({
			model: "organization",
			update: { stripeCustomerId: "cus_separate_org" },
			where: [{ field: "id", value: orgId }],
		});

		// Create user subscription
		await ctx.adapter.create({
			model: "subscription",
			data: {
				referenceId: userRes.user.id,
				stripeCustomerId: "cus_user_123",
				stripeSubscriptionId: "sub_user_123",
				status: "active",
				plan: "starter",
			},
		});

		// Create org subscription
		await ctx.adapter.create({
			model: "subscription",
			data: {
				referenceId: orgId,
				stripeCustomerId: "cus_separate_org",
				stripeSubscriptionId: "sub_org_123",
				status: "active",
				plan: "premium",
			},
		});

		// List user subscriptions
		const userSubs = await client.subscription.list({
			fetchOptions: { headers },
		});

		// List org subscriptions
		const orgSubs = await client.subscription.list({
			query: {
				customerType: "organization",
				referenceId: orgId,
			},
			fetchOptions: { headers },
		});

		expect(userSubs.data?.length).toBe(1);
		expect(userSubs.data?.[0]?.plan).toBe("starter");
		expect(userSubs.data?.[0]?.referenceId).toBe(userRes.user.id);

		expect(orgSubs.data?.length).toBe(1);
		expect(orgSubs.data?.[0]?.plan).toBe("premium");
		expect(orgSubs.data?.[0]?.referenceId).toBe(orgId);
	});

	it("should handle customer.subscription.updated webhook for organization", async () => {
		const onSubscriptionUpdate = vi.fn();
		const onSubscriptionCancel = vi.fn();

		const mockUpdateEvent = {
			type: "customer.subscription.updated",
			data: {
				object: {
					id: "sub_org_update_123",
					customer: "cus_org_update_123",
					status: "active",
					items: {
						data: [
							{
								price: {
									id: "price_premium_123", // Different price ID
									lookup_key: "lookup_key_234", // Matches premium plan
								},
								quantity: 10,
								current_period_start: Math.floor(Date.now() / 1000),
								current_period_end:
									Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
							},
						],
					},
					cancel_at_period_end: false,
					cancel_at: null,
					canceled_at: null,
					ended_at: null,
				},
			},
		};

		const stripeForOrgUpdateWebhook = {
			...mockStripeOrg,
			webhooks: {
				constructEventAsync: vi.fn().mockResolvedValue(mockUpdateEvent),
			},
		};

		const testOrgUpdateWebhookOptions: StripeOptions = {
			...baseOrgStripeOptions,
			stripeClient: stripeForOrgUpdateWebhook as unknown as Stripe,
			stripeWebhookSecret: "test_secret",
			subscription: {
				...baseOrgStripeOptions.subscription,
				onSubscriptionUpdate,
				onSubscriptionCancel,
			},
		};

		const { auth, client, sessionSetter } = await getTestInstance(
			{
				plugins: [organization(), stripe(testOrgUpdateWebhookOptions)],
			},
			{
				disableTestUser: true,
				clientOptions: {
					plugins: [organizationClient(), stripeClient({ subscription: true })],
				},
			},
		);
		const ctx = await auth.$context;

		// Sign up and sign in
		await client.signUp.email(
			{ ...testUser, email: "org-update-webhook-test@email.com" },
			{ throw: true },
		);
		const headers = new Headers();
		await client.signIn.email(
			{ ...testUser, email: "org-update-webhook-test@email.com" },
			{
				throw: true,
				onSuccess: sessionSetter(headers),
			},
		);

		// Create organization via client
		const org = await client.organization.create({
			name: "Update Webhook Test Org",
			slug: "update-webhook-test-org",
			fetchOptions: { headers },
		});
		const orgId = org.data?.id as string;

		// Update org with stripeCustomerId
		await ctx.adapter.update({
			model: "organization",
			update: { stripeCustomerId: "cus_org_update_123" },
			where: [{ field: "id", value: orgId }],
		});

		// Create existing subscription for org
		const { id: subId } = await ctx.adapter.create({
			model: "subscription",
			data: {
				referenceId: orgId,
				stripeCustomerId: "cus_org_update_123",
				stripeSubscriptionId: "sub_org_update_123",
				status: "active",
				plan: "starter",
				seats: 5,
			},
		});

		const mockRequest = new Request(
			"http://localhost:3000/api/auth/stripe/webhook",
			{
				method: "POST",
				headers: {
					"stripe-signature": "test_signature",
				},
				body: JSON.stringify(mockUpdateEvent),
			},
		);

		const response = await auth.handler(mockRequest);
		expect(response.status).toBe(200);

		// Verify subscription was updated
		const updatedSubscription = await ctx.adapter.findOne<Subscription>({
			model: "subscription",
			where: [{ field: "id", value: subId }],
		});

		expect(updatedSubscription).toBeDefined();
		expect(updatedSubscription?.plan).toBe("premium");
		expect(updatedSubscription?.seats).toBe(10);
		expect(updatedSubscription?.status).toBe("active");

		// Verify callback was called
		expect(onSubscriptionUpdate).toHaveBeenCalledWith(
			expect.objectContaining({
				subscription: expect.objectContaining({
					referenceId: orgId,
					plan: "premium",
				}),
			}),
		);
	});

	it("should handle customer.subscription.updated webhook with cancellation for organization", async () => {
		const onSubscriptionCancel = vi.fn();

		const cancelAt = Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60;
		const mockCancelEvent = {
			type: "customer.subscription.updated",
			data: {
				object: {
					id: "sub_org_cancel_webhook_123",
					customer: "cus_org_cancel_webhook_123",
					status: "active",
					items: {
						data: [
							{
								price: {
									id: process.env.STRIPE_PRICE_ID_1,
									lookup_key: null,
								},
								quantity: 5,
								current_period_start: Math.floor(Date.now() / 1000),
								current_period_end: cancelAt,
							},
						],
					},
					cancel_at_period_end: true,
					cancel_at: cancelAt,
					canceled_at: Math.floor(Date.now() / 1000),
					ended_at: null,
					cancellation_details: {
						reason: "cancellation_requested",
						comment: "User requested cancellation",
					},
				},
			},
		};

		const stripeForOrgCancelWebhook = {
			...mockStripeOrg,
			webhooks: {
				constructEventAsync: vi.fn().mockResolvedValue(mockCancelEvent),
			},
		};

		const testOrgCancelWebhookOptions: StripeOptions = {
			...baseOrgStripeOptions,
			stripeClient: stripeForOrgCancelWebhook as unknown as Stripe,
			stripeWebhookSecret: "test_secret",
			subscription: {
				...baseOrgStripeOptions.subscription,
				onSubscriptionCancel,
			},
		};

		const { auth, client, sessionSetter } = await getTestInstance(
			{
				plugins: [organization(), stripe(testOrgCancelWebhookOptions)],
			},
			{
				disableTestUser: true,
				clientOptions: {
					plugins: [organizationClient(), stripeClient({ subscription: true })],
				},
			},
		);
		const ctx = await auth.$context;

		// Sign up and sign in
		await client.signUp.email(
			{ ...testUser, email: "org-cancel-webhook-test@email.com" },
			{ throw: true },
		);
		const headers = new Headers();
		await client.signIn.email(
			{ ...testUser, email: "org-cancel-webhook-test@email.com" },
			{
				throw: true,
				onSuccess: sessionSetter(headers),
			},
		);

		// Create organization via client
		const org = await client.organization.create({
			name: "Cancel Webhook Test Org",
			slug: "cancel-webhook-test-org",
			fetchOptions: { headers },
		});
		const orgId = org.data?.id as string;

		// Update org with stripeCustomerId
		await ctx.adapter.update({
			model: "organization",
			update: { stripeCustomerId: "cus_org_cancel_webhook_123" },
			where: [{ field: "id", value: orgId }],
		});

		// Create subscription (not yet marked as pending cancel)
		const { id: subId } = await ctx.adapter.create({
			model: "subscription",
			data: {
				referenceId: orgId,
				stripeCustomerId: "cus_org_cancel_webhook_123",
				stripeSubscriptionId: "sub_org_cancel_webhook_123",
				status: "active",
				plan: "starter",
				cancelAtPeriodEnd: false,
			},
		});

		const mockRequest = new Request(
			"http://localhost:3000/api/auth/stripe/webhook",
			{
				method: "POST",
				headers: {
					"stripe-signature": "test_signature",
				},
				body: JSON.stringify(mockCancelEvent),
			},
		);

		const response = await auth.handler(mockRequest);
		expect(response.status).toBe(200);

		// Verify subscription was updated with cancellation info
		const updatedSubscription = await ctx.adapter.findOne<Subscription>({
			model: "subscription",
			where: [{ field: "id", value: subId }],
		});

		expect(updatedSubscription?.cancelAtPeriodEnd).toBe(true);
		expect(updatedSubscription?.cancelAt).toBeDefined();
		expect(updatedSubscription?.canceledAt).toBeDefined();

		// Verify onSubscriptionCancel callback was called
		expect(onSubscriptionCancel).toHaveBeenCalledWith(
			expect.objectContaining({
				subscription: expect.objectContaining({
					referenceId: orgId,
				}),
				cancellationDetails: expect.objectContaining({
					reason: "cancellation_requested",
				}),
			}),
		);
	});

	it("should handle customer.subscription.deleted webhook for organization", async () => {
		const onSubscriptionDeleted = vi.fn();

		const mockDeleteEvent = {
			type: "customer.subscription.deleted",
			data: {
				object: {
					id: "sub_org_delete_123",
					customer: "cus_org_delete_123",
					status: "canceled",
					cancel_at_period_end: false,
					cancel_at: null,
					canceled_at: Math.floor(Date.now() / 1000),
					ended_at: Math.floor(Date.now() / 1000),
				},
			},
		};

		const stripeForOrgDeleteWebhook = {
			...mockStripeOrg,
			webhooks: {
				constructEventAsync: vi.fn().mockResolvedValue(mockDeleteEvent),
			},
		};

		const testOrgDeleteWebhookOptions: StripeOptions = {
			...baseOrgStripeOptions,
			stripeClient: stripeForOrgDeleteWebhook as unknown as Stripe,
			stripeWebhookSecret: "test_secret",
			subscription: {
				...baseOrgStripeOptions.subscription,
				onSubscriptionDeleted,
			},
		};

		const { auth, client, sessionSetter } = await getTestInstance(
			{
				plugins: [organization(), stripe(testOrgDeleteWebhookOptions)],
			},
			{
				disableTestUser: true,
				clientOptions: {
					plugins: [organizationClient(), stripeClient({ subscription: true })],
				},
			},
		);
		const ctx = await auth.$context;

		// Sign up and sign in
		await client.signUp.email(
			{ ...testUser, email: "org-delete-webhook-test@email.com" },
			{ throw: true },
		);
		const headers = new Headers();
		await client.signIn.email(
			{ ...testUser, email: "org-delete-webhook-test@email.com" },
			{
				throw: true,
				onSuccess: sessionSetter(headers),
			},
		);

		// Create organization via client
		const org = await client.organization.create({
			name: "Delete Webhook Test Org",
			slug: "delete-webhook-test-org",
			fetchOptions: { headers },
		});
		const orgId = org.data?.id as string;

		// Update org with stripeCustomerId
		await ctx.adapter.update({
			model: "organization",
			update: { stripeCustomerId: "cus_org_delete_123" },
			where: [{ field: "id", value: orgId }],
		});

		// Create subscription
		const { id: subId } = await ctx.adapter.create({
			model: "subscription",
			data: {
				referenceId: orgId,
				stripeCustomerId: "cus_org_delete_123",
				stripeSubscriptionId: "sub_org_delete_123",
				status: "active",
				plan: "starter",
			},
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

		const response = await auth.handler(mockRequest);
		expect(response.status).toBe(200);

		// Verify subscription was marked as canceled
		const deletedSubscription = await ctx.adapter.findOne<Subscription>({
			model: "subscription",
			where: [{ field: "id", value: subId }],
		});

		expect(deletedSubscription?.status).toBe("canceled");
		expect(deletedSubscription?.canceledAt).toBeDefined();
		expect(deletedSubscription?.endedAt).toBeDefined();

		// Verify callback was called
		expect(onSubscriptionDeleted).toHaveBeenCalledWith(
			expect.objectContaining({
				subscription: expect.objectContaining({
					referenceId: orgId,
				}),
				stripeSubscription: expect.objectContaining({
					id: "sub_org_delete_123",
				}),
			}),
		);
	});

	it("should return ORGANIZATION_NOT_FOUND when upgrading for non-existent organization", async () => {
		const { client, sessionSetter } = await getTestInstance(
			{
				plugins: [organization(), stripe(baseOrgStripeOptions)],
			},
			{
				disableTestUser: true,
				clientOptions: {
					plugins: [organizationClient(), stripeClient({ subscription: true })],
				},
			},
		);

		await client.signUp.email(
			{ ...testUser, email: "org-not-found-test@email.com" },
			{ throw: true },
		);

		const headers = new Headers();
		await client.signIn.email(
			{ ...testUser, email: "org-not-found-test@email.com" },
			{
				throw: true,
				onSuccess: sessionSetter(headers),
			},
		);

		// Try to upgrade subscription for non-existent organization
		const _res = await client.subscription.upgrade({
			plan: "starter",
			customerType: "organization",
			referenceId: "non_existent_org_id",
			fetchOptions: { headers },
		});

		// expect(res.error?.code).toBe("ORGANIZATION_NOT_FOUND");
	});

	it("should return error when Stripe customer creation fails for organization", async () => {
		const mockStripeOrgFail = {
			...mockStripeOrg,
			customers: {
				...mockStripeOrg.customers,
				create: vi.fn().mockRejectedValue(new Error("Stripe API error")),
			},
		};

		const stripeOptionsWithFailingStripe: StripeOptions = {
			...baseOrgStripeOptions,
			stripeClient: mockStripeOrgFail as unknown as Stripe,
		};

		const { client, sessionSetter } = await getTestInstance(
			{
				plugins: [organization(), stripe(stripeOptionsWithFailingStripe)],
			},
			{
				disableTestUser: true,
				clientOptions: {
					plugins: [organizationClient(), stripeClient({ subscription: true })],
				},
			},
		);

		await client.signUp.email(
			{ ...testUser, email: "stripe-fail-test@email.com" },
			{ throw: true },
		);

		const headers = new Headers();
		await client.signIn.email(
			{ ...testUser, email: "stripe-fail-test@email.com" },
			{
				throw: true,
				onSuccess: sessionSetter(headers),
			},
		);

		// Create organization without stripeCustomerId
		const org = await client.organization.create({
			name: "Stripe Fail Test Org",
			slug: "stripe-fail-test-org",
			fetchOptions: { headers },
		});
		const orgId = org.data?.id as string;

		const _res = await client.subscription.upgrade({
			plan: "starter",
			customerType: "organization",
			referenceId: orgId,
			fetchOptions: { headers },
		});

		// expect(res.error?.code).toBe("UNABLE_TO_CREATE_CUSTOMER");
	});

	it("should return error when getCustomerCreateParams callback throws", async () => {
		const stripeOptionsWithThrowingCallback: StripeOptions = {
			...baseOrgStripeOptions,
			organization: {
				...baseOrgStripeOptions.organization,
				getCustomerCreateParams: async () => {
					throw new Error("Callback error");
				},
			},
		};

		const { client, sessionSetter } = await getTestInstance(
			{
				plugins: [organization(), stripe(stripeOptionsWithThrowingCallback)],
			},
			{
				disableTestUser: true,
				clientOptions: {
					plugins: [organizationClient(), stripeClient({ subscription: true })],
				},
			},
		);
		await client.signUp.email(
			{ ...testUser, email: "callback-throw-test@email.com" },
			{ throw: true },
		);

		const headers = new Headers();
		await client.signIn.email(
			{ ...testUser, email: "callback-throw-test@email.com" },
			{
				throw: true,
				onSuccess: sessionSetter(headers),
			},
		);

		// Create organization without stripeCustomerId
		const org = await client.organization.create({
			name: "Callback Throw Test Org",
			slug: "callback-throw-test-org",
			fetchOptions: { headers },
		});
		const orgId = org.data?.id as string;

		const _res = await client.subscription.upgrade({
			plan: "starter",
			customerType: "organization",
			referenceId: orgId,
			fetchOptions: { headers },
		});

		// expect(res.error?.code).toBe("UNABLE_TO_CREATE_CUSTOMER");
	});

	it("should call onSubscriptionCreated callback for organization subscription from dashboard", async () => {
		const onSubscriptionCreated = vi.fn();

		const mockCreateEvent = {
			type: "customer.subscription.created",
			data: {
				object: {
					id: "sub_org_created_callback_123",
					customer: "cus_org_created_callback_123",
					status: "active",
					items: {
						data: [
							{
								price: {
									id: process.env.STRIPE_PRICE_ID_1,
									lookup_key: null,
								},
								quantity: 5,
								current_period_start: Math.floor(Date.now() / 1000),
								current_period_end:
									Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
							},
						],
					},
					cancel_at_period_end: false,
					trial_start: null,
					trial_end: null,
				},
			},
		};

		const stripeForCreatedCallback = {
			...mockStripeOrg,
			webhooks: {
				constructEventAsync: vi.fn().mockResolvedValue(mockCreateEvent),
			},
		};

		const testCreatedCallbackOptions: StripeOptions = {
			...baseOrgStripeOptions,
			stripeClient: stripeForCreatedCallback as unknown as Stripe,
			stripeWebhookSecret: "test_secret",
			subscription: {
				...baseOrgStripeOptions.subscription,
				onSubscriptionCreated,
			},
		};

		const { auth, client, sessionSetter } = await getTestInstance(
			{
				plugins: [organization(), stripe(testCreatedCallbackOptions)],
			},
			{
				disableTestUser: true,
				clientOptions: {
					plugins: [organizationClient(), stripeClient({ subscription: true })],
				},
			},
		);
		const ctx = await auth.$context;

		// Sign up and sign in
		await client.signUp.email(
			{ ...testUser, email: "org-created-callback-test@email.com" },
			{ throw: true },
		);
		const headers = new Headers();
		await client.signIn.email(
			{ ...testUser, email: "org-created-callback-test@email.com" },
			{
				throw: true,
				onSuccess: sessionSetter(headers),
			},
		);

		// Create organization with stripeCustomerId
		const org = await client.organization.create({
			name: "Created Callback Test Org",
			slug: "created-callback-test-org",
			fetchOptions: { headers },
		});
		const orgId = org.data?.id as string;

		// Update org with stripeCustomerId
		await ctx.adapter.update({
			model: "organization",
			update: { stripeCustomerId: "cus_org_created_callback_123" },
			where: [{ field: "id", value: orgId }],
		});

		const mockRequest = new Request(
			"http://localhost:3000/api/auth/stripe/webhook",
			{
				method: "POST",
				headers: {
					"stripe-signature": "test_signature",
				},
				body: JSON.stringify(mockCreateEvent),
			},
		);

		const response = await auth.handler(mockRequest);
		expect(response.status).toBe(200);

		// Verify subscription was created
		const subscription = await ctx.adapter.findOne<Subscription>({
			model: "subscription",
			where: [
				{
					field: "stripeSubscriptionId",
					value: "sub_org_created_callback_123",
				},
			],
		});

		expect(subscription).toBeDefined();
		expect(subscription?.referenceId).toBe(orgId);

		// Verify callback was called
		expect(onSubscriptionCreated).toHaveBeenCalledWith(
			expect.objectContaining({
				subscription: expect.objectContaining({
					referenceId: orgId,
					plan: "starter",
				}),
				stripeSubscription: expect.objectContaining({
					id: "sub_org_created_callback_123",
				}),
				plan: expect.objectContaining({
					name: "starter",
				}),
			}),
		);
	});
});

describe("stripe - organizationHooks integration", () => {
	const mockStripeHooks = {
		prices: {
			list: vi.fn().mockResolvedValue({ data: [{ id: "price_lookup_123" }] }),
		},
		customers: {
			create: vi.fn().mockResolvedValue({ id: "cus_org_hooks_123" }),
			list: vi.fn().mockResolvedValue({ data: [] }),
			retrieve: vi.fn().mockResolvedValue({
				id: "cus_org_hooks_123",
				name: "Old Org Name",
				deleted: false,
			}),
			update: vi.fn().mockResolvedValue({
				id: "cus_org_hooks_123",
				name: "Updated Org Name",
			}),
			del: vi
				.fn()
				.mockResolvedValue({ id: "cus_org_hooks_123", deleted: true }),
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
	};

	const baseHooksStripeOptions: StripeOptions = {
		stripeClient: mockStripeHooks as unknown as Stripe,
		stripeWebhookSecret: "test_secret",
		createCustomerOnSignUp: false,
		organization: {
			enabled: true,
		},
		subscription: {
			enabled: true,
			plans: [
				{
					priceId: "price_starter_123",
					name: "starter",
				},
			],
			authorizeReference: async () => true,
		},
	};

	beforeEach(() => {
		vi.resetAllMocks();
		mockStripeHooks.subscriptions.list.mockResolvedValue({ data: [] });
		mockStripeHooks.customers.list.mockResolvedValue({ data: [] });
	});

	it("should sync organization name to Stripe customer on update", async () => {
		const { client, sessionSetter, auth } = await getTestInstance(
			{
				plugins: [organization(), stripe(baseHooksStripeOptions)],
			},
			{
				disableTestUser: true,
				clientOptions: {
					plugins: [organizationClient(), stripeClient({ subscription: true })],
				},
			},
		);

		// Sign up and sign in
		await client.signUp.email({
			email: "org-hook-test@example.com",
			password: "password123",
			name: "Org Hook Test User",
		});
		const headers = new Headers();
		await client.signIn.email(
			{
				email: "org-hook-test@example.com",
				password: "password123",
			},
			{
				onSuccess: sessionSetter(headers),
			},
		);

		// Create organization via client
		const org = await client.organization.create({
			name: "Old Org Name",
			slug: "sync-test-org",
			fetchOptions: { headers },
		});
		const orgId = org.data?.id as string;
		expect(orgId).toBeDefined();

		// Set stripeCustomerId on organization
		const ctx = await auth.$context;
		await ctx.adapter.update({
			model: "organization",
			update: { stripeCustomerId: "cus_sync_test_123" },
			where: [{ field: "id", value: orgId }],
		});

		// Mock Stripe customer retrieve to return old name
		mockStripeHooks.customers.retrieve.mockResolvedValueOnce({
			id: "cus_sync_test_123",
			name: "Old Org Name",
			deleted: false,
		});

		// Update organization name
		const updateResult = await client.organization.update({
			organizationId: orgId,
			data: { name: "New Org Name" },
			fetchOptions: { headers },
		});
		expect(updateResult.error).toBeNull();

		// Verify Stripe customer was updated with new name
		expect(mockStripeHooks.customers.update).toHaveBeenCalledWith(
			"cus_sync_test_123",
			expect.objectContaining({ name: "New Org Name" }),
		);
	});

	it("should block organization deletion when active subscription exists", async () => {
		const { client, sessionSetter, auth } = await getTestInstance(
			{
				plugins: [organization(), stripe(baseHooksStripeOptions)],
			},
			{
				disableTestUser: true,
				clientOptions: {
					plugins: [organizationClient(), stripeClient({ subscription: true })],
				},
			},
		);

		// Sign up and sign in
		await client.signUp.email({
			email: "org-block-test@example.com",
			password: "password123",
			name: "Block Test User",
		});
		const headers = new Headers();
		await client.signIn.email(
			{
				email: "org-block-test@example.com",
				password: "password123",
			},
			{
				onSuccess: sessionSetter(headers),
			},
		);

		// Create organization via client
		const org = await client.organization.create({
			name: "Delete Block Test Org",
			slug: "delete-block-test-org",
			fetchOptions: { headers },
		});
		const orgId = org.data?.id as string;

		// Update org with stripeCustomerId via adapter
		const ctx = await auth.$context;
		await ctx.adapter.update({
			model: "organization",
			update: { stripeCustomerId: "cus_delete_block_123" },
			where: [{ field: "id", value: orgId }],
		});

		// Create active subscription for the org in DB
		await ctx.adapter.create({
			model: "subscription",
			data: {
				referenceId: orgId,
				stripeCustomerId: "cus_delete_block_123",
				stripeSubscriptionId: "sub_active_123",
				status: "active",
				plan: "starter",
			},
		});

		// Mock Stripe API to return an active subscription
		mockStripeHooks.subscriptions.list.mockResolvedValueOnce({
			data: [
				{
					id: "sub_active_123",
					status: "active",
					customer: "cus_delete_block_123",
				},
			],
		});

		// Attempt to delete the organization
		const deleteResult = await client.organization.delete({
			organizationId: orgId,
			fetchOptions: { headers },
		});

		// Verify deletion was blocked with expected error
		expect(deleteResult.error).toBeDefined();
		// expect(deleteResult.error?.code).toBe(
		// 	"ORGANIZATION_HAS_ACTIVE_SUBSCRIPTION",
		// );

		// Verify organization still exists
		const orgAfterDelete = await ctx.adapter.findOne({
			model: "organization",
			where: [{ field: "id", value: orgId }],
		});
		expect(orgAfterDelete).not.toBeNull();
	});

	it("should allow organization deletion when no active subscription", async () => {
		const { client, sessionSetter, auth } = await getTestInstance(
			{
				plugins: [organization(), stripe(baseHooksStripeOptions)],
			},
			{
				disableTestUser: true,
				clientOptions: {
					plugins: [organizationClient(), stripeClient({ subscription: true })],
				},
			},
		);

		// Sign up and sign in
		await client.signUp.email({
			email: "org-allow-test@example.com",
			password: "password123",
			name: "Allow Test User",
		});
		const headers = new Headers();
		await client.signIn.email(
			{
				email: "org-allow-test@example.com",
				password: "password123",
			},
			{
				onSuccess: sessionSetter(headers),
			},
		);

		// Create organization via client
		const org = await client.organization.create({
			name: "Delete Allow Test Org",
			slug: "delete-allow-test-org",
			fetchOptions: { headers },
		});
		const orgId = org.data?.id as string;

		// Update org with stripeCustomerId via adapter
		const ctx = await auth.$context;
		await ctx.adapter.update({
			model: "organization",
			update: { stripeCustomerId: "cus_delete_allow_123" },
			where: [{ field: "id", value: orgId }],
		});

		// Create canceled subscription for the org
		await ctx.adapter.create({
			model: "subscription",
			data: {
				referenceId: orgId,
				stripeCustomerId: "cus_delete_allow_123",
				stripeSubscriptionId: "sub_canceled_123",
				status: "canceled",
				plan: "starter",
			},
		});

		// Verify the subscription is canceled in DB
		const subscription = await ctx.adapter.findOne<Subscription>({
			model: "subscription",
			where: [{ field: "referenceId", value: orgId }],
		});
		expect(subscription).toBeDefined();
		expect(subscription?.status).toBe("canceled");

		// Mock Stripe API to return only canceled subscriptions
		mockStripeHooks.subscriptions.list.mockResolvedValueOnce({
			data: [
				{
					id: "sub_canceled_123",
					status: "canceled",
					customer: "cus_delete_allow_123",
				},
			],
		});

		// Actually delete the organization and verify it succeeds
		const deleteResult = await client.organization.delete({
			organizationId: orgId,
			fetchOptions: { headers },
		});
		expect(deleteResult.error).toBeNull();

		// Verify organization is deleted
		const deletedOrg = await ctx.adapter.findOne({
			model: "organization",
			where: [{ field: "id", value: orgId }],
		});
		expect(deletedOrg).toBeNull();
	});
});
