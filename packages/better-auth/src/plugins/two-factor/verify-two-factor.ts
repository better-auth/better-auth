import type {
	AuthenticationMethodReference,
	GenericEndpointContext,
	SignInAttempt,
} from "@better-auth/core";
import { writers } from "@better-auth/core/context/internals";
import type { Session, User } from "@better-auth/core/db";
import { APIError } from "@better-auth/core/error";
import { createHMAC } from "@better-auth/utils/hmac";
import { getSessionFromCtx } from "../../api";
import { finalizeSignIn } from "../../auth/finalize-sign-in";
import { expireCookie } from "../../cookies";
import { generateRandomString } from "../../crypto/random";
import { parseUserOutput } from "../../db/schema";
import { getTwoFactorAttemptId } from "./check";
import {
	TRUST_DEVICE_COOKIE_MAX_AGE,
	TRUST_DEVICE_COOKIE_NAME,
	TWO_FACTOR_COOKIE_NAME,
} from "./constant";
import { TWO_FACTOR_ERROR_CODES } from "./error-code";
import type { TwoFactorOptions, UserWithTwoFactor } from "./types";

const DEFAULT_MAX_VERIFICATION_ATTEMPTS = 5;

export type TwoFactorVerifyResponse = {
	token: string;
	user: Record<string, unknown>;
};

/**
 * Resolver returned when `verifyTwoFactor` is finalizing a paused sign-in.
 * `valid` requires the second-factor `AuthenticationMethodReference` so the
 * factor is appended to `session.amr` on commit.
 */
export type CompleteResolver = {
	mode: "complete";
	valid: (
		ctx: GenericEndpointContext,
		factor: AuthenticationMethodReference,
	) => Promise<TwoFactorVerifyResponse>;
	invalid: (errorKey: keyof typeof TWO_FACTOR_ERROR_CODES) => Promise<never>;
	session: { session: null; user: UserWithTwoFactor };
	key: string;
};

/**
 * Resolver returned when `verifyTwoFactor` is operating on an existing
 * authenticated session (enrollment or step-up against `session.user`).
 * `valid` takes no factor: there is no sign-in to finalize and no AMR chain
 * to extend.
 */
export type ManagementResolver = {
	mode: "management";
	valid: (ctx: GenericEndpointContext) => Promise<TwoFactorVerifyResponse>;
	invalid: (errorKey: keyof typeof TWO_FACTOR_ERROR_CODES) => never;
	session: { session: Session; user: User };
	key: string;
};

export type TwoFactorResolver = CompleteResolver | ManagementResolver;

function getMaxVerificationAttempts(ctx: GenericEndpointContext): number {
	const plugin = ctx.context.getPlugin("two-factor");
	const options = (plugin?.options ?? {}) as TwoFactorOptions;
	const value = options.maxVerificationAttempts;
	return typeof value === "number" && value > 0
		? value
		: DEFAULT_MAX_VERIFICATION_ATTEMPTS;
}

/**
 * Write the trust-device verification record and signed cookie, and expire
 * the dontRememberToken so the next sign-in from this browser bypasses 2FA
 * for the configured window. Shared between the complete (finalize paused
 * sign-in) and management (step-up / enrollment) resolvers so `trustDevice`
 * behaves identically regardless of entry point.
 */
async function writeTrustDeviceCookie(
	ctx: GenericEndpointContext,
	userId: string,
): Promise<void> {
	const plugin = ctx.context.getPlugin("two-factor");
	const trustDeviceMaxAge = (plugin?.options as TwoFactorOptions | undefined)
		?.trustDevice?.maxAge;
	const maxAge = trustDeviceMaxAge ?? TRUST_DEVICE_COOKIE_MAX_AGE;
	const trustDeviceCookie = ctx.context.createAuthCookie(
		TRUST_DEVICE_COOKIE_NAME,
		{ maxAge },
	);
	const trustIdentifier = `trust-device-${generateRandomString(32)}`;
	const token = await createHMAC("SHA-256", "base64urlnopad").sign(
		ctx.context.secret,
		`${userId}!${trustIdentifier}`,
	);
	await ctx.context.internalAdapter.createVerificationValue({
		value: userId,
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

export async function verifyTwoFactor(
	ctx: GenericEndpointContext,
): Promise<TwoFactorResolver> {
	const session = await getSessionFromCtx(ctx);
	// Attempt-id carrier: JSON/native callers send it on the body; browser
	// redirect flows rely on the signed `better-auth.two_factor` cookie written
	// at attempt creation. The query string is deliberately not read: query
	// params leak through Referer headers and proxy logs (#S5).
	const requestedAttemptId =
		typeof ctx.body?.attemptId === "string" ? ctx.body.attemptId : null;
	const twoFactorCookie = ctx.context.createAuthCookie(TWO_FACTOR_COOKIE_NAME);

	const rejectCookie = (clearCookieOnFailure: boolean): never => {
		if (clearCookieOnFailure) {
			expireCookie(ctx, twoFactorCookie);
		}
		throw APIError.from(
			"UNAUTHORIZED",
			TWO_FACTOR_ERROR_CODES.INVALID_TWO_FACTOR_COOKIE,
		);
	};

	const loadAttempt = async (
		attemptId: string,
		clearCookieOnFailure: boolean,
	) => {
		const attempt =
			await ctx.context.internalAdapter.findSignInAttempt(attemptId);
		if (!attempt) {
			return rejectCookie(clearCookieOnFailure);
		}
		if (attempt.expiresAt <= new Date()) {
			await ctx.context.internalAdapter
				.deleteSignInAttempt(attemptId)
				.catch(() => {});
			return rejectCookie(clearCookieOnFailure);
		}
		// When the caller has a session for a different user than the attempt,
		// require proof that this same caller started the attempt: the signed
		// two-factor cookie set at attempt creation must match. Without that
		// binding, a signed-in user could complete another user's paused sign-in
		// by presenting an observed attemptId.
		if (session && session.user.id !== attempt.userId) {
			const cookieAttemptId = await getTwoFactorAttemptId(ctx);
			if (cookieAttemptId !== attemptId) {
				ctx.context.logger.info("auth.two-factor.verify.rejected", {
					reason: "cross-user-attempt-id",
					sessionUserId: session.user.id,
					attemptUserId: attempt.userId,
				});
				return rejectCookie(clearCookieOnFailure);
			}
		}
		const user = (await ctx.context.internalAdapter.findUserById(
			attempt.userId,
		)) as UserWithTwoFactor | null;
		if (!user) {
			await ctx.context.internalAdapter
				.deleteSignInAttempt(attemptId)
				.catch(() => {});
			return rejectCookie(clearCookieOnFailure);
		}
		return { attempt, user };
	};

	const invalid = async (
		errorKey: keyof typeof TWO_FACTOR_ERROR_CODES,
		attemptId?: string,
	): Promise<never> => {
		if (attemptId) {
			const maxAttempts = getMaxVerificationAttempts(ctx);
			await ctx.context.internalAdapter
				.recordSignInAttemptFailure(attemptId, { maxAttempts })
				.catch(() => null);
		}
		throw APIError.from("UNAUTHORIZED", TWO_FACTOR_ERROR_CODES[errorKey]);
	};

	const buildResolver = (
		attempt: SignInAttempt,
		user: UserWithTwoFactor,
		clearCookieOnFailure: boolean,
	): CompleteResolver => {
		const attemptId = attempt.id;
		return {
			mode: "complete",
			valid: async (
				ctx: GenericEndpointContext,
				factor: AuthenticationMethodReference,
			) => {
				const consumed =
					await ctx.context.internalAdapter.consumeSignInAttempt(attemptId);
				if (!consumed) {
					return rejectCookie(clearCookieOnFailure);
				}
				writers(ctx.context).setSignInAttempt({
					...consumed,
					user,
				});
				const finalizedSession = await finalizeSignIn(ctx, {
					user,
					dontRememberMe: consumed.dontRememberMe ?? undefined,
					amr: [...(consumed.amr ?? []), factor],
					attemptId,
					rollback: async () => {
						// After-hooks may convert a successful verify into a failure
						// (e.g. SSO organization provisioning throws). The atomic
						// consume already deleted the row; restore it here so the
						// caller can retry with the same attemptId instead of losing
						// their paused sign-in to a transient upstream error.
						await ctx.context.internalAdapter
							.createSignInAttempt(consumed)
							.catch(() => {});
					},
					onSuccess: async () => {
						// Runs only once after-hooks accept the sign-in: writing a
						// trust-device credential here means it cannot outlive a
						// rolled-back session, and expiring the `two_factor` cookie
						// only after confirmed success preserves the retry path on
						// transient after-hook failures.
						if (ctx.body.trustDevice) {
							await writeTrustDeviceCookie(ctx, user.id);
						}
						expireCookie(ctx, twoFactorCookie);
					},
				});
				return ctx.json({
					token: finalizedSession.session.token,
					user: parseUserOutput(ctx.context.options, finalizedSession.user),
				});
			},
			invalid: (errorKey: keyof typeof TWO_FACTOR_ERROR_CODES) =>
				invalid(errorKey, attemptId),
			session: {
				session: null,
				user,
			},
			key: attemptId,
		};
	};

	const resolveAttempt = async (
		attemptId: string,
		clearCookieOnFailure: boolean,
	) => {
		const { attempt, user } = await loadAttempt(
			attemptId,
			clearCookieOnFailure,
		);
		if (attempt.lockedAt) {
			throw APIError.from(
				"UNAUTHORIZED",
				TWO_FACTOR_ERROR_CODES.TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE,
			);
		}
		return buildResolver(attempt, user, clearCookieOnFailure);
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
		const invalidSession = (
			errorKey: keyof typeof TWO_FACTOR_ERROR_CODES,
		): never => {
			throw APIError.from("UNAUTHORIZED", TWO_FACTOR_ERROR_CODES[errorKey]);
		};
		return {
			mode: "management",
			valid: async (ctx: GenericEndpointContext) => {
				if (ctx.body?.trustDevice) {
					await writeTrustDeviceCookie(ctx, session.user.id);
				}
				return ctx.json({
					token: session.session.token,
					user: parseUserOutput(ctx.context.options, session.user),
				});
			},
			invalid: invalidSession,
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
