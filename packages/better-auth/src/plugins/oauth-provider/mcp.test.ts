import { describe, it, expect } from "vitest";
import { getTestInstance } from "../../test-utils/test-instance";
import { oauthProvider, type OAuthOptions } from ".";
import { jwt } from "../jwt";
import { createAuthClient, type BetterAuthClientPlugin } from "../../client";
import { createAuthEndpoint, sessionMiddleware } from "../../api";
import type { BetterAuthPlugin } from "..";
import type { JwtOptions } from "../jwt";
import { signJWT } from "../jwt/sign";
import { oauthProviderClient } from "./client";
import { checkMcp, handleMcpErrors } from "./mcp";
import { generateKeyPair, SignJWT } from "jose";
import { generateRandomString } from "../../crypto";
import { storeToken } from "./utils";

/**
 * Tester plugin helps that converts session tokens to Jwt tokens
 * at '/token'. We do this, so we don't need the whole auth process.
 *
 * Obtained from the '/token' function seen in the jwt plugin which is disabled
 * when usesOidcProviderPlugin = true
 */
const testJwtHelperPlugin = (options?: JwtOptions, index?: number) => {
	return {
		id: `jwt-test-helper${index ?? ""}`,
		endpoints: {
			[`getToken${index ?? ""}`]: createAuthEndpoint(
				`/helper/token${index ?? ""}`,
				{
					method: "GET",
					requireHeaders: true,
					use: [sessionMiddleware],
				},
				async (ctx) => {
					// Convert context into user payload
					let payload: Record<string, any>;
					if (options?.jwt?.definePayload) {
						payload = await options?.jwt.definePayload(ctx.context.session!);
					} else {
						payload = {
							...ctx.context.session?.user,
							id: undefined,
							sub: ctx.context.session?.user.id,
						};
					}

					// Convert into jwt token
					const jwt = await signJWT(ctx, {
						payload,
						options,
					});
					return ctx.json({
						token: jwt,
					});
				},
			),
		},
	} satisfies BetterAuthPlugin;
};

const testJwtHelperClient = (index?: number) => {
	return {
		id: `jwt-test-helper-client${index ?? ""}`,
		$InferServerPlugin: {} as ReturnType<typeof testJwtHelperPlugin>,
	} satisfies BetterAuthClientPlugin;
};

/**
 * Tester plugin helps that converts session tokens to Jwt tokens
 * at '/token'. We do this, so we don't need the whole auth process.
 *
 * Obtained from the '/token' function seen in the jwt plugin which is disabled
 * when usesOidcProviderPlugin = true
 */
const testOpaqueHelperPlugin = (opts?: OAuthOptions, index?: number) => {
	return {
		id: `opaque-test-helper${index ?? ""}`,
		endpoints: {
			[`getOpaqueToken${index ?? ""}`]: createAuthEndpoint(
				`/helper/opaque-token${index ?? ""}`,
				{
					method: "GET",
					requireHeaders: true,
					use: [sessionMiddleware],
				},
				async (ctx) => {
					const iat = Math.floor(Date.now() / 1000);
					const expiresIn = opts?.accessTokenExpiresIn ?? 3600;
					const exp = iat + expiresIn;
					const opaque = generateRandomString(32, "A-Z", "a-z");
					await ctx.context.adapter.create({
						model: "oauthAccessToken",
						data: {
							token: await storeToken(opts?.storeTokens, opaque),
							clientId: ctx.query?.clientId,
							scopes: ctx.query?.scope?.split(" "),
							createdAt: new Date(iat * 1000),
							expiresAt: new Date(exp * 1000),
						},
					});

					return ctx.json({
						token: opaque,
					});
				},
			),
		},
	} satisfies BetterAuthPlugin;
};

const testOpaqueHelperClient = (index?: number) => {
	return {
		id: `opaque-test-helper-client${index ?? ""}`,
		$InferServerPlugin: {} as ReturnType<typeof testJwtHelperPlugin>,
	} satisfies BetterAuthClientPlugin;
};

describe("mcp - checkMcp", async () => {
	const authServerBaseUrl = "http://localhost:3000";
	const apiServerBaseUrl = "http://localhost:5000";
	const providerId = "test";
	const redirectUri = `${apiServerBaseUrl}/api/auth/oauth2/callback/${providerId}`;

	const { auth, signInWithTestUser, testUser, customFetchImpl } =
		await getTestInstance({
			baseURL: authServerBaseUrl,
			plugins: [
				jwt(),
				oauthProvider({
					loginPage: "/login",
					consentPage: "/consent",
					allowDynamicClientRegistration: true,
				}),
				testJwtHelperPlugin(),
				testJwtHelperPlugin(
					{
						jwt: {
							audience: "https://api-1.example.com",
						},
					},
					1,
				),
				testOpaqueHelperPlugin(),
			],
		});

	const { headers } = await signInWithTestUser();
	const client = createAuthClient({
		plugins: [
			testJwtHelperClient(),
			oauthProviderClient(),
			testOpaqueHelperClient(),
		],
		baseURL: authServerBaseUrl,
		fetchOptions: {
			customFetchImpl,
			headers,
		},
	});

	it("should fail without access token", async () => {
		try {
			await checkMcp({
				// @ts-expect-error
				auth,
				baseUrl: apiServerBaseUrl,
			});
			expect.unreachable();
		} catch (error) {
			expect(() =>
				handleMcpErrors(error, {
					baseUrl: authServerBaseUrl,
				}),
			).not.toThrow();
			const res = handleMcpErrors(error, {
				baseUrl: authServerBaseUrl,
			});
			expect(res.status).toBe(400);
		}
	});

	let jwtSub: string | undefined;
	it("should pass with valid jwt access token", async () => {
		const response = await client.$fetch<{
			token: string;
		}>("/helper/token", {
			headers,
		});
		const accessToken = response.data?.token;
		expect(accessToken).toBeDefined();

		const tokens = await checkMcp({
			// @ts-expect-error
			auth,
			accessToken,
			baseUrl: apiServerBaseUrl,
		});

		expect(tokens.jwt?.sub).toBeDefined();
		expect(tokens.jwt?.name).toBe(testUser.name);
		expect(tokens.jwt?.email).toBe(testUser.email);

		jwtSub = tokens.jwt?.sub;
	});

	it("should fail with valid jwt token but different audience", async () => {
		const response = await client.$fetch<{
			token: string;
		}>("/helper/token1", {
			headers,
		});
		const accessToken = response.data?.token;
		expect(accessToken).toBeDefined();

		try {
			await checkMcp({
				// @ts-expect-error
				auth,
				accessToken,
				baseUrl: apiServerBaseUrl,
			});
			expect.unreachable();
		} catch (error) {
			expect(() =>
				handleMcpErrors(error, {
					baseUrl: authServerBaseUrl,
				}),
			).not.toThrow();
			const res = handleMcpErrors(error, {
				baseUrl: authServerBaseUrl,
			});
			expect(res?.headers.get("WWW-Authenticate")).toBe(
				`Bearer resource_metadata="${authServerBaseUrl}/.well-known/oauth-authorization-server"`,
			);
			const body = await res?.text();
			expect(body).toBe("jwt invalid due to audience or issuer mismatch");
			return;
		}
	});

	it("should fail with invalid/mocked access with different signature", async () => {
		const { privateKey } = await generateKeyPair("EdDSA", {
			crv: "Ed25519",
			extractable: true,
		});
		const accessToken = await new SignJWT({
			sub: jwtSub,
			name: testUser.name,
			email: testUser.email,
		})
			.setProtectedHeader({
				alg: "EdDSA",
				kid: "1234",
				typ: "JWT",
			})
			.setIssuedAt(new Date())
			.setIssuer(authServerBaseUrl)
			.setAudience(authServerBaseUrl)
			.setExpirationTime("15m")
			.sign(privateKey);
		expect(accessToken).toBeDefined();

		try {
			await checkMcp({
				// @ts-expect-error
				auth,
				accessToken,
				baseUrl: apiServerBaseUrl,
			});
			expect.unreachable();
		} catch (error) {
			expect(() =>
				handleMcpErrors(error, {
					baseUrl: authServerBaseUrl,
				}),
			).not.toThrow();
			const res = handleMcpErrors(error, {
				baseUrl: authServerBaseUrl,
			});
			expect(res?.headers.get("WWW-Authenticate")).toBe(
				`Bearer resource_metadata="${authServerBaseUrl}/.well-known/oauth-authorization-server"`,
			);
			const body = await res?.text();
			expect(body).toBe("no matching key in jwks");
			return;
		}
	});

	it("should fail scope check with jwt token", async () => {
		const response = await client.$fetch<{
			token: string;
		}>("/helper/token", {
			headers,
		});
		const accessToken = response.data?.token;
		expect(accessToken).toBeDefined();

		try {
			const tokens = await checkMcp({
				// @ts-expect-error
				auth,
				accessToken,
				baseUrl: apiServerBaseUrl,
				scopes: ["read:profile"],
			});
			expect.unreachable();
		} catch (error) {
			expect(() =>
				handleMcpErrors(error, {
					baseUrl: authServerBaseUrl,
				}),
			).not.toThrow();
			const res = handleMcpErrors(error, {
				baseUrl: authServerBaseUrl,
			});
			expect(res.status).toBe(403);
		}
	});

	it("should pass with opaque token", async () => {
		const scopes = ["openid", "profile", "email"];
		const createdClient = await client.oauth2.register({
			redirect_uris: [redirectUri],
			scope: scopes.join(" "),
		});
		expect(createdClient.data?.client_id).toBeDefined();
		expect(createdClient.data?.client_secret).toBeDefined();

		const searchParams = new URLSearchParams({
			clientId: createdClient.data!.client_id,
			scope: scopes.join(" "),
		});
		const response = await client.$fetch<{
			token: string;
		}>(`/helper/opaque-token?${searchParams.toString()}`, {
			headers,
		});
		const accessToken = response.data?.token;
		expect(accessToken).toBeDefined();

		try {
			const tokens = await checkMcp({
				// @ts-expect-error
				auth,
				accessToken,
				baseUrl: apiServerBaseUrl,
				clientId: createdClient.data!.client_id,
				clientSecret: createdClient.data!.client_secret!,
				scopes,
			});
			expect(tokens.jwt).toMatchObject({
				active: true,
				iss: authServerBaseUrl,
				client_id: createdClient.data?.client_id,
				iat: expect.any(Number),
				exp: expect.any(Number),
				scope: scopes.join(" "),
			});
		} catch (error) {
			expect.unreachable();
		}
	});

	it("should fail scope check with opaque token", async () => {
		const scopes = ["openid", "profile", "email"];
		const createdClient = await client.oauth2.register({
			redirect_uris: [redirectUri],
			scope: scopes.join(" "),
		});
		expect(createdClient.data?.client_id).toBeDefined();
		expect(createdClient.data?.client_secret).toBeDefined();

		const searchParams = new URLSearchParams({
			clientId: createdClient.data!.client_id,
			scope: scopes.join(" "),
		});
		const response = await client.$fetch<{
			token: string;
		}>(`/helper/opaque-token?${searchParams.toString()}`, {
			headers,
		});
		const accessToken = response.data?.token;
		expect(accessToken).toBeDefined();

		try {
			await checkMcp({
				// @ts-expect-error
				auth,
				accessToken,
				baseUrl: apiServerBaseUrl,
				clientId: createdClient.data!.client_id,
				clientSecret: createdClient.data!.client_secret!,
				scopes: ["read:profile"],
			});
			expect.unreachable();
		} catch (error) {
			expect(() =>
				handleMcpErrors(error, {
					baseUrl: authServerBaseUrl,
				}),
			).not.toThrow();
			const res = handleMcpErrors(error, {
				baseUrl: authServerBaseUrl,
			});
			expect(res.status).toBe(403);
		}
	});
});
