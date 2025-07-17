import { describe, expect } from "vitest";
import { getTestInstance } from "../../test-utils/test-instance";
import { createAuthClient } from "../../client";
import { jwtClient } from "./client";
import { jwt } from "./index";
import { createLocalJWKSet, jwtVerify, type JSONWebKeySet } from "jose";

describe("jwt", async (it) => {
	const { auth, signInWithTestUser } = await getTestInstance({
		plugins: [jwt()],
		logger: {
			level: "error",
		},
	});

	const { headers } = await signInWithTestUser();
	const client = createAuthClient({
		plugins: [jwtClient()],
		baseURL: "http://localhost:3000/api/auth",
		fetchOptions: {
			customFetchImpl: async (url, init) => {
				return auth.handler(new Request(url, init));
			},
		},
	});

	it("should receive token on client via header", async () => {
		let token: string | undefined;
		await client.getSession({
			fetchOptions: {
				headers,
				onSuccess(context) {
					token = context.response.headers.get("set-auth-jwt") || "";
				},
			},
		});
		expect(token).toBeDefined();
	});

	it("should get a token from api fetch", async () => {
		const response = await client.$fetch<{
			token: string;
		}>("/token", {
			headers,
		});
		expect(response.data?.token).toBeDefined();
	});

	it("should get /jwks", async () => {
		const response = await client.$fetch<JSONWebKeySet>("/jwks");
		const jwks = response?.data;
		expect(jwks).toBeDefined();
		expect(jwks?.keys.length).toBeGreaterThanOrEqual(1);
	});

	it("signed tokens can be validated with the JWKS", async () => {
		const response = await client.$fetch<{
			token: string;
		}>("/token", {
			headers,
		});
		const token = response.data?.token ?? undefined;
		expect(token).toBeDefined();

		const jwkResponse = await client.$fetch<JSONWebKeySet>("/jwks");
		const jwksData = jwkResponse?.data ?? undefined;
		expect(jwksData).toBeDefined();

		const jwks = createLocalJWKSet(jwksData!);
		expect(() => jwtVerify(token!, jwks)).not.toThrow();
		const decoded = await jwtVerify(token!, jwks);
		expect(decoded).toBeDefined();
	});

	it("should set subject to user id by default", async () => {
		let token: string | null | undefined;
		const userSession = await client.getSession({
			fetchOptions: {
				headers,
				onSuccess(context) {
					token = context.response.headers.get("set-auth-jwt");
				},
			},
		});
		expect(token).toBeDefined();

		const jwkResponse = await client.$fetch<JSONWebKeySet>("/jwks");
		const jwksData = jwkResponse?.data ?? undefined;
		expect(jwksData).toBeDefined();
		const jwks = createLocalJWKSet(jwksData!);

		const decoded = await jwtVerify(token!, jwks);
		expect(decoded.payload.sub).toBeDefined();
		expect(decoded.payload.sub).toBe(userSession.data?.user.id);
	});
});

describe("jwt - remote jwks", async (it) => {
	const { auth, signInWithTestUser } = await getTestInstance({
		plugins: [
			jwt({
				jwks: {
					remoteUrl: "https://example.com",
				},
			}),
		],
		logger: {
			level: "error",
		},
	});

	const { headers } = await signInWithTestUser();
	const client = createAuthClient({
		plugins: [jwtClient()],
		baseURL: "http://localhost:3000/api/auth",
		fetchOptions: {
			customFetchImpl: async (url, init) => {
				return auth.handler(new Request(url, init));
			},
		},
	});

	it("should receive token on client via header", async () => {
		let token: string | undefined;
		await client.getSession({
			fetchOptions: {
				headers,
				onSuccess(context) {
					token = context.response.headers.get("set-auth-jwt") || "";
				},
			},
		});
		expect(token).toBeDefined();
	});

	it("should get a token from api fetch", async () => {
		const response = await client.$fetch<{
			token: string;
		}>("/token", {
			headers,
		});
		expect(response.data?.token).toBeDefined();
	});

	it("should disable /jwks", async () => {
		const response = await client.$fetch<JSONWebKeySet>("/jwks");
		expect(response.error?.status).toBe(404);
	});
});

describe("jwt - remote signing", async (it) => {
	it("should fail if sign is defined and remoteUrl is not", async () => {
		expect(() =>
			getTestInstance({
				plugins: [
					jwt({
						jwt: {
							sign: (payload) => {
								return "123";
							},
						},
					}),
				],
				logger: {
					level: "error",
				},
			}),
		).toThrow();
	});
});

describe("jwt - oidc plugin", async (it) => {
	const { auth, signInWithTestUser } = await getTestInstance({
		plugins: [
			jwt({
				usesOidcProviderPlugin: true,
			}),
		],
		logger: {
			level: "error",
		},
	});

	const { headers } = await signInWithTestUser();
	const client = createAuthClient({
		plugins: [jwtClient()],
		baseURL: "http://localhost:3000/api/auth",
		fetchOptions: {
			customFetchImpl: async (url, init) => {
				return auth.handler(new Request(url, init));
			},
		},
	});

	it("should not receive token on client via header", async () => {
		let token: string | null | undefined;
		await client.getSession({
			fetchOptions: {
				headers,
				onSuccess(context) {
					token = context.response.headers.get("set-auth-jwt");
				},
			},
		});
		expect(token).toBeNull();
	});

	it("should disable /token", async () => {
		const response = await client.$fetch<{
			token: string;
		}>("/token", {
			headers,
		});
		expect(response.error?.status).toBe(404);
	});

	it("should enable /jwks", async () => {
		const response = await client.$fetch<JSONWebKeySet>("/jwks");
		const jwks = response?.data;
		expect(jwks).toBeDefined();
		expect(jwks?.keys.length).toBeGreaterThanOrEqual(1);
	});
});

describe("jwt - oidc plugin with remote url", async (it) => {
	const { auth, signInWithTestUser } = await getTestInstance({
		plugins: [
			jwt({
				usesOidcProviderPlugin: true,
				jwks: {
					remoteUrl: "https://example.com",
					keyPairConfig: {
						alg: "ES256",
					},
				},
			}),
		],
		logger: {
			level: "error",
		},
	});

	const { headers } = await signInWithTestUser();
	const client = createAuthClient({
		plugins: [jwtClient()],
		baseURL: "http://localhost:3000/api/auth",
		fetchOptions: {
			customFetchImpl: async (url, init) => {
				return auth.handler(new Request(url, init));
			},
		},
	});

	it("should require specifying the alg used", async () => {
		expect(() =>
			getTestInstance({
				plugins: [
					jwt({
						usesOidcProviderPlugin: true,
						jwks: {
							remoteUrl: "https://example.com",
						},
					}),
				],
				logger: {
					level: "error",
				},
			}),
		).toThrow();
	});

	it("should disable /jwks", async () => {
		const response = await client.$fetch<JSONWebKeySet>("/jwks");
		expect(response.error?.status).toBe(404);
	});
});
