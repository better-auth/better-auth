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
						return context.path === "/callback/:id";
					},

					handler: createAuthMiddleware(async (ctx) => {
						const hasNewSession = !!ctx.context.newSession;
						if (!hasNewSession) return;

						if (!ctx.request?.url) return null;

						const path = new URL(ctx.request?.url).pathname;
						const providerId = path.split("/").at(-1);

						if (!providerId) return;

						const providers = ctx.context.socialProviders.map((x) =>
							x.id.toLowerCase(),
						);
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
						return context.path === "/oauth2/callback/:providerId";
					},

					handler: createAuthMiddleware(async (ctx) => {
						const hasNewSession = !!ctx.context.newSession;
						if (!hasNewSession) return;

						if (!ctx.request?.url) return null;

						const path = new URL(ctx.request?.url).pathname;
						const providerId = path.split("/").at(-1);

						if (!providerId) return;

						ctx.setCookie(opts.cookieName, providerId, {
							httpOnly: true,
							maxAge: opts.maxAge,
						});
					}),
				},

				{
					matcher: (context) => {
						return (
							context.path === "/sign-in/email" ||
							context.path === "/sign-up/email"
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
						return context.path === "/verify-email";
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
						return context.path === "/sign-in/phone-number";
					},

					handler: createAuthMiddleware(async (ctx) => {
						const hasNewSession = !!ctx.context.newSession;
						if (!hasNewSession) return;

						ctx.setCookie(opts.cookieName, "phone-number", {
							httpOnly: true,
							maxAge: opts.maxAge,
						});
					}),
				},

				{
					matcher: (context) => {
						return context.path === "/magic-link/verify";
					},

					handler: createAuthMiddleware(async (ctx) => {
						const hasNewSession = !!ctx.context.newSession;
						if (!hasNewSession) return;

						ctx.setCookie(opts.cookieName, "magic-link", {
							httpOnly: true,
							maxAge: opts.maxAge,
						});
					}),
				},
			],
		},
	} satisfies BetterAuthPlugin;
};
