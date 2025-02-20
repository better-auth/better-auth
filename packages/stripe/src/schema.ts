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
				status: {
					type: "string",
					defaultValue: "incomplete",
				},
				periodStart: {
					type: "date",
					required: false,
				},
				cancelAtPeriodEnd: {
					type: "boolean",
					required: false,
					defaultValue: false,
				},
			},
		},
	} satisfies AuthPluginSchema;
	const customer = {
		customer: {
			fields: {
				stripeCustomerId: {
					type: "string",
					required: true,
				},
				userId: {
					type: "string",
					references: {
						model: "user",
						field: "id",
					},
				},
				createdAt: {
					type: "date",
					required: true,
				},
				updatedAt: {
					type: "date",
					required: true,
				},
			},
		},
	} satisfies AuthPluginSchema;
	return {
		...(options.subscription?.enabled ? subscriptions : {}),
		...customer,
	} as typeof customer & typeof subscriptions;
};
