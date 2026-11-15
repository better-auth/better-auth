import {
	APIError,
	createAuthEndpoint,
	sessionMiddleware,
} from "better-auth/api";
import { setSessionCookie } from "better-auth/cookies";
import { generateRandomString } from "better-auth/crypto";
import { deriveDpopJkt, generateCodeChallenge } from "better-auth/oauth2";
import { jwt } from "better-auth/plugins/jwt";
import { getTestInstance } from "better-auth/test";
import type { BetterAuthPlugin } from "better-auth/types";
import type { JWK } from "jose";
import { decodeJwt, exportJWK, generateKeyPair, SignJWT } from "jose";
import { beforeAll, describe, expect, it } from "vitest";
import { oauthProvider } from "./oauth";
import { getOAuthProviderApi } from "./token";
import type { StoredAuthorizationQuery } from "./types";
import type { OAuthClient } from "./types/oauth";
import { storeToken } from "./utils";

const issueCodeEndpoint = "http://localhost:3000/api/auth/test/issue-code";
const followUpEndpoint =
	"http://localhost:3000/api/auth/test/issue-code-follow-up";

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

	// Stands in for the state a multi-request flow stores with the handle it
	// returns on its first request.
	const pendingFlows = new Map<
		string,
		{ clientId: string; dpopJkt?: string }
	>();

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
			testIssueCodeFollowUp: createAuthEndpoint(
				"/test/issue-code-follow-up",
				{ method: "POST", use: [sessionMiddleware] },
				async (ctx) => {
					const { handle, ...request } = ctx.body as Record<string, string>;
					const pending = pendingFlows.get(handle ?? "");
					if (!pending) {
						throw new APIError("BAD_REQUEST", { error: "invalid_session" });
					}
					const provider = getOAuthProviderApi(
						ctx,
						ctx.context.getPlugin("oauth-provider")!.options,
					);
					const issued = await provider.issueAuthorizationCode({
						query: {
							...request,
							client_id: pending.clientId,
							dpop_jkt: pending.dpopJkt,
						} as StoredAuthorizationQuery,
						session: ctx.context.session,
					});
					return ctx.json({ code: issued.code });
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
		expect(issued.error?.status).toBe(401);
		expect(errorCode(issued)).toBe("invalid_client");
	});

	it("reads an empty client_id as omitted", async () => {
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
		const { query } = await codeRequest(basicClient);
		const issued = await issueCode(
			{ ...query, client_id: "" },
			{ authorization: `Basic ${basic}` },
		);
		expect(issued.error).toBeNull();
		const row = await findCodeRow(issued.data!.code);
		expect(JSON.parse(row!.value).query.client_id).toBe(basicClient.client_id);
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
		expect(errorCode(issued)).toBe("invalid_dpop_proof");
	});

	it("does not use up a proof rejected for its key", async () => {
		const key = await createDpopKey();
		const otherKey = await createDpopKey();
		const proof = await createDpopProof(key, issueCodeEndpoint);
		const { query } = await codeRequest(publicClient);
		const rejected = await issueCode(
			{ ...query, dpop_jkt: otherKey.jkt },
			{ DPoP: proof },
		);
		expect(errorCode(rejected)).toBe("invalid_dpop_proof");

		const issued = await issueCode(query, { DPoP: proof });
		expect(issued.error).toBeNull();
		const row = await findCodeRow(issued.data!.code);
		expect(JSON.parse(row!.value).query.dpop_jkt).toBe(key.jkt);
	});

	/**
	 * @see https://datatracker.ietf.org/doc/html/draft-ietf-oauth-first-party-apps-04#section-5.1
	 */
	describe("on a follow-up request", () => {
		function followUp(
			handle: string,
			request: Record<string, unknown>,
			extraHeaders: Record<string, string> = {},
		) {
			return client.$fetch<{ code: string }>("/test/issue-code-follow-up", {
				method: "POST",
				headers: { ...Object.fromEntries(headers), ...extraHeaders },
				body: { handle, ...request },
			});
		}

		/** A code request that leaves `client_id` to the stored flow. */
		async function followUpRequest() {
			const { query } = await codeRequest(publicClient);
			const { client_id: _, ...request } = query;
			return request;
		}

		it("issues a code for the stored client when the request omits client_id", async () => {
			pendingFlows.set("public", { clientId: publicClient.client_id });
			const issued = await followUp("public", await followUpRequest());
			expect(issued.error).toBeNull();
			const row = await findCodeRow(issued.data!.code);
			expect(JSON.parse(row!.value).query.client_id).toBe(
				publicClient.client_id,
			);
		});

		it("rejects a request that names another client", async () => {
			pendingFlows.set("public", { clientId: publicClient.client_id });
			const issued = await followUp("public", {
				...(await followUpRequest()),
				client_id: confidentialClient.client_id,
				client_secret: confidentialClient.client_secret,
			});
			expect(errorCode(issued)).toBe("invalid_client");
		});

		it("rejects a stored client_id that is not a string", async () => {
			pendingFlows.set("malformed", {
				clientId: 42 as unknown as string,
			});
			const issued = await followUp("malformed", {
				...(await followUpRequest()),
				client_id: confidentialClient.client_id,
				client_secret: confidentialClient.client_secret,
			});
			expect(errorCode(issued)).toBe("invalid_request");
		});

		it("requires the stored client's credentials", async () => {
			pendingFlows.set("confidential", {
				clientId: confidentialClient.client_id,
			});
			const { query } = await codeRequest(confidentialClient);
			const { client_id: _, ...request } = query;
			const missing = await followUp("confidential", request);
			expect(errorCode(missing)).toBe("invalid_client");

			const issued = await followUp("confidential", {
				...request,
				client_secret: confidentialClient.client_secret,
			});
			expect(issued.error).toBeNull();
		});

		it("binds the code to the stored DPoP key and rejects another key", async () => {
			const key = await createDpopKey();
			const otherKey = await createDpopKey();
			pendingFlows.set("bound", {
				clientId: publicClient.client_id,
				dpopJkt: key.jkt,
			});
			const rejected = await followUp("bound", await followUpRequest(), {
				DPoP: await createDpopProof(otherKey, followUpEndpoint),
			});
			expect(errorCode(rejected)).toBe("invalid_dpop_proof");

			const issued = await followUp("bound", await followUpRequest(), {
				DPoP: await createDpopProof(key, followUpEndpoint),
			});
			expect(issued.error).toBeNull();
			const row = await findCodeRow(issued.data!.code);
			expect(JSON.parse(row!.value).query.dpop_jkt).toBe(key.jkt);
		});

		it("binds the code to the stored DPoP key without a proof", async () => {
			const key = await createDpopKey();
			pendingFlows.set("unproven", {
				clientId: publicClient.client_id,
				dpopJkt: key.jkt,
			});
			const issued = await followUp("unproven", await followUpRequest());
			expect(issued.error).toBeNull();
			const row = await findCodeRow(issued.data!.code);
			expect(JSON.parse(row!.value).query.dpop_jkt).toBe(key.jkt);
		});
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
			name: "prompt=login for a session from an earlier request",
			client: () => confidentialClient,
			extra: { redirect_uri: redirectUri, prompt: "login" },
			error: "login_required",
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
			// RFC 10070 §4: the issuer is the only audience.
			.setAudience("http://localhost:3000")
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

/**
 * OIDC Core §3.1.2.1 and §3.1.2.3: `prompt=login` and `max_age=0` require an
 * authentication that happens after the request, which an endpoint performs
 * when it signs the user in within the request that issues the code.
 * @see https://openid.net/specs/openid-connect-core-1_0.html#AuthRequest
 */
describe("provider.issueAuthorizationCode after a sign-in in the same request", async () => {
	const redirectUri = "https://client.example.com/callback";

	const getProvider = (ctx: Parameters<typeof getOAuthProviderApi>[0]) =>
		getOAuthProviderApi(ctx, ctx.context.getPlugin("oauth-provider")!.options);

	// Stands in for a native-app endpoint that checks the user's credentials and
	// issues the code in one request.
	const issuer = {
		id: "test-sign-in-code-issuer",
		endpoints: {
			testSignInAndIssueCode: createAuthEndpoint(
				"/test/sign-in-and-issue-code",
				{ method: "POST" },
				async (ctx) => {
					// The client's credentials stay in the body, where client
					// authentication reads them; the user's do not belong in `query`.
					const { email, password, ...query } = ctx.body as {
						email: string;
						password: string;
					} & Record<string, unknown>;
					const found = await ctx.context.internalAdapter.findUserByEmail(
						email,
						{ includeAccounts: true },
					);
					const hash = found?.accounts.find(
						(account) => account.providerId === "credential",
					)?.password;
					if (
						!found ||
						!hash ||
						!(await ctx.context.password.verify({
							hash,
							password,
						}))
					) {
						throw new APIError("UNAUTHORIZED");
					}
					const session = await ctx.context.internalAdapter.createSession(
						found.user.id,
					);
					await setSessionCookie(ctx, { session, user: found.user });
					const issued = await getProvider(ctx).issueAuthorizationCode({
						query,
						session: { session, user: found.user },
					});
					return ctx.json({
						code: issued.code,
						sessionCreatedAt: new Date(session.createdAt).getTime(),
					});
				},
			),
			testIssueCode: createAuthEndpoint(
				"/test/issue-code",
				{ method: "POST", use: [sessionMiddleware] },
				async (ctx) => {
					const issued = await getProvider(ctx).issueAuthorizationCode({
						query: ctx.body as StoredAuthorizationQuery,
						session: ctx.context.session,
					});
					return ctx.json({ code: issued.code });
				},
			),
			testSessionRefreshed: createAuthEndpoint(
				"/test/session-refreshed",
				{ method: "GET", use: [sessionMiddleware] },
				async (ctx) =>
					ctx.json({
						refreshed:
							ctx.context.newSession?.session.id ===
							ctx.context.session.session.id,
					}),
			),
		},
	} satisfies BetterAuthPlugin;

	const { auth, client, signInWithTestUser, testUser } = await getTestInstance({
		baseURL: "http://localhost:3000/api/auth/",
		advanced: { skipTrailingSlashes: true },
		// Every request refreshes the cookie session, so the session middleware
		// sets it as this request's new session.
		session: { updateAge: 0 },
		plugins: [
			issuer,
			jwt({ jwt: { issuer: "http://localhost:3000" } }),
			oauthProvider({ loginPage: "/login", consentPage: "/consent" }),
		],
	});
	const { headers } = await signInWithTestUser();
	const context = await auth.$context;

	let oauthClient: OAuthClient;
	beforeAll(async () => {
		oauthClient = await auth.api.adminCreateOAuthClient({
			headers,
			body: {
				grant_types: ["authorization_code"],
				redirect_uris: [redirectUri],
				token_endpoint_auth_method: "client_secret_post",
				skip_consent: true,
			},
		});
	});

	async function codeQuery(extra: Record<string, unknown>) {
		return {
			response_type: "code",
			client_id: oauthClient.client_id,
			client_secret: oauthClient.client_secret,
			redirect_uri: redirectUri,
			scope: "openid",
			code_challenge: await generateCodeChallenge(generateRandomString(43)),
			code_challenge_method: "S256",
			...extra,
		};
	}

	function signInAndIssueCode(query: Record<string, unknown>) {
		return client.$fetch<{ code: string; sessionCreatedAt: number }>(
			"/test/sign-in-and-issue-code",
			{
				method: "POST",
				body: {
					...query,
					email: testUser.email,
					password: testUser.password,
				},
			},
		);
	}

	async function storedCode(code: string) {
		const row = await context.internalAdapter.findVerificationValue(
			await storeToken("hashed", code, "authorization_code"),
		);
		return JSON.parse(row!.value) as {
			query: StoredAuthorizationQuery;
			authTime: number;
		};
	}

	it("accepts prompt=login and records the new sign-in as auth_time", async () => {
		const issued = await signInAndIssueCode(
			await codeQuery({ prompt: "login" }),
		);
		expect(issued.error).toBeNull();
		const stored = await storedCode(issued.data!.code);
		expect(stored.query.prompt).toBeUndefined();
		expect(stored.authTime).toBe(issued.data!.sessionCreatedAt);
		expect(stored.query).not.toHaveProperty("password");
		expect(stored.query).not.toHaveProperty("client_secret");
	});

	it("accepts max_age=0", async () => {
		const issued = await signInAndIssueCode(await codeQuery({ max_age: 0 }));
		expect(issued.error).toBeNull();
		const stored = await storedCode(issued.data!.code);
		expect(stored.query.max_age).toBeUndefined();
	});

	it("still rejects a prompt that needs a page", async () => {
		const issued = await signInAndIssueCode(
			await codeQuery({ prompt: "login consent" }),
		);
		expect(issued.error?.status).toBe(400);
		expect((issued.error as { error?: string } | null)?.error).toBe(
			"interaction_required",
		);
	});

	it("rejects prompt=login for a session this request only refreshed", async () => {
		const refreshed = await client.$fetch<{ refreshed: boolean }>(
			"/test/session-refreshed",
			{ headers },
		);
		expect(refreshed.data?.refreshed).toBe(true);

		for (const extra of [{ prompt: "login" }, { max_age: 0 }]) {
			const issued = await client.$fetch("/test/issue-code", {
				method: "POST",
				headers,
				body: await codeQuery(extra),
			});
			expect(issued.error?.status).toBe(400);
			expect(issued.error).toMatchObject({
				error: "login_required",
				error_description: "the request requires a new sign-in",
			});
		}
	});
});

/**
 * @see https://github.com/better-auth/better-auth/issues/10414
 */
describe("provider.issueAuthorizationCode with caller-supplied amr", async () => {
	const redirectUri = "https://client.example.com/callback";
	const resource = "https://api.example.com";

	const issuer = {
		id: "test-amr-code-issuer",
		endpoints: {
			testIssueCode: createAuthEndpoint(
				"/test/issue-code",
				{ method: "POST", use: [sessionMiddleware] },
				async (ctx) => {
					const { amr, ...query } = ctx.body as {
						amr?: string[];
					} & StoredAuthorizationQuery;
					const issued = await getOAuthProviderApi(
						ctx,
						ctx.context.getPlugin("oauth-provider")!.options,
					).issueAuthorizationCode({
						query,
						session: ctx.context.session,
						amr,
					});
					return ctx.json({ code: issued.code });
				},
			),
		},
	} satisfies BetterAuthPlugin;

	async function setup(
		authenticationContext?: Parameters<
			typeof oauthProvider
		>[0]["authenticationContext"],
	) {
		const instance = await getTestInstance({
			baseURL: "http://localhost:3000/api/auth/",
			advanced: { skipTrailingSlashes: true },
			plugins: [
				issuer,
				jwt({ jwt: { issuer: "http://localhost:3000" } }),
				oauthProvider({
					loginPage: "/login",
					consentPage: "/consent",
					authenticationContext,
					resources: [resource],
					enforcePerClientResources: false,
				}),
			],
		});
		const { headers } = await instance.signInWithTestUser();
		const oauthClient = await instance.auth.api.adminCreateOAuthClient({
			headers,
			body: {
				grant_types: ["authorization_code"],
				redirect_uris: [redirectUri],
				token_endpoint_auth_method: "none",
				application_type: "native",
				skip_consent: true,
			},
		});
		const context = await instance.auth.$context;
		let verifier = "";
		return {
			async issue(scope: string, amr?: unknown) {
				verifier = generateRandomString(43);
				const issued = await instance.client.$fetch<{ code: string }>(
					"/test/issue-code",
					{
						method: "POST",
						headers,
						body: {
							response_type: "code",
							client_id: oauthClient.client_id,
							scope,
							resource,
							code_challenge: await generateCodeChallenge(verifier),
							code_challenge_method: "S256",
							amr,
						},
					},
				);
				return issued;
			},
			async redeem(code: string) {
				const tokens = await instance.client.$fetch<{
					access_token: string;
					id_token?: string;
				}>("/oauth2/token", {
					method: "POST",
					headers: { "content-type": "application/x-www-form-urlencoded" },
					body: new URLSearchParams({
						grant_type: "authorization_code",
						client_id: oauthClient.client_id!,
						code,
						code_verifier: verifier,
						resource,
					}),
				});
				expect(tokens.error).toBeNull();
				return tokens.data!;
			},
			async sessionCreatedAt() {
				const session = await instance.auth.api.getSession({ headers });
				return new Date(session!.session.createdAt).getTime();
			},
			async stored(code: string) {
				const row = await context.internalAdapter.findVerificationValue(
					await storeToken("hashed", code, "authorization_code"),
				);
				return JSON.parse(row!.value) as {
					authTime: number;
					acr?: string;
					amr?: string[];
				};
			},
		};
	}

	it("passes the methods to authenticationContext.resolve", async () => {
		const seen: unknown[] = [];
		const { issue, stored } = await setup({
			acrValuesSupported: ["0", "urn:example:mfa"],
			resolve: ({ amr }) => {
				seen.push(amr);
				return amr?.includes("otp")
					? { acr: "urn:example:mfa", amr }
					: undefined;
			},
		});
		const issued = await issue("openid", ["pwd", "otp"]);
		expect(issued.error).toBeNull();
		expect(seen).toEqual([["pwd", "otp"]]);
		const row = await stored(issued.data!.code);
		expect(row.acr).toBe("urn:example:mfa");
		expect(row.amr).toEqual(["pwd", "otp"]);
	});

	it("keeps what the resolver returns over the caller's methods", async () => {
		const { issue, stored } = await setup({
			acrValuesSupported: ["0"],
			resolve: () => ({ amr: ["hwk"] }),
		});
		const issued = await issue("openid", ["pwd"]);
		expect((await stored(issued.data!.code)).amr).toEqual(["hwk"]);
	});

	it("stores the caller's methods when no resolver is configured", async () => {
		const { issue, stored } = await setup();
		const issued = await issue("openid", ["pwd", "otp"]);
		expect(issued.error).toBeNull();
		const row = await stored(issued.data!.code);
		expect(row.amr).toEqual(["pwd", "otp"]);
		expect(row.acr).toBeUndefined();
	});

	it("puts the methods in the ID token and never in the access token", async () => {
		const { issue, redeem } = await setup();
		const issued = await issue("openid", ["pwd", "otp"]);
		const tokens = await redeem(issued.data!.code);
		expect(decodeJwt(tokens.id_token!).amr).toEqual(["pwd", "otp"]);
		expect(decodeJwt(tokens.access_token)).not.toHaveProperty("amr");
	});

	it("issues no methods for a request without openid", async () => {
		const { issue, stored, redeem } = await setup();
		const issued = await issue("profile", ["pwd"]);
		expect(issued.error).toBeNull();
		expect((await stored(issued.data!.code)).amr).toBeUndefined();
		const tokens = await redeem(issued.data!.code);
		expect(tokens.id_token).toBeUndefined();
		expect(decodeJwt(tokens.access_token)).not.toHaveProperty("amr");
	});

	it("rejects methods that are not a string array", async () => {
		const { issue } = await setup();
		const issued = await issue("openid", ["pwd", 1]);
		expect(issued.error?.status).toBe(500);
	});

	it("keeps auth_time from the session", async () => {
		const { issue, stored, sessionCreatedAt } = await setup();
		const issued = await issue("openid", ["pwd"]);
		expect((await stored(issued.data!.code)).authTime).toBe(
			await sessionCreatedAt(),
		);
	});
});

/**
 * @see https://github.com/better-auth/better-auth/issues/10414
 */
describe("provider.issueAuthorizationCode with serverContext", async () => {
	const redirectUri = "https://client.example.com/callback";
	const resource = "https://api.example.com";

	const issuer = {
		id: "test-server-context-code-issuer",
		endpoints: {
			testIssueCode: createAuthEndpoint(
				"/test/issue-code",
				{ method: "POST", use: [sessionMiddleware] },
				async (ctx) => {
					const { serverContext, ...query } = ctx.body as {
						serverContext?: Record<string, unknown>;
					} & StoredAuthorizationQuery;
					const issued = await getOAuthProviderApi(
						ctx,
						ctx.context.getPlugin("oauth-provider")!.options,
					).issueAuthorizationCode({
						query,
						session: ctx.context.session,
						amr: ["pwd"],
						...(serverContext !== undefined ? { serverContext } : {}),
					});
					return ctx.json({ code: issued.code });
				},
			),
		},
	} satisfies BetterAuthPlugin;

	// What `customTokenResponseFields` saw on each authorization_code exchange.
	const seen: (Record<string, unknown> | undefined)[] = [];
	const { auth, client, signInWithTestUser } = await getTestInstance({
		baseURL: "http://localhost:3000/api/auth/",
		advanced: { skipTrailingSlashes: true },
		plugins: [
			issuer,
			jwt({ jwt: { issuer: "http://localhost:3000" } }),
			oauthProvider({
				loginPage: "/login",
				consentPage: "/consent",
				resources: [resource],
				enforcePerClientResources: false,
				customTokenResponseFields: ({ grantType, verificationValue }) => {
					if (grantType !== "authorization_code") return {};
					seen.push(verificationValue?.serverContext);
					const handle = verificationValue?.serverContext?.authSessionId;
					return typeof handle === "string" ? { auth_session: handle } : {};
				},
			}),
		],
	});
	const { headers, user } = await signInWithTestUser();
	const context = await auth.$context;

	let oauthClient: OAuthClient;
	beforeAll(async () => {
		oauthClient = await auth.api.adminCreateOAuthClient({
			headers,
			body: {
				grant_types: ["authorization_code"],
				redirect_uris: [redirectUri],
				token_endpoint_auth_method: "none",
				application_type: "native",
				skip_consent: true,
			},
		});
	});

	async function codeQuery() {
		const verifier = generateRandomString(43);
		const query = {
			response_type: "code",
			client_id: oauthClient.client_id,
			scope: "openid",
			resource,
			code_challenge: await generateCodeChallenge(verifier),
			code_challenge_method: "S256",
		};
		return { query, verifier };
	}

	function issue(
		query: Record<string, unknown>,
		serverContext?: unknown,
		extraHeaders: Record<string, string> = {},
	) {
		return client.$fetch<{ code: string }>("/test/issue-code", {
			method: "POST",
			headers: { ...Object.fromEntries(headers), ...extraHeaders },
			body: { ...query, serverContext },
		});
	}

	async function redeem(code: string, verifier: string) {
		const tokens = await client.$fetch<{
			access_token: string;
			id_token?: string;
			auth_session?: string;
		}>("/oauth2/token", {
			method: "POST",
			headers: { "content-type": "application/x-www-form-urlencoded" },
			body: new URLSearchParams({
				grant_type: "authorization_code",
				client_id: oauthClient.client_id!,
				code,
				code_verifier: verifier,
				resource,
			}),
		});
		expect(tokens.error).toBeNull();
		return tokens.data!;
	}

	async function storedValue(code: string) {
		const row = await context.internalAdapter.findVerificationValue(
			await storeToken("hashed", code, "authorization_code"),
		);
		return JSON.parse(row!.value) as Record<string, unknown>;
	}

	it("passes serverContext to the token request that redeems the code", async () => {
		const { query, verifier } = await codeQuery();
		const serverContext = { authSessionId: "row-1", round: 2 };
		const issued = await issue(query, serverContext);
		expect(issued.error).toBeNull();
		expect((await storedValue(issued.data!.code)).serverContext).toEqual(
			serverContext,
		);
		seen.length = 0;
		const tokens = await redeem(issued.data!.code, verifier);
		expect(seen).toEqual([serverContext]);
		expect(tokens.auth_session).toBe("row-1");
	});

	it("cannot replace the fields the provider stores with the code", async () => {
		const { query, verifier } = await codeQuery();
		const plain = await issue(query);
		const serverContext = {
			type: "other",
			userId: "attacker",
			sessionId: "attacker-session",
			referenceId: "attacker-reference",
			authTime: 0,
			acr: "urn:example:forged",
			amr: ["hwk"],
			resource: ["https://attacker.example.com"],
			query: { ...query, scope: "openid offline_access", dpop_jkt: "forged" },
		};
		const withContext = await issue(query, serverContext);
		expect(withContext.error).toBeNull();
		const { serverContext: stored, ...provided } = await storedValue(
			withContext.data!.code,
		);
		expect(stored).toEqual(serverContext);
		expect(provided).toEqual(await storedValue(plain.data!.code));
		expect(provided.userId).toBe(user.id);

		const tokens = await redeem(withContext.data!.code, verifier);
		const idToken = decodeJwt(tokens.id_token!);
		expect(idToken.sub).toBe(user.id);
		expect(idToken.amr).toEqual(["pwd"]);
		expect(idToken.acr).toBe("0");
		expect(decodeJwt(tokens.access_token).scope).toBe("openid");
	});

	it("stores and passes nothing without serverContext", async () => {
		const { query, verifier } = await codeQuery();
		const issued = await issue(query);
		expect(issued.error).toBeNull();
		expect(await storedValue(issued.data!.code)).not.toHaveProperty(
			"serverContext",
		);
		seen.length = 0;
		const tokens = await redeem(issued.data!.code, verifier);
		expect(seen).toEqual([undefined]);
		expect(tokens).not.toHaveProperty("auth_session");
	});

	it("gives a code from /oauth2/authorize no serverContext", async () => {
		const verifier = generateRandomString(43);
		const query = {
			response_type: "code",
			client_id: oauthClient.client_id!,
			redirect_uri: redirectUri,
			scope: "openid",
			resource,
			code_challenge: await generateCodeChallenge(verifier),
			code_challenge_method: "S256",
			// A client cannot set the server-only field through the request.
			serverContext: JSON.stringify({ authSessionId: "forged" }),
		};
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
		const code = new URL(location).searchParams.get("code")!;
		expect(await storedValue(code)).not.toHaveProperty("serverContext");
		seen.length = 0;
		const tokens = await client.$fetch<{ auth_session?: string }>(
			"/oauth2/token",
			{
				method: "POST",
				headers: { "content-type": "application/x-www-form-urlencoded" },
				body: new URLSearchParams({
					grant_type: "authorization_code",
					client_id: oauthClient.client_id!,
					code,
					code_verifier: verifier,
					redirect_uri: redirectUri,
					resource,
				}),
			},
		);
		expect(tokens.error).toBeNull();
		expect(seen).toEqual([undefined]);
		expect(tokens.data).not.toHaveProperty("auth_session");
	});

	it.each([
		["an array", ["row-1"]],
		["a string", "row-1"],
		["null", null],
	])("rejects %s as serverContext", async (_, serverContext) => {
		const { query } = await codeQuery();
		const issued = await issue(query, serverContext);
		expect(issued.error?.status).toBe(500);
	});

	it("rejects serverContext before using up the request's DPoP proof", async () => {
		const key = await createDpopKey();
		const proof = await createDpopProof(key, issueCodeEndpoint);
		const { query } = await codeQuery();
		const rejected = await issue(query, ["row-1"], { DPoP: proof });
		expect(rejected.error?.status).toBe(500);
		expect(rejected.data).toBeNull();

		const issued = await issue(
			query,
			{ authSessionId: "row-1" },
			{ DPoP: proof },
		);
		expect(issued.error).toBeNull();
		const stored = await storedValue(issued.data!.code);
		expect((stored.query as StoredAuthorizationQuery).dpop_jkt).toBe(key.jkt);
	});
});
