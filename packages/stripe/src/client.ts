import type { BetterAuthClientPlugin } from "better-auth";
import type { stripe } from "./index";
import { createAuthClient } from "better-auth/client";

export const stripeClient = <
	O extends {
		subscription: boolean;
	},
>(
	options?: O,
) => {
	return {
		id: "stripe-client",
		$InferServerPlugin: {} as ReturnType<
			typeof stripe<
				O["subscription"] extends true
					? {
							stripeClient: any;
							stripeWebhookSecret: string;
							subscription: {
								enabled: true;
								plans: [];
							};
						}
					: {
							stripeClient: any;
							stripeWebhookSecret: string;
						}
			>
		>,
		getActions($fetch, $store, options) {
			return {
				async useCustomer(data: {
					expand: ["invoices", "subscriptions"];
				}) {
					return {};
				},
			};
		},
		pathMethods: {
			"/subscription/restore": "POST",
		},
	} satisfies BetterAuthClientPlugin;
};

export const testClient = () => {
	return {
		id: "stripe-client",
		getActions($fetch, $store, options) {
			return {
				//return any action here
				async useCustomer(data: {
					expand: ["invoices", "subscriptions"];
				}) {
					return {};
				},
			};
		},
	} satisfies BetterAuthClientPlugin;
};

const cl = createAuthClient({
	plugins: [stripeClient()],
});

cl.useCustomer({
	expand: ["invoices", "subscriptions"],
});
