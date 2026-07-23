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
	it("uses a synthetic issuer for a provider without an issuer", async () => {
		await expect(
			resolveOAuthAccountKey(createProvider(), tokens, result.data),
		).resolves.toEqual({
			issuer: "local:oauth:company-oauth",
			providerAccountId: "provider-subject",
		});
	});

	it.each([
		["provider-subject", "provider-subject"],
		[42, "42"],
	] as const)("normalizes the account subject resolved from provider data %j", async (accountSubject, providerAccountId) => {
		await expect(
			resolveOAuthAccountKey(
				createProvider({ accountSubject: () => accountSubject }),
				tokens,
				result.data,
			),
		).resolves.toEqual({
			issuer: "local:oauth:company-oauth",
			providerAccountId,
		});
	});

	it("uses a static verified issuer", async () => {
		await expect(
			resolveOAuthAccountKey(
				createProvider({ accountIssuer: "https://idp.example.com" }),
				tokens,
				result.data,
			),
		).resolves.toEqual({
			issuer: "https://idp.example.com",
			providerAccountId: "provider-subject",
		});
	});

	it("resolves a tenant-specific issuer from verified provider data", async () => {
		const accountIssuer = vi.fn(
			({ profile }: { profile: Record<string, unknown> }) =>
				`https://login.example.com/${String(profile.tenant)}`,
		);

		await expect(
			resolveOAuthAccountKey(
				createProvider({ accountIssuer }),
				tokens,
				result.data,
			),
		).resolves.toEqual({
			issuer: "https://login.example.com/acme",
			providerAccountId: "provider-subject",
		});
		expect(accountIssuer).toHaveBeenCalledWith({
			tokens,
			profile: result.data,
		});
	});

	it("produces the same identity key for provider aliases of one issuer", async () => {
		const web = createProvider({
			id: "company-web",
			accountIssuer: "https://idp.example.com",
		});
		const mobile = createProvider({
			id: "company-mobile",
			accountIssuer: "https://idp.example.com",
		});

		await expect(
			resolveOAuthAccountKey(web, tokens, result.data),
		).resolves.toEqual(
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

	it("rejects an explicitly empty account issuer", async () => {
		await expect(
			resolveOAuthAccountKey(
				createProvider({ accountIssuer: " " }),
				tokens,
				result.data,
			),
		).rejects.toThrow("OAUTH_ACCOUNT_ISSUER_INVALID");
	});

	it.each([
		undefined,
		null,
		"undefined",
		"null",
		42,
	] as const)("rejects an invalid account issuer returned by a resolver: %j", async (issuer) => {
		await expect(
			resolveOAuthAccountKey(
				createProvider({
					accountIssuer: (() => issuer) as never,
				}),
				tokens,
				result.data,
			),
		).rejects.toThrow("OAUTH_ACCOUNT_ISSUER_INVALID");
	});
});
