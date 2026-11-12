import { generateRandomString } from "better-auth/crypto";
import {
	authorizationCodeRequest,
	createAuthorizationURL,
	refreshAccessTokenRequest,
} from "better-auth/oauth2";
import { jwt } from "better-auth/plugins/jwt";
import { getTestInstance } from "better-auth/test";
import { describe, expect, it } from "vitest";
import { oauthProviderClient } from "./client";
import { oauthProvider } from "./oauth";

const authServerBaseUrl = "http://localhost:3000";
const redirectUri = "http://localhost:5000/api/auth/oauth2/callback/test";
const formHeaders = {
	accept: "application/json",
	"content-type": "application/x-www-form-urlencoded",
};

async function setup(testWith: "sqlite" | "postgres" | "mysql" | "mongodb") {
	const { auth, client, signInWithTestUser } = await getTestInstance(
		{
			baseURL: authServerBaseUrl,
			plugins: [
				jwt({ jwt: { issuer: authServerBaseUrl } }),
				oauthProvider({ loginPage: "/login", consentPage: "/consent" }),
			],
		},
		{
			clientOptions: { plugins: [oauthProviderClient()] },
			testWith,
			// MongoDB keeps one database for every instance.
			testUser: { email: `${generateRandomString(12)}@test.com` },
		},
	);
	const { headers } = await signInWithTestUser();
	const oauthClient = await auth.api.adminCreateOAuthClient({
		headers,
		body: {
			redirect_uris: [redirectUri],
			application_type: "native",
			token_endpoint_auth_method: "client_secret_post",
			scope: "openid profile email offline_access",
			skip_consent: true,
		},
	});
	const options = {
		clientId: oauthClient.client_id,
		clientSecret: oauthClient.client_secret!,
		redirectURI: redirectUri,
	};
	return { auth, client, headers, options };
}

type TestServer = Awaited<ReturnType<typeof setup>>;

interface TokenResponse {
	access_token: string;
	refresh_token: string;
}

/** Runs the authorization code flow without a resource, so the access token is opaque. */
async function authorize({ client, headers, options }: TestServer) {
	const codeVerifier = generateRandomString(32);
	const authUrl = await createAuthorizationURL({
		id: "test",
		options,
		redirectURI: "",
		authorizationEndpoint: `${authServerBaseUrl}/api/auth/oauth2/authorize`,
		state: "123",
		scopes: ["openid", "profile", "email", "offline_access"],
		codeVerifier,
	});
	let callbackRedirectUrl = "";
	await client.$fetch(authUrl.toString(), {
		headers,
		onError(context) {
			callbackRedirectUrl = context.response.headers.get("Location") || "";
		},
	});
	const code = new URL(callbackRedirectUrl).searchParams.get("code")!;
	const { body, headers: tokenHeaders } = await authorizationCodeRequest({
		code,
		codeVerifier,
		redirectURI: redirectUri,
		options,
	});
	const tokens = (
		await client.$fetch<TokenResponse>("/oauth2/token", {
			method: "POST",
			body,
			headers: tokenHeaders,
		})
	).data!;
	expect(tokens.access_token.split(".")).toHaveLength(1);
	return tokens;
}

async function refresh({ client, options }: TestServer, refreshToken: string) {
	const { body, headers } = await refreshAccessTokenRequest({
		refreshToken,
		options,
	});
	return (
		await client.$fetch<TokenResponse>("/oauth2/token", {
			method: "POST",
			body,
			headers,
		})
	).data!;
}

async function isActive({ client, options }: TestServer, token: string) {
	const res = await client.oauth2.introspect(
		{
			client_id: options.clientId,
			client_secret: options.clientSecret,
			token,
		},
		{ headers: formHeaders },
	);
	return res.data?.active;
}

async function revoke({ client, options }: TestServer, token: string) {
	const res = await client.oauth2.revoke(
		{
			client_id: options.clientId,
			client_secret: options.clientSecret,
			token,
		},
		{ headers: formHeaders },
	);
	expect(res.error).toBe(null);
}

/**
 * @see https://datatracker.ietf.org/doc/html/rfc7009#section-2.1
 */
describe.each(["sqlite", "postgres", "mysql", "mongodb"] as const)(
	"oauth-provider - refresh token revocation revokes the grant's opaque access tokens on %s",
	(testWith) => {
		// Each test gets its own instance: MongoDB instances share one database,
		// so a suite-wide instance collides with other files running in parallel.
		const createServer = () => setup(testWith);

		it("revokes opaque tokens from the first issue and every rotation, and leaves other grants alone", async () => {
			const server = await createServer();
			const first = await authorize(server);
			const second = await refresh(server, first.refresh_token);
			const third = await refresh(server, second.refresh_token);
			const otherGrant = await authorize(server);

			await revoke(server, third.refresh_token);

			expect(await isActive(server, first.access_token)).toBe(false);
			expect(await isActive(server, second.access_token)).toBe(false);
			expect(await isActive(server, third.access_token)).toBe(false);
			expect(await isActive(server, otherGrant.access_token)).toBe(true);
			expect(await refresh(server, otherGrant.refresh_token)).toMatchObject({
				access_token: expect.any(String),
			});
		});

		it("revokes the refresh token's own opaque tokens when the grant predates grant IDs", async () => {
			const server = await createServer();
			const grant = await authorize(server);
			const ctx = await server.auth.$context;
			for (const model of ["oauthRefreshToken", "oauthAccessToken"]) {
				await ctx.adapter.updateMany({
					model,
					where: [{ field: "clientId", value: server.options.clientId }],
					update: { grantId: null },
				});
			}

			await revoke(server, grant.refresh_token);

			expect(await isActive(server, grant.access_token)).toBe(false);
		});

		it("revokes every opaque token of the grant when revocation races a refresh", async () => {
			const server = await createServer();
			const first = await authorize(server);
			const second = await refresh(server, first.refresh_token);

			const [, raced] = await Promise.all([
				revoke(server, second.refresh_token),
				refresh(server, second.refresh_token),
			]);

			expect(await isActive(server, first.access_token)).toBe(false);
			expect(await isActive(server, second.access_token)).toBe(false);
			if (raced?.access_token) {
				expect(await isActive(server, raced.access_token)).toBe(false);
			}
		});
	},
);
