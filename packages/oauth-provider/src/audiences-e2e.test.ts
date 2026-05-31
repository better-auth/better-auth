/**
 * Regression coverage for the OAuth audiences entity. Each `describe`
 * targets one downstream consumer of the policy resolved by
 * `resolveAudiencePolicy`, asserting end-to-end behavior (token mint → DB
 * row → introspection / refresh / verifier) rather than just helper
 * return values.
 */
import type { AuthContext } from "@better-auth/core";
import { createAuthClient } from "better-auth/client";
import { generateRandomString } from "better-auth/crypto";
import { createAuthorizationURL } from "better-auth/oauth2";
import { jwt } from "better-auth/plugins/jwt";
import { getTestInstance } from "better-auth/test";
import { decodeJwt } from "jose";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	invalidateAudienceCache,
	resetSeedStateForTests,
	resolveAudiencePolicy,
	seedAudiencesOnce,
} from "./audiences";
import { oauthProviderClient } from "./client";
import { oauthProvider } from "./oauth";
import type {
	OAuthAudience,
	OAuthOptions,
	OAuthRefreshToken,
	Scope,
} from "./types";
import type { OAuthClient } from "./types/oauth";

const silenceWarnings = {
	oauthAuthServerConfig: true,
	openidConfig: true,
} as const;

/**
 * Boots an in-memory better-auth instance with the oauth-provider plugin and
 * (when not disabled by callers) the jwt plugin. Pre-seeds audience rows so
 * tests don't have to deal with the lazy seeding semantics directly.
 */
const bootProvider = async (options: Partial<OAuthOptions<Scope[]>> = {}) => {
	const opts = {
		loginPage: "/login",
		consentPage: "/consent",
		silenceWarnings,
		// Audience-linkage enforcement has its own coverage; disable here so
		// unit-level resolveAudiencePolicy tests don't have to seed
		// `oauthClientAudience` rows just to validate policy fields.
		enforcePerClientAudiences: false,
		...options,
	} as OAuthOptions<Scope[]>;
	const instance = await getTestInstance({
		plugins: [jwt(), oauthProvider(opts)],
	});
	resetSeedStateForTests();
	const ctx = await instance.auth.$context;
	await seedAudiencesOnce(ctx as unknown as AuthContext, opts);
	return { ...instance, ctx, opts };
};

const fakeEndpointCtx = (
	authCtx: Awaited<ReturnType<typeof bootProvider>>["ctx"],
) =>
	({
		context: authCtx,
		body: {},
	}) as never;

/**
 * Full-flow harness that runs an authorization code grant end-to-end against
 * a booted oauth-provider instance. Returns the booted instance and helpers
 * for issuing codes and exchanging them for tokens, parameterized by
 * authorize-time `resource` and token-time `resource`.
 */
const bootCodeFlowHarness = async (
	options: Partial<OAuthOptions<Scope[]>> = {},
) => {
	// Module-level audience cache + seed-completion flag persist across tests
	// in this file. Reset both before each harness boot so a stale cached row
	// from an earlier test doesn't leak into a fresh instance.
	resetSeedStateForTests();
	invalidateAudienceCache();

	const authServerBaseUrl = "http://localhost:3000";
	const rpBaseUrl = "http://localhost:5000";
	const providerId = "test";
	const redirectUri = `${rpBaseUrl}/api/auth/oauth2/callback/${providerId}`;
	const state = "state-123";

	const opts = {
		loginPage: "/login",
		consentPage: "/consent",
		silenceWarnings,
		// Disable the per-client audience-linkage check for the harness.
		// Bug-fix coverage targets the policy / introspection / refresh paths;
		// per-client linkage has its own coverage in audiences.test.ts.
		enforcePerClientAudiences: false,
		...options,
	} as OAuthOptions<Scope[]>;

	const { auth, signInWithTestUser, customFetchImpl } = await getTestInstance({
		baseURL: authServerBaseUrl,
		plugins: [jwt({ jwt: { issuer: authServerBaseUrl } }), oauthProvider(opts)],
	});
	// Force the seed to run now (lazy-seed normally defers until first audience
	// access, which is after migrations have run).
	const seedCtx = await auth.$context;
	await seedAudiencesOnce(seedCtx as unknown as AuthContext, opts);

	const { headers } = await signInWithTestUser();
	const client = createAuthClient({
		plugins: [oauthProviderClient()],
		baseURL: authServerBaseUrl,
		fetchOptions: { customFetchImpl, headers },
	});

	const adminCreated = await auth.api.adminCreateOAuthClient({
		headers,
		body: {
			redirect_uris: [redirectUri],
			scope: "openid profile email offline_access",
			skip_consent: true,
		},
	});
	if (!adminCreated?.client_id || !adminCreated?.client_secret) {
		throw new Error("admin client creation failed");
	}
	const oauthClient: OAuthClient = adminCreated;

	const createAuthUrl = async (overrides?: {
		resource?: string | string[];
		scopes?: string[];
	}) => {
		const codeVerifier = generateRandomString(32);
		const { url } = await createAuthorizationURL({
			id: providerId,
			options: {
				clientId: oauthClient.client_id!,
				clientSecret: oauthClient.client_secret!,
				redirectURI: redirectUri,
			},
			redirectURI: "",
			authorizationEndpoint: `${authServerBaseUrl}/api/auth/oauth2/authorize`,
			state,
			scopes: overrides?.scopes ?? [
				"openid",
				"profile",
				"email",
				"offline_access",
			],
			codeVerifier,
		});
		// `createAuthorizationURL` doesn't model RFC 8707 `resource` — append
		// it ourselves so the authorize-side validation path sees it. Multiple
		// values are repeated parameters per the spec.
		if (overrides?.resource !== undefined) {
			const values = Array.isArray(overrides.resource)
				? overrides.resource
				: [overrides.resource];
			for (const r of values) {
				url.searchParams.append("resource", r);
			}
		}
		return { url, codeVerifier };
	};

	const exchangeCode = async (overrides: {
		code: string;
		codeVerifier?: string;
		resource?: string | string[];
	}) => {
		const body = new URLSearchParams({
			grant_type: "authorization_code",
			code: overrides.code,
			redirect_uri: redirectUri,
			client_id: oauthClient.client_id!,
			client_secret: oauthClient.client_secret!,
		});
		if (overrides.codeVerifier) {
			body.set("code_verifier", overrides.codeVerifier);
		}
		// RFC 8707 §2: `resource` may be repeated. URLSearchParams.append keeps
		// each entry distinct so the array form round-trips.
		if (overrides.resource !== undefined) {
			const resources = Array.isArray(overrides.resource)
				? overrides.resource
				: [overrides.resource];
			for (const r of resources) body.append("resource", r);
		}
		return client.$fetch<{
			access_token?: string;
			refresh_token?: string;
			id_token?: string;
			expires_in?: number;
			[k: string]: unknown;
		}>("/oauth2/token", {
			method: "POST",
			body,
			headers: {
				"content-type": "application/x-www-form-urlencoded",
				accept: "application/json",
			},
		});
	};

	const runCodeFlow = async (
		opts: {
			authorizeResource?: string | string[];
			tokenResource?: string | string[];
			scopes?: string[];
		} = {},
	) => {
		const { url, codeVerifier } = await createAuthUrl({
			resource: opts.authorizeResource,
			scopes: opts.scopes,
		});
		let callbackRedirectUrl = "";
		await client.$fetch(url.toString(), {
			headers, // signed-in cookie
			onError(context) {
				callbackRedirectUrl = context.response.headers.get("Location") || "";
			},
		});
		const codeUrl = new URL(callbackRedirectUrl);
		const code = codeUrl.searchParams.get("code");
		if (!code) {
			return { redirected: callbackRedirectUrl, code: null, tokens: null };
		}
		const tokens = await exchangeCode({
			code,
			codeVerifier,
			resource: opts.tokenResource,
		});
		return { redirected: callbackRedirectUrl, code, tokens };
	};

	return {
		auth,
		client,
		oauthClient,
		headers,
		authServerBaseUrl,
		runCodeFlow,
		exchangeCode,
	};
};

// ────────────────────────────────────────────────────────────────────────────
// Introspection of entity-issued JWTs
// ────────────────────────────────────────────────────────────────────────────
describe("introspection accepts entity-issued JWTs and rejects deleted-audience tokens", () => {
	it("introspects a JWT whose `aud` is an oauthAudience identifier as active", async () => {
		// Pre-fix, validateJwtAccessToken passed `audience: opts.validAudiences ??
		// baseURL` to jose, so a JWT minted with `aud: <entity identifier>`
		// would fail jose's audience check and report active=false. The fix
		// removes that argument and validates `aud` manually against live
		// audience rows.
		const validAudience = "https://api.example.com/bug-1";
		const harness = await bootCodeFlowHarness({
			audiences: [validAudience],
		});
		const result = await harness.runCodeFlow({
			authorizeResource: validAudience,
			tokenResource: validAudience,
		});
		expect(result.tokens?.data?.access_token).toBeDefined();

		const introspection = await harness.client.oauth2.introspect(
			{
				client_id: harness.oauthClient.client_id,
				client_secret: harness.oauthClient.client_secret,
				token: result.tokens!.data!.access_token!,
				token_type_hint: "access_token",
			},
			{
				headers: {
					accept: "application/json",
					"content-type": "application/x-www-form-urlencoded",
				},
			},
		);
		expect(introspection.data).toMatchObject({
			active: true,
			client_id: harness.oauthClient.client_id,
		});
		// `aud` survived round-trip and references the entity identifier.
		const decoded = decodeJwt(result.tokens!.data!.access_token!);
		const audClaim = Array.isArray(decoded.aud) ? decoded.aud : [decoded.aud];
		expect(audClaim).toContain(validAudience);
	});

	it("hard-rejects a JWT whose audience row was deleted (introspection inactive)", async () => {
		// Contract: deleting an audience row implicitly revokes outstanding
		// tokens. Introspection returns active=false (RFC 7662 §2.2 — stable
		// failure mode), enabling RS-side immediate enforcement without per-
		// token revocation calls.
		const validAudience = "https://api.example.com/bug-1-delete";
		const harness = await bootCodeFlowHarness({
			audiences: [validAudience],
		});
		const result = await harness.runCodeFlow({
			authorizeResource: validAudience,
			tokenResource: validAudience,
		});
		const accessToken = result.tokens!.data!.access_token!;

		// Sanity check: token is active before deletion.
		const beforeDelete = await harness.client.oauth2.introspect(
			{
				client_id: harness.oauthClient.client_id,
				client_secret: harness.oauthClient.client_secret,
				token: accessToken,
				token_type_hint: "access_token",
			},
			{
				headers: {
					accept: "application/json",
					"content-type": "application/x-www-form-urlencoded",
				},
			},
		);
		expect(beforeDelete.data?.active).toBe(true);

		// Delete the audience row directly to simulate admin DELETE.
		const ctx = await harness.auth.$context;
		await ctx.adapter.delete({
			model: "oauthAudience",
			where: [{ field: "identifier", value: validAudience }],
		});

		const afterDelete = await harness.client.oauth2.introspect(
			{
				client_id: harness.oauthClient.client_id,
				client_secret: harness.oauthClient.client_secret,
				token: accessToken,
				token_type_hint: "access_token",
			},
			{
				headers: {
					accept: "application/json",
					"content-type": "application/x-www-form-urlencoded",
				},
			},
		);
		expect(afterDelete.data?.active).toBe(false);
	});

	it("continues to verify a JWT whose audience row was disabled (block new issuance only)", async () => {
		// Lifecycle contract (schema.ts comment on `disabled`): disabling an
		// audience blocks NEW issuance but existing tokens continue to verify
		// until their natural expiry. Only deletion hard-rejects existing
		// tokens. This test pins the contract so the row-existence vs.
		// disabled-flag distinction doesn't drift in introspect.ts.
		const validAudience = "https://api.example.com/bug-1-disabled";
		const harness = await bootCodeFlowHarness({
			audiences: [validAudience],
		});
		const result = await harness.runCodeFlow({
			authorizeResource: validAudience,
			tokenResource: validAudience,
		});
		const accessToken = result.tokens!.data!.access_token!;

		const ctx = await harness.auth.$context;
		await ctx.adapter.update({
			model: "oauthAudience",
			where: [{ field: "identifier", value: validAudience }],
			update: { disabled: true },
		});

		const introspection = await harness.client.oauth2.introspect(
			{
				client_id: harness.oauthClient.client_id,
				client_secret: harness.oauthClient.client_secret,
				token: accessToken,
				token_type_hint: "access_token",
			},
			{
				headers: {
					accept: "application/json",
					"content-type": "application/x-www-form-urlencoded",
				},
			},
		);
		expect(introspection.data?.active).toBe(true);
	});

	it("blocks NEW issuance against a disabled audience (resolveAudiencePolicy rejects)", async () => {
		// Complement to the previous test: disabling stops NEW mint but does
		// not retroactively invalidate. Confirm /oauth2/token rejects when the
		// audience is already disabled at request time.
		const aud = "https://api.example.com/bug-1-disabled-mint";
		const harness = await bootCodeFlowHarness({
			audiences: [aud],
		});

		const ctx = await harness.auth.$context;
		await ctx.adapter.update({
			model: "oauthAudience",
			where: [{ field: "identifier", value: aud }],
			update: { disabled: true },
		});

		const result = await harness.runCodeFlow({
			authorizeResource: aud,
			tokenResource: aud,
		});
		// authorize-time validation rejects → redirect with error, no code.
		expect(result.code).toBeNull();
		expect(result.redirected).toMatch(/invalid_target/);
	});
});

// ────────────────────────────────────────────────────────────────────────────
// Code grant binding of authorize-time resource
// ────────────────────────────────────────────────────────────────────────────
describe("code grant binds authorize-time `resource`", () => {
	it("reissues against the authorize-time resource when /token omits it", async () => {
		// Pre-fix, createUserTokens read only ctx.body.resource — a code
		// authorized for resource A could be redeemed without `resource` and
		// produce an opaque token bound to nothing. The fix reads
		// verificationValue.query.resource and plumbs it through.
		const audA = "https://api.example.com/bug-2-omit";
		const harness = await bootCodeFlowHarness({
			audiences: [audA],
		});

		const result = await harness.runCodeFlow({
			authorizeResource: audA,
			// Intentionally omit tokenResource — pre-fix behavior would mint
			// an opaque token here; post-fix the JWT carries `aud: audA`.
			tokenResource: undefined,
		});
		expect(result.tokens?.data?.access_token).toBeDefined();
		const decoded = decodeJwt(result.tokens!.data!.access_token!);
		const audClaim = Array.isArray(decoded.aud) ? decoded.aud : [decoded.aud];
		expect(audClaim).toContain(audA);
	});

	it("rejects with invalid_target when /token widens the resource set", async () => {
		// RFC 8707 §2.2 — the redemption resource MUST be a subset of the
		// authorize-time resource set. Widening to a different audience is
		// invalid_target even if that audience is otherwise configured.
		const audA = "https://api.example.com/bug-2-widen-a";
		const audB = "https://api.example.com/bug-2-widen-b";
		const harness = await bootCodeFlowHarness({
			audiences: [audA, audB],
		});
		const result = await harness.runCodeFlow({
			authorizeResource: audA,
			tokenResource: audB,
		});
		// better-fetch surfaces the JSON error body verbatim on `error`. The
		// OAuth error envelope is `{ error, error_description }` so we read
		// `error.error`.
		const tokenError = result.tokens?.error as { error?: string } | null;
		expect(tokenError?.error).toBe("invalid_target");
	});

	it("accepts /token resource when it equals the authorize-time resource", async () => {
		const audA = "https://api.example.com/bug-2-match";
		const harness = await bootCodeFlowHarness({
			audiences: [audA],
		});
		const result = await harness.runCodeFlow({
			authorizeResource: audA,
			tokenResource: audA,
		});
		expect(result.tokens?.data?.access_token).toBeDefined();
		const decoded = decodeJwt(result.tokens!.data!.access_token!);
		const audClaim = Array.isArray(decoded.aud) ? decoded.aud : [decoded.aud];
		expect(audClaim).toContain(audA);
	});
});

// ────────────────────────────────────────────────────────────────────────────
// Refresh-token preservation of original audience
// ────────────────────────────────────────────────────────────────────────────
describe("refresh tokens preserve original audience", () => {
	it("persists `resource` on the oauthRefreshToken row at issuance", async () => {
		const audA = "https://api.example.com/bug-3-persist";
		const harness = await bootCodeFlowHarness({
			audiences: [audA],
		});
		const result = await harness.runCodeFlow({
			authorizeResource: audA,
			tokenResource: audA,
		});
		expect(result.tokens?.data?.refresh_token).toBeDefined();

		const ctx = await harness.auth.$context;
		const rows = await ctx.adapter.findMany<OAuthRefreshToken<Scope[]>>({
			model: "oauthRefreshToken",
			where: [{ field: "clientId", value: harness.oauthClient.client_id! }],
		});
		expect(rows.length).toBeGreaterThan(0);
		// At least one row carries the audience we issued against.
		const persisted = rows.find((r) => (r.resources ?? []).includes(audA));
		expect(persisted).toBeDefined();
		expect(persisted?.resources).toContain(audA);
	});

	it("re-applies the original audience on refresh when /token omits resource", async () => {
		// Pre-fix, handleRefreshTokenGrant used only ctx.body.resource, so a
		// refresh without `resource` would lose the original audience binding
		// (and per-audience TTL/signing/claims). Post-fix the persisted
		// resource is the source of truth.
		const audA = "https://api.example.com/bug-3-rebind";
		const harness = await bootCodeFlowHarness({
			audiences: [audA],
		});
		const initial = await harness.runCodeFlow({
			authorizeResource: audA,
			tokenResource: audA,
		});
		const refreshToken = initial.tokens!.data!.refresh_token!;

		const refreshed = await harness.client.$fetch<{
			access_token?: string;
			refresh_token?: string;
		}>("/oauth2/token", {
			method: "POST",
			body: new URLSearchParams({
				grant_type: "refresh_token",
				refresh_token: refreshToken,
				client_id: harness.oauthClient.client_id!,
				client_secret: harness.oauthClient.client_secret!,
				// Intentionally NO `resource` on the refresh body.
			}),
			headers: {
				"content-type": "application/x-www-form-urlencoded",
				accept: "application/json",
			},
		});
		expect(refreshed.data?.access_token).toBeDefined();
		const decoded = decodeJwt(refreshed.data!.access_token!);
		const audClaim = Array.isArray(decoded.aud) ? decoded.aud : [decoded.aud];
		expect(audClaim).toContain(audA);
	});

	it("rejects refresh that widens the resource beyond the persisted set", async () => {
		const audA = "https://api.example.com/bug-3-widen-a";
		const audB = "https://api.example.com/bug-3-widen-b";
		const harness = await bootCodeFlowHarness({
			audiences: [audA, audB],
		});
		const initial = await harness.runCodeFlow({
			authorizeResource: audA,
			tokenResource: audA,
		});
		const refreshToken = initial.tokens!.data!.refresh_token!;

		const refreshed = await harness.client.$fetch<{
			error?: string;
		}>("/oauth2/token", {
			method: "POST",
			body: new URLSearchParams({
				grant_type: "refresh_token",
				refresh_token: refreshToken,
				client_id: harness.oauthClient.client_id!,
				client_secret: harness.oauthClient.client_secret!,
				resource: audB, // not in the persisted set
			}),
			headers: {
				"content-type": "application/x-www-form-urlencoded",
				accept: "application/json",
			},
		});
		const refreshError = refreshed.error as { error?: string } | null;
		expect(refreshError?.error).toBe("invalid_target");
	});
});

// ────────────────────────────────────────────────────────────────────────────
// DB-only audiences without config
// ────────────────────────────────────────────────────────────────────────────
describe("DB-only audiences resolve without `audiences` / `validAudiences` config", () => {
	it("looks up a DB row even when neither audiences nor validAudiences is set", async () => {
		// Boot with no audience config so the legacy gate would have blocked
		// the DB lookup. Then create a row directly and assert resolution.
		const { ctx, opts } = await bootProvider({});
		const identifier = "https://api.example.com/bug-4-db-only";
		await ctx.adapter.create<OAuthAudience>({
			model: "oauthAudience",
			data: {
				identifier,
				name: identifier,
				accessTokenTtl: 120,
				refreshTokenTtl: null,
				signingAlgorithm: null,
				signingKeyId: null,
				allowedScopes: null,
				customClaims: null,
				disabled: false,
				policyVersion: 1,
				metadata: null,
				createdAt: new Date(),
				updatedAt: new Date(),
			} as unknown as OAuthAudience,
		});
		const policy = await resolveAudiencePolicy(fakeEndpointCtx(ctx), opts, {
			resource: identifier,
			clientId: "client-x",
			requestedScopes: ["read"],
		});
		expect(policy.audience).toBe(identifier);
		expect(policy.accessTokenTtl).toBe(120);
	});

	it("rejects an unknown identifier with invalid_target when no config and no DB row", async () => {
		const { ctx, opts } = await bootProvider({});
		await expect(
			resolveAudiencePolicy(fakeEndpointCtx(ctx), opts, {
				resource: "https://api.example.com/bug-4-nope",
				clientId: "client-x",
				requestedScopes: [],
			}),
		).rejects.toMatchObject({
			body: expect.objectContaining({ error: "invalid_target" }),
		});
	});

	it("rejects a disabled DB row with invalid_target even without legacy config", async () => {
		const { ctx, opts } = await bootProvider({});
		const identifier = "https://api.example.com/bug-4-disabled";
		await ctx.adapter.create<OAuthAudience>({
			model: "oauthAudience",
			data: {
				identifier,
				name: identifier,
				accessTokenTtl: null,
				refreshTokenTtl: null,
				signingAlgorithm: null,
				signingKeyId: null,
				allowedScopes: null,
				customClaims: null,
				disabled: true,
				policyVersion: 1,
				metadata: null,
				createdAt: new Date(),
				updatedAt: new Date(),
			} as unknown as OAuthAudience,
		});
		await expect(
			resolveAudiencePolicy(fakeEndpointCtx(ctx), opts, {
				resource: identifier,
				clientId: "client-x",
				requestedScopes: [],
			}),
		).rejects.toMatchObject({
			body: expect.objectContaining({ error: "invalid_target" }),
		});
	});
});

// ────────────────────────────────────────────────────────────────────────────
// refreshTokenTtl application at issuance
// ────────────────────────────────────────────────────────────────────────────
describe("refreshTokenTtl from oauthAudience is applied at issuance", () => {
	it("uses the audience refreshTokenTtl when shorter than plugin default", async () => {
		const identifier = "https://api.example.com/bug-7-short";
		const audienceRefreshTtl = 60; // 1 minute
		const harness = await bootCodeFlowHarness({
			audiences: [
				{
					identifier,
					refreshTokenTtl: audienceRefreshTtl,
				},
			],
			refreshTokenExpiresIn: 86400, // 1 day — should be ignored
		});
		const result = await harness.runCodeFlow({
			authorizeResource: identifier,
			tokenResource: identifier,
		});
		const refreshToken = result.tokens!.data!.refresh_token!;
		expect(refreshToken).toBeDefined();

		const ctx = await harness.auth.$context;
		const rows = await ctx.adapter.findMany<OAuthRefreshToken<Scope[]>>({
			model: "oauthRefreshToken",
			where: [{ field: "clientId", value: harness.oauthClient.client_id! }],
		});
		const row = rows.find((r) => (r.resources ?? []).includes(identifier));
		expect(row).toBeDefined();
		const ttlSeconds =
			(new Date(row!.expiresAt).getTime() -
				new Date(row!.createdAt).getTime()) /
			1000;
		// Within 5s tolerance of the audience TTL.
		expect(Math.abs(ttlSeconds - audienceRefreshTtl)).toBeLessThan(5);
	});

	it("policy.refreshTokenTtl reflects audience override (unit-level)", async () => {
		const id = "https://api.example.com/bug-7-policy";
		const { ctx, opts } = await bootProvider({
			audiences: [{ identifier: id, refreshTokenTtl: 300 }],
		});
		const policy = await resolveAudiencePolicy(fakeEndpointCtx(ctx), opts, {
			resource: id,
			clientId: "client-x",
			requestedScopes: [],
		});
		expect(policy.refreshTokenTtl).toBe(300);
	});

	it("policy.refreshTokenTtl picks the minimum across multi-audience requests", async () => {
		const a = "https://api.example.com/bug-7-multi-a";
		const b = "https://api.example.com/bug-7-multi-b";
		const { ctx, opts } = await bootProvider({
			audiences: [
				{ identifier: a, refreshTokenTtl: 600 },
				{ identifier: b, refreshTokenTtl: 120 },
			],
		});
		const policy = await resolveAudiencePolicy(fakeEndpointCtx(ctx), opts, {
			resource: [a, b],
			clientId: "client-x",
			requestedScopes: [],
		});
		expect(policy.refreshTokenTtl).toBe(120);
	});

	it("caps audience refreshTokenTtl against the plugin default (lowest wins)", async () => {
		// OAuth 2.1 §1.5 / RFC 8693 §3.2 lifetime-narrowing semantics: a
		// permissive per-audience TTL must not extend the AS-wide default.
		// Pre-fix `audiencePolicy.refreshTokenTtl ?? default` would let the
		// audience override an even-shorter plugin default.
		const identifier = "https://api.example.com/bug-7-cap";
		const pluginDefault = 60; // 1 minute — should win
		const audienceRefreshTtl = 3600; // 1 hour — should be capped
		const harness = await bootCodeFlowHarness({
			audiences: [
				{
					identifier,
					refreshTokenTtl: audienceRefreshTtl,
				},
			],
			refreshTokenExpiresIn: pluginDefault,
		});
		const result = await harness.runCodeFlow({
			authorizeResource: identifier,
			tokenResource: identifier,
		});
		const refreshToken = result.tokens!.data!.refresh_token!;
		expect(refreshToken).toBeDefined();

		const ctx = await harness.auth.$context;
		const rows = await ctx.adapter.findMany<OAuthRefreshToken<Scope[]>>({
			model: "oauthRefreshToken",
			where: [{ field: "clientId", value: harness.oauthClient.client_id! }],
		});
		const row = rows.find((r) => (r.resources ?? []).includes(identifier));
		expect(row).toBeDefined();
		const ttlSeconds =
			(new Date(row!.expiresAt).getTime() -
				new Date(row!.createdAt).getTime()) /
			1000;
		// Within 5s tolerance of the plugin-default TTL, NOT the audience TTL.
		expect(Math.abs(ttlSeconds - pluginDefault)).toBeLessThan(5);
		expect(ttlSeconds).toBeLessThan(audienceRefreshTtl);
	});
});

// ────────────────────────────────────────────────────────────────────────────
// RFC 8707 §2: repeated `resource` form parameters
// ────────────────────────────────────────────────────────────────────────────
describe("repeated `resource` form parameter mints multi-audience tokens", () => {
	it("token aud carries every requested resource (auth code grant)", async () => {
		// Pre-fix, better-call's form-body parser collapsed repeated keys to
		// last-write-wins, so `resource=A&resource=B` arrived in the handler
		// as `{ resource: "B" }` and the issued JWT had `aud: [B]`. RFC 8707
		// §2 explicitly permits repetition and the AS SHOULD reflect every
		// requested resource in the audience claim.
		const audA = "https://api.example.com/bug-10-a";
		const audB = "https://api.example.com/bug-10-b";
		const harness = await bootCodeFlowHarness({
			audiences: [audA, audB],
		});
		const result = await harness.runCodeFlow({
			authorizeResource: [audA, audB],
			tokenResource: [audA, audB],
		});
		const accessToken = result.tokens!.data!.access_token!;
		expect(accessToken).toBeDefined();
		const decoded = decodeJwt(accessToken);
		const audClaim = Array.isArray(decoded.aud) ? decoded.aud : [decoded.aud];
		expect(audClaim).toContain(audA);
		expect(audClaim).toContain(audB);
	});

	it("refresh-token row persists every requested resource", async () => {
		// RFC 8707 §2.2 narrowing: the refresh row must remember the full
		// requested audience set so subsequent refresh exchanges can verify
		// that the client only narrows, never widens. With the
		// last-write-wins bug, only the trailing value was persisted.
		const audA = "https://api.example.com/bug-10-refresh-a";
		const audB = "https://api.example.com/bug-10-refresh-b";
		const harness = await bootCodeFlowHarness({
			audiences: [audA, audB],
		});
		const result = await harness.runCodeFlow({
			authorizeResource: [audA, audB],
			tokenResource: [audA, audB],
		});
		expect(result.tokens?.data?.refresh_token).toBeDefined();
		const ctx = await harness.auth.$context;
		const rows = await ctx.adapter.findMany<OAuthRefreshToken<Scope[]>>({
			model: "oauthRefreshToken",
			where: [{ field: "clientId", value: harness.oauthClient.client_id! }],
		});
		// Find the row whose resource set includes both audiences.
		const row = rows.find((r) => {
			const resources = r.resources ?? [];
			return resources.includes(audA) && resources.includes(audB);
		});
		expect(row).toBeDefined();
	});

	it("single-value `resource` form continues to work unchanged", async () => {
		// Regression guard for the patch's branch that only mutates
		// ctx.body.resource when the raw body carries >1 entry. A single
		// `resource=X` form must still arrive as the string "X" so existing
		// zod validation and downstream code paths see no change.
		const aud = "https://api.example.com/bug-10-single";
		const harness = await bootCodeFlowHarness({
			audiences: [aud],
		});
		const result = await harness.runCodeFlow({
			authorizeResource: aud,
			tokenResource: aud,
		});
		const accessToken = result.tokens!.data!.access_token!;
		const decoded = decodeJwt(accessToken);
		const audClaim = Array.isArray(decoded.aud) ? decoded.aud : [decoded.aud];
		expect(audClaim).toContain(aud);
	});
});

// ────────────────────────────────────────────────────────────────────────────
// RFC 9068 §2.2.3 `client_id` claim emission
// ────────────────────────────────────────────────────────────────────────────
describe("JWT access tokens emit RFC 9068 §2.2.3 `client_id` claim", () => {
	it("emits both `client_id` and `azp` on a JWT access token", async () => {
		const identifier = "https://api.example.com/bug-8";
		const harness = await bootCodeFlowHarness({
			audiences: [identifier],
		});
		const result = await harness.runCodeFlow({
			authorizeResource: identifier,
			tokenResource: identifier,
		});
		const accessToken = result.tokens!.data!.access_token!;
		const decoded = decodeJwt(accessToken) as {
			client_id?: string;
			azp?: string;
		};
		expect(decoded.client_id).toBe(harness.oauthClient.client_id);
		// `azp` continues to be set for back-compat with code that keyed on it.
		expect(decoded.azp).toBe(harness.oauthClient.client_id);
	});

	it("strips `client_id` from per-audience customClaims (AS owns it)", async () => {
		const identifier = "https://api.example.com/bug-8-strip";
		const warnSpy = vi
			.spyOn(console, "warn")
			.mockImplementation(() => undefined);
		try {
			const harness = await bootCodeFlowHarness({
				audiences: [
					{
						identifier,
						customClaims: {
							client_id: "attacker-owned-value",
							department: "ok-claim",
						},
					},
				],
			});
			const result = await harness.runCodeFlow({
				authorizeResource: identifier,
				tokenResource: identifier,
			});
			const decoded = decodeJwt(result.tokens!.data!.access_token!) as {
				client_id?: string;
				department?: string;
			};
			// Real client_id survives; the customClaims override was stripped.
			expect(decoded.client_id).toBe(harness.oauthClient.client_id);
			expect(decoded.client_id).not.toBe("attacker-owned-value");
			expect(decoded.department).toBe("ok-claim");
		} finally {
			warnSpy.mockRestore();
		}
	});
});

// ────────────────────────────────────────────────────────────────────────────
// Identifier validation in the seed path
// ────────────────────────────────────────────────────────────────────────────
describe("seed path applies identifier validation and warns on failures", () => {
	let warnMessages: string[];
	let warnSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		warnMessages = [];
		// Tap @better-auth/core/env logger.warn so we can assert seed warns.
		// (Better Auth's logger forwards to console.warn by default; tap that.)
		warnSpy = vi
			.spyOn(console, "warn")
			.mockImplementation((...args: unknown[]) => {
				warnMessages.push(args.map((a) => String(a)).join(" "));
			});
	});

	afterEach(() => {
		warnSpy.mockRestore();
	});

	it("skips invalid identifiers without throwing during seed", async () => {
		// "not a uri" fails URL parsing → checkIdentifier returns
		// { ok: false }. The seed path should warn-and-skip, NOT crash init.
		const goodIdentifier = "https://api.example.com/bug-9-good";
		const { ctx } = await bootProvider({
			audiences: [
				goodIdentifier,
				"not a uri", // invalid — must be skipped
			],
		});
		// Good identifier seeded.
		const goodRow = await ctx.adapter.findOne<OAuthAudience>({
			model: "oauthAudience",
			where: [{ field: "identifier", value: goodIdentifier }],
		});
		expect(goodRow?.identifier).toBe(goodIdentifier);

		// Bad identifier NOT seeded.
		const badRow = await ctx.adapter.findOne<OAuthAudience>({
			model: "oauthAudience",
			where: [{ field: "identifier", value: "not a uri" }],
		});
		expect(badRow).toBeNull();
	});

	it("skips identifiers with URI fragments (RFC 8707 §2)", async () => {
		const goodIdentifier = "https://api.example.com/bug-9-frag-good";
		const { ctx } = await bootProvider({
			audiences: [
				goodIdentifier,
				"https://api.example.com/bug-9#fragment", // RFC 8707 §2 violation
			],
		});
		const goodRow = await ctx.adapter.findOne<OAuthAudience>({
			model: "oauthAudience",
			where: [{ field: "identifier", value: goodIdentifier }],
		});
		expect(goodRow?.identifier).toBe(goodIdentifier);

		const fragRow = await ctx.adapter.findOne<OAuthAudience>({
			model: "oauthAudience",
			where: [
				{
					field: "identifier",
					value: "https://api.example.com/bug-9#fragment",
				},
			],
		});
		expect(fragRow).toBeNull();
	});

	it("honors a custom identifierValidator that rejects entries", async () => {
		const goodIdentifier = "https://allowed.example.com/bug-9";
		const blockedIdentifier = "https://blocked.example.com/bug-9";
		const { ctx } = await bootProvider({
			identifierValidator: (id: string) => !id.includes("blocked.example.com"),
			audiences: [goodIdentifier, blockedIdentifier],
		});
		const goodRow = await ctx.adapter.findOne<OAuthAudience>({
			model: "oauthAudience",
			where: [{ field: "identifier", value: goodIdentifier }],
		});
		expect(goodRow?.identifier).toBe(goodIdentifier);

		const blockedRow = await ctx.adapter.findOne<OAuthAudience>({
			model: "oauthAudience",
			where: [{ field: "identifier", value: blockedIdentifier }],
		});
		expect(blockedRow).toBeNull();
	});

	it("strips unsupported signingAlgorithm values from seed config and warns", async () => {
		// The admin-CRUD zod gate already rejects bad alg values at the
		// endpoint. The seed path is its own surface — without runtime
		// validation, a config typo would persist an alg the JWT plugin can't
		// honor and surface only as an opaque jose error at sign time.
		const aud = "https://api.example.com/bug-5-seed-alg";
		const { ctx } = await bootProvider({
			audiences: [
				{
					identifier: aud,
					// Intentionally bogus — must be stripped to null, not persisted.
					signingAlgorithm: "HS256" as never,
				},
			],
		});
		const row = await ctx.adapter.findOne<OAuthAudience>({
			model: "oauthAudience",
			where: [{ field: "identifier", value: aud }],
		});
		expect(row?.identifier).toBe(aud);
		expect(row?.signingAlgorithm).toBeNull();
		expect(
			warnMessages.some(
				(m) =>
					m.includes(`dropping unsupported signingAlgorithm "HS256"`) &&
					m.includes(aud),
			),
		).toBe(true);
	});
});
