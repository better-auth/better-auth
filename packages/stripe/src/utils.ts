import type { AuthPluginSchema } from "better-auth";
import type { StripeOptions } from "./types";

export async function getPlans(options: StripeOptions) {
	return typeof options?.subscription?.plans === "function"
		? await options.subscription?.plans()
		: options.subscription?.plans;
}

export async function getPlanByPriceId(
	options: StripeOptions,
	priceId: string,
) {
	return await getPlans(options).then((res) =>
		res?.find((plan) => plan.priceId === priceId),
	);
}

export async function getPlanByName(options: StripeOptions, name: string) {
	return await getPlans(options).then((res) =>
		res?.find((plan) => plan.name.toLowerCase() === name.toLowerCase()),
	);
}

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
				billingCycleStart: {
					type: "date",
					required: false,
				},
				userId: {
					type: "string",
					references: {
						model: "user",
						field: "id",
					},
				},
			},
		},
	} as const;
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
				name: {
					type: "string",
					required: false,
				},
				email: {
					type: "string",
					required: false,
				},
				country: {
					type: "string",
					required: false,
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
