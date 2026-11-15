import { createAuthEndpoint } from "better-auth/api";
import { generateRandomString } from "better-auth/crypto";
import { generateCodeChallenge } from "better-auth/oauth2";
import { jwt } from "better-auth/plugins/jwt";
import { getTestInstance } from "better-auth/test";
import type { BetterAuthPlugin } from "better-auth/types";
import { beforeAll, describe, expect, it } from "vitest";
import { oauthProvider } from "./oauth";
import { getOAuthProviderApi } from "./token";
import type { StoredAuthorizationQuery } from "./types";
import type { OAuthClient } from "./types/oauth";

/**
 * @see https://github.com/better-auth/better-auth/issues/10414
 */
describe("provider.validateAuthorizationRequest", async () => {
	const authServerBaseUrl = "http://localhost:3000";
	const redirectUri = "https://client.example.com/callback";
	const resource = "https://api.example.com";

	const getProvider = (ctx: Parameters<typeof getOAuthProviderApi>[0]) =>
		getOAuthProviderApi(ctx, ctx.context.getPlugin("oauth-provider")!.options);

	// Stands in for the first request of a plugin's multi-request sign-in,
	// which runs before the user has a session.
	const validator = {
		id: "test-request-validator",
		endpoints: {
			testValidate: createAuthEndpoint(
				"/test/validate",
				{ method: "POST" },
				async (ctx) =>
					ctx.json(
						await getProvider(ctx).validateAuthorizationRequest({
							query: ctx.body as Record<string, unknown>,
						}),
					),
			),
		},
	} satisfies BetterAuthPlugin;

	const { auth, client, signInWithTestUser } = await getTestInstance({
		baseURL: `${authServerBaseUrl}/api/auth/`,
		advanced: { skipTrailingSlashes: true },
		plugins: [
			validator,
			jwt({ jwt: { issuer: authServerBaseUrl } }),
			oauthProvider({
				loginPage: "/login",
				consentPage: "/consent",
				scopes: ["openid", "profile", "email", "offline_access"],
				resources: [resource],
				enforcePerClientResources: false,
				pushedAuthorizationRequests: { enabled: true },
			}),
		],
	});
	const { headers } = await signInWithTestUser();
	const context = await auth.$context;

	let confidentialClient: OAuthClient;
	beforeAll(async () => {
		confidentialClient = await auth.api.adminCreateOAuthClient({
			headers,
			body: {
				client_name: "Example App",
				grant_types: ["authorization_code"],
				redirect_uris: [redirectUri],
				token_endpoint_auth_method: "client_secret_post",
				skip_consent: true,
			},
		});
	});

	async function requestQuery(extra: Record<string, unknown> = {}) {
		return {
			response_type: "code",
			client_id: confidentialClient.client_id,
			code_challenge: await generateCodeChallenge(generateRandomString(43)),
			code_challenge_method: "S256",
			...extra,
		} as Record<string, unknown>;
	}

	type Validated = {
		query: StoredAuthorizationQuery;
		client: Record<string, unknown>;
		status?: number;
		body?: { error?: string; error_description?: string };
	};

	async function validate(query: Record<string, unknown>) {
		const result = await client.$fetch<Validated>("/test/validate", {
			method: "POST",
			body: query,
		});
		if (result.error) {
			return {
				status: result.error.status,
				body: result.error as Validated["body"],
			} as Validated;
		}
		return result.data!;
	}

	/** The `error` that `/oauth2/authorize` reports for `query`. */
	async function authorizeError(query: Record<string, unknown>) {
		let location = "";
		await client.$fetch(
			`/oauth2/authorize?${new URLSearchParams(
				Object.entries(query).map(([key, value]) => [key, String(value)]),
			).toString()}`,
			{
				headers,
				onError(ctx) {
					location = ctx.response.headers.get("location") ?? "";
				},
			},
		);
		return new URL(location, authServerBaseUrl).searchParams.get("error");
	}

	async function countVerificationRows() {
		return context.adapter.count({ model: "verification" });
	}

	it("returns the normalized query and a public view of the client", async () => {
		const query = await requestQuery({ redirect_uri: redirectUri });
		const validated = await validate(query);
		expect(validated.query).toEqual({
			...query,
			scope: "openid profile email offline_access",
		});
		expect(validated.client).toEqual({
			clientId: confidentialClient.client_id,
			name: "Example App",
			tokenEndpointAuthMethod: "client_secret_post",
			applicationType: "web",
		});
	});

	it("accepts a request without redirect_uri", async () => {
		const validated = await validate(await requestQuery({ scope: "openid" }));
		expect(validated.query.redirect_uri).toBeUndefined();
		expect(validated.query.scope).toBe("openid");
	});

	it("leaves client credentials out of the returned query", async () => {
		const validated = await validate(
			await requestQuery({
				client_secret: confidentialClient.client_secret,
				client_assertion: "assertion",
				client_assertion_type:
					"urn:ietf:params:oauth:client-assertion-type:jwt-bearer",
			}),
		);
		expect(validated.query).not.toHaveProperty("client_secret");
		expect(validated.query).not.toHaveProperty("client_assertion");
		expect(validated.query).not.toHaveProperty("client_assertion_type");
	});

	it("does not authenticate the client", async () => {
		const validated = await validate(await requestQuery());
		expect(validated.status).toBeUndefined();
	});

	it.each([
		{ name: "an unknown client", extra: { client_id: "unknown" } },
		{ name: "an unregistered scope", extra: { scope: "openid admin" } },
		{
			name: "a missing PKCE challenge",
			extra: { code_challenge: undefined, code_challenge_method: undefined },
		},
		{ name: "an unknown resource", extra: { resource: "https://other.test" } },
		{
			name: "claims without openid",
			extra: { scope: "profile", claims: "{}" },
		},
		{
			name: "an unregistered redirect_uri",
			extra: { redirect_uri: "https://evil.example.com/callback" },
		},
	])("throws the /oauth2/authorize error for $name", async ({ extra }) => {
		const query = Object.fromEntries(
			Object.entries(
				await requestQuery({ redirect_uri: redirectUri, ...extra }),
			).filter(([, value]) => value !== undefined),
		);
		const expected = await authorizeError(query);
		expect(expected).toBeTruthy();
		const validated = await validate(query);
		expect(validated.status).toBe(400);
		expect(validated.body?.error).toBe(expected);
	});

	it("requires client_id", async () => {
		const { client_id: _clientId, ...query } = await requestQuery();
		const validated = await validate(query);
		expect(validated.status).toBe(400);
		expect(validated.body?.error).toBe("invalid_request");
	});

	it("rejects request_uri and request", async () => {
		const withRequestUri = await validate(
			await requestQuery({
				request_uri: "urn:ietf:params:oauth:request_uri:abc",
			}),
		);
		expect(withRequestUri.status).toBe(400);
		expect(withRequestUri.body?.error).toBe("invalid_request");

		const withRequest = await validate(
			await requestQuery({ request: "eyJhbGciOiJub25lIn0.e30." }),
		);
		expect(withRequest.status).toBe(400);
		expect(withRequest.body?.error).toBe("request_not_supported");
	});

	it("writes no rows", async () => {
		const before = await countVerificationRows();
		await validate(await requestQuery({ redirect_uri: redirectUri }));
		await validate(await requestQuery({ scope: "openid admin" }));
		expect(await countVerificationRows()).toBe(before);
	});
});

/**
 * @see https://github.com/better-auth/better-auth/issues/10414
 */
describe("provider.validateAuthorizationRequest before issueAuthorizationCode", async () => {
	const redirectUri = "https://client.example.com/callback";

	const getProvider = (ctx: Parameters<typeof getOAuthProviderApi>[0]) =>
		getOAuthProviderApi(ctx, ctx.context.getPlugin("oauth-provider")!.options);

	const flow = {
		id: "test-two-round-flow",
		endpoints: {
			testFirstRound: createAuthEndpoint(
				"/test/first-round",
				{ method: "POST" },
				async (ctx) => {
					const { query } = await getProvider(ctx).validateAuthorizationRequest(
						{
							query: ctx.body as Record<string, unknown>,
						},
					);
					return ctx.json({ query });
				},
			),
			testLastRound: createAuthEndpoint(
				"/test/last-round",
				{ method: "POST" },
				async (ctx) => {
					const { query, userId } = ctx.body as {
						query: StoredAuthorizationQuery;
						userId: string;
					};
					const user = await ctx.context.internalAdapter.findUserById(userId);
					const session =
						await ctx.context.internalAdapter.createSession(userId);
					const issued = await getProvider(ctx).issueAuthorizationCode({
						query,
						session: { session, user: user! },
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
			flow,
			jwt({ jwt: { issuer: "http://localhost:3000" } }),
			oauthProvider({ loginPage: "/login", consentPage: "/consent" }),
		],
	});
	const { headers, user } = await signInWithTestUser();

	it("returns a query that issueAuthorizationCode accepts unchanged", async () => {
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
		const first = await client.$fetch<{ query: StoredAuthorizationQuery }>(
			"/test/first-round",
			{
				method: "POST",
				body: {
					response_type: "code",
					client_id: publicClient.client_id,
					scope: "openid",
					code_challenge: await generateCodeChallenge(generateRandomString(43)),
					code_challenge_method: "S256",
				},
			},
		);
		expect(first.error).toBeNull();
		const last = await client.$fetch<{ code: string }>("/test/last-round", {
			method: "POST",
			body: { query: first.data!.query, userId: user.id },
		});
		expect(last.error).toBeNull();
		expect(last.data!.code).toEqual(expect.any(String));
	});
});
