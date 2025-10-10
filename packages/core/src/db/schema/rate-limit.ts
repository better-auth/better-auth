import * as z from "zod";

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

/**
 * Rate limit schema type used by better-auth for rate limiting
 */
export type RateLimit = z.infer<typeof rateLimitSchema>;
