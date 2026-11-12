import type { memoryAdapter } from "better-auth/adapters/memory";
import { getTestInstance } from "better-auth/test";
import { describe, expect, vi } from "vitest";
import { stripe } from "../src";
import { stripeClient } from "../src/client";
import type {
	BillingPortalSessionParamsData,
	StripeOptions,
	StripePlan,
	Subscription,
	SubscriptionOptions,
} from "../src/types";
import {
	createPrice,
	createSubscription,
	createSubscriptionItem,
} from "./_factories";
import { TEST_PRICES, test } from "./_fixtures";

async function setup(
	stripeOptions: StripeOptions,
	memory: ReturnType<typeof memoryAdapter>,
) {
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
	const user = { email: "portal@test.com", password: "password", name: "P" };
	const { user: created } = await client.signUp.email(user, { throw: true });
	const headers = new Headers();
	await client.signIn.email(user, {
		throw: true,
		onSuccess: sessionSetter(headers),
	});
	return { client, ctx, headers, userId: created.id };
}

/**
 * @see https://github.com/better-auth/better-auth/issues/11464
 */
describe("getBillingPortalSessionParams", () => {
	test("should apply params to the billing portal endpoint with the active subscription's plan", async ({
		stripeMock,
		memory,
		stripeOptions,
	}) => {
		const getBillingPortalSessionParams = vi.fn(
			(data: BillingPortalSessionParamsData) => ({
				params: {
					configuration:
						data.plan?.name === "premium" ? "bpc_premium" : "bpc_default",
				},
				options: { stripeAccount: "acct_connected" },
			}),
		);
		const { client, ctx, headers, userId } = await setup(
			{
				...stripeOptions,
				subscription: {
					...stripeOptions.subscription,
					getBillingPortalSessionParams,
				},
			},
			memory,
		);
		await ctx.adapter.create<Subscription>({
			model: "subscription",
			data: {
				referenceId: userId,
				stripeCustomerId: "cus_mock123",
				stripeSubscriptionId: "sub_premium",
				status: "active",
				plan: "premium",
			},
		});

		const res = await client.subscription.billingPortal({
			returnUrl: "/dashboard",
			fetchOptions: { headers },
		});

		expect(res.error).toBeNull();
		expect(getBillingPortalSessionParams).toHaveBeenCalledWith(
			expect.objectContaining({
				action: "billing-portal",
				referenceId: userId,
				customerType: "user",
				user: expect.objectContaining({ id: userId }),
				subscription: expect.objectContaining({ plan: "premium" }),
				plan: expect.objectContaining({ name: "premium" }),
			}),
			expect.anything(),
		);
		expect(stripeMock.billingPortal.sessions.create).toHaveBeenCalledWith(
			{
				configuration: "bpc_premium",
				customer: "cus_mock123",
				return_url: "http://localhost:3000/dashboard",
			},
			{ stripeAccount: "acct_connected" },
		);
	});

	test("should pass undefined subscription and plan when the reference has no active subscription", async ({
		stripeMock,
		memory,
		stripeOptions,
	}) => {
		const getBillingPortalSessionParams = vi.fn(() => ({
			params: { configuration: "bpc_default" },
		}));
		const { client, headers } = await setup(
			{
				...stripeOptions,
				subscription: {
					...stripeOptions.subscription,
					getBillingPortalSessionParams,
				},
			},
			memory,
		);

		await client.subscription.billingPortal({
			returnUrl: "/dashboard",
			fetchOptions: { headers },
		});

		expect(getBillingPortalSessionParams).toHaveBeenCalledWith(
			expect.objectContaining({ subscription: undefined, plan: undefined }),
			expect.anything(),
		);
		expect(stripeMock.billingPortal.sessions.create).toHaveBeenCalledWith(
			expect.objectContaining({ configuration: "bpc_default" }),
		);
	});

	test("should ignore plugin-managed fields and prefer the request locale", async ({
		stripeMock,
		memory,
		stripeOptions,
	}) => {
		const { client, headers } = await setup(
			{
				...stripeOptions,
				subscription: {
					...stripeOptions.subscription,
					getBillingPortalSessionParams: () => ({
						params: {
							configuration: "bpc_default",
							locale: "fr",
							customer: "cus_attacker",
							customer_account: "acct_attacker",
							return_url: "https://evil.example.com",
							flow_data: { type: "payment_method_update" },
						},
					}),
				},
			},
			memory,
		);

		await client.subscription.billingPortal({
			returnUrl: "/dashboard",
			locale: "ko",
			fetchOptions: { headers },
		});

		expect(stripeMock.billingPortal.sessions.create).toHaveBeenCalledWith({
			configuration: "bpc_default",
			locale: "ko",
			customer: "cus_mock123",
			return_url: "http://localhost:3000/dashboard",
		});
	});

	test("should fall back to the hook locale when the request omits one", async ({
		stripeMock,
		memory,
		stripeOptions,
	}) => {
		const { client, headers } = await setup(
			{
				...stripeOptions,
				subscription: {
					...stripeOptions.subscription,
					getBillingPortalSessionParams: () => ({
						params: { locale: "fr" },
					}),
				},
			},
			memory,
		);

		await client.subscription.billingPortal({
			returnUrl: "/dashboard",
			fetchOptions: { headers },
		});

		expect(stripeMock.billingPortal.sessions.create).toHaveBeenCalledWith(
			expect.objectContaining({ locale: "fr" }),
		);
	});

	test("should apply params to the cancel flow", async ({
		stripeMock,
		memory,
		stripeOptions,
	}) => {
		const getBillingPortalSessionParams = vi.fn(() => ({
			params: { configuration: "bpc_cancel" },
		}));
		const { client, ctx, headers, userId } = await setup(
			{
				...stripeOptions,
				subscription: {
					...stripeOptions.subscription,
					getBillingPortalSessionParams,
				},
			},
			memory,
		);
		await ctx.adapter.create<Subscription>({
			model: "subscription",
			data: {
				referenceId: userId,
				stripeCustomerId: "cus_mock123",
				stripeSubscriptionId: "sub_cancel",
				status: "active",
				plan: "starter",
			},
		});
		stripeMock.subscriptions.retrieve.mockResolvedValueOnce(
			createSubscription({ id: "sub_cancel", status: "active" }),
		);

		const res = await client.subscription.cancel({
			returnUrl: "/account",
			fetchOptions: { headers },
		});

		expect(res.error).toBeNull();
		expect(getBillingPortalSessionParams).toHaveBeenCalledWith(
			expect.objectContaining({
				action: "cancel-subscription",
				subscription: expect.objectContaining({
					stripeSubscriptionId: "sub_cancel",
				}),
				plan: expect.objectContaining({ name: "starter" }),
			}),
			expect.anything(),
		);
		expect(stripeMock.billingPortal.sessions.create).toHaveBeenCalledWith(
			expect.objectContaining({
				configuration: "bpc_cancel",
				customer: "cus_mock123",
				flow_data: {
					type: "subscription_cancel",
					subscription_cancel: { subscription: "sub_cancel" },
				},
			}),
		);
	});

	test("should apply params to the upgrade flow with the target plan", async ({
		stripeMock,
		memory,
		stripeOptions,
	}) => {
		const getBillingPortalSessionParams = vi.fn(() => ({
			params: { configuration: "bpc_upgrade" },
		}));
		const { client, ctx, headers, userId } = await setup(
			{
				...stripeOptions,
				subscription: {
					...stripeOptions.subscription,
					getBillingPortalSessionParams,
				},
			},
			memory,
		);
		await ctx.adapter.create<Subscription>({
			model: "subscription",
			data: {
				referenceId: userId,
				stripeCustomerId: "cus_mock123",
				stripeSubscriptionId: "sub_upgrade",
				status: "active",
				plan: "starter",
			},
		});
		stripeMock.subscriptions.list.mockResolvedValueOnce({
			data: [
				createSubscription({
					id: "sub_upgrade",
					status: "active",
					items: {
						object: "list",
						data: [
							createSubscriptionItem({
								id: "si_starter",
								price: createPrice({ id: TEST_PRICES.starter }),
							}),
						],
						has_more: false,
						url: "",
					},
				}),
			],
		});

		const res = await client.subscription.upgrade({
			plan: "premium",
			fetchOptions: { headers },
		});

		expect(res.error).toBeNull();
		expect(getBillingPortalSessionParams).toHaveBeenCalledWith(
			expect.objectContaining({
				action: "upgrade-subscription",
				subscription: expect.objectContaining({ plan: "starter" }),
				plan: expect.objectContaining({ name: "premium" }),
			}),
			expect.anything(),
		);
		expect(stripeMock.billingPortal.sessions.create).toHaveBeenCalledWith(
			expect.objectContaining({
				configuration: "bpc_upgrade",
				customer: "cus_mock123",
				flow_data: expect.objectContaining({
					type: "subscription_update_confirm",
				}),
			}),
		);
	});
});

/**
 * @see https://github.com/better-auth/better-auth/issues/11464
 */
describe("plan billingPortalConfiguration", () => {
	function withPortalConfigurations(
		stripeOptions: StripeOptions,
		getBillingPortalSessionParams?: SubscriptionOptions["getBillingPortalSessionParams"],
	): StripeOptions {
		return {
			...stripeOptions,
			subscription: {
				enabled: true,
				plans: [
					{
						name: "starter",
						priceId: TEST_PRICES.starter,
						billingPortalConfiguration: "bpc_starter",
					},
					{
						name: "premium",
						priceId: TEST_PRICES.premium,
						billingPortalConfiguration: "bpc_premium",
					},
				],
				getBillingPortalSessionParams,
			},
		};
	}

	async function createActiveSubscription(
		ctx: Awaited<ReturnType<typeof setup>>["ctx"],
		referenceId: string,
		plan: string,
		stripeSubscriptionId: string,
	) {
		await ctx.adapter.create<Subscription>({
			model: "subscription",
			data: {
				referenceId,
				stripeCustomerId: "cus_mock123",
				stripeSubscriptionId,
				status: "active",
				plan,
			},
		});
	}

	test("should use the active subscription's plan configuration for the billing portal", async ({
		stripeMock,
		memory,
		stripeOptions,
	}) => {
		const { client, ctx, headers, userId } = await setup(
			withPortalConfigurations(stripeOptions),
			memory,
		);
		await createActiveSubscription(ctx, userId, "premium", "sub_premium");

		await client.subscription.billingPortal({
			returnUrl: "/dashboard",
			fetchOptions: { headers },
		});

		expect(stripeMock.billingPortal.sessions.create).toHaveBeenCalledWith({
			configuration: "bpc_premium",
			customer: "cus_mock123",
			return_url: "http://localhost:3000/dashboard",
		});
	});

	test("should use the default configuration when the reference has no active subscription", async ({
		stripeMock,
		memory,
		stripeOptions,
	}) => {
		const { client, headers } = await setup(
			withPortalConfigurations(stripeOptions),
			memory,
		);

		await client.subscription.billingPortal({
			returnUrl: "/dashboard",
			fetchOptions: { headers },
		});

		expect(stripeMock.billingPortal.sessions.create).toHaveBeenCalledWith({
			customer: "cus_mock123",
			return_url: "http://localhost:3000/dashboard",
		});
	});

	test("should use the plan configuration for the cancel flow", async ({
		stripeMock,
		memory,
		stripeOptions,
	}) => {
		const { client, ctx, headers, userId } = await setup(
			withPortalConfigurations(stripeOptions),
			memory,
		);
		await createActiveSubscription(ctx, userId, "starter", "sub_cancel");
		stripeMock.subscriptions.retrieve.mockResolvedValueOnce(
			createSubscription({ id: "sub_cancel", status: "active" }),
		);

		await client.subscription.cancel({
			returnUrl: "/account",
			fetchOptions: { headers },
		});

		expect(stripeMock.billingPortal.sessions.create).toHaveBeenCalledWith(
			expect.objectContaining({
				configuration: "bpc_starter",
				flow_data: expect.objectContaining({ type: "subscription_cancel" }),
			}),
		);
	});

	test("should use the current plan's configuration when changing plans", async ({
		stripeMock,
		memory,
		stripeOptions,
	}) => {
		const { client, ctx, headers, userId } = await setup(
			withPortalConfigurations(stripeOptions),
			memory,
		);
		await createActiveSubscription(ctx, userId, "starter", "sub_upgrade");
		stripeMock.subscriptions.list.mockResolvedValueOnce({
			data: [
				createSubscription({
					id: "sub_upgrade",
					status: "active",
					items: {
						object: "list",
						data: [
							createSubscriptionItem({
								id: "si_starter",
								price: createPrice({ id: TEST_PRICES.starter }),
							}),
						],
						has_more: false,
						url: "",
					},
				}),
			],
		});

		const res = await client.subscription.upgrade({
			plan: "premium",
			fetchOptions: { headers },
		});

		expect(res.error).toBeNull();
		expect(stripeMock.billingPortal.sessions.create).toHaveBeenCalledWith(
			expect.objectContaining({
				configuration: "bpc_starter",
				flow_data: expect.objectContaining({
					type: "subscription_update_confirm",
				}),
			}),
		);
	});

	test("should resolve dynamic plans once when changing plans", async ({
		stripeMock,
		memory,
		stripeOptions,
	}) => {
		const staticOptions = withPortalConfigurations(stripeOptions);
		const staticPlans = (staticOptions.subscription as SubscriptionOptions)
			.plans as StripePlan[];
		const plans = vi.fn(async () => staticPlans);
		const { client, ctx, headers, userId } = await setup(
			{
				...staticOptions,
				subscription: { enabled: true, plans },
			},
			memory,
		);
		await createActiveSubscription(ctx, userId, "starter", "sub_upgrade");
		stripeMock.subscriptions.list.mockResolvedValueOnce({
			data: [
				createSubscription({
					id: "sub_upgrade",
					status: "active",
					items: {
						object: "list",
						data: [
							createSubscriptionItem({
								id: "si_starter",
								price: createPrice({ id: TEST_PRICES.starter }),
							}),
						],
						has_more: false,
						url: "",
					},
				}),
			],
		});
		plans.mockClear();

		const res = await client.subscription.upgrade({
			plan: "premium",
			fetchOptions: { headers },
		});

		expect(res.error).toBeNull();
		expect(plans).toHaveBeenCalledTimes(1);
		expect(stripeMock.billingPortal.sessions.create).toHaveBeenCalledWith(
			expect.objectContaining({ configuration: "bpc_starter" }),
		);
	});

	test("should let getBillingPortalSessionParams override the plan configuration", async ({
		stripeMock,
		memory,
		stripeOptions,
	}) => {
		const { client, ctx, headers, userId } = await setup(
			withPortalConfigurations(stripeOptions, () => ({
				params: { configuration: "bpc_override" },
			})),
			memory,
		);
		await createActiveSubscription(ctx, userId, "premium", "sub_premium");

		await client.subscription.billingPortal({
			returnUrl: "/dashboard",
			fetchOptions: { headers },
		});

		expect(stripeMock.billingPortal.sessions.create).toHaveBeenCalledWith(
			expect.objectContaining({ configuration: "bpc_override" }),
		);
	});

	test("should keep the plan configuration when getBillingPortalSessionParams omits one", async ({
		stripeMock,
		memory,
		stripeOptions,
	}) => {
		const { client, ctx, headers, userId } = await setup(
			withPortalConfigurations(stripeOptions, () => ({
				params: { locale: "fr" },
			})),
			memory,
		);
		await createActiveSubscription(ctx, userId, "premium", "sub_premium");

		await client.subscription.billingPortal({
			returnUrl: "/dashboard",
			fetchOptions: { headers },
		});

		expect(stripeMock.billingPortal.sessions.create).toHaveBeenCalledWith(
			expect.objectContaining({
				configuration: "bpc_premium",
				locale: "fr",
			}),
		);
	});
});

describe("billing portal when plans cannot be resolved", () => {
	function withFailingPlans(stripeOptions: StripeOptions): StripeOptions {
		return {
			...stripeOptions,
			subscription: {
				enabled: true,
				plans: async () => {
					throw new Error("plan provider unavailable");
				},
			},
		};
	}

	test("should still open the default billing portal", async ({
		stripeMock,
		memory,
		stripeOptions,
	}) => {
		const { client, headers } = await setup(
			withFailingPlans(stripeOptions),
			memory,
		);

		const res = await client.subscription.billingPortal({
			returnUrl: "/dashboard",
			fetchOptions: { headers },
		});

		expect(res.error).toBeNull();
		expect(stripeMock.billingPortal.sessions.create).toHaveBeenCalledWith({
			customer: "cus_mock123",
			return_url: "http://localhost:3000/dashboard",
		});
	});

	test("should still open the cancellation flow", async ({
		stripeMock,
		memory,
		stripeOptions,
	}) => {
		const { client, ctx, headers, userId } = await setup(
			withFailingPlans(stripeOptions),
			memory,
		);
		await ctx.adapter.create<Subscription>({
			model: "subscription",
			data: {
				referenceId: userId,
				stripeCustomerId: "cus_mock123",
				stripeSubscriptionId: "sub_cancel",
				status: "active",
				plan: "starter",
			},
		});
		stripeMock.subscriptions.retrieve.mockResolvedValueOnce(
			createSubscription({ id: "sub_cancel", status: "active" }),
		);

		const res = await client.subscription.cancel({
			returnUrl: "/account",
			fetchOptions: { headers },
		});

		expect(res.error).toBeNull();
		expect(stripeMock.billingPortal.sessions.create).toHaveBeenCalledWith({
			customer: "cus_mock123",
			return_url: "http://localhost:3000/account",
			flow_data: {
				type: "subscription_cancel",
				subscription_cancel: { subscription: "sub_cancel" },
			},
		});
	});
});
