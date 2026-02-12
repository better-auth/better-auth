import { organizationClient } from "better-auth/client/plugins";
import { organization } from "better-auth/plugins/organization";
import { getTestInstance } from "better-auth/test";
import type Stripe from "stripe";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { stripe } from "../src";
import { stripeClient } from "../src/client";
import type { StripeOptions, Subscription } from "../src/types";

describe("seat-based billing", () => {
	const mockStripe = {
		prices: {
			list: vi.fn().mockResolvedValue({ data: [] }),
		},
		customers: {
			create: vi.fn().mockResolvedValue({ id: "cus_seat_org" }),
			list: vi.fn().mockResolvedValue({ data: [] }),
			search: vi.fn().mockResolvedValue({ data: [] }),
			retrieve: vi.fn().mockResolvedValue({
				id: "cus_seat_org",
				name: "Seat Org",
				deleted: false,
			}),
			update: vi.fn(),
		},
		checkout: {
			sessions: {
				create: vi.fn().mockResolvedValue({
					url: "https://checkout.stripe.com/mock",
					id: "cs_seat_mock",
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
			update: vi.fn().mockResolvedValue({}),
		},
		webhooks: {
			constructEventAsync: vi.fn(),
		},
	};

	const seatPlanOptions: StripeOptions = {
		stripeClient: mockStripe as unknown as Stripe,
		stripeWebhookSecret: "test_secret",
		createCustomerOnSignUp: false,
		organization: { enabled: true },
		subscription: {
			enabled: true,
			plans: [
				{
					priceId: "price_team_base",
					name: "team",
					seatPriceId: "price_team_seat",
				},
				{
					priceId: "price_enterprise_base",
					name: "enterprise",
					seatPriceId: "price_enterprise_seat",
				},
			],
			authorizeReference: async () => true,
		},
	};

	beforeEach(() => {
		vi.clearAllMocks();
		mockStripe.subscriptions.list.mockResolvedValue({ data: [] });
		mockStripe.customers.search.mockResolvedValue({ data: [] });
	});

	describe("checkout with auto-managed seats", async () => {
		const { client, auth, sessionSetter } = await getTestInstance(
			{
				plugins: [organization(), stripe(seatPlanOptions)],
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
			{
				email: "seat-test@email.com",
				password: "password",
				name: "Seat Test User",
			},
			{ throw: true },
		);
		const headers = new Headers();
		await client.signIn.email(
			{ email: "seat-test@email.com", password: "password" },
			{ throw: true, onSuccess: sessionSetter(headers) },
		);

		it("should create checkout with both base plan and seat line items", async () => {
			const org = await client.organization.create({
				name: "Seat Test Org",
				slug: "seat-test-org",
				fetchOptions: { headers },
			});
			const orgId = org.data?.id as string;

			const res = await client.subscription.upgrade({
				plan: "team",
				customerType: "organization",
				referenceId: orgId,
				fetchOptions: { headers },
			});

			expect(res.data?.url).toBeDefined();

			const createCall = mockStripe.checkout.sessions.create.mock.calls[0]?.[0];
			expect(createCall).toBeDefined();
			expect(createCall.line_items[0]).toEqual({
				price: "price_team_base",
				quantity: 1,
			});
			expect(createCall.line_items[1]).toMatchObject({
				price: "price_team_seat",
				quantity: expect.any(Number),
			});
		});

		it("should use actual member count as seat quantity", async () => {
			const org = await client.organization.create({
				name: "Seat Count Org",
				slug: "seat-count-org",
				fetchOptions: { headers },
			});
			const orgId = org.data?.id as string;

			// Owner is already a member (count=1). Add 2 more via adapter.
			for (const email of ["member2@seat.com", "member3@seat.com"]) {
				const member = await ctx.adapter.create({
					model: "user",
					data: { email, name: email.split("@")[0] },
				});
				await ctx.adapter.create({
					model: "member",
					data: {
						userId: member.id,
						organizationId: orgId,
						role: "member",
						createdAt: new Date(),
					},
				});
			}

			await client.subscription.upgrade({
				plan: "team",
				customerType: "organization",
				referenceId: orgId,
				fetchOptions: { headers },
			});

			const createCall = mockStripe.checkout.sessions.create.mock.calls[0]?.[0];
			// 1 owner + 2 members = 3
			expect(createCall.line_items[1]).toMatchObject({
				price: "price_team_seat",
				quantity: 3,
			});
		});
	});

	describe("checkout with additional line items", async () => {
		const meterPlanOptions: StripeOptions = {
			stripeClient: mockStripe as unknown as Stripe,
			stripeWebhookSecret: "test_secret",
			createCustomerOnSignUp: false,
			organization: { enabled: true },
			subscription: {
				enabled: true,
				plans: [
					{
						priceId: "price_pro_base",
						name: "pro",
						seatPriceId: "price_pro_seat",
						lineItems: [
							{ price: "price_meter_api" },
							{ price: "price_meter_email" },
						],
					},
				],
				authorizeReference: async () => true,
			},
		};

		const { client, sessionSetter } = await getTestInstance(
			{
				plugins: [organization(), stripe(meterPlanOptions)],
			},
			{
				disableTestUser: true,
				clientOptions: {
					plugins: [organizationClient(), stripeClient({ subscription: true })],
				},
			},
		);

		await client.signUp.email(
			{
				email: "meter-test@email.com",
				password: "password",
				name: "Meter Test User",
			},
			{ throw: true },
		);
		const headers = new Headers();
		await client.signIn.email(
			{ email: "meter-test@email.com", password: "password" },
			{ throw: true, onSuccess: sessionSetter(headers) },
		);

		it("should include additional line items in checkout", async () => {
			const org = await client.organization.create({
				name: "Meter Test Org",
				slug: "meter-test-org",
				fetchOptions: { headers },
			});
			const orgId = org.data?.id as string;

			await client.subscription.upgrade({
				plan: "pro",
				customerType: "organization",
				referenceId: orgId,
				fetchOptions: { headers },
			});

			const createCall = mockStripe.checkout.sessions.create.mock.calls[0]?.[0];
			expect(createCall).toBeDefined();
			expect(createCall.line_items).toHaveLength(4); // base + seat + 2 lineItems
			expect(createCall.line_items[0]).toEqual({
				price: "price_pro_base",
				quantity: 1,
			});
			expect(createCall.line_items[1]).toMatchObject({
				price: "price_pro_seat",
				quantity: expect.any(Number),
			});
			expect(createCall.line_items[2]).toEqual({ price: "price_meter_api" });
			expect(createCall.line_items[3]).toEqual({ price: "price_meter_email" });
		});

		it("should not include extra line items when plan has none", async () => {
			mockStripe.checkout.sessions.create.mockClear();

			const noMeterOptions: StripeOptions = {
				stripeClient: mockStripe as unknown as Stripe,
				stripeWebhookSecret: "test_secret",
				createCustomerOnSignUp: false,
				organization: { enabled: true },
				subscription: {
					enabled: true,
					plans: [
						{
							priceId: "price_basic_base",
							name: "basic",
							seatPriceId: "price_basic_seat",
						},
					],
					authorizeReference: async () => true,
				},
			};

			const { client: c2, sessionSetter: ss2 } = await getTestInstance(
				{
					plugins: [organization(), stripe(noMeterOptions)],
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

			await c2.signUp.email(
				{
					email: "no-meter@email.com",
					password: "password",
					name: "No Meter User",
				},
				{ throw: true },
			);
			const h2 = new Headers();
			await c2.signIn.email(
				{ email: "no-meter@email.com", password: "password" },
				{ throw: true, onSuccess: ss2(h2) },
			);

			const org2 = await c2.organization.create({
				name: "No Meter Org",
				slug: "no-meter-org",
				fetchOptions: { headers: h2 },
			});

			await c2.subscription.upgrade({
				plan: "basic",
				customerType: "organization",
				referenceId: org2.data?.id as string,
				fetchOptions: { headers: h2 },
			});

			const call = mockStripe.checkout.sessions.create.mock.calls[0]?.[0];
			expect(call.line_items).toHaveLength(2); // base + seat only
		});
	});

	describe("checkout when priceId equals seatPriceId", async () => {
		const seatOnlyOptions: StripeOptions = {
			stripeClient: mockStripe as unknown as Stripe,
			stripeWebhookSecret: "test_secret",
			createCustomerOnSignUp: false,
			organization: { enabled: true },
			subscription: {
				enabled: true,
				plans: [
					{
						priceId: "price_same",
						name: "starter",
						seatPriceId: "price_same",
						lineItems: [{ price: "price_meter_api" }],
					},
				],
				authorizeReference: async () => true,
			},
		};

		const { client, sessionSetter } = await getTestInstance(
			{
				plugins: [organization(), stripe(seatOnlyOptions)],
			},
			{
				disableTestUser: true,
				clientOptions: {
					plugins: [organizationClient(), stripeClient({ subscription: true })],
				},
			},
		);

		await client.signUp.email(
			{
				email: "seat-only@email.com",
				password: "password",
				name: "Seat Only",
			},
			{ throw: true },
		);
		const headers = new Headers();
		await client.signIn.email(
			{ email: "seat-only@email.com", password: "password" },
			{ throw: true, onSuccess: sessionSetter(headers) },
		);

		it("should not duplicate base price in line_items", async () => {
			mockStripe.checkout.sessions.create.mockClear();

			const org = await client.organization.create({
				name: "Seat Only Org",
				slug: "seat-only-org",
				fetchOptions: { headers },
			});

			await client.subscription.upgrade({
				plan: "starter",
				customerType: "organization",
				referenceId: org.data?.id as string,
				fetchOptions: { headers },
			});

			const call = mockStripe.checkout.sessions.create.mock.calls[0]?.[0];
			expect(call).toBeDefined();
			// seat + 1 meter = 2 items (no duplicate base)
			expect(call.line_items).toHaveLength(2);
			expect(call.line_items[0]).toMatchObject({
				price: "price_same",
				quantity: expect.any(Number),
			});
			expect(call.line_items[1]).toEqual({ price: "price_meter_api" });
		});
	});

	describe("portal upgrade with seat items", () => {
		it("should swap seat item when upgrading to a plan with different seat pricing", async () => {
			const { client, auth, sessionSetter } = await getTestInstance(
				{
					plugins: [organization(), stripe(seatPlanOptions)],
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

			await client.signUp.email(
				{
					email: "portal-seat@test.com",
					password: "password",
					name: "Portal User",
				},
				{ throw: true },
			);
			const headers = new Headers();
			await client.signIn.email(
				{ email: "portal-seat@test.com", password: "password" },
				{ throw: true, onSuccess: sessionSetter(headers) },
			);

			const org = await client.organization.create({
				name: "Portal Seat Org",
				slug: "portal-seat-org",
				fetchOptions: { headers },
			});
			const orgId = org.data?.id as string;

			await ctx.adapter.update({
				model: "organization",
				update: { stripeCustomerId: "cus_portal_seat" },
				where: [{ field: "id", value: orgId }],
			});
			await ctx.adapter.create({
				model: "subscription",
				data: {
					referenceId: orgId,
					stripeCustomerId: "cus_portal_seat",
					stripeSubscriptionId: "sub_team",
					status: "active",
					plan: "team",
					seats: 2,
				},
			});

			mockStripe.subscriptions.list.mockResolvedValue({
				data: [
					{
						id: "sub_team",
						status: "active",
						cancel_at_period_end: false,
						cancel_at: null,
						items: {
							data: [
								{
									id: "si_base",
									price: { id: "price_team_base", lookup_key: null },
									quantity: 1,
								},
								{
									id: "si_seat",
									price: { id: "price_team_seat", lookup_key: null },
									quantity: 2,
								},
							],
						},
					},
				],
			});

			const res = await client.subscription.upgrade({
				plan: "enterprise",
				customerType: "organization",
				referenceId: orgId,
				fetchOptions: { headers },
			});

			expect(res.data?.url).toBeDefined();

			// Billing portal supports only 1 item — seat price change
			// falls back to direct subscriptions.update() API.
			expect(mockStripe.billingPortal.sessions.create).not.toHaveBeenCalled();

			const updateCall = mockStripe.subscriptions.update.mock.calls[0]!;
			expect(updateCall[0]).toBe("sub_team");
			const items = updateCall[1]!.items;

			expect(items).toContainEqual(
				expect.objectContaining({
					id: "si_base",
					price: "price_enterprise_base",
				}),
			);
			expect(items).toContainEqual(
				expect.objectContaining({
					id: "si_seat",
					price: "price_enterprise_seat",
					quantity: expect.any(Number),
				}),
			);
			expect(updateCall[1]!.proration_behavior).toBe("create_prorations");
		});

		it("should skip seat item swap when seat pricing is unchanged", async () => {
			const sameSeatOptions: StripeOptions = {
				...seatPlanOptions,
				subscription: {
					enabled: true,
					plans: [
						{
							priceId: "price_basic_base",
							name: "basic",
							seatPriceId: "price_shared_seat",
						},
						{
							priceId: "price_pro_base",
							name: "pro",
							seatPriceId: "price_shared_seat",
						},
					],
					authorizeReference: async () => true,
				},
			};

			const { client, auth, sessionSetter } = await getTestInstance(
				{
					plugins: [organization(), stripe(sameSeatOptions)],
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

			await client.signUp.email(
				{
					email: "same-seat@test.com",
					password: "password",
					name: "Same Seat",
				},
				{ throw: true },
			);
			const headers = new Headers();
			await client.signIn.email(
				{ email: "same-seat@test.com", password: "password" },
				{ throw: true, onSuccess: sessionSetter(headers) },
			);

			const org = await client.organization.create({
				name: "Same Seat Org",
				slug: "same-seat-org",
				fetchOptions: { headers },
			});
			const orgId = org.data?.id as string;

			await ctx.adapter.update({
				model: "organization",
				update: { stripeCustomerId: "cus_same_seat" },
				where: [{ field: "id", value: orgId }],
			});
			await ctx.adapter.create({
				model: "subscription",
				data: {
					referenceId: orgId,
					stripeCustomerId: "cus_same_seat",
					stripeSubscriptionId: "sub_basic",
					status: "active",
					plan: "basic",
					seats: 1,
				},
			});

			mockStripe.subscriptions.list.mockResolvedValue({
				data: [
					{
						id: "sub_basic",
						status: "active",
						cancel_at_period_end: false,
						cancel_at: null,
						items: {
							data: [
								{
									id: "si_base",
									price: { id: "price_basic_base", lookup_key: null },
									quantity: 1,
								},
								{
									id: "si_seat",
									price: { id: "price_shared_seat", lookup_key: null },
									quantity: 1,
								},
							],
						},
					},
				],
			});

			await client.subscription.upgrade({
				plan: "pro",
				customerType: "organization",
				referenceId: orgId,
				fetchOptions: { headers },
			});

			const portalCall =
				mockStripe.billingPortal.sessions.create.mock.calls[0]?.[0];
			const items = portalCall.flow_data.subscription_update_confirm.items;

			expect(items).toHaveLength(1);
			expect(items[0]).toMatchObject({
				id: "si_base",
				price: "price_pro_base",
			});
		});

		it("should not duplicate subscription item when upgrading between seat-only plans", async () => {
			const seatOnlyUpgradeOptions: StripeOptions = {
				stripeClient: mockStripe as unknown as Stripe,
				stripeWebhookSecret: "test_secret",
				createCustomerOnSignUp: false,
				organization: { enabled: true },
				subscription: {
					enabled: true,
					plans: [
						{
							priceId: "price_starter",
							name: "starter",
							seatPriceId: "price_starter",
						},
						{
							priceId: "price_growth",
							name: "growth",
							seatPriceId: "price_growth",
						},
					],
					authorizeReference: async () => true,
				},
			};

			const { client, auth, sessionSetter } = await getTestInstance(
				{
					plugins: [organization(), stripe(seatOnlyUpgradeOptions)],
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

			await client.signUp.email(
				{
					email: "seat-only-upgrade@test.com",
					password: "password",
					name: "Seat Only Upgrade",
				},
				{ throw: true },
			);
			const headers = new Headers();
			await client.signIn.email(
				{ email: "seat-only-upgrade@test.com", password: "password" },
				{ throw: true, onSuccess: sessionSetter(headers) },
			);

			const org = await client.organization.create({
				name: "Seat Only Upgrade Org",
				slug: "seat-only-upgrade-org",
				fetchOptions: { headers },
			});
			const orgId = org.data?.id as string;

			await ctx.adapter.update({
				model: "organization",
				update: { stripeCustomerId: "cus_seat_only_upgrade" },
				where: [{ field: "id", value: orgId }],
			});
			await ctx.adapter.create({
				model: "subscription",
				data: {
					referenceId: orgId,
					stripeCustomerId: "cus_seat_only_upgrade",
					stripeSubscriptionId: "sub_starter",
					status: "active",
					plan: "starter",
					seats: 2,
				},
			});

			// Seat-only plan: single item where base price IS the seat price
			mockStripe.subscriptions.list.mockResolvedValue({
				data: [
					{
						id: "sub_starter",
						status: "active",
						cancel_at_period_end: false,
						cancel_at: null,
						items: {
							data: [
								{
									id: "si_only",
									price: { id: "price_starter", lookup_key: null },
									quantity: 2,
								},
							],
						},
					},
				],
			});

			await client.subscription.upgrade({
				plan: "growth",
				customerType: "organization",
				referenceId: orgId,
				fetchOptions: { headers },
			});

			const updateCall = mockStripe.subscriptions.update.mock.calls[0]!;
			expect(updateCall[0]).toBe("sub_starter");
			const items = updateCall[1]!.items;

			// Should have exactly 1 item — no duplicate si_only entries
			expect(items).toHaveLength(1);
			expect(items[0]).toMatchObject({
				id: "si_only",
				price: "price_growth",
				quantity: expect.any(Number),
			});
		});
	});

	describe("seat sync on member changes", () => {
		it("should sync seat quantity when a member accepts an invitation", async () => {
			mockStripe.subscriptions.retrieve.mockResolvedValue({
				id: "sub_seat_sync",
				status: "active",
				items: {
					data: [
						{
							id: "si_base",
							price: { id: "price_team_base" },
							quantity: 1,
						},
						{
							id: "si_seat",
							price: { id: "price_team_seat" },
							quantity: 1,
						},
					],
				},
			});

			const { client, auth, sessionSetter } = await getTestInstance(
				{
					plugins: [organization(), stripe(seatPlanOptions)],
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

			await client.signUp.email(
				{
					email: "sync-owner@test.com",
					password: "password",
					name: "Sync Owner",
				},
				{ throw: true },
			);
			const headers = new Headers();
			await client.signIn.email(
				{ email: "sync-owner@test.com", password: "password" },
				{ throw: true, onSuccess: sessionSetter(headers) },
			);

			const org = await client.organization.create({
				name: "Sync Seat Org",
				slug: "sync-seat-org",
				fetchOptions: { headers },
			});
			const orgId = org.data?.id as string;

			await ctx.adapter.update({
				model: "organization",
				update: { stripeCustomerId: "cus_sync_seat" },
				where: [{ field: "id", value: orgId }],
			});
			await ctx.adapter.create({
				model: "subscription",
				data: {
					referenceId: orgId,
					stripeCustomerId: "cus_sync_seat",
					stripeSubscriptionId: "sub_seat_sync",
					status: "active",
					plan: "team",
					seats: 1,
				},
			});

			const newMember = await ctx.adapter.create({
				model: "user",
				data: { email: "new-member@test.com", name: "New Member" },
			});
			await ctx.adapter.create({
				model: "account",
				data: {
					userId: newMember.id,
					accountId: newMember.id,
					providerId: "credential",
					password: await ctx.password.hash("password"),
					createdAt: new Date(),
					updatedAt: new Date(),
				},
			});

			await client.organization.inviteMember({
				email: "new-member@test.com",
				role: "member",
				organizationId: orgId,
				fetchOptions: { headers },
			});

			const newMemberHeaders = new Headers();
			await client.signIn.email(
				{ email: "new-member@test.com", password: "password" },
				{ throw: true, onSuccess: sessionSetter(newMemberHeaders) },
			);

			const invitations = await client.organization.listInvitations({
				fetchOptions: { headers },
			});
			const invitationId = invitations.data?.[0]?.id;
			expect(invitationId).toBeDefined();

			await client.organization.acceptInvitation({
				invitationId: invitationId!,
				fetchOptions: { headers: newMemberHeaders },
			});

			expect(mockStripe.subscriptions.update).toHaveBeenCalledWith(
				"sub_seat_sync",
				expect.objectContaining({
					proration_behavior: "create_prorations",
				}),
			);

			const updateCall = mockStripe.subscriptions.update.mock.calls[0];
			const seatItems = updateCall?.[1]?.items;
			expect(seatItems).toContainEqual(
				expect.objectContaining({ id: "si_seat", quantity: 2 }),
			);
		});
	});

	describe("seat sync on member removal", () => {
		it("should sync seat quantity when a member is removed", async () => {
			mockStripe.subscriptions.retrieve.mockResolvedValue({
				id: "sub_seat_remove",
				status: "active",
				items: {
					data: [
						{
							id: "si_base",
							price: { id: "price_team_base" },
							quantity: 1,
						},
						{
							id: "si_seat",
							price: { id: "price_team_seat" },
							quantity: 2,
						},
					],
				},
			});

			const { client, auth, sessionSetter } = await getTestInstance(
				{
					plugins: [organization(), stripe(seatPlanOptions)],
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

			await client.signUp.email(
				{
					email: "remove-owner@test.com",
					password: "password",
					name: "Remove Owner",
				},
				{ throw: true },
			);
			const headers = new Headers();
			await client.signIn.email(
				{ email: "remove-owner@test.com", password: "password" },
				{ throw: true, onSuccess: sessionSetter(headers) },
			);

			const org = await client.organization.create({
				name: "Remove Seat Org",
				slug: "remove-seat-org",
				fetchOptions: { headers },
			});
			const orgId = org.data?.id as string;

			await ctx.adapter.update({
				model: "organization",
				update: { stripeCustomerId: "cus_remove_seat" },
				where: [{ field: "id", value: orgId }],
			});
			await ctx.adapter.create({
				model: "subscription",
				data: {
					referenceId: orgId,
					stripeCustomerId: "cus_remove_seat",
					stripeSubscriptionId: "sub_seat_remove",
					status: "active",
					plan: "team",
					seats: 2,
				},
			});

			// Add a member directly via adapter
			const memberUser = await ctx.adapter.create({
				model: "user",
				data: { email: "removable@test.com", name: "Removable" },
			});
			const member = await ctx.adapter.create({
				model: "member",
				data: {
					userId: memberUser.id,
					organizationId: orgId,
					role: "member",
					createdAt: new Date(),
				},
			});

			// Remove the member
			await client.organization.removeMember({
				memberIdOrEmail: member.id,
				organizationId: orgId,
				fetchOptions: { headers },
			});

			expect(mockStripe.subscriptions.update).toHaveBeenCalledWith(
				"sub_seat_remove",
				expect.objectContaining({
					proration_behavior: "create_prorations",
				}),
			);

			const updateCall = mockStripe.subscriptions.update.mock.calls[0];
			const seatItems = updateCall?.[1]?.items;
			// Owner only remains → quantity = 1
			expect(seatItems).toContainEqual(
				expect.objectContaining({ id: "si_seat", quantity: 1 }),
			);
		});
	});

	describe("webhook seat handling", () => {
		it("should persist seat count on subscription creation", async () => {
			const now = Math.floor(Date.now() / 1000);
			const mockEvent = {
				type: "customer.subscription.created",
				data: {
					object: {
						id: "sub_webhook_seat",
						customer: "cus_webhook_seat",
						status: "active",
						items: {
							data: [
								{
									price: { id: "price_team_base", lookup_key: null },
									quantity: 1,
									current_period_start: now,
									current_period_end: now + 30 * 24 * 60 * 60,
								},
								{
									price: { id: "price_team_seat", lookup_key: null },
									quantity: 5,
									current_period_start: now,
									current_period_end: now + 30 * 24 * 60 * 60,
								},
							],
						},
						cancel_at_period_end: false,
					},
				},
			};

			const webhookOptions: StripeOptions = {
				...seatPlanOptions,
				stripeClient: {
					...mockStripe,
					webhooks: {
						constructEventAsync: vi.fn().mockResolvedValue(mockEvent),
					},
				} as unknown as Stripe,
			};

			const { auth, client, sessionSetter } = await getTestInstance(
				{
					plugins: [organization(), stripe(webhookOptions)],
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

			await client.signUp.email(
				{
					email: "webhook-seat@test.com",
					password: "password",
					name: "Webhook Seat User",
				},
				{ throw: true },
			);
			const wHeaders = new Headers();
			await client.signIn.email(
				{ email: "webhook-seat@test.com", password: "password" },
				{ throw: true, onSuccess: sessionSetter(wHeaders) },
			);

			const org = await client.organization.create({
				name: "Webhook Seat Org",
				slug: "webhook-seat-org",
				fetchOptions: { headers: wHeaders },
			});
			const orgId = org.data?.id as string;
			await ctx.adapter.update({
				model: "organization",
				update: { stripeCustomerId: "cus_webhook_seat" },
				where: [{ field: "id", value: orgId }],
			});

			const response = await auth.handler(
				new Request("http://localhost:3000/api/auth/stripe/webhook", {
					method: "POST",
					headers: { "stripe-signature": "test_sig" },
					body: JSON.stringify(mockEvent),
				}),
			);

			expect(response.status).toBe(200);

			const sub = await ctx.adapter.findOne<Subscription>({
				model: "subscription",
				where: [{ field: "stripeSubscriptionId", value: "sub_webhook_seat" }],
			});

			expect(sub).toBeDefined();
			expect(sub?.plan).toBe("team");
			expect(sub?.seats).toBe(5);
		});

		it("should update seat count on subscription update", async () => {
			const now = Math.floor(Date.now() / 1000);
			const webhookMock = vi.fn();

			const webhookOptions: StripeOptions = {
				...seatPlanOptions,
				stripeClient: {
					...mockStripe,
					webhooks: { constructEventAsync: webhookMock },
				} as unknown as Stripe,
			};

			const { auth } = await getTestInstance(
				{
					plugins: [organization(), stripe(webhookOptions)],
				},
				{ disableTestUser: true },
			);
			const ctx = await auth.$context;

			const sub = await ctx.adapter.create({
				model: "subscription",
				data: {
					referenceId: "org_123",
					stripeCustomerId: "cus_seat_update",
					stripeSubscriptionId: "sub_seat_update",
					status: "active",
					plan: "team",
					seats: 3,
				},
			});

			const mockUpdateEvent = {
				type: "customer.subscription.updated",
				data: {
					object: {
						id: "sub_seat_update",
						customer: "cus_seat_update",
						status: "active",
						cancel_at_period_end: false,
						cancel_at: null,
						canceled_at: null,
						ended_at: null,
						items: {
							data: [
								{
									price: { id: "price_team_base", lookup_key: null },
									quantity: 1,
									current_period_start: now,
									current_period_end: now + 30 * 24 * 60 * 60,
								},
								{
									price: { id: "price_team_seat", lookup_key: null },
									quantity: 8,
									current_period_start: now,
									current_period_end: now + 30 * 24 * 60 * 60,
								},
							],
						},
						metadata: { subscriptionId: sub.id },
					},
				},
			};

			webhookMock.mockResolvedValue(mockUpdateEvent);

			const response = await auth.handler(
				new Request("http://localhost:3000/api/auth/stripe/webhook", {
					method: "POST",
					headers: { "stripe-signature": "test_sig" },
					body: JSON.stringify(mockUpdateEvent),
				}),
			);

			expect(response.status).toBe(200);

			const updated = await ctx.adapter.findOne<Subscription>({
				model: "subscription",
				where: [{ field: "id", value: sub.id }],
			});

			expect(updated?.seats).toBe(8);
		});
	});
});
