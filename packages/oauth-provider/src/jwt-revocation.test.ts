import type { GenericEndpointContext } from "@better-auth/core";
import { createAuthEndpoint } from "@better-auth/core/api";
import type { BetterAuthOptions, BetterAuthPlugin } from "better-auth";
import { generateRandomString } from "better-auth/crypto";
import {
	authorizationCodeRequest,
	createAuthorizationURL,
} from "better-auth/oauth2";
import { jwt } from "better-auth/plugins/jwt";
import { getTestInstance } from "better-auth/test";
import { decodeJwt } from "jose";
import { describe, expect, it, vi } from "vitest";
import * as z from "zod";
import { oauthProviderClient } from "./client";
import { oauthProvider } from "./oauth";
import { getOAuthProviderApi } from "./token";
import type { OAuthOptions, Scope } from "./types";

const authServerBaseUrl = "http://localhost:3000";
const rpBaseUrl = "http://localhost:5000";
const validResource = "https://myapi.example.com";
const redirectUri = `${rpBaseUrl}/api/auth/oauth2/callback/test`;
const formHeaders = {
	accept: "application/json",
	"content-type": "application/x-www-form-urlencoded",
};

// Exposes the provider API's `validateAccessToken` to the test.
const validateProbe = {
	id: "test-validate-access-token",
	endpoints: {
		testValidateAccessToken: createAuthEndpoint(
			"/test/validate-access-token",
			{ method: "POST", body: z.object({ token: z.string() }) },
			async (ctx: GenericEndpointContext) => {
				const provider = getOAuthProviderApi(
					ctx,
					ctx.context.getPlugin("oauth-provider")!.options,
				);
				const payload = await provider.validateAccessToken(
					(ctx.body as { token: string }).token,
				);
				return ctx.json({ active: payload.active === true });
			},
		),
	},
} satisfies BetterAuthPlugin;

function createSecondaryStorage() {
	const store = new Map<string, string>();
	const ttls = new Map<string, number | undefined>();
	return {
		store,
		ttls,
		storage: {
			set(key: string, value: string, ttl?: number) {
				store.set(key, value);
				ttls.set(key, ttl);
			},
			get(key: string) {
				return store.get(key) ?? null;
			},
			getAndDelete(key: string) {
				const value = store.get(key) ?? null;
				store.delete(key);
				return value;
			},
			increment(key: string) {
				const count = Number(store.get(key) ?? 0) + 1;
				store.set(key, String(count));
				return count;
			},
			delete(key: string) {
				store.delete(key);
			},
		},
	};
}

async function setup(
	providerOptions?: Partial<OAuthOptions<Scope[]>>,
	authOptions?: Partial<BetterAuthOptions>,
) {
	const { auth, client, signInWithTestUser } = await getTestInstance(
		{
			baseURL: authServerBaseUrl,
			...authOptions,
			plugins: [
				jwt({ jwt: { issuer: authServerBaseUrl } }),
				oauthProvider({
					loginPage: "/login",
					consentPage: "/consent",
					resources: [validResource],
					enforcePerClientResources: false,
					...providerOptions,
				}),
				validateProbe,
			],
		},
		{ clientOptions: { plugins: [oauthProviderClient()] } },
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
	expect(oauthClient?.client_id).toBeDefined();
	return { auth, headers, client, oauthClient };
}

type TestServer = Awaited<ReturnType<typeof setup>>;

async function getAccessToken({ client, headers, oauthClient }: TestServer) {
	const codeVerifier = generateRandomString(32);
	const authUrl = await createAuthorizationURL({
		id: "test",
		options: {
			clientId: oauthClient.client_id,
			clientSecret: oauthClient.client_secret!,
			redirectURI: redirectUri,
		},
		redirectURI: "",
		authorizationEndpoint: `${authServerBaseUrl}/api/auth/oauth2/authorize`,
		state: "123",
		scopes: ["openid", "profile", "email"],
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
		resource: validResource,
		options: {
			clientId: oauthClient.client_id,
			clientSecret: oauthClient.client_secret!,
			redirectURI: redirectUri,
		},
	});
	const tokens = await client.$fetch<{ access_token?: string }>(
		"/oauth2/token",
		{ method: "POST", body, headers: tokenHeaders },
	);
	const accessToken = tokens.data!.access_token!;
	expect(accessToken.split(".")).toHaveLength(3);
	return accessToken;
}

async function isActiveAtIntrospection(
	{ client, oauthClient }: TestServer,
	token: string,
) {
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

async function userinfoStatus({ client }: TestServer, token: string) {
	let status = 200;
	await client.$fetch("/oauth2/userinfo", {
		headers: { authorization: `Bearer ${token}` },
		onError(context) {
			status = context.response.status;
		},
	});
	return status;
}

async function isActiveAtProviderApi({ auth }: TestServer, token: string) {
	const res = await auth.api.testValidateAccessToken({ body: { token } });
	return res.active;
}

function revoke(
	{ client, oauthClient }: TestServer,
	token: string,
	caller: { client_id: string; client_secret?: string } = oauthClient,
) {
	return client.oauth2.revoke(
		{
			client_id: caller.client_id,
			client_secret: caller.client_secret,
			token,
		},
		{ headers: formHeaders },
	);
}

describe("oauth-provider - revocable JWT access tokens", async () => {
	const server = await setup({ revocableJwtAccessTokens: true });

	it("revokes a JWT access token at introspection, UserInfo, and validateAccessToken", async () => {
		const revoked = await getAccessToken(server);
		const untouched = await getAccessToken(server);
		expect(await isActiveAtIntrospection(server, revoked)).toBe(true);
		expect(await userinfoStatus(server, revoked)).toBe(200);
		expect(await isActiveAtProviderApi(server, revoked)).toBe(true);

		const revocation = await revoke(server, revoked);
		expect(revocation.error).toBe(null);

		expect(await isActiveAtIntrospection(server, revoked)).toBe(false);
		expect(await userinfoStatus(server, revoked)).toBe(401);
		expect(await isActiveAtProviderApi(server, revoked)).toBe(false);

		// Revocation targets one `jti`, not the grant or the session.
		expect(await isActiveAtIntrospection(server, untouched)).toBe(true);
		expect(await userinfoStatus(server, untouched)).toBe(200);
	});

	it("answers 200 when the same token is revoked again", async () => {
		const token = await getAccessToken(server);
		expect((await revoke(server, token)).error).toBe(null);
		expect((await revoke(server, token)).error).toBe(null);
	});

	it("refuses to revoke another client's JWT access token", async () => {
		const token = await getAccessToken(server);
		const other = await server.auth.api.adminCreateOAuthClient({
			headers: server.headers,
			body: {
				redirect_uris: [redirectUri],
				application_type: "native",
				token_endpoint_auth_method: "client_secret_post",
				skip_consent: true,
			},
		});
		const revocation = await revoke(server, token, other);
		expect(revocation.error?.status).toBe(400);
		expect(await isActiveAtIntrospection(server, token)).toBe(true);
	});
});

describe("oauth-provider - revocable JWT access tokens in secondary storage", async () => {
	const { store, ttls, storage } = createSecondaryStorage();
	const server = await setup(
		{ revocableJwtAccessTokens: true },
		{
			secondaryStorage: storage,
			session: { storeSessionInDatabase: true },
		},
	);

	it("stores the marker with a TTL that ends at the token's exp", async () => {
		const token = await getAccessToken(server);
		const { jti, exp } = decodeJwt(token);
		expect((await revoke(server, token)).error).toBe(null);

		const key = [...store.keys()].find(
			(k) => k.startsWith("verification:") && k.includes(jti!),
		);
		expect(key).toBeDefined();
		const ttl = ttls.get(key!)!;
		const remaining = exp! - Math.floor(Date.now() / 1000);
		expect(ttl).toBeGreaterThan(0);
		expect(Math.abs(ttl - remaining)).toBeLessThanOrEqual(2);
		expect(await isActiveAtIntrospection(server, token)).toBe(false);
	});
});

describe("oauth-provider - revocable JWT access tokens with hashed identifiers", async () => {
	const server = await setup(
		{ revocableJwtAccessTokens: true },
		{ verification: { storeIdentifier: "hashed" } },
	);

	it("finds the hashed marker at introspection and UserInfo", async () => {
		const token = await getAccessToken(server);
		expect((await revoke(server, token)).error).toBe(null);
		expect(await isActiveAtIntrospection(server, token)).toBe(false);
		expect(await userinfoStatus(server, token)).toBe(401);
	});
});

describe("oauth-provider - JWT access token revocation disabled", async () => {
	const server = await setup();

	it("keeps answering unsupported_token_type without reading or writing markers", async () => {
		const token = await getAccessToken(server);
		const ctx = await server.auth.$context;
		const find = vi.spyOn(ctx.internalAdapter, "findVerificationValue");
		const create = vi.spyOn(ctx.internalAdapter, "createVerificationValue");
		try {
			const revocation = await revoke(server, token);
			expect(revocation.error?.status).toBe(400);
			expect(revocation.error).toMatchObject({
				error: "unsupported_token_type",
			});
			expect(await isActiveAtIntrospection(server, token)).toBe(true);
			expect(await userinfoStatus(server, token)).toBe(200);
			expect(await isActiveAtProviderApi(server, token)).toBe(true);
			expect(find).not.toHaveBeenCalled();
			expect(create).not.toHaveBeenCalled();
		} finally {
			find.mockRestore();
			create.mockRestore();
		}
	});
});
