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
		expect(["GET", "POST"]).toContain(request.method);
		expect(request.headers.get("authorization")).toBe("Bearer access-token");
		return Response.json(profile);
	});
	vi.stubGlobal("fetch", mockedFetch);
});
afterEach(() => vi.unstubAllGlobals());

/**
 * @see https://idp.paybin.io/.well-known/openid-configuration
 * @see https://openid.net/specs/openid-connect-core-1_0.html#RefreshTokenResponse
 */
it.each([
	{ kind: "only an access token", idToken: undefined },
	{
		kind: "an expired stored ID token",
		idToken: new UnsecuredJWT({
			sub: profile.sub,
			email: "stale@example.com",
			exp: 0,
		}).encode(),
	},
])("reads the current profile with $kind", async ({ idToken }) => {
	const result = await paybin(options).getUserInfo({
		accessToken: "access-token",
		idToken,
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
	{
		issuer: "https://idp.paybin.io",
		authorizationEndpoint: "https://idp.paybin.io/oauth/authorize",
		tokenEndpoint: "https://idp.paybin.io/oauth/token",
		userinfoEndpoint: "https://idp.paybin.io/oauth/userinfo",
	},
	{
		issuer: "https://paybin.example.com/tenant/",
		authorizationEndpoint: "https://paybin.example.com/tenant/oauth/authorize",
		tokenEndpoint: "https://paybin.example.com/tenant/oauth/token",
		userinfoEndpoint: "https://paybin.example.com/tenant/oauth/userinfo",
	},
])(
	"uses the configured issuer endpoints for $issuer",
	async ({
		issuer,
		authorizationEndpoint,
		tokenEndpoint,
		userinfoEndpoint,
	}) => {
		const provider = paybin({ ...options, issuer });
		const codeVerifier = "v".repeat(64);
		const authorizationURL = await provider.createAuthorizationURL({
			state: "state",
			redirectURI: "https://example.com/callback",
			codeVerifier,
		});
		expect(authorizationURL.origin + authorizationURL.pathname).toBe(
			authorizationEndpoint,
		);
		mockedFetch.mockImplementation(async (input, init) => {
			const request = new Request(input, init);
			if (request.url === tokenEndpoint) {
				expect(request.method).toBe("POST");
				return Response.json({
					access_token: "access-token",
					token_type: "Bearer",
				});
			}
			expect(request.url).toBe(userinfoEndpoint);
			expect(["GET", "POST"]).toContain(request.method);
			return Response.json(profile);
		});
		expect(
			await provider.validateAuthorizationCode({
				code: "code",
				redirectURI: "https://example.com/callback",
				codeVerifier,
			}),
		).toMatchObject({ accessToken: "access-token" });
		expect(await provider.refreshAccessToken("refresh-token")).toMatchObject({
			accessToken: "access-token",
		});
		expect(
			(await provider.getUserInfo({ accessToken: "access-token" }))?.data,
		).toEqual(profile);
	},
);

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
