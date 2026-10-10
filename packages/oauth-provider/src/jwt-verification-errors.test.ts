import { createAuthClient } from "better-auth/client";
import { generateRandomString } from "better-auth/crypto";
import {
	authorizationCodeRequest,
	createAuthorizationURL,
} from "better-auth/oauth2";
import { jwt } from "better-auth/plugins/jwt";
import { getTestInstance } from "better-auth/test";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import {
	afterEach,
	beforeAll,
	beforeEach,
	describe,
	expect,
	it,
	vi,
} from "vitest";
import { oauthProviderClient } from "./client";
import { oauthProvider } from "./oauth";
import type { OAuthOptions, Scope } from "./types";
import type { OAuthClient } from "./types/oauth";

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

async function setup(
	jwtPlugin: ReturnType<typeof jwt>,
	providerOptions?: Partial<OAuthOptions<Scope[]>>,
) {
	const { auth, signInWithTestUser, customFetchImpl } = await getTestInstance({
		baseURL: authServerBaseUrl,
		plugins: [
			jwtPlugin,
			oauthProvider({
				loginPage: "/login",
				consentPage: "/consent",
				resources: [validResource],
				enforcePerClientResources: false,
				...providerOptions,
			}),
		],
	});
	const { headers } = await signInWithTestUser();
	const client = createAuthClient({
		plugins: [oauthProviderClient()],
		baseURL: authServerBaseUrl,
		fetchOptions: {
			customFetchImpl,
			headers,
		},
	});
	return { auth, headers, client };
}

async function getAccessToken(
	{
		client,
		headers,
		oauthClient,
	}: Pick<Awaited<ReturnType<typeof setup>>, "client" | "headers"> & {
		oauthClient: OAuthClient | null;
	},
	resource?: string,
) {
	const codeVerifier = generateRandomString(32);
	const authUrl = await createAuthorizationURL({
		id: "test",
		options: {
			clientId: oauthClient!.client_id!,
			clientSecret: oauthClient!.client_secret!,
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
			clientId: oauthClient!.client_id!,
			clientSecret: oauthClient!.client_secret!,
			redirectURI: redirectUri,
		},
	});
	const tokens = await client.$fetch<{ access_token?: string }>(
		"/oauth2/token",
		{ method: "POST", body, headers: tokenHeaders },
	);
	return tokens.data!.access_token!;
}

async function createClient(
	auth: Awaited<ReturnType<typeof setup>>["auth"],
	headers: Headers,
) {
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
	return oauthClient;
}

/**
 * @see https://github.com/better-auth/better-auth/issues/11595
 */
describe("oauth-provider - JWT access tokens that fail verification", async () => {
	const { auth, headers, client } = await setup(
		jwt({ jwt: { issuer: authServerBaseUrl } }),
	);

	let oauthClient: OAuthClient | null = null;

	beforeAll(async () => {
		oauthClient = await createClient(auth, headers);
	});

	const accessToken = (resource?: string) =>
		getAccessToken({ client, headers, oauthClient }, resource);

	const invalidTokens: [string, () => Promise<string>][] = [
		["alg:none", async () => ALG_NONE_TOKEN],
		[
			"tampered signature",
			async () => tamperSignature(await accessToken(validResource)),
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
		const token = await accessToken(validResource);
		expect(token.split(".")).toHaveLength(3);
		const introspection = await client.oauth2.introspect(
			{
				client_id: oauthClient?.client_id,
				client_secret: oauthClient?.client_secret,
				token,
				token_type_hint: "access_token",
			},
			{ headers: formHeaders },
		);
		expect(introspection.data?.active).toBe(true);
		const userinfo = await client.$fetch<{ sub?: string }>("/oauth2/userinfo", {
			headers: { authorization: `Bearer ${token}` },
		});
		expect(userinfo.error).toBeNull();
		expect(userinfo.data?.sub).toBeDefined();
	});

	it("still falls through to opaque access token validation", async () => {
		const token = await accessToken();
		expect(token.split(".")).not.toHaveLength(3);
		const introspection = await client.oauth2.introspect(
			{
				client_id: oauthClient?.client_id,
				client_secret: oauthClient?.client_secret,
				token,
				token_type_hint: "access_token",
			},
			{ headers: formHeaders },
		);
		expect(introspection.data?.active).toBe(true);
		const userinfo = await client.$fetch<{ sub?: string }>("/oauth2/userinfo", {
			headers: { authorization: `Bearer ${token}` },
		});
		expect(userinfo.error).toBeNull();
		expect(userinfo.data?.sub).toBeDefined();
	});

	it.each(
		invalidTokens,
	)("introspects a JWT with %s as inactive", async (_, getToken) => {
		const introspection = await client.oauth2.introspect(
			{
				client_id: oauthClient?.client_id,
				client_secret: oauthClient?.client_secret,
				token: await getToken(),
				token_type_hint: "access_token",
			},
			{ headers: formHeaders },
		);
		expect(introspection.error).toBeNull();
		expect(introspection.data).toEqual({ active: false });
	});

	it.each(
		invalidTokens,
	)("rejects a JWT with %s at userinfo with invalid_token", async (_, getToken) => {
		let wwwAuthenticate = "";
		const userinfo = await client.$fetch("/oauth2/userinfo", {
			headers: { authorization: `Bearer ${await getToken()}` },
			onError(context) {
				wwwAuthenticate =
					context.response.headers.get("WWW-Authenticate") ?? "";
			},
		});
		expect(userinfo.error?.status).toBe(401);
		expect(userinfo.error).toMatchObject({ error: "invalid_token" });
		expect(wwwAuthenticate).toBe(INVALID_ACCESS_TOKEN_CHALLENGE);
	});

	it.each(
		invalidTokens,
	)("answers a JWT with %s at revocation as for any unknown token", async (_, getToken) => {
		const revoke = async (token: string) =>
			(
				await client.oauth2.revoke(
					{
						client_id: oauthClient?.client_id,
						client_secret: oauthClient?.client_secret,
						token,
					},
					{ headers: formHeaders },
				)
			).error;
		const error = await revoke(await getToken());
		expect(error?.status).not.toBe(500);
		expect(error).toEqual(await revoke("unknown-opaque-token"));
	});
});

describe("oauth-provider - JWT-shaped opaque access tokens", async () => {
	const { auth, headers, client } = await setup(
		jwt({ jwt: { issuer: authServerBaseUrl } }),
		{
			// A custom opaque format that is a JWS signed by a key this server's
			// JWKS does not contain.
			generateOpaqueAccessToken: () => signWithUnknownKey("custom-opaque"),
		},
	);

	let oauthClient: OAuthClient | null = null;

	beforeAll(async () => {
		oauthClient = await createClient(auth, headers);
	});

	function introspect(token: string) {
		return client.oauth2.introspect(
			{
				client_id: oauthClient?.client_id,
				client_secret: oauthClient?.client_secret,
				token,
				token_type_hint: "access_token",
			},
			{ headers: formHeaders },
		);
	}

	it("validates and revokes them as opaque tokens", async () => {
		const token = await getAccessToken({ client, headers, oauthClient });
		expect(token.split(".")).toHaveLength(3);

		expect((await introspect(token)).data?.active).toBe(true);
		const userinfo = await client.$fetch<{ sub?: string }>("/oauth2/userinfo", {
			headers: { authorization: `Bearer ${token}` },
		});
		expect(userinfo.data?.sub).toBeDefined();

		const revocation = await client.oauth2.revoke(
			{
				client_id: oauthClient?.client_id,
				client_secret: oauthClient?.client_secret,
				token,
				token_type_hint: "access_token",
			},
			{ headers: formHeaders },
		);
		expect(revocation.error).toBeNull();
		expect((await introspect(token)).data?.active).toBe(false);
	});
});

describe("oauth-provider - JWKS failures during access token verification", async () => {
	const jwksUrl = "https://jwks.example.com/jwks";
	const kid = "duplicated-kid";
	const { privateKey, publicKey } = await generateKeyPair("EdDSA", {
		extractable: true,
	});
	const publicJwk = { ...(await exportJWK(publicKey)), kid, alg: "EdDSA" };
	const { auth, headers, client } = await setup(
		jwt({
			jwt: { issuer: authServerBaseUrl },
			jwks: { remoteUrl: jwksUrl, keyPairConfig: { alg: "EdDSA" } },
		}),
	);

	let oauthClient: OAuthClient | null = null;

	beforeAll(async () => {
		oauthClient = await auth.api.adminCreateOAuthClient({
			headers,
			body: {
				redirect_uris: [redirectUri],
				application_type: "native",
				token_endpoint_auth_method: "client_secret_post",
				skip_consent: true,
			},
		});
		expect(oauthClient?.client_id).toBeDefined();
	});

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
		const introspection = await client.oauth2.introspect(
			{
				client_id: oauthClient?.client_id,
				client_secret: oauthClient?.client_secret,
				token: await signAccessToken(privateKey, kid),
				token_type_hint: "access_token",
			},
			{ headers: formHeaders },
		);
		expect(introspection.error?.status).toBe(500);
	});

	it("surfaces the key set failure at userinfo", async () => {
		const userinfo = await client.$fetch("/oauth2/userinfo", {
			headers: {
				authorization: `Bearer ${await signAccessToken(privateKey, kid)}`,
			},
		});
		expect(userinfo.error?.status).toBe(500);
	});

	it("surfaces the key set failure at revocation", async () => {
		const revocation = await client.oauth2.revoke(
			{
				client_id: oauthClient?.client_id,
				client_secret: oauthClient?.client_secret,
				token: await signAccessToken(privateKey, kid),
			},
			{ headers: formHeaders },
		);
		expect(revocation.error?.status).toBe(500);
	});
});
