import type { BetterAuthClientPlugin } from "better-auth";
import { STRIPE_ERROR_CODES } from "./error-codes";
import type { stripe } from "./index";

export const stripeClient = <
	O extends {
		subscription: boolean;
	},
>(
	options?: O | undefined,
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
		pathMethods: {
			"/subscription/billing-portal": "POST",
			"/subscription/restore": "POST",
			"/subscription/create-embedded-checkout": "POST",
			"/subscription/checkout-status": "GET",
		},
		$ERROR_CODES: STRIPE_ERROR_CODES,
	} satisfies BetterAuthClientPlugin;
};

export * from "./embedded-checkout";
export * from "./error-codes";
