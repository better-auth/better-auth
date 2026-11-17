import type {
	BetterAuthOptions,
	GenericEndpointContext,
} from "@better-auth/core";
import type { DBTransactionAdapter } from "@better-auth/core/db/adapter";
import { CLIENT_ASSERTION_TYPE } from "@better-auth/core/oauth2";
import type { MemoryDB } from "@better-auth/memory-adapter";
import { memoryAdapter } from "@better-auth/memory-adapter";
import { hex } from "@better-auth/utils/hex";
import { createAuthClient } from "better-auth/client";
import { generateRandomString } from "better-auth/crypto";
import { createAuthorizationURL } from "better-auth/oauth2";
import { jwt } from "better-auth/plugins/jwt";
import { getTestInstance } from "better-auth/test";
import type { JWK } from "jose";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { oauthProviderClient } from "./client";
import { oauthProvider } from "./oauth";
import { schema } from "./schema";
import type {
	ClientMetadataResourceFetch,
	OAuthOptions,
	SchemaClient,
	Scope,
} from "./types";
import type { OAuthClient } from "./types/oauth";
import {
	consumeClientAssertion,
	isPrivateHostname,
	verifyClientAssertion,
} from "./utils/client-assertion";

describe("private_key_jwt authentication", async () => {
	const authServerBaseUrl = "http://localhost:3000";
	const customIssuer = "https://issuer.example.com";
	const rpBaseUrl = "http://localhost:5000";
	const tokenEndpoint = `${authServerBaseUrl}/api/auth/oauth2/token`;
	const introspectEndpoint = `${authServerBaseUrl}/api/auth/oauth2/introspect`;
	const revokeEndpoint = `${authServerBaseUrl}/api/auth/oauth2/revoke`;
	const redirectUri = `${rpBaseUrl}/callback`;
	const discoveryMetadataFetch = vi.fn(async () => {
		throw new Error("managed client must not use a discovery transport");
	});

	const { auth, signInWithTestUser, customFetchImpl } = await getTestInstance({
		baseURL: authServerBaseUrl,
		trustedOrigins: ["https://trusted.example.com"],
		plugins: [
			jwt({ jwt: { issuer: customIssuer } }),
			oauthProvider({
				loginPage: "/login",
				consentPage: "/consent",
				assertionMaxLifetime: 300,
				extensions: [
					{
						clientDiscovery: {
							id: "test-discovery",
							matches: () => false,
							resolve: () => null,
							fetchClientMetadataResource: discoveryMetadataFetch,
						},
					},
				],
			}),
		],
	});

	const { headers } = await signInWithTestUser();
	const client = createAuthClient({
		plugins: [oauthProviderClient()],
		baseURL: authServerBaseUrl,
		fetchOptions: { customFetchImpl, headers },
	});

	let assertionClient: OAuthClient;
	let jwksUriClient: OAuthClient;
	let secretClient: OAuthClient;
	let rsaPrivateKey: CryptoKey;
	let rsaPrivateJwk: JsonWebKey;
	let rsaPublicJwk: JsonWebKey;

	afterEach(() => {
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	beforeAll(async () => {
		// Generate RSA key pair for testing
		const keyPair = await generateKeyPair("RS256", { extractable: true });
		rsaPrivateKey = keyPair.privateKey as CryptoKey;
		rsaPrivateJwk = await exportJWK(keyPair.privateKey);
		rsaPublicJwk = await exportJWK(keyPair.publicKey);

		// Register a private_key_jwt client
		assertionClient = (await auth.api.adminCreateOAuthClient({
			headers,
			body: {
				redirect_uris: [redirectUri],
				application_type: "native",
				skip_consent: true,
				token_endpoint_auth_method: "private_key_jwt",
				jwks: {
					keys: [
						{
							...rsaPublicJwk,
							kid: "test-key-1",
							alg: "RS256",
							use: "sig",
						},
					],
				},
			},
		}))!;
		expect(assertionClient.client_id).toBeDefined();
		// private_key_jwt clients should NOT get a client_secret
		expect(assertionClient.client_secret).toBeUndefined();

		jwksUriClient = (await auth.api.adminCreateOAuthClient({
			headers,
			body: {
				redirect_uris: [redirectUri],
				application_type: "native",
				skip_consent: true,
				token_endpoint_auth_method: "private_key_jwt",
				jwks_uri: "https://trusted.example.com/.well-known/jwks.json",
			},
		}))!;
		expect(jwksUriClient.client_id).toBeDefined();
		expect(jwksUriClient.client_secret).toBeUndefined();

		// Register a normal client_secret_post client for auth method enforcement test
		secretClient = (await auth.api.adminCreateOAuthClient({
			headers,
			body: {
				redirect_uris: [redirectUri],
				application_type: "native",
				skip_consent: true,
			},
		}))!;
		expect(secretClient.client_secret).toBeDefined();
	});

	async function signAssertion(overrides?: {
		clientId?: string;
		aud?: string | string[];
		exp?: number;
		nbf?: number;
		jti?: string;
		kid?: string;
		key?: CryptoKey;
		omitJti?: boolean;
	}) {
		const cid = overrides?.clientId ?? assertionClient.client_id;
		const now = Math.floor(Date.now() / 1000);
		const builder = new SignJWT({})
			.setProtectedHeader({
				alg: "RS256",
				kid: overrides?.kid ?? "test-key-1",
			})
			.setIssuer(cid)
			.setSubject(cid)
			.setAudience(overrides?.aud ?? tokenEndpoint)
			.setIssuedAt(now)
			.setExpirationTime(overrides?.exp ?? now + 120);

		if (overrides?.nbf !== undefined) {
			builder.setNotBefore(overrides.nbf);
		}

		if (!overrides?.omitJti) {
			builder.setJti(overrides?.jti ?? crypto.randomUUID());
		}

		return builder.sign(overrides?.key ?? rsaPrivateKey);
	}

	async function getAuthCode(
		clientId: string,
		codeVerifier: string,
		scopes = ["openid", "profile"],
	) {
		const authUrl = await createAuthorizationURL({
			id: "test",
			options: { clientId, redirectURI: redirectUri },
			redirectURI: "",
			authorizationEndpoint: `${authServerBaseUrl}/api/auth/oauth2/authorize`,
			state: "test-state",
			scopes,
			codeVerifier,
		});

		let callbackUrl = "";
		await client.$fetch(authUrl.toString(), {
			onError(ctx) {
				callbackUrl = ctx.response.headers.get("Location") || "";
			},
		});

		return new URL(callbackUrl).searchParams.get("code")!;
	}

	async function exchangeCodeForTokens({
		clientId = assertionClient.client_id,
		code,
		codeVerifier,
		assertion,
	}: {
		clientId?: string;
		code: string;
		codeVerifier: string;
		assertion: string;
	}) {
		return client.$fetch<{
			access_token?: string;
			refresh_token?: string;
			token_type?: string;
		}>("/oauth2/token", {
			method: "POST",
			body: new URLSearchParams({
				grant_type: "authorization_code",
				code,
				redirect_uri: redirectUri,
				client_id: clientId,
				client_assertion_type:
					"urn:ietf:params:oauth:client-assertion-type:jwt-bearer",
				client_assertion: assertion,
				code_verifier: codeVerifier,
			}),
			headers: {
				"content-type": "application/x-www-form-urlencoded",
			},
		});
	}

	async function createDiscoveredClientVerifier(input: {
		baseURL: string;
		clientId: string;
		clientDiscoveryId: string;
		fetchClientMetadataResource: ClientMetadataResourceFetch;
		jwksUri: string;
		assertionClockTolerance?: number;
	}) {
		const opts = {
			loginPage: "/login",
			consentPage: "/consent",
			...(input.assertionClockTolerance != null
				? { assertionClockTolerance: input.assertionClockTolerance }
				: {}),
			extensions: [
				{
					clientDiscovery: {
						id: input.clientDiscoveryId,
						matches: (candidateClientId: string) =>
							candidateClientId === input.clientId,
						resolve: (
							_ctx: GenericEndpointContext,
							_clientId: string,
							existingClient: SchemaClient<Scope[]> | null,
						) => existingClient,
						fetchClientMetadataResource: input.fetchClientMetadataResource,
					},
				},
			],
		} satisfies OAuthOptions<Scope[]>;
		const instance = await getTestInstance({
			baseURL: input.baseURL,
			plugins: [jwt(), oauthProvider(opts)],
		});
		const context = await instance.auth.$context;
		await context.adapter.create<SchemaClient<Scope[]>>({
			model: "oauthClient",
			data: {
				clientId: input.clientId,
				clientDiscoveryId: input.clientDiscoveryId,
				name: "Discovered private_key_jwt client",
				redirectUris: ["https://client.example.com/callback"],
				tokenEndpointAuthMethod: "private_key_jwt",
				applicationType: "web",
				grantTypes: ["authorization_code"],
				responseTypes: ["code"],
				jwksUri: input.jwksUri,
				createdAt: new Date(),
				updatedAt: new Date(),
			},
		});
		return {
			ctx: { context } as unknown as GenericEndpointContext,
			opts,
		};
	}

	async function signDiscoveredClientAssertion(input: {
		audience: string;
		clientId: string;
		key: CryptoKey;
		keyId: string;
		nbf?: number;
		exp?: number;
	}) {
		const now = Math.floor(Date.now() / 1000);
		const builder = new SignJWT({})
			.setProtectedHeader({ alg: "RS256", kid: input.keyId })
			.setIssuer(input.clientId)
			.setSubject(input.clientId)
			.setAudience(input.audience)
			.setIssuedAt(now)
			.setExpirationTime(input.exp ?? now + 120)
			.setJti(crypto.randomUUID());
		if (input.nbf != null) {
			builder.setNotBefore(input.nbf);
		}
		return builder.sign(input.key);
	}

	it("isolates discovery-owned JWKS caches between provider instances", async () => {
		const clientId = "https://cache-isolation.example.com/client.json";
		const jwksUri = "https://cache-isolation.example.com/jwks.json";
		const clientDiscoveryId = "shared-cache-isolation-discovery";
		const keyId = "shared-key-id";
		const [keyPairA, keyPairB] = await Promise.all([
			generateKeyPair("RS256", { extractable: true }),
			generateKeyPair("RS256", { extractable: true }),
		]);
		const [publicJwkA, publicJwkB] = await Promise.all([
			exportJWK(keyPairA.publicKey),
			exportJWK(keyPairB.publicKey),
		]);
		const transportA = vi.fn().mockResolvedValue(
			Response.json({
				keys: [{ ...publicJwkA, kid: keyId, alg: "RS256", use: "sig" }],
			}),
		);
		const transportB = vi.fn().mockResolvedValue(
			Response.json({
				keys: [{ ...publicJwkB, kid: keyId, alg: "RS256", use: "sig" }],
			}),
		);
		const providerA = await createDiscoveredClientVerifier({
			baseURL: "https://provider-a.example.com",
			clientId,
			clientDiscoveryId,
			fetchClientMetadataResource: transportA,
			jwksUri,
		});
		const providerB = await createDiscoveredClientVerifier({
			baseURL: "https://provider-b.example.com",
			clientId,
			clientDiscoveryId,
			fetchClientMetadataResource: transportB,
			jwksUri,
		});
		const audienceA = "https://provider-a.example.com/oauth2/token";
		const audienceB = "https://provider-b.example.com/oauth2/token";

		await expect(
			verifyClientAssertion(
				providerA.ctx,
				providerA.opts,
				await signDiscoveredClientAssertion({
					audience: audienceA,
					clientId,
					key: keyPairA.privateKey as CryptoKey,
					keyId,
				}),
				CLIENT_ASSERTION_TYPE,
				clientId,
				audienceA,
			),
		).resolves.toMatchObject({ clientId });
		await expect(
			verifyClientAssertion(
				providerB.ctx,
				providerB.opts,
				await signDiscoveredClientAssertion({
					audience: audienceB,
					clientId,
					key: keyPairB.privateKey as CryptoKey,
					keyId,
				}),
				CLIENT_ASSERTION_TYPE,
				clientId,
				audienceB,
			),
		).resolves.toMatchObject({ clientId });

		expect(transportA).toHaveBeenCalledTimes(1);
		expect(transportB).toHaveBeenCalledTimes(1);
	});

	describe("jwks_uri fetch sharing", () => {
		async function setup(name: string) {
			const clientId = `https://${name}.example.com/client.json`;
			const audience = `https://${name}-provider.example.com/oauth2/token`;
			const [oldPair, newPair] = await Promise.all([
				generateKeyPair("RS256", { extractable: true }),
				generateKeyPair("RS256", { extractable: true }),
			]);
			const [oldJwk, newJwk] = await Promise.all([
				exportJWK(oldPair.publicKey),
				exportJWK(newPair.publicKey),
			]);
			const published: JWK[] = [{ ...oldJwk, kid: "old", alg: "RS256" }];
			const transport = vi
				.fn()
				.mockImplementation(() =>
					Promise.resolve(Response.json({ keys: published })),
				);
			const provider = await createDiscoveredClientVerifier({
				baseURL: new URL(audience).origin,
				clientId,
				clientDiscoveryId: `${name}-discovery`,
				fetchClientMetadataResource: transport,
				jwksUri: `https://${name}.example.com/jwks.json`,
			});
			const sign = (keyId: string, key: CryptoKey) =>
				signDiscoveredClientAssertion({ audience, clientId, key, keyId });
			const verifyAssertion = (assertion: string) =>
				verifyClientAssertion(
					provider.ctx,
					provider.opts,
					assertion,
					CLIENT_ASSERTION_TYPE,
					clientId,
					audience,
				);
			const verify = async (keyId: string, key: CryptoKey) =>
				verifyAssertion(await sign(keyId, key));
			// Signing first makes the assertions reach the provider together.
			const verifyTogether = async (
				count: number,
				keyId: string,
				key: CryptoKey,
			) => {
				const assertions = await Promise.all(
					Array.from({ length: count }, () => sign(keyId, key)),
				);
				return Promise.allSettled(assertions.map(verifyAssertion));
			};
			return {
				clientId,
				oldKey: oldPair.privateKey as CryptoKey,
				newKey: newPair.privateKey as CryptoKey,
				publishNewKey: () =>
					published.push({ ...newJwk, kid: "new", alg: "RS256" }),
				transport,
				sign,
				verifyAssertion,
				verify,
				verifyTogether,
				delayFetches: (ms: number) => {
					const fetchJwks = transport.getMockImplementation()!;
					transport.mockImplementation(async (...args) => {
						await new Promise((resolve) => setTimeout(resolve, ms));
						return fetchJwks(...args);
					});
				},
			};
		}

		afterEach(() => {
			vi.useRealTimers();
		});

		it("refetches the key set when an assertion names a kid the cache lacks", async () => {
			const fixture = await setup("share-rotation");
			await fixture.verify("old", fixture.oldKey);
			expect(fixture.transport).toHaveBeenCalledTimes(1);

			fixture.publishNewKey();
			await expect(
				fixture.verify("new", fixture.newKey),
			).resolves.toMatchObject({ clientId: fixture.clientId });
			expect(fixture.transport).toHaveBeenCalledTimes(2);

			await fixture.verify("new", fixture.newKey);
			expect(fixture.transport).toHaveBeenCalledTimes(2);
		});

		it("does not refetch for a known kid with a bad signature", async () => {
			const fixture = await setup("share-known-kid");
			await fixture.verify("old", fixture.oldKey);

			await expect(fixture.verify("old", fixture.newKey)).rejects.toBeDefined();
			expect(fixture.transport).toHaveBeenCalledTimes(1);
		});

		it("shares one fetch across concurrent assertions on a cold cache", async () => {
			const fixture = await setup("share-cold");
			fixture.delayFetches(50);

			const results = await fixture.verifyTogether(5, "old", fixture.oldKey);
			expect(results.map((r) => r.status)).toEqual(Array(5).fill("fulfilled"));
			expect(fixture.transport).toHaveBeenCalledTimes(1);
		});

		it("shares one refetch across concurrent assertions with a new kid", async () => {
			const fixture = await setup("share-refetch");
			await fixture.verify("old", fixture.oldKey);
			fixture.publishNewKey();
			fixture.delayFetches(50);

			const results = await fixture.verifyTogether(5, "new", fixture.newKey);
			expect(results.map((r) => r.status)).toEqual(Array(5).fill("fulfilled"));
			expect(fixture.transport).toHaveBeenCalledTimes(2);
		});

		it("fails the assertions when the shared fetch and the retry both fail", async () => {
			const fixture = await setup("share-failed");
			await fixture.verify("old", fixture.oldKey);
			fixture.publishNewKey();
			fixture.transport.mockImplementation(async () => {
				await new Promise((resolve) => setTimeout(resolve, 50));
				return new Response("nope", { status: 500 });
			});

			const results = await fixture.verifyTogether(3, "new", fixture.newKey);
			expect(results.map((r) => r.status)).toEqual(Array(3).fill("rejected"));
			// The shared fetch, plus one retry shared by the two joiners.
			expect(fixture.transport).toHaveBeenCalledTimes(3);
		});

		it("lets a joiner make its own fetch when the shared fetch fails", async () => {
			const fixture = await setup("share-transient");
			await fixture.verify("old", fixture.oldKey);
			fixture.publishNewKey();
			const fetchJwks = fixture.transport.getMockImplementation()!;
			fixture.transport.mockImplementationOnce(async () => {
				await new Promise((resolve) => setTimeout(resolve, 50));
				return new Response("blip", { status: 500 });
			});
			fixture.transport.mockImplementation(fetchJwks);

			const results = await fixture.verifyTogether(3, "new", fixture.newKey);
			// The assertion that started the failed fetch fails as it would without
			// sharing; the joiners succeed on one shared retry.
			expect(results.map((r) => r.status).sort()).toEqual([
				"fulfilled",
				"fulfilled",
				"rejected",
			]);
			expect(fixture.transport).toHaveBeenCalledTimes(3);
		});

		it("does not join a fetch that started before the assertion arrived", async () => {
			const fixture = await setup("share-published-after");
			await fixture.verify("old", fixture.oldKey);
			// A fetch in flight returns the key set as it was when the fetch began.
			const fetchJwks = fixture.transport.getMockImplementation()!;
			fixture.transport.mockImplementation(async (...args) => {
				const response = await fetchJwks(...args);
				await new Promise((resolve) => setTimeout(resolve, 100));
				return response;
			});

			const ghost = fixture.verify("ghost", fixture.oldKey);
			const ghostResult = expect(ghost).rejects.toBeDefined();
			await vi.waitFor(() =>
				expect(fixture.transport).toHaveBeenCalledTimes(2),
			);
			await new Promise((resolve) => setTimeout(resolve, 5));
			fixture.publishNewKey();
			await expect(
				fixture.verify("new", fixture.newKey),
			).resolves.toMatchObject({ clientId: fixture.clientId });
			await ghostResult;
			expect(fixture.transport).toHaveBeenCalledTimes(3);
		});

		/**
		 * @see https://datatracker.ietf.org/doc/html/rfc7517#section-5
		 */
		it("does not join a fetch that started in the same millisecond as the assertion", async () => {
			const fixture = await setup("share-same-millisecond");
			await fixture.verify("old", fixture.oldKey);
			const fetchJwks = fixture.transport.getMockImplementation()!;
			let fetchStarted!: () => void;
			const started = new Promise<void>((resolve) => {
				fetchStarted = resolve;
			});
			fixture.transport.mockImplementation(async (...args) => {
				const response = await fetchJwks(...args);
				fetchStarted();
				await new Promise((resolve) => setTimeout(resolve, 100));
				return response;
			});
			// Frozen, so the fetch and the next assertion share one millisecond.
			vi.useFakeTimers({ toFake: ["Date"] });

			const ghost = fixture.verify("ghost", fixture.oldKey);
			const ghostResult = expect(ghost).rejects.toBeDefined();
			await started;
			fixture.publishNewKey();
			await expect(
				fixture.verify("new", fixture.newKey),
			).resolves.toMatchObject({ clientId: fixture.clientId });
			await ghostResult;
			expect(fixture.transport).toHaveBeenCalledTimes(3);
		});

		/**
		 * @see https://datatracker.ietf.org/doc/html/rfc7517#section-5
		 */
		it("answers with the newer key set when an older overlapping fetch finishes last", async () => {
			const fixture = await setup("share-stale-finish");
			await fixture.verify("old", fixture.oldKey);
			const fetchJwks = fixture.transport.getMockImplementation()!;
			let calls = 0;
			fixture.transport.mockImplementation(async (...args) => {
				const delay = ++calls === 1 ? 150 : 10;
				const response = await fetchJwks(...args);
				await new Promise((resolve) => setTimeout(resolve, delay));
				return response;
			});

			const [first, second] = await Promise.all([
				fixture.sign("new", fixture.newKey),
				fixture.sign("new", fixture.newKey),
			]);
			const slowResults = Promise.allSettled([
				fixture.verifyAssertion(first),
				fixture.verifyAssertion(second),
			]);
			await vi.waitFor(() => expect(calls).toBe(1));
			fixture.publishNewKey();
			await expect(
				fixture.verify("new", fixture.newKey),
			).resolves.toMatchObject({ clientId: fixture.clientId });

			const results = await slowResults;
			expect(results.map((r) => r.status)).toEqual(["fulfilled", "fulfilled"]);
		});

		it("lets a joiner make its own fetch when the shared fetch returns an invalid key set", async () => {
			const fixture = await setup("share-invalid");
			await fixture.verify("old", fixture.oldKey);
			fixture.publishNewKey();
			const fetchJwks = fixture.transport.getMockImplementation()!;
			fixture.transport.mockImplementationOnce(async () => {
				await new Promise((resolve) => setTimeout(resolve, 50));
				return Response.json({ keys: "malformed" });
			});
			fixture.transport.mockImplementation(fetchJwks);

			const results = await fixture.verifyTogether(3, "new", fixture.newKey);
			expect(results.map((r) => r.status).sort()).toEqual([
				"fulfilled",
				"fulfilled",
				"rejected",
			]);
			expect(fixture.transport).toHaveBeenCalledTimes(3);
		});

		it("replaces a fetch that outlived its timeout", async () => {
			const fixture = await setup("share-dead-fetch");
			await fixture.verify("old", fixture.oldKey);
			vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"] });
			let fetchStarted!: () => void;
			const started = new Promise<void>((resolve) => {
				fetchStarted = resolve;
			});
			// A fetch whose request was canceled never settles.
			fixture.transport.mockImplementationOnce(() => {
				fetchStarted();
				return new Promise(() => {});
			});

			fixture.publishNewKey();
			const stuck = fixture.verify("new", fixture.newKey);
			const stuckResult = expect(stuck).rejects.toBeDefined();
			await started;
			await vi.advanceTimersByTimeAsync(5_000);
			await stuckResult;

			// The next assertion starts a new fetch instead of joining the dead one.
			await expect(
				fixture.verify("new", fixture.newKey),
			).resolves.toMatchObject({ clientId: fixture.clientId });
			expect(fixture.transport).toHaveBeenCalledTimes(3);
		});
	});

	it("keeps cached key sets when other clients' jwks_uri fetches fail at capacity", async () => {
		const audience = "https://evict-provider.example.com/oauth2/token";
		const okClientIds = Array.from(
			{ length: 500 },
			(_, index) => `https://evict-ok-${index}.example.com/client.json`,
		);
		const failingClientIds = Array.from(
			{ length: 20 },
			(_, index) => `https://evict-fail-${index}.example.com/client.json`,
		);
		const oldestJwksUri = "https://evict-ok-0.example.com/jwks.json";
		const keyPair = await generateKeyPair("ES256", { extractable: true });
		const publicJwk = await exportJWK(keyPair.publicKey);
		const transport = vi.fn(async (url: string | URL | Request) => {
			if (String(url).startsWith("https://evict-ok-")) {
				return Response.json({
					keys: [{ ...publicJwk, kid: "k", alg: "ES256" }],
				});
			}
			await new Promise((resolve) => setTimeout(resolve, 50));
			return new Response("unavailable", { status: 503 });
		});
		const opts = {
			loginPage: "/login",
			consentPage: "/consent",
			extensions: [
				{
					clientDiscovery: {
						id: "evict-discovery",
						matches: (candidateClientId: string) =>
							candidateClientId.startsWith("https://evict-"),
						resolve: (
							_ctx: GenericEndpointContext,
							_clientId: string,
							existingClient: SchemaClient<Scope[]> | null,
						) => existingClient,
						fetchClientMetadataResource: transport,
					},
				},
			],
		} satisfies OAuthOptions<Scope[]>;
		const instance = await getTestInstance({
			baseURL: new URL(audience).origin,
			plugins: [jwt(), oauthProvider(opts)],
		});
		const context = await instance.auth.$context;
		const ctx = { context } as unknown as GenericEndpointContext;
		for (const clientId of [...okClientIds, ...failingClientIds]) {
			await context.adapter.create<SchemaClient<Scope[]>>({
				model: "oauthClient",
				data: {
					clientId,
					clientDiscoveryId: "evict-discovery",
					name: "Discovered private_key_jwt client",
					redirectUris: ["https://client.example.com/callback"],
					tokenEndpointAuthMethod: "private_key_jwt",
					applicationType: "web",
					grantTypes: ["authorization_code"],
					responseTypes: ["code"],
					jwksUri: clientId.replace("client.json", "jwks.json"),
					createdAt: new Date(),
					updatedAt: new Date(),
				},
			});
		}
		const verify = async (clientId: string) => {
			const now = Math.floor(Date.now() / 1000);
			return verifyClientAssertion(
				ctx,
				opts,
				await new SignJWT({})
					.setProtectedHeader({ alg: "ES256", kid: "k" })
					.setIssuer(clientId)
					.setSubject(clientId)
					.setAudience(audience)
					.setIssuedAt(now)
					.setExpirationTime(now + 120)
					.setJti(crypto.randomUUID())
					.sign(keyPair.privateKey),
				CLIENT_ASSERTION_TYPE,
				clientId,
				audience,
			);
		};

		// Fill the cache to its limit with key sets.
		for (const clientId of okClientIds) {
			await verify(clientId);
		}
		// Slow failures in flight at the same time must not push key sets out.
		const failures = await Promise.allSettled(failingClientIds.map(verify));
		expect(failures.map((r) => r.status)).toEqual(Array(20).fill("rejected"));
		await verify(okClientIds[0]!);

		const oldestFetches = transport.mock.calls.filter(
			([url]) => String(url) === oldestJwksUri,
		);
		expect(oldestFetches).toHaveLength(1);
	});

	it.each([
		{
			name: "bare-array",
			jwks: () => [
				{
					...rsaPublicJwk,
					kid: "remote-validation-key",
					alg: "RS256",
				},
			],
		},
		{
			name: "symmetric",
			jwks: () => ({
				keys: [
					{
						kty: "oct",
						k: "c3ltbWV0cmljLXNlY3JldA",
						kid: "remote-validation-key",
						alg: "RS256",
					},
				],
			}),
		},
		{
			name: "private",
			jwks: () => ({
				keys: [
					{
						...rsaPrivateJwk,
						kid: "remote-validation-key",
						alg: "RS256",
					},
				],
			}),
		},
		{
			name: "malformed",
			jwks: () => ({
				keys: [
					{
						kty: "RSA",
						n: rsaPublicJwk.n,
						kid: "remote-validation-key",
						alg: "RS256",
					},
				],
			}),
		},
		{
			name: "unsupported-algorithm",
			jwks: () => ({
				keys: [
					{
						...rsaPublicJwk,
						kid: "remote-validation-key",
						alg: "HS256",
					},
				],
			}),
		},
		{
			name: "incompatible-algorithm",
			jwks: () => ({
				keys: [
					{
						...rsaPublicJwk,
						kid: "remote-validation-key",
						alg: "ES256",
					},
				],
			}),
		},
		{
			name: "ec-curve-algorithm-mismatch",
			jwks: () => ({
				keys: [
					{
						kty: "EC",
						crv: "P-256",
						x: "public-x",
						y: "public-y",
						kid: "remote-validation-key",
						alg: "ES384",
					},
				],
			}),
		},
		{
			name: "unsupported-ed448-curve",
			jwks: () => ({
				keys: [
					{
						kty: "OKP",
						crv: "Ed448",
						x: "public-x",
						kid: "remote-validation-key",
						alg: "EdDSA",
					},
				],
			}),
		},
	])(
		"does not cache a $name discovery-owned JWKS response",
		async ({ name, jwks }) => {
			const clientId = `https://${name}-remote-jwks.example.com/client.json`;
			const jwksUri = `https://${name}-remote-jwks.example.com/jwks.json`;
			const audience = `https://${name}-provider.example.com/oauth2/token`;
			let serveValidJwks = false;
			const transport = vi.fn().mockImplementation(() =>
				Promise.resolve(
					Response.json(
						serveValidJwks
							? {
									keys: [
										{
											...rsaPublicJwk,
											kid: "remote-validation-key",
											alg: "RS256",
										},
									],
								}
							: jwks(),
					),
				),
			);
			const provider = await createDiscoveredClientVerifier({
				baseURL: new URL(audience).origin,
				clientId,
				clientDiscoveryId: `${name}-remote-jwks-discovery`,
				fetchClientMetadataResource: transport,
				jwksUri,
			});

			await expect(
				verifyClientAssertion(
					provider.ctx,
					provider.opts,
					await signDiscoveredClientAssertion({
						audience,
						clientId,
						key: rsaPrivateKey,
						keyId: "remote-validation-key",
					}),
					CLIENT_ASSERTION_TYPE,
					clientId,
					audience,
				),
			).rejects.toBeDefined();
			expect(transport).toHaveBeenCalledTimes(1);

			serveValidJwks = true;
			await expect(
				verifyClientAssertion(
					provider.ctx,
					provider.opts,
					await signDiscoveredClientAssertion({
						audience,
						clientId,
						key: rsaPrivateKey,
						keyId: "remote-validation-key",
					}),
					CLIENT_ASSERTION_TYPE,
					clientId,
					audience,
				),
			).resolves.toMatchObject({ clientId });
			expect(transport).toHaveBeenCalledTimes(2);
		},
	);

	it("should exchange code with valid private_key_jwt assertion", async () => {
		const codeVerifier = generateRandomString(32);
		const code = await getAuthCode(assertionClient.client_id, codeVerifier);
		const assertion = await signAssertion();

		const tokens = await exchangeCodeForTokens({
			code,
			codeVerifier,
			assertion,
		});

		expect(tokens.data?.access_token).toBeDefined();
		expect(tokens.data?.token_type).toBe("Bearer");
	});

	it("should accept the configured issuer as a token audience", async () => {
		const codeVerifier = generateRandomString(32);
		const code = await getAuthCode(assertionClient.client_id, codeVerifier);
		const assertion = await signAssertion({
			aud: customIssuer,
		});

		const tokens = await exchangeCodeForTokens({
			code,
			codeVerifier,
			assertion,
		});

		expect(tokens.data?.access_token).toBeDefined();
		expect(tokens.data?.token_type).toBe("Bearer");
	});

	it("should exchange code using a trusted jwks_uri", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue(
				new Response(
					JSON.stringify({
						keys: [
							{
								...rsaPublicJwk,
								kid: "trusted-jwks-key",
								alg: "RS256",
								use: "sig",
							},
						],
					}),
					{
						status: 200,
						headers: { "content-type": "application/json" },
					},
				),
			),
		);

		const codeVerifier = generateRandomString(32);
		const code = await getAuthCode(jwksUriClient.client_id, codeVerifier);
		const assertion = await signAssertion({
			clientId: jwksUriClient.client_id,
			kid: "trusted-jwks-key",
		});

		const tokens = await exchangeCodeForTokens({
			clientId: jwksUriClient.client_id,
			code,
			codeVerifier,
			assertion,
		});

		expect(tokens.data?.access_token).toBeDefined();
		expect(globalThis.fetch).toHaveBeenCalledWith(
			"https://trusted.example.com/.well-known/jwks.json",
			expect.objectContaining({
				headers: { accept: "application/json" },
				redirect: "manual",
			}),
		);
		expect(discoveryMetadataFetch).not.toHaveBeenCalled();
	});

	/**
	 * A 401 must carry a challenge, and a browser client must be able to read it.
	 * @see https://www.rfc-editor.org/rfc/rfc9110#section-15.5.2
	 */
	it("should reject assertion signed with wrong key", async () => {
		const wrongKeyPair = await generateKeyPair("RS256", {
			extractable: true,
		});
		const codeVerifier = generateRandomString(32);
		const code = await getAuthCode(assertionClient.client_id, codeVerifier);
		const assertion = await signAssertion({
			key: wrongKeyPair.privateKey as CryptoKey,
		});
		let responseHeaders: Headers | undefined;

		const result = await client.$fetch("/oauth2/token", {
			method: "POST",
			body: new URLSearchParams({
				grant_type: "authorization_code",
				code,
				redirect_uri: redirectUri,
				client_id: assertionClient.client_id,
				client_assertion_type:
					"urn:ietf:params:oauth:client-assertion-type:jwt-bearer",
				client_assertion: assertion,
				code_verifier: codeVerifier,
			}),
			headers: { "content-type": "application/x-www-form-urlencoded" },
			onError(context) {
				responseHeaders = context.response.headers;
			},
		});

		expect(result.error?.status).toBe(401);
		expect(result.error).toMatchObject({ error: "invalid_client" });
		expect(responseHeaders?.get("WWW-Authenticate")).toBe("Basic");
		expect(responseHeaders?.get("Access-Control-Expose-Headers")).toBe(
			"WWW-Authenticate",
		);
	});

	/**
	 * @see https://github.com/croffasia/itsaplan/issues/564
	 */
	it("reports an assertion for an unknown client as a client that was not found", async () => {
		const result = await client.$fetch("/oauth2/token", {
			method: "POST",
			body: new URLSearchParams({
				grant_type: "client_credentials",
				client_id: "no-such-client",
				client_assertion_type:
					"urn:ietf:params:oauth:client-assertion-type:jwt-bearer",
				client_assertion: await signAssertion({ clientId: "no-such-client" }),
			}),
			headers: { "content-type": "application/x-www-form-urlencoded" },
		});

		expect(result.error).toMatchObject({
			error: "invalid_client",
			error_description: "client not found",
		});
	});

	/**
	 * @see https://github.com/better-auth/better-auth/issues/12005
	 */
	it("rejects a not-before claim a few seconds in the future when clock tolerance is unset", async () => {
		const codeVerifier = generateRandomString(32);
		const code = await getAuthCode(assertionClient.client_id, codeVerifier);
		const now = Math.floor(Date.now() / 1000);
		const assertion = await signAssertion({ nbf: now + 5 });

		const result = await client.$fetch("/oauth2/token", {
			method: "POST",
			body: new URLSearchParams({
				grant_type: "authorization_code",
				code,
				redirect_uri: redirectUri,
				client_id: assertionClient.client_id,
				client_assertion_type:
					"urn:ietf:params:oauth:client-assertion-type:jwt-bearer",
				client_assertion: assertion,
				code_verifier: codeVerifier,
			}),
			headers: { "content-type": "application/x-www-form-urlencoded" },
		});

		expect(result.error).toMatchObject({
			error: "invalid_client",
			error_description: "client assertion signature verification failed",
		});
	});

	/**
	 * @see https://github.com/better-auth/better-auth/issues/12005
	 */
	it("accepts nbf within assertionClockTolerance and rejects nbf outside it", async () => {
		const clientId = "https://clock-tolerance.example.com/client.json";
		const jwksUri = "https://clock-tolerance.example.com/jwks.json";
		const clientDiscoveryId = "clock-tolerance-discovery";
		const keyId = "clock-tolerance-key";
		const keyPair = await generateKeyPair("RS256", { extractable: true });
		const publicJwk = await exportJWK(keyPair.publicKey);
		const transport = vi.fn().mockResolvedValue(
			Response.json({
				keys: [{ ...publicJwk, kid: keyId, alg: "RS256", use: "sig" }],
			}),
		);
		const provider = await createDiscoveredClientVerifier({
			baseURL: "https://clock-tolerance.example.com",
			clientId,
			clientDiscoveryId,
			fetchClientMetadataResource: transport,
			jwksUri,
			assertionClockTolerance: 30,
		});
		const audience = "https://clock-tolerance.example.com/oauth2/token";
		const now = Math.floor(Date.now() / 1000);

		await expect(
			verifyClientAssertion(
				provider.ctx,
				provider.opts,
				await signDiscoveredClientAssertion({
					audience,
					clientId,
					key: keyPair.privateKey as CryptoKey,
					keyId,
					nbf: now + 5,
				}),
				CLIENT_ASSERTION_TYPE,
				clientId,
				audience,
			),
		).resolves.toMatchObject({ clientId });

		await expect(
			verifyClientAssertion(
				provider.ctx,
				provider.opts,
				await signDiscoveredClientAssertion({
					audience,
					clientId,
					key: keyPair.privateKey as CryptoKey,
					keyId,
					nbf: now + 60,
				}),
				CLIENT_ASSERTION_TYPE,
				clientId,
				audience,
			),
		).rejects.toMatchObject({
			body: {
				error: "invalid_client",
				error_description: "client assertion signature verification failed",
			},
		});

		await expect(
			verifyClientAssertion(
				provider.ctx,
				provider.opts,
				await signDiscoveredClientAssertion({
					audience,
					clientId,
					key: keyPair.privateKey as CryptoKey,
					keyId,
					exp: now - 5,
				}),
				CLIENT_ASSERTION_TYPE,
				clientId,
				audience,
			),
		).resolves.toMatchObject({ clientId });

		await expect(
			verifyClientAssertion(
				provider.ctx,
				provider.opts,
				await signDiscoveredClientAssertion({
					audience,
					clientId,
					key: keyPair.privateKey as CryptoKey,
					keyId,
					exp: now - 60,
				}),
				CLIENT_ASSERTION_TYPE,
				clientId,
				audience,
			),
		).rejects.toMatchObject({
			body: {
				error: "invalid_client",
				error_description: "client assertion signature verification failed",
			},
		});
	});

	/**
	 * @see https://github.com/better-auth/better-auth/issues/12005
	 */
	it("keeps the jti tombstone until exp plus assertionClockTolerance", async () => {
		const assertionClockTolerance = 30;
		const opts = {
			loginPage: "/login",
			consentPage: "/consent",
			assertionClockTolerance,
		} satisfies OAuthOptions<Scope[]>;
		const instance = await getTestInstance({
			baseURL: authServerBaseUrl,
			plugins: [jwt(), oauthProvider(opts)],
		});
		const ctx = {
			context: await instance.auth.$context,
		} as GenericEndpointContext;
		const now = Math.floor(Date.now() / 1000);
		const expWithin = now - 5;
		await consumeClientAssertion(ctx, opts, {
			namespace: "private_key_jwt:clock-tolerance-client",
			payload: {
				aud: tokenEndpoint,
				exp: expWithin,
				jti: crypto.randomUUID(),
			},
			expectedAudience: tokenEndpoint,
		});
		const rows = await ctx.context.adapter.findMany<{ expiresAt: Date }>({
			model: "oauthClientAssertion",
		});
		expect(rows).toHaveLength(1);
		expect(new Date(rows[0]!.expiresAt).getTime()).toBe(
			(expWithin + assertionClockTolerance) * 1000,
		);

		await expect(
			consumeClientAssertion(ctx, opts, {
				namespace: "private_key_jwt:clock-tolerance-client",
				payload: {
					aud: tokenEndpoint,
					exp: now - 60,
					jti: crypto.randomUUID(),
				},
				expectedAudience: tokenEndpoint,
			}),
		).rejects.toMatchObject({
			body: {
				error: "invalid_client",
				error_description: "client assertion has expired",
			},
		});
	});

	/**
	 * @see https://github.com/better-auth/better-auth/issues/12005
	 */
	it("applies assertionClockTolerance to iat within the lifetime cap", async () => {
		const assertionClockTolerance = 30;
		const opts = {
			loginPage: "/login",
			consentPage: "/consent",
			assertionClockTolerance,
		} satisfies OAuthOptions<Scope[]>;
		const instance = await getTestInstance({
			baseURL: authServerBaseUrl,
			plugins: [jwt(), oauthProvider(opts)],
		});
		const ctx = {
			context: await instance.auth.$context,
		} as GenericEndpointContext;
		const now = Math.floor(Date.now() / 1000);
		const consume = (iat: number) =>
			consumeClientAssertion(ctx, opts, {
				namespace: "private_key_jwt:clock-tolerance-iat-client",
				payload: {
					aud: tokenEndpoint,
					exp: now + 60,
					iat,
					jti: crypto.randomUUID(),
				},
				expectedAudience: tokenEndpoint,
			});

		// 310 seconds old: past assertionMaxLifetime (300) but inside the tolerance.
		await expect(consume(now - 310)).resolves.toBeUndefined();
		await expect(consume(now - 400)).rejects.toMatchObject({
			body: {
				error: "invalid_client",
				error_description:
					"client assertion iat is too far in the past (max 300s)",
			},
		});
	});

	/**
	 * @see https://github.com/better-auth/better-auth/issues/12005
	 */
	it("caps assertionClockTolerance at 60 seconds", async () => {
		const clientId = "https://clock-tolerance-cap.example.com/client.json";
		const jwksUri = "https://clock-tolerance-cap.example.com/jwks.json";
		const clientDiscoveryId = "clock-tolerance-cap-discovery";
		const keyId = "clock-tolerance-cap-key";
		const keyPair = await generateKeyPair("RS256", { extractable: true });
		const publicJwk = await exportJWK(keyPair.publicKey);
		const provider = await createDiscoveredClientVerifier({
			baseURL: "https://clock-tolerance-cap.example.com",
			clientId,
			clientDiscoveryId,
			fetchClientMetadataResource: vi.fn().mockResolvedValue(
				Response.json({
					keys: [{ ...publicJwk, kid: keyId, alg: "RS256", use: "sig" }],
				}),
			),
			jwksUri,
			assertionClockTolerance: 3600,
		});
		const audience = "https://clock-tolerance-cap.example.com/oauth2/token";
		const now = Math.floor(Date.now() / 1000);
		const verify = async (nbf: number) =>
			verifyClientAssertion(
				provider.ctx,
				provider.opts,
				await signDiscoveredClientAssertion({
					audience,
					clientId,
					key: keyPair.privateKey as CryptoKey,
					keyId,
					nbf,
				}),
				CLIENT_ASSERTION_TYPE,
				clientId,
				audience,
			);

		await expect(verify(now + 50)).resolves.toMatchObject({ clientId });
		await expect(verify(now + 120)).rejects.toMatchObject({
			body: {
				error: "invalid_client",
				error_description: "client assertion signature verification failed",
			},
		});

		await expect(
			consumeClientAssertion(provider.ctx, provider.opts, {
				namespace: "private_key_jwt:clock-tolerance-cap-client",
				payload: {
					aud: audience,
					exp: now - 120,
					jti: crypto.randomUUID(),
				},
				expectedAudience: audience,
			}),
		).rejects.toMatchObject({
			body: {
				error: "invalid_client",
				error_description: "client assertion has expired",
			},
		});
	});

	// The next five tests pin the status split: a failed signature or JWT claim
	// check is 401 with a Basic challenge, and a failure found while consuming
	// the assertion (lifetime, jti, replay) is 400 with no challenge.
	it("should reject expired assertion", async () => {
		let responseHeaders: Headers | undefined;
		const now = Math.floor(Date.now() / 1000);
		const codeVerifier = generateRandomString(32);
		const code = await getAuthCode(assertionClient.client_id, codeVerifier);
		const assertion = await signAssertion({ exp: now - 60 });

		const result = await client.$fetch("/oauth2/token", {
			method: "POST",
			body: new URLSearchParams({
				grant_type: "authorization_code",
				code,
				redirect_uri: redirectUri,
				client_id: assertionClient.client_id,
				client_assertion_type:
					"urn:ietf:params:oauth:client-assertion-type:jwt-bearer",
				client_assertion: assertion,
				code_verifier: codeVerifier,
			}),
			headers: { "content-type": "application/x-www-form-urlencoded" },
			onError(context) {
				responseHeaders = context.response.headers;
			},
		});

		expect(result.error?.status).toBe(401);
		expect(result.error).toMatchObject({
			error: "invalid_client",
			error_description: "client assertion signature verification failed",
		});
		expect(responseHeaders?.get("WWW-Authenticate")).toBe("Basic");
	});

	it("should reject assertion that is not yet valid", async () => {
		let responseHeaders: Headers | undefined;
		const now = Math.floor(Date.now() / 1000);
		const codeVerifier = generateRandomString(32);
		const code = await getAuthCode(assertionClient.client_id, codeVerifier);
		const assertion = await signAssertion({ nbf: now + 3600 });

		const result = await client.$fetch("/oauth2/token", {
			method: "POST",
			body: new URLSearchParams({
				grant_type: "authorization_code",
				code,
				redirect_uri: redirectUri,
				client_id: assertionClient.client_id,
				client_assertion_type:
					"urn:ietf:params:oauth:client-assertion-type:jwt-bearer",
				client_assertion: assertion,
				code_verifier: codeVerifier,
			}),
			headers: { "content-type": "application/x-www-form-urlencoded" },
			onError(context) {
				responseHeaders = context.response.headers;
			},
		});

		expect(result.error?.status).toBe(401);
		expect(result.error).toMatchObject({
			error: "invalid_client",
			error_description: "client assertion signature verification failed",
		});
		expect(responseHeaders?.get("WWW-Authenticate")).toBe("Basic");
	});

	it("should reject assertion with exp too far in the future", async () => {
		let responseHeaders: Headers | undefined;
		const now = Math.floor(Date.now() / 1000);
		const codeVerifier = generateRandomString(32);
		const code = await getAuthCode(assertionClient.client_id, codeVerifier);
		// exp is 1 hour out — exceeds assertionMaxLifetime of 300s
		const assertion = await signAssertion({ exp: now + 3600 });

		const result = await client.$fetch("/oauth2/token", {
			method: "POST",
			body: new URLSearchParams({
				grant_type: "authorization_code",
				code,
				redirect_uri: redirectUri,
				client_id: assertionClient.client_id,
				client_assertion_type:
					"urn:ietf:params:oauth:client-assertion-type:jwt-bearer",
				client_assertion: assertion,
				code_verifier: codeVerifier,
			}),
			headers: { "content-type": "application/x-www-form-urlencoded" },
			onError(context) {
				responseHeaders = context.response.headers;
			},
		});

		expect(result.error?.status).toBe(400);
		expect(result.error).toMatchObject({
			error: "invalid_client",
			error_description:
				"client assertion exp is too far in the future (max 300s)",
		});
		expect(responseHeaders?.get("WWW-Authenticate")).toBeNull();
	});

	it("should reject assertion without jti", async () => {
		let responseHeaders: Headers | undefined;
		const codeVerifier = generateRandomString(32);
		const code = await getAuthCode(assertionClient.client_id, codeVerifier);
		const assertion = await signAssertion({ omitJti: true });

		const result = await client.$fetch("/oauth2/token", {
			method: "POST",
			body: new URLSearchParams({
				grant_type: "authorization_code",
				code,
				redirect_uri: redirectUri,
				client_id: assertionClient.client_id,
				client_assertion_type:
					"urn:ietf:params:oauth:client-assertion-type:jwt-bearer",
				client_assertion: assertion,
				code_verifier: codeVerifier,
			}),
			headers: { "content-type": "application/x-www-form-urlencoded" },
			onError(context) {
				responseHeaders = context.response.headers;
			},
		});

		expect(result.error?.status).toBe(400);
		expect(result.error).toMatchObject({
			error: "invalid_client",
			error_description: "client assertion must include jti claim",
		});
		expect(responseHeaders?.get("WWW-Authenticate")).toBeNull();
	});

	it("should reject reused jti (replay prevention)", async () => {
		let responseHeaders: Headers | undefined;
		const jti = crypto.randomUUID();

		// First request should succeed
		const cv1 = generateRandomString(32);
		const code1 = await getAuthCode(assertionClient.client_id, cv1);
		const assertion1 = await signAssertion({ jti });

		const result1 = await client.$fetch<{ access_token?: string }>(
			"/oauth2/token",
			{
				method: "POST",
				body: new URLSearchParams({
					grant_type: "authorization_code",
					code: code1,
					redirect_uri: redirectUri,
					client_id: assertionClient.client_id,
					client_assertion_type:
						"urn:ietf:params:oauth:client-assertion-type:jwt-bearer",
					client_assertion: assertion1,
					code_verifier: cv1,
				}),
				headers: { "content-type": "application/x-www-form-urlencoded" },
			},
		);
		expect(result1.data?.access_token).toBeDefined();

		// Second request with same jti should fail
		const cv2 = generateRandomString(32);
		const code2 = await getAuthCode(assertionClient.client_id, cv2);
		const assertion2 = await signAssertion({ jti });

		const result2 = await client.$fetch("/oauth2/token", {
			method: "POST",
			body: new URLSearchParams({
				grant_type: "authorization_code",
				code: code2,
				redirect_uri: redirectUri,
				client_id: assertionClient.client_id,
				client_assertion_type:
					"urn:ietf:params:oauth:client-assertion-type:jwt-bearer",
				client_assertion: assertion2,
				code_verifier: cv2,
			}),
			headers: { "content-type": "application/x-www-form-urlencoded" },
			onError(context) {
				responseHeaders = context.response.headers;
			},
		});

		expect(result2.error?.status).toBe(400);
		expect(result2.error).toMatchObject({
			error: "invalid_client",
			error_description: "client assertion jti has already been used",
		});
		expect(responseHeaders?.get("WWW-Authenticate")).toBeNull();
	});

	it("should reject concurrent reuse of the same jti", async () => {
		const jti = crypto.randomUUID();
		const cv1 = generateRandomString(32);
		const cv2 = generateRandomString(32);
		const [code1, code2] = await Promise.all([
			getAuthCode(assertionClient.client_id, cv1),
			getAuthCode(assertionClient.client_id, cv2),
		]);
		const assertion = await signAssertion({ jti });

		const [result1, result2] = await Promise.all([
			exchangeCodeForTokens({
				code: code1,
				codeVerifier: cv1,
				assertion,
			}),
			exchangeCodeForTokens({
				code: code2,
				codeVerifier: cv2,
				assertion,
			}),
		]);

		const successCount = [result1, result2].filter((result) =>
			Boolean(result.data?.access_token),
		).length;
		const failureCount = [result1, result2].filter((result) =>
			Boolean(result.error?.status),
		).length;

		expect(successCount).toBe(1);
		expect(failureCount).toBe(1);
	});

	/**
	 * @see https://github.com/better-auth/better-auth/issues/10862
	 */
	describe("with configured id strategies", () => {
		const idStrategyOptions = {
			loginPage: "/login",
			consentPage: "/consent",
		} satisfies OAuthOptions<Scope[]>;
		const consumeWith = async (
			generateId: "uuid" | "serial" | false,
			jti: string,
			attempts: number,
			database?: BetterAuthOptions["database"],
		) => {
			const instance = await getTestInstance({
				baseURL: authServerBaseUrl,
				...(database && { database }),
				advanced: { database: { generateId } },
				plugins: [jwt(), oauthProvider(idStrategyOptions)],
			});
			const ctx = {
				context: await instance.auth.$context,
			} as GenericEndpointContext;
			const assertion = {
				namespace: "private_key_jwt:id-strategy-client",
				payload: {
					aud: tokenEndpoint,
					exp: Math.floor(Date.now() / 1000) + 120,
					jti,
				},
				expectedAudience: tokenEndpoint,
			};
			return Promise.allSettled(
				Array.from({ length: attempts }, () =>
					consumeClientAssertion(ctx, idStrategyOptions, assertion),
				),
			);
		};

		it("accepts a jti exactly once when ids are uuids", async () => {
			const results = await consumeWith("uuid", crypto.randomUUID(), 3);

			expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
			for (const result of results.filter((r) => r.status === "rejected")) {
				expect(result.reason).toMatchObject({
					body: {
						error: "invalid_client",
						error_description: "client assertion jti has already been used",
					},
				});
			}
		});

		it("keeps accepting assertions when ids are database-generated numbers", async () => {
			const [result] = await consumeWith("serial", crypto.randomUUID(), 1);

			expect(result?.status).toBe("fulfilled");
		});

		/**
		 * @see https://github.com/better-auth/better-auth/issues/12071
		 */
		it("accepts assertions on Prisma with MongoDB ObjectId ids", async () => {
			// Stands in for `@default(auto()) @db.ObjectId`: the database assigns
			// missing ids and rejects any id that is not 24 hex.
			const rejectNonObjectIds = <T extends DBTransactionAdapter>(
				adapter: T,
			): T => ({
				...adapter,
				create: (args) => {
					const id =
						args.data.id ??
						hex.encode(crypto.getRandomValues(new Uint8Array(12)));
					if (!/^[0-9a-f]{24}$/.test(String(id))) {
						throw new Error(`Malformed ObjectID: ${id}`);
					}
					return adapter.create({
						...args,
						data: { ...args.data, id },
						forceAllowId: true,
					});
				},
			});
			const tables: MemoryDB = Object.fromEntries(
				[
					"user",
					"session",
					"account",
					"verification",
					"jwks",
					...Object.keys(schema),
				].map((model) => [model, []]),
			);
			const [result] = await consumeWith(
				false,
				crypto.randomUUID(),
				1,
				(options) => {
					const adapter = memoryAdapter(tables)(options);
					return {
						...rejectNonObjectIds(adapter),
						options: { ...adapter.options!, usesObjectIdKey: () => true },
						transaction: (callback) =>
							adapter.transaction((trx) => callback(rejectNonObjectIds(trx))),
					};
				},
			);

			expect(result?.status).toBe("fulfilled");
		});
	});

	it("should reject wrong audience", async () => {
		const codeVerifier = generateRandomString(32);
		const code = await getAuthCode(assertionClient.client_id, codeVerifier);
		const assertion = await signAssertion({
			aud: "https://wrong-server.example.com/token",
		});

		const result = await client.$fetch("/oauth2/token", {
			method: "POST",
			body: new URLSearchParams({
				grant_type: "authorization_code",
				code,
				redirect_uri: redirectUri,
				client_id: assertionClient.client_id,
				client_assertion_type:
					"urn:ietf:params:oauth:client-assertion-type:jwt-bearer",
				client_assertion: assertion,
				code_verifier: codeVerifier,
			}),
			headers: { "content-type": "application/x-www-form-urlencoded" },
		});

		expect(result.error?.status).toBeGreaterThanOrEqual(400);
		expect(result.error?.status).toBeLessThan(500);
	});

	it("should reject assertion signed with HS256 (symmetric algorithm)", async () => {
		const codeVerifier = generateRandomString(32);
		const code = await getAuthCode(assertionClient.client_id, codeVerifier);
		const now = Math.floor(Date.now() / 1000);
		// Sign with HS256 using a shared secret (symmetric, not allowed for private_key_jwt)
		const symmetricKey = new TextEncoder().encode(
			"a]?Y^w0S@}I-lI%i|{5BW?Wl:jLz[I_M",
		);
		const assertion = await new SignJWT({})
			.setProtectedHeader({ alg: "HS256" })
			.setIssuer(assertionClient.client_id)
			.setSubject(assertionClient.client_id)
			.setAudience(tokenEndpoint)
			.setIssuedAt(now)
			.setExpirationTime(now + 120)
			.setJti(crypto.randomUUID())
			.sign(symmetricKey);

		const result = await client.$fetch("/oauth2/token", {
			method: "POST",
			body: new URLSearchParams({
				grant_type: "authorization_code",
				code,
				redirect_uri: redirectUri,
				client_id: assertionClient.client_id,
				client_assertion_type:
					"urn:ietf:params:oauth:client-assertion-type:jwt-bearer",
				client_assertion: assertion,
				code_verifier: codeVerifier,
			}),
			headers: { "content-type": "application/x-www-form-urlencoded" },
		});

		expect(result.error?.status).toBeGreaterThanOrEqual(400);
		expect(result.error?.status).toBeLessThan(500);
	});

	it("should reject assertion with iat too far in the past", async () => {
		const now = Math.floor(Date.now() / 1000);
		const codeVerifier = generateRandomString(32);
		const code = await getAuthCode(assertionClient.client_id, codeVerifier);
		// Manually build to control iat separately (signAssertion always uses now for iat)
		const manualAssertion = await new SignJWT({})
			.setProtectedHeader({ alg: "RS256", kid: "test-key-1" })
			.setIssuer(assertionClient.client_id)
			.setSubject(assertionClient.client_id)
			.setAudience(tokenEndpoint)
			.setIssuedAt(now - 600)
			.setExpirationTime(now + 60)
			.setJti(crypto.randomUUID())
			.sign(rsaPrivateKey);

		const result = await client.$fetch("/oauth2/token", {
			method: "POST",
			body: new URLSearchParams({
				grant_type: "authorization_code",
				code,
				redirect_uri: redirectUri,
				client_id: assertionClient.client_id,
				client_assertion_type:
					"urn:ietf:params:oauth:client-assertion-type:jwt-bearer",
				client_assertion: manualAssertion,
				code_verifier: codeVerifier,
			}),
			headers: { "content-type": "application/x-www-form-urlencoded" },
		});

		expect(result.error?.status).toBeGreaterThanOrEqual(400);
		expect(result.error?.status).toBeLessThan(500);
	});

	it("should enforce auth method — secret client cannot use assertion", async () => {
		const codeVerifier = generateRandomString(32);
		const code = await getAuthCode(secretClient.client_id, codeVerifier);
		// Sign assertion for the secret-based client
		const assertion = await signAssertion({ clientId: secretClient.client_id });

		const result = await client.$fetch("/oauth2/token", {
			method: "POST",
			body: new URLSearchParams({
				grant_type: "authorization_code",
				code,
				redirect_uri: redirectUri,
				client_id: secretClient.client_id,
				client_assertion_type:
					"urn:ietf:params:oauth:client-assertion-type:jwt-bearer",
				client_assertion: assertion,
				code_verifier: codeVerifier,
			}),
			headers: { "content-type": "application/x-www-form-urlencoded" },
		});

		expect(result.error?.status).toBeGreaterThanOrEqual(400);
		expect(result.error?.status).toBeLessThan(500);
	});

	it.each([
		{
			name: "issuer audience array",
			audience: [customIssuer, "https://unrelated.example.com/introspect"],
		},
		{ name: "endpoint audience", audience: introspectEndpoint },
	])(
		"should introspect an access token using private_key_jwt with $name",
		async ({ audience }) => {
			const codeVerifier = generateRandomString(32);
			const code = await getAuthCode(assertionClient.client_id, codeVerifier);
			const tokens = await exchangeCodeForTokens({
				code,
				codeVerifier,
				assertion: await signAssertion(),
			});
			expect(tokens.data?.access_token).toBeDefined();

			const result = await client.$fetch<{
				active?: boolean;
				client_id?: string;
			}>("/oauth2/introspect", {
				method: "POST",
				body: new URLSearchParams({
					client_id: assertionClient.client_id,
					client_assertion_type:
						"urn:ietf:params:oauth:client-assertion-type:jwt-bearer",
					client_assertion: await signAssertion({ aud: audience }),
					token: tokens.data?.access_token ?? "",
					token_type_hint: "access_token",
				}),
				headers: { "content-type": "application/x-www-form-urlencoded" },
			});

			expect(result.data?.active).toBe(true);
			expect(result.data?.client_id).toBe(assertionClient.client_id);
		},
	);

	it.each([
		{ name: "issuer audience", audience: customIssuer },
		{ name: "endpoint audience", audience: revokeEndpoint },
	])(
		"should revoke a refresh token using private_key_jwt with $name",
		async ({ audience }) => {
			const codeVerifier = generateRandomString(32);
			const code = await getAuthCode(assertionClient.client_id, codeVerifier, [
				"openid",
				"profile",
				"offline_access",
			]);
			const tokens = await exchangeCodeForTokens({
				code,
				codeVerifier,
				assertion: await signAssertion(),
			});
			expect(tokens.data?.refresh_token).toBeDefined();

			const result = await client.$fetch("/oauth2/revoke", {
				method: "POST",
				body: new URLSearchParams({
					client_id: assertionClient.client_id,
					client_assertion_type:
						"urn:ietf:params:oauth:client-assertion-type:jwt-bearer",
					client_assertion: await signAssertion({ aud: audience }),
					token: tokens.data?.refresh_token ?? "",
					token_type_hint: "refresh_token",
				}),
				headers: { "content-type": "application/x-www-form-urlencoded" },
			});

			expect(result.data).toBe(null);
			expect(result.error).toBe(null);
		},
	);
});

describe("isPrivateHostname", () => {
	it("should block standard private IPv4 ranges", () => {
		expect(isPrivateHostname("127.0.0.1")).toBe(true);
		expect(isPrivateHostname("10.0.0.1")).toBe(true);
		expect(isPrivateHostname("192.168.1.1")).toBe(true);
		expect(isPrivateHostname("172.16.0.1")).toBe(true);
		expect(isPrivateHostname("169.254.169.254")).toBe(true);
	});

	it("should block localhost and IPv6 loopback", () => {
		expect(isPrivateHostname("localhost")).toBe(true);
		expect(isPrivateHostname("::1")).toBe(true);
		expect(isPrivateHostname("[::1]")).toBe(true);
	});

	it("should block link-local and unique-local IPv6", () => {
		expect(isPrivateHostname("[fe80::1]")).toBe(true);
		expect(isPrivateHostname("fe80::1")).toBe(true);
		expect(isPrivateHostname("[fd00::1]")).toBe(true);
		expect(isPrivateHostname("[fc00::1]")).toBe(true);
	});

	it("should block IPv4-mapped IPv6 addresses with private IPv4", () => {
		expect(isPrivateHostname("[::ffff:127.0.0.1]")).toBe(true);
		expect(isPrivateHostname("::ffff:127.0.0.1")).toBe(true);
		expect(isPrivateHostname("[::ffff:169.254.169.254]")).toBe(true);
		expect(isPrivateHostname("[::ffff:10.0.0.1]")).toBe(true);
		expect(isPrivateHostname("[::ffff:192.168.1.1]")).toBe(true);
	});

	it("should NOT block legitimate DNS hostnames starting with fc/fd/fe", () => {
		expect(isPrivateHostname("fd-services.com")).toBe(false);
		expect(isPrivateHostname("fc-platform.example.com")).toBe(false);
		expect(isPrivateHostname("february.example.com")).toBe(false);
		expect(isPrivateHostname("fe80.example.com")).toBe(false);
	});

	it("should NOT block public IPv4 addresses", () => {
		expect(isPrivateHostname("8.8.8.8")).toBe(false);
		expect(isPrivateHostname("1.1.1.1")).toBe(false);
	});

	it("should NOT block IPv4-mapped IPv6 with public IPv4", () => {
		expect(isPrivateHostname("[::ffff:8.8.8.8]")).toBe(false);
	});

	it("should block IPv4-mapped IPv6 written in hex", () => {
		// ::ffff:7f00:1 == 127.0.0.1, ::ffff:a9fe:a9fe == 169.254.169.254 (IMDS)
		expect(isPrivateHostname("[::ffff:7f00:1]")).toBe(true);
		expect(isPrivateHostname("[::ffff:a9fe:a9fe]")).toBe(true);
	});

	it("should block NAT64 and 6to4 tunnels to private targets", () => {
		expect(isPrivateHostname("[64:ff9b::7f00:1]")).toBe(true); // NAT64 -> 127.0.0.1
		expect(isPrivateHostname("[2002:a9fe:a9fe::]")).toBe(true); // 6to4 -> IMDS
	});

	it("should block shared address space (carrier-grade NAT)", () => {
		expect(isPrivateHostname("100.64.0.1")).toBe(true);
	});

	it("should block cloud metadata endpoints", () => {
		expect(isPrivateHostname("metadata.google.internal")).toBe(true);
		expect(isPrivateHostname("metadata.goog")).toBe(true);
		expect(isPrivateHostname("instance-data")).toBe(true);
	});
});

describe("private_key_jwt registration validation", async () => {
	const authServerBaseUrl = "http://localhost:3001";
	const { auth, signInWithTestUser } = await getTestInstance({
		baseURL: authServerBaseUrl,
		trustedOrigins: ["https://trusted.example.com"],
		plugins: [
			jwt({ jwt: { issuer: authServerBaseUrl } }),
			oauthProvider({
				loginPage: "/login",
				consentPage: "/consent",
			}),
		],
	});
	const { headers } = await signInWithTestUser();

	it("should reject registration with both jwks and jwks_uri", async () => {
		const result = await auth.api.adminCreateOAuthClient({
			headers,
			body: {
				redirect_uris: ["https://example.com/callback"],
				token_endpoint_auth_method: "private_key_jwt",
				jwks: {
					keys: [{ kty: "RSA", n: "test", e: "test-exponent" }],
				},
				jwks_uri: "https://example.com/.well-known/jwks.json",
			},
			asResponse: true,
		});
		expect(result.status).toBeGreaterThanOrEqual(400);
	});

	it("should reject registration without jwks or jwks_uri", async () => {
		const result = await auth.api.adminCreateOAuthClient({
			headers,
			body: {
				redirect_uris: ["https://example.com/callback"],
				token_endpoint_auth_method: "private_key_jwt",
			},
			asResponse: true,
		});
		expect(result.status).toBeGreaterThanOrEqual(400);
	});

	it("should reject jwks_uri with non-HTTPS scheme", async () => {
		const result = await auth.api.adminCreateOAuthClient({
			headers,
			body: {
				redirect_uris: ["https://example.com/callback"],
				token_endpoint_auth_method: "private_key_jwt",
				jwks_uri: "http://example.com/.well-known/jwks.json",
			},
			asResponse: true,
		});
		expect(result.status).toBeGreaterThanOrEqual(400);
	});

	it("should reject jwks_uri from an untrusted origin", async () => {
		const result = await auth.api.adminCreateOAuthClient({
			headers,
			body: {
				redirect_uris: ["https://example.com/callback"],
				token_endpoint_auth_method: "private_key_jwt",
				jwks_uri: "https://untrusted.example.com/.well-known/jwks.json",
			},
			asResponse: true,
		});
		expect(result.status).toBeGreaterThanOrEqual(400);
	});

	it("should accept jwks on client_secret clients", async () => {
		const result = await auth.api.adminCreateOAuthClient({
			headers,
			body: {
				redirect_uris: ["https://example.com/callback"],
				token_endpoint_auth_method: "client_secret_post",
				jwks: {
					keys: [{ kty: "RSA", n: "test", e: "test-exponent" }],
				},
			},
			asResponse: true,
		});
		expect(result.status).toBe(201);
	});
});
