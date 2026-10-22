import { UnsecuredJWT } from "jose";
import { afterEach, assertType, beforeEach, expect, it, vi } from "vitest";
import type { PaybinProfile } from "./paybin";
import { paybin } from "./paybin";

const options = { clientId: "provider-client", clientSecret: "secret" };
const endpoint = "https://idp.paybin.io/oauth/userinfo";
const profile = {
	sub: "provider-user",
	name: "Provider User",
	email: "user@example.com",
	email_verified: true,
	picture: "https://example.com/avatar.png",
} satisfies PaybinProfile;
const mockedFetch = vi.fn<typeof fetch>();
beforeEach(() => {
	mockedFetch.mockReset();
	mockedFetch.mockImplementation(async (input, init) => {
		const request = new Request(input, init);
		expect(request.url).toBe(endpoint);
		expect(request.headers.get("authorization")).toBe("Bearer access-token");
		return Response.json(profile);
	});
	vi.stubGlobal("fetch", mockedFetch);
});
afterEach(() => vi.unstubAllGlobals());

/**
 * @see https://idp.paybin.io/.well-known/openid-configuration
 */
it("reads the authenticated profile with only an access token", async () => {
	const result = await paybin(options).getUserInfo({
		accessToken: "access-token",
	});
	expect(result?.data).toEqual(profile);
	expect(result?.user).toEqual({
		name: "Provider User",
		email: profile.email,
		emailVerified: true,
		image: profile.picture,
	});
});

/**
 * @see https://openid.net/specs/openid-connect-core-1_0.html#UserInfo
 */
it("uses the access-token response instead of ID-token contents", async () => {
	const result = await paybin(options).getUserInfo({
		accessToken: "access-token",
		idToken: new UnsecuredJWT({
			sub: profile.sub,
			email: "ignored@example.com",
		}).encode(),
	});
	expect(result?.data).toEqual(profile);
});

/**
 * @see https://openid.net/specs/openid-connect-core-1_0.html#UserInfo
 */
it("requires an access token even when an ID token is supplied", async () => {
	expect(
		await paybin(options).getUserInfo({
			idToken: new UnsecuredJWT(profile).encode(),
		}),
	).toBeNull();
	expect(mockedFetch).not.toHaveBeenCalled();
});

it.each(["unauthorized", "empty"])(
	"rejects an %s profile response",
	async (kind) => {
		mockedFetch.mockImplementation(async () =>
			kind === "unauthorized"
				? new Response(null, { status: 401 })
				: Response.json({}),
		);
		expect(
			await paybin(options).getUserInfo({ accessToken: "access-token" }),
		).toBeNull();
	},
);

it("preserves a custom profile reader without requiring an access token", async () => {
	const custom = {
		user: { email: profile.email, emailVerified: false },
		data: profile,
	};
	const getUserInfo = vi.fn(async () => custom);
	const tokens = { idToken: "custom-id-token" };
	expect(await paybin({ ...options, getUserInfo }).getUserInfo(tokens)).toBe(
		custom,
	);
	expect(getUserInfo).toHaveBeenCalledWith(tokens);
	expect(mockedFetch).not.toHaveBeenCalled();
});

/**
 * @see https://idp.paybin.io/.well-known/openid-configuration
 */
it("lets profile mappings supply missing email access", async () => {
	mockedFetch.mockImplementation(async () =>
		Response.json({ sub: profile.sub }),
	);
	const result = await paybin({
		...options,
		mapProfileToUser: (claims) => ({ email: `${claims.sub}@example.com` }),
	}).getUserInfo({ accessToken: "access-token" });
	expect(result?.user.email).toBe("provider-user@example.com");
	expect(result?.user.emailVerified).toBe(false);
	assertType<PaybinProfile>({ sub: "provider-user" });
});

/**
 * @see https://idp.paybin.io/.well-known/openid-configuration
 */
it.each([
	"https://idp.paybin.io",
	"https://paybin.example.com/",
	"https://paybin.example.com/tenant",
])("uses discovery-style paths for issuer %s", async (issuer) => {
	const base = issuer.endsWith("/") ? issuer : `${issuer}/`;
	const provider = paybin({ ...options, issuer });
	const authorizationURL = await provider.createAuthorizationURL({
		state: "state",
		redirectURI: "https://example.com/callback",
		codeVerifier: "verifier",
	});
	expect(authorizationURL.origin + authorizationURL.pathname).toBe(
		new URL("oauth/authorize", base).href,
	);
	const grants: string[] = [];
	mockedFetch.mockImplementation(async (input, init) => {
		const request = new Request(input, init);
		if (request.url === new URL("oauth/token", base).href) {
			grants.push(
				new URLSearchParams(await request.text()).get("grant_type") ?? "",
			);
			return Response.json({
				access_token: "access-token",
				token_type: "Bearer",
			});
		}
		expect(request.url).toBe(new URL("oauth/userinfo", base).href);
		return Response.json(profile);
	});
	await provider.validateAuthorizationCode({
		code: "code",
		redirectURI: "https://example.com/callback",
		codeVerifier: "verifier",
	});
	await provider.refreshAccessToken("refresh-token");
	expect(grants).toEqual(["authorization_code", "refresh_token"]);
	expect(
		(await provider.getUserInfo({ accessToken: "access-token" }))?.data,
	).toEqual(profile);
});

/**
 * @see https://openid.net/specs/openid-connect-core-1_0.html#UserInfoResponse
 */
it.each([
	{ kind: "malformed", token: "invalid-id-token" },
	{
		kind: "mismatched",
		token: new UnsecuredJWT({ sub: "different-user" }).encode(),
	},
])("rejects a $kind supplied ID token", async ({ token }) => {
	expect(
		await paybin(options).getUserInfo({
			accessToken: "access-token",
			idToken: token,
		}),
	).toBeNull();
});
