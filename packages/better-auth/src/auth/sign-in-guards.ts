import type {
	BetterAuthSignInChallengeRegistry,
	SignInChallenge,
	SignInResolution,
} from "@better-auth/core";

type ChallengeBranch = Extract<SignInResolution, { kind: "challenge" }>;

function isChallengeShape(value: unknown): value is {
	kind: "challenge";
	challenge: { kind: string };
} {
	if (!value || typeof value !== "object") return false;
	const envelope = value as { kind?: unknown; challenge?: { kind?: unknown } };
	return (
		envelope.kind === "challenge" &&
		typeof envelope.challenge?.kind === "string"
	);
}

/**
 * Narrows a sign-in response envelope to the `"challenge"` branch.
 *
 * @example
 * ```ts
 * const res = await authClient.signIn.email({ email, password });
 * if (isSignInChallenge(res.data)) {
 *   router.push(`/2fa?kind=${res.data.challenge.kind}`);
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
 * if (isSignInChallengeOfKind(res.data, "two-factor")) {
 *   await sendOTP({ attemptId: res.data.challenge.attemptId });
 * }
 * ```
 */
export function isSignInChallengeOfKind<
	K extends keyof BetterAuthSignInChallengeRegistry,
>(
	value: unknown,
	kind: K,
): value is {
	kind: "challenge";
	challenge: Extract<SignInChallenge, { kind: K }>;
} {
	return isChallengeShape(value) && value.challenge.kind === kind;
}
