import type {
	BetterAuthPlugin,
	GenericEndpointContext,
} from "@better-auth/core";
import { createAuthMiddleware } from "@better-auth/core/api";

declare module "@better-auth/core" {
	// biome-ignore lint/correctness/noUnusedVariables: AuthOptions and Options need to be same as declared in the module
	interface BetterAuthPluginRegistry<AuthOptions, Options> {
		"last-login-method": {
			creator: typeof lastLoginMethod;
		};
	}
}
/**
 * Configuration for tracking different authentication methods
 */
export interface LastLoginMethodOptions {
	/**
	 * Name of the cookie to store the last login method
	 * @default "better-auth.last_used_login_method"
	 */
	cookieName?: string | undefined;
	/**
	 * Cookie expiration time in seconds
	 * @default 2592000 (30 days)
	 */
	maxAge?: number | undefined;
	/**
	 * Custom method to resolve the last login method
	 * @param ctx - The context from the hook
	 * @returns The last login method
	 */
	customResolveMethod?:
		| ((ctx: GenericEndpointContext) => string | null)
		| undefined;
	/**
	 * Store the last login method in the database. This will create a new field in the user table.
	 * @default false
	 */
	storeInDatabase?: boolean | undefined;
	/**
	 * A hook to run before the last login method is stored in the cookie.
	 * Useful if you are required to follow GDPR or other regulations to ensure that you're allowed to store the last login method in the cookie.
	 *
	 * @param ctx - The context from the hook
	 * @param lastUsedLoginMethod - The last login method
	 * @returns Whether to continue the flow
	 */
	beforeStoreCookie?:
		| ((
				ctx: GenericEndpointContext,
				lastUsedLoginMethod: string,
		  ) => Promise<boolean> | boolean)
		| undefined;
	/**
	 * Custom schema for the plugin
	 * @default undefined
	 */
	schema?:
		| {
				user?: {
					lastLoginMethod?: string;
				};
		  }
		| undefined;
}

/**
 * Plugin to track the last used login method
 */
export const lastLoginMethod = <O extends LastLoginMethodOptions>(
	userConfig?: O | undefined,
) => {
	const defaultResolveMethod = (ctx: GenericEndpointContext) => {
		// Check for OAuth callbacks (/callback/:id or /oauth2/callback/:providerId)
		if (
			ctx.path.startsWith("/callback/") ||
			ctx.path.startsWith("/oauth2/callback/")
		) {
			return (
				ctx.params?.id || ctx.params?.providerId || ctx.path.split("/").pop()
			);
		}
		// Check for email sign-in/sign-up
		if (ctx.path === "/sign-in/email" || ctx.path === "/sign-up/email") {
			return "email";
		}
		if (ctx.path.includes("siwe")) return "siwe";
		if (ctx.path.includes("/passkey/verify-authentication")) return "passkey";
		return null;
	};

	const config = {
		cookieName: "better-auth.last_used_login_method",
		maxAge: 60 * 60 * 24 * 30,
		...userConfig,
	} satisfies LastLoginMethodOptions;

	return {
		id: "last-login-method",
		init(ctx) {
			return {
				options: {
					databaseHooks: {
						user: {
							create: {
								async before(user, context) {
									if (!config.storeInDatabase) return;
									if (!context) return;
									const lastUsedLoginMethod =
										config.customResolveMethod?.(context) ??
										defaultResolveMethod(context);
									if (lastUsedLoginMethod) {
										return {
											data: {
												...user,
												lastLoginMethod: lastUsedLoginMethod,
											},
										};
									}
								},
							},
						},
						session: {
							create: {
								async after(session, context) {
									if (!config.storeInDatabase) return;
									if (!context) return;
									const lastUsedLoginMethod =
										config.customResolveMethod?.(context) ??
										defaultResolveMethod(context);
									if (lastUsedLoginMethod && session?.userId) {
										try {
											await ctx.internalAdapter.updateUser(session.userId, {
												lastLoginMethod: lastUsedLoginMethod,
											});
										} catch (error) {
											ctx.logger.error(
												"Failed to update lastLoginMethod",
												error,
											);
										}
									}
								},
							},
						},
					},
				},
			};
		},
		hooks: {
			after: [
				{
					matcher() {
						return true;
					},
					handler: createAuthMiddleware(async (ctx) => {
						const lastUsedLoginMethod =
							config.customResolveMethod?.(ctx) ?? defaultResolveMethod(ctx);
						if (lastUsedLoginMethod) {
							const setCookie = ctx.context.responseHeaders?.get("set-cookie");
							const sessionTokenName =
								ctx.context.authCookies.sessionToken.name;
							const hasSessionToken =
								setCookie && setCookie.includes(sessionTokenName);
							if (hasSessionToken) {
								// Inherit cookie attributes from Better Auth's centralized cookie system
								// This ensures consistency with cross-origin, cross-subdomain, and security settings
								const cookieAttributes = {
									...ctx.context.authCookies.sessionToken.attributes,
									maxAge: config.maxAge,
									httpOnly: false, // Override: plugin cookies are not httpOnly
								};

								let isPermitted = true;
								if (config.beforeStoreCookie) {
									try {
										isPermitted = await config.beforeStoreCookie(
											ctx,
											lastUsedLoginMethod,
										);
									} catch (error) {
										// If beforeStoreCookie throws an error, don't set the cookie
										// Log the error but don't break the authentication flow
										if (ctx.context.logger) {
											ctx.context.logger.error?.(
												"[LastLoginMethod] Error in beforeStoreCookie hook",
												error,
											);
										}
										isPermitted = false;
									}
								}

								if (!isPermitted) return;

								ctx.setCookie(
									config.cookieName,
									lastUsedLoginMethod,
									cookieAttributes,
								);
							}
						}
					}),
				},
			],
		},
		schema: (config.storeInDatabase
			? {
					user: {
						fields: {
							lastLoginMethod: {
								type: "string",
								input: false,
								required: false,
								fieldName:
									config.schema?.user?.lastLoginMethod || "lastLoginMethod",
							},
						},
					},
				}
			: undefined) as O["storeInDatabase"] extends true
			? {
					user: {
						fields: {
							lastLoginMethod: {
								type: "string";
								required: false;
								input: false;
							};
						};
					};
				}
			: undefined,
		options: userConfig as NoInfer<O>,
	} satisfies BetterAuthPlugin;
};
