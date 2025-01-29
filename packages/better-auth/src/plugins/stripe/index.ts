import type { BetterAuthPlugin } from "../../types";
import type { StripeOptions } from "./type";

export const stripe = (options: StripeOptions) => {
	return {
		id: "stripe",
	} satisfies BetterAuthPlugin;
};
