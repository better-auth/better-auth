import {
	type LastLoginMethodOptions,
	type RealizedLastLoginMethodOptions,
} from "./types";
import type { BetterAuthPlugin } from "../../types/plugins";
import type { AuthContext, MiddlewareContext, MiddlewareOptions } from "../..";

import { createAuthEndpoint, createAuthMiddleware } from "../../api";

export * from "./types";
export * from "./client";

const makeLastUsedLoginMethod = (opts: RealizedLastLoginMethodOptions) =>
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
		async (c) => c.getCookie(opts.cookieName) ?? null,
	);

export const lastLoginMethod = (options?: LastLoginMethodOptions) => {
	const opts: RealizedLastLoginMethodOptions = {
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

			ctx.setCookie(opts.cookieName, val, {
				httpOnly: false,
				maxAge: opts.maxAge,
			});
		}),
	});

	const lastUsedLoginMethod = makeLastUsedLoginMethod(opts);

	return {
		id: "last-login-method",
		endpoints: { lastUsedLoginMethod },
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
	} satisfies BetterAuthPlugin;
};
