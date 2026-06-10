import type { SignInChallenge } from "@better-auth/core";
import { expect } from "vitest";
import type { TwoFactorMethod } from "../plugins/two-factor/types";

type TwoFactorChallenge = Extract<SignInChallenge, { kind: "two-factor" }>;

type SignInChallengeEnvelope = {
	kind: "challenge";
	challenge: SignInChallenge;
};

type TwoFactorChallengeEnvelope = {
	kind: "challenge";
	challenge: TwoFactorChallenge;
};

function isSignInChallengeEnvelope(
	value: unknown,
): value is SignInChallengeEnvelope {
	if (!value || typeof value !== "object") {
		return false;
	}
	const record = value as {
		kind?: unknown;
		challenge?: { kind?: unknown };
	};
	return (
		record.kind === "challenge" && typeof record.challenge?.kind === "string"
	);
}

function isTwoFactorChallengeEnvelope(
	value: unknown,
): value is TwoFactorChallengeEnvelope {
	if (!isSignInChallengeEnvelope(value)) {
		return false;
	}
	const challenge = value.challenge as {
		kind?: unknown;
		attemptId?: unknown;
		methods?: unknown;
	};
	return (
		challenge.kind === "two-factor" &&
		typeof challenge.attemptId === "string" &&
		Array.isArray(challenge.methods)
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

type TwoFactorTestAdapter = {
	create(input: {
		model: "twoFactorMethod";
		data: {
			userId: string;
			kind: "otp";
			label: string | null;
			verifiedAt: Date;
			lastUsedAt: null;
		};
	}): Promise<TwoFactorMethod>;
};

type AuthWithUserLookup = {
	$context: Promise<{
		internalAdapter: {
			findUserByEmail(email: string): Promise<{ user: { id: string } } | null>;
		};
	}>;
};

export async function seedVerifiedOtpMethod(
	adapter: TwoFactorTestAdapter,
	userId: string,
	label?: string,
) {
	return adapter.create({
		model: "twoFactorMethod",
		data: {
			userId,
			kind: "otp",
			label: label ?? null,
			verifiedAt: new Date(),
			lastUsedAt: null,
		},
	});
}

export async function seedVerifiedOtpMethodForEmail(
	auth: AuthWithUserLookup,
	adapter: TwoFactorTestAdapter,
	email: string,
	label?: string,
) {
	const context = await auth.$context;
	const user = await context.internalAdapter.findUserByEmail(email);
	if (!user) {
		throw new Error(`Expected user for email: ${email}`);
	}
	return seedVerifiedOtpMethod(adapter, user.user.id, label);
}
