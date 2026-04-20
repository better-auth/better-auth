import type {
	AuthenticationMethodReference,
	BetterAuthSignInChallengeRegistry,
	GenericEndpointContext,
	SignInChallenge,
} from "@better-auth/core";
import { writers } from "@better-auth/core/context/internals";
import type { User } from "../../types";
import {
	TRUSTED_DEVICE_COOKIE_MAX_AGE,
	TWO_FACTOR_COOKIE_NAME,
} from "./constant";
import type { TrustedDeviceRotation } from "./trust-device";
import { resolveTrustedDeviceRotation } from "./trust-device";
import type {
	TwoFactorEnforcementDecision,
	TwoFactorMethod,
	TwoFactorOptions,
	TwoFactorTable,
	UserWithTwoFactor,
} from "./types";

export type TwoFactorCheckInput = {
	user: User;
	/**
	 * Primary factor AMR entry. Persisted on the challenge attempt so the
	 * finalized session's `amr` preserves the primary alongside the 2FA
	 * factor, rather than collapsing to just the last step.
	 */
	amr: AuthenticationMethodReference;
	rememberMe?: boolean;
	/**
	 * Challenge kinds the primary factor has already satisfied. Forwarded from
	 * `resolveSignIn`. If `"two-factor"` is present the challenge is bypassed
	 * (e.g. passkey user-verified sign-in already proves possession+inherence).
	 */
	satisfiedChallenges?: readonly (keyof BetterAuthSignInChallengeRegistry)[];
};

export type TwoFactorCheckResult =
	| {
			kind: "challenge";
			challenge: Extract<SignInChallenge, { kind: "two-factor" }>;
	  }
	| {
			kind: "trusted-device";
			rotation: TrustedDeviceRotation;
	  }
	| null;

function getTwoFactorOptions(
	ctx: GenericEndpointContext,
): TwoFactorOptions | null {
	const plugin = ctx.context.getPlugin("two-factor");
	if (!plugin) {
		return null;
	}
	return (plugin.options ?? {}) as TwoFactorOptions;
}

async function getAvailableTwoFactorMethods(
	ctx: GenericEndpointContext,
	userId: string,
	options: TwoFactorOptions,
): Promise<TwoFactorMethod[]> {
	const methods: TwoFactorMethod[] = [];
	const twoFactorTable = options.twoFactorTable ?? "twoFactor";

	if (!options.totpOptions?.disable) {
		const userTotpSecret = await ctx.context.adapter.findOne<TwoFactorTable>({
			model: twoFactorTable,
			where: [{ field: "userId", value: userId }],
		});
		if (userTotpSecret && userTotpSecret.verified !== false) {
			methods.push("totp");
		}
	}

	if (options.otpOptions?.sendOTP) {
		methods.push("otp");
	}

	return methods;
}

/**
 * Decides whether a sign-in needs to pause for 2FA. Returns:
 * - `null` when the user can be finalized immediately (no plugin, 2FA disabled,
 *    primary factor already satisfies 2FA, a `decide` hook returned `"skip"`,
 *    or sign-in originates from a trusted device).
 * - `{ kind: "trusted-device", rotation }` when the device should skip the
 *    challenge and have its trust-token rotated on successful commit.
 * - `{ kind: "challenge", challenge }` when the user must complete 2FA before
 *    a session is issued.
 */
export async function checkTwoFactor(
	ctx: GenericEndpointContext,
	input: TwoFactorCheckInput,
): Promise<TwoFactorCheckResult> {
	const options = getTwoFactorOptions(ctx);
	if (!options) {
		return null;
	}

	const user = input.user as UserWithTwoFactor;
	if (!user.twoFactorEnabled) {
		return null;
	}

	if (input.satisfiedChallenges?.includes("two-factor")) {
		return null;
	}

	// Precedence: factor-level `satisfiedChallenges` (above) > `decide` policy >
	// `requireReverificationFor` allowlist > trust-device cookie rotation.
	const decision = await runEnforcementDecide(ctx, options, input);
	if (decision === "skip") {
		return null;
	}

	const forceChallenge =
		decision === "enforce" || matchesRequireReverification(ctx, options);

	if (!forceChallenge) {
		const trustDeviceMaxAge =
			options.trustDevice?.maxAge ?? TRUSTED_DEVICE_COOKIE_MAX_AGE;
		const rotation = await resolveTrustedDeviceRotation(
			ctx,
			user.id,
			trustDeviceMaxAge,
		);
		if (rotation) {
			return { kind: "trusted-device", rotation };
		}
	}

	const maxAge = options.twoFactorCookieMaxAge ?? 10 * 60;
	const twoFactorCookie = ctx.context.createAuthCookie(TWO_FACTOR_COOKIE_NAME, {
		maxAge,
	});
	const attempt = await ctx.context.internalAdapter.createSignInAttempt({
		userId: user.id,
		rememberMe: input.rememberMe,
		expiresAt: new Date(Date.now() + maxAge * 1000),
		amr: [input.amr],
	});
	await ctx.setSignedCookie(
		twoFactorCookie.name,
		attempt.id,
		ctx.context.secret,
		twoFactorCookie.attributes,
	);
	const ctxWriters = writers(ctx.context);
	ctxWriters.setIssuedSession(null);
	ctxWriters.setFinalizedSignIn(null);
	ctxWriters.setSignInAttempt({
		...attempt,
		user: input.user as User & Record<string, any>,
	});

	const methods = await getAvailableTwoFactorMethods(ctx, user.id, options);
	return {
		kind: "challenge",
		challenge: {
			kind: "two-factor",
			attemptId: attempt.id,
			availableMethods: methods,
		},
	};
}

export async function getTwoFactorAttemptId(
	ctx: GenericEndpointContext,
): Promise<string | null> {
	const twoFactorCookie = ctx.context.createAuthCookie(TWO_FACTOR_COOKIE_NAME);
	const attemptId = await ctx.getSignedCookie(
		twoFactorCookie.name,
		ctx.context.secret,
	);
	return typeof attemptId === "string" ? attemptId : null;
}

/**
 * Invoke `enforcement.decide` (if configured), normalize the literal-or-
 * structured return to `"enforce" | "skip" | undefined`, and audit-log
 * a "skip" outcome with the operator-supplied reason when present.
 * Separated from `checkTwoFactor` so the primary flow stays linear and the
 * logging contract (every bypass is observable) is enforced in one place.
 */
async function runEnforcementDecide(
	ctx: GenericEndpointContext,
	options: TwoFactorOptions,
	input: TwoFactorCheckInput,
): Promise<Exclude<TwoFactorEnforcementDecision, { decision: string }>> {
	const decide = options.enforcement?.decide;
	if (!decide) {
		return undefined;
	}
	const raw = await decide({
		challenge: "two-factor",
		user: input.user,
		method: input.amr.method,
		request: ctx.request as Request | undefined,
	});
	const normalized = normalizeDecision(raw);
	if (normalized.decision === "skip") {
		ctx.context.logger.info("two-factor challenge skipped by decide hook", {
			userId: input.user.id,
			method: input.amr.method,
			challenge: "two-factor",
			reason: normalized.reason ?? "unspecified",
		});
	}
	return normalized.decision;
}

function normalizeDecision(raw: TwoFactorEnforcementDecision): {
	decision: "enforce" | "skip" | undefined;
	reason?: string;
} {
	if (raw === "enforce" || raw === "skip") {
		return { decision: raw };
	}
	if (raw && typeof raw === "object") {
		return { decision: raw.decision, reason: raw.reason };
	}
	return { decision: undefined };
}

/**
 * Exact-match the current request path against the trust-device
 * reverification allowlist. Exact matching keeps the allowlist intent
 * unambiguous: `"/update-password"` never silently covers
 * `"/update-password/recovery"`.
 */
function matchesRequireReverification(
	ctx: GenericEndpointContext,
	options: TwoFactorOptions,
): boolean {
	const paths = options.trustDevice?.requireReverificationFor;
	if (!paths || paths.length === 0) {
		return false;
	}
	return paths.includes(ctx.path);
}
