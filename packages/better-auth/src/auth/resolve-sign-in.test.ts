import type { BetterAuthPlugin, SignInChallenge } from "@better-auth/core";
import { BUILTIN_AMR_METHOD } from "@better-auth/core";
import { createAuthEndpoint } from "@better-auth/core/api";
import { APIError } from "@better-auth/core/error";
import { describe, expect, it } from "vitest";
import { getTestInstance } from "../test-utils";
import { resolveSignIn } from "./resolve-sign-in";

declare module "@better-auth/core" {
	interface BetterAuthSignInChallengeRegistry {
		"test-challenge": {
			attemptId: string;
			note: string;
		};
	}
}

const TEST_EMAIL = "test@test.com";

function createTestResolveEndpointPlugin() {
	return {
		id: "test-resolve-endpoint",
		endpoints: {
			runTestSignIn: createAuthEndpoint(
				"/test-sign-in",
				{ method: "POST" },
				async (ctx) => {
					const result =
						await ctx.context.internalAdapter.findUserByEmail(TEST_EMAIL);
					if (!result) {
						throw APIError.from("BAD_REQUEST", {
							code: "MISSING_TEST_USER",
							message: "missing test user",
						});
					}
					return resolveSignIn(ctx as Parameters<typeof resolveSignIn>[0], {
						user: result.user,
						amr: {
							method: BUILTIN_AMR_METHOD.PASSWORD,
							factor: "knowledge",
							completedAt: new Date(),
						},
					});
				},
			),
		},
	} satisfies BetterAuthPlugin;
}

function createChallengePlugin(
	id: string,
	note: string,
	calls: string[],
	declaredChallenges: readonly string[] = ["test-challenge"],
) {
	const challenge: SignInChallenge = {
		kind: "test-challenge",
		attemptId: `att_${id}`,
		note,
	};

	return {
		id,
		signInChallenges: declaredChallenges,
		checkSignInChallenge: async () => {
			calls.push(id);
			return {
				kind: "challenge" as const,
				challenge,
			};
		},
	} as BetterAuthPlugin;
}

function createCommitPlugin(id: string, effects: string[]) {
	return {
		id,
		checkSignInChallenge: async () => ({
			kind: "commit" as const,
			onSuccess: async () => {
				effects.push(id);
			},
		}),
	} as BetterAuthPlugin;
}

describe("resolveSignIn generic challenge dispatch", () => {
	it("returns the first plugin challenge in registration order", async () => {
		const calls: string[] = [];
		const { auth } = await getTestInstance({
			plugins: [
				createChallengePlugin("first-challenge", "first", calls),
				createChallengePlugin("second-challenge", "second", calls),
				createTestResolveEndpointPlugin(),
			],
		});

		const result = await auth.api.runTestSignIn({
			method: "POST",
			asResponse: true,
		} as never);
		const body = (await result.json()) as {
			kind: "challenge";
			challenge: {
				kind: "test-challenge";
				note: string;
			};
		};

		expect(body.kind).toBe("challenge");
		expect(body.challenge).toMatchObject({
			kind: "test-challenge",
			note: "first",
		});
		expect(calls).toEqual(["first-challenge"]);
	});

	it("runs every accumulated commit callback after sign-in finalizes", async () => {
		const effects: string[] = [];
		const { auth } = await getTestInstance({
			plugins: [
				createCommitPlugin("first-commit", effects),
				createCommitPlugin("second-commit", effects),
				createTestResolveEndpointPlugin(),
			],
		});

		const result = await auth.api.runTestSignIn({
			method: "POST",
			asResponse: true,
		} as never);
		const body = (await result.json()) as { kind: "session" };

		expect(body.kind).toBe("session");
		expect(effects).toEqual(["first-commit", "second-commit"]);
	});

	it("does not run commit callbacks when a later plugin returns a challenge", async () => {
		const effects: string[] = [];
		const calls: string[] = [];
		const { auth } = await getTestInstance({
			plugins: [
				createCommitPlugin("first-commit", effects),
				createChallengePlugin("challenge-plugin", "challenge", calls),
				createTestResolveEndpointPlugin(),
			],
		});

		const result = await auth.api.runTestSignIn({
			method: "POST",
			asResponse: true,
		} as never);
		const body = (await result.json()) as { kind: "challenge" };

		expect(body.kind).toBe("challenge");
		expect(calls).toEqual(["challenge-plugin"]);
		expect(effects).toEqual([]);
	});

	it("rejects a plugin challenge kind that is not declared in signInChallenges", async () => {
		const { auth } = await getTestInstance({
			plugins: [
				createChallengePlugin(
					"invalid-plugin",
					"invalid",
					[],
					["other-challenge"],
				),
				createTestResolveEndpointPlugin(),
			],
		});

		await expect(
			auth.api.runTestSignIn({
				method: "POST",
			} as never),
		).rejects.toThrow(/signInChallenges/i);
	});
});
