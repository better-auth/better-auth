import type { GenericEndpointContext } from "@better-auth/core";
import { createAuthEndpoint } from "@better-auth/core/api";
import type { BetterAuthOptions, BetterAuthPlugin } from "better-auth";
import { generateRandomString } from "better-auth/crypto";
import {
	authorizationCodeRequest,
	createAuthorizationURL,
	refreshAccessTokenRequest,
} from "better-auth/oauth2";
import { jwt } from "better-auth/plugins/jwt";
import { getTestInstance } from "better-auth/test";
import { decodeJwt } from "jose";
import { describe, expect, it, vi } from "vitest";
import * as z from "zod";
import { oauthProviderClient } from "./client";
import { oauthProvider } from "./oauth";
import { getOAuthProviderApi } from "./token";
import type { OAuthOptions, Scope } from "./types";

const authServerBaseUrl = "http://localhost:3000";
const rpBaseUrl = "http://localhost:5000";
const validResource = "https://myapi.example.com";
const redirectUri = `${rpBaseUrl}/api/auth/oauth2/callback/test`;
const formHeaders = {
	accept: "application/json",
	"content-type": "application/x-www-form-urlencoded",
};

// Exposes the provider API's `validateAccessToken` to the test.
const validateProbe = {
	id: "test-validate-access-token",
	endpoints: {
		testValidateAccessToken: createAuthEndpoint(
			"/test/validate-access-token",
			{ method: "POST", body: z.object({ token: z.string() }) },
			async (ctx: GenericEndpointContext) => {
				const provider = getOAuthProviderApi(
					ctx,
					ctx.context.getPlugin("oauth-provider")!.options,
				);
				const payload = await provider.validateAccessToken(
					(ctx.body as { token: string }).token,
				);
				return ctx.json({ active: payload.active === true });
			},
		),
	},
} satisfies BetterAuthPlugin;

function createSecondaryStorage() {
	const store = new Map<string, string>();
	const ttls = new Map<string, number | undefined>();
	return {
		store,
		ttls,
		storage: {
			set(key: string, value: string, ttl?: number) {
				store.set(key, value);
				ttls.set(key, ttl);
			},
			get(key: string) {
				return store.get(key) ?? null;
			},
			getAndDelete(key: string) {
				const value = store.get(key) ?? null;
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
	testWith?: "sqlite" | "postgres" | "mysql",
) {
	const { auth, client, signInWithTestUser } = await getTestInstance(
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
				validateProbe,
			],
		},
		{ clientOptions: { plugins: [oauthProviderClient()] }, testWith },
	);
	const { headers } = await signInWithTestUser();
	const oauthClient = await auth.api.adminCreateOAuthClient({
		headers,
		body: {
			redirect_uris: [redirectUri],
			application_type: "native",
			token_endpoint_auth_method: "client_secret_post",
			scope: "openid profile email offline_access",
			skip_consent: true,
		},
	});
	expect(oauthClient?.client_id).toBeDefined();
	return { auth, headers, client, oauthClient };
}

type TestServer = Awaited<ReturnType<typeof setup>>;

interface TokenResponse {
	access_token?: string;
	refresh_token?: string;
}

/**
 * Gets an authorization code without redeeming it; `offline` also requests a
 * refresh token.
 */
async function authorizeCode(
	server: TestServer,
	{ offline = false }: { offline?: boolean } = {},
) {
	const { client, headers, oauthClient } = server;
	const codeVerifier = generateRandomString(32);
	const authUrl = await createAuthorizationURL({
		id: "test",
		options: {
			clientId: oauthClient.client_id,
			clientSecret: oauthClient.client_secret!,
			redirectURI: redirectUri,
		},
		redirectURI: "",
		authorizationEndpoint: `${authServerBaseUrl}/api/auth/oauth2/authorize`,
		state: "123",
		scopes: [
			"openid",
			"profile",
			"email",
			...(offline ? ["offline_access"] : []),
		],
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
	const redeem = async () => {
		const { body, headers: tokenHeaders } = await authorizationCodeRequest({
			code,
			codeVerifier,
			redirectURI: redirectUri,
			resource: validResource,
			options: {
				clientId: oauthClient.client_id,
				clientSecret: oauthClient.client_secret!,
				redirectURI: redirectUri,
			},
		});
		return client.$fetch<TokenResponse>("/oauth2/token", {
			method: "POST",
			body,
			headers: tokenHeaders,
		});
	};
	return { redeem };
}

/** Runs the authorization code flow; `offline` also requests a refresh token. */
async function authorize(server: TestServer, options?: { offline?: boolean }) {
	const { redeem } = await authorizeCode(server, options);
	const tokens = (await redeem()).data!;
	expect(tokens.access_token!.split(".")).toHaveLength(3);
	return {
		accessToken: tokens.access_token!,
		refreshToken: tokens.refresh_token,
		redeem,
	};
}

async function getAccessToken(server: TestServer) {
	return (await authorize(server)).accessToken;
}

async function refresh(
	{ client, oauthClient }: TestServer,
	refreshToken: string,
) {
	const { body, headers } = await refreshAccessTokenRequest({
		refreshToken,
		options: {
			clientId: oauthClient.client_id,
			clientSecret: oauthClient.client_secret!,
			redirectURI: redirectUri,
		},
	});
	return client.$fetch<TokenResponse>("/oauth2/token", {
		method: "POST",
		body,
		headers,
	});
}

async function isActiveAtIntrospection(
	{ client, oauthClient }: TestServer,
	token: string,
) {
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

async function userinfoStatus({ client }: TestServer, token: string) {
	let status = 200;
	await client.$fetch("/oauth2/userinfo", {
		headers: { authorization: `Bearer ${token}` },
		onError(context) {
			status = context.response.status;
		},
	});
	return status;
}

async function isActiveAtProviderApi({ auth }: TestServer, token: string) {
	const res = await auth.api.testValidateAccessToken({ body: { token } });
	return res.active;
}

function revoke(
	{ client, oauthClient }: TestServer,
	token: string,
	caller: { client_id: string; client_secret?: string } = oauthClient,
) {
	return client.oauth2.revoke(
		{
			client_id: caller.client_id,
			client_secret: caller.client_secret,
			token,
		},
		{ headers: formHeaders },
	);
}

describe("oauth-provider - revocable JWT access tokens", async () => {
	const server = await setup({ revocableJwtAccessTokens: true });

	it("revokes a JWT access token at introspection, UserInfo, and validateAccessToken", async () => {
		const revoked = await getAccessToken(server);
		const untouched = await getAccessToken(server);
		expect(await isActiveAtIntrospection(server, revoked)).toBe(true);
		expect(await userinfoStatus(server, revoked)).toBe(200);
		expect(await isActiveAtProviderApi(server, revoked)).toBe(true);

		const revocation = await revoke(server, revoked);
		expect(revocation.error).toBe(null);

		expect(await isActiveAtIntrospection(server, revoked)).toBe(false);
		expect(await userinfoStatus(server, revoked)).toBe(401);
		expect(await isActiveAtProviderApi(server, revoked)).toBe(false);

		// Revocation targets one `jti`, not the grant or the session.
		expect(await isActiveAtIntrospection(server, untouched)).toBe(true);
		expect(await userinfoStatus(server, untouched)).toBe(200);
	});

	it("answers 200 when the same token is revoked again, without a second write", async () => {
		const token = await getAccessToken(server);
		const ctx = await server.auth.$context;
		const create = vi.spyOn(ctx.internalAdapter, "createVerificationValue");
		try {
			expect((await revoke(server, token)).error).toBe(null);
			expect((await revoke(server, token)).error).toBe(null);
			expect(create).toHaveBeenCalledTimes(1);
		} finally {
			create.mockRestore();
		}
	});

	it("refuses to revoke another client's JWT access token", async () => {
		const token = await getAccessToken(server);
		const other = await server.auth.api.adminCreateOAuthClient({
			headers: server.headers,
			body: {
				redirect_uris: [redirectUri],
				application_type: "native",
				token_endpoint_auth_method: "client_secret_post",
				skip_consent: true,
			},
		});
		const revocation = await revoke(server, token, other);
		expect(revocation.error?.status).toBe(400);
		expect(await isActiveAtIntrospection(server, token)).toBe(true);
	});
});

describe("oauth-provider - revocable JWT access tokens in secondary storage", async () => {
	const { store, ttls, storage } = createSecondaryStorage();
	const server = await setup(
		{ revocableJwtAccessTokens: true },
		{
			secondaryStorage: storage,
			session: { storeSessionInDatabase: true },
		},
	);

	it("stores the marker with a TTL that ends at the token's exp", async () => {
		const token = await getAccessToken(server);
		const { jti, exp } = decodeJwt(token);
		expect((await revoke(server, token)).error).toBe(null);

		const key = [...store.keys()].find(
			(k) => k.startsWith("verification:") && k.includes(jti!),
		);
		expect(key).toBeDefined();
		const ttl = ttls.get(key!)!;
		// The entry must outlive the token, which is accepted until `exp`.
		const remaining = exp! - Date.now() / 1000;
		expect(ttl).toBeGreaterThanOrEqual(remaining);
		expect(ttl).toBeLessThanOrEqual(remaining + 2);
		expect(await isActiveAtIntrospection(server, token)).toBe(false);
	});
});

describe("oauth-provider - revocable JWT access tokens with hashed identifiers", async () => {
	const server = await setup(
		{ revocableJwtAccessTokens: true },
		{ verification: { storeIdentifier: "hashed" } },
	);

	it("finds the hashed marker at introspection and UserInfo", async () => {
		const token = await getAccessToken(server);
		expect((await revoke(server, token)).error).toBe(null);
		expect(await isActiveAtIntrospection(server, token)).toBe(false);
		expect(await userinfoStatus(server, token)).toBe(401);
	});
});

describe("oauth-provider - JWT access token revocation disabled", async () => {
	const server = await setup();

	it("keeps answering unsupported_token_type without reading or writing markers", async () => {
		const token = await getAccessToken(server);
		const ctx = await server.auth.$context;
		const find = vi.spyOn(ctx.internalAdapter, "findVerificationValue");
		const create = vi.spyOn(ctx.internalAdapter, "createVerificationValue");
		try {
			const revocation = await revoke(server, token);
			expect(revocation.error?.status).toBe(400);
			expect(revocation.error).toMatchObject({
				error: "unsupported_token_type",
			});
			expect(await isActiveAtIntrospection(server, token)).toBe(true);
			expect(await userinfoStatus(server, token)).toBe(200);
			expect(await isActiveAtProviderApi(server, token)).toBe(true);
			expect(find).not.toHaveBeenCalled();
			expect(create).not.toHaveBeenCalled();
		} finally {
			find.mockRestore();
			create.mockRestore();
		}
	});

	it("stamps no grant_id and leaves JWTs active after refresh revocation", async () => {
		const grant = await authorize(server, { offline: true });
		expect(decodeJwt(grant.accessToken).grant_id).toBeUndefined();
		expect((await revoke(server, grant.refreshToken!)).error).toBe(null);
		expect(await isActiveAtIntrospection(server, grant.accessToken)).toBe(true);
	});
});

async function expectRevoked(server: TestServer, token: string) {
	expect(await isActiveAtIntrospection(server, token)).toBe(false);
	expect(await userinfoStatus(server, token)).toBe(401);
	expect(await isActiveAtProviderApi(server, token)).toBe(false);
}

async function expectActive(server: TestServer, token: string) {
	expect(await isActiveAtIntrospection(server, token)).toBe(true);
	expect(await userinfoStatus(server, token)).toBe(200);
	expect(await isActiveAtProviderApi(server, token)).toBe(true);
}

/**
 * @see https://datatracker.ietf.org/doc/html/rfc7009#section-2.1
 */
describe.each(["sqlite", "postgres", "mysql"] as const)(
	"oauth-provider - refresh token revocation revokes the grant's JWT access tokens on %s",
	async (testWith) => {
		const server = await setup(
			{ revocableJwtAccessTokens: true },
			undefined,
			testWith,
		);

		it("revokes JWTs from the first issue and every rotation, and leaves other grants alone", async () => {
			const first = await authorize(server, { offline: true });
			const rotated = (await refresh(server, first.refreshToken!)).data!;
			const otherGrant = await authorize(server, { offline: true });

			const grantId = decodeJwt(first.accessToken).grant_id;
			expect(grantId).toEqual(expect.any(String));
			expect(decodeJwt(rotated.access_token!).grant_id).toBe(grantId);
			expect(decodeJwt(otherGrant.accessToken).grant_id).not.toBe(grantId);

			expect((await revoke(server, rotated.refresh_token!)).error).toBe(null);

			await expectRevoked(server, first.accessToken);
			await expectRevoked(server, rotated.access_token!);
			await expectActive(server, otherGrant.accessToken);
			expect((await refresh(server, otherGrant.refreshToken!)).error).toBe(
				null,
			);
		});

		it("revokes the grant's JWTs when a rotated refresh token is replayed at the token endpoint", async () => {
			const first = await authorize(server, { offline: true });
			const rotated = (await refresh(server, first.refreshToken!)).data!;

			const replay = await refresh(server, first.refreshToken!);
			expect(replay.error?.status).toBe(400);

			await expectRevoked(server, rotated.access_token!);
		});

		it("revokes the grant's JWTs when a rotated refresh token is presented for revocation", async () => {
			const first = await authorize(server, { offline: true });
			const rotated = (await refresh(server, first.refreshToken!)).data!;

			expect((await revoke(server, first.refreshToken!)).error).toBe(null);

			await expectRevoked(server, rotated.access_token!);
		});

		it("revokes the grant's JWTs when the authorization code is replayed", async () => {
			const grant = await authorize(server, { offline: true });
			const rotated = (await refresh(server, grant.refreshToken!)).data!;

			const replay = await grant.redeem();
			expect(replay.error?.status).toBe(400);

			await expectRevoked(server, grant.accessToken);
			await expectRevoked(server, rotated.access_token!);
		});

		it("revokes every JWT of the grant when revocation races a refresh", async () => {
			const grant = await authorize(server, { offline: true });

			const [, refreshed] = await Promise.all([
				revoke(server, grant.refreshToken!),
				refresh(server, grant.refreshToken!),
			]);

			await expectRevoked(server, grant.accessToken);
			// Either the refresh lost the race, or the token it minted is revoked.
			if (refreshed.data) {
				await expectRevoked(server, refreshed.data.access_token!);
			} else {
				expect(refreshed.error?.status).toBe(400);
			}
		});

		it("starts a grant ID for a refresh token stored before the option was enabled", async () => {
			const grant = await authorize(server, { offline: true });
			const ctx = await server.auth.$context;
			await ctx.adapter.updateMany({
				model: "oauthRefreshToken",
				where: [{ field: "clientId", value: server.oauthClient.client_id }],
				update: { grantId: null },
			});

			const rotated = (await refresh(server, grant.refreshToken!)).data!;
			expect(decodeJwt(rotated.access_token!).grant_id).toEqual(
				expect.any(String),
			);

			expect((await revoke(server, rotated.refresh_token!)).error).toBe(null);
			await expectRevoked(server, rotated.access_token!);
		});

		it("revokes the JWT of a legacy refresh token's rotation that wins a race with its revocation", async () => {
			const grant = await authorize(server, { offline: true });
			const ctx = await server.auth.$context;
			await ctx.adapter.updateMany({
				model: "oauthRefreshToken",
				where: [{ field: "clientId", value: server.oauthClient.client_id }],
				update: { grantId: null },
			});
			// Let a rotation win between the revocation's read and its swap.
			let rotated: Awaited<ReturnType<typeof refresh>> | undefined;
			let rotating = false;
			const incrementOne = ctx.adapter.incrementOne;
			const spy = vi
				.spyOn(ctx.adapter, "incrementOne")
				.mockImplementation((async (
					args: Parameters<typeof incrementOne>[0],
				) => {
					if (args.model === "oauthRefreshToken" && !rotating) {
						rotating = true;
						rotated = await refresh(server, grant.refreshToken!);
					}
					return incrementOne.call(ctx.adapter, args);
				}) as typeof incrementOne);
			try {
				expect((await revoke(server, grant.refreshToken!)).error).toBe(null);
			} finally {
				spy.mockRestore();
			}

			await expectRevoked(server, rotated!.data!.access_token!);
		});

		it("revokes JWTs from a legacy refresh token's rotation when the legacy token is replayed", async () => {
			const grant = await authorize(server, { offline: true });
			const ctx = await server.auth.$context;
			await ctx.adapter.updateMany({
				model: "oauthRefreshToken",
				where: [{ field: "clientId", value: server.oauthClient.client_id }],
				update: { grantId: null },
			});
			const rotated = (await refresh(server, grant.refreshToken!)).data!;

			const replay = await refresh(server, grant.refreshToken!);
			expect(replay.error?.status).toBe(400);

			await expectRevoked(server, rotated.access_token!);
		});

		it("revokes a JWT issued without a refresh token when its code is replayed", async () => {
			const grant = await authorize(server);
			expect(grant.refreshToken).toBeUndefined();

			const replay = await grant.redeem();
			expect(replay.error?.status).toBe(400);

			await expectRevoked(server, grant.accessToken);
		});

		it("issues no JWT to a redemption that a concurrent replay of its code overtakes", async () => {
			const { redeem } = await authorizeCode(server, { offline: true });
			const ctx = await server.auth.$context;
			// Hold the first redemption before it stores its refresh token until
			// the replay has finished revoking.
			let releaseFirst!: () => void;
			const replayFinished = new Promise<void>((resolve) => {
				releaseFirst = resolve;
			});
			const create = ctx.adapter.create;
			const spy = vi.spyOn(ctx.adapter, "create").mockImplementation((async (
				args: Parameters<typeof create>[0],
			) => {
				if (args.model === "oauthRefreshToken") await replayFinished;
				return create.call(ctx.adapter, args);
			}) as typeof create);
			try {
				const responses = await Promise.all(
					[redeem(), redeem()].map((request) =>
						request.then((response) => {
							if (response.error) releaseFirst();
							return response;
						}),
					),
				);
				for (const response of responses) {
					expect(response.data).toBe(null);
					expect(response.error?.status).toBe(400);
				}
			} finally {
				spy.mockRestore();
			}
		});
	},
);

describe("oauth-provider - grant_id in custom claims without revocation", async () => {
	const server = await setup({
		customAccessTokenClaims: () => ({ grant_id: "custom" }),
	});

	it("keeps a custom grant_id claim", async () => {
		const grant = await authorize(server, { offline: true });
		expect(decodeJwt(grant.accessToken).grant_id).toBe("custom");
	});
});

describe("oauth-provider - grant revocation when the verification store fails", async () => {
	const server = await setup({ revocableJwtAccessTokens: true });

	it("still tears down the refresh token family on replay", async () => {
		const first = await authorize(server, { offline: true });
		const rotated = (await refresh(server, first.refreshToken!)).data!;
		const ctx = await server.auth.$context;
		const create = vi
			.spyOn(ctx.internalAdapter, "createVerificationValue")
			.mockRejectedValueOnce(new Error("store unavailable"));
		try {
			const replay = await refresh(server, first.refreshToken!);
			expect(replay.error).not.toBe(null);
			expect(create).toHaveBeenCalled();
		} finally {
			create.mockRestore();
		}

		const afterReplay = await refresh(server, rotated.refresh_token!);
		expect(afterReplay.error?.status).toBe(400);
	});

	it("still deletes the code's tokens and fails the authorization code replay", async () => {
		const grant = await authorize(server, { offline: true });
		const ctx = await server.auth.$context;
		const create = vi
			.spyOn(ctx.internalAdapter, "createVerificationValue")
			.mockRejectedValueOnce(new Error("store unavailable"));
		try {
			const replay = await grant.redeem();
			expect(replay.error?.status).toBe(500);
			expect(create).toHaveBeenCalled();
		} finally {
			create.mockRestore();
		}

		const afterReplay = await refresh(server, grant.refreshToken!);
		expect(afterReplay.error?.status).toBe(400);
	});
});

describe("oauth-provider - grant revocation with contributed claims", async () => {
	const server = await setup({
		revocableJwtAccessTokens: true,
		customAccessTokenClaims: () => ({ grant_id: "forged" }),
	});

	it("keeps grant_id owned by the server", async () => {
		const grant = await authorize(server, { offline: true });
		const token = await getAccessToken(server);
		expect(decodeJwt(grant.accessToken).grant_id).not.toBe("forged");
		expect(decodeJwt(token).grant_id).not.toBe("forged");
	});
});

describe("oauth-provider - grant revocation in secondary storage", async () => {
	const accessTokenExpiresIn = 600;
	const { store, ttls, storage } = createSecondaryStorage();
	const server = await setup(
		{ revocableJwtAccessTokens: true, accessTokenExpiresIn },
		{
			secondaryStorage: storage,
			session: { storeSessionInDatabase: true },
		},
	);

	it("keeps the grant entry for the access token lifetime", async () => {
		const grant = await authorize(server, { offline: true });
		const grantId = decodeJwt(grant.accessToken).grant_id as string;
		// Let time pass between computing the entry's expiry and storing it.
		const now = Date.now();
		let tick = 0;
		const clock = vi.spyOn(Date, "now").mockImplementation(() => now + tick++);
		try {
			expect((await revoke(server, grant.refreshToken!)).error).toBe(null);
		} finally {
			clock.mockRestore();
		}

		const key = [...store.keys()].find(
			(k) => k.startsWith("verification:") && k.includes(grantId),
		);
		expect(key).toBeDefined();
		// Outlives a token revoked in the second it was issued, which stays
		// accepted until its `exp`.
		expect(ttls.get(key!)).toBeGreaterThanOrEqual(accessTokenExpiresIn);
		expect(ttls.get(key!)).toBeLessThanOrEqual(accessTokenExpiresIn + 1);
		expect(await isActiveAtIntrospection(server, grant.accessToken)).toBe(
			false,
		);
	});
});
