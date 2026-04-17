import type {
	BetterAuthSignInChallengeRegistry,
	GenericEndpointContext,
	SignInChallenge,
} from "@better-auth/core";
import type { User } from "../../types";
import {
	TRUST_DEVICE_COOKIE_MAX_AGE,
	TWO_FACTOR_COOKIE_NAME,
} from "./constant";
import type { TrustedDeviceRotation } from "./trust-device";
import {
	resolveTrustedDeviceRotation,
	rotateTrustedDevice,
} from "./trust-device";
import type {
	TwoFactorMethod,
	TwoFactorOptions,
	TwoFactorTable,
	UserWithTwoFactor,
} from "./types";

export type TwoFactorCheckInput = {
	user: User;
	dontRememberMe?: boolean;
	/**
	 * Forwarded from `resolveSignIn`. If `"two-factor"` is present the
	 * challenge is bypassed (primary factor already satisfied it, e.g. passkey
	 * user-verified).
	 */
	skipChallenges?: readonly (keyof BetterAuthSignInChallengeRegistry)[];
};

export type TwoFactorCheckResult =
	| {
			type: "challenge";
			challenge: Extract<SignInChallenge, { type: "two-factor" }>;
	  }
	| {
			type: "trusted-device";
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
 *    primary factor already satisfies 2FA, or sign-in originates from a trusted
 *    device).
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

	if (input.skipChallenges?.includes("two-factor")) {
		return null;
	}

	const trustDeviceMaxAge =
		options.trustDeviceMaxAge ?? TRUST_DEVICE_COOKIE_MAX_AGE;
	const rotation = await resolveTrustedDeviceRotation(
		ctx,
		user.id,
		trustDeviceMaxAge,
	);
	if (rotation) {
		return { type: "trusted-device", rotation };
	}

	const maxAge = options.twoFactorCookieMaxAge ?? 10 * 60;
	const twoFactorCookie = ctx.context.createAuthCookie(TWO_FACTOR_COOKIE_NAME, {
		maxAge,
	});
	const attempt = await ctx.context.internalAdapter.createSignInAttempt({
		userId: user.id,
		dontRememberMe: input.dontRememberMe,
		expiresAt: new Date(Date.now() + maxAge * 1000),
	});
	await ctx.setSignedCookie(
		twoFactorCookie.name,
		attempt.id,
		ctx.context.secret,
		twoFactorCookie.attributes,
	);
	ctx.context.setNewSession(null);
	ctx.context.setFinalizedSignIn(null);
	ctx.context.setSignInAttempt({
		...attempt,
		user: input.user as User & Record<string, any>,
	});

	const methods = await getAvailableTwoFactorMethods(ctx, user.id, options);
	return {
		type: "challenge",
		challenge: {
			type: "two-factor",
			attemptId: attempt.id,
			availableMethods: methods,
		},
	};
}

export function scheduleTrustedDeviceCommit(
	ctx: GenericEndpointContext,
	rotation: TrustedDeviceRotation,
	userId: string,
): void {
	ctx.context.addSuccessFinalizer?.(async () => {
		await rotateTrustedDevice(ctx, rotation, userId);
	});
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
