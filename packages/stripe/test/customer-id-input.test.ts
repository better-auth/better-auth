import type { User } from "better-auth";
import { organizationClient } from "better-auth/client/plugins";
import type { Member, Organization } from "better-auth/plugins/organization";
import { organization } from "better-auth/plugins/organization";
import { getTestInstance } from "better-auth/test";
import type Stripe from "stripe";
import { describe, expect, it } from "vitest";
import { stripe } from "../src";
import { stripeClient } from "../src/client";
import type {
	StripeOptions,
	Subscription,
	WithStripeCustomerId,
} from "../src/types";
import {
	createPrice,
	createSubscriptionEvent,
	createSubscriptionItem,
} from "./_factories";
import {
	createStripeMock,
	TEST_PRICES,
	TEST_WEBHOOK_SECRET,
} from "./_fixtures";

async function setup() {
	const mock = createStripeMock();
	mock.customers.create.mockImplementation(
		async (params: Stripe.CustomerCreateParams) => ({
			id: `cus_${params.metadata?.customerType ?? "user"}_${mock.customers.create.mock.calls.length}`,
			email: params.email,
		}),
	);
	const options = {
		stripeClient: mock as unknown as Stripe,
		stripeWebhookSecret: TEST_WEBHOOK_SECRET,
		createCustomerOnSignUp: true,
		organization: {
			enabled: true,
		},
		subscription: {
			enabled: true,
			plans: [
				{
					priceId: TEST_PRICES.starter,
					name: "starter",
				},
			],
			// Only organization owners may manage organization billing.
			authorizeReference: async ({ user, referenceId }, ctx) => {
				const member = await ctx.context.adapter.findOne<Pick<Member, "role">>({
					model: "member",
					where: [
						{ field: "userId", value: user.id },
						{ field: "organizationId", value: referenceId },
					],
				});
				return member?.role === "owner";
			},
		},
	} satisfies StripeOptions;
	const instance = await getTestInstance(
		{
			plugins: [organization(), stripe(options)],
		},
		{
			disableTestUser: true,
			clientOptions: {
				plugins: [organizationClient(), stripeClient({ subscription: true })],
			},
		},
	);
	const ctx = await instance.auth.$context;
	const signUp = async (email: string, extra: Record<string, unknown> = {}) => {
		const headers = new Headers();
		const res = await instance.client.$fetch<{ user: Pick<User, "id"> }>(
			"/sign-up/email",
			{
				method: "POST",
				body: {
					email,
					password: "password1234",
					name: email,
					...extra,
				},
				onSuccess: instance.sessionSetter(headers),
			},
		);
		return { headers, res };
	};
	const findCustomerId = async (model: "user" | "organization", id: string) => {
		const row = await ctx.adapter.findOne<WithStripeCustomerId>({
			model,
			where: [{ field: "id", value: id }],
		});
		return row?.stripeCustomerId;
	};
	const createOrganization = async (headers: Headers) => {
		const org = await instance.client.$fetch<Pick<Organization, "id">>(
			"/organization/create",
			{
				method: "POST",
				body: {
					name: "Acme",
					slug: "acme",
				},
				headers,
			},
		);
		const orgId = org.data!.id;
		await instance.client.$fetch("/subscription/upgrade", {
			method: "POST",
			body: {
				plan: "starter",
				customerType: "organization",
				referenceId: orgId,
				successUrl: "/",
				cancelUrl: "/",
			},
			headers,
		});
		return orgId;
	};
	const portalCustomers = () =>
		mock.billingPortal.sessions.create.mock.calls.map((c) => c[0].customer);
	return {
		...instance,
		ctx,
		mock,
		signUp,
		findCustomerId,
		createOrganization,
		portalCustomers,
	};
}

describe("stripeCustomerId is server-owned", () => {
	it("rejects stripeCustomerId on sign-up", async () => {
		const t = await setup();
		const { res } = await t.signUp("user@example.com", {
			stripeCustomerId: "cus_planted",
		});

		expect(res.error).toMatchObject({
			status: 400,
			code: "FIELD_NOT_ALLOWED",
		});
		expect(t.mock.customers.create).not.toHaveBeenCalled();
	});

	it("rejects stripeCustomerId on update-user and leaves Stripe untouched", async () => {
		const t = await setup();
		const other = await t.signUp("other@example.com");
		const otherCustomer = await t.findCustomerId(
			"user",
			other.res.data!.user.id,
		);
		expect(otherCustomer).toMatch(/^cus_user_/);
		const user = await t.signUp("user@example.com");
		const userCustomer = await t.findCustomerId("user", user.res.data!.user.id);
		t.mock.customers.update.mockClear();

		const res = await t.client.$fetch("/update-user", {
			method: "POST",
			body: {
				stripeCustomerId: otherCustomer,
			},
			headers: user.headers,
		});

		expect(res.error).toMatchObject({
			status: 400,
			code: "FIELD_NOT_ALLOWED",
		});
		expect(await t.findCustomerId("user", user.res.data!.user.id)).toBe(
			userCustomer,
		);
		expect(t.mock.customers.update).not.toHaveBeenCalled();
	});

	it("opens the billing portal and checkout on the user's own customer", async () => {
		const t = await setup();
		const other = await t.signUp("other@example.com");
		const otherCustomer = await t.findCustomerId(
			"user",
			other.res.data!.user.id,
		);
		const user = await t.signUp("user@example.com");
		const userCustomer = await t.findCustomerId("user", user.res.data!.user.id);
		await t.client.$fetch("/update-user", {
			method: "POST",
			body: {
				stripeCustomerId: otherCustomer,
			},
			headers: user.headers,
		});

		await t.client.$fetch("/subscription/billing-portal", {
			method: "POST",
			body: {
				returnUrl: "/",
			},
			headers: user.headers,
		});
		await t.client.$fetch("/subscription/upgrade", {
			method: "POST",
			body: {
				plan: "starter",
				successUrl: "/",
				cancelUrl: "/",
			},
			headers: user.headers,
		});

		expect(t.portalCustomers()).toEqual([userCustomer]);
		expect(t.mock.checkout.sessions.create).toHaveBeenCalledWith(
			expect.objectContaining({
				customer: userCustomer,
			}),
			undefined,
		);
	});

	it("keeps an organization member off the organization's billing portal", async () => {
		const t = await setup();
		const owner = await t.signUp("owner@example.com");
		const orgId = await t.createOrganization(owner.headers);
		const orgCustomer = await t.findCustomerId("organization", orgId);
		expect(orgCustomer).toMatch(/^cus_organization_/);
		const member = await t.signUp("member@example.com");
		await t.auth.api.addMember({
			body: {
				userId: member.res.data!.user.id,
				organizationId: orgId,
				role: "member",
			},
		});

		const refused = await t.client.$fetch("/subscription/billing-portal", {
			method: "POST",
			body: {
				customerType: "organization",
				referenceId: orgId,
				returnUrl: "/",
			},
			headers: member.headers,
		});
		expect(refused.error?.status).toBe(401);

		const update = await t.client.$fetch("/update-user", {
			method: "POST",
			body: {
				stripeCustomerId: orgCustomer,
			},
			headers: member.headers,
		});
		expect(update.error).toMatchObject({
			status: 400,
			code: "FIELD_NOT_ALLOWED",
		});
		await t.client.$fetch("/subscription/billing-portal", {
			method: "POST",
			body: {
				returnUrl: "/",
			},
			headers: member.headers,
		});

		expect(t.portalCustomers()).not.toContain(orgCustomer);
		expect(t.mock.customers.update).not.toHaveBeenCalledWith(
			orgCustomer,
			expect.anything(),
		);
	});
});

describe("referenceMiddleware customerType", () => {
	it("uses the customer type the middleware authorized when it comes from the query", async () => {
		const t = await setup();
		const owner = await t.signUp("owner@example.com");
		const orgId = await t.createOrganization(owner.headers);
		const orgCustomer = await t.findCustomerId("organization", orgId);

		const res = await t.client.$fetch(
			`/subscription/billing-portal?customerType=organization&referenceId=${orgId}`,
			{
				method: "POST",
				body: {
					returnUrl: "/",
				},
				headers: owner.headers,
			},
		);

		expect(res.error).toBeNull();
		expect(t.portalCustomers()).toEqual([orgCustomer]);
	});
});

describe("stripe flows with server-owned customer ids", () => {
	it("keeps sign-up, profile update, portals, organization upgrade and webhooks working", async () => {
		const t = await setup();
		const user = await t.signUp("alice@example.com");
		const userId = user.res.data!.user.id;
		const userCustomer = await t.findCustomerId("user", userId);
		expect(userCustomer).toMatch(/^cus_user_/);

		const update = await t.client.$fetch("/update-user", {
			method: "POST",
			body: {
				name: "Alice B",
			},
			headers: user.headers,
		});
		expect(update.error).toBeNull();

		const portal = await t.client.$fetch<
			Pick<Stripe.BillingPortal.Session, "url">
		>("/subscription/billing-portal", {
			method: "POST",
			body: {
				returnUrl: "/",
			},
			headers: user.headers,
		});
		expect(portal.data?.url).toBeTruthy();

		const orgId = await t.createOrganization(user.headers);
		const orgCustomer = await t.findCustomerId("organization", orgId);
		expect(orgCustomer).toMatch(/^cus_organization_/);
		const orgPortal = await t.client.$fetch<
			Pick<Stripe.BillingPortal.Session, "url">
		>("/subscription/billing-portal", {
			method: "POST",
			body: {
				customerType: "organization",
				referenceId: orgId,
				returnUrl: "/",
			},
			headers: user.headers,
		});
		expect(orgPortal.data?.url).toBeTruthy();
		expect(t.portalCustomers()).toEqual([userCustomer, orgCustomer]);

		const event = createSubscriptionEvent("customer.subscription.created", {
			id: "sub_dashboard",
			customer: userCustomer!,
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
				url: "",
			},
		});
		t.mock.webhooks.constructEventAsync.mockResolvedValueOnce(event);
		const res = await t.auth.handler(
			new Request("http://localhost:3000/api/auth/stripe/webhook", {
				method: "POST",
				headers: {
					"stripe-signature": "sig",
				},
				body: JSON.stringify(event),
			}),
		);
		expect(res.status).toBe(200);
		const sub = await t.ctx.adapter.findOne<Subscription>({
			model: "subscription",
			where: [{ field: "stripeSubscriptionId", value: "sub_dashboard" }],
		});
		expect(sub?.referenceId).toBe(userId);
	});
});
