/// <reference types="electron" />

import type {
	GenericEndpointContext,
	HookEndpointContext,
} from "@better-auth/core";
import { createAuthMiddleware } from "@better-auth/core/api";
import { APIError } from "@better-auth/core/error";
import {
	getPendingSecondFactorUser,
	registerInternalAuthCompletion,
} from "@better-auth/core/utils/auth-completion";
import { isAPIError } from "@better-auth/core/utils/is-api-error";
import { base64Url } from "@better-auth/utils/base64";
import type { BetterAuthPlugin } from "better-auth";
import { safeJSONParse } from "better-auth";
import { generateRandomString } from "better-auth/crypto";
import * as z from "zod";
import { ELECTRON_ERROR_CODES } from "./error-codes";
import {
	electronInitOAuthProxy,
	electronToken,
	electronTransferUser,
	hashSessionToken,
} from "./routes";
import type { ElectronOptions } from "./types";
import { PACKAGE_VERSION } from "./version";

declare module "@better-auth/core" {
	interface BetterAuthPluginRegistry<AuthOptions, Options> {
		electron: {
			creator: typeof electron;
		};
	}
}

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
			ctx.path?.startsWith("/magic-link/verify") ||
			ctx.path?.startsWith("/email-otp/verify-email") ||
			ctx.path?.startsWith("/verify-email") ||
			ctx.path?.startsWith("/one-tap/callback") ||
			ctx.path?.startsWith("/passkey/verify-authentication") ||
			ctx.path?.startsWith("/phone-number/verify")
		);
	};
	const isTwoFactorCompletion = (path: string | undefined) =>
		path === "/two-factor/verify-totp" ||
		path === "/two-factor/verify-otp" ||
		path === "/two-factor/verify-backup-code";

	const querySchema = z.object({
		client_id: z.string(),
		code_challenge: z.string().nonempty(),
		state: z.string().nonempty(),
	});
	const transferSchema = querySchema.extend({
		userId: z.string().optional(),
		expiresAt: z.number(),
	});

	const handleTransfer = async (
		ctx: GenericEndpointContext,
		payload: {
			client_id: string;
			state: string;
			code_challenge: string;
		},
		sourceSession: NonNullable<GenericEndpointContext["context"]["session"]>,
	) => {
		const { client_id, state, code_challenge } = payload;
		if (client_id !== opts.clientID) {
			return null;
		}
		if (!state) {
			throw APIError.from("BAD_REQUEST", ELECTRON_ERROR_CODES.MISSING_STATE);
		}
		if (!code_challenge) {
			throw APIError.from("BAD_REQUEST", ELECTRON_ERROR_CODES.MISSING_PKCE);
		}
		const source = await ctx.context.internalAdapter.findSession(
			sourceSession.session.token,
		);
		if (
			!source ||
			source.user.id !== sourceSession.user.id ||
			source.session.expiresAt <= new Date()
		) {
			return null;
		}

		const redirectCookieName = `${opts.cookiePrefix}.${opts.clientID}`;

		const identifier = generateRandomString(32, "a-z", "A-Z", "0-9");
		const codeExpiresInMs = opts.codeExpiresIn * 1000;
		const expiresAt = new Date(Date.now() + codeExpiresInMs);
		await ctx.context.internalAdapter.createVerificationValue({
			identifier: `electron:${identifier}`,
			value: JSON.stringify({
				userId: source.user.id,
				sourceSessionTokenHash: await hashSessionToken(source.session.token),
				codeChallenge: code_challenge,
				state,
			}),
			expiresAt,
		});

		const redirectToken = base64Url.encode(
			new TextEncoder().encode(JSON.stringify({ identifier, state })),
		);

		ctx.setCookie(redirectCookieName, redirectToken, {
			...ctx.context.authCookies.sessionToken.attributes,
			maxAge: opts.redirectCookieExpiresIn,
			httpOnly: false,
		});

		return identifier;
	};

	const completionHook = {
		matcher: (ctx: HookEndpointContext) =>
			hookMatcher(ctx) || isTwoFactorCompletion(ctx.path),
		handler: createAuthMiddleware(async (ctx) => {
			const clearRedirect = () =>
				ctx.setCookie(`${opts.cookiePrefix}.${opts.clientID}`, "", {
					...ctx.context.authCookies.sessionToken.attributes,
					httpOnly: false,
					maxAge: 0,
				});
			// Verification must never reuse a handoff from an earlier request.
			if (isTwoFactorCompletion(ctx.path)) clearRedirect();
			const returned = ctx.context.returned;
			if (returned instanceof Response) return;
			// Better Call represents endpoint redirects as APIError. Only
			// a 302 with a completed session can continue the transfer.
			if (
				isAPIError(returned) &&
				(returned.statusCode !== 302 || !ctx.context.newSession?.session)
			) {
				return;
			}
			const cookie = ctx.context.createAuthCookie("transfer_token", {
				maxAge: opts.codeExpiresIn,
			});
			const query = querySchema.safeParse(ctx.query);
			const directQuery =
				query.success && query.data.client_id === opts.clientID
					? query.data
					: null;

			// A credential challenge has no final session. Keep only signed,
			// user-bound transfer intent for the later verification request.
			const pendingTwoFactorUserId = getPendingSecondFactorUser(ctx.context);
			if (pendingTwoFactorUserId) {
				clearRedirect();
				if (directQuery) {
					await ctx.setSignedCookie(
						cookie.name,
						JSON.stringify({
							...directQuery,
							userId: pendingTwoFactorUserId,
							expiresAt: Date.now() + opts.codeExpiresIn * 1000,
						}),
						ctx.context.secret,
						cookie.attributes,
					);
				}
				return;
			}

			const sourceSession = ctx.context.newSession;
			if (!sourceSession?.session) {
				if (
					directQuery &&
					(ctx.path.startsWith("/sign-in") || ctx.path.startsWith("/sign-up"))
				) {
					clearRedirect();
					await ctx.setSignedCookie(
						cookie.name,
						JSON.stringify({
							...directQuery,
							expiresAt: Date.now() + opts.codeExpiresIn * 1000,
						}),
						ctx.context.secret,
						cookie.attributes,
					);
				}
				return;
			}
			const transferCookie =
				directQuery &&
				(ctx.path.startsWith("/sign-in") || ctx.path.startsWith("/sign-up"))
					? null
					: await ctx.getSignedCookie(cookie.name, ctx.context.secret);
			const parsedCookie = transferSchema.safeParse(
				transferCookie ? safeJSONParse(transferCookie) : null,
			);
			const transferPayload =
				parsedCookie.success && parsedCookie.data.expiresAt > Date.now()
					? parsedCookie.data
					: directQuery;
			if (!transferPayload || transferPayload.client_id !== opts.clientID) {
				return;
			}
			if (
				(isTwoFactorCompletion(ctx.path) && !("userId" in transferPayload)) ||
				("userId" in transferPayload &&
					transferPayload.userId !== sourceSession.user.id)
			) {
				ctx.setCookie(cookie.name, "", { ...cookie.attributes, maxAge: 0 });
				return;
			}
			const identifier = await handleTransfer(
				ctx,
				transferPayload,
				sourceSession,
			);
			if (identifier === null) return;
			ctx.setCookie(cookie.name, "", {
				...cookie.attributes,
				maxAge: 0,
			});
			if (isAPIError(returned)) return;
			return ctx.json({
				...(ctx.context.returned ?? {}),
				electron_authorization_code: identifier,
			});
		}),
	};

	const plugin = {
		id: "electron",
		version: PACKAGE_VERSION,
		hooks: {
			after: [
				{
					matcher: (ctx) =>
						!hookMatcher(ctx) && !isTwoFactorCompletion(ctx.path),
					handler: createAuthMiddleware(async (ctx) => {
						const transferCookie = await ctx.getSignedCookie(
							`${opts.cookiePrefix}.transfer_token`,
							ctx.context.secret,
						);
						if (!ctx.context.newSession?.session || !transferCookie) {
							return;
						}

						const parsed = transferSchema.safeParse(
							safeJSONParse(transferCookie),
						);
						if (!parsed.success || parsed.data.expiresAt <= Date.now()) return;
						const cookie = ctx.context.createAuthCookie("transfer_token", {
							maxAge: Math.ceil((parsed.data.expiresAt - Date.now()) / 1000),
						});
						// Preserve the signed deadline across intermediate session responses.
						await ctx.setSignedCookie(
							cookie.name,
							transferCookie,
							ctx.context.secret,
							cookie.attributes,
						);
					}),
				},
			],
		},
		endpoints: {
			electronToken: electronToken(opts),
			electronInitOAuthProxy: electronInitOAuthProxy(opts),
			electronTransferUser: electronTransferUser(opts, {
				handleTransfer,
			}),
		},
		options: opts,
		$ERROR_CODES: ELECTRON_ERROR_CODES,
	} satisfies BetterAuthPlugin;
	return registerInternalAuthCompletion(plugin, completionHook);
};

export type * from "./types";
