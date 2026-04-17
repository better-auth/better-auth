import type {
	BetterAuthSignInChallengeRegistry,
	SignInChallenge,
	SignInResolution,
} from "@better-auth/core";

type ChallengeBranch = Extract<SignInResolution, { type: "challenge" }>;

function isChallengeShape(value: unknown): value is {
	type: "challenge";
	challenge: { type: string };
} {
	if (!value || typeof value !== "object") return false;
	const envelope = value as { type?: unknown; challenge?: { type?: unknown } };
	return (
		envelope.type === "challenge" &&
		typeof envelope.challenge?.type === "string"
	);
}

/**
 * Narrows a sign-in response envelope to the `"challenge"` branch.
 *
 * @example
 * ```ts
 * const res = await authClient.signIn.email({ email, password });
 * if (isSignInChallenge(res.data)) {
 *   router.push(`/2fa?attemptId=${res.data.challenge.attemptId}`);
 * }
 * ```
 */
export function isSignInChallenge(value: unknown): value is ChallengeBranch {
	return isChallengeShape(value);
}

/**
 * Narrows a sign-in response envelope to a challenge of a specific kind
 * registered in `BetterAuthSignInChallengeRegistry`.
 *
 * @example
 * ```ts
 * if (isSignInChallengeOfType(res.data, "two-factor")) {
 *   await sendOTP({ attemptId: res.data.challenge.attemptId });
 * }
 * ```
 */
export function isSignInChallengeOfType<
	K extends keyof BetterAuthSignInChallengeRegistry,
>(
	value: unknown,
	type: K,
): value is {
	type: "challenge";
	challenge: Extract<SignInChallenge, { type: K }>;
} {
	return isChallengeShape(value) && value.challenge.type === type;
}
