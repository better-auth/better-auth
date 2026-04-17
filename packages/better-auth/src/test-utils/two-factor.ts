import type { SignInChallenge } from "@better-auth/core";
import { expect } from "vitest";

type TwoFactorChallenge = Extract<SignInChallenge, { type: "two-factor" }>;

type SignInChallengeEnvelope = {
	type: "challenge";
	challenge: SignInChallenge;
};

type TwoFactorChallengeEnvelope = {
	type: "challenge";
	challenge: TwoFactorChallenge;
};

function isSignInChallengeEnvelope(
	value: unknown,
): value is SignInChallengeEnvelope {
	if (!value || typeof value !== "object") {
		return false;
	}
	const record = value as {
		type?: unknown;
		challenge?: { type?: unknown };
	};
	return (
		record.type === "challenge" && typeof record.challenge?.type === "string"
	);
}

function isTwoFactorChallengeEnvelope(
	value: unknown,
): value is TwoFactorChallengeEnvelope {
	if (!isSignInChallengeEnvelope(value)) {
		return false;
	}
	const challenge = value.challenge as {
		type?: unknown;
		attemptId?: unknown;
		availableMethods?: unknown;
	};
	return (
		challenge.type === "two-factor" &&
		typeof challenge.attemptId === "string" &&
		Array.isArray(challenge.availableMethods)
	);
}

export function expectNoTwoFactorChallenge<T>(
	data: T | SignInChallengeEnvelope | null | undefined,
): asserts data is T {
	expect(data).toBeDefined();
	expect(isSignInChallengeEnvelope(data)).toBe(false);
}

export function expectTwoFactorChallenge(
	data: unknown,
): asserts data is TwoFactorChallengeEnvelope {
	expect(isTwoFactorChallengeEnvelope(data)).toBe(true);
}
