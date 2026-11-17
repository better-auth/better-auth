import { createAuthEndpoint, sessionMiddleware } from "better-auth/api";
import { generateRandomString } from "better-auth/crypto";
import { generateCodeChallenge } from "better-auth/oauth2";
import { jwt } from "better-auth/plugins/jwt";
import { getTestInstance } from "better-auth/test";
import type { BetterAuthPlugin } from "better-auth/types";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { beforeAll, describe, expect, it } from "vitest";
import { oauthProvider } from "./oauth";
import { createDpopKey, createDpopProof } from "./test-utils/dpop";
import { getOAuthProviderApi } from "./token";
import { storeToken } from "./utils";

const baseURL = "http://localhost:3000";
const redirectUri = "https://client.example.com/callback";
const endpointUrl = `${baseURL}/api/auth/test/checked-issue-code`;

/**
 * A plugin endpoint authenticates the client and checks the DPoP key before
 * it checks the user's credentials, so a request for the wrong client or key
 * learns nothing about the password. The code is then issued on the same
 * request.
 *
 * @see https://github.com/better-auth/better-auth/issues/10414
 */
describe("provider.issueAuthorizationCode after authenticateClient and verifyDpopProof", async () => {
	const issuer = {
		id: "test-checked-code-issuer",
		endpoints: {
			testCheckedIssueCode: createAuthEndpoint(
				"/test/checked-issue-code",
				{ method: "POST", use: [sessionMiddleware] },
				async (ctx) => {
					const provider = getOAuthProviderApi(
						ctx,
						ctx.context.getPlugin("oauth-provider")!.options,
					);
					const { expected_client_id, expected_jkt, ...query } =
						ctx.body as Record<string, string>;
					await provider.authenticateClient({
						clientId: expected_client_id,
						requireCredentials: false,
					});
					if (expected_jkt) {
						await provider.verifyDpopProof({ expectedJkt: expected_jkt });
					} else {
						await provider.verifyDpopProof();
					}
					const issued = await provider.issueAuthorizationCode({
						query,
						session: ctx.context.session,
					});
					return ctx.json({ code: issued.code });
				},
			),
		},
	} satisfies BetterAuthPlugin;

	const { auth, client, signInWithTestUser } = await getTestInstance({
		baseURL: `${baseURL}/api/auth`,
		plugins: [
			issuer,
			jwt({ jwt: { issuer: baseURL } }),
			oauthProvider({ loginPage: "/login", consentPage: "/consent" }),
		],
	});
	const { headers } = await signInWithTestUser();
	const context = await auth.$context;

	const keys = await generateKeyPair("RS256", { extractable: true });
	let keyClient: { client_id: string };
	let publicClient: { client_id: string };
	beforeAll(async () => {
		keyClient = await auth.api.adminCreateOAuthClient({
			headers,
			body: {
				grant_types: ["authorization_code"],
				redirect_uris: [redirectUri],
				token_endpoint_auth_method: "private_key_jwt",
				skip_consent: true,
				jwks: {
					keys: [
						{
							...(await exportJWK(keys.publicKey)),
							kid: "reuse-key",
							alg: "RS256",
							use: "sig",
						},
					],
				},
			},
		});
		publicClient = await auth.api.adminCreateOAuthClient({
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

	async function assertion(clientId: string) {
		const now = Math.floor(Date.now() / 1000);
		return new SignJWT({})
			.setProtectedHeader({ alg: "RS256", kid: "reuse-key" })
			.setIssuer(clientId)
			.setSubject(clientId)
			.setAudience(baseURL)
			.setIssuedAt(now)
			.setExpirationTime(now + 60)
			.setJti(generateRandomString(16))
			.sign(keys.privateKey);
	}

	async function codeRequest(clientId: string, extra = {}) {
		return {
			response_type: "code",
			client_id: clientId,
			scope: "openid",
			code_challenge: await generateCodeChallenge(generateRandomString(43)),
			code_challenge_method: "S256",
			...extra,
		} as Record<string, string>;
	}

	function send(body: Record<string, string>, dpop?: string) {
		return client.$fetch<{ code: string }>("/test/checked-issue-code", {
			method: "POST",
			headers: {
				...Object.fromEntries(headers),
				...(dpop ? { DPoP: dpop } : {}),
			},
			body,
		});
	}

	async function storedJkt(code: string) {
		const row = await context.internalAdapter.findVerificationValue(
			await storeToken("hashed", code, "authorization_code"),
		);
		return (JSON.parse(row!.value) as { query: { dpop_jkt?: string } }).query
			.dpop_jkt;
	}

	const errorCode = (result: { error: unknown }) =>
		(result.error as { error?: string } | null)?.error;

	it("issues a code for a client the endpoint authenticated with private_key_jwt", async () => {
		const issued = await send({
			...(await codeRequest(keyClient.client_id)),
			expected_client_id: keyClient.client_id,
			client_assertion_type:
				"urn:ietf:params:oauth:client-assertion-type:jwt-bearer",
			client_assertion: await assertion(keyClient.client_id),
		});
		expect(issued.error).toBeNull();
		expect(issued.data!.code).toEqual(expect.any(String));
	});

	it("binds the code to the DPoP proof the endpoint verified", async () => {
		const key = await createDpopKey();
		const issued = await send(
			{
				...(await codeRequest(publicClient.client_id)),
				expected_client_id: publicClient.client_id,
				expected_jkt: key.jkt,
			},
			await createDpopProof(key, { url: endpointUrl }),
		);
		expect(issued.error).toBeNull();
		expect(await storedJkt(issued.data!.code)).toBe(key.jkt);
	});

	it("rejects a query that names another client than the one authenticated", async () => {
		const issued = await send({
			...(await codeRequest(publicClient.client_id)),
			expected_client_id: keyClient.client_id,
			client_assertion_type:
				"urn:ietf:params:oauth:client-assertion-type:jwt-bearer",
			client_assertion: await assertion(keyClient.client_id),
		});
		expect(errorCode(issued)).toBe("invalid_client");
	});

	it("rejects a dpop_jkt that differs from the verified proof's key", async () => {
		const key = await createDpopKey();
		const other = await createDpopKey();
		const issued = await send(
			{
				...(await codeRequest(publicClient.client_id, {
					dpop_jkt: other.jkt,
				})),
				expected_client_id: publicClient.client_id,
			},
			await createDpopProof(key, { url: endpointUrl }),
		);
		expect(errorCode(issued)).toBe("invalid_dpop_proof");
	});
});

/**
 * Request state is shared by nested calls to another auth instance. A client
 * that one instance authenticated is not authenticated on another instance
 * that holds a different client under the same `client_id`.
 *
 * @see https://github.com/better-auth/better-auth/issues/10414
 */
describe("request authentication across nested auth instances", async () => {
	const secondary = await getTestInstance({
		baseURL: `${baseURL}/api/auth`,
		plugins: [
			jwt({ jwt: { issuer: baseURL } }),
			oauthProvider({
				loginPage: "/login",
				consentPage: "/consent",
				pushedAuthorizationRequests: { enabled: true },
			}),
		],
	});
	const secondaryHeaders = (await secondary.signInWithTestUser()).headers;
	const confidential = await secondary.auth.api.adminCreateOAuthClient({
		headers: secondaryHeaders,
		body: {
			grant_types: ["authorization_code"],
			redirect_uris: [redirectUri],
			token_endpoint_auth_method: "client_secret_post",
			skip_consent: true,
		},
	});

	let primaryClientId: string | undefined;
	const nested = {
		id: "test-nested-par",
		endpoints: {
			testNestedPar: createAuthEndpoint(
				"/test/nested-par",
				{ method: "POST" },
				async (ctx) => {
					const provider = getOAuthProviderApi(
						ctx,
						ctx.context.getPlugin("oauth-provider")!.options,
					);
					const primary = await provider.authenticateClient({
						clientId: confidential.client_id,
						requireCredentials: false,
					});
					primaryClientId = primary.clientId;
					return ctx.json(
						await secondary.auth.api.oauth2PushedAuthorizationRequest({
							body: {
								client_id: confidential.client_id,
								response_type: "code",
								redirect_uri: redirectUri,
								scope: "openid",
								code_challenge: await generateCodeChallenge(
									generateRandomString(43),
								),
								code_challenge_method: "S256",
							},
						}),
					);
				},
			),
		},
	} satisfies BetterAuthPlugin;

	const { auth, client, signInWithTestUser } = await getTestInstance({
		baseURL: `${baseURL}/api/auth`,
		plugins: [
			nested,
			jwt({ jwt: { issuer: baseURL } }),
			oauthProvider({ loginPage: "/login", consentPage: "/consent" }),
		],
	});
	const { headers } = await signInWithTestUser();
	const context = await auth.$context;

	it("requires the other instance to authenticate its own client", async () => {
		const publicClient = await auth.api.adminCreateOAuthClient({
			headers,
			body: {
				grant_types: ["authorization_code"],
				redirect_uris: [redirectUri],
				token_endpoint_auth_method: "none",
				application_type: "native",
				skip_consent: true,
			},
		});
		await context.adapter.update({
			model: "oauthClient",
			where: [{ field: "clientId", value: publicClient.client_id }],
			update: { clientId: confidential.client_id },
		});

		const pushed = await client.$fetch<{ request_uri: string }>(
			"/test/nested-par",
			{ method: "POST", headers: Object.fromEntries(headers) },
		);
		expect((pushed.error as { error?: string } | null)?.error).toBe(
			"invalid_client",
		);
		expect(pushed.data).toBeNull();
		expect(primaryClientId).toBe(confidential.client_id);
	});
});
