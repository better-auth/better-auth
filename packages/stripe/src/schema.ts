import type { BetterAuthPluginDBSchema } from "@better-auth/core/db";
import { mergeSchema } from "better-auth/db";
import type { StripeOptions } from "./types";

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
			trialStart: {
				type: "date",
				required: false,
			},
			trialEnd: {
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
} satisfies BetterAuthPluginDBSchema;

export const user = {
	user: {
		fields: {
			stripeCustomerId: {
				type: "string",
				required: false,
			},
		},
	},
} satisfies BetterAuthPluginDBSchema;

export const getSchema = (options: StripeOptions) => {
	let baseSchema = {};

	if (options.subscription?.enabled) {
		baseSchema = {
			...subscriptions,
			...user,
		};
	} else {
		baseSchema = {
			...user,
		};
	}

	if (
		options.schema &&
		!options.subscription?.enabled &&
		"subscription" in options.schema
	) {
		const { subscription, ...restSchema } = options.schema;
		return mergeSchema(baseSchema, restSchema);
	}

	return mergeSchema(baseSchema, options.schema);
};
