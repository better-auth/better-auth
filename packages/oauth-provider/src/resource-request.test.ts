import { createAuthEndpoint } from "better-auth/api";
import { generateRandomString } from "better-auth/crypto";
import {
	DPOP_SIGNING_ALGORITHMS,
	deriveDpopAth,
	deriveDpopJkt,
} from "better-auth/oauth2";
import { jwt } from "better-auth/plugins/jwt";
import { getTestInstance } from "better-auth/test";
import type { BetterAuthPlugin } from "better-auth/types";
import type { APIError } from "better-call";
import type { JWK } from "jose";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { describe, expect, expectTypeOf, it } from "vitest";
import * as z from "zod";
import { oauthProviderClient } from "./client";
import { oauthProvider } from "./oauth";
import { getOAuthProviderApi } from "./token";
import type { ActiveAccessTokenPayload, OAuthProviderApi } from "./types";

const baseURL = "http://localhost:3000";
const tokenEndpoint = `${baseURL}/api/auth/oauth2/token`;
const resourceEndpoint = `${baseURL}/api/auth/test/resource`;
const apiResource = "https://api.example.com";
const otherResource = "https://other.example.com";
const algs = DPOP_SIGNING_ALGORITHMS.join(" ");

/** A protected resource served by the authorization server's own instance. */
const resourcePlugin = {
	id: "test-in-process-resource",
	endpoints: {
		testResource: createAuthEndpoint(
			"/test/resource",
			{
				method: "GET",
				query: z
					.object({
						scopes: z.string().optional(),
						audience: z.string().optional(),
					})
					.optional(),
			},
			async (ctx) => {
				const provider = getOAuthProviderApi(
					ctx,
					ctx.context.getPlugin("oauth-provider")!.options,
				);
				const claims = await provider.verifyResourceRequest({
					scopes: ctx.query?.scopes?.split(" "),
					audience: ctx.query?.audience,
				});
				return ctx.json({
					client_id: claims.client_id,
					scope: claims.scope,
					aud: claims.aud,
					cnf: claims.cnf ?? null,
				});
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
	params: { method: string; url: string; accessToken?: string; nonce?: string },
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

async function setup(params: { nonceRequired?: boolean } = {}) {
	const { auth, customFetchImpl, signInWithTestUser } = await getTestInstance(
		{
			baseURL,
			plugins: [
				resourcePlugin,
				jwt({ jwt: { issuer: baseURL } }),
				oauthProvider({
					loginPage: "/login",
					consentPage: "/consent",
					resources: [apiResource, otherResource],
					enforcePerClientResources: false,
					scopes: ["read", "write"],
					clientPrivileges: () => true,
					...(params.nonceRequired && { dpop: { nonce: { required: true } } }),
				}),
			],
		},
		{ clientOptions: { plugins: [oauthProviderClient()] } },
	);
	const { headers } = await signInWithTestUser();
	const client = await auth.api.adminCreateOAuthClient({
		headers,
		body: {
			token_endpoint_auth_method: "client_secret_post",
			grant_types: ["client_credentials"],
			client_credentials_scopes: ["read", "write"],
		},
	});

	async function postToken(
		body: Record<string, string>,
		dpopProof?: string,
	): Promise<{ response: Response; body: Record<string, string> }> {
		const response = await customFetchImpl(tokenEndpoint, {
			method: "POST",
			headers: {
				"content-type": "application/x-www-form-urlencoded",
				...(dpopProof ? { DPoP: dpopProof } : {}),
			},
			body: new URLSearchParams({
				grant_type: "client_credentials",
				client_id: client.client_id,
				client_secret: client.client_secret!,
				...body,
			}).toString(),
		});
		return {
			response,
			body: (await response.json()) as Record<string, string>,
		};
	}

	/** Issues a client-credentials token; `resource` makes it a JWT. */
	async function issueToken(options: {
		scope: string;
		resource?: string;
		dpopKey?: DpopKey;
	}) {
		const body = {
			scope: options.scope,
			...(options.resource ? { resource: options.resource } : {}),
		};
		if (!options.dpopKey) return (await postToken(body)).body.access_token!;
		let issued = await postToken(
			body,
			await createProof(options.dpopKey, {
				method: "POST",
				url: tokenEndpoint,
			}),
		);
		const nonce = issued.response.headers.get("DPoP-Nonce");
		if (issued.response.status === 400 && nonce) {
			issued = await postToken(
				body,
				await createProof(options.dpopKey, {
					method: "POST",
					url: tokenEndpoint,
					nonce,
				}),
			);
		}
		expect(issued.body.token_type).toBe("DPoP");
		return issued.body.access_token!;
	}

	function callResource(
		init: { authorization?: string; dpop?: string } = {},
		query: { scopes?: string; audience?: string } = {},
	) {
		const url = new URL(resourceEndpoint);
		for (const [name, value] of Object.entries(query)) {
			url.searchParams.set(name, value);
		}
		return customFetchImpl(url, {
			headers: {
				...(init.authorization ? { authorization: init.authorization } : {}),
				...(init.dpop ? { DPoP: init.dpop } : {}),
			},
		});
	}

	return { auth, client, issueToken, callResource };
}

describe("provider.verifyResourceRequest", async () => {
	const { auth, client, issueToken, callResource } = await setup();

	describe("bearer tokens", () => {
		it("accepts an opaque access token", async () => {
			const token = await issueToken({ scope: "read" });
			expect(token.split(".")).toHaveLength(1);

			const response = await callResource({ authorization: `Bearer ${token}` });
			expect(response.status).toBe(200);
			expect(await response.json()).toMatchObject({
				client_id: client.client_id,
				scope: "read",
			});
		});

		it("accepts a JWT access token", async () => {
			const token = await issueToken({ scope: "read", resource: apiResource });
			expect(token.split(".")).toHaveLength(3);

			const response = await callResource(
				{ authorization: `Bearer ${token}` },
				{ audience: apiResource },
			);
			expect(response.status).toBe(200);
			expect(await response.json()).toMatchObject({
				client_id: client.client_id,
				aud: apiResource,
			});
		});

		it("rejects a revoked opaque access token", async () => {
			const token = await issueToken({ scope: "read" });
			await auth.api.oauth2Revoke({
				body: {
					token,
					token_type_hint: "access_token",
					client_id: client.client_id,
					client_secret: client.client_secret,
				},
			});

			const response = await callResource({ authorization: `Bearer ${token}` });
			expect(response.status).toBe(401);
			expect(response.headers.get("WWW-Authenticate")).toBe(
				'Bearer error="invalid_token", error_description="Invalid access token"',
			);
		});
	});

	/**
	 * @see https://datatracker.ietf.org/doc/html/rfc6750#section-3.1
	 */
	describe("challenges", () => {
		it("offers both schemes without an error code when no token is sent", async () => {
			const response = await callResource({}, { audience: apiResource });
			expect(response.status).toBe(401);
			expect(response.headers.get("WWW-Authenticate")).toBe(
				`Bearer resource_metadata="https://api.example.com/.well-known/oauth-protected-resource", DPoP algs="${algs}"`,
			);
			expect(response.headers.get("Access-Control-Expose-Headers")).toContain(
				"WWW-Authenticate",
			);
		});

		it("treats an unsupported scheme as a request without a token", async () => {
			const token = await issueToken({ scope: "read" });
			const response = await callResource({ authorization: `Basic ${token}` });
			expect(response.status).toBe(401);
			expect(response.headers.get("WWW-Authenticate")).toBe(
				`Bearer, DPoP algs="${algs}"`,
			);
		});

		it("challenges an unknown token with invalid_token", async () => {
			const response = await callResource(
				{ authorization: "Bearer not-a-token" },
				{ audience: apiResource },
			);
			expect(response.status).toBe(401);
			expect(response.headers.get("WWW-Authenticate")).toBe(
				'Bearer error="invalid_token", error_description="Invalid access token", resource_metadata="https://api.example.com/.well-known/oauth-protected-resource"',
			);
			expect(await response.json()).toMatchObject({ error: "invalid_token" });
		});

		it("names every missing scope in an insufficient_scope challenge", async () => {
			const token = await issueToken({ scope: "read" });
			const response = await callResource(
				{ authorization: `Bearer ${token}` },
				{ scopes: "read write openid" },
			);
			expect(response.status).toBe(403);
			expect(await response.json()).toMatchObject({
				error: "insufficient_scope",
			});
			expect(response.headers.get("WWW-Authenticate")).toMatch(
				/^Bearer error="insufficient_scope", scope="write openid"/,
			);
		});

		it("accepts a token that carries every required scope", async () => {
			const token = await issueToken({ scope: "read write" });
			const response = await callResource(
				{ authorization: `Bearer ${token}` },
				{ scopes: "write read" },
			);
			expect(response.status).toBe(200);
		});
	});

	/**
	 * @see https://datatracker.ietf.org/doc/html/rfc9068#section-4
	 */
	describe("audience", () => {
		it("rejects a JWT access token issued for another resource", async () => {
			const token = await issueToken({
				scope: "read",
				resource: otherResource,
			});
			const response = await callResource(
				{ authorization: `Bearer ${token}` },
				{ audience: apiResource },
			);
			expect(response.status).toBe(401);
			expect(await response.json()).toMatchObject({ error: "invalid_token" });
			expect(response.headers.get("WWW-Authenticate")).toContain(
				'resource_metadata="https://api.example.com/.well-known/oauth-protected-resource"',
			);
		});

		it("rejects an opaque access token without the audience", async () => {
			const token = await issueToken({ scope: "read" });
			const response = await callResource(
				{ authorization: `Bearer ${token}` },
				{ audience: apiResource },
			);
			expect(response.status).toBe(401);
			expect(await response.json()).toMatchObject({ error: "invalid_token" });
		});

		it("accepts an opaque access token issued for the audience", async () => {
			const token = await issueToken({ scope: "read", resource: apiResource });
			const response = await callResource(
				{ authorization: `Bearer ${token}` },
				{ audience: apiResource },
			);
			expect(response.status).toBe(200);
		});
	});

	/**
	 * @see https://datatracker.ietf.org/doc/html/rfc9449#section-7
	 */
	describe("DPoP-bound tokens", () => {
		it.each([
			["opaque", undefined],
			["JWT", apiResource],
		])("accepts a %s token with a valid proof", async (_, resource) => {
			const key = await createDpopKey();
			const token = await issueToken({ scope: "read", resource, dpopKey: key });
			const response = await callResource({
				authorization: `DPoP ${token}`,
				dpop: await createProof(key, {
					method: "GET",
					url: resourceEndpoint,
					accessToken: token,
				}),
			});
			expect(response.status).toBe(200);
			expect(await response.json()).toMatchObject({ cnf: { jkt: key.jkt } });
		});

		it("challenges a DPoP-bound token sent with the Bearer scheme", async () => {
			const key = await createDpopKey();
			const token = await issueToken({ scope: "read", dpopKey: key });
			const response = await callResource({ authorization: `Bearer ${token}` });
			expect(response.status).toBe(401);
			expect(response.headers.get("WWW-Authenticate")).toBe(
				`DPoP error="invalid_token", error_description="DPoP-bound access token requires the DPoP authorization scheme", algs="${algs}"`,
			);
		});

		it("rejects a replayed proof", async () => {
			const key = await createDpopKey();
			const token = await issueToken({ scope: "read", dpopKey: key });
			const proof = await createProof(key, {
				method: "GET",
				url: resourceEndpoint,
				accessToken: token,
			});
			const first = await callResource({
				authorization: `DPoP ${token}`,
				dpop: proof,
			});
			expect(first.status).toBe(200);
			const replay = await callResource({
				authorization: `DPoP ${token}`,
				dpop: proof,
			});
			expect(replay.status).toBe(401);
			expect(await replay.json()).toMatchObject({
				error: "invalid_dpop_proof",
			});
		});

		it("checks the binding before the scopes", async () => {
			const key = await createDpopKey();
			const token = await issueToken({ scope: "read", dpopKey: key });
			const response = await callResource(
				{ authorization: `DPoP ${token}` },
				{ scopes: "write" },
			);
			expect(response.status).toBe(401);
			expect(await response.json()).toMatchObject({
				error: "invalid_dpop_proof",
			});
		});

		it("fails closed on an auth.api call without an HTTP request", async () => {
			const key = await createDpopKey();
			const token = await issueToken({ scope: "read", dpopKey: key });
			const error = await auth.api
				.testResource({
					headers: new Headers({
						authorization: `DPoP ${token}`,
						DPoP: await createProof(key, {
							method: "GET",
							url: resourceEndpoint,
							accessToken: token,
						}),
					}),
				})
				.catch((e: APIError) => e);
			expect(error).toMatchObject({
				status: "UNAUTHORIZED",
				body: { error: "invalid_token" },
			});
		});
	});

	it("rejects an empty audience instead of skipping the check", async () => {
		const token = await issueToken({ scope: "read", resource: otherResource });
		const response = await callResource(
			{ authorization: `Bearer ${token}` },
			{ audience: "" },
		);
		expect(response.status).toBe(500);
	});

	it("is part of the provider API type", () => {
		expectTypeOf<
			OAuthProviderApi["verifyResourceRequest"]
		>().returns.toEqualTypeOf<Promise<ActiveAccessTokenPayload>>();
		expectTypeOf<OAuthProviderApi["verifyResourceRequest"]>()
			.parameter(0)
			.toEqualTypeOf<
				| {
						scopes?: readonly string[];
						audience?: string;
				  }
				| undefined
			>();
	});
});

/**
 * @see https://datatracker.ietf.org/doc/html/rfc9449#section-9
 */
describe("provider.verifyResourceRequest with required DPoP nonces", async () => {
	const { issueToken, callResource } = await setup({ nonceRequired: true });

	it("challenges a proof without a nonce and accepts the retry", async () => {
		const key = await createDpopKey();
		const token = await issueToken({ scope: "read", dpopKey: key });
		const challenge = await callResource({
			authorization: `DPoP ${token}`,
			dpop: await createProof(key, {
				method: "GET",
				url: resourceEndpoint,
				accessToken: token,
			}),
		});
		expect(challenge.status).toBe(401);
		expect(await challenge.json()).toMatchObject({ error: "use_dpop_nonce" });
		const nonce = challenge.headers.get("DPoP-Nonce");
		expect(nonce).toEqual(expect.any(String));
		expect(challenge.headers.get("Cache-Control")).toBe("no-store");
		expect(challenge.headers.get("WWW-Authenticate")).toMatch(
			/^DPoP error="use_dpop_nonce"/,
		);
		const exposed = challenge.headers.get("Access-Control-Expose-Headers");
		expect(exposed).toContain("DPoP-Nonce");
		expect(exposed).toContain("WWW-Authenticate");

		const retry = await callResource({
			authorization: `DPoP ${token}`,
			dpop: await createProof(key, {
				method: "GET",
				url: resourceEndpoint,
				accessToken: token,
				nonce: nonce!,
			}),
		});
		expect(retry.status).toBe(200);
		// RFC 9449 §8.2: the success response carries the next nonce.
		expect(retry.headers.get("DPoP-Nonce")).toEqual(expect.any(String));
	});

	it("keeps the next nonce on a scope failure after a valid proof", async () => {
		const key = await createDpopKey();
		const token = await issueToken({ scope: "read", dpopKey: key });
		const first = await callResource({
			authorization: `DPoP ${token}`,
			dpop: await createProof(key, {
				method: "GET",
				url: resourceEndpoint,
				accessToken: token,
			}),
		});
		const response = await callResource(
			{
				authorization: `DPoP ${token}`,
				dpop: await createProof(key, {
					method: "GET",
					url: resourceEndpoint,
					accessToken: token,
					nonce: first.headers.get("DPoP-Nonce")!,
				}),
			},
			{ scopes: "write" },
		);
		expect(response.status).toBe(403);
		expect(await response.json()).toMatchObject({
			error: "insufficient_scope",
		});
		expect(response.headers.get("DPoP-Nonce")).toEqual(expect.any(String));
		expect(response.headers.get("Cache-Control")).toBe("no-store");
	});

	it("does not require a nonce for a bearer token", async () => {
		const token = await issueToken({ scope: "read" });
		const response = await callResource({ authorization: `Bearer ${token}` });
		expect(response.status).toBe(200);
		expect(response.headers.get("DPoP-Nonce")).toBeNull();
	});
});
