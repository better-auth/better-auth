/// <reference types="electron" />

import type { HookEndpointContext } from "@better-auth/core";
import { createAuthMiddleware } from "@better-auth/core/api";
import { APIError } from "@better-auth/core/error";
import type { BetterAuthPlugin } from "better-auth";
import { safeJSONParse } from "better-auth";
import { generateRandomString } from "better-auth/crypto";
import * as z from "zod";
import { ELECTRON_ERROR_CODES } from "./error-codes";
import { electronInitOAuthProxy, electronToken } from "./routes";
import type { ElectronOptions } from "./types";

export const electron = (options?: ElectronOptions | undefined) => {
	const opts = {
		codeExpiresIn: 300, // 5 minutes
		redirectCookieExpiresIn: 120, // 2 minutes
		cookiePrefix: "better-auth",
		clientID: "electron",
		...(options || {}),
	};

	const hookMatcher = (ctx: HookEndpointContext) => {
		return !!(
			ctx.path?.startsWith("/sign-in") ||
			ctx.path?.startsWith("/sign-up") ||
			ctx.path?.startsWith("/callback") ||
			ctx.path?.startsWith("/oauth2/callback") ||
			ctx.path?.startsWith("/magic-link/verify") ||
			ctx.path?.startsWith("/email-otp/verify-email") ||
			ctx.path?.startsWith("/verify-email") ||
			ctx.path?.startsWith("/one-tap/callback") ||
			ctx.path?.startsWith("/passkey/verify-authentication") ||
			ctx.path?.startsWith("/phone-number/verify")
		);
	};

	return {
		id: "electron",
		async onRequest(request, _ctx) {
			if (opts.disableOriginOverride || request.headers.get("origin")) {
				return;
			}

			const electronOrigin = request.headers.get("electron-origin");
			if (!electronOrigin) {
				return;
			}

			const req = request.clone();
			req.headers.set("origin", electronOrigin);
			return {
				request: req,
			};
		},
		hooks: {
			after: [
				{
					matcher: (ctx) => !hookMatcher(ctx),
					handler: createAuthMiddleware(async (ctx) => {
						const transferCookie = await ctx.getSignedCookie(
							`${opts.cookiePrefix}.transfer_token`,
							ctx.context.secret,
						);
						if (!ctx.context.newSession?.session || !transferCookie) {
							return;
						}

						// Refresh the transfer cookie to extend its validity
						// Avoids expiration during multi-step auth flows on active usage
						// Can still expire when no endpoint is hit within the valid period
						await ctx.setSignedCookie(
							`${opts.cookiePrefix}.transfer_token`,
							transferCookie,
							ctx.context.secret,
							{
								...ctx.context.authCookies.sessionToken.attributes,
								maxAge: opts.codeExpiresIn,
							},
						);
					}),
				},
				{
					matcher: hookMatcher,
					handler: createAuthMiddleware(async (ctx) => {
						const querySchema = z.object({
							client_id: z.string(),
							code_challenge: z.string().nonempty(),
							code_challenge_method: z.string().optional().default("plain"),
							state: z.string().nonempty(),
						});
						if (
							ctx.query?.client_id === opts.clientID &&
							(ctx.path.startsWith("/sign-in") ||
								ctx.path.startsWith("/sign-up"))
						) {
							const query = querySchema.safeParse(ctx.query);
							if (query.success) {
								await ctx.setSignedCookie(
									`${opts.cookiePrefix}.transfer_token`,
									JSON.stringify(query.data),
									ctx.context.secret,
									{
										...ctx.context.authCookies.sessionToken.attributes,
										maxAge: opts.codeExpiresIn,
									},
								);
							}
						}

						if (!ctx.context.newSession?.session) {
							return;
						}

						const transferCookie = await ctx.getSignedCookie(
							`${opts.cookiePrefix}.transfer_token`,
							ctx.context.secret,
						);
						ctx.setCookie(`${opts.cookiePrefix}.transfer_token`, "", {
							...ctx.context.authCookies.sessionToken.attributes,
							maxAge: 0,
						});
						let transferPayload: z.infer<typeof querySchema> | null = null;
						if (!!transferCookie) {
							transferPayload = safeJSONParse(transferCookie);
						} else {
							const query = querySchema.safeParse(ctx.query);
							if (query.success) {
								transferPayload = query.data;
							}
						}
						if (!transferPayload) {
							return;
						}

						const { client_id, code_challenge, code_challenge_method, state } =
							transferPayload;
						if (client_id !== opts.clientID) {
							return;
						}
						if (!state) {
							throw APIError.from(
								"BAD_REQUEST",
								ELECTRON_ERROR_CODES.MISSING_STATE,
							);
						}
						if (!code_challenge) {
							throw APIError.from(
								"BAD_REQUEST",
								ELECTRON_ERROR_CODES.MISSING_PKCE,
							);
						}

						const redirectCookieName = `${opts.cookiePrefix}.${opts.clientID}`;

						const identifier = generateRandomString(32, "a-z", "A-Z", "0-9");
						const codeExpiresInMs = opts.codeExpiresIn * 1000;
						const expiresAt = new Date(Date.now() + codeExpiresInMs);
						await ctx.context.internalAdapter.createVerificationValue({
							identifier: `electron:${identifier}`,
							value: JSON.stringify({
								userId: ctx.context.newSession.user.id,
								codeChallenge: code_challenge,
								codeChallengeMethod: code_challenge_method.toLowerCase(),
								state,
							}),
							expiresAt,
						});

						ctx.setCookie(redirectCookieName, identifier, {
							...ctx.context.authCookies.sessionToken.attributes,
							maxAge: opts.redirectCookieExpiresIn,
							httpOnly: false,
						});

						return ctx;
					}),
				},
			],
		},
		endpoints: {
			electronToken: electronToken(opts),
			electronInitOAuthProxy: electronInitOAuthProxy(opts),
		},
		options: opts,
		$ERROR_CODES: ELECTRON_ERROR_CODES,
	} satisfies BetterAuthPlugin;
};

export type * from "./types";
