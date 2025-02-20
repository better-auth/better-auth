import Database from "better-sqlite3";
import { betterAuth } from "better-auth";
import { stripe } from ".";
import Stripe from "stripe";
import { createAuthClient } from "better-auth/client";
import { stripeClient } from "./client";
import type { Customer } from "./types";

describe("stripe", async () => {
	const auth = betterAuth({
		baseURL: "http://localhost:3000",
		database: new Database(":memory:"),
		emailAndPassword: {
			enabled: true,
		},
		plugins: [
			stripe({
				stripeClient: new Stripe(process.env.STRIPE_KEY!),
				stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET!,
				createCustomerOnSignUp: true,
			}),
		],
	});
	const ctx = await auth.$context;
	const authClient = createAuthClient({
		baseURL: "http://localhost:3000",
		plugins: [stripeClient()],
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

	beforeAll(async () => {
		await ctx.runMigrations();
	});

	it("should create a user", async () => {
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
		console.log(res);
	});
});
