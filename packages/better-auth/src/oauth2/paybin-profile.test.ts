import { getTestInstance } from "better-auth/test";
import { generateKeyPair, jwtVerify, SignJWT } from "jose";
import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, assert, beforeAll, expect, it } from "vitest";

const providerId = "paybin" as const;
const issuer = "https://idp.paybin.io";
const tokenEndpoint = "https://idp.paybin.io/oauth/token";
const profileEndpoint = "https://idp.paybin.io/oauth/userinfo";
const clientId = "profile-client";
const profile = {
	sub: "provider-user",
	name: "Provider User",
	email: "user@example.com",
	email_verified: true,
	picture: "https://example.com/avatar.png",
};
const { publicKey, privateKey } = await generateKeyPair("RS256");
const server = setupServer(
	http.get(profileEndpoint, () => HttpResponse.json(profile)),
);
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

async function createIdToken(expiresAt: number) {
	return new SignJWT({
		sub: profile.sub,
		email: "id-token@example.com",
		email_verified: true,
	})
		.setProtectedHeader({ alg: "RS256" })
		.setIssuer(issuer)
		.setAudience(clientId)
		.setIssuedAt(Math.floor(Date.now() / 1000) - 3600)
		.setExpirationTime(expiresAt)
		.sign(privateKey);
}

/**
 * @see https://openid.net/specs/openid-connect-core-1_0.html#UserInfoResponse
 * @see https://idp.paybin.io/.well-known/openid-configuration
 */
it.each([
	{ includeAccessToken: true, matchingSubject: true, accepted: true },
	{ includeAccessToken: false, matchingSubject: true, accepted: false },
	{ includeAccessToken: true, matchingSubject: false, accepted: false },
])(
	"ID-token sign-in with accessToken=$includeAccessToken and matching subject=$matchingSubject",
	async ({ includeAccessToken, matchingSubject, accepted }) => {
		if (!matchingSubject) {
			server.use(
				http.get(profileEndpoint, () =>
					HttpResponse.json({
						...profile,
						sub: "different-user",
						email: "different@example.com",
					}),
				),
			);
		}
		const { auth } = await getTestInstance({
			socialProviders: {
				[providerId]: {
					clientId,
					clientSecret: "secret",
					async verifyIdToken(token) {
						try {
							await jwtVerify(token, publicKey, { issuer, audience: clientId });
							return true;
						} catch {
							return false;
						}
					},
				},
			},
		});
		const response = auth.api.signInSocial({
			body: {
				provider: providerId,
				idToken: {
					token: await createIdToken(Math.floor(Date.now() / 1000) + 3600),
					...(includeAccessToken ? { accessToken: "access-token" } : {}),
				},
			},
		});
		if (accepted) {
			const result = await response;
			assert("user" in result);
			expect(result.user.email).toBe(profile.email);
		} else
			await expect(response).rejects.toMatchObject({
				body: { code: "FAILED_TO_GET_USER_INFO" },
			});
	},
);

/**
 * @see https://openid.net/specs/openid-connect-core-1_0.html#RefreshTokenResponse
 */
it("reads account info after refresh omits a replacement ID token", async () => {
	server.use(
		http.post(tokenEndpoint, async ({ request }) => {
			const body = new URLSearchParams(await request.text());
			expect(body.get("grant_type")).toBe("refresh_token");
			expect(body.get("refresh_token")).toBe("old-refresh-token");
			return HttpResponse.json({
				access_token: "refreshed-access-token",
				token_type: "Bearer",
				expires_in: 3600,
			});
		}),
		http.get(profileEndpoint, ({ request }) => {
			expect(request.headers.get("authorization")).toBe(
				"Bearer refreshed-access-token",
			);
			return HttpResponse.json(profile);
		}),
	);
	const { auth } = await getTestInstance({
		socialProviders: { [providerId]: { clientId, clientSecret: "secret" } },
		account: { encryptOAuthTokens: false },
	});
	const ctx = await auth.$context;
	const user = await ctx.internalAdapter.createUser(
		{ name: "Stored User", email: profile.email },
		{ method: "test" },
	);
	const account = await ctx.internalAdapter.createAccount({
		userId: user.id,
		providerId,
		accountId: profile.sub,
		accessToken: "old-access-token",
		refreshToken: "old-refresh-token",
		accessTokenExpiresAt: new Date(Date.now() - 60000),
		idToken: await createIdToken(Math.floor(Date.now() / 1000) - 120),
	});
	const result = await auth.api.accountInfo({
		query: { accountId: account.id, userId: user.id },
	});

	expect(result.user.email).toBe(profile.email);
	expect(result.data).toEqual(profile);
	expect(result.account).toEqual({
		id: account.id,
		providerId,
		accountId: profile.sub,
	});
});
