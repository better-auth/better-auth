import type { GenericEndpointContext } from "@better-auth/core";
import { APIError } from "@better-auth/core/error";
import { createHMAC } from "@better-auth/utils/hmac";
import { getSessionFromCtx } from "../../api";
import { expireCookie, setSessionCookie } from "../../cookies";
import { generateRandomString } from "../../crypto/random";
import { parseUserOutput } from "../../db/schema";
import {
	TRUST_DEVICE_COOKIE_MAX_AGE,
	TRUST_DEVICE_COOKIE_NAME,
	TWO_FACTOR_COOKIE_NAME,
} from "./constant";
import { TWO_FACTOR_ERROR_CODES } from "./error-code";
import type { UserWithTwoFactor } from "./types";

export async function verifyTwoFactor(ctx: GenericEndpointContext) {
	const invalid = (errorKey: keyof typeof TWO_FACTOR_ERROR_CODES) => {
		throw APIError.from("UNAUTHORIZED", TWO_FACTOR_ERROR_CODES[errorKey]);
	};

	const session = await getSessionFromCtx(ctx);
	if (!session) {
		const twoFactorCookie = ctx.context.createAuthCookie(
			TWO_FACTOR_COOKIE_NAME,
		);
		const signedTwoFactorCookie = await ctx.getSignedCookie(
			twoFactorCookie.name,
			ctx.context.secret,
		);
		if (!signedTwoFactorCookie) {
			throw APIError.from(
				"UNAUTHORIZED",
				TWO_FACTOR_ERROR_CODES.INVALID_TWO_FACTOR_COOKIE,
			);
		}
		const verificationToken =
			await ctx.context.internalAdapter.findVerificationValue(
				signedTwoFactorCookie,
			);
		if (!verificationToken) {
			throw APIError.from(
				"UNAUTHORIZED",
				TWO_FACTOR_ERROR_CODES.INVALID_TWO_FACTOR_COOKIE,
			);
		}
		const user = (await ctx.context.internalAdapter.findUserById(
			verificationToken.value,
		)) as UserWithTwoFactor;
		if (!user) {
			throw APIError.from(
				"UNAUTHORIZED",
				TWO_FACTOR_ERROR_CODES.INVALID_TWO_FACTOR_COOKIE,
			);
		}
		const dontRememberMe = await ctx.getSignedCookie(
			ctx.context.authCookies.dontRememberToken.name,
			ctx.context.secret,
		);
		return {
			valid: async (ctx: GenericEndpointContext) => {
				// The 2FA challenge is single-use and time-bounded. Burn it
				// atomically before issuing a session so a stale (expired) replay
				// or two concurrent verifications of the same cookie cannot each
				// mint a session: the consume returns null for an expired or
				// already-consumed row, and only the first racer wins it.
				const consumed =
					await ctx.context.internalAdapter.consumeVerificationValue(
						signedTwoFactorCookie,
					);
				if (!consumed || consumed.value !== user.id) {
					expireCookie(ctx, twoFactorCookie);
					throw APIError.from(
						"UNAUTHORIZED",
						TWO_FACTOR_ERROR_CODES.INVALID_TWO_FACTOR_COOKIE,
					);
				}
				const session = await ctx.context.internalAdapter.createSession(
					consumed.value,
					!!dontRememberMe,
				);
				if (!session) {
					throw APIError.from("INTERNAL_SERVER_ERROR", {
						message: "failed to create session",
						code: "FAILED_TO_CREATE_SESSION",
					});
				}
				await setSessionCookie(ctx, {
					session,
					user,
				});
				// Always clear the two factor cookie after successful verification
				expireCookie(ctx, twoFactorCookie);
				if (ctx.body.trustDevice) {
					const plugin = ctx.context.getPlugin("two-factor");
					const trustDeviceMaxAge = plugin!.options?.trustDeviceMaxAge;
					const maxAge = trustDeviceMaxAge ?? TRUST_DEVICE_COOKIE_MAX_AGE;
					const trustDeviceCookie = ctx.context.createAuthCookie(
						TRUST_DEVICE_COOKIE_NAME,
						{
							maxAge,
						},
					);
					/**
					 * Create a random identifier for the trust device record.
					 * Store it in the verification table with an expiration
					 * so the server can validate and revoke it.
					 */
					const trustIdentifier = `trust-device-${generateRandomString(32)}`;
					const token = await createHMAC("SHA-256", "base64urlnopad").sign(
						ctx.context.secret,
						`${user.id}!${trustIdentifier}`,
					);
					await ctx.context.internalAdapter.createVerificationValue({
						value: user.id,
						identifier: trustIdentifier,
						expiresAt: new Date(Date.now() + maxAge * 1000),
					});
					await ctx.setSignedCookie(
						trustDeviceCookie.name,
						`${token}!${trustIdentifier}`,
						ctx.context.secret,
						trustDeviceCookie.attributes,
					);
					// delete the dont remember me cookie
					expireCookie(ctx, ctx.context.authCookies.dontRememberToken);
				}
				return ctx.json({
					token: session.token,
					user: parseUserOutput(ctx.context.options, user),
				});
			},
			invalid,
			session: {
				session: null,
				user,
			},
			key: signedTwoFactorCookie,
		};
	}
	return {
		valid: async (ctx: GenericEndpointContext) => {
			return ctx.json({
				token: session.session.token,
				user: parseUserOutput(ctx.context.options, session.user),
			});
		},
		invalid,
		session,
		key: `${session.user.id}!${session.session.id}`,
	};
}

/**
 * Consume the per-challenge attempt counter for a sign-in 2FA verification and
 * enforce the attempt budget. The counter row (`2fa-attempts-${key}`) is created
 * alongside the challenge in the sign-in after-hook.
 *
 * `verify-otp` keeps its own counter on the code row; this covers `verify-totp`
 * and `verify-backup-code`, which have no per-code row to ride a counter on.
 *
 * The consume is the atomic race gate: the first concurrent submission wins the
 * row, every other racer (and a spent or expired counter) receives `null`, so a
 * burst of guesses cannot be raced past the budget. Returns a `recordFailure`
 * callback the caller invokes on a wrong code to re-arm the counter under the
 * original challenge expiry; a correct code leaves the row consumed so the
 * challenge cannot be reused.
 *
 * TODO(totp-attempt-cap): superseded by the per-sign-in-attempt budget in the
 * two-factor rewrite (RFC 0012 / PR #9278), which unifies all factors on the
 * `signInAttempt` table. Remove this helper with the per-challenge counter.
 */
export async function beginTwoFactorAttempt(
	ctx: GenericEndpointContext,
	key: string,
	allowedAttempts: number,
) {
	const identifier = `2fa-attempts-${key}`;
	const consumed =
		await ctx.context.internalAdapter.consumeVerificationValue(identifier);
	const attempts = consumed ? Number.parseInt(consumed.value, 10) || 0 : 0;
	if (!consumed || attempts >= allowedAttempts) {
		// No counter row means the challenge is expired or the budget is already
		// spent; either way the challenge is locked. Leaving a spent row consumed
		// keeps it locked for every later submission.
		throw APIError.from(
			"BAD_REQUEST",
			TWO_FACTOR_ERROR_CODES.TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE,
		);
	}
	return {
		recordFailure: async () => {
			await ctx.context.internalAdapter.createVerificationValue({
				value: `${attempts + 1}`,
				identifier,
				expiresAt: consumed.expiresAt,
			});
		},
	};
}
