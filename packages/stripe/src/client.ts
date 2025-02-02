import type { BetterAuthClientPlugin } from "better-auth";
import type { stripe } from "./index";

export const stripeClient = () => {
	return {
		id: "stripe-client",
		$InferServerPlugin: {} as ReturnType<typeof stripe>,
	} satisfies BetterAuthClientPlugin;
};
