import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@better-fetch/fetch", () => ({
	betterFetch: vi.fn(),
}));

import { betterFetch } from "@better-fetch/fetch";

import { agentid } from "./agentid";

const mockedBetterFetch = vi.mocked(betterFetch);

const OPEN_CLIENT = { clientId: "https://example.com" };
const REGISTERED = {
	clientId: "5e050dea-00dd-48da-a6d5-241722e1b398",
	clientSecret: "acs_secret",
};

const SUB = "a91f2c8e43";

/** An unsigned JWT — `getUserInfo` decodes rather than verifies. */
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
	it("always sends PKCE, which AgentID requires, and only S256", async () => {
		// There is no option to turn this off, because there is no configuration
		// in which omitting it works: AgentID refuses the authorization request.
		const url = await agentid(OPEN_CLIENT).createAuthorizationURL({
			state: "state",
			codeVerifier: "verifier",
			redirectURI: "https://example.com/callback",
		});
		expect(url.searchParams.get("code_challenge_method")).toBe("S256");
		expect(url.searchParams.get("code_challenge")).toBeTruthy();
	});

	it("sends PKCE for a registered client too", async () => {
		// Confidential clients are not exempt — a client secret authenticates the
		// client, PKCE binds the code, and AgentID asks for both.
		const url = await agentid(REGISTERED).createAuthorizationURL({
			state: "state",
			codeVerifier: "verifier",
			redirectURI: "https://example.com/callback",
		});
		expect(url.searchParams.get("code_challenge_method")).toBe("S256");
	});

	it("defaults to the pair an unregistered client is entitled to", async () => {
		const url = await agentid(OPEN_CLIENT).createAuthorizationURL({
			state: "state",
			codeVerifier: "verifier",
			redirectURI: "https://example.com/callback",
		});
		expect(url.searchParams.get("scope")).toBe("openid email");
	});

	it("carries the extra scopes a registered client asks for", async () => {
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
});

describe("agentid.getUserInfo", () => {
	beforeEach(() => {
		mockedBetterFetch.mockReset();
	});

	it("builds the user from the id_token", async () => {
		const res = await agentid(OPEN_CLIENT).getUserInfo({
			idToken: idToken({ ...baseClaims, name: "Acme Support" }),
		} as any);

		expect(res?.user).toMatchObject({
			id: SUB,
			name: "Acme Support",
			email: "support@acme.agentmail.to",
			emailVerified: true,
		});
	});

	it("prefers a name AgentID sent over the fallback", async () => {
		// The fallback is a floor, not an override — once the issuer serves a
		// name to a tier it did not before, that name has to win without any
		// change here.
		const res = await agentid(OPEN_CLIENT).getUserInfo({
			idToken: idToken({ ...baseClaims, name: "Acme Support" }),
		} as any);

		expect(res?.user.name).toBe("Acme Support");
	});

	it("falls back to the inbox local part when AgentID sends none", async () => {
		// `user.name` is required by the schema, so without this substitution the
		// sign-in dies on a NOT NULL constraint — a raw database error rather
		// than an OAuth one.
		const res = await agentid(OPEN_CLIENT).getUserInfo({
			idToken: idToken(baseClaims),
		} as any);

		expect(res?.user.name).toBe("support");
	});

	it("falls back for an empty-string name too", async () => {
		const res = await agentid(OPEN_CLIENT).getUserInfo({
			idToken: idToken({ ...baseClaims, name: "" }),
		} as any);

		expect(res?.user.name).toBe("support");
	});

	it("treats an absent email_verified as unverified, not verified", async () => {
		const { email_verified: _, ...withoutVerified } = baseClaims;
		const res = await agentid(OPEN_CLIENT).getUserInfo({
			idToken: idToken(withoutVerified),
		} as any);

		expect(res?.user.emailVerified).toBe(false);
	});

	it("does not call userinfo when no owner scope was requested", async () => {
		await agentid(OPEN_CLIENT).getUserInfo({
			idToken: idToken(baseClaims),
			accessToken: "access-token",
		} as any);

		expect(mockedBetterFetch).not.toHaveBeenCalled();
	});

	it("merges the owner claims, which no id_token can carry", async () => {
		mockedBetterFetch.mockResolvedValue(
			userinfoResponse({
				sub: SUB,
				owner_name: "Maya Chen",
				owner_email: "maya@acme.com",
			}),
		);
		const res = await agentid({
			...REGISTERED,
			scope: ["owner_profile", "owner_email"],
		}).getUserInfo({
			idToken: idToken(baseClaims),
			accessToken: "access-token",
		} as any);

		expect(mockedBetterFetch).toHaveBeenCalledOnce();
		expect(res?.data.owner_name).toBe("Maya Chen");
		expect(res?.data.owner_email).toBe("maya@acme.com");
	});

	it("discards a userinfo response for a different subject", async () => {
		// OIDC Core § 5.3.2. Otherwise a substituted access token attaches
		// another subject's owner identity to this signed-in user.
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
		} as any);

		expect(res?.user.id).toBe(SUB);
		expect(res?.data.owner_name).toBeUndefined();
		expect(res?.data.owner_email).toBeUndefined();
	});

	it("still signs in when userinfo is unreachable", async () => {
		// The agent has already approved by this point; an owner claim that did
		// not arrive is not worth the session.
		mockedBetterFetch.mockRejectedValue(new Error("socket hang up"));
		const res = await agentid({
			...REGISTERED,
			scope: ["owner_email"],
		}).getUserInfo({
			idToken: idToken(baseClaims),
			accessToken: "access-token",
		} as any);

		expect(res?.user.id).toBe(SUB);
		expect(res?.data.owner_email).toBeUndefined();
	});

	it("returns null rather than throwing on a malformed id_token", async () => {
		const res = await agentid(OPEN_CLIENT).getUserInfo({
			idToken: "not-a-jwt",
		} as any);

		expect(res).toBeNull();
	});

	it("lets mapProfileToUser lift the owner claims onto the user", async () => {
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
		} as any);

		expect((res?.user as Record<string, unknown>).ownerEmail).toBe(
			"maya@acme.com",
		);
	});
});
