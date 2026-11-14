import { createAuthEndpoint, sessionMiddleware } from "better-auth/api";
import { generateRandomString } from "better-auth/crypto";
import { deriveDpopJkt, generateCodeChallenge } from "better-auth/oauth2";
import { jwt } from "better-auth/plugins/jwt";
import { getTestInstance } from "better-auth/test";
import type { BetterAuthPlugin } from "better-auth/types";
import type { JWK } from "jose";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { beforeAll, describe, expect, it } from "vitest";
import { oauthProvider } from "./oauth";
import { getOAuthProviderApi } from "./token";
import type { StoredAuthorizationQuery } from "./types";
import type { OAuthClient } from "./types/oauth";
import { storeToken } from "./utils";

const issueCodeEndpoint = "http://localhost:3000/api/auth/test/issue-code";

async function createDpopKey() {
	const { privateKey, publicKey } = await generateKeyPair("ES256", {
		extractable: true,
	});
	const publicJwk = await exportJWK(publicKey);
	return { privateKey, publicJwk, jkt: await deriveDpopJkt(publicJwk) };
}

async function createDpopProof(
	key: Awaited<ReturnType<typeof createDpopKey>>,
	url: string,
	nonce?: string,
) {
	return new SignJWT({
		jti: generateRandomString(16),
		htm: "POST",
		htu: url,
		iat: Math.floor(Date.now() / 1000),
		...(nonce ? { nonce } : {}),
	})
		.setProtectedHeader({
			typ: "dpop+jwt",
			alg: "ES256",
			jwk: key.publicJwk as JWK,
		})
		.sign(key.privateKey);
}

/**
 * @see https://github.com/better-auth/better-auth/issues/10414
 */
describe("provider.issueAuthorizationCode", async () => {
	const authServerBaseUrl = "http://localhost:3000";
	const redirectUri = "https://client.example.com/callback";
	const resource = "https://api.example.com";
	const codeExpiresIn = 120;

	// Stands in for a companion plugin that completes authorization outside
	// `/oauth2/authorize`, such as a first-party authorization challenge.
	const issuer = {
		id: "test-code-issuer",
		endpoints: {
			testIssueCode: createAuthEndpoint(
				"/test/issue-code",
				{ method: "POST", use: [sessionMiddleware] },
				async (ctx) => {
					const provider = getOAuthProviderApi(
						ctx,
						ctx.context.getPlugin("oauth-provider")!.options,
					);
					const issued = await provider.issueAuthorizationCode({
						query: ctx.body as StoredAuthorizationQuery,
						session: ctx.context.session,
					});
					return ctx.json({
						code: issued.code,
						expiresAt: issued.expiresAt.toISOString(),
						redirectURL: issued.redirectURL ?? null,
					});
				},
			),
		},
	} satisfies BetterAuthPlugin;

	const { auth, client, signInWithTestUser } = await getTestInstance({
		baseURL: `${authServerBaseUrl}/api/auth/`,
		advanced: { skipTrailingSlashes: true },
		plugins: [
			issuer,
			jwt({ jwt: { issuer: authServerBaseUrl } }),
			oauthProvider({
				loginPage: "/login",
				consentPage: "/consent",
				codeExpiresIn,
				resources: [resource],
				enforcePerClientResources: false,
			}),
		],
	});
	const { headers, user } = await signInWithTestUser();
	const context = await auth.$context;

	let confidentialClient: OAuthClient;
	let publicClient: OAuthClient;
	let consentClient: OAuthClient;

	beforeAll(async () => {
		const createClient = (body: Record<string, unknown>) =>
			auth.api.adminCreateOAuthClient({
				headers,
				body: {
					grant_types: ["authorization_code"],
					redirect_uris: [redirectUri],
					...body,
				},
			});
		[confidentialClient, publicClient, consentClient] = await Promise.all([
			createClient({
				token_endpoint_auth_method: "client_secret_post",
				skip_consent: true,
			}),
			createClient({
				token_endpoint_auth_method: "none",
				application_type: "native",
				skip_consent: true,
			}),
			createClient({ token_endpoint_auth_method: "client_secret_post" }),
		]);
	});

	async function pkce() {
		const verifier = generateRandomString(43);
		return { verifier, challenge: await generateCodeChallenge(verifier) };
	}

	/** A code request for `oauthClient` with PKCE, plus `extra` parameters. */
	async function codeRequest(
		oauthClient: OAuthClient,
		extra: Record<string, unknown> = {},
	) {
		const { verifier, challenge } = await pkce();
		const query = {
			response_type: "code",
			client_id: oauthClient.client_id,
			code_challenge: challenge,
			code_challenge_method: "S256",
			...extra,
		};
		return { query, verifier };
	}

	/**
	 * Sends `query` to the issuing endpoint as the client would, with the
	 * client's secret when it has one.
	 */
	function issueCode(
		query: Record<string, unknown>,
		extraHeaders: Record<string, string> = {},
	) {
		const secret = [confidentialClient, publicClient, consentClient].find(
			(registered) => registered.client_id === query.client_id,
		)?.client_secret;
		return client.$fetch<{
			code: string;
			expiresAt: string;
			redirectURL: string | null;
		}>("/test/issue-code", {
			method: "POST",
			headers: { ...Object.fromEntries(headers), ...extraHeaders },
			body: { ...(secret ? { client_secret: secret } : {}), ...query },
		});
	}

	async function authorizeForCode(query: Record<string, string>) {
		let location = "";
		await client.$fetch(
			`/oauth2/authorize?${new URLSearchParams(query).toString()}`,
			{
				headers,
				onError(ctx) {
					location = ctx.response.headers.get("location") ?? "";
				},
			},
		);
		return new URL(location).searchParams.get("code")!;
	}

	function exchange(body: Record<string, string>, dpop?: string) {
		return client.$fetch<{ access_token: string }>("/oauth2/token", {
			method: "POST",
			headers: {
				"content-type": "application/x-www-form-urlencoded",
				...(dpop ? { DPoP: dpop } : {}),
			},
			body: new URLSearchParams({
				grant_type: "authorization_code",
				...body,
			}),
		});
	}

	/** The OAuth `error` code of a failed `client.$fetch` call. */
	function errorCode(result: { error: unknown }) {
		return (result.error as { error?: string } | null)?.error;
	}

	async function findCodeRow(code: string) {
		return context.internalAdapter.findVerificationValue(
			await storeToken("hashed", code, "authorization_code"),
		);
	}

	async function authorizationQuery() {
		const { query } = await codeRequest(confidentialClient, {
			redirect_uri: redirectUri,
			scope: "openid profile",
			state: "state-1",
			resource,
		});
		return query;
	}

	it("keeps the /oauth2/authorize code row format", async () => {
		const query = await authorizationQuery();
		const row = await findCodeRow(await authorizeForCode(query));
		expect(row).not.toBeNull();
		expect(JSON.parse(row!.value)).toEqual({
			type: "authorization_code",
			query,
			userId: user.id,
			sessionId: expect.any(String),
			authTime: expect.any(Number),
			resource: [resource],
		});
		expect(row!.expiresAt.getTime() - row!.createdAt.getTime()).toBe(
			codeExpiresIn * 1000,
		);
	});

	it("stores the same row as /oauth2/authorize for the same request", async () => {
		const query = await authorizationQuery();
		const authorizeRow = await findCodeRow(await authorizeForCode(query));
		const issued = await issueCode(query);
		expect(issued.error).toBeNull();
		const issuedRow = await findCodeRow(issued.data!.code);
		expect(issuedRow).not.toBeNull();
		expect(JSON.parse(issuedRow!.value)).toEqual(
			JSON.parse(authorizeRow!.value),
		);
		expect(
			issuedRow!.expiresAt.getTime() - issuedRow!.createdAt.getTime(),
		).toBe(codeExpiresIn * 1000);
		expect(new Date(issued.data!.expiresAt).getTime()).toBe(
			issuedRow!.expiresAt.getTime(),
		);
	});

	it("authenticates the client and leaves its secret out of the code", async () => {
		const query = await authorizationQuery();
		const issued = await issueCode(query);
		expect(issued.error).toBeNull();
		const row = await findCodeRow(issued.data!.code);
		expect(JSON.parse(row!.value).query).toEqual(query);
	});

	it("rejects a confidential client without its credentials", async () => {
		const query = await authorizationQuery();
		const issued = await issueCode({ ...query, client_secret: undefined });
		expect(errorCode(issued)).toBe("invalid_client");
	});

	it("rejects a client_id that differs from the authenticated client", async () => {
		const basicClient = await auth.api.adminCreateOAuthClient({
			headers,
			body: {
				grant_types: ["authorization_code"],
				redirect_uris: [redirectUri],
				token_endpoint_auth_method: "client_secret_basic",
				skip_consent: true,
			},
		});
		const basic = btoa(`${basicClient.client_id}:${basicClient.client_secret}`);
		const { query } = await codeRequest(publicClient);
		const issued = await issueCode(query, {
			authorization: `Basic ${basic}`,
		});
		expect(issued.error?.status).toBe(400);
		expect(errorCode(issued)).toBe("invalid_request");
	});

	it("returns a redirect URL whose code redeems with its redirect_uri", async () => {
		const { query, verifier } = await codeRequest(confidentialClient, {
			redirect_uri: redirectUri,
			state: "abc",
		});
		const issued = await issueCode(query);
		expect(issued.error).toBeNull();
		const url = new URL(issued.data!.redirectURL!);
		expect(`${url.origin}${url.pathname}`).toBe(redirectUri);
		expect(url.searchParams.get("code")).toBe(issued.data!.code);
		expect(url.searchParams.get("state")).toBe("abc");
		expect(url.searchParams.get("iss")).toBe(authServerBaseUrl);

		const tokens = await exchange({
			code: issued.data!.code,
			code_verifier: verifier,
			redirect_uri: redirectUri,
			client_id: confidentialClient.client_id,
			client_secret: confidentialClient.client_secret!,
		});
		expect(tokens.error).toBeNull();
	});

	it("issues a headless code the token endpoint redeems once", async () => {
		const { query, verifier } = await codeRequest(publicClient, {
			scope: "openid",
		});
		const issued = await issueCode(query);
		expect(issued.error).toBeNull();
		expect(issued.data!.redirectURL).toBeNull();

		const redeem = () =>
			exchange({
				code: issued.data!.code,
				client_id: publicClient.client_id,
				code_verifier: verifier,
			});
		const tokens = await redeem();
		expect(tokens.data?.access_token).toBeTypeOf("string");
		const replay = await redeem();
		expect(errorCode(replay)).toBe("invalid_grant");
	});

	it("binds the code to dpop_jkt", async () => {
		const { publicKey } = await generateKeyPair("ES256", { extractable: true });
		const { query, verifier } = await codeRequest(publicClient, {
			dpop_jkt: await deriveDpopJkt(await exportJWK(publicKey)),
		});
		const issued = await issueCode(query);
		expect(issued.error).toBeNull();

		// No DPoP proof at the token endpoint: the bound code cannot be redeemed.
		const tokens = await exchange({
			code: issued.data!.code,
			client_id: publicClient.client_id,
			code_verifier: verifier,
		});
		expect(errorCode(tokens)).toBe("invalid_dpop_proof");
	});

	it("binds the code to the key of the request's DPoP proof", async () => {
		const key = await createDpopKey();
		const { query, verifier } = await codeRequest(publicClient);
		const issued = await issueCode(query, {
			DPoP: await createDpopProof(key, issueCodeEndpoint),
		});
		expect(issued.error).toBeNull();
		const row = await findCodeRow(issued.data!.code);
		expect(JSON.parse(row!.value).query.dpop_jkt).toBe(key.jkt);

		const tokens = await exchange({
			code: issued.data!.code,
			client_id: publicClient.client_id,
			code_verifier: verifier,
		});
		expect(errorCode(tokens)).toBe("invalid_dpop_proof");
	});

	it("rejects a dpop_jkt that differs from the DPoP proof key", async () => {
		const key = await createDpopKey();
		const otherKey = await createDpopKey();
		const { query } = await codeRequest(publicClient, {
			dpop_jkt: otherKey.jkt,
		});
		const issued = await issueCode(query, {
			DPoP: await createDpopProof(key, issueCodeEndpoint),
		});
		expect(errorCode(issued)).toBe("invalid_request");
	});

	// Each check `/oauth2/authorize` applies also applies here, and fails with
	// an error instead of a redirect.
	it.each([
		{
			name: "an unregistered redirect_uri",
			client: () => confidentialClient,
			extra: { redirect_uri: "https://attacker.example.com/callback" },
			error: "invalid_redirect",
		},
		{
			name: "a missing PKCE challenge the client requires",
			client: () => publicClient,
			extra: { code_challenge: undefined, code_challenge_method: undefined },
			error: "invalid_request",
		},
		{
			name: "a scope the client may not request",
			client: () => publicClient,
			extra: { scope: "openid not-a-scope" },
			error: "invalid_scope",
		},
		{
			name: "a request_uri instead of the request parameters",
			client: () => publicClient,
			extra: { request_uri: "urn:ietf:params:oauth:request_uri:abc" },
			error: "invalid_request",
		},
		{
			name: "a prompt that needs the authorization endpoint",
			client: () => confidentialClient,
			extra: { redirect_uri: redirectUri, prompt: "consent" },
			error: "interaction_required",
		},
		{
			name: "an elapsed max_age",
			client: () => confidentialClient,
			extra: { redirect_uri: redirectUri, max_age: 0 },
			error: "login_required",
		},
	])("rejects $name", async ({ client: oauthClient, extra, error }) => {
		const { query } = await codeRequest(oauthClient(), extra);
		const issued = await issueCode(query);
		expect(issued.error?.status).toBe(400);
		expect(errorCode(issued)).toBe(error);
	});

	it("requires stored consent unless the client skips consent", async () => {
		const { query } = await codeRequest(consentClient, {
			redirect_uri: redirectUri,
			scope: "openid",
		});
		const withoutConsent = await issueCode(query);
		expect(errorCode(withoutConsent)).toBe("consent_required");

		await context.adapter.create({
			model: "oauthConsent",
			data: {
				clientId: consentClient.client_id,
				userId: user.id,
				scopes: ["openid"],
				createdAt: new Date(),
				updatedAt: new Date(),
			},
		});
		const withConsent = await issueCode(query);
		expect(withConsent.error).toBeNull();
	});
});

describe("provider.issueAuthorizationCode hook isolation", async () => {
	const redirectUri = "https://client.example.com/callback";
	const issuer = {
		id: "test-code-issuer",
		endpoints: {
			testIssueCode: createAuthEndpoint(
				"/test/issue-code",
				{ method: "POST", use: [sessionMiddleware] },
				async (ctx) => {
					const provider = getOAuthProviderApi(
						ctx,
						ctx.context.getPlugin("oauth-provider")!.options,
					);
					const issued = await provider.issueAuthorizationCode({
						query: ctx.body as StoredAuthorizationQuery,
						session: ctx.context.session,
					});
					return ctx.json({ code: issued.code });
				},
			),
		},
	} satisfies BetterAuthPlugin;

	const { auth, client, signInWithTestUser } = await getTestInstance({
		baseURL: "http://localhost:3000/api/auth/",
		advanced: { skipTrailingSlashes: true },
		plugins: [
			issuer,
			jwt({ jwt: { issuer: "http://localhost:3000" } }),
			oauthProvider({
				loginPage: "/login",
				consentPage: "/consent",
				postLogin: {
					page: "/select-organization",
					// A hook that edits its query must not change what later hooks see.
					shouldRedirect: ({ query }) => {
						query.delete("client_id");
						return false;
					},
					consentReferenceId: ({ query }) =>
						query.get("client_id") ? undefined : "mutated",
				},
			}),
		],
	});
	const { headers, user } = await signInWithTestUser();
	const context = await auth.$context;

	it("gives each hook its own copy of the query", async () => {
		const oauthClient = await auth.api.adminCreateOAuthClient({
			headers,
			body: {
				grant_types: ["authorization_code"],
				redirect_uris: [redirectUri],
				token_endpoint_auth_method: "client_secret_post",
			},
		});
		await context.adapter.create({
			model: "oauthConsent",
			data: {
				clientId: oauthClient.client_id,
				userId: user.id,
				scopes: ["openid"],
				createdAt: new Date(),
				updatedAt: new Date(),
			},
		});
		const challenge = await generateCodeChallenge(generateRandomString(43));
		const issued = await client.$fetch<{ code: string }>("/test/issue-code", {
			method: "POST",
			headers,
			body: {
				response_type: "code",
				client_id: oauthClient.client_id,
				client_secret: oauthClient.client_secret,
				redirect_uri: redirectUri,
				scope: "openid",
				code_challenge: challenge,
				code_challenge_method: "S256",
			},
		});
		expect(issued.error).toBeNull();
	});
});

/**
 * Required PAR guards authorization requests that reach `/oauth2/authorize`
 * through the user agent (RFC 9126 §1). A plugin endpoint receives the
 * parameters from its own caller, so the policy does not apply to it.
 *
 * @see https://datatracker.ietf.org/doc/html/rfc9126#section-5
 */
describe.each([
	{
		name: "for every client",
		pushedAuthorizationRequests: { enabled: true, required: true },
		clientMetadata: {},
	},
	{
		name: "per client",
		pushedAuthorizationRequests: { enabled: true },
		clientMetadata: { require_pushed_authorization_requests: true },
	},
])(
	"provider.issueAuthorizationCode with PAR required $name",
	async ({ pushedAuthorizationRequests, clientMetadata }) => {
		const redirectUri = "https://client.example.com/callback";
		const issuer = {
			id: "test-code-issuer",
			endpoints: {
				testIssueCode: createAuthEndpoint(
					"/test/issue-code",
					{ method: "POST", use: [sessionMiddleware] },
					async (ctx) => {
						const provider = getOAuthProviderApi(
							ctx,
							ctx.context.getPlugin("oauth-provider")!.options,
						);
						const issued = await provider.issueAuthorizationCode({
							query: ctx.body,
							session: ctx.context.session,
						});
						return ctx.json({ code: issued.code });
					},
				),
			},
		} satisfies BetterAuthPlugin;

		const { auth, client, signInWithTestUser } = await getTestInstance({
			baseURL: "http://localhost:3000/api/auth/",
			advanced: { skipTrailingSlashes: true },
			plugins: [
				issuer,
				jwt({ jwt: { issuer: "http://localhost:3000" } }),
				oauthProvider({
					loginPage: "/login",
					consentPage: "/consent",
					pushedAuthorizationRequests,
				}),
			],
		});
		const { headers } = await signInWithTestUser();

		let oauthClient: OAuthClient;
		beforeAll(async () => {
			oauthClient = await auth.api.adminCreateOAuthClient({
				headers,
				body: {
					grant_types: ["authorization_code"],
					redirect_uris: [redirectUri],
					token_endpoint_auth_method: "client_secret_post",
					skip_consent: true,
					...clientMetadata,
				},
			});
		});

		async function authorizationParams() {
			return {
				response_type: "code",
				client_id: oauthClient.client_id,
				redirect_uri: redirectUri,
				scope: "openid",
				state: "par-state",
				code_challenge: await generateCodeChallenge(generateRandomString(43)),
				code_challenge_method: "S256",
			};
		}

		function issueCode(query: Record<string, unknown>) {
			return client.$fetch<{ code: string }>("/test/issue-code", {
				method: "POST",
				headers,
				body: query,
			});
		}

		it("issues a code for the request /oauth2/authorize rejects", async () => {
			const params = await authorizationParams();
			let location = "";
			await client.$fetch(
				`/oauth2/authorize?${new URLSearchParams(params).toString()}`,
				{
					headers,
					onError(ctx) {
						location = ctx.response.headers.get("location") ?? "";
					},
				},
			);
			const authorizeError = new URL(location).searchParams;
			expect(authorizeError.get("error")).toBe("invalid_request");
			expect(authorizeError.get("error_description")).toBe(
				"pushed authorization request is required",
			);

			const issued = await issueCode({
				...params,
				client_secret: oauthClient.client_secret,
			});
			expect(issued.error).toBeNull();
			expect(issued.data?.code).toEqual(expect.any(String));
		});

		it("rejects the client without its credentials", async () => {
			const issued = await issueCode(await authorizationParams());
			expect(issued.error?.status).toBe(400);
			expect((issued.error as { error?: string } | null)?.error).toBe(
				"invalid_client",
			);
		});

		it("still rejects a request_uri from /oauth2/par", async () => {
			const pushed = await client.$fetch<{ request_uri: string }>(
				"/oauth2/par",
				{
					method: "POST",
					headers: { "content-type": "application/x-www-form-urlencoded" },
					body: new URLSearchParams({
						...(await authorizationParams()),
						client_secret: oauthClient.client_secret!,
					}),
				},
			);
			expect(pushed.data?.request_uri).toEqual(expect.any(String));

			const issued = await issueCode({
				client_id: oauthClient.client_id,
				client_secret: oauthClient.client_secret,
				request_uri: pushed.data!.request_uri,
			});
			expect(issued.error?.status).toBe(400);
			expect((issued.error as { error?: string } | null)?.error).toBe(
				"invalid_request",
			);
		});
	},
);

/**
 * @see https://www.rfc-editor.org/rfc/rfc9449#section-8
 */
describe("provider.issueAuthorizationCode with required DPoP nonces", async () => {
	const redirectUri = "https://client.example.com/callback";
	const issuer = {
		id: "test-code-issuer",
		endpoints: {
			testIssueCode: createAuthEndpoint(
				"/test/issue-code",
				{ method: "POST", use: [sessionMiddleware] },
				async (ctx) => {
					const provider = getOAuthProviderApi(
						ctx,
						ctx.context.getPlugin("oauth-provider")!.options,
					);
					const issued = await provider.issueAuthorizationCode({
						query: ctx.body,
						session: ctx.context.session,
					});
					return ctx.json({ code: issued.code });
				},
			),
		},
	} satisfies BetterAuthPlugin;

	const { auth, client, signInWithTestUser } = await getTestInstance({
		baseURL: "http://localhost:3000/api/auth",
		plugins: [
			issuer,
			jwt({ jwt: { issuer: "http://localhost:3000" } }),
			oauthProvider({
				loginPage: "/login",
				consentPage: "/consent",
				dpop: { nonce: { required: true } },
			}),
		],
	});
	const { headers } = await signInWithTestUser();

	it("challenges for a nonce before consuming a private_key_jwt assertion", async () => {
		const { privateKey, publicKey } = await generateKeyPair("RS256", {
			extractable: true,
		});
		const keyClient = await auth.api.adminCreateOAuthClient({
			headers,
			body: {
				grant_types: ["authorization_code"],
				redirect_uris: [redirectUri],
				token_endpoint_auth_method: "private_key_jwt",
				skip_consent: true,
				jwks: {
					keys: [
						{
							...(await exportJWK(publicKey)),
							kid: "issue-key",
							alg: "RS256",
							use: "sig",
						},
					],
				},
			},
		});
		const now = Math.floor(Date.now() / 1000);
		const assertion = await new SignJWT({})
			.setProtectedHeader({ alg: "RS256", kid: "issue-key" })
			.setIssuer(keyClient.client_id)
			.setSubject(keyClient.client_id)
			.setAudience(issueCodeEndpoint)
			.setIssuedAt(now)
			.setExpirationTime(now + 60)
			.setJti(generateRandomString(16))
			.sign(privateKey);
		const body = {
			response_type: "code",
			client_id: keyClient.client_id,
			scope: "openid",
			code_challenge: await generateCodeChallenge(generateRandomString(43)),
			code_challenge_method: "S256",
			client_assertion_type:
				"urn:ietf:params:oauth:client-assertion-type:jwt-bearer",
			client_assertion: assertion,
		};
		const key = await createDpopKey();
		const send = (proof: string) =>
			client.$fetch<{ code: string }>("/test/issue-code", {
				method: "POST",
				headers: { ...Object.fromEntries(headers), DPoP: proof },
				body,
			});

		let nonce = "";
		const challenged = await client.$fetch("/test/issue-code", {
			method: "POST",
			headers: {
				...Object.fromEntries(headers),
				DPoP: await createDpopProof(key, issueCodeEndpoint),
			},
			body,
			onError(ctx) {
				nonce = ctx.response.headers.get("DPoP-Nonce") ?? "";
			},
		});
		expect((challenged.error as { error?: string } | null)?.error).toBe(
			"use_dpop_nonce",
		);
		expect(nonce).not.toBe("");

		const issued = await send(
			await createDpopProof(key, issueCodeEndpoint, nonce),
		);
		expect(issued.error).toBeNull();
		expect(issued.data?.code).toEqual(expect.any(String));
	});
});
