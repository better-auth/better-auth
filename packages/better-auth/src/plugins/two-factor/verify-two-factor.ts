import type { GenericEndpointContext } from "@better-auth/core";
import { APIError } from "@better-auth/core/error";
import { createHMAC } from "@better-auth/utils/hmac";
import { getSessionFromCtx } from "../../api";
import { expireCookie, setSessionCookie } from "../../cookies";
import { generateRandomString } from "../../crypto/random";
import { parseUserOutput } from "../../db/schema";
import {
	DEFAULT_ACCOUNT_LOCKOUT_DURATION_SECONDS,
	DEFAULT_ACCOUNT_LOCKOUT_MAX_FAILED_ATTEMPTS,
	TRUST_DEVICE_COOKIE_MAX_AGE,
	TRUST_DEVICE_COOKIE_NAME,
	TWO_FACTOR_COOKIE_NAME,
} from "./constant";
import { TWO_FACTOR_ERROR_CODES } from "./error-code";
import type {
	TwoFactorOptions,
	TwoFactorTable,
	UserWithTwoFactor,
} from "./types";

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
			beginAttempt: async (allowedAttempts: number) => {
				const identifier = `2fa-attempts-${signedTwoFactorCookie}`;
				// Consume the precreated counter as the atomic race gate; a missing
				// row means a lost race or an expired challenge.
				const consumed = await ctx.context.internalAdapter
					.consumeVerificationValue(identifier)
					.catch(() => null);
				if (!consumed) {
					throw APIError.from(
						"UNAUTHORIZED",
						TWO_FACTOR_ERROR_CODES.INVALID_TWO_FACTOR_COOKIE,
					);
				}
				const parsed = Number(consumed.value);
				// A corrupt counter fails closed (treated as spent).
				const attempts =
					Number.isInteger(parsed) && parsed >= 0 ? parsed : allowedAttempts;
				if (attempts >= allowedAttempts) {
					// Budget spent: cancel the whole challenge so every factor must
					// start a new sign-in, and clear the now-dead cookie.
					await ctx.context.internalAdapter
						.consumeVerificationValue(signedTwoFactorCookie)
						.catch(() => {});
					expireCookie(ctx, twoFactorCookie);
					throw APIError.from(
						"BAD_REQUEST",
						TWO_FACTOR_ERROR_CODES.TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE,
					);
				}
				const rearm = (count: number) =>
					ctx.context.internalAdapter
						.createVerificationValue({
							value: `${count}`,
							identifier,
							expiresAt: verificationToken.expiresAt,
						})
						.catch(() => {});
				return {
					// recordFailure spends a slot; restore returns it on a server
					// error. Both swallow write errors (fail closed).
					recordFailure: () => rearm(attempts + 1),
					restore: () => rearm(attempts),
				};
			},
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
		// Re-verification is already authenticated, so it carries no attempt cap.
		beginAttempt: async (_allowedAttempts: number) => ({
			recordFailure: async () => {},
			restore: async () => {},
		}),
	};
}

function resolveAccountLockoutConfig(ctx: GenericEndpointContext) {
	const options = ctx.context.getPlugin("two-factor")?.options as
		| TwoFactorOptions
		| undefined;
	const lockout = options?.accountLockout;
	return {
		enabled: lockout?.enabled ?? true,
		maxFailedAttempts:
			lockout?.maxFailedAttempts ?? DEFAULT_ACCOUNT_LOCKOUT_MAX_FAILED_ATTEMPTS,
		durationMs:
			(lockout?.durationSeconds ?? DEFAULT_ACCOUNT_LOCKOUT_DURATION_SECONDS) *
			1000,
	};
}

/**
 * Reject the verification when the account is locked, and lazily clear an
 * expired lock. The lock caps consecutive failed verifications per account,
 * across challenges and factors (NIST SP 800-63B §5.2.2).
 */
export async function assertTwoFactorNotLocked(
	ctx: GenericEndpointContext,
	twoFactorTable: string,
	twoFactor: TwoFactorTable,
): Promise<void> {
	const { enabled } = resolveAccountLockoutConfig(ctx);
	if (!enabled || !twoFactor.lockedUntil) return;
	const lockedUntil = new Date(twoFactor.lockedUntil);
	if (lockedUntil.getTime() > Date.now()) {
		throw APIError.from(
			"TOO_MANY_REQUESTS",
			TWO_FACTOR_ERROR_CODES.ACCOUNT_TEMPORARILY_LOCKED,
		);
	}
	// Clear the expired lock, guarded on it still being expired, so a lock set
	// by a concurrent request after this read is not wiped.
	await ctx.context.adapter.incrementOne({
		model: twoFactorTable,
		where: [
			{ field: "id", value: twoFactor.id },
			{ field: "lockedUntil", operator: "lte", value: new Date() },
		],
		increment: {},
		set: { failedVerificationCount: 0, lockedUntil: null },
	});
}

/**
 * Count one failed verification toward the account-level budget, and lock the
 * account once the budget is spent. The increment is atomic, so concurrent
 * failures cannot lose updates. It is unguarded so it still applies to a row
 * whose counter is null or absent (a row created before the migration, or a
 * document-store record predating the column), where a guarded comparison
 * would never match.
 */
export async function recordTwoFactorFailure(
	ctx: GenericEndpointContext,
	twoFactorTable: string,
	twoFactor: TwoFactorTable,
): Promise<void> {
	const { enabled, maxFailedAttempts, durationMs } =
		resolveAccountLockoutConfig(ctx);
	if (!enabled) return;
	const updated = await ctx.context.adapter.incrementOne<TwoFactorTable>({
		model: twoFactorTable,
		where: [{ field: "id", value: twoFactor.id }],
		increment: { failedVerificationCount: 1 },
	});
	if ((updated?.failedVerificationCount ?? 0) >= maxFailedAttempts) {
		await ctx.context.adapter.update({
			model: twoFactorTable,
			where: [{ field: "id", value: twoFactor.id }],
			update: { lockedUntil: new Date(Date.now() + durationMs) },
		});
	}
}

/**
 * Clear the account-level failure budget after a successful verification, so the
 * count tracks only consecutive failures. The write is unconditional: a snapshot
 * read at the start of the request can miss a concurrent failure, so skipping it
 * could leave the counter non-zero after a success.
 */
export async function resetTwoFactorFailures(
	ctx: GenericEndpointContext,
	twoFactorTable: string,
	twoFactor: TwoFactorTable,
): Promise<void> {
	const { enabled } = resolveAccountLockoutConfig(ctx);
	if (!enabled) return;
	await ctx.context.adapter.update({
		model: twoFactorTable,
		where: [{ field: "id", value: twoFactor.id }],
		update: { failedVerificationCount: 0, lockedUntil: null },
	});
}
