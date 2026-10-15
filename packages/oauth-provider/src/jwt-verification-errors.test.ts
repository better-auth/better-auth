import { generateRandomString } from "better-auth/crypto";
import {
	authorizationCodeRequest,
	createAuthorizationURL,
} from "better-auth/oauth2";
import { jwt } from "better-auth/plugins/jwt";
import { getTestInstance } from "better-auth/test";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { oauthProviderClient } from "./client";
import { oauthProvider } from "./oauth";
import type { OAuthOptions, Scope } from "./types";

const authServerBaseUrl = "http://localhost:3000";
const rpBaseUrl = "http://localhost:5000";
const validResource = "https://myapi.example.com";
const redirectUri = `${rpBaseUrl}/api/auth/oauth2/callback/test`;
const formHeaders = {
	accept: "application/json",
	"content-type": "application/x-www-form-urlencoded",
};

const ALG_NONE_TOKEN = "eyJhbGciOiJub25lIn0.eyJzdWIiOiJ4In0.";
const INVALID_ACCESS_TOKEN_CHALLENGE =
	'Bearer error="invalid_token", error_description="Invalid access token"';

function signAccessToken(privateKey: CryptoKey, kid: string) {
	return new SignJWT({ sub: "x", azp: "x" })
		.setProtectedHeader({ alg: "EdDSA", kid })
		.setIssuer(authServerBaseUrl)
		.setAudience(validResource)
		.setIssuedAt()
		.setExpirationTime("1h")
		.sign(privateKey);
}

async function signWithUnknownKey(kid: string) {
	const { privateKey } = await generateKeyPair("EdDSA");
	return signAccessToken(privateKey, kid);
}

function tamperSignature(token: string) {
	const [header, payload, signature] = token.split(".");
	const tampered = `${signature![0] === "A" ? "B" : "A"}${signature!.slice(1)}`;
	return `${header}.${payload}.${tampered}`;
}

/**
 * Starts an auth server with the oauth provider and registers one
 * confidential client on it.
 */
async function setup(
	jwtPlugin: ReturnType<typeof jwt> | null,
	providerOptions?: Partial<OAuthOptions<Scope[]>>,
) {
	const { auth, client, signInWithTestUser } = await getTestInstance(
		{
			baseURL: authServerBaseUrl,
			plugins: [
				...(jwtPlugin ? [jwtPlugin] : []),
				oauthProvider({
					loginPage: "/login",
					consentPage: "/consent",
					resources: [validResource],
					enforcePerClientResources: false,
					...providerOptions,
				}),
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

async function getAccessToken(
	{ client, headers, oauthClient }: TestServer,
	resource?: string,
) {
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
		resource,
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
	return tokens.data!.access_token!;
}

function introspect({ client, oauthClient }: TestServer, token: string) {
	return client.oauth2.introspect(
		{
			client_id: oauthClient.client_id,
			client_secret: oauthClient.client_secret,
			token,
			token_type_hint: "access_token",
		},
		{ headers: formHeaders },
	);
}

function revoke(
	{ client, oauthClient }: TestServer,
	token: string,
	tokenTypeHint?: "access_token",
) {
	return client.oauth2.revoke(
		{
			client_id: oauthClient.client_id,
			client_secret: oauthClient.client_secret,
			token,
			...(tokenTypeHint ? { token_type_hint: tokenTypeHint } : {}),
		},
		{ headers: formHeaders },
	);
}

function userinfo<T>(
	{ client }: TestServer,
	token: string,
	onError?: (context: { response: Response }) => void,
) {
	return client.$fetch<T>("/oauth2/userinfo", {
		headers: { authorization: `Bearer ${token}` },
		onError,
	});
}

/**
 * @see https://github.com/better-auth/better-auth/issues/11595
 */
describe("oauth-provider - JWT access tokens that fail verification", async () => {
	const server = await setup(jwt({ jwt: { issuer: authServerBaseUrl } }));
	const { auth } = server;

	const invalidTokens: [string, () => Promise<string>][] = [
		["alg:none", async () => ALG_NONE_TOKEN],
		[
			"tampered signature",
			async () => tamperSignature(await getAccessToken(server, validResource)),
		],
		["unknown kid", () => signWithUnknownKey("unknown-kid")],
		[
			"wrong issuer",
			async () => {
				const { token } = await auth.api.signJWT({
					body: {
						payload: {
							sub: "x",
							azp: "x",
							iss: "https://wrong-issuer.example.com",
							aud: validResource,
						},
					},
				});
				return token;
			},
		],
	];

	it("verifies an untampered JWT access token", async () => {
		const token = await getAccessToken(server, validResource);
		expect(token.split(".")).toHaveLength(3);
		expect((await introspect(server, token)).data?.active).toBe(true);
		const info = await userinfo<{ sub?: string }>(server, token);
		expect(info.error).toBeNull();
		expect(info.data?.sub).toBeDefined();
	});

	it("still falls through to opaque access token validation", async () => {
		const token = await getAccessToken(server);
		expect(token.split(".")).not.toHaveLength(3);
		expect((await introspect(server, token)).data?.active).toBe(true);
		const info = await userinfo<{ sub?: string }>(server, token);
		expect(info.error).toBeNull();
		expect(info.data?.sub).toBeDefined();
	});

	it.each(invalidTokens)(
		"introspects a JWT with %s as inactive",
		async (_, getToken) => {
			const introspection = await introspect(server, await getToken());
			expect(introspection.error).toBeNull();
			expect(introspection.data).toEqual({ active: false });
		},
	);

	it.each(invalidTokens)(
		"rejects a JWT with %s at userinfo with invalid_token",
		async (_, getToken) => {
			let wwwAuthenticate = "";
			const info = await userinfo(server, await getToken(), (context) => {
				wwwAuthenticate =
					context.response.headers.get("WWW-Authenticate") ?? "";
			});
			expect(info.error?.status).toBe(401);
			expect(info.error).toMatchObject({ error: "invalid_token" });
			expect(wwwAuthenticate).toBe(INVALID_ACCESS_TOKEN_CHALLENGE);
		},
	);

	it.each(invalidTokens)(
		"answers a JWT with %s at revocation as for any unknown token",
		async (_, getToken) => {
			const { error } = await revoke(server, await getToken());
			expect(error?.status).not.toBe(500);
			expect(error).toEqual(
				(await revoke(server, "unknown-opaque-token")).error,
			);
		},
	);

	it("surfaces a database failure during the revocation audience check", async () => {
		const token = await getAccessToken(server, validResource);
		const { adapter } = await auth.$context;
		const findOne = adapter.findOne.bind(adapter);
		vi.spyOn(adapter, "findOne").mockImplementation(async (args) => {
			if (args.model === "oauthResource") throw new TypeError("fetch failed");
			return findOne(args);
		});
		expect((await revoke(server, token)).error?.status).toBe(500);
	});
});

describe("oauth-provider - JWT-shaped tokens with disableJwtPlugin", async () => {
	const server = await setup(null, { disableJwtPlugin: true });

	it.each([
		["alg:none", async () => ALG_NONE_TOKEN],
		["EdDSA signature", () => signWithUnknownKey("any-kid")],
	])("answers a JWT with %s as an unknown token", async (_, getToken) => {
		const token = await getToken();
		expect((await introspect(server, token)).data, "introspection").toEqual({
			active: false,
		});
		expect((await userinfo(server, token)).error, "userinfo").toMatchObject({
			status: 401,
			error: "invalid_token",
		});
		expect((await revoke(server, token)).error, "revocation").toEqual(
			(await revoke(server, "unknown-opaque-token")).error,
		);
	});
});

describe("oauth-provider - JWT-shaped opaque access tokens", async () => {
	const server = await setup(jwt({ jwt: { issuer: authServerBaseUrl } }), {
		// A custom opaque format that is a JWS signed by a key this server's
		// JWKS does not contain.
		generateOpaqueAccessToken: () => signWithUnknownKey("custom-opaque"),
	});

	it("validates and revokes them as opaque tokens", async () => {
		const token = await getAccessToken(server);
		expect(token.split(".")).toHaveLength(3);

		expect((await introspect(server, token)).data?.active).toBe(true);
		const info = await userinfo<{ sub?: string }>(server, token);
		expect(info.data?.sub).toBeDefined();

		const revocation = await revoke(server, token, "access_token");
		expect(revocation.error).toBeNull();
		expect((await introspect(server, token)).data?.active).toBe(false);
	});
});

describe("oauth-provider - JWKS failures during access token verification", async () => {
	const jwksUrl = "https://jwks.example.com/jwks";
	const kid = "duplicated-kid";
	const { privateKey, publicKey } = await generateKeyPair("EdDSA", {
		extractable: true,
	});
	const publicJwk = { ...(await exportJWK(publicKey)), kid, alg: "EdDSA" };
	const server = await setup(
		jwt({
			jwt: { issuer: authServerBaseUrl },
			jwks: { remoteUrl: jwksUrl, keyPairConfig: { alg: "EdDSA" } },
		}),
	);

	beforeEach(() => {
		// Two keys share the token's kid, so jose cannot pick one
		// (JWKSMultipleMatchingKeys), a key set problem rather than a bad token.
		const networkFetch = globalThis.fetch.bind(globalThis);
		vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit) => {
			const requestedUrl =
				typeof input === "string"
					? input
					: input instanceof URL
						? input.href
						: input.url;
			if (requestedUrl === jwksUrl) {
				return Promise.resolve(
					Response.json({ keys: [publicJwk, { ...publicJwk }] }),
				);
			}
			return networkFetch(input, init);
		});
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("surfaces the key set failure at introspection", async () => {
		const token = await signAccessToken(privateKey, kid);
		expect((await introspect(server, token)).error?.status).toBe(500);
	});

	it("surfaces the key set failure at userinfo", async () => {
		const token = await signAccessToken(privateKey, kid);
		expect((await userinfo(server, token)).error?.status).toBe(500);
	});

	it("surfaces the key set failure at revocation", async () => {
		const token = await signAccessToken(privateKey, kid);
		expect((await revoke(server, token)).error?.status).toBe(500);
	});
});

/**
 * @see https://github.com/better-auth/better-auth/issues/11611
 */
describe("oauth-provider - unreachable remote JWKS", async () => {
	const jwksUrl = "https://jwks-down.example.com/jwks";
	const server = await setup(
		jwt({
			jwt: { issuer: authServerBaseUrl },
			jwks: { remoteUrl: jwksUrl, keyPairConfig: { alg: "EdDSA" } },
		}),
	);

	beforeEach(() => {
		// A refused connection: `fetch` rejects with a TypeError.
		const networkFetch = globalThis.fetch.bind(globalThis);
		vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit) => {
			const requestedUrl =
				typeof input === "string"
					? input
					: input instanceof URL
						? input.href
						: input.url;
			if (requestedUrl === jwksUrl) {
				return Promise.reject(new TypeError("fetch failed"));
			}
			return networkFetch(input, init);
		});
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("surfaces the outage at introspection", async () => {
		const token = await signWithUnknownKey("remote-kid");
		expect((await introspect(server, token)).error?.status).toBe(500);
	});

	it("surfaces the outage at userinfo", async () => {
		const token = await signWithUnknownKey("remote-kid");
		expect((await userinfo(server, token)).error?.status).toBe(500);
	});

	it("surfaces the outage at revocation", async () => {
		const token = await signWithUnknownKey("remote-kid");
		expect((await revoke(server, token)).error?.status).toBe(500);
	});
});
