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
	 * The number of requests made
	 */
	count: z.number(),
	/**
	 * The last request time in milliseconds
	 */
	lastRequest: z.number(),
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
