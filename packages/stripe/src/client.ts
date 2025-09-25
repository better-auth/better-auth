import type { BetterAuthClientPlugin } from "better-auth";
import type { stripe } from "./index";

export const stripeClient = <
	O extends {
		subscription: boolean;
		payments?: boolean;
	},
>(
	options?: O,
) => {
	return {
		id: "stripe-client",
		$InferServerPlugin: {} as ReturnType<
			typeof stripe<
				{
					stripeClient: any;
					stripeWebhookSecret: string;
				} & (O["subscription"] extends true
					? { subscription: { enabled: true; plans: [] } }
					: {}) &
					(O["payments"] extends true ? { payments: { enabled: true } } : {})
			>
		>,
		pathMethods: {
			"/subscription/restore": "POST",
			"/subscription/billing-portal": "POST",
		},
	} satisfies BetterAuthClientPlugin;
};
