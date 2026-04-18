import type { BetterAuthPlugin } from "@better-auth/core";
import { createAuthMiddleware } from "@better-auth/core/api";
import { PACKAGE_VERSION } from "../../version";

declare module "@better-auth/core" {
	interface BetterAuthPluginRegistry<AuthOptions, Options> {
		"last-login-method": {
			creator: typeof lastLoginMethod;
		};
	}
}

export interface LastLoginMethodOptions {
	/**
	 * Name of the cookie to store the last login method.
	 * @default "better-auth.last_used_login_method"
	 */
	cookieName?: string | undefined;
	/**
	 * Cookie expiration time in seconds.
	 * @default 2592000 (30 days)
	 */
	maxAge?: number | undefined;
	/**
	 * @deprecated Removed. The cookie is now derived from `session.amr[0].method`;
	 * persisting the last login method on the user row is no longer supported.
	 */
	storeInDatabase?: never;
	/**
	 * @deprecated Removed. The plugin reads `session.amr[0].method` directly;
	 * provide a custom AMR contributor in your sign-in flow instead.
	 */
	customResolveMethod?: never;
	/**
	 * @deprecated Removed alongside `storeInDatabase`. There is no per-plugin
	 * schema to override; AMR lives on the `session` table.
	 */
	schema?: never;
}

const REMOVED_OPTIONS = [
	"customResolveMethod",
	"storeInDatabase",
	"schema",
] as const;

/**
 * Stamps a client-readable cookie with the primary factor from the finalized
 * session's `amr` chain. Reads `session.amr[0]?.method` as the single source of
 * truth; nothing is derived from request paths or persisted to the user row.
 */
export const lastLoginMethod = (
	userConfig?: LastLoginMethodOptions | undefined,
) => {
	const config = {
		cookieName: "better-auth.last_used_login_method",
		maxAge: 60 * 60 * 24 * 30,
		...userConfig,
	} satisfies LastLoginMethodOptions;

	return {
		id: "last-login-method",
		version: PACKAGE_VERSION,
		init() {
			const removed = userConfig
				? REMOVED_OPTIONS.filter((key) => key in userConfig)
				: [];
			if (removed.length > 0) {
				throw new Error(
					`last-login-method: options [${removed.join(", ")}] are no longer supported. The plugin now reads session.amr[0].method; remove them and rely on the session's amr chain.`,
				);
			}
			return {};
		},
		hooks: {
			after: [
				{
					matcher() {
						return true;
					},
					handler: createAuthMiddleware(async (ctx) => {
						const finalized = ctx.context.getFinalizedSignIn();
						if (!finalized) return;
						const primary = finalized.session.amr[0]?.method;
						if (!primary) return;
						ctx.setCookie(config.cookieName, primary, {
							...ctx.context.authCookies.sessionToken.attributes,
							maxAge: config.maxAge,
							httpOnly: false,
						});
					}),
				},
			],
		},
	} satisfies BetterAuthPlugin;
};
