import type { GenericEndpointContext } from "@better-auth/core";
import {
	authorizationCodeRequest,
	CLIENT_ASSERTION_TYPE,
	createAuthorizationURL,
	generateCodeChallenge,
} from "@better-auth/core/oauth2";
import { generateRandomString } from "better-auth/crypto";
import { jwt, signJWT } from "better-auth/plugins/jwt";
import { getTestInstance } from "better-auth/test";
import { decodeJwt, exportJWK, generateKeyPair, SignJWT } from "jose";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { oauthProviderResourceClient } from "./client-resource";
import { oauthProvider } from "./oauth";

/**
 * A `baseURL` that already has a path keeps its trailing slash, so joining an
 * endpoint path onto it must not leave `//`. The empty segment makes a
 * different URI, because normalization removes only dot-segments.
 * @see https://www.rfc-editor.org/rfc/rfc3986#section-3.3
 * @see https://www.rfc-editor.org/rfc/rfc3986#section-6.2.2.3
 */
describe("baseURL with a trailing slash", async () => {
	const { auth, signInWithTestUser, customFetchImpl } = await getTestInstance({
		baseURL: "http://localhost:3000/api/auth/",
		plugins: [
			jwt(),
			oauthProvider({
				loginPage: "/login",
				consentPage: "/consent",
				// Endpoint audiences are built from baseURL only in this mode.
				assertionAudience: "issuer-or-endpoint",
			}),
		],
	});
	const { headers } = await signInWithTestUser();

	it("advertises endpoint URLs that route", async () => {
		const metadata = await auth.api.getOAuthServerConfig();
		for (const url of [
			metadata.authorization_endpoint,
			metadata.token_endpoint,
			metadata.introspection_endpoint,
			metadata.revocation_endpoint,
		]) {
			expect(url).not.toMatch(/[^:]\/\//);
		}
		const response = await customFetchImpl(metadata.token_endpoint, {
			method: "POST",
			headers: { "content-type": "application/x-www-form-urlencoded" },
			body: new URLSearchParams({ grant_type: "client_credentials" }),
		});
		expect(response.status).not.toBe(404);
	});

	it("accepts a client assertion for the advertised token endpoint", async () => {
		const { privateKey, publicKey } = await generateKeyPair("RS256", {
			extractable: true,
		});
		const client = await auth.api.adminCreateOAuthClient({
			headers,
			body: {
				token_endpoint_auth_method: "private_key_jwt",
				grant_types: ["client_credentials"],
				scope: "openid",
				jwks: {
					keys: [{ ...(await exportJWK(publicKey)), kid: "k", alg: "RS256" }],
				},
			},
		});
		const { token_endpoint: tokenEndpoint } =
			await auth.api.getOAuthServerConfig();
		const now = Math.floor(Date.now() / 1000);
		const assertion = await new SignJWT({})
			.setProtectedHeader({ alg: "RS256", kid: "k" })
			.setIssuer(client.client_id)
			.setSubject(client.client_id)
			.setAudience(tokenEndpoint)
			.setIssuedAt(now)
			.setExpirationTime(now + 60)
			.setJti(generateRandomString(16))
			.sign(privateKey);
		const response = await customFetchImpl(tokenEndpoint, {
			method: "POST",
			headers: { "content-type": "application/x-www-form-urlencoded" },
			body: new URLSearchParams({
				grant_type: "client_credentials",
				scope: "openid",
				client_assertion_type: CLIENT_ASSERTION_TYPE,
				client_assertion: assertion,
			}),
		});
		// The client has no client_credentials scopes, so a rejection after
		// authentication shows the assertion audience was accepted.
		expect(response.status).toBe(400);
		expect(await response.json()).toMatchObject({
			error: "unauthorized_client",
		});
	});
});

async function createIssuerInstance(
	baseURL: string,
	jwtOptions?: Parameters<typeof jwt>[0],
) {
	const instance = await getTestInstance({
		baseURL,
		plugins: [
			jwt(jwtOptions),
			oauthProvider({ loginPage: "/login", consentPage: "/consent" }),
		],
	});
	const { headers: sessionHeaders } = await instance.signInWithTestUser();
	return { ...instance, sessionHeaders };
}

type IssuerInstance = Awaited<ReturnType<typeof createIssuerInstance>>;

async function issueIdToken(instance: IssuerInstance) {
	const { auth, customFetchImpl, sessionHeaders } = instance;
	const redirectUri = "https://rp.example.test/callback";
	const client = await auth.api.adminCreateOAuthClient({
		headers: sessionHeaders,
		body: {
			redirect_uris: [redirectUri],
			token_endpoint_auth_method: "client_secret_post",
			skip_consent: true,
			enable_end_session: true,
		},
	});
	const metadata = await auth.api.getOpenIdConfig();
	const codeVerifier = generateRandomString(32);
	const options = {
		clientId: client.client_id,
		clientSecret: client.client_secret,
		redirectURI: redirectUri,
	};
	const authorizationURL = await createAuthorizationURL({
		id: "trailing-slash",
		options,
		redirectURI: redirectUri,
		authorizationEndpoint: metadata.authorization_endpoint,
		state: "state",
		scopes: ["openid"],
		codeVerifier,
	});
	const authorization = await customFetchImpl(authorizationURL.toString(), {
		headers: sessionHeaders,
		redirect: "manual",
	});
	const code = new URL(
		authorization.headers.get("location") ?? "",
	).searchParams.get("code");
	expect(code).toBeTruthy();
	const tokenRequest = await authorizationCodeRequest({
		code: code!,
		codeVerifier,
		redirectURI: redirectUri,
		options,
	});
	const tokenResponse = await customFetchImpl(metadata.token_endpoint, {
		method: "POST",
		headers: tokenRequest.headers,
		body: tokenRequest.body,
	});
	expect(tokenResponse.status).toBe(200);
	const { id_token: idToken } = (await tokenResponse.json()) as {
		id_token: string;
	};
	return { idToken, clientId: client.client_id, metadata };
}

async function endSessionWithHint(
	instance: IssuerInstance,
	metadata: { end_session_endpoint?: string },
	idTokenHint: string,
) {
	const endSession = new URL(metadata.end_session_endpoint!);
	endSession.searchParams.set("id_token_hint", idTokenHint);
	return instance.customFetchImpl(endSession.toString(), {
		headers: instance.sessionHeaders,
		redirect: "manual",
	});
}

/**
 * ID tokens carry the discovery issuer. The hint check accepts the configured
 * issuer on tokens issued before the upgrade.
 * @see https://openid.net/specs/openid-connect-rpinitiated-1_0.html#RPLogout
 */
describe("end-session id_token_hint issuer forms", () => {
	it("accepts an ID token it issued when baseURL ends with a slash", async () => {
		const instance = await createIssuerInstance(
			"http://localhost:3000/api/auth/",
		);
		const { idToken, metadata } = await issueIdToken(instance);
		expect(decodeJwt(idToken).iss).toBe(metadata.issuer);
		expect(metadata.issuer).toBe("http://localhost:3000/api/auth");

		const response = await endSessionWithHint(instance, metadata, idToken);

		expect(response.status).toBe(200);
		expect(
			await instance.auth.api.getSession({ headers: instance.sessionHeaders }),
		).toBeNull();
	});

	it("accepts an ID token it issued when jwt.issuer ends with a slash", async () => {
		const instance = await createIssuerInstance(
			"http://localhost:3000/api/auth",
			{ jwt: { issuer: "http://localhost:3000/api/auth/" } },
		);
		const { idToken, metadata } = await issueIdToken(instance);
		expect(decodeJwt(idToken).iss).toBe(metadata.issuer);

		const response = await endSessionWithHint(instance, metadata, idToken);

		expect(response.status).toBe(200);
		expect(
			await instance.auth.api.getSession({ headers: instance.sessionHeaders }),
		).toBeNull();
	});

	it("rejects a hint signed with the provider's keys under a foreign issuer", async () => {
		const instance = await createIssuerInstance(
			"http://localhost:3000/api/auth/",
		);
		const { idToken, clientId, metadata } = await issueIdToken(instance);
		const { sid, sub } = decodeJwt(idToken);
		const { token: foreignHint } = await instance.auth.api.signJWT({
			body: {
				payload: {
					iss: "https://other.example.test/api/auth/",
					aud: clientId,
					sub,
					sid,
				},
			},
		});

		const response = await endSessionWithHint(instance, metadata, foreignHint);

		expect(response.status).toBe(401);
		expect(await response.json()).toMatchObject({ error: "invalid_token" });
		expect(
			await instance.auth.api.getSession({ headers: instance.sessionHeaders }),
		).not.toBeNull();
	});
});

/**
 * Discovery and every token this server issues name one issuer, so a verifier
 * that takes the issuer from discovery accepts all of them. The `baseURL` keeps
 * its trailing slash, and the issuer does not. Tokens issued by earlier
 * versions carry the `baseURL` as configured, and the server still accepts them.
 * @see https://openid.net/specs/openid-connect-discovery-1_0.html#ProviderConfigurationValidation
 * @see https://www.rfc-editor.org/rfc/rfc9068#section-4
 */
describe("issuer with a trailing-slash baseURL", async () => {
	const resource = "https://api.example.com";
	const rpOrigin = "https://rp.example.com";
	const redirectUri = `${rpOrigin}/callback`;
	const backchannelLogoutUri = `${rpOrigin}/backchannel-logout`;
	const configuredIssuer = "http://localhost:3000/api/auth/";
	const { auth, signInWithTestUser, customFetchImpl } = await getTestInstance({
		baseURL: configuredIssuer,
		// The relying party's name never resolves here, so the logout delivery
		// check must not look it up.
		trustedOrigins: [rpOrigin],
		plugins: [
			jwt(),
			oauthProvider({
				loginPage: "/login",
				consentPage: "/consent",
				resources: [resource],
			}),
		],
	});
	const metadata = await auth.api.getOpenIdConfig();
	const context = await auth.$context;
	/** Re-signs a JWT access token with the issuer exactly as configured. */
	const withConfiguredIssuer = (token: string) =>
		signJWT({ context } as GenericEndpointContext, {
			payload: { ...decodeJwt(token), iss: configuredIssuer },
			header: { typ: "at+jwt" },
		});
	const logoutTokens: string[] = [];

	beforeEach(() => {
		logoutTokens.length = 0;
		const networkFetch = globalThis.fetch.bind(globalThis);
		vi.stubGlobal(
			"fetch",
			async (input: RequestInfo | URL, init?: RequestInit) => {
				const url = input instanceof Request ? input.url : String(input);
				if (url !== backchannelLogoutUri) return networkFetch(input, init);
				const body = new URLSearchParams(String(init?.body));
				logoutTokens.push(body.get("logout_token") ?? "");
				return new Response(null, { status: 200 });
			},
		);
	});
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	async function createClient() {
		const { headers } = await signInWithTestUser();
		const client = await auth.api.adminCreateOAuthClient({
			headers,
			body: {
				redirect_uris: [redirectUri],
				token_endpoint_auth_method: "client_secret_post",
				scope: "openid offline_access",
				skip_consent: true,
				enable_end_session: true,
				backchannel_logout_uri: backchannelLogoutUri,
				resources: [resource],
			},
		});
		return { client, headers };
	}

	async function issueTokens(options: { resource?: string } = {}) {
		const { client, headers } = await createClient();
		const codeVerifier = generateRandomString(43);
		const authorizationUrl = new URL(metadata.authorization_endpoint);
		authorizationUrl.search = new URLSearchParams({
			response_type: "code",
			client_id: client.client_id,
			redirect_uri: redirectUri,
			scope: "openid offline_access",
			state: "state",
			code_challenge: await generateCodeChallenge(codeVerifier),
			code_challenge_method: "S256",
			...(options.resource ? { resource: options.resource } : {}),
		}).toString();
		const authorization = await customFetchImpl(authorizationUrl, {
			headers,
			redirect: "manual",
		});
		const code = new URL(
			authorization.headers.get("location") ?? "",
		).searchParams.get("code");
		expect(code).toBeTruthy();
		const response = await customFetchImpl(metadata.token_endpoint, {
			method: "POST",
			headers: { "content-type": "application/x-www-form-urlencoded" },
			body: new URLSearchParams({
				grant_type: "authorization_code",
				code: code!,
				code_verifier: codeVerifier,
				redirect_uri: redirectUri,
				client_id: client.client_id,
				client_secret: client.client_secret!,
				...(options.resource ? { resource: options.resource } : {}),
			}),
		});
		expect(response.status).toBe(200);
		const tokens = (await response.json()) as {
			access_token: string;
			id_token: string;
			refresh_token: string;
		};
		return { client, tokens };
	}

	async function introspect(
		client: { client_id: string; client_secret?: string },
		token: string,
	) {
		const response = await customFetchImpl(metadata.introspection_endpoint!, {
			method: "POST",
			headers: { "content-type": "application/x-www-form-urlencoded" },
			body: new URLSearchParams({
				token,
				client_id: client.client_id,
				client_secret: client.client_secret!,
			}),
		});
		expect(response.status).toBe(200);
		return (await response.json()) as { active: boolean; iss?: string };
	}

	function endSession(idTokenHint: string) {
		const url = new URL(metadata.end_session_endpoint!);
		url.searchParams.set("id_token_hint", idTokenHint);
		return customFetchImpl(url, {
			headers: { accept: "application/json" },
			redirect: "manual",
		});
	}

	it("stamps the discovery issuer on every token and introspection response", async () => {
		const issuer = metadata.issuer;
		expect(issuer).toBe("http://localhost:3000/api/auth");

		const jwtGrant = await issueTokens({ resource });
		expect(decodeJwt(jwtGrant.tokens.id_token).iss).toBe(issuer);
		expect(decodeJwt(jwtGrant.tokens.access_token).iss).toBe(issuer);
		expect(
			await introspect(jwtGrant.client, jwtGrant.tokens.access_token),
		).toMatchObject({ active: true, iss: issuer });

		const opaqueGrant = await issueTokens();
		expect(
			await introspect(opaqueGrant.client, opaqueGrant.tokens.access_token),
		).toMatchObject({ active: true, iss: issuer });
		expect(
			await introspect(opaqueGrant.client, opaqueGrant.tokens.refresh_token),
		).toMatchObject({ active: true, iss: issuer });

		const logout = await endSession(opaqueGrant.tokens.id_token);
		expect(logout.status).toBe(200);
		expect(logoutTokens).toHaveLength(1);
		expect(decodeJwt(logoutTokens[0]!).iss).toBe(issuer);
	});

	it("accepts tokens that carry the issuer as configured", async () => {
		const { client, tokens } = await issueTokens({ resource });
		const accessToken = await withConfiguredIssuer(tokens.access_token);
		const { token: idToken } = await auth.api.signJWT({
			body: {
				payload: { ...decodeJwt(tokens.id_token), iss: configuredIssuer },
			},
		});

		expect(await introspect(client, accessToken)).toMatchObject({
			active: true,
			iss: configuredIssuer,
		});
		const logout = await endSession(idToken);
		expect(logout.status).toBe(200);
		expect(logoutTokens).toHaveLength(1);
	});

	it("defaults the resource client to the same issuer", async () => {
		const { tokens } = await issueTokens({ resource });
		const configuredIssuerToken = await withConfiguredIssuer(
			tokens.access_token,
		);
		const resourceClient = oauthProviderResourceClient(auth).getActions();

		for (const token of [tokens.access_token, configuredIssuerToken]) {
			await expect(
				resourceClient.verifyBearerToken(token, {
					verifyOptions: { audience: resource },
				}),
			).resolves.toMatchObject({ azp: expect.any(String) });
		}
		expect(
			await resourceClient.getProtectedResourceMetadata({ resource }),
		).toMatchObject({ authorization_servers: [metadata.issuer] });
	});

	it("expects the discovery issuer alone when keys come from a remote jwksUrl", async () => {
		const { tokens } = await issueTokens({ resource });
		const configuredIssuerToken = await withConfiguredIssuer(
			tokens.access_token,
		);
		const jwksUrl = `${metadata.issuer}/jwks`;
		const networkFetch = globalThis.fetch.bind(globalThis);
		vi.stubGlobal(
			"fetch",
			async (input: RequestInfo | URL, init?: RequestInit) =>
				(input instanceof Request ? input.url : String(input)) === jwksUrl
					? customFetchImpl(input, init)
					: networkFetch(input, init),
		);
		const resourceClient = oauthProviderResourceClient(auth).getActions();

		await expect(
			resourceClient.verifyBearerToken(tokens.access_token, {
				jwksUrl,
				verifyOptions: { audience: resource },
			}),
		).resolves.toMatchObject({ azp: expect.any(String) });
		await expect(
			resourceClient.verifyBearerToken(configuredIssuerToken, {
				jwksUrl,
				verifyOptions: { audience: resource },
			}),
		).rejects.toThrow();
		await expect(
			resourceClient.verifyBearerToken(configuredIssuerToken, {
				jwksUrl,
				verifyOptions: { audience: resource, issuer: configuredIssuer },
			}),
		).resolves.toMatchObject({ azp: expect.any(String) });
	});
});

/**
 * With the JWT plugin's `jwks.remoteUrl`, the resource client fetches keys over
 * HTTP and checks the signature alone, a remote check that expects the
 * discovery issuer.
 * @see https://www.rfc-editor.org/rfc/rfc9068#section-4
 */
describe("resource client with the JWT plugin's jwks.remoteUrl", async () => {
	const resource = "https://api.example.com";
	const configuredIssuer = "http://localhost:3000/api/auth/";
	const remoteUrl = "https://keys.example.com/jwks";
	const { auth, signInWithTestUser } = await getTestInstance({
		baseURL: configuredIssuer,
		plugins: [
			jwt({ jwks: { remoteUrl, keyPairConfig: { alg: "EdDSA" } } }),
			oauthProvider({
				loginPage: "/login",
				consentPage: "/consent",
				resources: [resource],
			}),
		],
	});
	const context = await auth.$context;
	const { headers } = await signInWithTestUser();
	await auth.api.getToken({ headers });

	const signToken = (iss: string) =>
		signJWT({ context } as GenericEndpointContext, {
			payload: {
				iss,
				aud: resource,
				azp: "client",
				sub: "user",
				exp: Math.floor(Date.now() / 1000) + 300,
			},
			header: { typ: "at+jwt" },
		});

	beforeEach(() => {
		const networkFetch = globalThis.fetch.bind(globalThis);
		vi.stubGlobal(
			"fetch",
			async (input: RequestInfo | URL, init?: RequestInit) => {
				const url = input instanceof Request ? input.url : String(input);
				if (url !== remoteUrl) return networkFetch(input, init);
				const rows = await context.adapter.findMany<{
					id: string;
					publicKey: string;
				}>({ model: "jwks" });
				return Response.json({
					keys: rows.map((row) => ({
						...JSON.parse(row.publicKey),
						alg: "EdDSA",
						kid: row.id,
					})),
				});
			},
		);
	});
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("expects the discovery issuer alone", async () => {
		const resourceClient = oauthProviderResourceClient(auth).getActions();
		const discoveryToken = await signToken("http://localhost:3000/api/auth");
		const configuredToken = await signToken(configuredIssuer);

		await expect(
			resourceClient.verifyBearerToken(discoveryToken, {
				verifyOptions: { audience: resource },
			}),
		).resolves.toMatchObject({ azp: "client" });
		await expect(
			resourceClient.verifyBearerToken(configuredToken, {
				verifyOptions: { audience: resource },
			}),
		).rejects.toThrow();
		await expect(
			resourceClient.verifyBearerToken(configuredToken, {
				verifyOptions: { audience: resource, issuer: configuredIssuer },
			}),
		).resolves.toMatchObject({ azp: "client" });
	});
});
