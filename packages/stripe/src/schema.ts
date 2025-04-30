import type { AuthPluginSchema } from "better-auth";
import type { StripeOptions } from "./types";
import { mergeSchema } from "better-auth/db";

export const subscriptions = {
	subscription: {
		fields: {
			plan: {
				type: "string",
				required: true,
			},
			referenceId: {
				type: "string",
				required: true,
			},
			stripeCustomerId: {
				type: "string",
				required: false,
			},
			stripeSubscriptionId: {
				type: "string",
				required: false,
			},
			status: {
				type: "string",
				defaultValue: "incomplete",
			},
			periodStart: {
				type: "date",
				required: false,
			},
			periodEnd: {
				type: "date",
				required: false,
			},
			cancelAtPeriodEnd: {
				type: "boolean",
				required: false,
				defaultValue: false,
			},
			seats: {
				type: "number",
				required: false,
			},
		},
	},
} satisfies AuthPluginSchema;

export const user = {
	user: {
		fields: {
			stripeCustomerId: {
				type: "string",
				required: false,
			},
		},
	},
} satisfies AuthPluginSchema;

export const getSchema = (options: StripeOptions) => {
	if (
		options.schema &&
		!options.subscription?.enabled &&
		"subscription" in options.schema
	) {
		options.schema.subscription = undefined;
	}
	return mergeSchema(
		{
			...(options.subscription?.enabled ? subscriptions : {}),
			...user,
		},
		options.schema,
	);
};
