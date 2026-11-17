import { memoryAdapter } from "@better-auth/memory-adapter";
import { generateRandomString } from "better-auth/crypto";
import {
	authorizationCodeRequest,
	createAuthorizationURL,
	refreshAccessTokenRequest,
} from "better-auth/oauth2";
import { emailOTP } from "better-auth/plugins";
import { jwt } from "better-auth/plugins/jwt";
import { getTestInstance } from "better-auth/test";
import { describe, expect, it, vi } from "vitest";
import { oauthProviderClient } from "./client";
import { oauthProvider } from "./oauth";
import type { OAuthOptions, Scope } from "./types";

const authServerBaseUrl = "http://localhost:3000";
const validResource = "https://myapi.example.com";
const redirectUri = "http://localhost:5000/api/auth/oauth2/callback/test";
const formHeaders = {
	accept: "application/json",
	"content-type": "application/x-www-form-urlencoded",
};

function memoryTables() {
	return Object.fromEntries(
		[
			"account",
			"jwks",
			"oauthAccessToken",
			"oauthClient",
			"oauthClientAssertion",
			"oauthClientResource",
			"oauthConsent",
			"oauthRefreshToken",
			"oauthResource",
			"session",
			"user",
			"verification",
		].map((table) => [table, []]),
	);
}

async function setup(
	providerOptions?: Partial<OAuthOptions<Scope[]>>,
	{
		revokeSessions = true,
		memory = false,
	}: { revokeSessions?: boolean; memory?: boolean } = {},
) {
	const sent = { resetToken: "", otp: "" };
	const { auth, client, signInWithTestUser, sessionSetter, testUser } =
		await getTestInstance(
			{
				baseURL: authServerBaseUrl,
				// The memory adapter enforces no foreign keys, so a token stored for a
				// session that has ended is accepted.
				...(memory ? { database: memoryAdapter(memoryTables()) } : {}),
				emailAndPassword: {
					enabled: true,
					revokeSessionsOnPasswordReset: revokeSessions,
					async sendResetPassword({ token }) {
						sent.resetToken = token;
					},
				},
				plugins: [
					jwt({ jwt: { issuer: authServerBaseUrl } }),
					oauthProvider({
						loginPage: "/login",
						consentPage: "/consent",
						resources: [validResource],
						enforcePerClientResources: false,
						...providerOptions,
					}),
					emailOTP({
						async sendVerificationOTP({ otp }) {
							sent.otp = otp;
						},
					}),
				],
			},
			{ clientOptions: { plugins: [oauthProviderClient()] } },
		);
	const { headers, user } = await signInWithTestUser();
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
	return {
		auth,
		client,
		headers,
		user,
		testUser,
		oauthClient,
		sent,
		signInWithTestUser,
		sessionSetter,
	};
}

type TestServer = Awaited<ReturnType<typeof setup>>;

interface TokenResponse {
	access_token: string;
	refresh_token?: string;
}

/**
 * Runs the authorization code flow as the signed-in user. A request for the
 * `resource` gets a JWT access token, and one for `offline_access` also gets a
 * refresh token.
 */
async function authorize(
	server: TestServer,
	{
		headers,
		offline = true,
		jwtAccessToken = false,
	}: { headers?: Headers; offline?: boolean; jwtAccessToken?: boolean } = {},
) {
	const { client, oauthClient } = server;
	// A reset ends the user's sessions, so each flow starts from a new sign-in.
	headers ??= (await server.signInWithTestUser()).headers;
	const options = {
		clientId: oauthClient.client_id,
		clientSecret: oauthClient.client_secret!,
		redirectURI: redirectUri,
	};
	const codeVerifier = generateRandomString(32);
	const authUrl = await createAuthorizationURL({
		id: "test",
		options,
		redirectURI: "",
		authorizationEndpoint: `${authServerBaseUrl}/api/auth/oauth2/authorize`,
		state: "123",
		scopes: ["openid", ...(offline ? ["offline_access"] : [])],
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
		resource: jwtAccessToken ? validResource : undefined,
		options,
	});
	const tokens = (
		await client.$fetch<TokenResponse>("/oauth2/token", {
			method: "POST",
			body,
			headers: tokenHeaders,
		})
	).data!;
	expect(tokens.access_token.split(".")).toHaveLength(jwtAccessToken ? 3 : 1);
	expect(!!tokens.refresh_token).toBe(offline);
	return tokens;
}

async function requestRefresh(
	{ client, oauthClient }: TestServer,
	refreshToken: string,
) {
	const { body, headers } = await refreshAccessTokenRequest({
		refreshToken,
		options: {
			clientId: oauthClient.client_id,
			clientSecret: oauthClient.client_secret!,
			redirectURI: redirectUri,
		},
	});
	return client.$fetch<TokenResponse>("/oauth2/token", {
		method: "POST",
		body,
		headers,
	});
}

async function refreshStatus(server: TestServer, refreshToken: string) {
	const res = await requestRefresh(server, refreshToken);
	return res.error ? res.error.status : 200;
}

async function isActive({ client, oauthClient }: TestServer, token: string) {
	const res = await client.oauth2.introspect(
		{
			client_id: oauthClient.client_id,
			client_secret: oauthClient.client_secret,
			token,
		},
		{ headers: formHeaders },
	);
	return res.data?.active;
}

/** Resets the test user's password, to the one it already has by default. */
async function resetPassword(
	{ auth, testUser, sent }: TestServer,
	newPassword = testUser.password,
) {
	sent.resetToken = "";
	await auth.api.requestPasswordReset({
		body: { email: testUser.email, redirectTo: "/reset" },
	});
	expect(sent.resetToken).not.toBe("");
	await auth.api.resetPassword({
		body: { token: sent.resetToken, newPassword },
	});
}

async function countStoredTokens({ auth, user }: TestServer) {
	const ctx = await auth.$context;
	const where = [{ field: "userId", value: user.id }];
	return {
		access: await ctx.adapter.count({ model: "oauthAccessToken", where }),
		refresh: await ctx.adapter.count({ model: "oauthRefreshToken", where }),
	};
}

async function endAllSessions({ auth, user }: TestServer) {
	const ctx = await auth.$context;
	await ctx.internalAdapter.deleteUserSessions(user.id);
	expect(await ctx.internalAdapter.listSessions(user.id)).toHaveLength(0);
}

/**
 * A password reset is recovery from a compromised credential, and an
 * `offline_access` grant created during the compromise survives the sessions
 * the reset ends.
 *
 * @see https://github.com/better-auth/better-auth/issues/12276
 */
describe("oauth-provider - a password reset revokes the user's grants", async () => {
	const server = await setup({ revocableJwtAccessTokens: true });

	it("revokes offline_access grants that no session holds", async () => {
		const detached = await authorize(server, { jwtAccessToken: true });
		const opaque = await authorize(server);
		const standalone = await authorize(server, { offline: false });
		expect(await isActive(server, opaque.access_token)).toBe(true);

		await resetPassword(server);

		expect(await isActive(server, opaque.access_token)).toBe(false);
		expect(await isActive(server, standalone.access_token)).toBe(false);
		expect(await isActive(server, detached.access_token)).toBe(false);
		for (const grant of [detached, opaque]) {
			expect(await refreshStatus(server, grant.refresh_token!)).toBe(400);
		}
	});

	it("revokes the grants of a user with no live session", async () => {
		const grant = await authorize(server);
		await endAllSessions(server);

		await resetPassword(server);

		expect(await isActive(server, grant.access_token)).toBe(false);
		expect(await refreshStatus(server, grant.refresh_token!)).toBe(400);
	});

	it("revokes the grants when the reset goes through the email OTP plugin", async () => {
		const grant = await authorize(server);
		await endAllSessions(server);
		await server.auth.api.sendVerificationOTP({
			body: { email: server.testUser.email, type: "forget-password" },
		});

		await server.auth.api.resetPasswordEmailOTP({
			body: {
				email: server.testUser.email,
				otp: server.sent.otp,
				password: server.testUser.password,
			},
		});

		expect(await refreshStatus(server, grant.refresh_token!)).toBe(400);
	});

	it("leaves another user's grants alone", async () => {
		const { auth, client } = server;
		const other = {
			email: "other-user@test.com",
			password: "other-password-123",
			name: "Other User",
		};
		await auth.api.signUpEmail({ body: other });
		const otherHeaders = new Headers();
		await client.signIn.email(other, {
			onSuccess: server.sessionSetter(otherHeaders),
		});
		const otherGrant = await authorize(server, { headers: otherHeaders });
		const ownGrant = await authorize(server);

		await resetPassword(server);

		expect(await refreshStatus(server, ownGrant.refresh_token!)).toBe(400);
		expect(await isActive(server, otherGrant.access_token)).toBe(true);
		expect(await refreshStatus(server, otherGrant.refresh_token!)).toBe(200);
	});

	it("does not run for a request that is not a reset", async () => {
		const grant = await authorize(server);

		await server.auth.api.revokeSessions({
			headers: (await server.signInWithTestUser()).headers,
		});

		// Signing out everywhere keeps `offline_access` grants.
		expect(await refreshStatus(server, grant.refresh_token!)).toBe(200);
	});
});

describe("oauth-provider - a password reset keeps the grants when asked to", async () => {
	it("keeps them with revokeGrantsOnPasswordReset set to false", async () => {
		const server = await setup({ revokeGrantsOnPasswordReset: false });
		await authorize(server);
		const before = await countStoredTokens(server);
		expect(before.refresh).toBeGreaterThan(0);

		await resetPassword(server);

		expect(await countStoredTokens(server)).toEqual(before);
	});

	it("keeps them when the reset does not revoke sessions", async () => {
		const server = await setup({}, { revokeSessions: false });
		const grant = await authorize(server);

		await resetPassword(server);

		expect(await isActive(server, grant.access_token)).toBe(true);
		expect(await refreshStatus(server, grant.refresh_token!)).toBe(200);
	});
});

describe("oauth-provider - a password reset stops a rotation in flight", async () => {
	/**
	 * The rotation consumed its parent before the reset and stores its refresh
	 * token after, so the reset's delete misses that row.
	 *
	 * @see https://datatracker.ietf.org/doc/html/rfc9700#section-4.14.2
	 */
	it("fails a rotation that stores its refresh token after the reset", async () => {
		const server = await setup({}, { memory: true });
		const first = await authorize(server);
		const ctx = await server.auth.$context;
		const create = ctx.adapter.create.bind(ctx.adapter);
		const reached = Promise.withResolvers<void>();
		const released = Promise.withResolvers<void>();
		const spy = vi.spyOn(ctx.adapter, "create");
		spy.mockImplementation(async (...args) => {
			if (args[0].model === "oauthRefreshToken") {
				spy.mockRestore();
				reached.resolve();
				await released.promise;
			}
			return create(...args);
		});
		try {
			const rotating = refreshStatus(server, first.refresh_token!);
			await reached.promise;
			await resetPassword(server);
			released.resolve();

			expect(await rotating).toBe(400);
			expect((await countStoredTokens(server)).refresh).toBe(0);
		} finally {
			released.resolve();
			spy.mockRestore();
		}
	});
});
