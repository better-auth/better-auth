import type { BetterAuthPluginDBSchema } from "@better-auth/core/db";
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

export const payments = {
	payment: {
		fields: {
			product: {
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
			stripeSessionId: {
				type: "string",
				required: false,
			},
			stripePaymentIntentId: {
				type: "string",
				required: false,
			},
			priceId: {
				type: "string",
				required: false,
			},
			status: {
				type: "string",
				defaultValue: "requires_payment_method",
			},
			amount: {
				type: "number",
				required: false,
			},
			currency: {
				type: "string",
				required: false,
				defaultValue: "usd",
			},
			metadata: {
				type: "string",
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
} satisfies BetterAuthPluginDBSchema;

export const getSchema = (options: StripeOptions) => {
	let baseSchema = {};

	if (options.subscription?.enabled || options.payments?.enabled) {
		baseSchema = {
			...user,
		};
	}

	if (options.subscription?.enabled) {
		baseSchema = {
			...baseSchema,
			...subscriptions,
		};
	}

	if (options.payments?.enabled) {
		baseSchema = {
			...baseSchema,
			...payments,
		};
	}

	if (
		options.schema &&
		!options.payments?.enabled &&
		"payment" in options.schema
	) {
		const { payment, ...restSchema } = options.schema;
		return mergeSchema(baseSchema, restSchema);
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
