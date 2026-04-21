import type { SignInChallenge } from "@better-auth/core";
import { describe, expect, it } from "vitest";
import { appendSignInChallengeToURL } from "./sign-in-challenge-url";

const twoFactor: SignInChallenge = {
	kind: "two-factor",
	attemptId: "att_test_fixture",
	methods: [
		{ id: "method_totp", kind: "totp", label: "Phone" },
		{ id: "method_recovery", kind: "recovery-code", label: null },
	],
};

describe("appendSignInChallengeToURL", () => {
	it("writes challenge and kind-specific params onto a relative target", () => {
		const url = appendSignInChallengeToURL("/dashboard", twoFactor);
		expect(url).toBe("/dashboard?challenge=two-factor");
	});

	it("writes challenge and kind-specific params onto an absolute target", () => {
		const url = appendSignInChallengeToURL(
			"https://example.com/app",
			twoFactor,
		);
		expect(url).toBe("https://example.com/app?challenge=two-factor");
	});

	it("preserves existing query params", () => {
		const url = appendSignInChallengeToURL("/dashboard?tab=1", twoFactor);
		expect(url).toBe("/dashboard?tab=1&challenge=two-factor");
	});

	it("preserves fragments when appending challenge params", () => {
		const url = appendSignInChallengeToURL("/dashboard#anchor", twoFactor);
		expect(url).toBe("/dashboard?challenge=two-factor#anchor");
	});

	it("never exposes attemptId or method details in the URL", () => {
		const relative = appendSignInChallengeToURL("/dashboard", twoFactor);
		const absolute = appendSignInChallengeToURL(
			"https://example.com/app",
			twoFactor,
		);
		const withQuery = appendSignInChallengeToURL("/dashboard?foo=1", twoFactor);
		const withHash = appendSignInChallengeToURL("/dashboard#x", twoFactor);

		for (const url of [relative, absolute, withQuery, withHash]) {
			expect(url).not.toContain("attemptId");
			expect(url).not.toContain(twoFactor.attemptId);
			expect(url).not.toContain("methods");
			expect(url).not.toContain("method_totp");
		}
	});
});
