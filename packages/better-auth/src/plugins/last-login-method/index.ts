import {
	LAST_USED_LOGIN_METHOD_HEADER,
	type LastLoginMethodOptions,
	type RealizedLastLoginMethodOptions,
} from "./types";
import type { BetterAuthPlugin } from "../../types/plugins";
import type { AuthContext, MiddlewareContext, MiddlewareOptions } from "../..";

import { createAuthEndpoint, createAuthMiddleware } from "../../api";

export * from "./types";
export * from "./client";

export type LastLoginMethodPlugin<
	Storage extends "cookie" | "local-storage" = "local-storage",
> = {
	id: "last-login-method";
	endpoints: Storage extends "cookie"
		? { lastUsedLoginMethod: ReturnType<typeof makeLastUsedLoginMethod> }
		: {};
	hooks: BetterAuthPlugin["hooks"];
};

const makeLastUsedLoginMethod = <Storage>(
	opts: RealizedLastLoginMethodOptions<Storage>,
) =>
	createAuthEndpoint(
		"/last-used-login-method",
		{
			method: "GET",
			requireHeaders: true,
			metadata: {
				openapi: {
					description:
						"Get the last used login method the user used to sign in.",
					operationId: "lastUsedLoginMethod",
					responses: {
						"200": {
							description: "Success - Returns the last used login method",
							content: {
								"application/json": {
									schema: {
										type: "string",
										nullable: true,
										description: "Login Method",
									},
								},
							},
						},
					},
				},
			},
		},
		async (c) => c.getSignedCookie(opts.cookieName, c.context.secret) ?? null,
	);

export const lastLoginMethod = <Storage extends "cookie" | "local-storage">(
	options?: LastLoginMethodOptions<Storage>,
) => {
	const opts: RealizedLastLoginMethodOptions<Storage> = {
		storage: options?.storage ?? ("local-storage" as Storage),
		cookieName: options?.cookieName ?? "better-auth.last_used_login_method",
		maxAge: options?.maxAge ?? 432000,
	};

	type AuthMiddlewareContext = MiddlewareContext<
		MiddlewareOptions,
		AuthContext & {
			returned?: unknown;
			responseHeaders?: Headers;
		}
	>;

	const makeSignInHook = (
		path: string,
		value: string | ((ctx: AuthMiddlewareContext) => string | null),
	) => ({
		matcher: (ctx: { path: string }) => ctx.path === path,
		handler: createAuthMiddleware(async (ctx) => {
			if (!ctx.context.newSession) return;

			const val = typeof value === "string" ? value : value(ctx);
			if (!val) return;

			if (opts.storage === "local-storage")
				ctx.headers?.append(LAST_USED_LOGIN_METHOD_HEADER, val);

			if (opts.storage === "cookie")
				await ctx.setSignedCookie(opts.cookieName, val, ctx.context.secret, {
					httpOnly: true,
					maxAge: opts.maxAge,
				});
		}),
	});

	const lastUsedLoginMethod = makeLastUsedLoginMethod(opts);

	return {
		id: "last-login-method",
		endpoints: (opts.storage === "cookie"
			? { lastUsedLoginMethod }
			: {}) as Storage extends "cookie"
			? { lastUsedLoginMethod: typeof lastUsedLoginMethod }
			: {},
		hooks: {
			after: [
				makeSignInHook("/callback/:id", (ctx) => {
					if (!ctx.request?.url) return null;
					const providerId = new URL(ctx.request.url).pathname
						.split("/")
						.at(-1);
					if (!providerId) return null;

					const providers = ctx.context.socialProviders.map((x) =>
						x.id.toLowerCase(),
					);
					return providers.includes(providerId.toLowerCase())
						? providerId
						: null;
				}),

				makeSignInHook("/oauth2/callback/:providerId", (ctx) => {
					if (!ctx.request?.url) return null;
					return new URL(ctx.request.url).pathname.split("/").at(-1) ?? null;
				}),

				makeSignInHook("/sign-in/email", "email-password"),
				makeSignInHook("/sign-up/email", "email-password"),
				makeSignInHook("/verify-email", "email-password"),
				makeSignInHook("/sign-in/phone-number", "phone-number"),
				makeSignInHook("/sign-in/anonymous", "anonymous"),
				makeSignInHook("/magic-link/verify", "magic-link"),
				makeSignInHook("/sign-in/email-otp", "email-otp"),
				makeSignInHook("/sign-in/passkey", "passkey"),
				makeSignInHook("/one-tap/callback", "one-tap"),
				makeSignInHook("/siwe/verify", "siwe"),
			],
		},
	} satisfies LastLoginMethodPlugin<Storage>;
};
