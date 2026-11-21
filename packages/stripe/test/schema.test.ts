import { describe, expect, it } from "vitest";
import { getSchema, organization, subscriptions, user } from "../src/schema";

describe("stripe schema indexes", () => {
	it("should define index on subscription lookup fields", () => {
		expect(subscriptions.subscription.fields.referenceId.index).toBe(true);
		expect(subscriptions.subscription.fields.stripeCustomerId.index).toBe(true);
		expect(subscriptions.subscription.fields.stripeSubscriptionId.index).toBe(true);
	});

	it("should define index on user stripeCustomerId", () => {
		expect(user.user.fields.stripeCustomerId.index).toBe(true);
	});

	it("should define index on organization stripeCustomerId", () => {
		expect(organization.organization.fields.stripeCustomerId.index).toBe(true);
	});

	it("should return indexed fields from getSchema with subscription and organization enabled", () => {
		const schema = getSchema({
			stripeClient: {} as any,
			stripeWebhookSecret: "test",
			subscription: {
				enabled: true,
				plans: [],
			},
			organization: {
				enabled: true,
			},
		});

		expect(schema.subscription?.fields.referenceId.index).toBe(true);
		expect(schema.subscription?.fields.stripeCustomerId.index).toBe(true);
		expect(schema.subscription?.fields.stripeSubscriptionId.index).toBe(true);
		expect(schema.user?.fields.stripeCustomerId.index).toBe(true);
		expect(schema.organization?.fields.stripeCustomerId.index).toBe(true);
	});

	it("should preserve indexes when custom schema is provided", () => {
		const schema = getSchema({
			stripeClient: {} as any,
			stripeWebhookSecret: "test",
			subscription: {
				enabled: true,
				plans: [],
			},
			schema: {
				subscription: {
					fields: {
						plan: {
							required: false,
						},
					},
				},
			},
		});

		expect(schema.subscription?.fields.referenceId.index).toBe(true);
		expect(schema.subscription?.fields.stripeCustomerId.index).toBe(true);
		expect(schema.subscription?.fields.stripeSubscriptionId.index).toBe(true);
		expect(schema.user?.fields.stripeCustomerId.index).toBe(true);
	});
});
