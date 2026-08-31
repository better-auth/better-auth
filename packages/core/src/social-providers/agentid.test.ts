import type { JWK } from "jose";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@better-fetch/fetch", () => ({
	betterFetch: vi.fn(),
}));

import { betterFetch } from "@better-fetch/fetch";

import { verifyProviderIdToken } from "../oauth2";
import { agentid } from "./agentid";

const mockedBetterFetch = vi.mocked(betterFetch);

const ISSUER = "https://auth.agentid.com";
const TEST_TOKEN_ENDPOINT = "https://tokens.example.com";
const KID = "agentid-test-key";
const OPEN_CLIENT = { clientId: "https://example.com" };
const REGISTERED = {
	clientId: "5e050dea-00dd-48da-a6d5-241722e1b398",
	clientSecret: "acs_secret",
};

const SUB = "a91f2c8e43";

async function createSignedAgentIdToken({
	issuer = ISSUER,
	audience = OPEN_CLIENT.clientId,
	nonce,
	algorithm = "ES256",
}: {
	issuer?: string;
	audience?: string;
	nonce?: string;
	algorithm?: "ES256" | "RS256";
} = {}) {
	const { publicKey, privateKey } = await generateKeyPair(algorithm, {
		extractable: true,
	});
	const publicJWK = await exportJWK(publicKey);
	publicJWK.kid = KID;
	publicJWK.alg = algorithm;
	publicJWK.use = "sig";

	const token = await new SignJWT({
		sub: SUB,
		email: "support@acme.agentmail.to",
		email_verified: true,
		...(nonce ? { nonce } : {}),
	})
		.setProtectedHeader({ alg: algorithm, kid: KID })
		.setIssuer(issuer)
		.setAudience(audience)
		.setIssuedAt()
		.setExpirationTime("1h")
		.sign(privateKey);

	return { publicJWK, token };
}

function jsonResponse(data: unknown) {
	return new Response(JSON.stringify(data), {
		status: 200,
		headers: { "content-type": "application/json" },
	});
}

function mockJwks(publicJWK: JWK) {
	vi.stubGlobal(
		"fetch",
		vi.fn().mockResolvedValue(jsonResponse({ keys: [publicJWK] })),
	);
}

function mockTokenExchange(idToken: string, publicJWK: JWK) {
	mockedBetterFetch.mockResolvedValueOnce({
		data: {
			access_token: "access-token",
			id_token: idToken,
			token_type: "Bearer",
		},
		error: null,
	} as Awaited<ReturnType<typeof betterFetch>>);
	vi.stubGlobal(
		"fetch",
		vi.fn().mockResolvedValue(jsonResponse({ keys: [publicJWK] })),
	);
}

afterEach(() => {
	mockedBetterFetch.mockReset();
	vi.unstubAllGlobals();
});

/** An unsigned JWT; `getUserInfo` decodes rather than verifies. */
function idToken(claims: Record<string, unknown>) {
	const part = (value: unknown) =>
		Buffer.from(JSON.stringify(value)).toString("base64url");
	return `${part({ alg: "ES256", typ: "JWT" })}.${part(claims)}.signature`;
}

const baseClaims = {
	iss: "https://auth.agentid.com",
	sub: SUB,
	aud: "https://example.com",
	exp: 1767225600,
	iat: 1767225000,
	email: "support@acme.agentmail.to",
	email_verified: true,
};

function userinfoResponse(profile: Record<string, unknown>) {
	return { data: profile, error: null } as Awaited<
		ReturnType<typeof betterFetch>
	>;
}

describe("agentid.createAuthorizationURL", () => {
	it("always sends S256 PKCE", async () => {
		const url = await agentid(OPEN_CLIENT).createAuthorizationURL({
			state: "state",
			codeVerifier: "verifier",
			redirectURI: "https://example.com/callback",
		});
		expect(url.searchParams.get("code_challenge_method")).toBe("S256");
		expect(url.searchParams.get("code_challenge")).toBeTruthy();
	});

	it("sends S256 PKCE for a registered client", async () => {
		const url = await agentid(REGISTERED).createAuthorizationURL({
			state: "state",
			codeVerifier: "verifier",
			redirectURI: "https://example.com/callback",
		});
		expect(url.searchParams.get("code_challenge_method")).toBe("S256");
	});

	it("defaults to openid and email scopes", async () => {
		const url = await agentid(OPEN_CLIENT).createAuthorizationURL({
			state: "state",
			codeVerifier: "verifier",
			redirectURI: "https://example.com/callback",
		});
		expect(url.searchParams.get("scope")).toBe("openid email");
	});

	it("includes configured scopes", async () => {
		const url = await agentid({
			...REGISTERED,
			scope: ["profile", "owner_email"],
		}).createAuthorizationURL({
			state: "state",
			codeVerifier: "verifier",
			redirectURI: "https://example.com/callback",
		});
		expect(url.searchParams.get("scope")).toBe(
			"openid email profile owner_email",
		);
	});

	it("deduplicates configured and request-time scopes", async () => {
		const url = await agentid({
			...REGISTERED,
			scope: ["openid", "owner_email"],
		}).createAuthorizationURL({
			state: "state",
			codeVerifier: "verifier",
			redirectURI: "https://example.com/callback",
			scopes: ["email", "owner_email"],
		});
		expect(url.searchParams.get("scope")).toBe("openid email owner_email");
	});
});

describe("agentid.validateAuthorizationCode", () => {
	it("accepts a code exchange with a valid ID token", async () => {
		const { publicJWK, token } = await createSignedAgentIdToken();
		mockTokenExchange(token, publicJWK);

		const tokens = await agentid({
			...OPEN_CLIENT,
			tokenEndpoint: TEST_TOKEN_ENDPOINT,
		}).validateAuthorizationCode({
			code: "code",
			codeVerifier: "verifier",
			redirectURI: "https://example.com/callback",
		});

		expect(tokens?.idToken).toBe(token);
	});

	it("rejects a code exchange with an invalid ID token", async () => {
		const { publicJWK, token } = await createSignedAgentIdToken({
			audience: "another-client",
		});
		mockTokenExchange(token, publicJWK);

		const tokens = await agentid({
			...OPEN_CLIENT,
			tokenEndpoint: TEST_TOKEN_ENDPOINT,
		}).validateAuthorizationCode({
			code: "code",
			codeVerifier: "verifier",
			redirectURI: "https://example.com/callback",
		});

		expect(tokens).toBeNull();
	});

	it("uses a configured ID token verifier for the code exchange", async () => {
		const { publicJWK, token } = await createSignedAgentIdToken({
			audience: "custom-audience",
		});
		mockTokenExchange(token, publicJWK);
		const verifyIdToken = vi.fn().mockResolvedValue(true);

		const tokens = await agentid({
			...OPEN_CLIENT,
			tokenEndpoint: TEST_TOKEN_ENDPOINT,
			verifyIdToken,
		}).validateAuthorizationCode({
			code: "code",
			codeVerifier: "verifier",
			redirectURI: "https://example.com/callback",
		});

		expect(tokens?.idToken).toBe(token);
		expect(verifyIdToken).toHaveBeenCalledWith(token, undefined, undefined);
	});

	it("rejects the code exchange when a configured verifier rejects it", async () => {
		const { publicJWK, token } = await createSignedAgentIdToken();
		mockTokenExchange(token, publicJWK);
		const verifyIdToken = vi.fn().mockResolvedValue(false);

		const tokens = await agentid({
			...OPEN_CLIENT,
			tokenEndpoint: TEST_TOKEN_ENDPOINT,
			verifyIdToken,
		}).validateAuthorizationCode({
			code: "code",
			codeVerifier: "verifier",
			redirectURI: "https://example.com/callback",
		});

		expect(tokens).toBeNull();
		expect(verifyIdToken).toHaveBeenCalledWith(token, undefined, undefined);
	});
});

describe("agentid ID token verification", () => {
	it("accepts a valid ES256 token", async () => {
		const { publicJWK, token } = await createSignedAgentIdToken();
		mockJwks(publicJWK);

		await expect(
			verifyProviderIdToken(agentid(OPEN_CLIENT), token, undefined),
		).resolves.toBe(true);
	});

	it("rejects a token with an invalid signature", async () => {
		const { token } = await createSignedAgentIdToken();
		const { publicJWK } = await createSignedAgentIdToken();
		mockJwks(publicJWK);

		await expect(
			verifyProviderIdToken(agentid(OPEN_CLIENT), token, undefined),
		).resolves.toBe(false);
	});

	it("rejects a token from another issuer", async () => {
		const { publicJWK, token } = await createSignedAgentIdToken({
			issuer: "https://issuer.example.com",
		});
		mockJwks(publicJWK);

		await expect(
			verifyProviderIdToken(agentid(OPEN_CLIENT), token, undefined),
		).resolves.toBe(false);
	});

	it("rejects a token for another audience", async () => {
		const { publicJWK, token } = await createSignedAgentIdToken({
			audience: "another-client",
		});
		mockJwks(publicJWK);

		await expect(
			verifyProviderIdToken(agentid(OPEN_CLIENT), token, undefined),
		).resolves.toBe(false);
	});

	it("rejects a token signed with another algorithm", async () => {
		const { publicJWK, token } = await createSignedAgentIdToken({
			algorithm: "RS256",
		});
		mockJwks(publicJWK);

		await expect(
			verifyProviderIdToken(agentid(OPEN_CLIENT), token, undefined),
		).resolves.toBe(false);
	});

	it("rejects a token with a different nonce", async () => {
		const { publicJWK, token } = await createSignedAgentIdToken({
			nonce: "expected-nonce",
		});
		mockJwks(publicJWK);

		await expect(
			verifyProviderIdToken(agentid(OPEN_CLIENT), token, "different-nonce"),
		).resolves.toBe(false);
	});
});

describe("agentid.getUserInfo", () => {
	beforeEach(() => {
		mockedBetterFetch.mockReset();
	});

	it("builds the user from the ID token", async () => {
		const res = await agentid(OPEN_CLIENT).getUserInfo({
			idToken: idToken({ ...baseClaims, name: "Acme Support" }),
		});

		expect(res?.user).toMatchObject({
			name: "Acme Support",
			email: "support@acme.agentmail.to",
			emailVerified: true,
		});
	});

	it("prefers the ID token name over the fallback", async () => {
		const res = await agentid(OPEN_CLIENT).getUserInfo({
			idToken: idToken({ ...baseClaims, name: "Acme Support" }),
		});

		expect(res?.user.name).toBe("Acme Support");
	});

	it("falls back to the inbox local part when AgentID sends none", async () => {
		const res = await agentid(OPEN_CLIENT).getUserInfo({
			idToken: idToken(baseClaims),
		});

		expect(res?.user.name).toBe("support");
	});

	it("falls back for an empty-string name too", async () => {
		const res = await agentid(OPEN_CLIENT).getUserInfo({
			idToken: idToken({ ...baseClaims, name: "" }),
		});

		expect(res?.user.name).toBe("support");
	});

	it("treats an absent email_verified as unverified, not verified", async () => {
		const { email_verified: _, ...withoutVerified } = baseClaims;
		const res = await agentid(OPEN_CLIENT).getUserInfo({
			idToken: idToken(withoutVerified),
		});

		expect(res?.user.emailVerified).toBe(false);
	});

	it("does not call UserInfo without an access token", async () => {
		await agentid(OPEN_CLIENT).getUserInfo({
			idToken: idToken(baseClaims),
		});

		expect(mockedBetterFetch).not.toHaveBeenCalled();
	});

	it("fetches owner claims when the token response omits request-time scopes", async () => {
		mockedBetterFetch.mockResolvedValue(
			userinfoResponse({
				sub: SUB,
				owner_name: "Maya Chen",
				owner_email: "maya@acme.com",
			}),
		);
		const res = await agentid(REGISTERED).getUserInfo({
			idToken: idToken(baseClaims),
			accessToken: "access-token",
		});

		expect(mockedBetterFetch).toHaveBeenCalledOnce();
		expect(res?.data.owner_name).toBe("Maya Chen");
		expect(res?.data.owner_email).toBe("maya@acme.com");
	});

	it("ignores UserInfo with a different subject", async () => {
		// OIDC Core §5.3.2 prevents access-token substitution here.
		mockedBetterFetch.mockResolvedValue(
			userinfoResponse({
				sub: "someone-else",
				owner_name: "Not Theirs",
				owner_email: "attacker@example.com",
			}),
		);
		const res = await agentid({
			...REGISTERED,
			scope: ["owner_email"],
		}).getUserInfo({
			idToken: idToken(baseClaims),
			accessToken: "access-token",
		});

		expect(res?.data.sub).toBe(SUB);
		expect(res?.data.owner_name).toBeUndefined();
		expect(res?.data.owner_email).toBeUndefined();
	});

	it("continues sign-in when UserInfo is unavailable", async () => {
		mockedBetterFetch.mockRejectedValue(new Error("socket hang up"));
		const res = await agentid({
			...REGISTERED,
			scope: ["owner_email"],
		}).getUserInfo({
			idToken: idToken(baseClaims),
			accessToken: "access-token",
		});

		expect(res?.data.sub).toBe(SUB);
		expect(res?.data.owner_email).toBeUndefined();
	});

	it("returns null for a malformed ID token", async () => {
		const res = await agentid(OPEN_CLIENT).getUserInfo({
			idToken: "not-a-jwt",
		});

		expect(res).toBeNull();
	});

	it("maps owner claims with mapProfileToUser", async () => {
		mockedBetterFetch.mockResolvedValue(
			userinfoResponse({ sub: SUB, owner_email: "maya@acme.com" }),
		);
		const res = await agentid({
			...REGISTERED,
			scope: ["owner_email"],
			mapProfileToUser: (profile) => ({ ownerEmail: profile.owner_email }),
		}).getUserInfo({
			idToken: idToken(baseClaims),
			accessToken: "access-token",
		});

		expect((res?.user as Record<string, unknown>).ownerEmail).toBe(
			"maya@acme.com",
		);
	});
});
