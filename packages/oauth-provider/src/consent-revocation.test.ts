import { generateRandomString } from "better-auth/crypto";
import {
	authorizationCodeRequest,
	createAuthorizationURL,
	refreshAccessTokenRequest,
} from "better-auth/oauth2";
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

async function setup(providerOptions?: Partial<OAuthOptions<Scope[]>>) {
	// The reference the next authorization request stores its consent under.
	const state: { referenceId?: string } = {};
	const { auth, client, signInWithTestUser } = await getTestInstance(
		{
			baseURL: authServerBaseUrl,
			plugins: [
				jwt({ jwt: { issuer: authServerBaseUrl } }),
				oauthProvider({
					loginPage: "/login",
					consentPage: "/consent",
					resources: [validResource],
					enforcePerClientResources: false,
					postLogin: {
						page: "/select-organization",
						shouldRedirect: () => false,
						consentReferenceId: () => state.referenceId,
					},
					...providerOptions,
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
	return { auth, client, headers, user, oauthClient, state };
}

type TestServer = Awaited<ReturnType<typeof setup>>;

interface TokenResponse {
	access_token: string;
	refresh_token?: string;
}

/**
 * Runs the authorization code flow under `referenceId`. A request for the
 * `resource` gets a JWT access token, and one for `offline_access` also gets a
 * refresh token.
 */
async function authorize(
	server: TestServer,
	{
		referenceId,
		offline = true,
		jwtAccessToken = false,
	}: { referenceId?: string; offline?: boolean; jwtAccessToken?: boolean } = {},
) {
	const { client, headers, oauthClient, state } = server;
	state.referenceId = referenceId;
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

async function createConsent(
	{ auth, oauthClient, user }: TestServer,
	referenceId?: string,
) {
	const ctx = await auth.$context;
	return ctx.adapter.create<{ id: string }>({
		model: "oauthConsent",
		data: {
			clientId: oauthClient.client_id,
			userId: user.id,
			referenceId,
			scopes: ["openid", "offline_access"],
			createdAt: new Date(),
			updatedAt: new Date(),
		},
	});
}

function deleteConsent({ auth, headers }: TestServer, id: string) {
	return auth.api.deleteOAuthConsent({ headers, body: { id } });
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

async function countStoredTokens(server: TestServer, referenceId?: string) {
	const ctx = await server.auth.$context;
	const where = [
		{ field: "clientId", value: server.oauthClient.client_id },
		{ field: "referenceId", value: referenceId ?? null },
	];
	return {
		access: await ctx.adapter.count({ model: "oauthAccessToken", where }),
		refresh: await ctx.adapter.count({ model: "oauthRefreshToken", where }),
	};
}

/**
 * Deleting a consent is the way a user cuts off a client, and refresh tokens
 * slide with no absolute lifetime, so the consent's tokens end with it.
 *
 * @see https://github.com/better-auth/better-auth/issues/10386
 */
describe("oauth-provider - deleting a consent revokes its tokens", async () => {
	const server = await setup({ revocableJwtAccessTokens: true });

	it("revokes the opaque and JWT tokens of the consent's reference and keeps the other references", async () => {
		const opaque = await authorize(server, { referenceId: "org-a" });
		const jwtGrant = await authorize(server, {
			referenceId: "org-a",
			jwtAccessToken: true,
		});
		const otherReference = await authorize(server, {
			referenceId: "org-b",
			jwtAccessToken: true,
		});
		const noReference = await authorize(server);
		const consent = await createConsent(server, "org-a");

		await deleteConsent(server, consent.id);

		expect(await isActive(server, opaque.access_token)).toBe(false);
		expect(await isActive(server, jwtGrant.access_token)).toBe(false);
		expect(await refreshStatus(server, opaque.refresh_token!)).toBe(400);
		expect(await refreshStatus(server, jwtGrant.refresh_token!)).toBe(400);
		expect(await countStoredTokens(server, "org-a")).toEqual({
			access: 0,
			refresh: 0,
		});
		for (const kept of [otherReference, noReference]) {
			expect(await isActive(server, kept.access_token)).toBe(true);
			expect(await refreshStatus(server, kept.refresh_token!)).toBe(200);
		}
	});

	it("revokes every rotation of the grant, and the JWT access tokens issued before them", async () => {
		const first = await authorize(server, {
			referenceId: "org-c",
			jwtAccessToken: true,
		});
		const second = (await requestRefresh(server, first.refresh_token!)).data!;
		expect(await isActive(server, first.access_token)).toBe(true);
		expect(await isActive(server, second.access_token)).toBe(true);

		await deleteConsent(server, (await createConsent(server, "org-c")).id);

		expect(await isActive(server, first.access_token)).toBe(false);
		expect(await isActive(server, second.access_token)).toBe(false);
		expect(await refreshStatus(server, second.refresh_token!)).toBe(400);
	});

	it("revokes an opaque access token issued without a refresh token", async () => {
		const standalone = await authorize(server, {
			referenceId: "org-d",
			offline: false,
		});
		expect(await isActive(server, standalone.access_token)).toBe(true);

		await deleteConsent(server, (await createConsent(server, "org-d")).id);

		expect(await isActive(server, standalone.access_token)).toBe(false);
	});

	it("revokes tokens stored without a grant ID", async () => {
		const grant = await authorize(server, { referenceId: "org-e" });
		const ctx = await server.auth.$context;
		for (const model of ["oauthRefreshToken", "oauthAccessToken"]) {
			await ctx.adapter.updateMany({
				model,
				where: [{ field: "referenceId", value: "org-e" }],
				update: { grantId: null },
			});
		}

		await deleteConsent(server, (await createConsent(server, "org-e")).id);

		expect(await isActive(server, grant.access_token)).toBe(false);
		expect(await refreshStatus(server, grant.refresh_token!)).toBe(400);
	});

	it("keeps the consent when the revocation fails, so the user can retry", async () => {
		const grant = await authorize(server, { referenceId: "org-f" });
		const consent = await createConsent(server, "org-f");
		const ctx = await server.auth.$context;
		const deleteMany = ctx.adapter.deleteMany.bind(ctx.adapter);
		const spy = vi.spyOn(ctx.adapter, "deleteMany");
		spy.mockImplementation(async (...args) => {
			if (args[0].model === "oauthRefreshToken") {
				throw new Error("storage unavailable");
			}
			return deleteMany(...args);
		});
		try {
			await expect(deleteConsent(server, consent.id)).rejects.toThrow();
		} finally {
			spy.mockRestore();
		}
		expect(
			await ctx.adapter.findOne({
				model: "oauthConsent",
				where: [{ field: "id", value: consent.id }],
			}),
		).not.toBeNull();

		await deleteConsent(server, consent.id);

		expect(await isActive(server, grant.access_token)).toBe(false);
		expect(await refreshStatus(server, grant.refresh_token!)).toBe(400);
	});

	it("keeps the tokens when a grant cannot be marked revoked, so a retry still revokes the JWT access token", async () => {
		const grant = await authorize(server, {
			referenceId: "org-h",
			jwtAccessToken: true,
		});
		const consent = await createConsent(server, "org-h");
		const ctx = await server.auth.$context;
		const spy = vi.spyOn(ctx.internalAdapter, "createVerificationValue");
		spy.mockRejectedValue(new Error("verification store unavailable"));
		try {
			await expect(deleteConsent(server, consent.id)).rejects.toThrow();
		} finally {
			spy.mockRestore();
		}

		await deleteConsent(server, consent.id);

		expect(await isActive(server, grant.access_token)).toBe(false);
		expect(await refreshStatus(server, grant.refresh_token!)).toBe(400);
	});

	/**
	 * The rotation consumed its parent before the consent was deleted and
	 * stores its refresh token after, so the delete misses that row.
	 *
	 * @see https://datatracker.ietf.org/doc/html/rfc9700#section-4.14.2
	 */
	it("fails a rotation that stores its refresh token after the consent was deleted", async () => {
		const first = await authorize(server, { referenceId: "org-g" });
		const consent = await createConsent(server, "org-g");
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
			await deleteConsent(server, consent.id);
			released.resolve();

			expect(await rotating).toBe(400);
			expect(await countStoredTokens(server, "org-g")).toEqual({
				access: 0,
				refresh: 0,
			});
		} finally {
			released.resolve();
			spy.mockRestore();
		}
	});
});

describe("oauth-provider - deleting a consent without revocable JWT access tokens", async () => {
	const server = await setup();

	it("revokes the refresh token and keeps the JWT access token until it expires", async () => {
		const grant = await authorize(server, {
			referenceId: "org-h",
			jwtAccessToken: true,
		});

		await deleteConsent(server, (await createConsent(server, "org-h")).id);

		expect(await refreshStatus(server, grant.refresh_token!)).toBe(400);
		expect(await isActive(server, grant.access_token)).toBe(true);
	});
});
