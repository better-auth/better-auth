import type { GenericEndpointContext } from "@better-auth/core";
import { APIError, createAuthEndpoint } from "better-auth/api";
import { setSessionCookie } from "better-auth/cookies";
import { generateRandomString } from "better-auth/crypto";
import * as z from "zod";
import { decodeRefreshToken } from "./token";
import type { OAuthOptions, OAuthRefreshToken, Scope } from "./types";
import { getStoredToken, parseBearerToken, storeToken } from "./utils";

const DEFAULT_SESSION_CODE_EXPIRES_IN = 180;
const SESSION_CODE_PREFIX = "oauth-session-code:";

/**
 * Seconds the one-time browser code stays valid, or null when the exchange
 * is off. Public clients are allowed. An access token is not accepted.
 */
export function sessionCodeExpiresIn(
	opts: OAuthOptions<Scope[]>,
): number | null {
	const setting = opts.sessionCode;
	if (!setting) return null;
	if (setting === true) return DEFAULT_SESSION_CODE_EXPIRES_IN;
	return setting.expiresIn ?? DEFAULT_SESSION_CODE_EXPIRES_IN;
}

function sessionCodeDisabled(): never {
	throw new APIError("NOT_FOUND", {
		message: "Session code exchange is disabled",
	});
}

function invalidRefreshToken(): never {
	throw new APIError("BAD_REQUEST", {
		error: "invalid_grant",
		error_description: "invalid refresh token",
	});
}

async function findLiveRefreshToken(
	ctx: GenericEndpointContext,
	opts: OAuthOptions<Scope[]>,
	presented: string,
) {
	const decoded = await decodeRefreshToken(opts, presented);
	const refreshToken = await ctx.context.adapter.findOne<
		OAuthRefreshToken<Scope[]> & { id: string }
	>({
		model: "oauthRefreshToken",
		where: [
			{
				field: "token",
				value: await getStoredToken(
					opts.storeTokens,
					decoded.token,
					"refresh_token",
				),
			},
		],
	});
	if (!refreshToken?.userId) return null;
	if (refreshToken.revoked) return null;
	if (new Date(refreshToken.expiresAt).getTime() <= Date.now()) return null;
	return refreshToken;
}

export function createSessionCodeEndpoints(opts: OAuthOptions<Scope[]>) {
	return {
		/**
		 * POST `/oauth2/session-code`
		 *
		 * `Authorization: Bearer <refresh_token>` in, one-time code out.
		 * No client secret. Access tokens are rejected.
		 */
		createOAuthSessionCode: createAuthEndpoint(
			"/oauth2/session-code",
			{
				method: "POST",
				metadata: {
					noStore: true,
				},
			},
			async (ctx) => {
				const expiresIn = sessionCodeExpiresIn(opts);
				if (expiresIn === null) sessionCodeDisabled();

				const presented = parseBearerToken(ctx.headers?.get("authorization"));
				if (!presented) {
					throw new APIError("UNAUTHORIZED", {
						error: "invalid_token",
						error_description: "refresh token required",
					});
				}

				const refreshToken = await findLiveRefreshToken(ctx, opts, presented);
				if (!refreshToken) invalidRefreshToken();

				const user = await ctx.context.internalAdapter.findUserById(
					refreshToken.userId,
				);
				if (!user) invalidRefreshToken();

				const code = generateRandomString(32, "a-z", "A-Z", "0-9");
				const stored = await storeToken(opts.storeTokens, code, "session_code");
				await ctx.context.internalAdapter.createVerificationValue({
					value: user.id,
					identifier: `${SESSION_CODE_PREFIX}${stored}`,
					expiresAt: new Date(Date.now() + expiresIn * 1000),
				});

				return ctx.json({ code, expires_in: expiresIn });
			},
		),
		/**
		 * POST `/oauth2/session-code/consume`
		 *
		 * Burns the code and sets a new session cookie.
		 */
		consumeOAuthSessionCode: createAuthEndpoint(
			"/oauth2/session-code/consume",
			{
				method: "POST",
				body: z.object({
					code: z.string().min(1),
				}),
				metadata: {
					noStore: true,
				},
			},
			async (ctx) => {
				if (sessionCodeExpiresIn(opts) === null) sessionCodeDisabled();

				const stored = await storeToken(
					opts.storeTokens,
					ctx.body.code,
					"session_code",
				);
				const verification =
					await ctx.context.internalAdapter.consumeVerificationValue(
						`${SESSION_CODE_PREFIX}${stored}`,
					);
				if (!verification?.value) {
					throw new APIError("BAD_REQUEST", {
						error: "invalid_grant",
						error_description: "invalid code",
					});
				}

				const user = await ctx.context.internalAdapter.findUserById(
					verification.value,
				);
				if (!user) {
					throw new APIError("BAD_REQUEST", {
						error: "invalid_grant",
						error_description: "invalid code",
					});
				}

				const session = await ctx.context.internalAdapter.createSession(
					user.id,
				);
				if (!session) {
					throw new APIError("INTERNAL_SERVER_ERROR", {
						error: "server_error",
						error_description: "failed to create session",
					});
				}

				await setSessionCookie(ctx, { session, user });
				return ctx.json({ token: session.token, user, session });
			},
		),
	};
}
