import type { AuthContext } from "@better-auth/core";
import { logger } from "@better-auth/core/env";
import { jwt } from "better-auth/plugins/jwt";
import { getTestInstance } from "better-auth/test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { oauthProvider } from "./oauth";
import {
	RESERVED_RFC9068_CLAIMS,
	resetSeedStateForTests,
	resolveResourcePolicy,
	seedResourcesOnce,
	stripReservedClaims,
} from "./resources";
import type { OAuthClientResource, OAuthOptions, Scope } from "./types";

const silenceWarnings = {
	oauthAuthServerConfig: true,
	openidConfig: true,
} as const;

const bootProvider = async (options: Partial<OAuthOptions<Scope[]>> = {}) => {
	const opts = {
		loginPage: "/login",
		consentPage: "/consent",
		silenceWarnings,
		enforcePerClientResources: false,
		...options,
	} as OAuthOptions<Scope[]>;
	const instance = await getTestInstance({
		plugins: [jwt(), oauthProvider(opts)],
	});
	resetSeedStateForTests();
	const ctx = await instance.auth.$context;
	await seedResourcesOnce(ctx as unknown as AuthContext, opts);
	return { ...instance, ctx, opts };
};

const fakeEndpointCtx = (
	authCtx: Awaited<ReturnType<typeof bootProvider>>["ctx"],
) =>
	({
		context: authCtx,
		body: {},
	}) as never;

describe("stripReservedClaims", () => {
	it("preserves non-reserved claims and returns a fresh object", () => {
		const input = { foo: "bar", role: "admin" };
		const output = stripReservedClaims(input);
		expect(output).toEqual({ foo: "bar", role: "admin" });
		expect(output).not.toBe(input);
	});

	it("strips every RFC 9068 reserved claim", () => {
		const allReserved = Object.fromEntries(
			[...RESERVED_RFC9068_CLAIMS].map((k) => [k, "evil"]),
		);
		expect(stripReservedClaims(allReserved)).toEqual({});
	});

	it("logs a warning naming the stripped reserved keys", () => {
		const warnSpy = vi
			.spyOn(logger, "warn")
			.mockImplementation(() => undefined);
		try {
			stripReservedClaims({ iss: "evil", foo: "ok", jti: "evil2" });
			expect(warnSpy).toHaveBeenCalledOnce();
			const [message] = warnSpy.mock.calls[0] ?? [];
			expect(String(message)).toMatch(/stripped reserved RFC 9068 claim/i);
			expect(String(message)).toMatch(/iss/);
			expect(String(message)).toMatch(/jti/);
		} finally {
			warnSpy.mockRestore();
		}
	});

	it("handles null and undefined input without crashing", () => {
		expect(stripReservedClaims(null)).toEqual({});
		expect(stripReservedClaims(undefined)).toEqual({});
	});
});

describe("resolveResourcePolicy — resource omission", () => {
	it("returns no aud claim when neither resource nor openid scope is present", async () => {
		const { ctx, opts } = await bootProvider();
		const policy = await resolveResourcePolicy(fakeEndpointCtx(ctx), opts, {
			resource: undefined,
			clientId: "client-x",
			requestedScopes: [],
		});
		expect(policy.audienceClaim).toBeUndefined();
		expect(policy.accessTokenTtl).toBeNull();
	});

	it("does NOT add the implicit /oauth2/userinfo aud when no resource is requested", async () => {
		// Pre-entity behavior preserved: an access token requested without
		// `resource` has no `aud` claim, regardless of `openid` scope. The
		// implicit userinfo audience is only added when a real RFC 8707
		// resource is also requested. Otherwise an openid-only request would
		// inadvertently convert opaque tokens to JWTs in deployments that
		// rely on resource omission for the legacy opaque path.
		const { ctx, opts } = await bootProvider();
		const policy = await resolveResourcePolicy(fakeEndpointCtx(ctx), opts, {
			resource: undefined,
			clientId: "client-x",
			requestedScopes: ["openid", "profile"],
		});
		expect(policy.audienceClaim).toBeUndefined();
	});

	it("adds the implicit /oauth2/userinfo aud alongside a requested resource when openid is in scope", async () => {
		// When the request DOES include a `resource`, the userinfo audience
		// piggybacks (the OIDC userinfo endpoint expects to find itself in
		// `aud`). Single resource + openid → ["resource", userInfoAud].
		const id = "https://api.example.com/openid-with-resource";
		const { ctx, opts } = await bootProvider({
			resources: [id],
		});
		const policy = await resolveResourcePolicy(fakeEndpointCtx(ctx), opts, {
			resource: id,
			clientId: "client-x",
			requestedScopes: ["openid", "profile"],
		});
		const expected = [id, `${ctx.baseURL}/oauth2/userinfo`];
		expect(policy.audienceClaim).toStrictEqual(expected);
	});

	it("rejects baseURL when it is not configured as a resource", async () => {
		const { ctx, opts } = await bootProvider();
		await expect(
			resolveResourcePolicy(fakeEndpointCtx(ctx), opts, {
				resource: ctx.baseURL,
				clientId: "client-x",
				requestedScopes: [],
			}),
		).rejects.toMatchObject({
			body: expect.objectContaining({ error: "invalid_target" }),
		});
	});

	it("rejects unknown resources when no resource config is set", async () => {
		const { ctx, opts } = await bootProvider();
		await expect(
			resolveResourcePolicy(fakeEndpointCtx(ctx), opts, {
				resource: "https://api.example.com/unknown",
				clientId: "client-x",
				requestedScopes: [],
			}),
		).rejects.toMatchObject({
			body: expect.objectContaining({ error: "invalid_target" }),
		});
	});
});

describe("resolveResourcePolicy — entity path", () => {
	it("rejects unknown resource identifiers", async () => {
		const { ctx, opts } = await bootProvider({
			resources: ["https://api.example.com"],
		});
		await expect(
			resolveResourcePolicy(fakeEndpointCtx(ctx), opts, {
				resource: "https://api.example.com/not-configured",
				clientId: "client-x",
				requestedScopes: [],
			}),
		).rejects.toMatchObject({
			body: expect.objectContaining({ error: "invalid_target" }),
		});
	});

	it("rejects disabled resources", async () => {
		const { auth, ctx, opts } = await bootProvider({
			resources: ["https://api.example.com/disabled"],
		});
		// Mark the row as disabled directly via the adapter.
		await ctx.adapter.update({
			model: "oauthResource",
			where: [
				{ field: "identifier", value: "https://api.example.com/disabled" },
			],
			update: { disabled: true },
		});
		await expect(
			resolveResourcePolicy(fakeEndpointCtx(ctx), opts, {
				resource: "https://api.example.com/disabled",
				clientId: "client-x",
				requestedScopes: [],
			}),
		).rejects.toMatchObject({
			body: expect.objectContaining({ error: "invalid_target" }),
		});
		void auth; // silence unused
	});

	it("returns per-resource TTL when set", async () => {
		const { ctx, opts } = await bootProvider({
			resources: ["https://api.example.com/ttl-test"],
		});
		// Update the row with an explicit TTL after seeding.
		await ctx.adapter.update({
			model: "oauthResource",
			where: [
				{ field: "identifier", value: "https://api.example.com/ttl-test" },
			],
			update: { accessTokenTtl: 120 },
		});
		const policy = await resolveResourcePolicy(fakeEndpointCtx(ctx), opts, {
			resource: "https://api.example.com/ttl-test",
			clientId: "client-x",
			requestedScopes: [],
		});
		expect(policy.accessTokenTtl).toBe(120);
	});

	it("uses the minimum TTL across multiple requested resources", async () => {
		const ids = [
			"https://api.example.com/a",
			"https://api.example.com/b",
			"https://api.example.com/c",
		];
		const { ctx, opts } = await bootProvider({
			resources: ids,
		});
		for (const [id, ttl] of [
			[ids[0], 300],
			[ids[1], 60],
			[ids[2], 900],
		] as const) {
			await ctx.adapter.update({
				model: "oauthResource",
				where: [{ field: "identifier", value: id! }],
				update: { accessTokenTtl: ttl },
			});
		}
		const policy = await resolveResourcePolicy(fakeEndpointCtx(ctx), opts, {
			resource: ids,
			clientId: "client-x",
			requestedScopes: [],
		});
		expect(policy.accessTokenTtl).toBe(60);
	});

	it("returns null TTL when no requested resource pins one", async () => {
		const { ctx, opts } = await bootProvider({
			resources: ["https://api.example.com/no-ttl"],
		});
		const policy = await resolveResourcePolicy(fakeEndpointCtx(ctx), opts, {
			resource: "https://api.example.com/no-ttl",
			clientId: "client-x",
			requestedScopes: [],
		});
		expect(policy.accessTokenTtl).toBeNull();
	});

	it("narrows requested scopes to the resource's allowedScopes intersection", async () => {
		// Per-resource allowlists are a narrowing filter, not an
		// all-or-nothing gate. RFC 6749 §3.3 — AS MAY narrow, MUST NOT widen.
		// Request ["read:public", "admin:write"] with allowlist
		// ["read:public"] → effectiveScopes = ["read:public"], not a reject.
		const id = "https://api.example.com/scope-restricted";
		const { ctx, opts } = await bootProvider({
			resources: [id],
		});
		await ctx.adapter.update({
			model: "oauthResource",
			where: [{ field: "identifier", value: id }],
			update: { allowedScopes: ["read:public"] },
		});
		const policy = await resolveResourcePolicy(fakeEndpointCtx(ctx), opts, {
			resource: id,
			clientId: "client-x",
			requestedScopes: ["read:public", "admin:write"],
		});
		expect(policy.effectiveScopes).toStrictEqual(["read:public"]);
	});

	it("rejects when no requested scope intersects allowedScopes", async () => {
		// Edge case: empty intersection fails closed with `invalid_scope`. A
		// token with no scopes for a resource that refuses all of them isn't
		// useful and would mask the misconfiguration.
		const id = "https://api.example.com/scope-no-intersect";
		const { ctx, opts } = await bootProvider({
			resources: [id],
		});
		await ctx.adapter.update({
			model: "oauthResource",
			where: [{ field: "identifier", value: id }],
			update: { allowedScopes: ["read:public"] },
		});
		await expect(
			resolveResourcePolicy(fakeEndpointCtx(ctx), opts, {
				resource: id,
				clientId: "client-x",
				requestedScopes: ["admin:write"],
			}),
		).rejects.toMatchObject({
			body: expect.objectContaining({ error: "invalid_scope" }),
		});
	});

	it("passes when requested scopes are within allowedScopes", async () => {
		const id = "https://api.example.com/scope-ok";
		const { ctx, opts } = await bootProvider({
			resources: [id],
		});
		await ctx.adapter.update({
			model: "oauthResource",
			where: [{ field: "identifier", value: id }],
			update: { allowedScopes: ["read", "write"] },
		});
		const policy = await resolveResourcePolicy(fakeEndpointCtx(ctx), opts, {
			resource: id,
			clientId: "client-x",
			requestedScopes: ["read"],
		});
		expect(policy.audienceClaim).toBe(id);
	});

	it("treats null allowedScopes as 'no restriction'", async () => {
		const id = "https://api.example.com/unrestricted";
		const { ctx, opts } = await bootProvider({
			resources: [id],
		});
		const policy = await resolveResourcePolicy(fakeEndpointCtx(ctx), opts, {
			resource: id,
			clientId: "client-x",
			requestedScopes: ["read", "write", "anything"],
		});
		expect(policy.audienceClaim).toBe(id);
	});

	it("returns single-resource signing config", async () => {
		const id = "https://api.example.com/signed";
		const { ctx, opts } = await bootProvider({
			resources: [id],
		});
		await ctx.adapter.update({
			model: "oauthResource",
			where: [{ field: "identifier", value: id }],
			update: {
				signingAlgorithm: "EdDSA",
				signingKeyId: "kid-xyz",
			},
		});
		const policy = await resolveResourcePolicy(fakeEndpointCtx(ctx), opts, {
			resource: id,
			clientId: "client-x",
			requestedScopes: [],
		});
		expect(policy.signingAlgorithm).toBe("EdDSA");
		expect(policy.signingKeyId).toBe("kid-xyz");
	});

	it("throws on multi-resource requests where resources pin conflicting signing keys", async () => {
		const idA = "https://api.example.com/sig-a";
		const idB = "https://api.example.com/sig-b";
		const { ctx, opts } = await bootProvider({
			resources: [idA, idB],
		});
		await ctx.adapter.update({
			model: "oauthResource",
			where: [{ field: "identifier", value: idA }],
			update: { signingAlgorithm: "EdDSA", signingKeyId: "kid-a" },
		});
		await ctx.adapter.update({
			model: "oauthResource",
			where: [{ field: "identifier", value: idB }],
			update: { signingAlgorithm: "ES256", signingKeyId: "kid-b" },
		});
		await expect(
			resolveResourcePolicy(fakeEndpointCtx(ctx), opts, {
				resource: [idA, idB],
				clientId: "client-x",
				requestedScopes: [],
			}),
		).rejects.toMatchObject({
			body: expect.objectContaining({ error: "invalid_request" }),
		});
	});

	it("accepts multi-resource requests when every pin agrees on alg and kid", async () => {
		// RFC 7515 §4.1 — a single JWS signature has one alg and one kid.
		// When every requested resource pins the SAME alg + kid, that single
		// signature satisfies all of them. The previous "any pin → reject"
		// rule over-constrained this operationally common case (e.g. a fleet
		// of resource servers that all consume EdDSA tokens signed by the
		// same active key).
		const idA = "https://api.example.com/sig-agree-a";
		const idB = "https://api.example.com/sig-agree-b";
		const { ctx, opts } = await bootProvider({
			resources: [idA, idB],
		});
		await ctx.adapter.update({
			model: "oauthResource",
			where: [{ field: "identifier", value: idA }],
			update: { signingAlgorithm: "EdDSA", signingKeyId: "kid-shared" },
		});
		await ctx.adapter.update({
			model: "oauthResource",
			where: [{ field: "identifier", value: idB }],
			update: { signingAlgorithm: "EdDSA", signingKeyId: "kid-shared" },
		});
		const policy = await resolveResourcePolicy(fakeEndpointCtx(ctx), opts, {
			resource: [idA, idB],
			clientId: "client-x",
			requestedScopes: [],
		});
		expect(policy.signingAlgorithm).toBe("EdDSA");
		expect(policy.signingKeyId).toBe("kid-shared");
	});

	it("accepts multi-resource requests where compatible pins are spread across resources", async () => {
		// Mixed pin shapes: one resource pins only an alg, another resource pins only
		// a kid. The unique sets still collapse to ≤ 1 entry each, so the
		// compatibility check passes. (If the chosen kid's key turns out not
		// to carry the chosen alg, `resolveSigningKey()` in the JWT plugin
		// rejects at signing time with a precise error — that's a runtime
		// JWKS shape concern, not a policy-time invariant.)
		const idA = "https://api.example.com/sig-mixed-a";
		const idB = "https://api.example.com/sig-mixed-b";
		const { ctx, opts } = await bootProvider({
			resources: [idA, idB],
		});
		await ctx.adapter.update({
			model: "oauthResource",
			where: [{ field: "identifier", value: idA }],
			update: { signingAlgorithm: "EdDSA", signingKeyId: null },
		});
		await ctx.adapter.update({
			model: "oauthResource",
			where: [{ field: "identifier", value: idB }],
			update: { signingAlgorithm: null, signingKeyId: "kid-shared" },
		});
		const policy = await resolveResourcePolicy(fakeEndpointCtx(ctx), opts, {
			resource: [idA, idB],
			clientId: "client-x",
			requestedScopes: [],
		});
		expect(policy.signingAlgorithm).toBe("EdDSA");
		expect(policy.signingKeyId).toBe("kid-shared");
	});

	it("accepts multi-resource requests where only one resource pins and others inherit defaults", async () => {
		// Unpinned resources contribute no entry to either unique set, so a
		// single pinned resource among unpinned siblings is unambiguous.
		// Previously rejected by the "someoneHasSigningOverride" branch.
		const idA = "https://api.example.com/sig-partial-a";
		const idB = "https://api.example.com/sig-partial-b";
		const { ctx, opts } = await bootProvider({
			resources: [idA, idB],
		});
		await ctx.adapter.update({
			model: "oauthResource",
			where: [{ field: "identifier", value: idA }],
			update: { signingAlgorithm: "EdDSA", signingKeyId: "kid-only-a" },
		});
		// idB stays at default (signingAlgorithm: null, signingKeyId: null)
		const policy = await resolveResourcePolicy(fakeEndpointCtx(ctx), opts, {
			resource: [idA, idB],
			clientId: "client-x",
			requestedScopes: [],
		});
		expect(policy.signingAlgorithm).toBe("EdDSA");
		expect(policy.signingKeyId).toBe("kid-only-a");
	});

	it("rejects when algs agree but kids conflict (partial conflict — kid)", async () => {
		const idA = "https://api.example.com/sig-kid-conflict-a";
		const idB = "https://api.example.com/sig-kid-conflict-b";
		const { ctx, opts } = await bootProvider({
			resources: [idA, idB],
		});
		await ctx.adapter.update({
			model: "oauthResource",
			where: [{ field: "identifier", value: idA }],
			update: { signingAlgorithm: "EdDSA", signingKeyId: "kid-a" },
		});
		await ctx.adapter.update({
			model: "oauthResource",
			where: [{ field: "identifier", value: idB }],
			update: { signingAlgorithm: "EdDSA", signingKeyId: "kid-b" },
		});
		await expect(
			resolveResourcePolicy(fakeEndpointCtx(ctx), opts, {
				resource: [idA, idB],
				clientId: "client-x",
				requestedScopes: [],
			}),
		).rejects.toMatchObject({
			body: expect.objectContaining({
				error: "invalid_request",
				error_description: expect.stringContaining("signingKeyId"),
			}),
		});
	});

	it("rejects when kids agree but algs conflict (partial conflict — alg)", async () => {
		const idA = "https://api.example.com/sig-alg-conflict-a";
		const idB = "https://api.example.com/sig-alg-conflict-b";
		const { ctx, opts } = await bootProvider({
			resources: [idA, idB],
		});
		await ctx.adapter.update({
			model: "oauthResource",
			where: [{ field: "identifier", value: idA }],
			update: { signingAlgorithm: "EdDSA", signingKeyId: "kid-shared" },
		});
		await ctx.adapter.update({
			model: "oauthResource",
			where: [{ field: "identifier", value: idB }],
			update: { signingAlgorithm: "ES256", signingKeyId: "kid-shared" },
		});
		await expect(
			resolveResourcePolicy(fakeEndpointCtx(ctx), opts, {
				resource: [idA, idB],
				clientId: "client-x",
				requestedScopes: [],
			}),
		).rejects.toMatchObject({
			body: expect.objectContaining({
				error: "invalid_request",
				error_description: expect.stringContaining("signingAlgorithm"),
			}),
		});
	});

	it("merges per-resource customClaims (later wins) and strips reserved", async () => {
		const idA = "https://api.example.com/claims-a";
		const idB = "https://api.example.com/claims-b";
		const { ctx, opts } = await bootProvider({
			resources: [idA, idB],
		});
		await ctx.adapter.update({
			model: "oauthResource",
			where: [{ field: "identifier", value: idA }],
			update: { customClaims: { dept: "finance", iss: "evil-A" } },
		});
		await ctx.adapter.update({
			model: "oauthResource",
			where: [{ field: "identifier", value: idB }],
			update: { customClaims: { dept: "ops", region: "us" } },
		});
		const policy = await resolveResourcePolicy(fakeEndpointCtx(ctx), opts, {
			resource: [idA, idB],
			clientId: "client-x",
			requestedScopes: [],
		});
		expect(policy.customClaims).toEqual({
			dept: "ops", // later wins
			region: "us",
		});
		expect(policy.customClaims).not.toHaveProperty("iss"); // reserved → stripped
	});
});

describe("resolveResourcePolicy — enforcePerClientResources", () => {
	/**
	 * Inserts an oauthClient row directly. The FK on
	 * `oauthClientResource.clientId` references `oauthClient.clientId`, so
	 * the client row must exist before we can link it.
	 */
	const seedClient = async (
		ctx: Awaited<ReturnType<typeof bootProvider>>["ctx"],
		clientId: string,
	) => {
		await ctx.adapter.create({
			model: "oauthClient",
			data: {
				clientId,
				redirectUris: ["https://example.com/callback"],
				createdAt: new Date(),
				updatedAt: new Date(),
			} as never,
		});
	};

	const seedClientLink = async (
		ctx: Awaited<ReturnType<typeof bootProvider>>["ctx"],
		clientId: string,
		resourceId: string,
	) => {
		await seedClient(ctx, clientId);
		await ctx.adapter.create<Omit<OAuthClientResource, never>>({
			model: "oauthClientResource",
			data: {
				clientId,
				resourceId,
				createdAt: new Date(),
			} as never,
		});
	};

	it("rejects unlinked clients when enforcement is on", async () => {
		const id = "https://api.example.com/locked";
		const { ctx, opts } = await bootProvider({
			resources: [id],
			enforcePerClientResources: true,
		});
		await expect(
			resolveResourcePolicy(fakeEndpointCtx(ctx), opts, {
				resource: id,
				clientId: "client-not-linked",
				requestedScopes: [],
			}),
		).rejects.toMatchObject({
			body: expect.objectContaining({ error: "invalid_target" }),
		});
	});

	it("accepts linked clients when enforcement is on", async () => {
		const id = "https://api.example.com/linked";
		const { ctx, opts } = await bootProvider({
			resources: [id],
			enforcePerClientResources: true,
		});
		await seedClientLink(ctx, "client-linked", id);
		const policy = await resolveResourcePolicy(fakeEndpointCtx(ctx), opts, {
			resource: id,
			clientId: "client-linked",
			requestedScopes: [],
		});
		expect(policy.audienceClaim).toBe(id);
	});

	it("skips linkage check when enforcement is explicitly off", async () => {
		const id = "https://api.example.com/explicit-off-unlinked";
		const { ctx, opts } = await bootProvider({
			resources: [id],
			enforcePerClientResources: false,
		});
		const policy = await resolveResourcePolicy(fakeEndpointCtx(ctx), opts, {
			resource: id,
			clientId: "client-unlinked",
			requestedScopes: [],
		});
		expect(policy.audienceClaim).toBe(id);
	});

	it("explicit enforcePerClientResources:false beats the smart default", async () => {
		const id = "https://api.example.com/explicit-off";
		const { ctx, opts } = await bootProvider({
			resources: [id],
			enforcePerClientResources: false,
		});
		const policy = await resolveResourcePolicy(fakeEndpointCtx(ctx), opts, {
			resource: id,
			clientId: "client-unlinked",
			requestedScopes: [],
		});
		expect(policy.audienceClaim).toBe(id);
	});
});

// File-level guard for startup logs emitted by plugin init.
beforeEach(() => {
	vi.spyOn(logger, "warn").mockImplementation(() => undefined);
	vi.spyOn(logger, "info").mockImplementation(() => undefined);
});
afterEach(() => {
	vi.restoreAllMocks();
});
