import type { BetterAuthClientPlugin } from "better-auth/client";
import type { StripePlan, StripePlugin } from ".";
import { STRIPE_ERROR_CODES } from "./error-codes";
import { PACKAGE_VERSION } from "./version";

export const stripeClient = <
	O extends {
		subscription: boolean;
	},
>(
	options?: O | undefined,
) => {
	return {
		id: "stripe-client",
		version: PACKAGE_VERSION,
		$InferServerPlugin: {} as StripePlugin<
			O["subscription"] extends true
				? {
						stripeClient: any;
						stripeWebhookSecret: string;
						subscription: {
							enabled: true;
							plans: StripePlan[];
						};
					}
				: {
						stripeClient: any;
						stripeWebhookSecret: string;
					}
		>,
		pathMethods: {
			"/subscription/billing-portal": "POST",
			"/subscription/restore": "POST",
		},
		$ERROR_CODES: STRIPE_ERROR_CODES,
	} satisfies BetterAuthClientPlugin;
};
export type { StripePlan, StripePlugin } from ".";
export * from "./error-codes";
