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

import { genericOAuthClient } from "better-auth/client/plugins";
import { parseSetCookieHeader } from "better-auth/cookies";
import { symmetricDecodeJWT } from "better-auth/crypto";
import { genericOAuth } from "better-auth/plugins";
import { getTestInstance } from "better-auth/test";
import type { Dispatcher } from "undici";
import { getGlobalDispatcher, MockAgent, setGlobalDispatcher } from "undici";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const IDP_ORIGIN = "https://idp.example.test";
const PROVIDER_ID = "test-stateless";
const CLIENT_ID = "test-client-id";
const CLIENT_SECRET = "test-client-secret";

function mockIdp(agent: MockAgent) {
	const pool = agent.get(IDP_ORIGIN);
	const json = { headers: { "content-type": "application/json" } };

	pool
		.intercept({ path: "/.well-known/openid-configuration", method: "GET" })
		.reply(
			200,
			{
				issuer: IDP_ORIGIN,
				authorization_endpoint: `${IDP_ORIGIN}/authorize`,
				token_endpoint: `${IDP_ORIGIN}/token`,
				userinfo_endpoint: `${IDP_ORIGIN}/userinfo`,
				jwks_uri: `${IDP_ORIGIN}/jwks`,
				response_types_supported: ["code"],
				subject_types_supported: ["public"],
				id_token_signing_alg_values_supported: ["RS256"],
			},
			json,
		)
		.persist();

	pool
		.intercept({ path: "/token", method: "POST" })
		.reply(
			200,
			{
				access_token: "test-access-token",
				refresh_token: "test-refresh-token",
				token_type: "Bearer",
				expires_in: 3600,
				scope: "openid email profile",
			},
			json,
		)
		.persist();

	pool
		.intercept({ path: "/userinfo", method: "GET" })
		.reply(
			200,
			{
				sub: "first-time-stateless-sub",
				email: "first-time-stateless@test.com",
				email_verified: true,
				name: "First Time Stateless",
			},
			json,
		)
		.persist();
}

describe("stateless mode account_data cookie (issue #9375)", () => {
	let originalDispatcher: Dispatcher;
	let mockAgent: MockAgent;

	beforeEach(() => {
		originalDispatcher = getGlobalDispatcher();
		mockAgent = new MockAgent();
		mockAgent.disableNetConnect();
		setGlobalDispatcher(mockAgent);
		mockIdp(mockAgent);
	});

	afterEach(async () => {
		await mockAgent.close();
		setGlobalDispatcher(originalDispatcher);
	});

	it("emits a decodable account_data cookie on first-time OAuth callback", async () => {
		const { client, auth } = await getTestInstance(
			{
				database: undefined,
				advanced: { useSecureCookies: true },
				plugins: [
					genericOAuth({
						config: [
							{
								providerId: PROVIDER_ID,
								discoveryUrl: `${IDP_ORIGIN}/.well-known/openid-configuration`,
								clientId: CLIENT_ID,
								clientSecret: CLIENT_SECRET,
								pkce: true,
							},
						],
					}),
				],
			},
			{ clientOptions: { plugins: [genericOAuthClient()] } },
		);

		// Guard: the test is meaningless unless we're on the stateless path.
		// Stateless mode is `!options.database` (see create-context.ts), which
		// auto-enables `storeAccountCookie` and `cookieCache.strategy: "jwe"`.
		expect(auth.options.database).toBeUndefined();

		const ctx = await auth.$context;

		// 1. Initiate sign-in. The server returns the IdP authorize URL and
		//    emits state/PKCE cookies that must be forwarded to the callback.
		const sessionCookies = new Headers();
		const signInRes = await client.signIn.oauth2(
			{
				providerId: PROVIDER_ID,
				callbackURL: "http://localhost:3000/dashboard",
				newUserCallbackURL: "http://localhost:3000/new_user",
			},
			{
				onSuccess(context) {
					const setCookie = context.response.headers.get("set-cookie");
					if (setCookie) sessionCookies.set("cookie", setCookie);
				},
			},
		);
		const state = new URL(signInRes.data?.url ?? "").searchParams.get("state");
		expect(state).toBeTruthy();

		// 2. Simulate the IdP redirect back to /oauth2/callback/<provider>.
		//    better-fetch surfaces the 302 via onError; capture set-cookie there.
		let setCookieHeader = "";
		await client.$fetch(`/oauth2/callback/${PROVIDER_ID}`, {
			query: { state, code: "test-auth-code" },
			headers: sessionCookies,
			method: "GET",
			onError(context) {
				expect(context.response.status).toBe(302);
				setCookieHeader = context.response.headers.get("set-cookie") ?? "";
			},
		});

		// 3. Core invariant: account_data must be present with a non-empty JWE
		//    payload that decodes to the freshly created account.
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
			providerId: PROVIDER_ID,
			accessToken: expect.any(String),
		});
	});
});
