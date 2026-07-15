/**
 * @see https://github.com/better-auth/better-auth/issues/9375
 *
 * Reporter: in stateless mode (no `options.database`), the first-time
 * generic-oauth sign-in does not set the `account_data` cookie on the
 * callback response, causing a subsequent `/get-access-token` to fail
 * with `ACCOUNT_NOT_FOUND`. A second sign-in (after logout) works.
 *
 * The reporter notes the bug only reproduces against the published
 * package, not when linking source. This file lives under `/test/unit/`
 * because workspace deps resolve `better-auth` through the package's
 * `exports` map (built dist) — exercising the same artifact path.
 *
 * Targeted invariant: in stateless mode, the OAuth callback for a
 * brand-new user must emit a non-empty `account_data` cookie that
 * decodes to the freshly created account.
 */

import { createServer } from "node:http";
import { parseSetCookieHeader } from "better-auth/cookies";
import { symmetricDecodeJWT } from "better-auth/crypto";
import { genericOAuth } from "better-auth/plugins";
import { getTestInstance } from "better-auth/test";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const PROVIDER_ID = "test-stateless";
const CLIENT_ID = "test-client-id";
const CLIENT_SECRET = "test-client-secret";

const identityProvider = createServer((request, response) => {
	const responseBody =
		request.url === "/token"
			? {
					access_token: "test-access-token",
					refresh_token: "test-refresh-token",
					token_type: "Bearer",
					expires_in: 3600,
					scope: "openid email profile",
				}
			: request.url === "/userinfo"
				? {
						sub: "first-time-stateless-sub",
						email: "first-time-stateless@test.com",
						email_verified: true,
						name: "First Time Stateless",
					}
				: null;

	if (!responseBody) {
		response.writeHead(404);
		response.end();
		return;
	}

	response.writeHead(200, { "content-type": "application/json" });
	response.end(JSON.stringify(responseBody));
});

let identityProviderOrigin = "";

beforeAll(async () => {
	await new Promise<void>((resolve) => {
		identityProvider.listen(0, "127.0.0.1", resolve);
	});
	const address = identityProvider.address();
	if (!address || typeof address === "string") {
		throw new Error("Unable to determine the identity provider address");
	}
	identityProviderOrigin = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
	await new Promise<void>((resolve, reject) => {
		identityProvider.close((error) => (error ? reject(error) : resolve()));
	});
});

describe("stateless mode account_data cookie (issue #9375)", () => {
	it("emits a decodable account_data cookie on first-time OAuth callback", async () => {
		const { client, auth } = await getTestInstance({
			database: undefined,
			advanced: { useSecureCookies: true },
			plugins: [
				genericOAuth({
					config: [
						{
							providerId: PROVIDER_ID,
							authorizationUrl: `${identityProviderOrigin}/authorize`,
							tokenUrl: `${identityProviderOrigin}/token`,
							userInfoUrl: `${identityProviderOrigin}/userinfo`,
							identityIssuer: identityProviderOrigin,
							identitySubject: ({ profile }) => profile.sub ?? "",
							clientId: CLIENT_ID,
							clientSecret: CLIENT_SECRET,
							pkce: true,
						},
					],
				}),
			],
		});

		// Guard: the test is meaningless unless we're on the stateless path.
		// Stateless mode is `!options.database` (see create-context.ts), which
		// auto-enables `storeAccountCookie` and `cookieCache.strategy: "jwe"`.
		expect(auth.options.database).toBeUndefined();

		const ctx = await auth.$context;

		// 1. Initiate sign-in. The server returns the IdP authorize URL and
		//    emits state/PKCE cookies that must be forwarded to the callback.
		const sessionCookies = new Headers();
		const signInRes = await client.signIn.social({
			provider: PROVIDER_ID,
			callbackURL: "http://localhost:3000/dashboard",
			newUserCallbackURL: "http://localhost:3000/new_user",
			fetchOptions: {
				onSuccess(context) {
					const setCookie = context.response.headers.get("set-cookie");
					if (setCookie) sessionCookies.set("cookie", setCookie);
				},
			},
		});
		const state = new URL(signInRes.data?.url ?? "").searchParams.get("state");
		expect(state).toBeTruthy();

		// 2. Simulate the IdP redirect back to /callback/<provider>.
		//    better-fetch surfaces the 302 via onError; capture set-cookie there.
		let setCookieHeader = "";
		await client.$fetch(`/callback/${PROVIDER_ID}`, {
			query: { state, code: "test-auth-code" },
			headers: sessionCookies,
			method: "GET",
			onError(context) {
				expect(context.response.status).toBe(302);
				setCookieHeader = context.response.headers.get("set-cookie") ?? "";
			},
		});

		// 3. Core invariant: account_data must be present with a non-empty JWE
		//    payload that decodes to the freshly created account and identity.
		const cookies = parseSetCookieHeader(setCookieHeader);
		const accountDataCookie = cookies.get(ctx.authCookies.accountData.name);
		expect(accountDataCookie?.value).toMatch(/^ey/);

		await expect(
			symmetricDecodeJWT(
				accountDataCookie!.value,
				ctx.secret,
				"better-auth-account",
			),
		).resolves.toMatchObject({
			account: {
				providerId: PROVIDER_ID,
				accessToken: expect.any(String),
			},
			identity: {
				issuer: identityProviderOrigin,
				providerAccountId: "first-time-stateless-sub",
			},
		});
	});
});
