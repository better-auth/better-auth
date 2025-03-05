import type { BetterAuthClientPlugin } from "better-auth";
import type { stripe } from "./index";

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
							stripeWebhookSecret: "";
							subscription: {
								enabled: true;
								plans: [];
							};
						}
					: {
							stripeClient: any;
							stripeWebhookSecret: "";
						}
			>
		>,
	} satisfies BetterAuthClientPlugin;
};
