import { betterAuth, type GenericEndpointContext } from "better-auth";
import { stripe } from ".";
import Stripe from "stripe";
import { createAuthClient } from "better-auth/client";
import { stripeClient } from "./client";
import type { Customer, StripeOptions, Subscription } from "./types";
import { bearer } from "better-auth/plugins";
import { setCookieToHeader } from "better-auth/cookies";
import { onCheckoutSessionCompleted } from "./hooks";

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

	it("should create a custom on sign up", async () => {
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
	it("should create a subscription", async () => {
		const headers = new Headers();
		const userRes = await authClient.signIn.email(testUser, {
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
		customerId = subscription!.stripeCustomerId!;
		subscriptionId = subscription!.id;
		expect(subscription).toMatchObject({
			id: expect.any(String),
			plan: "starter",
			referenceId: userRes.user.id,
			stripeCustomerId: expect.any(String),
			status: "incomplete",
			periodStart: undefined,
			cancelAtPeriodEnd: undefined,
		});
	});
});
