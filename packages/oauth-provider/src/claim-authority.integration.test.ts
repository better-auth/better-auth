/**
 * Integration coverage for the access-token claim authority
 * (`resolveAccessTokenClaims`) and the introspection authorization model
 * (RFC 7662 §2.1/§4, issue #8267).
 *
 * Each `describe` boots its own in-memory better-auth instance and runs a real
 * authorization-code grant, then introspects the issued token. The opaque path
 * (`disableJwtPlugin: true`) exercises the introspection re-derive branch; the
 * JWT path covers the same `isIntrospectionAuthorized` gate at mint-aware
 * verification.
 */
import type { AuthContext } from "@better-auth/core";
import { createAuthClient } from "better-auth/client";
import { generateRandomString } from "better-auth/crypto";
import { createAuthorizationURL } from "better-auth/oauth2";
import { jwt } from "better-auth/plugins/jwt";
import { getTestInstance } from "better-auth/test";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { oauthProviderClient } from "./client";
import { oauthProvider } from "./oauth";
import {
	buildClientResourceLinkId,
	resetSeedStateForTests,
	seedResourcesOnce,
} from "./resources";
import type { OAuthOptions, Scope } from "./types";
import type { OAuthClient } from "./types/oauth";

const authServerBaseUrl = "http://localhost:3000";
const rpBaseUrl = "http://localhost:5000";
const providerId = "test";
const redirectUri = `${rpBaseUrl}/api/auth/callback/${providerId}`;
const state = "123";

const silenceWarnings = {
	oauthAuthServerConfig: true,
	openidConfig: true,
} as const;

const introspectHeaders = {
	accept: "application/json",
	"content-type": "application/x-www-form-urlencoded",
} as const;

/**
 * Boots an oauth-provider instance, seeds resource rows eagerly, signs in a
 * test user, and returns a configured auth client plus helpers for running the
 * authorization-code flow. Mirrors the harness in `resources-e2e.test.ts`.
 */
async function bootHarness(
	config: Partial<OAuthOptions<Scope[]>> = {},
	scopes: string[] = ["openid", "profile", "email", "offline_access"],
) {
	resetSeedStateForTests();

	const opts = {
		loginPage: "/login",
		consentPage: "/consent",
		silenceWarnings,
		enforcePerClientResources: false,
		scopes,
		...config,
	} as OAuthOptions<Scope[]>;

	const { auth, signInWithTestUser, customFetchImpl } = await getTestInstance({
		baseURL: authServerBaseUrl,
		plugins: [
			oauthProvider(opts),
			...(opts.disableJwtPlugin
				? []
				: [jwt({ jwt: { issuer: authServerBaseUrl } })]),
		],
	});
	const seedCtx = await auth.$context;
	await seedResourcesOnce(seedCtx as unknown as AuthContext, opts);

	const { headers, user } = await signInWithTestUser();
	const client = createAuthClient({
		plugins: [oauthProviderClient()],
		baseURL: authServerBaseUrl,
		fetchOptions: { customFetchImpl, headers },
	});

	const registerClient = async (overrides: Record<string, unknown> = {}) => {
		const created = await auth.api.adminCreateOAuthClient({
			headers,
			body: {
				redirect_uris: [redirectUri],
				scope: scopes.join(" "),
				skip_consent: true,
				...overrides,
			},
		});
		if (!created?.client_id || !created?.client_secret) {
			throw new Error("admin client creation failed");
		}
		return created as OAuthClient;
	};

	const mintToken = async (
		oauthClient: OAuthClient,
		overrides: { resource?: string | string[] } = {},
	) => {
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
			scopes,
			codeVerifier,
		});
		if (overrides.resource !== undefined) {
			const values = Array.isArray(overrides.resource)
				? overrides.resource
				: [overrides.resource];
			for (const r of values) url.searchParams.append("resource", r);
		}
		let callbackRedirectUrl = "";
		await client.$fetch(url.toString(), {
			headers,
			onError(context) {
				callbackRedirectUrl = context.response.headers.get("Location") || "";
			},
		});
		const code = new URL(callbackRedirectUrl).searchParams.get("code");
		if (!code) throw new Error("authorization code not issued");

		const body = new URLSearchParams({
			grant_type: "authorization_code",
			code,
			code_verifier: codeVerifier,
			redirect_uri: redirectUri,
			client_id: oauthClient.client_id!,
			client_secret: oauthClient.client_secret!,
			scope: scopes.join(" "),
		});
		if (overrides.resource !== undefined) {
			const values = Array.isArray(overrides.resource)
				? overrides.resource
				: [overrides.resource];
			for (const r of values) body.append("resource", r);
		}
		const tokens = await client.$fetch<{ access_token?: string }>(
			"/oauth2/token",
			{ method: "POST", body, headers: introspectHeaders },
		);
		const accessToken = tokens.data?.access_token;
		if (!accessToken) throw new Error("access token not issued");
		return accessToken;
	};

	const introspect = async (params: {
		token: string;
		client_id?: string;
		client_secret?: string;
	}) =>
		client.oauth2.introspect(
			{
				client_id: params.client_id,
				client_secret: params.client_secret,
				token: params.token,
				token_type_hint: "access_token",
			},
			{ headers: introspectHeaders },
		);

	const linkClientToResource = async (clientId: string, resourceId: string) => {
		const ctx = await auth.$context;
		await ctx.adapter.create({
			model: "oauthClientResource",
			forceAllowId: true,
			data: {
				id: buildClientResourceLinkId(clientId, resourceId),
				clientId,
				resourceId,
				createdAt: new Date(),
			} as never,
		});
	};

	return {
		auth,
		client,
		headers,
		user,
		registerClient,
		mintToken,
		introspect,
		linkClientToResource,
	};
}

describe("opaque introspection — reserved claim stripping", async () => {
	// Opaque tokens (disableJwtPlugin) re-derive their claim set at
	// introspection through `resolveAccessTokenClaims`, which strips reserved
	// RFC 9068 names unconditionally. The pinned introspection response keys are
	// active/iss/aud/client_id/azp/sub/sid/exp/iat/scope, so a reserved name not
	// in that pinned set (auth_time, amr) proves the strip end-to-end.
	const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
	const harness = await bootHarness({
		disableJwtPlugin: true,
		customAccessTokenClaims: () => ({
			role: "admin",
			iss: "https://evil.example",
			scope: "evil",
			auth_time: 999,
			amr: ["evil"],
		}),
	});
	let oauthClient: OAuthClient;

	beforeAll(async () => {
		oauthClient = await harness.registerClient();
	});

	afterAll(() => {
		warnSpy.mockRestore();
	});

	it("keeps enriched claims and strips reserved RFC 9068 names the AS owns", async () => {
		const token = await harness.mintToken(oauthClient);
		const introspection = await harness.introspect({
			token,
			client_id: oauthClient.client_id,
			client_secret: oauthClient.client_secret,
		});
		const data = introspection.data as Record<string, unknown> | undefined;

		expect(data?.active).toBe(true);
		// Enriched (non-reserved) claim survives.
		expect(data?.role).toBe("admin");
		// AS-owned reserved claims keep the server's values, not the overrides.
		// With the jwt plugin disabled, `iss` falls back to the AS base URL.
		expect(data?.iss).toBe(`${authServerBaseUrl}/api/auth`);
		expect(data?.iss).not.toBe("https://evil.example");
		expect(data?.scope).toBe("openid profile email offline_access");
		expect(data?.scope).not.toBe("evil");
		// Reserved names outside the pinned response set are stripped entirely.
		expect(data?.auth_time).toBeUndefined();
		expect(data?.amr).toBeUndefined();
	});
});

describe("opaque introspection — per-resource customClaims parity", async () => {
	// Before the claim-authority change, opaque introspection never re-derived
	// per-resource `customClaims`; only the JWT mint carried them. The opaque
	// re-derive path now resolves resource policy and includes them.
	const resource = "https://api.example.com/claims-parity";
	const harness = await bootHarness({
		disableJwtPlugin: true,
		resources: [{ identifier: resource, customClaims: { dept: "ops" } }],
	});
	let oauthClient: OAuthClient;

	beforeAll(async () => {
		oauthClient = await harness.registerClient();
	});

	it("includes per-resource customClaims for a resource-bound opaque token", async () => {
		const token = await harness.mintToken(oauthClient, { resource });
		const introspection = await harness.introspect({
			token,
			client_id: oauthClient.client_id,
			client_secret: oauthClient.client_secret,
		});
		const data = introspection.data as Record<string, unknown> | undefined;

		expect(data?.active).toBe(true);
		expect(data?.dept).toBe("ops");
	});
});

/**
 * @see https://github.com/better-auth/better-auth/issues/8267
 */
describe("introspection authorization (#8267)", async () => {
	// RFC 7662 §2.1/§4: the introspecting client need not be the issuer. A
	// resource server linked to one of the token's audience resources may
	// introspect it; an unlinked client cannot. Tokens with no resource
	// audience stay issuer-only.
	const resource = "https://api.example.com/rs-8267";
	const harness = await bootHarness({ resources: [resource] });
	let issuerClientA: OAuthClient;
	let resourceServerB: OAuthClient;
	let unrelatedClientC: OAuthClient;

	beforeAll(async () => {
		issuerClientA = await harness.registerClient();
		resourceServerB = await harness.registerClient();
		unrelatedClientC = await harness.registerClient();
		await harness.linkClientToResource(resourceServerB.client_id!, resource);
	});

	it("lets the issuer introspect its own resource-bound token", async () => {
		const token = await harness.mintToken(issuerClientA, { resource });
		const introspection = await harness.introspect({
			token,
			client_id: issuerClientA.client_id,
			client_secret: issuerClientA.client_secret,
		});
		expect(introspection.data?.active).toBe(true);
	});

	it("lets a resource server linked to the audience introspect the token", async () => {
		const token = await harness.mintToken(issuerClientA, { resource });
		const introspection = await harness.introspect({
			token,
			client_id: resourceServerB.client_id,
			client_secret: resourceServerB.client_secret,
		});
		expect(introspection.data?.active).toBe(true);
	});

	it("reports inactive to an unlinked client", async () => {
		const token = await harness.mintToken(issuerClientA, { resource });
		const introspection = await harness.introspect({
			token,
			client_id: unrelatedClientC.client_id,
			client_secret: unrelatedClientC.client_secret,
		});
		expect(introspection.data?.active).toBe(false);
	});

	it("keeps a token with no resource audience issuer-only", async () => {
		const token = await harness.mintToken(issuerClientA);
		// The issuer still sees it as active.
		const issuerView = await harness.introspect({
			token,
			client_id: issuerClientA.client_id,
			client_secret: issuerClientA.client_secret,
		});
		expect(issuerView.data?.active).toBe(true);

		// A non-issuer (even the linked resource server B) cannot introspect a
		// token that carries no resource audience.
		const nonIssuerView = await harness.introspect({
			token,
			client_id: resourceServerB.client_id,
			client_secret: resourceServerB.client_secret,
		});
		expect(nonIssuerView.data?.active).toBe(false);
	});
});

describe("opaque introspection — resource lifecycle", async () => {
	// Deleting a resource row revokes outstanding opaque tokens bound to it
	// (mirrors the JWT delete contract); disabling a row blocks new issuance but
	// keeps existing tokens, and their claims, valid until expiry.
	const deletedResource = "https://api.example.com/lifecycle-deleted";
	const disabledResource = "https://api.example.com/lifecycle-disabled";
	const harness = await bootHarness({
		disableJwtPlugin: true,
		resources: [
			{ identifier: deletedResource, customClaims: { dept: "ops" } },
			{ identifier: disabledResource, customClaims: { dept: "sec" } },
		],
	});
	let oauthClient: OAuthClient;

	beforeAll(async () => {
		oauthClient = await harness.registerClient();
	});

	it("reports inactive once the bound resource row is deleted", async () => {
		const token = await harness.mintToken(oauthClient, {
			resource: deletedResource,
		});
		const before = await harness.introspect({
			token,
			client_id: oauthClient.client_id,
			client_secret: oauthClient.client_secret,
		});
		expect(before.data?.active).toBe(true);
		expect(before.data?.dept).toBe("ops");

		const ctx = await harness.auth.$context;
		await ctx.adapter.delete({
			model: "oauthResource",
			where: [{ field: "identifier", value: deletedResource }],
		});

		const after = await harness.introspect({
			token,
			client_id: oauthClient.client_id,
			client_secret: oauthClient.client_secret,
		});
		expect(after.data?.active).toBe(false);
	});

	it("stays active and keeps its claims after the bound resource is disabled", async () => {
		const token = await harness.mintToken(oauthClient, {
			resource: disabledResource,
		});
		const ctx = await harness.auth.$context;
		await ctx.adapter.update({
			model: "oauthResource",
			where: [{ field: "identifier", value: disabledResource }],
			update: { disabled: true },
		});

		const introspection = await harness.introspect({
			token,
			client_id: oauthClient.client_id,
			client_secret: oauthClient.client_secret,
		});
		expect(introspection.data?.active).toBe(true);
		expect(introspection.data?.dept).toBe("sec");
	});
});

/**
 * @see https://github.com/better-auth/better-auth/issues/8267
 */
describe("introspection authorization (#8267) — opaque tokens", async () => {
	// The audience-scoped gate runs on the opaque re-derive path, not only the
	// JWT path covered above.
	const resource = "https://api.example.com/rs-8267-opaque";
	const harness = await bootHarness({
		disableJwtPlugin: true,
		resources: [resource],
	});
	let issuerClientA: OAuthClient;
	let resourceServerB: OAuthClient;
	let unrelatedClientC: OAuthClient;

	beforeAll(async () => {
		issuerClientA = await harness.registerClient();
		resourceServerB = await harness.registerClient();
		unrelatedClientC = await harness.registerClient();
		await harness.linkClientToResource(resourceServerB.client_id!, resource);
	});

	it("lets a linked resource server introspect an opaque resource-bound token", async () => {
		const token = await harness.mintToken(issuerClientA, { resource });
		const introspection = await harness.introspect({
			token,
			client_id: resourceServerB.client_id,
			client_secret: resourceServerB.client_secret,
		});
		expect(introspection.data?.active).toBe(true);
	});

	it("reports inactive to an unlinked client for an opaque token", async () => {
		const token = await harness.mintToken(issuerClientA, { resource });
		const introspection = await harness.introspect({
			token,
			client_id: unrelatedClientC.client_id,
			client_secret: unrelatedClientC.client_secret,
		});
		expect(introspection.data?.active).toBe(false);
	});
});

describe("introspection — pairwise sub across clients", async () => {
	// Cross-client introspection resolves pairwise `sub` for the token's ISSUING
	// client, so a resource server sees the subject the token actually
	// represents (stable for the user + issuing client), not one re-derived for
	// its own sector.
	const resource = "https://api.example.com/rs-pairwise";
	const harness = await bootHarness({
		pairwiseSecret: "pairwise-secret-at-least-32-chars-long",
		resources: [resource],
	});
	let issuerClient: OAuthClient;
	let resourceServer: OAuthClient;

	beforeAll(async () => {
		issuerClient = await harness.registerClient({ subject_type: "pairwise" });
		resourceServer = await harness.registerClient();
		await harness.linkClientToResource(resourceServer.client_id!, resource);
	});

	it("returns the issuing client's pairwise sub to a linked resource server", async () => {
		const token = await harness.mintToken(issuerClient, { resource });

		const issuerView = await harness.introspect({
			token,
			client_id: issuerClient.client_id,
			client_secret: issuerClient.client_secret,
		});
		const resourceServerView = await harness.introspect({
			token,
			client_id: resourceServer.client_id,
			client_secret: resourceServer.client_secret,
		});

		expect(issuerView.data?.active).toBe(true);
		expect(resourceServerView.data?.active).toBe(true);
		// Pairwise applied (not the raw user id), and identical for both callers.
		expect(issuerView.data?.sub).not.toBe(harness.user.id);
		expect(resourceServerView.data?.sub).toBe(issuerView.data?.sub);
	});
});
