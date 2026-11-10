import type { GenericEndpointContext } from "@better-auth/core";
import { createAuthEndpoint } from "better-auth/api";
import { createAuthClient } from "better-auth/client";
import { generateRandomString } from "better-auth/crypto";
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
import type { BetterAuthPlugin } from "better-auth/types";
import type { APIError } from "better-call";
import type { JWK } from "jose";
import { decodeJwt, exportJWK, generateKeyPair, SignJWT } from "jose";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { oauthProviderClient } from "./client";
import { oauthProviderResourceClient } from "./client-resource";
import { oauthProvider } from "./oauth";
import { createResourceServerChallenge } from "./resource-challenge";
import { getOAuthProviderApi } from "./token";
import type { OAuthClient } from "./types/oauth";

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
		const authServerBaseUrl = "http://localhost:3000";
		const rpBaseUrl = "http://localhost:5000";
		const jwtResource = "https://dpop-api.example.com";
		const tokenEndpoint = `${authServerBaseUrl}/api/auth/oauth2/token`;
		const userinfoEndpoint = `${authServerBaseUrl}/api/auth/oauth2/userinfo`;
		const jwksUrl = `${authServerBaseUrl}/api/auth/jwks`;
		const redirectUri = `${rpBaseUrl}/api/auth/callback/test`;
		const pluginIssueEndpoint = `${authServerBaseUrl}/api/auth/test/dpop-issue`;
		// A plugin endpoint that issues tokens itself, outside the token endpoint.
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

		const { auth, signInWithTestUser, customFetchImpl } = await getTestInstance(
			{
				baseURL: authServerBaseUrl,
				plugins: [
					pluginIssuer,
					jwt({ jwt: { issuer: authServerBaseUrl } }),
					oauthProvider({
						loginPage: "/login",
						consentPage: "/consent",
						resources: [jwtResource],
						enforcePerClientResources: false,
						dpop: { nonce: { required: true } },
					}),
				],
			},
			{ testWith },
		);
		const authSecret = (await auth.$context).secret;
		const { headers } = await signInWithTestUser();
		const client = createAuthClient({
			plugins: [oauthProviderClient()],
			baseURL: authServerBaseUrl,
			fetchOptions: { customFetchImpl, headers },
		});
		let oauthClient: OAuthClient;

		beforeAll(async () => {
			oauthClient = await auth.api.adminCreateOAuthClient({
				headers,
				body: {
					token_endpoint_auth_method: "client_secret_post",
					grant_types: ["authorization_code", "refresh_token"],
					redirect_uris: [redirectUri],
					application_type: "native",
					skip_consent: true,
				},
			});
		});

		afterEach(() => {
			vi.useRealTimers();
			vi.unstubAllGlobals();
		});

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
				authorizationEndpoint: `${authServerBaseUrl}/api/auth/oauth2/authorize`,
				state: "123",
				scopes: ["openid", "offline_access"],
				codeVerifier,
			});
			url.searchParams.set("resource", jwtResource);
			let location = "";
			await client.$fetch(url.toString(), {
				onError(context) {
					location = context.response.headers.get("Location") ?? "";
				},
			});
			const code = new URL(location).searchParams.get("code");
			if (!code) throw new Error("authorization did not return a code");
			return { code, codeVerifier };
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
				).toContain("DPoP-Nonce");

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
				expect(
					issued.response.headers.get("Access-Control-Expose-Headers"),
				).toContain("DPoP-Nonce");
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
				vi.useFakeTimers({ toFake: ["Date"] });
				vi.setSystemTime(Date.now() - 301_000);
				const expiredNonce = await createDpopNonce({ secret: authSecret });
				vi.useRealTimers();

				const challenge = await postToken(
					body,
					await createProof(key, {
						method: "POST",
						url: tokenEndpoint,
						nonce: expiredNonce,
					}),
				);

				expect(challenge.response.status).toBe(400);
				expect(challenge.body.error).toBe("use_dpop_nonce");
			});

			it("accepts a nonce issued within its lifetime", async () => {
				const key = await createDpopKey();
				const { code, codeVerifier } = await authorizeForCode();
				vi.useFakeTimers({ toFake: ["Date"] });
				vi.setSystemTime(Date.now() - 290_000);
				const agingNonce = await createDpopNonce({ secret: authSecret });
				vi.useRealTimers();

				const issued = await postToken(
					await codeRequestBody(code, codeVerifier),
					await createProof(key, {
						method: "POST",
						url: tokenEndpoint,
						nonce: agingNonce,
					}),
				);

				expect(issued.response.status).toBe(200);
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
			const resourceUrl = `${jwtResource}/data`;

			function stubJwksFetch() {
				vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit) =>
					customFetchImpl(input, init),
				);
			}

			function resourceRequest(accessToken: string, dpopProof: string) {
				return new Request(resourceUrl, {
					headers: { authorization: `DPoP ${accessToken}`, DPoP: dpopProof },
				});
			}

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
				expect(challengeHeaders.get("Access-Control-Expose-Headers")).toBe(
					"DPoP-Nonce",
				);

				// Same origin, same secret: the nonce from the token response works.
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
