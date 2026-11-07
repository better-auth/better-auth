import { waitUntil } from "cloudflare:workers";
import type { BetterAuthOptions } from "../types";

/**
 * Keeps Better Auth initialization and the schema validation that follows it
 * alive past the request that started them.
 *
 * The Workers runtime ends I/O with the request that started it, so
 * initialization stops once that request responds. The next request starts
 * initialization again, and this wrapper saves it the 30 second wait before
 * that retry. Handing both to `waitUntil` holds the runtime open until they
 * finish.
 *
 * Wrap the options before passing them to `betterAuth`. An
 * `advanced.backgroundTasks.handler` you set yourself is preserved.
 *
 * @example
 * ```ts
 * import { env } from "cloudflare:workers";
 * import { betterAuth } from "better-auth";
 * import { withCloudflare } from "better-auth/cloudflare";
 *
 * export const auth = betterAuth(
 * 	withCloudflare({
 * 		database: env.DB,
 * 		emailAndPassword: { enabled: true },
 * 	}),
 * );
 * ```
 *
 * @see https://github.com/better-auth/better-auth/issues/10315
 */
export const withCloudflare = <Options extends BetterAuthOptions>(
	options: Options,
): Options =>
	({
		...options,
		advanced: {
			...options.advanced,
			backgroundTasks: {
				...options.advanced?.backgroundTasks,
				handler: options.advanced?.backgroundTasks?.handler ?? waitUntil,
			},
		},
	}) satisfies BetterAuthOptions as Options;
