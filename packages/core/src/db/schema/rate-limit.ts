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
	 * The time the current window started, in milliseconds. Rate limits use a
	 * fixed window anchored to the first request in it, so this is the anchor
	 * rather than the time of the most recent request.
	 */
	lastRequest: z.number(),
	/**
	 * The time the current window ends, in milliseconds. Set when the window is
	 * opened so each row can be pruned once its own window has elapsed. Rows
	 * written before this field existed fall back to deriving it from
	 * `lastRequest` and the window in effect.
	 */
	windowExpiresAt: z.number().nullish(),
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
