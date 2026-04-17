import type { GenericEndpointContext } from "@better-auth/core";
import { APIError } from "@better-auth/core/error";
import { createHMAC } from "@better-auth/utils/hmac";
import { getSessionFromCtx } from "../../api";
import {
	finalizeSignIn,
	scheduleSessionCommit,
} from "../../auth/finalize-sign-in";
import { expireCookie } from "../../cookies";
import { generateRandomString } from "../../crypto/random";
import { parseUserOutput } from "../../db/schema";
import { getPendingSignInAttempt, getTwoFactorAttemptId } from "./check";
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
	const requestedAttemptId =
		typeof ctx.body?.attemptId === "string"
			? ctx.body.attemptId
			: typeof ctx.query?.attemptId === "string"
				? ctx.query.attemptId
				: null;
	const twoFactorCookie = ctx.context.createAuthCookie(TWO_FACTOR_COOKIE_NAME);

	const resolveAttempt = async (
		attemptId: string,
		clearCookieOnFailure: boolean,
	) => {
		const attempt = await getPendingSignInAttempt(ctx, attemptId);
		if (!attempt) {
			if (clearCookieOnFailure) {
				expireCookie(ctx, twoFactorCookie);
			}
			throw APIError.from(
				"UNAUTHORIZED",
				TWO_FACTOR_ERROR_CODES.INVALID_TWO_FACTOR_COOKIE,
			);
		}
		const user = (await ctx.context.internalAdapter.findUserById(
			attempt.userId,
		)) as UserWithTwoFactor | null;
		if (!user) {
			await ctx.context.internalAdapter
				.deleteSignInAttempt(attemptId)
				.catch(() => {});
			if (clearCookieOnFailure) {
				expireCookie(ctx, twoFactorCookie);
			}
			throw APIError.from(
				"UNAUTHORIZED",
				TWO_FACTOR_ERROR_CODES.INVALID_TWO_FACTOR_COOKIE,
			);
		}

		return {
			valid: async (ctx: GenericEndpointContext) => {
				ctx.context.setSignInAttempt({
					...attempt,
					user,
				});
				const finalizedSession = await finalizeSignIn(ctx, {
					user,
					dontRememberMe: attempt.dontRememberMe ?? undefined,
					attemptId,
				});
				ctx.context.addSuccessFinalizer?.(async () => {
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
						expireCookie(ctx, ctx.context.authCookies.dontRememberToken);
					}
					await ctx.context.internalAdapter
						.deleteSignInAttempt(attemptId)
						.catch(() => {});
					expireCookie(ctx, twoFactorCookie);
				});
				scheduleSessionCommit(
					ctx,
					finalizedSession,
					attempt.dontRememberMe ?? undefined,
				);
				return ctx.json({
					token: finalizedSession.session.token,
					user: parseUserOutput(ctx.context.options, finalizedSession.user),
				});
			},
			invalid,
			session: {
				session: null,
				user,
			},
			key: attemptId,
		};
	};

	if (requestedAttemptId) {
		return resolveAttempt(requestedAttemptId, false);
	}

	/**
	 * `/two-factor/*` serves two different intents:
	 * - complete a paused sign-in, identified explicitly by `attemptId`
	 * - manage two-factor state for the current authenticated session
	 *
	 * When a browser has both an active session and a paused sign-in, keep the
	 * session-scoped management path stable unless the caller passes an
	 * explicit `attemptId`. The signed two_factor cookie remains a fallback
	 * only for browser flows that do not already have a live session.
	 */
	if (session) {
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

	const signedTwoFactorCookie = await getTwoFactorAttemptId(ctx);
	if (signedTwoFactorCookie) {
		return resolveAttempt(signedTwoFactorCookie, true);
	}

	throw APIError.from(
		"UNAUTHORIZED",
		TWO_FACTOR_ERROR_CODES.INVALID_TWO_FACTOR_COOKIE,
	);
}
