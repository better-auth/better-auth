import { betterAuth } from "better-auth";
import { generateRandomString } from "better-auth/crypto";
import type { ResourceRequestInput } from "better-auth/oauth2";
import {
	authorizationCodeRequest,
	createAuthorizationURL,
} from "better-auth/oauth2";
import { jwt } from "better-auth/plugins/jwt";
import { getTestInstance } from "better-auth/test";
import { decodeJwt, UnsecuredJWT } from "jose";
import { afterEach, describe, expect, it, vi } from "vitest";
import { oauthProviderClient } from "./client";
import { oauthProviderResourceClient } from "./client-resource";
import { oauthProvider } from "./oauth";
import type { DpopKey } from "./test-utils/dpop";
import { createDpopKey, createDpopProof } from "./test-utils/dpop";
import type { OAuthOptions, Scope } from "./types";

const origin = "http://localhost:4125";
const issuer = `${origin}/api/auth`;
const resource = "https://api.example.com";
/** A route served by the same process, outside the auth router's `basePath`. */
const routeUrl = `${origin}/api/rpc/thing`;
const redirectUri = "https://rp.example.com/callback";

async function setup(
	options: { jwt?: boolean; provider?: Partial<OAuthOptions<Scope[]>> } = {},
) {
	const withJwt = options.jwt ?? true;
	const instance = await getTestInstance(
		{
			baseURL: origin,
			plugins: [
				...(withJwt ? [jwt()] : []),
				oauthProvider({
					loginPage: "/login",
					consentPage: "/consent",
					resources: [resource],
					enforcePerClientResources: false,
					scopes: ["openid", "profile", "read:posts"],
					clientPrivileges: () => true,
					pairwiseSecret: "test-pairwise-secret-key-32chars!!",
					disableJwtPlugin: !withJwt,
					...options.provider,
				}),
			],
		},
		{ clientOptions: { plugins: [oauthProviderClient()] } },
	);
	const { auth } = instance;
	const { headers } = await instance.signInWithTestUser();
	const machineClient = await auth.api.adminCreateOAuthClient({
		headers,
		body: {
			token_endpoint_auth_method: "client_secret_post",
			grant_types: ["client_credentials"],
			client_credentials_scopes: ["read:posts"],
		},
	});

	/** Requests a client-credentials token, DPoP-bound when `dpopKey` is set. */
	const clientCredentialsToken = async (params?: {
		dpopKey?: DpopKey;
		nonce?: string;
	}) => {
		const tokenUrl = `${issuer}/oauth2/token`;
		const response = await instance.customFetchImpl(tokenUrl, {
			method: "POST",
			headers: {
				"content-type": "application/x-www-form-urlencoded",
				...(params?.dpopKey
					? {
							DPoP: await createDpopProof(params.dpopKey, {
								url: tokenUrl,
								nonce: params.nonce,
							}),
						}
					: {}),
			},
			body: new URLSearchParams({
				grant_type: "client_credentials",
				client_id: machineClient.client_id,
				client_secret: machineClient.client_secret!,
				scope: "read:posts",
				resource,
			}),
		});
		const body = (await response.json()) as {
			access_token: string;
			error?: string;
		};
		return { response, body };
	};

	/** Runs the authorization-code flow for a user-facing client. */
	const userToken = async (subjectType?: "pairwise") => {
		const session = await instance.signInWithTestUser();
		const oauthClient = await auth.api.adminCreateOAuthClient({
			headers: session.headers,
			body: {
				redirect_uris: [redirectUri],
				token_endpoint_auth_method: "client_secret_post",
				scope: "openid profile",
				skip_consent: true,
				...(subjectType ? { subject_type: subjectType } : {}),
			},
		});
		const codeVerifier = generateRandomString(32);
		const authUrl = await createAuthorizationURL({
			id: "test",
			options: {
				clientId: oauthClient.client_id,
				clientSecret: oauthClient.client_secret!,
				redirectURI: redirectUri,
			},
			redirectURI: "",
			authorizationEndpoint: `${issuer}/oauth2/authorize`,
			state: "state",
			scopes: ["openid", "profile"],
			codeVerifier,
		});
		let location = "";
		await instance.client.$fetch(authUrl.toString(), {
			headers: session.headers,
			onError(context) {
				location = context.response.headers.get("Location") || "";
			},
		});
		const code = new URL(location).searchParams.get("code")!;
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
		const tokens = await instance.client.$fetch<{
			access_token: string;
			id_token: string;
		}>("/oauth2/token", { method: "POST", body, headers: tokenHeaders });
		return { tokens: tokens.data!, session, oauthClient };
	};

	const disableClient = async (clientId: string) => {
		const context = await auth.$context;
		await context.adapter.update({
			model: "oauthClient",
			where: [{ field: "clientId", value: clientId }],
			update: { disabled: true },
		});
	};

	return {
		...instance,
		machineClient,
		clientCredentialsToken,
		userToken,
		disableClient,
		resourceClient: oauthProviderResourceClient(auth).getActions(),
	};
}

/** Builds the resource request a client sends to `routeUrl`. */
async function routeRequest(
	token: string,
	dpop?: { key: DpopKey; nonce?: string; jti?: string },
): Promise<ResourceRequestInput> {
	return {
		authorizationHeader: `${dpop ? "DPoP" : "Bearer"} ${token}`,
		dpopProofJwt: dpop
			? await createDpopProof(dpop.key, {
					url: routeUrl,
					method: "GET",
					accessToken: token,
					nonce: dpop.nonce,
					jti: dpop.jti,
				})
			: undefined,
		method: "GET",
		url: routeUrl,
	};
}

const verifyOptions = { audience: resource };

/** Captures the rejection so its status, body, and headers can be checked. */
async function rejection(promise: Promise<unknown>) {
	try {
		await promise;
	} catch (error) {
		return error as {
			statusCode: number;
			body: { error?: string };
			headers: Headers;
		};
	}
	throw new Error("expected the verification to fail");
}

function expectInvalidTokenChallenge(error: {
	statusCode: number;
	body: { error?: string };
	headers: Headers;
}) {
	expect(error.statusCode).toBe(401);
	expect(error.body.error).toBe("invalid_token");
	expect(new Headers(error.headers).get("www-authenticate")).toContain(
		'error="invalid_token"',
	);
}

describe("resource client with the provider in this process", async () => {
	const server = await setup();

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("verifies a DPoP-bound JWT at a route outside basePath", async () => {
		const key = await createDpopKey();
		const { body } = await server.clientCredentialsToken({ dpopKey: key });

		const payload = await server.resourceClient.verifyAccessTokenRequest(
			await routeRequest(body.access_token, { key }),
			{ verifyOptions },
		);

		expect(payload).toMatchObject({
			active: true,
			client_id: server.machineClient.client_id,
			token_type: "DPoP",
			cnf: { jkt: key.jkt },
		});
	});

	it("checks the token without fetching the provider's own endpoints", async () => {
		const selfFetch = vi.fn(async () => {
			throw new TypeError("fetch failed");
		});
		vi.stubGlobal("fetch", selfFetch);
		const { body } = await server.clientCredentialsToken();

		await expect(
			server.resourceClient.verifyAccessTokenRequest(
				await routeRequest(body.access_token),
				{ verifyOptions },
			),
		).resolves.toMatchObject({ active: true });
		expect(selfFetch).not.toHaveBeenCalled();
	});

	it("rejects a token whose client is disabled", async () => {
		const disposable = await server.auth.api.adminCreateOAuthClient({
			headers: (await server.signInWithTestUser()).headers,
			body: {
				token_endpoint_auth_method: "client_secret_post",
				grant_types: ["client_credentials"],
				client_credentials_scopes: ["read:posts"],
			},
		});
		const { access_token } = await server.auth.api.oauth2Token({
			body: {
				grant_type: "client_credentials",
				client_id: disposable.client_id,
				client_secret: disposable.client_secret,
				scope: "read:posts",
				resource,
			},
		});
		await server.disableClient(disposable.client_id);

		expectInvalidTokenChallenge(
			await rejection(
				server.resourceClient.verifyAccessTokenRequest(
					await routeRequest(access_token),
					{ verifyOptions },
				),
			),
		);
	});

	it("rejects a JWT whose session has ended", async () => {
		const { tokens, session } = await server.userToken();
		const request = await routeRequest(tokens.access_token);
		await expect(
			server.resourceClient.verifyAccessTokenRequest(request, {
				verifyOptions,
			}),
		).resolves.toMatchObject({ active: true });

		await server.auth.api.revokeSessions({ headers: session.headers });

		expectInvalidTokenChallenge(
			await rejection(
				server.resourceClient.verifyAccessTokenRequest(request, {
					verifyOptions,
				}),
			),
		);
	});

	/**
	 * @see https://datatracker.ietf.org/doc/html/rfc9068#section-4
	 */
	it("rejects an app-signed JWT that carries azp but not typ at+jwt", async () => {
		const { token } = await server.auth.api.signJWT({
			body: {
				payload: {
					iss: issuer,
					aud: resource,
					azp: server.machineClient.client_id,
					scope: "read:posts",
				},
			},
		});

		expectInvalidTokenChallenge(
			await rejection(
				server.resourceClient.verifyAccessTokenRequest(
					await routeRequest(token),
					{ verifyOptions },
				),
			),
		);
	});

	it("returns the sub the access token carries for a pairwise client", async () => {
		const { tokens, session } = await server.userToken("pairwise");
		// The default `accessTokenSubject: "user"` keeps the user ID in `sub`.
		expect(decodeJwt(tokens.access_token).sub).toBe(session.user.id);

		const payload = await server.resourceClient.verifyAccessTokenRequest(
			await routeRequest(tokens.access_token),
			{ verifyOptions },
		);

		expect(payload.sub).toBe(session.user.id);
	});

	/**
	 * @see https://datatracker.ietf.org/doc/html/rfc9449#section-11.1
	 */
	it("rejects a replayed proof at a second instance sharing the database", async () => {
		const key = await createDpopKey();
		const { body } = await server.clientCredentialsToken({ dpopKey: key });
		const request = await routeRequest(body.access_token, { key });
		const secondAuth = betterAuth(server.auth.options);
		const secondResourceClient =
			oauthProviderResourceClient(secondAuth).getActions();

		await expect(
			server.resourceClient.verifyAccessTokenRequest(request, {
				verifyOptions,
			}),
		).resolves.toMatchObject({ active: true });
		const replay = await rejection(
			secondResourceClient.verifyAccessTokenRequest(request, {
				verifyOptions,
			}),
		);

		expect(replay.statusCode).toBe(401);
		expect(replay.body.error).toBe("invalid_dpop_proof");
	});

	it("keeps signature-only verification when jwksUrl is set", async () => {
		const disposable = await server.auth.api.adminCreateOAuthClient({
			headers: (await server.signInWithTestUser()).headers,
			body: {
				token_endpoint_auth_method: "client_secret_post",
				grant_types: ["client_credentials"],
				client_credentials_scopes: ["read:posts"],
			},
		});
		const { access_token } = await server.auth.api.oauth2Token({
			body: {
				grant_type: "client_credentials",
				client_id: disposable.client_id,
				client_secret: disposable.client_secret,
				scope: "read:posts",
				resource,
			},
		});
		await server.disableClient(disposable.client_id);
		vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit) =>
			server.auth.handler(new Request(input, init)),
		);

		const payload = await server.resourceClient.verifyAccessTokenRequest(
			await routeRequest(access_token),
			{ verifyOptions, jwksUrl: `${issuer}/jwks` },
		);

		expect(payload.azp).toBe(disposable.client_id);
		expect(payload).not.toHaveProperty("active");
	});

	it("keeps HTTP introspection when remoteVerify is set", async () => {
		const routeFetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) =>
			server.auth.handler(new Request(input, init)),
		);
		vi.stubGlobal("fetch", routeFetch);
		const { body } = await server.clientCredentialsToken();

		await expect(
			server.resourceClient.verifyAccessTokenRequest(
				await routeRequest(body.access_token),
				{
					verifyOptions,
					remoteVerify: {
						introspectUrl: `${issuer}/oauth2/introspect`,
						clientId: server.machineClient.client_id,
						clientSecret: server.machineClient.client_secret!,
					},
				},
			),
		).resolves.toMatchObject({ active: true });
		expect(
			routeFetch.mock.calls.map(([input]) => new Request(input).url),
		).toContain(`${issuer}/oauth2/introspect`);
	});
});

describe("resource client with a dynamic baseURL", async () => {
	const host = "localhost:3000";
	const { auth, signInWithTestUser } = await getTestInstance({
		baseURL: { allowedHosts: [host], protocol: "http" },
		plugins: [
			jwt(),
			oauthProvider({
				loginPage: "/login",
				consentPage: "/consent",
				resources: [resource],
				enforcePerClientResources: false,
				scopes: ["read:posts"],
				clientPrivileges: () => true,
			}),
		],
	});

	// The base URL resolves only per request, so there is no issuer or UserInfo
	// audience to check the records with, and the signature check stays.
	it("keeps signature-only verification, as it does with jwksUrl", async () => {
		const { headers } = await signInWithTestUser();
		headers.set("host", host);
		const client = await auth.api.adminCreateOAuthClient({
			headers,
			body: {
				token_endpoint_auth_method: "client_secret_post",
				grant_types: ["client_credentials"],
				client_credentials_scopes: ["read:posts"],
			},
		});
		const { access_token } = await auth.api.oauth2Token({
			headers: new Headers({ host }),
			body: {
				grant_type: "client_credentials",
				client_id: client.client_id,
				client_secret: client.client_secret,
				scope: "read:posts",
				resource,
			},
		});
		await (await auth.$context).adapter.update({
			model: "oauthClient",
			where: [{ field: "clientId", value: client.client_id }],
			update: { disabled: true },
		});

		const payload = await oauthProviderResourceClient(auth)
			.getActions()
			.verifyAccessTokenRequest(await routeRequest(access_token), {
				verifyOptions: {
					audience: resource,
					issuer: `http://${host}/api/auth`,
				},
			});

		expect(payload.azp).toBe(client.client_id);
		expect(payload).not.toHaveProperty("active");
	});
});

/**
 * @see https://openid.net/specs/openid-connect-core-1_0.html#PairwiseAlg
 */
describe("resource client with pairwise access token subjects", async () => {
	const server = await setup({ provider: { accessTokenSubject: "pairwise" } });

	it("returns the token's pairwise sub, not the user ID", async () => {
		const { tokens, session } = await server.userToken("pairwise");
		const tokenSub = decodeJwt(tokens.access_token).sub;
		expect(tokenSub).toBe(decodeJwt(tokens.id_token).sub);
		expect(tokenSub).not.toBe(session.user.id);

		const payload = await server.resourceClient.verifyAccessTokenRequest(
			await routeRequest(tokens.access_token),
			{ verifyOptions },
		);

		expect(payload.sub).toBe(tokenSub);
		expect(payload).not.toHaveProperty("ba_sub");
	});

	it("keeps the client ID as the sub of a pairwise client's own token", async () => {
		const pairwiseMachine = await server.auth.api.adminCreateOAuthClient({
			headers: (await server.signInWithTestUser()).headers,
			body: {
				token_endpoint_auth_method: "client_secret_post",
				grant_types: ["client_credentials"],
				client_credentials_scopes: ["read:posts"],
				subject_type: "pairwise",
				redirect_uris: [redirectUri],
			},
		});
		const { access_token } = await server.auth.api.oauth2Token({
			body: {
				grant_type: "client_credentials",
				client_id: pairwiseMachine.client_id,
				client_secret: pairwiseMachine.client_secret,
				scope: "read:posts",
				resource,
			},
		});
		const tokenSub = decodeJwt(access_token).sub;

		const payload = await server.resourceClient.verifyAccessTokenRequest(
			await routeRequest(access_token),
			{ verifyOptions },
		);

		expect(payload.sub).toBe(tokenSub);
	});
});

describe("resource client with opaque access tokens in this process", async () => {
	const server = await setup({ jwt: false });

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("verifies an opaque token without HTTP introspection", async () => {
		const selfFetch = vi.fn(async () => {
			throw new TypeError("fetch failed");
		});
		vi.stubGlobal("fetch", selfFetch);
		const { body } = await server.clientCredentialsToken();
		expect(body.access_token.split(".")).toHaveLength(1);

		await expect(
			server.resourceClient.verifyAccessTokenRequest(
				await routeRequest(body.access_token),
				{ verifyOptions },
			),
		).resolves.toMatchObject({
			active: true,
			client_id: server.machineClient.client_id,
			scope: "read:posts",
		});
		await expect(
			server.resourceClient.verifyBearerToken(body.access_token, {
				verifyOptions,
			}),
		).resolves.toMatchObject({ active: true });
		expect(selfFetch).not.toHaveBeenCalled();
	});

	/**
	 * @see https://openid.net/specs/openid-connect-core-1_0.html#PairwiseAlg
	 */
	it("returns the pairwise sub of a pairwise client's opaque token", async () => {
		const { tokens, session } = await server.userToken("pairwise");
		expect(tokens.access_token.split(".")).toHaveLength(1);
		const pairwiseSub = decodeJwt(tokens.id_token).sub;
		expect(pairwiseSub).not.toBe(session.user.id);

		const payload = await server.resourceClient.verifyAccessTokenRequest(
			await routeRequest(tokens.access_token),
			{ verifyOptions },
		);

		expect(payload.sub).toBe(pairwiseSub);
	});

	it("rejects a revoked opaque token", async () => {
		const { body } = await server.clientCredentialsToken();
		await server.auth.api.oauth2Revoke({
			body: {
				token: body.access_token,
				token_type_hint: "access_token",
				client_id: server.machineClient.client_id,
				client_secret: server.machineClient.client_secret,
			},
		});

		expectInvalidTokenChallenge(
			await rejection(
				server.resourceClient.verifyAccessTokenRequest(
					await routeRequest(body.access_token),
					{ verifyOptions },
				),
			),
		);
	});
});

describe("resource client with JWT-shaped opaque access tokens", async () => {
	const server = await setup({
		jwt: false,
		provider: {
			generateOpaqueAccessToken: () =>
				new UnsecuredJWT({
					sub: "generator-sub",
					jti: generateRandomString(16),
				}).encode(),
		},
	});

	/**
	 * @see https://openid.net/specs/openid-connect-core-1_0.html#PairwiseAlg
	 */
	it("returns the pairwise sub, not the sub the generator wrote", async () => {
		const { tokens, session } = await server.userToken("pairwise");
		expect(tokens.access_token.split(".")).toHaveLength(3);
		const pairwiseSub = decodeJwt(tokens.id_token).sub;
		expect(pairwiseSub).not.toBe(session.user.id);

		const payload = await server.resourceClient.verifyAccessTokenRequest(
			await routeRequest(tokens.access_token),
			{ verifyOptions },
		);

		expect(payload.sub).toBe(pairwiseSub);
	});
});

/**
 * @see https://datatracker.ietf.org/doc/html/rfc9449#section-9
 */
describe("resource client with provider DPoP nonces", async () => {
	const server = await setup({
		provider: { dpop: { nonce: { required: true } } },
	});

	it("challenges a proof without a nonce with use_dpop_nonce", async () => {
		const key = await createDpopKey();
		const first = await server.clientCredentialsToken({ dpopKey: key });
		const nonce = first.response.headers.get("dpop-nonce")!;
		const { body } = await server.clientCredentialsToken({
			dpopKey: key,
			nonce,
		});

		const error = await rejection(
			server.resourceClient.verifyAccessTokenRequest(
				await routeRequest(body.access_token, { key }),
				{ verifyOptions },
			),
		);

		expect(error.statusCode).toBe(401);
		expect(error.body.error).toBe("use_dpop_nonce");
		const headers = new Headers(error.headers);
		expect(headers.get("dpop-nonce")).toBeTruthy();
		expect(headers.get("cache-control")).toBe("no-store");
		expect(headers.get("www-authenticate")).toContain('error="use_dpop_nonce"');
	});

	it("accepts the nonce the token endpoint issued", async () => {
		const key = await createDpopKey();
		const first = await server.clientCredentialsToken({ dpopKey: key });
		expect(first.body.error).toBe("use_dpop_nonce");
		const { response, body } = await server.clientCredentialsToken({
			dpopKey: key,
			nonce: first.response.headers.get("dpop-nonce")!,
		});

		await expect(
			server.resourceClient.verifyAccessTokenRequest(
				await routeRequest(body.access_token, {
					key,
					nonce: response.headers.get("dpop-nonce")!,
				}),
				{ verifyOptions },
			),
		).resolves.toMatchObject({ active: true, token_type: "DPoP" });
	});
});
