import type { Auth } from "better-auth";
import { getTestInstance } from "better-auth/test";
import type Stripe from "stripe";
import { describe, expectTypeOf, it } from "vitest";
import type { StripePlugin } from "../src";
import { stripe } from "../src";
import { test } from "./_fixtures";

describe("stripe type", () => {
	it("should api endpoint exists", () => {
		type Plugins = [
			StripePlugin<{
				stripeClient: Stripe;
				stripeWebhookSecret: string;
				subscription: {
					enabled: false;
				};
			}>,
		];
		type MyAuth = Auth<{
			plugins: Plugins;
		}>;
		expectTypeOf<MyAuth["api"]["stripeWebhook"]>().toBeFunction();
	});

	it("should have subscription endpoints", () => {
		type Plugins = [
			StripePlugin<{
				stripeClient: Stripe;
				stripeWebhookSecret: string;
				subscription: {
					enabled: true;
					plans: [];
				};
			}>,
		];
		type MyAuth = Auth<{
			plugins: Plugins;
		}>;
		expectTypeOf<MyAuth["api"]["stripeWebhook"]>().toBeFunction();
		expectTypeOf<MyAuth["api"]["subscriptionSuccess"]>().toBeFunction();
		expectTypeOf<MyAuth["api"]["listActiveSubscriptions"]>().toBeFunction();
		expectTypeOf<MyAuth["api"]["cancelSubscription"]>().toBeFunction();
		expectTypeOf<MyAuth["api"]["restoreSubscription"]>().toBeFunction();
		expectTypeOf<MyAuth["api"]["upgradeSubscription"]>().toBeFunction();
		expectTypeOf<MyAuth["api"]["createBillingPortal"]>().toBeFunction();
	});

	test("should infer plugin schema fields on user type", async () => {
		const { auth } = await getTestInstance({
			plugins: [
				stripe({
					stripeClient: {} as Stripe,
					stripeWebhookSecret: "test",
				}),
			],
		});
		expectTypeOf<
			(typeof auth)["$Infer"]["Session"]["user"]["stripeCustomerId"]
		>().toEqualTypeOf<string | null | undefined>();
	});

	test("should infer plugin schema fields alongside additional user fields", async () => {
		const { auth } = await getTestInstance({
			plugins: [
				stripe({
					stripeClient: {} as Stripe,
					stripeWebhookSecret: "test",
				}),
			],
			user: {
				additionalFields: {
					customField: {
						type: "string",
						required: false,
					},
				},
			},
		});
		expectTypeOf<
			(typeof auth)["$Infer"]["Session"]["user"]["stripeCustomerId"]
		>().toEqualTypeOf<string | null | undefined>();
		expectTypeOf<
			(typeof auth)["$Infer"]["Session"]["user"]["customField"]
		>().toEqualTypeOf<string | null | undefined>();
	});
});
