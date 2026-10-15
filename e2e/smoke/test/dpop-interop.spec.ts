import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { DatabaseSync } from "node:sqlite";
import type { TestContext } from "node:test";
import { describe, it } from "node:test";
import { oauthProvider } from "@better-auth/oauth-provider";
import type { BetterAuthOptions } from "better-auth";
import { betterAuth } from "better-auth";
import { getMigrations } from "better-auth/db/migration";
import { toNodeHandler } from "better-auth/node";
import { jwt } from "better-auth/plugins/jwt";
import * as oauth from "oauth4webapi";

/**
 * An independent client library builds every DPoP proof, deriving `htu` from
 * the URL it actually requests, so the server's expected `htu` is checked
 * against real client behavior rather than constants written by the test.
 *
 * @see https://datatracker.ietf.org/doc/html/rfc9449#section-4.3
 */
type ServerSetup = {
	name: string;
	/** Public origin clients call; defaults to the local server's origin. */
	publicOrigin?: string;
	/** Path appended to the origin to form `baseURL`. */
	baseURLPath?: string;
	options?: Pick<BetterAuthOptions, "basePath" | "advanced">;
	/** Whether the client calls the token and UserInfo endpoints with a trailing slash. */
	trailingSlash?: boolean /** Known failure: the test still runs, but does not fail the suite. */;
	todo?: string;
};

const setups: ServerSetup[] = [
	{ name: "default config" },
	{
		name: "baseURL with a trailing slash",
		baseURLPath: "/api/auth/",
		todo: "discovery metadata advertises `/api/auth//oauth2/...` endpoints, which return 404",
	},
	{ name: "custom basePath", options: { basePath: "/auth" } },
	{
		name: "skipTrailingSlashes with trailing-slash endpoint URLs",
		options: { advanced: { skipTrailingSlashes: true } },
		trailingSlash: true,
	},
	{
		name: "proxy that rewrites the request host",
		publicOrigin: "https://auth.example.test",
	},
];

const redirectUri = "https://client.example.test/callback";

async function startAuthServer(setup: ServerSetup, t: TestContext) {
	// Listen before building auth, which needs the port for `baseURL`.
	let handler: ReturnType<typeof toNodeHandler> | undefined;
	const server = createServer((req, res) => handler!(req, res));
	server.listen(0);
	// Registered now, so a setup failure below still closes the server.
	t.after(() => server.close());
	await once(server, "listening");
	const port = (server.address() as AddressInfo).port;

	const serverOrigin = `http://localhost:${port}`;
	const publicOrigin = setup.publicOrigin ?? serverOrigin;
	const auth = betterAuth({
		baseURL: `${publicOrigin}${setup.baseURLPath ?? ""}`,
		secret: "smoke-test-secret-that-is-long-enough-for-validation",
		database: new DatabaseSync(":memory:"),
		emailAndPassword: { enabled: true },
		...setup.options,
		plugins: [
			jwt(),
			oauthProvider({
				loginPage: "/login",
				consentPage: "/consent",
				scopes: ["openid", "profile", "email", "offline_access"],
			}),
		],
	});
	const { runMigrations } = await getMigrations(auth.options);
	await runMigrations();

	handler = toNodeHandler(auth.handler);

	// The proxy: requests leave for the public URL and reach the local server.
	const toServerUrl = (url: string) =>
		url.startsWith(publicOrigin)
			? `${serverOrigin}${url.slice(publicOrigin.length)}`
			: url;
	const proxyFetch = (url: string, init: RequestInit) =>
		fetch(toServerUrl(url), init);

	return { auth, publicOrigin, toServerUrl, proxyFetch };
}

describe("DPoP interop with an independent OAuth client", () => {
	for (const setup of setups) {
		it(`accepts the client's DPoP proofs at the token and UserInfo endpoints: ${setup.name}`, {
			todo: setup.todo,
		}, async (t) => {
			const { auth, publicOrigin, toServerUrl, proxyFetch } =
				await startAuthServer(setup, t);

			const signUp = await auth.api.signUpEmail({
				body: {
					email: "alice@example.com",
					password: "smoke-test-password-1",
					name: "Alice",
				},
				returnHeaders: true,
			});
			const cookie = signUp.headers.get("set-cookie") ?? "";
			const registered = await auth.api.adminCreateOAuthClient({
				headers: new Headers({ cookie }),
				body: {
					redirect_uris: [redirectUri],
					token_endpoint_auth_method: "client_secret_post",
					grant_types: ["authorization_code", "refresh_token"],
					skip_consent: true,
				},
			});

			const metadata = await auth.api.getOpenIdConfig();
			const slash = setup.trailingSlash ? "/" : "";
			const as: oauth.AuthorizationServer = {
				...metadata,
				token_endpoint: `${metadata.token_endpoint}${slash}`,
				userinfo_endpoint: `${metadata.userinfo_endpoint}${slash}`,
			};
			assert.ok(
				as.token_endpoint?.startsWith(publicOrigin),
				`token endpoint should use the public origin: ${as.token_endpoint}`,
			);
			const client: oauth.Client = { client_id: registered.client_id };
			const clientAuth = oauth.ClientSecretPost(registered.client_secret!);
			const DPoP = oauth.DPoP(client, await oauth.generateKeyPair("ES256"));
			const requestOptions = {
				DPoP,
				[oauth.allowInsecureRequests]: true,
				[oauth.customFetch]: proxyFetch,
			};

			const codeVerifier = oauth.generateRandomCodeVerifier();
			const state = oauth.generateRandomState();
			const authorizationUrl = new URL(metadata.authorization_endpoint);
			authorizationUrl.search = new URLSearchParams({
				client_id: client.client_id,
				response_type: "code",
				redirect_uri: redirectUri,
				scope: "openid profile email offline_access",
				state,
				code_challenge: await oauth.calculatePKCECodeChallenge(codeVerifier),
				code_challenge_method: "S256",
			}).toString();
			const authorizeResponse = await fetch(
				toServerUrl(authorizationUrl.href),
				{ headers: { cookie, accept: "application/json" }, redirect: "manual" },
			);
			const { url: callbackUrl } = (await authorizeResponse.json()) as {
				url: string;
			};
			const callbackParameters = oauth.validateAuthResponse(
				as,
				client,
				new URL(callbackUrl),
				state,
			);

			const tokens = await oauth.processAuthorizationCodeResponse(
				as,
				client,
				await oauth.authorizationCodeGrantRequest(
					as,
					client,
					clientAuth,
					callbackParameters,
					redirectUri,
					codeVerifier,
					requestOptions,
				),
			);
			assert.equal(tokens.token_type, "dpop");
			const subject = oauth.getValidatedIdTokenClaims(tokens)?.sub;
			assert.ok(subject, "the ID token should carry a subject");

			const userInfo = await oauth.processUserInfoResponse(
				as,
				client,
				subject,
				await oauth.userInfoRequest(
					as,
					client,
					tokens.access_token,
					requestOptions,
				),
			);
			assert.equal(userInfo.email, "alice@example.com");

			assert.ok(
				tokens.refresh_token,
				"offline_access should issue a refresh token",
			);
			const refreshed = await oauth.processRefreshTokenResponse(
				as,
				client,
				await oauth.refreshTokenGrantRequest(
					as,
					client,
					clientAuth,
					tokens.refresh_token,
					requestOptions,
				),
			);
			assert.equal(refreshed.token_type, "dpop");
		});
	}
});
