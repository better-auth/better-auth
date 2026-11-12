import type { GenericEndpointContext } from "@better-auth/core";
import { createAuthEndpoint, createAuthMiddleware } from "better-auth/api";
import { generateRandomString } from "better-auth/crypto";
import type { VerifiedDpopProof } from "better-auth/oauth2";
import {
	authorizationCodeRequest,
	createAuthorizationURL,
	createDpopNonce,
	deriveDpopAth,
	deriveDpopJkt,
	refreshAccessTokenRequest,
	verifyAccessTokenRequest,
} from "better-auth/oauth2";
import { jwt } from "better-auth/plugins/jwt";
import { getTestInstance } from "better-auth/test";
import type { BetterAuthOptions, BetterAuthPlugin } from "better-auth/types";
import type { APIError } from "better-call";
import type { JWK } from "jose";
import { decodeJwt, exportJWK, generateKeyPair, SignJWT } from "jose";
import { afterEach, describe, expect, expectTypeOf, it, vi } from "vitest";
import * as z from "zod";
import { oauthProviderClient } from "./client";
import { oauthProviderResourceClient } from "./client-resource";
import { oauthProvider } from "./oauth";
import { createResourceServerChallenge } from "./resource-challenge";
import { getOAuthProviderApi } from "./token";
import type { OAuthProviderApi } from "./types";

const authServerBaseUrl = "http://localhost:3000";
const rpBaseUrl = "http://localhost:5000";
const jwtResource = "https://dpop-api.example.com";
const resourceUrl = `${jwtResource}/data`;
const tokenEndpoint = `${authServerBaseUrl}/api/auth/oauth2/token`;
const userinfoEndpoint = `${authServerBaseUrl}/api/auth/oauth2/userinfo`;
const pluginIssueEndpoint = `${authServerBaseUrl}/api/auth/test/dpop-issue`;
const jwksUrl = `${authServerBaseUrl}/api/auth/jwks`;
const redirectUri = `${rpBaseUrl}/api/auth/callback/test`;

// A plugin endpoint that issues tokens itself, outside the token endpoint and
// without `metadata.noStore`.
const pluginIssuer = {
	id: "test-dpop-nonce-plugin-issuer",
	endpoints: {
		testDpopNonceIssue: createAuthEndpoint(
			"/test/dpop-issue",
			{ method: "POST" },
			async (ctx: GenericEndpointContext) => {
				const provider = getOAuthProviderApi(
					ctx,
					ctx.context.getPlugin("oauth-provider")!.options,
					"client_credentials",
				);
				const { client } = await provider.authenticateClient();
				return ctx.json(await provider.issueTokens({ client, scopes: [] }));
			},
		),
	},
} satisfies BetterAuthPlugin;

const pluginBindEndpoint = `${authServerBaseUrl}/api/auth/test/dpop-bind`;
/** Counts requests that passed `challengeDpopNonce` on the companion endpoint. */
let stagedChallenges = 0;

/** A before hook that runs `challengeDpopNonce` on `path`, then `onPass`. */
function challengeNonceHook(path: string, onPass: () => void) {
	return createAuthMiddleware(async (ctx) => {
		if (ctx.path !== path) return;
		await getOAuthProviderApi(
			ctx,
			ctx.context.getPlugin("oauth-provider")!.options,
		).challengeDpopNonce();
		onPass();
	});
}

// A companion endpoint that accepts DPoP proofs outside the token endpoint,
// and one that only hands out nonces.
const dpopCompanion = {
	id: "test-dpop-companion",
	endpoints: {
		testDpopBind: createAuthEndpoint(
			"/test/dpop-bind",
			{
				method: "POST",
				body: z.object({ required: z.boolean().optional() }),
			},
			async (ctx) => {
				const provider = getOAuthProviderApi(
					ctx,
					ctx.context.getPlugin("oauth-provider")!.options,
				);
				const proof = await provider.verifyDpopProof({
					required: ctx.body.required,
				});
				return ctx.json({ jkt: proof?.jkt ?? null });
			},
		),
		// Challenges for a nonce before staging state, then verifies the same
		// proof, as an endpoint that consumes a one-time credential would.
		testDpopChallenge: createAuthEndpoint(
			"/test/dpop-challenge",
			{ method: "POST" },
			async (ctx) => {
				const provider = getOAuthProviderApi(
					ctx,
					ctx.context.getPlugin("oauth-provider")!.options,
				);
				await provider.challengeDpopNonce();
				stagedChallenges++;
				const proof = await provider.verifyDpopProof();
				return ctx.json({ jkt: proof?.jkt ?? null });
			},
		),
		testDpopNonce: createAuthEndpoint(
			"/test/dpop-nonce",
			{ method: "POST" },
			async (ctx) => {
				const provider = getOAuthProviderApi(
					ctx,
					ctx.context.getPlugin("oauth-provider")!.options,
				);
				return ctx.json({ nonce: (await provider.issueDpopNonce()) ?? null });
			},
		),
	},
} satisfies BetterAuthPlugin;

async function createDpopKey() {
	const { privateKey, publicKey } = await generateKeyPair("ES256", {
		extractable: true,
	});
	const publicJwk = await exportJWK(publicKey);
	return { privateKey, publicJwk, jkt: await deriveDpopJkt(publicJwk) };
}

type DpopKey = Awaited<ReturnType<typeof createDpopKey>>;

async function createProof(
	key: DpopKey,
	params: {
		method: string;
		url: string;
		nonce?: string | null;
		accessToken?: string;
	},
) {
	return new SignJWT({
		jti: generateRandomString(16),
		htm: params.method,
		htu: params.url,
		iat: Math.floor(Date.now() / 1000),
		...(params.nonce ? { nonce: params.nonce } : {}),
		...(params.accessToken
			? { ath: await deriveDpopAth(params.accessToken) }
			: {}),
	})
		.setProtectedHeader({
			typ: "dpop+jwt",
			alg: "ES256",
			jwk: key.publicJwk as JWK,
		})
		.sign(key.privateKey);
}

/** Mints a nonce as if the server issued it `secondsAgo` seconds ago. */
async function nonceIssuedAgo(secret: string, secondsAgo: number) {
	const now = Date.now();
	vi.useFakeTimers({ toFake: ["Date"] });
	vi.setSystemTime(now - secondsAgo * 1000);
	try {
		return await createDpopNonce({ secret });
	} finally {
		vi.useRealTimers();
	}
}

function resourceRequest(accessToken: string, dpopProof: string) {
	return new Request(resourceUrl, {
		headers: { authorization: `DPoP ${accessToken}`, DPoP: dpopProof },
	});
}

/** An authorization server that requires DPoP nonces, with flow helpers. */
async function setupNonceProvider(params: {
	testWith: "sqlite" | "postgres";
	expiresIn?: number;
	/** A separate origin keeps the JWKS cache, keyed by URL, per instance. */
	baseURL?: string;
	hooks?: BetterAuthOptions["hooks"];
}) {
	const baseURL = params.baseURL ?? authServerBaseUrl;
	const tokenEndpoint = `${baseURL}/api/auth/oauth2/token`;
	const { auth, client, signInWithTestUser, customFetchImpl } =
		await getTestInstance(
			{
				baseURL,
				hooks: params.hooks,
				plugins: [
					pluginIssuer,
					dpopCompanion,
					jwt({ jwt: { issuer: baseURL } }),
					oauthProvider({
						loginPage: "/login",
						consentPage: "/consent",
						resources: [jwtResource],
						enforcePerClientResources: false,
						dpop: {
							nonce: { required: true, expiresIn: params.expiresIn },
						},
					}),
				],
			},
			{
				testWith: params.testWith,
				clientOptions: { plugins: [oauthProviderClient()] },
			},
		);
	const context = await auth.$context;
	const { headers } = await signInWithTestUser();
	const oauthClient = await auth.api.adminCreateOAuthClient({
		headers,
		body: {
			token_endpoint_auth_method: "client_secret_post",
			grant_types: ["authorization_code", "refresh_token"],
			redirect_uris: [redirectUri],
			application_type: "native",
			skip_consent: true,
		},
	});

	async function authorizeForCode() {
		const codeVerifier = generateRandomString(32);
		const url = await createAuthorizationURL({
			id: "test",
			options: {
				clientId: oauthClient.client_id,
				clientSecret: oauthClient.client_secret,
				redirectURI: redirectUri,
			},
			redirectURI: "",
			authorizationEndpoint: `${baseURL}/api/auth/oauth2/authorize`,
			state: "123",
			scopes: ["openid", "offline_access"],
			codeVerifier,
		});
		url.searchParams.set("resource", jwtResource);
		let location = "";
		await client.$fetch(url.toString(), {
			headers,
			onError(errorContext) {
				location = errorContext.response.headers.get("Location") ?? "";
			},
		});
		const code = new URL(location).searchParams.get("code");
		if (!code) throw new Error("authorization did not return a code");
		return { code, codeVerifier };
	}

	async function codeRequestBody(code: string, codeVerifier: string) {
		const { body } = await authorizationCodeRequest({
			code,
			codeVerifier,
			redirectURI: redirectUri,
			resource: jwtResource,
			options: {
				clientId: oauthClient.client_id,
				clientSecret: oauthClient.client_secret!,
				redirectURI: redirectUri,
			},
		});
		return body;
	}

	async function postToken(body: URLSearchParams, dpopProof?: string) {
		const response = await customFetchImpl(tokenEndpoint, {
			method: "POST",
			headers: {
				"content-type": "application/x-www-form-urlencoded",
				...(dpopProof ? { DPoP: dpopProof } : {}),
			},
			body: body.toString(),
		});
		return {
			response,
			body: (await response.json()) as Record<string, string | undefined>,
		};
	}

	/** Issues DPoP-bound tokens, answering the nonce challenge on the way. */
	async function issueDpopTokens(key: DpopKey) {
		const { code, codeVerifier } = await authorizeForCode();
		const body = await codeRequestBody(code, codeVerifier);
		const challenge = await postToken(
			body,
			await createProof(key, { method: "POST", url: tokenEndpoint }),
		);
		const nonce = challenge.response.headers.get("DPoP-Nonce");
		const issued = await postToken(
			body,
			await createProof(key, { method: "POST", url: tokenEndpoint, nonce }),
		);
		expect(issued.response.status).toBe(200);
		return {
			accessToken: issued.body.access_token!,
			refreshToken: issued.body.refresh_token!,
			nonce: issued.response.headers.get("DPoP-Nonce")!,
		};
	}

	/** Lets resource-server verification fetch the provider's JWKS. */
	function stubJwksFetch() {
		vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit) =>
			customFetchImpl(input, init),
		);
	}

	return {
		auth,
		context,
		headers,
		customFetchImpl,
		oauthClient,
		authorizeForCode,
		codeRequestBody,
		postToken,
		issueDpopTokens,
		stubJwksFetch,
	};
}

afterEach(() => {
	vi.useRealTimers();
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

/**
 * RFC 9449 §8 (authorization server) and §9 (resource server) nonces.
 *
 * The flows that redeem a one-time credential run against SQLite and Postgres,
 * so the "challenge before consumption" ordering is checked on a database that
 * enforces single-use redemption, not only on the in-memory adapter.
 */
describe.each(["sqlite", "postgres"] as const)(
	"DPoP server-provided nonces (%s)",
	async (testWith) => {
		const {
			auth,
			context,
			headers,
			customFetchImpl,
			oauthClient,
			authorizeForCode,
			codeRequestBody,
			postToken,
			issueDpopTokens,
			stubJwksFetch,
		} = await setupNonceProvider({ testWith });
		const authSecret = context.secret;

		describe("token endpoint", () => {
			it("challenges a proof without a nonce before it redeems the code", async () => {
				const key = await createDpopKey();
				const { code, codeVerifier } = await authorizeForCode();
				const body = await codeRequestBody(code, codeVerifier);

				const challenge = await postToken(
					body,
					await createProof(key, { method: "POST", url: tokenEndpoint }),
				);

				expect(challenge.response.status).toBe(400);
				expect(challenge.body).toMatchObject({
					error: "use_dpop_nonce",
					error_description: "DPoP proof must include a server-provided nonce",
				});
				const nonce = challenge.response.headers.get("DPoP-Nonce");
				expect(nonce).toEqual(expect.any(String));
				expect(challenge.response.headers.get("Cache-Control")).toBe(
					"no-store",
				);
				expect(
					challenge.response.headers.get("Access-Control-Expose-Headers"),
				).toBe("DPoP-Nonce");

				const issued = await postToken(
					body,
					await createProof(key, {
						method: "POST",
						url: tokenEndpoint,
						nonce,
					}),
				);

				expect(issued.response.status).toBe(200);
				expect(issued.body.token_type).toBe("DPoP");
				expect(decodeJwt(issued.body.access_token!).cnf).toEqual({
					jkt: key.jkt,
				});
				// RFC 9449 §8.2: the success response carries the next nonce.
				expect(issued.response.headers.get("DPoP-Nonce")).toEqual(
					expect.any(String),
				);
				expect(issued.response.headers.get("Cache-Control")).toBe("no-store");
				expect(
					issued.response.headers.get("Access-Control-Expose-Headers"),
				).toBe("DPoP-Nonce");
			});

			it("challenges a nonce minted under another secret", async () => {
				const key = await createDpopKey();
				const { code, codeVerifier } = await authorizeForCode();
				const body = await codeRequestBody(code, codeVerifier);
				const foreignNonce = await createDpopNonce({
					secret: "another-deployment-secret-that-is-long-enough",
				});

				const challenge = await postToken(
					body,
					await createProof(key, {
						method: "POST",
						url: tokenEndpoint,
						nonce: foreignNonce,
					}),
				);

				expect(challenge.response.status).toBe(400);
				expect(challenge.body).toMatchObject({
					error: "use_dpop_nonce",
					error_description: "DPoP proof nonce is invalid or expired",
				});
				const nonce = challenge.response.headers.get("DPoP-Nonce");
				expect(nonce).not.toBe(foreignNonce);

				const issued = await postToken(
					body,
					await createProof(key, { method: "POST", url: tokenEndpoint, nonce }),
				);
				expect(issued.response.status).toBe(200);
			});

			it("challenges an expired nonce", async () => {
				const key = await createDpopKey();
				const { code, codeVerifier } = await authorizeForCode();
				const body = await codeRequestBody(code, codeVerifier);

				const challenge = await postToken(
					body,
					await createProof(key, {
						method: "POST",
						url: tokenEndpoint,
						nonce: await nonceIssuedAgo(authSecret, 301),
					}),
				);

				expect(challenge.response.status).toBe(400);
				expect(challenge.body.error).toBe("use_dpop_nonce");
			});

			it("accepts a nonce issued within its lifetime", async () => {
				const key = await createDpopKey();
				const { code, codeVerifier } = await authorizeForCode();

				const issued = await postToken(
					await codeRequestBody(code, codeVerifier),
					await createProof(key, {
						method: "POST",
						url: tokenEndpoint,
						nonce: await nonceIssuedAgo(authSecret, 290),
					}),
				);

				expect(issued.response.status).toBe(200);
			});

			it("redeems the code when the nonce expires while the grant runs", async () => {
				const key = await createDpopKey();
				const { code, codeVerifier } = await authorizeForCode();
				const body = await codeRequestBody(code, codeVerifier);
				const nonce = await nonceIssuedAgo(authSecret, 299);
				const proof = await createProof(key, {
					method: "POST",
					url: tokenEndpoint,
					nonce,
				});
				// The nonce has one second left when the request arrives. The clock
				// moves past its expiry while the grant consumes the code, after the
				// nonce check and before the proof is verified for issuance.
				const arrival = Date.now();
				vi.useFakeTimers({ toFake: ["Date"] });
				vi.setSystemTime(arrival);
				const consume = context.internalAdapter.consumeVerificationValue.bind(
					context.internalAdapter,
				);
				vi.spyOn(
					context.internalAdapter,
					"consumeVerificationValue",
				).mockImplementation(async (identifier) => {
					vi.setSystemTime(arrival + 10_000);
					return consume(identifier);
				});

				const issued = await postToken(body, proof);

				expect(issued.response.status).toBe(200);
				expect(issued.body.token_type).toBe("DPoP");
			});

			it("issues bearer tokens without a nonce when the request has no proof", async () => {
				const { code, codeVerifier } = await authorizeForCode();

				const issued = await postToken(
					await codeRequestBody(code, codeVerifier),
				);

				expect(issued.response.status).toBe(200);
				expect(issued.body.token_type).toBe("Bearer");
				expect(issued.response.headers.get("DPoP-Nonce")).toBeNull();
			});

			it("challenges a refresh before it rotates the refresh token", async () => {
				const key = await createDpopKey();
				const { refreshToken } = await issueDpopTokens(key);
				const { body } = await refreshAccessTokenRequest({
					refreshToken,
					options: {
						clientId: oauthClient.client_id,
						clientSecret: oauthClient.client_secret!,
						redirectURI: redirectUri,
					},
				});

				const challenge = await postToken(
					body,
					await createProof(key, { method: "POST", url: tokenEndpoint }),
				);
				expect(challenge.response.status).toBe(400);
				expect(challenge.body.error).toBe("use_dpop_nonce");

				const refreshed = await postToken(
					body,
					await createProof(key, {
						method: "POST",
						url: tokenEndpoint,
						nonce: challenge.response.headers.get("DPoP-Nonce"),
					}),
				);
				expect(refreshed.response.status).toBe(200);
				expect(refreshed.body.token_type).toBe("DPoP");
			});

			it("redeems a code once when challenged and retried concurrently", async () => {
				const key = await createDpopKey();
				const { code, codeVerifier } = await authorizeForCode();
				const body = await codeRequestBody(code, codeVerifier);

				const challenges = await Promise.all([
					postToken(
						body,
						await createProof(key, { method: "POST", url: tokenEndpoint }),
					),
					postToken(
						body,
						await createProof(key, { method: "POST", url: tokenEndpoint }),
					),
				]);
				expect(challenges.map((c) => c.body.error)).toEqual([
					"use_dpop_nonce",
					"use_dpop_nonce",
				]);

				// One nonce serves several proofs (RFC 9449 §11.1); the code still
				// redeems exactly once.
				const nonce = challenges[0]!.response.headers.get("DPoP-Nonce");
				const redemptions = await Promise.all([
					postToken(
						body,
						await createProof(key, {
							method: "POST",
							url: tokenEndpoint,
							nonce,
						}),
					),
					postToken(
						body,
						await createProof(key, {
							method: "POST",
							url: tokenEndpoint,
							nonce,
						}),
					),
				]);
				const statuses = redemptions.map((r) => r.response.status).sort();
				expect(statuses).toEqual([200, 400]);
				expect(
					redemptions.find((r) => r.response.status === 400)?.body.error,
				).toBe("invalid_grant");
			});
		});

		it("verifies the nonce on a plugin endpoint that issues tokens", async () => {
			const issuerClient = await auth.api.adminCreateOAuthClient({
				headers,
				body: {
					token_endpoint_auth_method: "client_secret_post",
					grant_types: ["client_credentials"],
				},
			});
			const key = await createDpopKey();
			const issue = (dpopProof: string) =>
				customFetchImpl(pluginIssueEndpoint, {
					method: "POST",
					headers: { "content-type": "application/json", DPoP: dpopProof },
					body: JSON.stringify({
						client_id: issuerClient.client_id,
						client_secret: issuerClient.client_secret,
					}),
				});

			const challenge = await issue(
				await createProof(key, { method: "POST", url: pluginIssueEndpoint }),
			);
			expect(challenge.status).toBe(400);
			expect(await challenge.json()).toMatchObject({ error: "use_dpop_nonce" });
			// The endpoint sets no `metadata.noStore`; the nonce sets no-store.
			expect(challenge.headers.get("Cache-Control")).toBe("no-store");

			const issued = await issue(
				await createProof(key, {
					method: "POST",
					url: pluginIssueEndpoint,
					nonce: challenge.headers.get("DPoP-Nonce"),
				}),
			);
			expect(issued.status).toBe(200);
			expect(await issued.json()).toMatchObject({ token_type: "DPoP" });
			expect(issued.headers.get("DPoP-Nonce")).toEqual(expect.any(String));
			expect(issued.headers.get("Cache-Control")).toBe("no-store");
		});

		describe("userinfo endpoint", () => {
			async function getUserInfo(accessToken: string, dpopProof: string) {
				return customFetchImpl(userinfoEndpoint, {
					headers: { authorization: `DPoP ${accessToken}`, DPoP: dpopProof },
				});
			}

			it("answers a proof without a nonce with a DPoP use_dpop_nonce challenge", async () => {
				const key = await createDpopKey();
				const { accessToken } = await issueDpopTokens(key);

				const challenge = await getUserInfo(
					accessToken,
					await createProof(key, {
						method: "GET",
						url: userinfoEndpoint,
						accessToken,
					}),
				);

				expect(challenge.status).toBe(401);
				expect(challenge.headers.get("WWW-Authenticate")).toBe(
					'DPoP error="use_dpop_nonce", error_description="DPoP proof must include a server-provided nonce", algs="EdDSA ES256 ES512 PS256 RS256"',
				);
				const nonce = challenge.headers.get("DPoP-Nonce");
				expect(nonce).toEqual(expect.any(String));
				expect(challenge.headers.get("Cache-Control")).toBe("no-store");
				// Browsers hide `WWW-Authenticate` too, and the client needs it to
				// see that it must retry with the nonce.
				expect(challenge.headers.get("Access-Control-Expose-Headers")).toBe(
					"DPoP-Nonce, WWW-Authenticate",
				);

				const userinfo = await getUserInfo(
					accessToken,
					await createProof(key, {
						method: "GET",
						url: userinfoEndpoint,
						accessToken,
						nonce,
					}),
				);
				expect(userinfo.status).toBe(200);
				expect(userinfo.headers.get("DPoP-Nonce")).toEqual(expect.any(String));
				expect(userinfo.headers.get("Access-Control-Expose-Headers")).toBe(
					"DPoP-Nonce",
				);
			});

			it("accepts the nonce the token endpoint issued", async () => {
				const key = await createDpopKey();
				const { accessToken, nonce } = await issueDpopTokens(key);

				const userinfo = await getUserInfo(
					accessToken,
					await createProof(key, {
						method: "GET",
						url: userinfoEndpoint,
						accessToken,
						nonce,
					}),
				);

				expect(userinfo.status).toBe(200);
			});
		});

		describe("resource server", () => {
			it("challenges with the resource-server DPoP challenge and accepts the provider's nonce", async () => {
				stubJwksFetch();
				const { verifyAccessTokenRequest: verifyResourceRequest } =
					oauthProviderResourceClient(auth).getActions();
				const key = await createDpopKey();
				const { accessToken, nonce } = await issueDpopTokens(key);
				const options = {
					jwksUrl,
					verifyOptions: { audience: jwtResource, issuer: authServerBaseUrl },
					dpop: { nonce: { required: true } },
				};

				const error = (await verifyResourceRequest(
					resourceRequest(
						accessToken,
						await createProof(key, {
							method: "GET",
							url: resourceUrl,
							accessToken,
						}),
					),
					options,
				).catch((e: unknown) => e)) as APIError;
				const challengeHeaders = new Headers(error.headers);
				expect(error.statusCode).toBe(401);
				expect(challengeHeaders.get("WWW-Authenticate")).toMatch(
					/^DPoP error="use_dpop_nonce", /,
				);
				expect(challengeHeaders.get("DPoP-Nonce")).toEqual(expect.any(String));
				expect(challengeHeaders.get("Cache-Control")).toBe("no-store");
				expect(challengeHeaders.get("Access-Control-Expose-Headers")).toBe(
					"DPoP-Nonce, WWW-Authenticate",
				);

				// Same secret: the nonce from the token response works.
				await expect(
					verifyResourceRequest(
						resourceRequest(
							accessToken,
							await createProof(key, {
								method: "GET",
								url: resourceUrl,
								accessToken,
								nonce,
							}),
						),
						options,
					),
				).resolves.toMatchObject({ cnf: { jkt: key.jkt } });
			});

			it("rejects the provider's nonce at a resource server with its own secret", async () => {
				stubJwksFetch();
				const resourceSecret = "resource-server-nonce-secret-long-enough";
				const key = await createDpopKey();
				const { accessToken, nonce: providerNonce } =
					await issueDpopTokens(key);
				const verify = async (nonce?: string | null) =>
					verifyAccessTokenRequest(
						{
							authorizationHeader: `DPoP ${accessToken}`,
							dpopProofJwt: await createProof(key, {
								method: "GET",
								url: resourceUrl,
								accessToken,
								nonce,
							}),
							method: "GET",
							url: resourceUrl,
						},
						{
							jwksUrl,
							verifyOptions: {
								audience: jwtResource,
								issuer: authServerBaseUrl,
							},
							dpop: {
								nonce: { required: true, secret: resourceSecret },
							},
						},
					);

				const error = (await verify(providerNonce).catch(
					(e: unknown) => e,
				)) as APIError;
				expect(error.body).toMatchObject({
					error: "use_dpop_nonce",
					error_description: "DPoP proof nonce is invalid or expired",
				});
				const challenge = createResourceServerChallenge(error, jwtResource);
				const resourceNonce = new Headers(challenge?.headers).get("DPoP-Nonce");
				expect(resourceNonce).toEqual(expect.any(String));

				await expect(verify(resourceNonce)).resolves.toMatchObject({
					cnf: { jkt: key.jkt },
				});
				// The resource server's own success-path nonce is accepted too.
				await expect(
					verify(await createDpopNonce({ secret: resourceSecret })),
				).resolves.toMatchObject({ cnf: { jkt: key.jkt } });
			});
		});
	},
);

describe("DPoP nonce challenge on userinfo with hook-exposed headers", async () => {
	const baseURL = "http://localhost:3002";
	const endpoint = `${baseURL}/api/auth/oauth2/userinfo`;
	const { customFetchImpl, issueDpopTokens } = await setupNonceProvider({
		testWith: "sqlite",
		baseURL,
		hooks: {
			before: createAuthMiddleware(async (ctx) => {
				ctx.setHeader("Access-Control-Expose-Headers", "X-Request-Id");
			}),
		},
	});

	it("keeps the names a before hook exposed alongside the nonce and challenge", async () => {
		const key = await createDpopKey();
		const { accessToken } = await issueDpopTokens(key);

		const challenge = await customFetchImpl(endpoint, {
			headers: {
				authorization: `DPoP ${accessToken}`,
				DPoP: await createProof(key, {
					method: "GET",
					url: endpoint,
					accessToken,
				}),
			},
		});

		expect(challenge.status).toBe(401);
		expect(challenge.headers.get("WWW-Authenticate")).toMatch(
			/^DPoP error="use_dpop_nonce", /,
		);
		expect(challenge.headers.get("DPoP-Nonce")).toEqual(expect.any(String));
		expect(challenge.headers.get("Cache-Control")).toBe("no-store");
		expect(challenge.headers.get("Access-Control-Expose-Headers")).toBe(
			"X-Request-Id, DPoP-Nonce, WWW-Authenticate",
		);
	});
});

describe("DPoP nonce lifetime shared with the resource client", async () => {
	const issuer = "http://localhost:3001";
	const { auth, context, issueDpopTokens, stubJwksFetch } =
		await setupNonceProvider({
			testWith: "sqlite",
			expiresIn: 60,
			baseURL: issuer,
		});

	it("validates nonces with the provider's expiresIn", async () => {
		stubJwksFetch();
		const { verifyAccessTokenRequest: verifyResourceRequest } =
			oauthProviderResourceClient(auth).getActions();
		const key = await createDpopKey();
		const { accessToken } = await issueDpopTokens(key);
		const verify = async (nonce: string) =>
			verifyResourceRequest(
				resourceRequest(
					accessToken,
					await createProof(key, {
						method: "GET",
						url: resourceUrl,
						accessToken,
						nonce,
					}),
				),
				{
					jwksUrl: `${issuer}/api/auth/jwks`,
					verifyOptions: { audience: jwtResource, issuer },
					dpop: { nonce: { required: true } },
				},
			);

		// 120 seconds is within the default 300 but past the provider's 60.
		const error = (await verify(
			await nonceIssuedAgo(context.secret, 120),
		).catch((e: unknown) => e)) as APIError;
		expect(error.statusCode).toBe(401);
		expect(new Headers(error.headers).get("WWW-Authenticate")).toMatch(
			/^DPoP error="use_dpop_nonce", error_description="DPoP proof nonce is invalid or expired"/,
		);
		await expect(
			verify(await nonceIssuedAgo(context.secret, 30)),
		).resolves.toMatchObject({ cnf: { jkt: key.jkt } });
	});

	it.each([0, 1.5])(
		"rejects a caller-supplied expiresIn of %s before checking the proof",
		async (expiresIn) => {
			const { verifyAccessTokenRequest: verifyResourceRequest } =
				oauthProviderResourceClient(auth).getActions();
			await expect(
				verifyResourceRequest(resourceRequest("token", "proof"), {
					jwksUrl: `${issuer}/api/auth/jwks`,
					verifyOptions: { audience: jwtResource, issuer },
					dpop: { nonce: { required: true, expiresIn } },
				}),
			).rejects.toThrow(
				"dpop.nonce.expiresIn must be a positive integer number of seconds",
			);
		},
	);
});

describe("DPoP nonces on a companion endpoint", async () => {
	const { auth, context, customFetchImpl } = await setupNonceProvider({
		testWith: "sqlite",
	});

	function bind(dpopProof?: string, body: { required?: boolean } = {}) {
		return customFetchImpl(pluginBindEndpoint, {
			method: "POST",
			headers: {
				"content-type": "application/json",
				...(dpopProof ? { DPoP: dpopProof } : {}),
			},
			body: JSON.stringify(body),
		});
	}

	function bindProof(key: DpopKey, nonce?: string | null) {
		return createProof(key, { method: "POST", url: pluginBindEndpoint, nonce });
	}

	it("challenges a proof without a nonce and accepts the retry", async () => {
		const key = await createDpopKey();
		const challenge = await bind(await bindProof(key));
		expect(challenge.status).toBe(400);
		expect(await challenge.json()).toMatchObject({ error: "use_dpop_nonce" });
		const nonce = challenge.headers.get("DPoP-Nonce");
		expect(nonce).toEqual(expect.any(String));
		expect(challenge.headers.get("Cache-Control")).toBe("no-store");
		expect(challenge.headers.get("Access-Control-Expose-Headers")).toContain(
			"DPoP-Nonce",
		);

		const bound = await bind(await bindProof(key, nonce));
		expect(bound.status).toBe(200);
		expect(await bound.json()).toEqual({ jkt: key.jkt });
		// RFC 9449 §8.2: the success response carries the next nonce.
		expect(bound.headers.get("DPoP-Nonce")).toEqual(expect.any(String));
		expect(bound.headers.get("Cache-Control")).toBe("no-store");
	});

	it("challenges an expired nonce", async () => {
		const key = await createDpopKey();
		const expired = await nonceIssuedAgo(context.secret, 301);
		const response = await bind(await bindProof(key, expired));
		expect(response.status).toBe(400);
		expect(await response.json()).toMatchObject({ error: "use_dpop_nonce" });
		expect(response.headers.get("DPoP-Nonce")).not.toBe(expired);
	});

	it("accepts a nonce from the token endpoint's secret and nonce endpoint", async () => {
		const key = await createDpopKey();
		const issued = await customFetchImpl(
			`${authServerBaseUrl}/api/auth/test/dpop-nonce`,
			{ method: "POST" },
		);
		const { nonce } = (await issued.json()) as { nonce: string };
		expect(issued.headers.get("DPoP-Nonce")).toBe(nonce);
		expect(issued.headers.get("Cache-Control")).toBe("no-store");
		const bound = await bind(await bindProof(key, nonce));
		expect(bound.status).toBe(200);
	});

	it("rejects a replayed proof", async () => {
		const key = await createDpopKey();
		const nonce = await createDpopNonce({ secret: context.secret });
		const proof = await bindProof(key, nonce);
		expect((await bind(proof)).status).toBe(200);
		const replay = await bind(proof);
		expect(replay.status).toBe(400);
		expect(await replay.json()).toMatchObject({ error: "invalid_dpop_proof" });
	});

	it("rejects a missing proof only when required", async () => {
		const optional = await bind();
		expect(optional.status).toBe(200);
		expect(await optional.json()).toEqual({ jkt: null });
		expect(optional.headers.get("DPoP-Nonce")).toBeNull();

		const required = await bind(undefined, { required: true });
		expect(required.status).toBe(400);
		expect(await required.json()).toMatchObject({
			error: "invalid_dpop_proof",
		});
	});

	it("rejects a proof on an auth.api call without an HTTP request", async () => {
		const key = await createDpopKey();
		const nonce = await createDpopNonce({ secret: context.secret });
		const error = await auth.api
			.testDpopBind({
				headers: new Headers({ DPoP: await bindProof(key, nonce) }),
				body: {},
			})
			.catch((e: APIError) => e);
		expect(error).toMatchObject({
			status: "BAD_REQUEST",
			body: { error: "invalid_dpop_proof" },
		});
	});

	it("issues a nonce on an auth.api call", async () => {
		const { headers, response } = await auth.api.testDpopNonce({
			returnHeaders: true,
		});
		expect(response.nonce).toEqual(expect.any(String));
		expect(headers.get("DPoP-Nonce")).toBe(response.nonce);
	});
});

describe("DPoP proofs on a companion endpoint without nonces", async () => {
	let hookChallenged = 0;
	const { customFetchImpl } = await getTestInstance({
		baseURL: authServerBaseUrl,
		plugins: [
			dpopCompanion,
			jwt(),
			oauthProvider({ loginPage: "/login", consentPage: "/consent" }),
		],
		hooks: {
			before: challengeNonceHook("/test/dpop-challenge", () => {
				hookChallenged++;
			}),
		},
	});

	it("verifies a proof without a nonce and issues none", async () => {
		const key = await createDpopKey();
		const bound = await customFetchImpl(pluginBindEndpoint, {
			method: "POST",
			headers: {
				"content-type": "application/json",
				DPoP: await createProof(key, {
					method: "POST",
					url: pluginBindEndpoint,
				}),
			},
			body: "{}",
		});
		expect(bound.status).toBe(200);
		expect(await bound.json()).toEqual({ jkt: key.jkt });
		expect(bound.headers.get("DPoP-Nonce")).toBeNull();

		const issued = await customFetchImpl(
			`${authServerBaseUrl}/api/auth/test/dpop-nonce`,
			{ method: "POST" },
		);
		expect(await issued.json()).toEqual({ nonce: null });
		expect(issued.headers.get("DPoP-Nonce")).toBeNull();
	});

	it("passes challengeDpopNonce in a hook and an endpoint", async () => {
		const key = await createDpopKey();
		const endpoint = `${authServerBaseUrl}/api/auth/test/dpop-challenge`;

		const response = await customFetchImpl(endpoint, {
			method: "POST",
			headers: {
				DPoP: await createProof(key, { method: "POST", url: endpoint }),
			},
		});

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ jkt: key.jkt });
		expect(response.headers.get("DPoP-Nonce")).toBeNull();
		expect(hookChallenged).toBe(1);
	});
});

/**
 * RFC 9449 §8: a plugin endpoint or before hook that stages state challenges
 * for a nonce first, without reserving the proof's `jti`.
 */
describe("challengeDpopNonce with nonces required", async () => {
	const baseURL = "http://localhost:3003";
	const tokenEndpoint = `${baseURL}/api/auth/oauth2/token`;
	const challengeEndpoint = `${baseURL}/api/auth/test/dpop-challenge`;
	/** Runs in the token endpoint's before hook once its check passes. */
	let afterHookChallenge: () => void = () => {};
	let stagedByHook = 0;
	const {
		auth,
		context,
		customFetchImpl,
		authorizeForCode,
		codeRequestBody,
		postToken,
	} = await setupNonceProvider({
		testWith: "sqlite",
		baseURL,
		hooks: {
			before: challengeNonceHook("/oauth2/token", () => {
				stagedByHook++;
				afterHookChallenge();
			}),
		},
	});

	afterEach(() => {
		afterHookChallenge = () => {};
	});

	function challenge(dpopProof?: string) {
		return customFetchImpl(challengeEndpoint, {
			method: "POST",
			headers: dpopProof ? { DPoP: dpopProof } : {},
		});
	}

	/** A proof whose nonce expires one second after the request arrives. */
	async function proofWithExpiringNonce(key: DpopKey) {
		return createProof(key, {
			method: "POST",
			url: tokenEndpoint,
			nonce: await nonceIssuedAgo(context.secret, 299),
		});
	}

	/** Moves the clock past that nonce's expiry once the hook's check passes. */
	function expireNonceAfterHook() {
		const arrival = Date.now();
		vi.useFakeTimers({ toFake: ["Date"] });
		vi.setSystemTime(arrival);
		afterHookChallenge = () => vi.setSystemTime(arrival + 10_000);
	}

	describe("on a plugin endpoint", () => {
		it("challenges a proof without a nonce before staging state", async () => {
			const key = await createDpopKey();
			const staged = stagedChallenges;

			const response = await challenge(
				await createProof(key, { method: "POST", url: challengeEndpoint }),
			);

			expect(response.status).toBe(400);
			expect(await response.json()).toEqual({
				error: "use_dpop_nonce",
				error_description: "DPoP proof must include a server-provided nonce",
			});
			expect(response.headers.get("DPoP-Nonce")).toEqual(expect.any(String));
			expect(stagedChallenges).toBe(staged);
		});

		it("leaves the jti for the proof verification that follows", async () => {
			const key = await createDpopKey();
			const nonce = await createDpopNonce({ secret: context.secret });

			const response = await challenge(
				await createProof(key, {
					method: "POST",
					url: challengeEndpoint,
					nonce,
				}),
			);

			expect(response.status).toBe(200);
			expect(await response.json()).toEqual({ jkt: key.jkt });
		});

		it("passes a request without a DPoP header", async () => {
			const staged = stagedChallenges;

			const response = await challenge();

			expect(response.status).toBe(200);
			expect(await response.json()).toEqual({ jkt: null });
			expect(stagedChallenges).toBe(staged + 1);
		});
	});

	describe("in a before hook", () => {
		it("challenges a proof without a nonce before the hook stages state", async () => {
			const key = await createDpopKey();
			const { code, codeVerifier } = await authorizeForCode();
			const body = await codeRequestBody(code, codeVerifier);
			const staged = stagedByHook;

			const rejected = await postToken(
				body,
				await createProof(key, { method: "POST", url: tokenEndpoint }),
			);

			expect(rejected.response.status).toBe(400);
			expect(rejected.body.error).toBe("use_dpop_nonce");
			expect(stagedByHook).toBe(staged);
			const issued = await postToken(
				body,
				await createProof(key, {
					method: "POST",
					url: tokenEndpoint,
					nonce: rejected.response.headers.get("DPoP-Nonce"),
				}),
			);
			expect(issued.response.status).toBe(200);
			expect(issued.body.token_type).toBe("DPoP");
			expect(stagedByHook).toBe(staged + 1);
		});

		it("passes a request without a DPoP header", async () => {
			const { code, codeVerifier } = await authorizeForCode();
			const staged = stagedByHook;

			const issued = await postToken(await codeRequestBody(code, codeVerifier));

			expect(issued.response.status).toBe(200);
			expect(issued.body.token_type).toBe("Bearer");
			expect(stagedByHook).toBe(staged + 1);
		});

		it("shares the request time with the token endpoint", async () => {
			const key = await createDpopKey();
			const { code, codeVerifier } = await authorizeForCode();
			const body = await codeRequestBody(code, codeVerifier);
			const proof = await proofWithExpiringNonce(key);
			expireNonceAfterHook();

			const issued = await postToken(body, proof);

			expect(issued.response.status).toBe(200);
			expect(issued.body.token_type).toBe("DPoP");
		});

		it("shares the request time on an auth.api call without a request", async () => {
			const key = await createDpopKey();
			const { code, codeVerifier } = await authorizeForCode();
			const body = await codeRequestBody(code, codeVerifier);
			const proof = await proofWithExpiringNonce(key);
			expireNonceAfterHook();

			const issued = await auth.api.oauth2Token({
				headers: new Headers({ DPoP: proof }),
				body: { ...Object.fromEntries(body), grant_type: "authorization_code" },
			});

			expect(issued.token_type).toBe("DPoP");
		});
	});
});

describe("OAuthProviderApi DPoP types", () => {
	it("exposes the proof verifier, nonce issuer, and nonce challenge", () => {
		const verify = (async () =>
			undefined) as unknown as OAuthProviderApi["verifyDpopProof"];
		expectTypeOf(verify({ required: true })).toEqualTypeOf<
			Promise<VerifiedDpopProof>
		>();
		expectTypeOf(verify()).toEqualTypeOf<
			Promise<VerifiedDpopProof | undefined>
		>();
		expectTypeOf(verify({ required: false })).toEqualTypeOf<
			Promise<VerifiedDpopProof | undefined>
		>();
		expectTypeOf<OAuthProviderApi["issueDpopNonce"]>().toEqualTypeOf<
			() => Promise<string | undefined>
		>();
		expectTypeOf<OAuthProviderApi["challengeDpopNonce"]>().toEqualTypeOf<
			() => Promise<void>
		>();
	});
});

describe("dpop.nonce configuration", () => {
	it.each([0, -1, 1.5, Number.NaN])("rejects expiresIn %s", (expiresIn) => {
		expect(() =>
			oauthProvider({
				loginPage: "/login",
				consentPage: "/consent",
				dpop: { nonce: { required: true, expiresIn } },
			}),
		).toThrow(
			"dpop.nonce.expiresIn must be a positive integer number of seconds",
		);
	});
});
