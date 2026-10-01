import type { OAuthProvider } from "@better-auth/core/oauth2";
import { describe, expect, it, vi } from "vitest";
import { resolveOAuthAccountKey } from "./account-key";

function createProvider(
	overrides: Partial<OAuthProvider<Record<string, unknown>>> = {},
): OAuthProvider<Record<string, unknown>> {
	return {
		id: "company-oauth",
		name: "Company OAuth",
		accountSubject: ({ profile }) => String(profile.subject),
		createAuthorizationURL: vi.fn(),
		validateAuthorizationCode: vi.fn(),
		getUserInfo: vi.fn(),
		...overrides,
	};
}

const tokens = { accessToken: "access-token" };
const result = {
	data: { subject: "provider-subject", tenant: "acme" },
};

describe("resolveOAuthAccountKey", () => {
	it("keys the account by the provider id and the provider subject", async () => {
		await expect(
			resolveOAuthAccountKey(createProvider(), tokens, result.data),
		).resolves.toEqual({
			providerId: "company-oauth",
			accountId: "provider-subject",
		});
	});

	it.each([
		["provider-subject", "provider-subject"],
		[42, "42"],
	] as const)("normalizes the account subject resolved from provider data %j", async (accountSubject, accountId) => {
		await expect(
			resolveOAuthAccountKey(
				createProvider({ accountSubject: () => accountSubject }),
				tokens,
				result.data,
			),
		).resolves.toEqual({
			providerId: "company-oauth",
			accountId,
		});
	});

	it("keeps provider aliases as separate account keys", async () => {
		const web = createProvider({ id: "company-web" });
		const mobile = createProvider({ id: "company-mobile" });

		await expect(
			resolveOAuthAccountKey(web, tokens, result.data),
		).resolves.not.toEqual(
			await resolveOAuthAccountKey(mobile, tokens, result.data),
		);
	});

	it.each([
		"",
		"   ",
		"undefined",
		"null",
		Number.NaN,
		Infinity,
		-Infinity,
	])("rejects the invalid account subject %j", async (accountSubject) => {
		await expect(
			resolveOAuthAccountKey(
				createProvider({ accountSubject: () => accountSubject }),
				tokens,
				result.data,
			),
		).rejects.toThrow("OAUTH_ACCOUNT_SUBJECT_INVALID");
	});

	it("does not expose mapped local-user fields to account-key resolvers", async () => {
		const accountSubject = vi.fn(({ profile }) => String(profile.subject));

		await resolveOAuthAccountKey(
			createProvider({ accountSubject }),
			tokens,
			result.data,
		);

		expect(accountSubject).toHaveBeenCalledWith({
			tokens,
			profile: result.data,
		});
		expect(accountSubject.mock.calls[0]?.[0]).not.toHaveProperty("user");
	});
});
