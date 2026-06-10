import type {
	CheckSignInChallengeInput,
	CheckSignInChallengeResult,
	GenericEndpointContext,
} from "@better-auth/core";
import { writers } from "@better-auth/core/context/internals";
import type { User } from "../../types";
import {
	PENDING_TWO_FACTOR_CHALLENGE_COOKIE_NAME,
	TRUSTED_DEVICE_COOKIE_MAX_AGE,
} from "./constant";
import { listChallengeMethodDescriptors } from "./methods";
import {
	resolveTrustedDeviceRotation,
	rotateTrustedDevice,
} from "./trust-device";
import type { TwoFactorEnforcementDecision, TwoFactorOptions } from "./types";

function getTwoFactorOptions(
	ctx: GenericEndpointContext,
): TwoFactorOptions | null {
	const plugin = ctx.context.getPlugin("two-factor");
	if (!plugin) {
		return null;
	}
	return (plugin.options ?? {}) as TwoFactorOptions;
}

export async function checkTwoFactor(
	ctx: GenericEndpointContext,
	input: CheckSignInChallengeInput,
): Promise<CheckSignInChallengeResult> {
	const options = getTwoFactorOptions(ctx);
	if (!options) {
		return null;
	}

	if (input.satisfiedChallenges?.includes("two-factor")) {
		return null;
	}

	const methods = await listChallengeMethodDescriptors(ctx, input.user.id);
	if (methods.length === 0) {
		return null;
	}

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
			input.user.id,
			trustDeviceMaxAge,
		);
		if (rotation) {
			return {
				kind: "commit",
				onSuccess: () => rotateTrustedDevice(ctx, rotation, input.user.id),
			};
		}
	}

	const maxAge = options.pendingChallengeMaxAge ?? 10 * 60;
	const pendingChallengeCookie = ctx.context.createAuthCookie(
		PENDING_TWO_FACTOR_CHALLENGE_COOKIE_NAME,
		{ maxAge },
	);
	const attempt = await ctx.context.internalAdapter.createSignInAttempt({
		userId: input.user.id,
		rememberMe: input.rememberMe,
		expiresAt: new Date(Date.now() + maxAge * 1000),
		amr: [input.amr],
	});
	await ctx.setSignedCookie(
		pendingChallengeCookie.name,
		attempt.id,
		ctx.context.secret,
		pendingChallengeCookie.attributes,
	);
	const ctxWriters = writers(ctx.context);
	ctxWriters.setIssuedSession(null);
	ctxWriters.setFinalizedSignIn(null);
	ctxWriters.setSignInAttempt({
		...attempt,
		user: input.user as User & Record<string, any>,
	});

	return {
		kind: "challenge",
		challenge: {
			kind: "two-factor",
			attemptId: attempt.id,
			methods,
		},
	};
}

export async function getPendingTwoFactorAttemptId(
	ctx: GenericEndpointContext,
): Promise<string | null> {
	const pendingChallengeCookie = ctx.context.createAuthCookie(
		PENDING_TWO_FACTOR_CHALLENGE_COOKIE_NAME,
	);
	const attemptId = await ctx.getSignedCookie(
		pendingChallengeCookie.name,
		ctx.context.secret,
	);
	return typeof attemptId === "string" ? attemptId : null;
}

async function runEnforcementDecide(
	ctx: GenericEndpointContext,
	options: TwoFactorOptions,
	input: CheckSignInChallengeInput,
): Promise<Exclude<TwoFactorEnforcementDecision, { decision: string }>> {
	const decide = options.enforcement?.decide;
	if (!decide) {
		return undefined;
	}
	const raw = await decide({
		challenge: "two-factor",
		user: input.user,
		primaryMethod: input.amr.method,
		request: ctx.request as Request | undefined,
	});
	const normalized = normalizeDecision(raw);
	if (normalized.decision === "skip") {
		ctx.context.logger.info("two-factor challenge skipped by decide hook", {
			userId: input.user.id,
			primaryMethod: input.amr.method,
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
