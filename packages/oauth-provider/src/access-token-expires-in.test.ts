import { generateRandomString } from "better-auth/crypto";
import {
	authorizationCodeRequest,
	createAuthorizationURL,
	refreshAccessTokenRequest,
} from "better-auth/oauth2";
import { jwt } from "better-auth/plugins/jwt";
import { getTestInstance } from "better-auth/test";
import type { BetterAuthOptions, BetterAuthPlugin } from "better-auth/types";
import { decodeJwt } from "jose";
import { afterEach, describe, expect, it, vi } from "vitest";
import { oauthProviderClient } from "./client";
import { extendOAuthProvider } from "./extensions";
import { oauthProvider } from "./oauth";
import type { AccessTokenExpiresInContext, OAuthOptions, Scope } from "./types";

const authServerBaseUrl = "http://localhost:3000";
const validResource = "https://myapi.example.com";
const redirectUri = "http://localhost:5000/api/auth/oauth2/callback/test";
const extensionGrant = "urn:example:params:grant-type:lifetime-test";
const formHeaders = {
	accept: "application/json",
	"content-type": "application/x-www-form-urlencoded",
};

/** An extension grant that issues tokens directly, as CIBA does. */
const issueDirectly = {
	id: "issue-directly",
	init(ctx) {
		extendOAuthProvider(ctx, {
			grants: {
				[extensionGrant]: async ({ ctx, provider }) => {
					const { client } = await provider.authenticateClient({});
					const found = await ctx.context.internalAdapter.findUserByEmail(
						(ctx.body as { login_hint: string }).login_hint,
					);
					return provider.issueTokens({
						client,
						scopes: ["openid"],
						user: found!.user,
						resources: [validResource],
					});
				},
			},
		});
	},
} satisfies BetterAuthPlugin;

function createSecondaryStorage() {
	const store = new Map<string, string>();
	const ttls = new Map<string, number | undefined>();
	const expiresAt = new Map<string, number>();
	const read = (key: string) =>
		(expiresAt.get(key) ?? Number.POSITIVE_INFINITY) > Date.now()
			? (store.get(key) ?? null)
			: null;
	return {
		store,
		ttls,
		storage: {
			set(key: string, value: string, ttl?: number) {
				store.set(key, value);
				ttls.set(key, ttl);
				if (ttl) expiresAt.set(key, Date.now() + ttl * 1000);
			},
			get: read,
			getAndDelete(key: string) {
				const value = read(key);
				store.delete(key);
				return value;
			},
			increment(key: string) {
				const count = Number(store.get(key) ?? 0) + 1;
				store.set(key, String(count));
				return count;
			},
			delete(key: string) {
				store.delete(key);
			},
		},
	};
}

async function setup(
	providerOptions?: Partial<OAuthOptions<Scope[]>>,
	authOptions?: Partial<BetterAuthOptions>,
) {
	const { auth, client, signInWithTestUser, testUser } = await getTestInstance(
		{
			baseURL: authServerBaseUrl,
			...authOptions,
			plugins: [
				jwt({ jwt: { issuer: authServerBaseUrl } }),
				oauthProvider({
					loginPage: "/login",
					consentPage: "/consent",
					resources: [validResource],
					enforcePerClientResources: false,
					...providerOptions,
				}),
				issueDirectly,
			],
		},
		{ clientOptions: { plugins: [oauthProviderClient()] } },
	);
	const { headers } = await signInWithTestUser();
	const oauthClient = await auth.api.adminCreateOAuthClient({
		headers,
		body: {
			redirect_uris: [redirectUri],
			application_type: "native",
			token_endpoint_auth_method: "client_secret_post",
			grant_types: ["authorization_code", "refresh_token", extensionGrant],
			scope: "openid profile email offline_access",
			skip_consent: true,
		},
	});
	return { auth, client, headers, testUser, oauthClient };
}

type TestServer = Awaited<ReturnType<typeof setup>>;

interface TokenResponse {
	access_token: string;
	refresh_token?: string;
	expires_in: number;
}

/** Gets an authorization code without redeeming it. */
async function authorizeCode(
	{ client, headers, oauthClient }: TestServer,
	{ offline = false }: { offline?: boolean } = {},
) {
	const options = {
		clientId: oauthClient.client_id,
		clientSecret: oauthClient.client_secret!,
		redirectURI: redirectUri,
	};
	const codeVerifier = generateRandomString(32);
	const authUrl = await createAuthorizationURL({
		id: "test",
		options,
		redirectURI: "",
		authorizationEndpoint: `${authServerBaseUrl}/api/auth/oauth2/authorize`,
		state: "123",
		scopes: ["openid", ...(offline ? ["offline_access"] : [])],
		codeVerifier,
	});
	let callbackRedirectUrl = "";
	await client.$fetch(authUrl.toString(), {
		headers,
		onError(context) {
			callbackRedirectUrl = context.response.headers.get("Location") || "";
		},
	});
	const code = new URL(callbackRedirectUrl).searchParams.get("code")!;
	return async (resource?: string) => {
		const { body, headers: tokenHeaders } = await authorizationCodeRequest({
			code,
			codeVerifier,
			redirectURI: redirectUri,
			resource,
			options,
		});
		return client.$fetch<TokenResponse>("/oauth2/token", {
			method: "POST",
			body,
			headers: tokenHeaders,
		});
	};
}

async function authorize(
	server: TestServer,
	{ offline = false, resource }: { offline?: boolean; resource?: string } = {},
) {
	const redeem = await authorizeCode(server, { offline });
	return (await redeem(resource)).data!;
}

function requestRefresh(
	{ client, oauthClient }: TestServer,
	refreshToken: string,
) {
	return refreshAccessTokenRequest({
		refreshToken,
		options: {
			clientId: oauthClient.client_id,
			clientSecret: oauthClient.client_secret!,
			redirectURI: redirectUri,
		},
	}).then(({ body, headers }) =>
		client.$fetch<TokenResponse>("/oauth2/token", {
			method: "POST",
			body,
			headers,
		}),
	);
}

async function isActive({ client, oauthClient }: TestServer, token: string) {
	const res = await client.oauth2.introspect(
		{
			client_id: oauthClient.client_id,
			client_secret: oauthClient.client_secret,
			token,
		},
		{ headers: formHeaders },
	);
	return res.data?.active;
}

async function revoke({ client, oauthClient }: TestServer, token: string) {
	const res = await client.oauth2.revoke(
		{
			client_id: oauthClient.client_id,
			client_secret: oauthClient.client_secret,
			token,
		},
		{ headers: formHeaders },
	);
	expect(res.error).toBe(null);
}

async function issueDirectGrant({ auth, oauthClient, testUser }: TestServer) {
	const response = await auth.handler(
		new Request(`${authServerBaseUrl}/api/auth/oauth2/token`, {
			method: "POST",
			headers: { "content-type": "application/x-www-form-urlencoded" },
			body: new URLSearchParams({
				grant_type: extensionGrant,
				client_id: oauthClient.client_id,
				client_secret: oauthClient.client_secret!,
				login_hint: testUser.email,
			}),
		}),
	);
	return {
		status: response.status,
		body: (await response.json()) as TokenResponse,
	};
}

/** Moves the clock forward without waiting. */
function advanceClock(seconds: number) {
	vi.useFakeTimers({ toFake: ["Date"] });
	vi.setSystemTime(Date.now() + seconds * 1000);
}

afterEach(() => {
	vi.useRealTimers();
});

describe("oauth-provider - accessTokenExpiresIn as a function", async () => {
	it("passes the grant's user, client, scopes, and grant type, and nothing else", async () => {
		const seen: unknown[] = [];
		const server = await setup({
			accessTokenExpiresIn: (context) => {
				seen.push(context);
				return 1800;
			},
		});

		await authorize(server);

		expect(seen).toHaveLength(1);
		const context = seen[0] as AccessTokenExpiresInContext;
		expect(Object.keys(context).sort()).toEqual([
			"client",
			"grantType",
			"scopes",
			"user",
		]);
		expect(context.user.email).toBe(server.testUser.email);
		expect(context.client.clientId).toBe(server.oauthClient.client_id);
		expect(context.scopes).toEqual(["openid"]);
		expect(context.grantType).toBe("authorization_code");
	});

	it("hands over copies, so changing them affects nothing else", async () => {
		const server = await setup({
			accessTokenExpiresIn: ({ scopes, user }) => {
				scopes.push("forged:scope");
				user.email = "forged@example.com";
				return 1800;
			},
		});

		const tokens = await authorize(server, { resource: validResource });

		expect(decodeJwt(tokens.access_token).scope).toBe("openid");
		expect(tokens.expires_in).toBe(1800);
		const ctx = await server.auth.$context;
		expect(
			(await ctx.internalAdapter.findUserByEmail(server.testUser.email))?.user,
		).toBeDefined();
	});

	it("decides again at each refresh", async () => {
		let lifetime = 1800;
		const server = await setup({ accessTokenExpiresIn: () => lifetime });
		const first = await authorize(server, { offline: true });
		expect(first.expires_in).toBe(1800);

		lifetime = 600;
		const refreshed = await requestRefresh(server, first.refresh_token!);

		expect(refreshed.data?.expires_in).toBe(600);
	});

	it("applies to tokens a plugin issues through issueTokens", async () => {
		const seen: (string | undefined)[] = [];
		const server = await setup({
			accessTokenExpiresIn: ({ grantType }) => {
				seen.push(grantType);
				return 900;
			},
		});

		const { status, body } = await issueDirectGrant(server);

		expect(status).toBe(200);
		expect(body.expires_in).toBe(900);
		const accessToken = decodeJwt(body.access_token);
		expect((accessToken.exp ?? 0) - (accessToken.iat ?? 0)).toBe(900);
		expect(seen).toEqual([extensionGrant]);
	});

	it("fails the token request when the resolver throws, and stores no token", async () => {
		const server = await setup({
			accessTokenExpiresIn: () => {
				throw new Error("lifetime policy unavailable");
			},
		});
		const redeem = await authorizeCode(server, { offline: true });

		const response = await redeem();

		expect(response.data).toBeNull();
		expect(response.error?.status).toBe(500);
		const ctx = await server.auth.$context;
		for (const model of ["oauthAccessToken", "oauthRefreshToken"]) {
			expect(
				await ctx.adapter.count({
					model,
					where: [{ field: "clientId", value: server.oauthClient.client_id }],
				}),
			).toBe(0);
		}
	});

	it("leaves client credentials to m2mAccessTokenExpiresIn", async () => {
		const resolver = vi.fn(() => 60);
		const server = await setup({
			accessTokenExpiresIn: resolver,
			m2mAccessTokenExpiresIn: 7200,
			scopes: ["openid", "profile", "email", "offline_access", "read:profile"],
			clientPrivileges: () => true,
		});
		const { auth } = server;
		const machine = await auth.api.adminCreateOAuthClient({
			headers: server.headers,
			body: {
				token_endpoint_auth_method: "client_secret_post",
				grant_types: ["client_credentials"],
				client_credentials_scopes: ["read:profile"],
			},
		});

		const response = await auth.handler(
			new Request(`${authServerBaseUrl}/api/auth/oauth2/token`, {
				method: "POST",
				headers: { "content-type": "application/x-www-form-urlencoded" },
				body: new URLSearchParams({
					grant_type: "client_credentials",
					client_id: machine.client_id,
					client_secret: machine.client_secret!,
					scope: "read:profile",
				}),
			}),
		);

		expect(((await response.json()) as TokenResponse).expires_in).toBe(7200);
		expect(resolver).not.toHaveBeenCalled();
	});

	it.each([
		{ label: "zero", value: 0, expected: 3600 },
		{ label: "below one second", value: 0.5, expected: 3600 },
		{ label: "negative", value: -60, expected: 3600 },
		{ label: "NaN", value: Number.NaN, expected: 3600 },
		{ label: "Infinity", value: Number.POSITIVE_INFINITY, expected: 3600 },
		{ label: "not a number", value: "1800" as never, expected: 3600 },
		{ label: "fractional", value: 1800.9, expected: 1800 },
	])(
		"turns a $label result into $expected seconds",
		async ({ value, expected }) => {
			const server = await setup({ accessTokenExpiresIn: () => value });

			const tokens = await authorize(server);

			expect(tokens.expires_in).toBe(expected);
		},
	);
});

describe("oauth-provider - accessTokenMaxExpiresIn bounds the resolver", async () => {
	it("lowers a result above the default bound to one hour", async () => {
		const server = await setup({ accessTokenExpiresIn: () => 7200 });

		const tokens = await authorize(server);

		expect(tokens.expires_in).toBe(3600);
	});

	it("lets the resolver return up to the declared bound", async () => {
		const server = await setup({
			accessTokenExpiresIn: () => 7200,
			accessTokenMaxExpiresIn: 7200,
		});

		const tokens = await authorize(server, { resource: validResource });

		expect(tokens.expires_in).toBe(7200);
		const accessToken = decodeJwt(tokens.access_token);
		expect((accessToken.exp ?? 0) - (accessToken.iat ?? 0)).toBe(7200);
	});

	it("falls back to the bound when it is below the default", async () => {
		const server = await setup({
			accessTokenExpiresIn: () => Number.NaN,
			accessTokenMaxExpiresIn: 600,
		});

		const tokens = await authorize(server);

		expect(tokens.expires_in).toBe(600);
	});

	it("is ignored when accessTokenExpiresIn is a number", async () => {
		const server = await setup({
			accessTokenExpiresIn: 7200,
			accessTokenMaxExpiresIn: 600,
		});

		const tokens = await authorize(server);

		expect(tokens.expires_in).toBe(7200);
	});

	it.each([0, -1, 1.5, Number.NaN, Number.MAX_SAFE_INTEGER])(
		"refuses %s at startup",
		(accessTokenMaxExpiresIn) => {
			expect(() =>
				oauthProvider({
					loginPage: "/login",
					consentPage: "/consent",
					accessTokenExpiresIn: () => 600,
					accessTokenMaxExpiresIn,
				}),
			).toThrow("accessTokenMaxExpiresIn must be a positive integer");
		},
	);
});

/**
 * A window that has to outlast every access token must not be sized from the
 * default when a resolver can issue a longer one.
 */
describe("oauth-provider - the windows that outlast a token follow the bound", async () => {
	it("keeps the grant revocation entry for the longest lifetime, not the default", async () => {
		const { store, ttls, storage } = createSecondaryStorage();
		const server = await setup(
			{
				accessTokenExpiresIn: () => 7200,
				accessTokenMaxExpiresIn: 7200,
				revocableJwtAccessTokens: true,
			},
			{
				secondaryStorage: storage,
				session: { storeSessionInDatabase: true },
			},
		);
		const grant = await authorize(server, {
			offline: true,
			resource: validResource,
		});
		const { grant_id: grantId } = decodeJwt(grant.access_token);
		expect(grantId).toBeDefined();
		await revoke(server, grant.refresh_token!);

		const key = [...store.keys()].find(
			(entry) =>
				entry.startsWith("verification:") && entry.includes(String(grantId)),
		);
		expect(key).toBeDefined();
		// The entry outlives a 2 hour token revoked in the second it was issued.
		expect(ttls.get(key!)).toBeGreaterThanOrEqual(7200);
		expect(ttls.get(key!)).toBeLessThanOrEqual(7201);

		// Past the one-hour default, and before the token's own expiry.
		advanceClock(4000);
		expect(await isActive(server, grant.access_token)).toBe(false);
	});

	it("keeps the record of a consumed code, so a reuse still revokes", async () => {
		const server = await setup({
			accessTokenExpiresIn: () => 7200,
			accessTokenMaxExpiresIn: 7200,
			refreshTokenExpiresIn: 600,
		});
		const redeem = await authorizeCode(server);
		const issued = (await redeem()).data!;
		expect(await isActive(server, issued.access_token)).toBe(true);

		// Past the default lifetime and the refresh lifetime, before the token's
		// own expiry.
		advanceClock(4000);
		const reuse = await redeem();

		expect(reuse.error?.status).toBe(400);
		expect(await isActive(server, issued.access_token)).toBe(false);
	});
});
