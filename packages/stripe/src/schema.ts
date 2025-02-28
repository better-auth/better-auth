import type { AuthPluginSchema } from "better-auth";
import type { StripeOptions } from "./types";

export const getSchema = (options: StripeOptions) => {
	const subscriptions = {
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
	const user = {
		user: {
			fields: {
				stripeCustomerId: {
					type: "string",
					required: false,
				},
			},
		},
	} satisfies AuthPluginSchema;
	return {
		...(options.subscription?.enabled ? subscriptions : {}),
		...user,
	} as typeof user & typeof subscriptions;
};
