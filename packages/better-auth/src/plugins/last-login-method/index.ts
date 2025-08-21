import type {
	LastLoginMethodOptions,
	RealizedLastLoginMethodOptions,
} from "./types";
import type { BetterAuthPlugin } from "../../types/plugins";

import { createAuthEndpoint, createAuthMiddleware } from "../../api";

export * from "./types";
export * from "./client";

export const lastLoginMethod = (options?: LastLoginMethodOptions) => {
	const opts: RealizedLastLoginMethodOptions = {
		cookieName: options?.cookieName ?? "better-auth.last_used_login_method",
		maxAge: options?.maxAge ?? 432000,
		trustedProviderIds: options?.trustedProviderIds ?? [],
	};

	return {
		id: "last-login-method",
		endpoints: {
			lastUsedLoginMethod: createAuthEndpoint(
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
				async (c) => {
					const loginMethod = c.getCookie(opts.cookieName);

					if (!loginMethod) {
						return null;
					}

					return loginMethod;
				},
			),
		},
		hooks: {
			after: [
				{
					matcher: (context) => {
						return context.path.startsWith("/callback");
					},

					handler: createAuthMiddleware(async (ctx) => {
						if (!ctx.request?.url) return null;

						const path = new URL(ctx.request?.url).pathname;
						const providerId = path.split("/").at(-1);

						if (!providerId) return;

						const providers = ctx.context.socialProviders
							.map((x) => x.id.toLowerCase())
							.concat(opts.trustedProviderIds.map((x) => x.toLowerCase()));
						const isProvider = providers.includes(providerId.toLowerCase());

						if (!isProvider) return;

						ctx.setCookie(opts.cookieName, providerId, {
							httpOnly: true,
							maxAge: opts.maxAge,
						});
					}),
				},

				{
					matcher: (context) => {
						return (
							context.path.startsWith("/sign-in/email") ||
							context.path.startsWith("/sign-up/email")
						);
					},

					handler: createAuthMiddleware(async (ctx) => {
						const hasNewSession = !!ctx.context.newSession;
						if (!hasNewSession) return;

						ctx.setCookie(opts.cookieName, "email-password", {
							httpOnly: true,
							maxAge: opts.maxAge,
						});
					}),
				},

				{
					matcher: (context) => {
						return context.path.startsWith("/verify-email");
					},

					handler: createAuthMiddleware(async (ctx) => {
						const hasNewSession = !!ctx.context.newSession;
						if (!hasNewSession) return;

						ctx.setCookie(opts.cookieName, "email-password", {
							httpOnly: true,
							maxAge: opts.maxAge,
						});
					}),
				},
			],
		},
	} satisfies BetterAuthPlugin;
};
