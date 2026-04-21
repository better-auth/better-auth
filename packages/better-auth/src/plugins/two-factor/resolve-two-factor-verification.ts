import type {
	AuthenticationMethodReference,
	GenericEndpointContext,
	SignInAttempt,
} from "@better-auth/core";
import { writers } from "@better-auth/core/context/internals";
import type { Session, User } from "@better-auth/core/db";
import { APIError } from "@better-auth/core/error";
import { getSessionFromCtx } from "../../api";
import { finalizeSignIn } from "../../auth/finalize-sign-in";
import { expireCookie } from "../../cookies";
import { parseUserOutput } from "../../db/schema";
import { getPendingTwoFactorAttemptId } from "./check";
import { PENDING_TWO_FACTOR_CHALLENGE_COOKIE_NAME } from "./constant";
import { TWO_FACTOR_ERROR_CODES } from "./error-code";
import { issueTrustedDevice } from "./trust-device";
import type { TwoFactorOptions } from "./types";

const DEFAULT_MAX_VERIFICATION_ATTEMPTS = 5;

export type TwoFactorVerifyResponse = {
	token: string;
	user: Record<string, unknown>;
};

export type FinalizeTwoFactorVerificationResolver = {
	mode: "finalize";
	valid: (
		ctx: GenericEndpointContext,
		verifiedAmr: AuthenticationMethodReference,
	) => Promise<TwoFactorVerifyResponse>;
	invalid: (errorKey: keyof typeof TWO_FACTOR_ERROR_CODES) => Promise<never>;
	session: { session: null; user: User };
	key: string;
};

export type SessionTwoFactorVerificationResolver = {
	mode: "session";
	valid: (ctx: GenericEndpointContext) => Promise<TwoFactorVerifyResponse>;
	invalid: (errorKey: keyof typeof TWO_FACTOR_ERROR_CODES) => never;
	session: { session: Session; user: User };
	key: string;
};

export type TwoFactorVerificationResolver =
	| FinalizeTwoFactorVerificationResolver
	| SessionTwoFactorVerificationResolver;

function getMaxVerificationAttempts(ctx: GenericEndpointContext): number {
	const plugin = ctx.context.getPlugin("two-factor");
	const options = (plugin?.options ?? {}) as TwoFactorOptions;
	const value = options.maxVerificationAttempts;
	return typeof value === "number" && value > 0
		? value
		: DEFAULT_MAX_VERIFICATION_ATTEMPTS;
}

export async function resolveTwoFactorVerification(
	ctx: GenericEndpointContext,
): Promise<TwoFactorVerificationResolver> {
	const session = await getSessionFromCtx(ctx);
	const requestedAttemptId =
		typeof ctx.body?.attemptId === "string" ? ctx.body.attemptId : null;
	const pendingChallengeCookie = ctx.context.createAuthCookie(
		PENDING_TWO_FACTOR_CHALLENGE_COOKIE_NAME,
	);

	const rejectCookie = (clearCookieOnFailure: boolean): never => {
		if (clearCookieOnFailure) {
			expireCookie(ctx, pendingChallengeCookie);
		}
		throw APIError.from(
			"UNAUTHORIZED",
			TWO_FACTOR_ERROR_CODES.INVALID_PENDING_CHALLENGE,
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
		if (session && session.user.id !== attempt.userId) {
			const cookieAttemptId = await getPendingTwoFactorAttemptId(ctx);
			if (cookieAttemptId !== attemptId) {
				ctx.context.logger.info("auth.two-factor.verify.rejected", {
					reason: "cross-user-attempt-id",
					sessionUserId: session.user.id,
					attemptUserId: attempt.userId,
				});
				return rejectCookie(clearCookieOnFailure);
			}
		}
		const user = await ctx.context.internalAdapter.findUserById(attempt.userId);
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

	const buildFinalizeTwoFactorVerificationResolver = (
		attempt: SignInAttempt,
		user: User,
		clearCookieOnFailure: boolean,
	): FinalizeTwoFactorVerificationResolver => {
		const attemptId = attempt.id;
		return {
			mode: "finalize",
			valid: async (
				ctx: GenericEndpointContext,
				verifiedAmr: AuthenticationMethodReference,
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
					rememberMe: consumed.rememberMe ?? undefined,
					amr: [...(consumed.amr ?? []), verifiedAmr],
					attemptId,
					rollback: async () => {
						await ctx.context.internalAdapter
							.createSignInAttempt(consumed)
							.catch(() => {});
					},
					onSuccess: async () => {
						if (ctx.body.trustDevice) {
							await issueTrustedDevice(ctx, user.id);
						}
						expireCookie(ctx, pendingChallengeCookie);
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

	const prepareFinalizeTwoFactorVerificationResolver = async (
		attemptId: string,
		clearCookieOnFailure: boolean,
	): Promise<FinalizeTwoFactorVerificationResolver | null> => {
		const { attempt, user } = await loadAttempt(
			attemptId,
			clearCookieOnFailure,
		);
		if (attempt.lockedAt) {
			if (session && session.user.id === attempt.userId) {
				expireCookie(ctx, pendingChallengeCookie);
				return null;
			}
			throw APIError.from(
				"UNAUTHORIZED",
				TWO_FACTOR_ERROR_CODES.TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE,
			);
		}
		return buildFinalizeTwoFactorVerificationResolver(
			attempt,
			user,
			clearCookieOnFailure,
		);
	};

	if (requestedAttemptId) {
		const resolver = await prepareFinalizeTwoFactorVerificationResolver(
			requestedAttemptId,
			false,
		);
		if (resolver) {
			return resolver;
		}
	}

	if (session) {
		const invalidSession = (
			errorKey: keyof typeof TWO_FACTOR_ERROR_CODES,
		): never => {
			throw APIError.from("UNAUTHORIZED", TWO_FACTOR_ERROR_CODES[errorKey]);
		};
		return {
			mode: "session",
			valid: async (ctx: GenericEndpointContext) => {
				if (ctx.body?.trustDevice) {
					await issueTrustedDevice(ctx, session.user.id);
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

	const signedTwoFactorCookie = await getPendingTwoFactorAttemptId(ctx);
	if (signedTwoFactorCookie) {
		// Cookie-based challenge resolution is the fallback when the caller has
		// no active session context. Once a session exists, callers must pass an
		// explicit `attemptId` to keep finalizing a pending challenge.
		const attempt = await ctx.context.internalAdapter.findSignInAttempt(
			signedTwoFactorCookie,
		);
		if (attempt && attempt.expiresAt > new Date()) {
			const resolver = await prepareFinalizeTwoFactorVerificationResolver(
				signedTwoFactorCookie,
				true,
			);
			if (resolver) {
				return resolver;
			}
		} else {
			expireCookie(ctx, pendingChallengeCookie);
		}
	}

	throw APIError.from(
		"UNAUTHORIZED",
		TWO_FACTOR_ERROR_CODES.INVALID_PENDING_CHALLENGE,
	);
}
