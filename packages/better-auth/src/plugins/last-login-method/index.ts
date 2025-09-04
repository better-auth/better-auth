import { createAuthMiddleware, type BetterAuthPlugin } from "..";
import type { GenericEndpointContext } from "../../types";

/**
 * Configuration for tracking different authentication methods
 */
export interface LastLoginMethodOptions {
	/**
	 * Name of the cookie to store the last login method
	 * @default "better-auth.last_used_login_method"
	 */
	cookieName?: string;
	/**
	 * Cookie expiration time in seconds
	 * @default 2592000 (30 days)
	 */
	maxAge?: number;
	/**
	 * Custom method to resolve the last login method
	 * @param ctx - The context from the hook
	 * @returns The last login method
	 */
	customResolveMethod?: (ctx: GenericEndpointContext) => string | null;
	/**
	 * Store the last login method in the database. This will create a new field in the user table.
	 * @default false
	 */
	storeInDatabase?: boolean;
	/**
	 * Custom schema for the plugin
	 * @default undefined
	 */
	schema?: {
		user?: {
			lastLoginMethod?: string;
		};
	};
}

/**
 * Plugin to track the last used login method
 */
export const lastLoginMethod = <O extends LastLoginMethodOptions>(
	userConfig?: O,
) => {
	const paths = [
		"/callback/:id",
		"/oauth2/callback/:id",
		"/sign-in/email",
		"/sign-up/email",
	];
	const config = {
		cookieName: "better-auth.last_used_login_method",
		maxAge: 60 * 60 * 24 * 30,
		customResolveMethod: (ctx) => {
			if (paths.includes(ctx.path)) {
				return ctx.params?.id ? ctx.params.id : ctx.path.split("/").pop();
			}
			return null;
		},
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
										config.customResolveMethod(context);
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
						const lastUsedLoginMethod = config.customResolveMethod(ctx);
						lastUsedLoginMethod &&
							ctx.setCookie(config.cookieName, lastUsedLoginMethod, {
								maxAge: config.maxAge,
								secure: false,
								httpOnly: false,
								path: "/",
							});
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
	} satisfies BetterAuthPlugin;
};
