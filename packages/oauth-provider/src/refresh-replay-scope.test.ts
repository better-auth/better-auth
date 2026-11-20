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

async function setup(testWith: "sqlite" | "postgres" | "mysql") {
	const { auth, client, signInWithTestUser } = await getTestInstance(
		{
			baseURL: authServerBaseUrl,
			plugins: [
				jwt({ jwt: { issuer: authServerBaseUrl } }),
				oauthProvider({ loginPage: "/login", consentPage: "/consent" }),
			],
		},
		{ clientOptions: { plugins: [oauthProviderClient()] }, testWith },
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
	return (
		await client.$fetch<TokenResponse>("/oauth2/token", {
			method: "POST",
			body,
			headers: tokenHeaders,
		})
	).data!;
}

async function requestRefresh(
	{ client, options }: TestServer,
	refreshToken: string,
) {
	const { body, headers } = await refreshAccessTokenRequest({
		refreshToken,
		options,
	});
	return client.$fetch<TokenResponse>("/oauth2/token", {
		method: "POST",
		body,
		headers,
	});
}

async function refresh(server: TestServer, refreshToken: string) {
	return (await requestRefresh(server, refreshToken)).data!;
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

/** Stores every token of the client as if it predated grant IDs. */
async function dropGrantIds(server: TestServer) {
	const ctx = await server.auth.$context;
	for (const model of ["oauthRefreshToken", "oauthAccessToken"]) {
		await ctx.adapter.updateMany({
			model,
			where: [{ field: "clientId", value: server.options.clientId }],
			update: { grantId: null },
		});
	}
}

async function countRefreshTokens(server: TestServer) {
	const ctx = await server.auth.$context;
	return ctx.adapter.count({
		model: "oauthRefreshToken",
		where: [{ field: "clientId", value: server.options.clientId }],
	});
}

/**
 * Replaying a rotated refresh token revokes the grant it belongs to. The
 * client's other grants for the same user keep working.
 *
 * @see https://github.com/better-auth/better-auth/issues/12154
 * @see https://datatracker.ietf.org/doc/html/rfc9700#section-4.14.2
 */
describe.each(["sqlite", "postgres", "mysql"] as const)(
	"oauth-provider - refresh token replay revokes only its grant on %s",
	async (testWith) => {
		const server = await setup(testWith);

		it("deletes the refresh and opaque access tokens of the replayed grant and leaves the user's other grant usable", async () => {
			const first = await authorize(server);
			const second = await refresh(server, first.refresh_token);
			const third = await refresh(server, second.refresh_token);
			const otherFirst = await authorize(server);
			const otherSecond = await refresh(server, otherFirst.refresh_token);

			const replay = await requestRefresh(server, first.refresh_token);

			expect(replay.error).toMatchObject({
				status: 400,
				error: "invalid_grant",
			});
			expect(await isActive(server, second.access_token)).toBe(false);
			expect(await isActive(server, third.access_token)).toBe(false);
			expect(
				(await requestRefresh(server, third.refresh_token)).error,
			).toMatchObject({
				error: "invalid_grant",
			});
			expect(await isActive(server, otherFirst.access_token)).toBe(true);
			expect(await isActive(server, otherSecond.access_token)).toBe(true);
			const otherThird = await requestRefresh(
				server,
				otherSecond.refresh_token,
			);
			expect(otherThird.error).toBeNull();
			expect(otherThird.data?.refresh_token).toBeDefined();
		});

		it("tears the grant down when a rotated token is presented for revocation", async () => {
			const first = await authorize(server);
			const second = await refresh(server, first.refresh_token);
			const other = await authorize(server);

			await revoke(server, first.refresh_token);

			expect(await isActive(server, second.access_token)).toBe(false);
			expect(
				(await requestRefresh(server, second.refresh_token)).error,
			).toMatchObject({
				error: "invalid_grant",
			});
			expect(await isActive(server, other.access_token)).toBe(true);
			expect(
				(await requestRefresh(server, other.refresh_token)).error,
			).toBeNull();
		});

		/**
		 * A refresh token stored before 1.8 has no grant ID until its first
		 * refresh gives it one, so a replay of it cannot name a grant.
		 */
		describe("a token without a grant ID", () => {
			it("tears down every grant of the client and user", async () => {
				const first = await authorize(server);
				const second = await refresh(server, first.refresh_token);
				const other = await authorize(server);
				const otherSecond = await refresh(server, other.refresh_token);
				await dropGrantIds(server);

				const replay = await requestRefresh(server, first.refresh_token);

				expect(replay.error).toMatchObject({ error: "invalid_grant" });
				expect(await countRefreshTokens(server)).toBe(0);
				expect(
					(await requestRefresh(server, second.refresh_token)).error,
				).toMatchObject({
					error: "invalid_grant",
				});
				expect(await isActive(server, otherSecond.access_token)).toBe(false);
				expect(
					(await requestRefresh(server, otherSecond.refresh_token)).error,
				).toMatchObject({
					error: "invalid_grant",
				});
			});

			it("tears down a grant that has an ID too", async () => {
				const legacy = await authorize(server);
				await refresh(server, legacy.refresh_token);
				const identified = await authorize(server);
				await dropGrantIds(server);
				// This refresh gives the grant its ID.
				const identifiedSecond = await refresh(
					server,
					identified.refresh_token,
				);

				const replay = await requestRefresh(server, legacy.refresh_token);

				expect(replay.error).toMatchObject({ error: "invalid_grant" });
				expect(await isActive(server, identifiedSecond.access_token)).toBe(
					false,
				);
				expect(
					(await requestRefresh(server, identifiedSecond.refresh_token)).error,
				).toMatchObject({ error: "invalid_grant" });
			});

			it("also tears down a token rotated before the upgrade, and its access token", async () => {
				const first = await authorize(server);
				const second = await refresh(server, first.refresh_token);
				await dropGrantIds(server);
				// This refresh gives `second` and its successor the grant ID, and
				// leaves `first`, rotated before the upgrade, without one.
				const third = await refresh(server, second.refresh_token);

				const replay = await requestRefresh(server, second.refresh_token);

				expect(replay.error).toMatchObject({ error: "invalid_grant" });
				expect(await isActive(server, first.access_token)).toBe(false);
				expect(await isActive(server, third.access_token)).toBe(false);
				expect(await countRefreshTokens(server)).toBe(0);
			});

			it("scopes a replay to the grant once the token was refreshed after the upgrade", async () => {
				const first = await authorize(server);
				const other = await authorize(server);
				await dropGrantIds(server);
				// The refresh stores a grant ID on the rotated token and its successor.
				const second = await refresh(server, first.refresh_token);

				const replay = await requestRefresh(server, first.refresh_token);

				expect(replay.error).toMatchObject({ error: "invalid_grant" });
				expect(await isActive(server, first.access_token)).toBe(false);
				expect(await isActive(server, second.access_token)).toBe(false);
				// The other grant predates grant IDs and was never refreshed, so it
				// still has none. Replaying `first` has a grant ID and leaves it alone.
				expect(await isActive(server, other.access_token)).toBe(true);
				expect(
					(await requestRefresh(server, other.refresh_token)).error,
				).toBeNull();
			});
		});
	},
);
