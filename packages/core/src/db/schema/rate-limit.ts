import * as z from "zod";
import type { BetterAuthOptions, Prettify } from "../../types";
import type {
	InferDBFieldsFromOptions,
	InferDBFieldsFromPlugins,
} from "../type";

export const rateLimitSchema = z.object({
	/**
	 * The key to use for rate limiting
	 */
	key: z.string(),
	/**
	 * Opaque, versioned algorithm state.
	 */
	state: z.string(),
	/**
	 * Time after which the state can be discarded.
	 */
	expiresAt: z.number(),
	/**
	 * Monotonic revision used for compare-and-swap updates.
	 */
	revision: z.number(),
});

export type BaseRateLimit = z.infer<typeof rateLimitSchema>;

/**
 * Rate limit schema type used by better-auth for rate limiting
 */
export type RateLimit<
	DBOptions extends
		BetterAuthOptions["rateLimit"] = BetterAuthOptions["rateLimit"],
	Plugins extends BetterAuthOptions["plugins"] = BetterAuthOptions["plugins"],
> = Prettify<
	BaseRateLimit &
		InferDBFieldsFromOptions<DBOptions> &
		InferDBFieldsFromPlugins<"rateLimit", Plugins>
>;
