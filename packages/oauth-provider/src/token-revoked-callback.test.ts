import type { BetterAuthOptions } from "better-auth";
import { generateRandomString } from "better-auth/crypto";
import {
	authorizationCodeRequest,
	createAuthorizationURL,
	refreshAccessTokenRequest,
} from "better-auth/oauth2";
import { jwt } from "better-auth/plugins/jwt";
import { getTestInstance } from "better-auth/test";
import { decodeJwt } from "jose";
import { describe, expect, it, vi } from "vitest";
import { oauthProviderClient } from "./client";
import { oauthProvider } from "./oauth";
import type { OAuthOptions, OAuthTokenRevokedEvent, Scope } from "./types";

const authServerBaseUrl = "http://localhost:3000";
const resource = "https://myapi.example.com";
const redirectUri = "http://localhost:5000/api/auth/oauth2/callback/test";
const formHeaders = {
	accept: "application/json",
	"content-type": "application/x-www-form-urlencoded",
};
const accessTokenExpiresIn = 3600;

async function setup(
	providerOptions: Partial<OAuthOptions<Scope[]>> = {},
	authOptions: Partial<BetterAuthOptions> = {},
) {
	const onTokenRevoked = vi.fn<(event: OAuthTokenRevokedEvent) => void>();
	const { auth, client, signInWithTestUser } = await getTestInstance(
		{
			baseURL: authServerBaseUrl,
			...authOptions,
			plugins: [
				jwt({ jwt: { issuer: authServerBaseUrl } }),
				oauthProvider({
					loginPage: "/login",
					consentPage: "/consent",
					resources: [resource],
					enforcePerClientResources: false,
					accessTokenExpiresIn,
					revocableJwtAccessTokens: true,
					onTokenRevoked,
					...providerOptions,
				}),
			],
		},
		{ clientOptions: { plugins: [oauthProviderClient()] } },
	);
	const { headers, user } = await signInWithTestUser();
	const createClient = (tokenEndpointAuthMethod = "client_secret_post") =>
		auth.api.adminCreateOAuthClient({
			headers,
			body: {
				redirect_uris: [redirectUri],
				application_type: "native",
				token_endpoint_auth_method: tokenEndpointAuthMethod as "none",
				scope: "openid profile email offline_access",
				skip_consent: true,
			},
		});
	const oauthClient = await createClient();
	return {
		auth,
		client,
		headers,
		user,
		oauthClient,
		createClient,
		onTokenRevoked,
	};
}

type TestServer = Awaited<ReturnType<typeof setup>>;

interface TokenResponse {
	access_token: string;
	refresh_token?: string;
}

function clientOptions({ oauthClient }: TestServer) {
	return {
		clientId: oauthClient.client_id,
		clientSecret: oauthClient.client_secret!,
		redirectURI: redirectUri,
	};
}

/**
 * Gets an authorization code. With `jwt`, the access token names a resource,
 * so it is a JWT; without it the access token is opaque.
 */
async function authorizeCode(
	server: TestServer,
	{ offline = true, jwt = true }: { offline?: boolean; jwt?: boolean } = {},
) {
	const { client, headers } = server;
	const codeVerifier = generateRandomString(32);
	const authUrl = await createAuthorizationURL({
		id: "test",
		options: clientOptions(server),
		redirectURI: "",
		authorizationEndpoint: `${authServerBaseUrl}/api/auth/oauth2/authorize`,
		state: "123",
		scopes: [
			"openid",
			"profile",
			"email",
			...(offline ? ["offline_access"] : []),
		],
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
	const redeem = async (verifier: string | undefined = codeVerifier) => {
		const { body, headers: tokenHeaders } = await authorizationCodeRequest({
			code,
			codeVerifier: verifier,
			redirectURI: redirectUri,
			resource: jwt ? resource : undefined,
			options: clientOptions(server),
		});
		return client.$fetch<TokenResponse>("/oauth2/token", {
			method: "POST",
			body,
			headers: tokenHeaders,
		});
	};
	return { redeem };
}

async function authorize(
	server: TestServer,
	options?: { offline?: boolean; jwt?: boolean },
) {
	const { redeem } = await authorizeCode(server, options);
	const tokens = (await redeem()).data!;
	expect(tokens.access_token.split(".")).toHaveLength(
		options?.jwt === false ? 1 : 3,
	);
	return tokens;
}

async function refresh(server: TestServer, refreshToken: string) {
	const { body, headers } = await refreshAccessTokenRequest({
		refreshToken,
		options: clientOptions(server),
	});
	return server.client.$fetch<TokenResponse>("/oauth2/token", {
		method: "POST",
		body,
		headers,
	});
}

function revoke(
	{ client, oauthClient }: TestServer,
	token: string,
	caller: { client_id: string; client_secret?: string } = oauthClient,
) {
	return client.oauth2.revoke(
		{
			client_id: caller.client_id,
			...(caller.client_secret ? { client_secret: caller.client_secret } : {}),
			token,
		},
		{ headers: formHeaders },
	);
}

async function isActive(
	{ client, oauthClient }: TestServer,
	token: string,
	caller: { client_id: string; client_secret?: string } = oauthClient,
) {
	const res = await client.oauth2.introspect(
		{
			client_id: caller.client_id,
			client_secret: caller.client_secret,
			token,
		},
		{ headers: formHeaders },
	);
	return res.data?.active;
}

/**
 * Creates a client that serves the resource. It can introspect another
 * client's tokens after that client is disabled or deleted, when the issuer
 * can no longer authenticate.
 */
async function createResourceServer(server: TestServer) {
	const resourceServer = await server.createClient();
	const ctx = await server.auth.$context;
	await ctx.adapter.create<{
		clientId: string;
		resourceId: string;
		createdAt: Date;
	}>({
		model: "oauthClientResource",
		data: {
			clientId: resourceServer.client_id,
			resourceId: resource,
			createdAt: new Date(),
		},
	});
	return resourceServer;
}

/** The events reported since the last call, without their endpoint context. */
function takeEvents({ onTokenRevoked }: TestServer) {
	const events = onTokenRevoked.mock.calls.map(([event]) => {
		expect(event.ctx.context).toBeDefined();
		const { ctx: _ctx, ...rest } = event;
		return rest;
	});
	onTokenRevoked.mockClear();
	return events;
}

function expectGrantWindow(expiresAt: Date, revokedAt: number) {
	const windowMs = accessTokenExpiresIn * 1000;
	expect(expiresAt.getTime()).toBeGreaterThanOrEqual(revokedAt + windowMs);
	expect(expiresAt.getTime()).toBeLessThanOrEqual(Date.now() + windowMs + 1000);
}

describe("oauth-provider - onTokenRevoked", async () => {
	const server = await setup();

	it("reports a revoked JWT access token once, by its jti", async () => {
		const { access_token } = await authorize(server, { offline: false });
		const { jti, exp } = decodeJwt(access_token);

		expect((await revoke(server, access_token)).error).toBeNull();
		expect((await revoke(server, access_token)).error).toBeNull();

		const events = takeEvents(server);
		expect(events).toEqual([
			{
				type: "access_token",
				reason: "revocation_request",
				clientId: server.oauthClient.client_id,
				jti,
				expiresAt: expect.any(Date),
			},
		]);
		const expiresAt = events[0]!.expiresAt.getTime();
		expect(expiresAt).toBeGreaterThanOrEqual(exp! * 1000);
		expect(expiresAt).toBeLessThanOrEqual((exp! + 1) * 1000);
	});

	it("reports a revoked opaque access token once, without a jti", async () => {
		const { access_token } = await authorize(server, {
			offline: false,
			jwt: false,
		});

		expect((await revoke(server, access_token)).error).toBeNull();
		expect((await revoke(server, access_token)).error).toBeNull();

		const events = takeEvents(server);
		expect(events).toEqual([
			{
				type: "access_token",
				reason: "revocation_request",
				clientId: server.oauthClient.client_id,
				expiresAt: expect.any(Date),
			},
		]);
		expect(events[0]).not.toHaveProperty("jti");
		expect(events[0]!.expiresAt.getTime()).toBeGreaterThan(Date.now());
	});

	it("reports a revoked refresh token with the grant it revoked", async () => {
		const tokens = await authorize(server);
		const grantId = decodeJwt(tokens.access_token).grant_id;
		expect(grantId).toEqual(expect.any(String));

		const revokedAt = Date.now();
		expect((await revoke(server, tokens.refresh_token!)).error).toBeNull();

		const events = takeEvents(server);
		expect(events).toEqual([
			{
				type: "refresh_token",
				reason: "revocation_request",
				clientId: server.oauthClient.client_id,
				userId: server.user.id,
				grantId,
				expiresAt: expect.any(Date),
			},
		]);
		expectGrantWindow(events[0]!.expiresAt, revokedAt);
		expect(await isActive(server, tokens.access_token)).toBe(false);
	});

	/**
	 * @see https://datatracker.ietf.org/doc/html/rfc9700#section-4.14.2
	 */
	it("reports reuse of a rotated refresh token at the token endpoint", async () => {
		const first = await authorize(server);
		const grantId = decodeJwt(first.access_token).grant_id;
		expect((await refresh(server, first.refresh_token!)).error).toBeNull();

		const reuse = await refresh(server, first.refresh_token!);
		expect(reuse.error).toMatchObject({ error: "invalid_grant" });

		expect(takeEvents(server)).toEqual([
			{
				type: "refresh_token",
				reason: "reuse_detected",
				clientId: server.oauthClient.client_id,
				userId: server.user.id,
				grantId,
				expiresAt: expect.any(Date),
			},
		]);
	});

	/**
	 * @see https://datatracker.ietf.org/doc/html/rfc7009#section-2.2
	 */
	it("reports a repeated revocation of a refresh token as requested", async () => {
		const tokens = await authorize(server);
		const grantId = decodeJwt(tokens.access_token).grant_id;

		expect((await revoke(server, tokens.refresh_token!)).error).toBeNull();
		expect((await revoke(server, tokens.refresh_token!)).error).toBeNull();

		const requested = {
			type: "refresh_token",
			reason: "revocation_request",
			clientId: server.oauthClient.client_id,
			userId: server.user.id,
			grantId,
			expiresAt: expect.any(Date),
		};
		expect(takeEvents(server)).toEqual([requested, requested]);
	});

	it("reports a rotated refresh token presented for revocation as reuse", async () => {
		const first = await authorize(server);
		const grantId = decodeJwt(first.access_token).grant_id;
		expect((await refresh(server, first.refresh_token!)).error).toBeNull();

		expect((await revoke(server, first.refresh_token!)).error).toBeNull();

		expect(takeEvents(server)).toEqual([
			{
				type: "refresh_token",
				reason: "reuse_detected",
				clientId: server.oauthClient.client_id,
				userId: server.user.id,
				grantId,
				expiresAt: expect.any(Date),
			},
		]);
	});

	it("reports a revocation that loses the race to a rotation once, as requested", async () => {
		const tokens = await authorize(server);
		const grantId = decodeJwt(tokens.access_token).grant_id;
		const ctx = await server.auth.$context;
		const incrementOne = ctx.adapter.incrementOne;
		// A rotation of the same token wins the compare-and-swap first.
		const lostSwap = vi
			.spyOn(ctx.adapter, "incrementOne")
			.mockImplementation((args) =>
				args.model === "oauthRefreshToken"
					? Promise.resolve(null)
					: incrementOne(args),
			);
		try {
			expect((await revoke(server, tokens.refresh_token!)).error).toBeNull();
		} finally {
			lostSwap.mockRestore();
		}

		expect(takeEvents(server)).toEqual([
			{
				type: "refresh_token",
				reason: "revocation_request",
				clientId: server.oauthClient.client_id,
				userId: server.user.id,
				grantId,
				expiresAt: expect.any(Date),
			},
		]);
	});

	/**
	 * @see https://datatracker.ietf.org/doc/html/draft-ietf-oauth-v2-1#section-4.1.3
	 */
	it("reports an authorization code reused by its client", async () => {
		const { redeem } = await authorizeCode(server, { offline: false });
		const first = await redeem();
		const grantId = decodeJwt(first.data!.access_token).grant_id;
		expect(grantId).toEqual(expect.any(String));

		const revokedAt = Date.now();
		const reuse = await redeem();
		expect(reuse.error).toMatchObject({ error: "invalid_grant" });

		const events = takeEvents(server);
		expect(events).toEqual([
			{
				type: "authorization_code",
				reason: "reuse_detected",
				clientId: server.oauthClient.client_id,
				grantId,
				expiresAt: expect.any(Date),
			},
		]);
		expectGrantWindow(events[0]!.expiresAt, revokedAt);
		expect(await isActive(server, first.data!.access_token)).toBe(false);
	});

	describe("when nothing is revoked", () => {
		it("does not report an unknown token", async () => {
			expect((await revoke(server, "not-a-token")).error).toBeNull();
			expect(takeEvents(server)).toEqual([]);
		});

		it("does not report another client's token", async () => {
			const tokens = await authorize(server);
			const confidential = await server.createClient();
			const rejected = await revoke(server, tokens.access_token, confidential);
			expect(rejected.error?.status).toBe(400);

			const publicClient = await server.createClient("none");
			const ignored = await revoke(server, tokens.refresh_token!, {
				client_id: publicClient.client_id,
			});
			expect(ignored.error).toBeNull();

			expect(takeEvents(server)).toEqual([]);
			expect(await isActive(server, tokens.access_token)).toBe(true);
		});

		it("does not report an opaque access token that had already expired", async () => {
			const { access_token } = await authorize(server, {
				offline: false,
				jwt: false,
			});
			const ctx = await server.auth.$context;
			await ctx.adapter.updateMany({
				model: "oauthAccessToken",
				where: [{ field: "clientId", value: server.oauthClient.client_id }],
				update: { expiresAt: new Date(Date.now() - 1000) },
			});

			expect((await revoke(server, access_token)).error).toBeNull();
			expect(takeEvents(server)).toEqual([]);
		});

		it("does not report an authorization code reused without its code_verifier", async () => {
			const { redeem } = await authorizeCode(server);
			const first = await redeem();
			expect(first.error).toBeNull();

			const reuse = await redeem(generateRandomString(32));
			expect(reuse.error).toMatchObject({ error: "invalid_grant" });

			expect(takeEvents(server)).toEqual([]);
			expect(await isActive(server, first.data!.access_token)).toBe(true);
		});
	});
});

describe("oauth-provider - onTokenRevoked without revocable JWT access tokens", async () => {
	const server = await setup({ revocableJwtAccessTokens: false });

	it("does not report a JWT access token the endpoint cannot revoke", async () => {
		const { access_token } = await authorize(server, { offline: false });
		const res = await revoke(server, access_token);
		expect(res.error).toMatchObject({ error: "unsupported_token_type" });
		expect(takeEvents(server)).toEqual([]);
	});
});

/**
 * @see https://openid.net/specs/openid-connect-backchannel-1_0.html#rfc.section.2.7
 */
describe("oauth-provider - onTokenRevoked after the session ends", () => {
	/**
	 * Signs out after narrowing a refresh token's scopes, so the session end
	 * revokes it: refresh tokens without offline_access do not outlive it.
	 */
	async function signOutWithRevokedRefreshToken() {
		const server = await setup();
		const first = await authorize(server);
		const { body, headers } = await refreshAccessTokenRequest({
			refreshToken: first.refresh_token!,
			options: clientOptions(server),
			extraParams: { scope: "openid profile" },
		});
		const narrowed = await server.client.$fetch<TokenResponse>(
			"/oauth2/token",
			{ method: "POST", body, headers },
		);
		await server.client.signOut({ fetchOptions: { headers: server.headers } });
		expect(takeEvents(server)).toEqual([]);
		return {
			server,
			refreshToken: narrowed.data!.refresh_token!,
			event: {
				type: "refresh_token",
				clientId: server.oauthClient.client_id,
				userId: server.user.id,
				grantId: decodeJwt(narrowed.data!.access_token).grant_id,
				expiresAt: expect.any(Date),
			},
		};
	}

	it("reports a refresh with the revoked refresh token as reuse", async () => {
		const { server, refreshToken, event } =
			await signOutWithRevokedRefreshToken();

		const reuse = await refresh(server, refreshToken);
		expect(reuse.error).toMatchObject({ error: "invalid_grant" });
		expect(takeEvents(server)).toEqual([
			{ ...event, reason: "reuse_detected" },
		]);
	});

	it("reports a revocation of the revoked refresh token as requested", async () => {
		const { server, refreshToken, event } =
			await signOutWithRevokedRefreshToken();

		expect((await revoke(server, refreshToken)).error).toBeNull();
		expect(takeEvents(server)).toEqual([
			{ ...event, reason: "revocation_request" },
		]);
	});
});

describe("oauth-provider - onTokenRevoked for causes it does not report", () => {
	it("does not report a rotation, which keeps the grant", async () => {
		const server = await setup();
		const first = await authorize(server);

		const rotated = await refresh(server, first.refresh_token!);
		expect(rotated.error).toBeNull();
		expect(rotated.data!.refresh_token).toEqual(expect.any(String));

		expect(takeEvents(server)).toEqual([]);
	});

	it("does not report the tokens of a disabled client", async () => {
		const server = await setup();
		const resourceServer = await createResourceServer(server);
		const tokens = await authorize(server);
		expect(await isActive(server, tokens.access_token, resourceServer)).toBe(
			true,
		);
		await server.auth.api.adminUpdateOAuthClient({
			headers: server.headers,
			body: {
				client_id: server.oauthClient.client_id,
				update: { disabled: true },
			},
		});

		const disabled = await refresh(server, tokens.refresh_token!);
		expect(disabled.error).toMatchObject({ error: "invalid_client" });
		expect(await isActive(server, tokens.access_token, resourceServer)).toBe(
			false,
		);

		expect(takeEvents(server)).toEqual([]);
	});

	it("does not report the tokens of a deleted client", async () => {
		const server = await setup();
		const resourceServer = await createResourceServer(server);
		const tokens = await authorize(server);
		expect(await isActive(server, tokens.access_token, resourceServer)).toBe(
			true,
		);
		const ctx = await server.auth.$context;
		await ctx.adapter.delete({
			model: "oauthClient",
			where: [{ field: "clientId", value: server.oauthClient.client_id }],
		});

		const deleted = await refresh(server, tokens.refresh_token!);
		expect(deleted.error).toMatchObject({ error: "invalid_client" });
		expect(await isActive(server, tokens.access_token, resourceServer)).toBe(
			false,
		);

		expect(takeEvents(server)).toEqual([]);
	});

	it("does not report the tokens of a deleted resource", async () => {
		const server = await setup();
		const tokens = await authorize(server, { offline: false });
		expect(await isActive(server, tokens.access_token)).toBe(true);
		const ctx = await server.auth.$context;
		await ctx.adapter.delete({
			model: "oauthResource",
			where: [{ field: "identifier", value: resource }],
		});

		expect(await isActive(server, tokens.access_token)).toBe(false);

		expect(takeEvents(server)).toEqual([]);
	});

	it("does not report a deleted consent", async () => {
		const server = await setup();
		await authorize(server);
		const ctx = await server.auth.$context;
		const consent = await ctx.adapter.create<{ id: string }>({
			model: "oauthConsent",
			data: {
				clientId: server.oauthClient.client_id,
				userId: server.user.id,
				scopes: ["openid"],
				createdAt: new Date(),
				updatedAt: new Date(),
			},
		});

		await server.auth.api.deleteOAuthConsent({
			headers: server.headers,
			body: { id: consent.id },
		});

		expect(takeEvents(server)).toEqual([]);
	});

	it("reports only the replayed refresh token's grant, though the user's other grants lose their refresh tokens", async () => {
		const server = await setup();
		const replayed = await authorize(server);
		const other = await authorize(server);
		const grantId = decodeJwt(replayed.access_token).grant_id;
		expect(decodeJwt(other.access_token).grant_id).not.toBe(grantId);
		expect((await refresh(server, replayed.refresh_token!)).error).toBeNull();

		const reuse = await refresh(server, replayed.refresh_token!);
		expect(reuse.error).toMatchObject({ error: "invalid_grant" });

		expect(takeEvents(server)).toEqual([
			{
				type: "refresh_token",
				reason: "reuse_detected",
				clientId: server.oauthClient.client_id,
				userId: server.user.id,
				grantId,
				expiresAt: expect.any(Date),
			},
		]);
		expect(await isActive(server, other.access_token)).toBe(true);
		expect((await refresh(server, other.refresh_token!)).error).toMatchObject({
			error: "invalid_grant",
		});
	});

	it("still reports a reused authorization code when deleting its tokens fails", async () => {
		const server = await setup();
		const { redeem } = await authorizeCode(server, { offline: false });
		const first = await redeem();
		const grantId = decodeJwt(first.data!.access_token).grant_id;
		const ctx = await server.auth.$context;
		const deleteMany = ctx.adapter.deleteMany.bind(ctx.adapter);
		const failingCleanup = vi
			.spyOn(ctx.adapter, "deleteMany")
			.mockImplementation((args) =>
				args.model === "oauthAccessToken"
					? Promise.reject(new Error("cleanup failed"))
					: deleteMany(args),
			);
		const logError = vi
			.spyOn(ctx.logger, "error")
			.mockImplementation(() => undefined);
		try {
			const reuse = await redeem();
			expect(reuse.error).toMatchObject({ error: "invalid_grant" });
			expect(logError).toHaveBeenCalledWith(
				"authorization code replay cleanup failed",
				expect.any(Error),
			);
		} finally {
			failingCleanup.mockRestore();
			logError.mockRestore();
		}

		expect(takeEvents(server)).toEqual([
			{
				type: "authorization_code",
				reason: "reuse_detected",
				clientId: server.oauthClient.client_id,
				grantId,
				expiresAt: expect.any(Date),
			},
		]);
	});
});

describe("oauth-provider - onTokenRevoked failures", async () => {
	const log = vi.fn();
	const server = await setup({}, { logger: { level: "error", log } });
	server.onTokenRevoked.mockRejectedValue(new Error("feed unavailable"));

	function expectLoggedFailure() {
		expect(log).toHaveBeenCalledWith(
			"error",
			expect.stringContaining("onTokenRevoked"),
			expect.objectContaining({ message: "feed unavailable" }),
		);
		log.mockClear();
	}

	it("keeps the revocation and the 200 response when the callback throws", async () => {
		const tokens = await authorize(server);

		expect((await revoke(server, tokens.access_token)).error).toBeNull();
		expectLoggedFailure();
		expect(await isActive(server, tokens.access_token)).toBe(false);

		expect((await revoke(server, tokens.refresh_token!)).error).toBeNull();
		expectLoggedFailure();
		expect((await refresh(server, tokens.refresh_token!)).error).toMatchObject({
			error: "invalid_grant",
		});
		expectLoggedFailure();
		expect(server.onTokenRevoked).toHaveBeenCalledTimes(3);
	});

	it("keeps invalid_grant for a reused refresh token when the callback throws", async () => {
		const first = await authorize(server);
		expect((await refresh(server, first.refresh_token!)).error).toBeNull();

		const reuse = await refresh(server, first.refresh_token!);
		expect(reuse.error).toMatchObject({
			status: 400,
			error: "invalid_grant",
		});
		expectLoggedFailure();
		expect(await isActive(server, first.access_token)).toBe(false);
	});
});
