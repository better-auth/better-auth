import type { OAuthProvider } from "@better-auth/core/oauth2";
import { describe, expect, it, vi } from "vitest";
import { resolveOAuthIdentityKey } from "./identity-key";

function createProvider(
	overrides: Partial<OAuthProvider<Record<string, unknown>>> = {},
): OAuthProvider<Record<string, unknown>> {
	return {
		id: "company-oauth",
		name: "Company OAuth",
		identitySubject: ({ profile }) => String(profile.subject),
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

describe("resolveOAuthIdentityKey", () => {
	it("uses a synthetic issuer for a provider without an issuer", async () => {
		await expect(
			resolveOAuthIdentityKey(createProvider(), tokens, result.data),
		).resolves.toEqual({
			issuer: "local:company-oauth",
			providerAccountId: "provider-subject",
		});
	});

	it.each([
		["provider-subject", "provider-subject"],
		[42, "42"],
	] as const)("normalizes the resolved identity subject %j", async (identitySubject, providerAccountId) => {
		await expect(
			resolveOAuthIdentityKey(
				createProvider({ identitySubject: () => identitySubject }),
				tokens,
				result.data,
			),
		).resolves.toEqual({
			issuer: "local:company-oauth",
			providerAccountId,
		});
	});

	it("uses a static verified issuer", async () => {
		await expect(
			resolveOAuthIdentityKey(
				createProvider({ identityIssuer: "https://idp.example.com" }),
				tokens,
				result.data,
			),
		).resolves.toEqual({
			issuer: "https://idp.example.com",
			providerAccountId: "provider-subject",
		});
	});

	it("resolves a tenant-specific issuer from verified provider data", async () => {
		const identityIssuer = vi.fn(
			({ profile }: { profile: Record<string, unknown> }) =>
				`https://login.example.com/${String(profile.tenant)}`,
		);

		await expect(
			resolveOAuthIdentityKey(
				createProvider({ identityIssuer }),
				tokens,
				result.data,
			),
		).resolves.toEqual({
			issuer: "https://login.example.com/acme",
			providerAccountId: "provider-subject",
		});
		expect(identityIssuer).toHaveBeenCalledWith({
			tokens,
			profile: result.data,
		});
	});

	it("produces the same identity key for provider aliases of one issuer", async () => {
		const web = createProvider({
			id: "company-web",
			identityIssuer: "https://idp.example.com",
		});
		const mobile = createProvider({
			id: "company-mobile",
			identityIssuer: "https://idp.example.com",
		});

		await expect(
			resolveOAuthIdentityKey(web, tokens, result.data),
		).resolves.toEqual(
			await resolveOAuthIdentityKey(mobile, tokens, result.data),
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
	])("rejects the invalid resolved identity subject %j", async (identitySubject) => {
		await expect(
			resolveOAuthIdentityKey(
				createProvider({ identitySubject: () => identitySubject }),
				tokens,
				result.data,
			),
		).rejects.toThrow("OAUTH_IDENTITY_SUBJECT_INVALID");
	});

	it("rejects a malformed static identity subject at runtime", async () => {
		const provider = createProvider({
			identitySubject: "provider-subject" as never,
		});

		await expect(
			resolveOAuthIdentityKey(provider, tokens, result.data),
		).rejects.toThrow("OAUTH_IDENTITY_SUBJECT_INVALID");
	});

	it("does not expose mapped local-user fields to identity-key resolvers", async () => {
		const identitySubject = vi.fn(({ profile }) => String(profile.subject));

		await resolveOAuthIdentityKey(
			createProvider({ identitySubject }),
			tokens,
			result.data,
		);

		expect(identitySubject).toHaveBeenCalledWith({
			tokens,
			profile: result.data,
		});
		expect(identitySubject.mock.calls[0]?.[0]).not.toHaveProperty("user");
	});

	it("rejects an explicitly empty identity issuer", async () => {
		await expect(
			resolveOAuthIdentityKey(
				createProvider({ identityIssuer: " " }),
				tokens,
				result.data,
			),
		).rejects.toThrow("OAUTH_IDENTITY_ISSUER_INVALID");
	});

	it.each([
		"undefined",
		"null",
		1,
		{},
	])("rejects malformed runtime identity issuer %j", async (identityIssuer) => {
		await expect(
			resolveOAuthIdentityKey(
				createProvider({ identityIssuer: identityIssuer as never }),
				tokens,
				result.data,
			),
		).rejects.toThrow("OAUTH_IDENTITY_ISSUER_INVALID");
	});
});
