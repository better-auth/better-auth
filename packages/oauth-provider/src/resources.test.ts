import { logger } from "@better-auth/core/env";
import { jwt } from "better-auth/plugins/jwt";
import { getTestInstance } from "better-auth/test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { oauthProvider } from "./oauth";
import {
	collectResourceInputs,
	combineResource,
	ensureResourceRow,
	getConfiguredResourcesMap,
	getResource,
	getResourceCustomClaims,
	invalidateResourceCache,
} from "./resources";
import type { OAuthOptions, OAuthResource, Scope } from "./types";

describe("collectResourceInputs", () => {
	let warnSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		warnSpy = vi.spyOn(logger, "warn").mockImplementation(() => undefined);
	});

	afterEach(() => {
		warnSpy.mockRestore();
	});

	it("does not warn when resources is used", () => {
		collectResourceInputs({ resources: ["https://api.example.com"] });
		expect(warnSpy).not.toHaveBeenCalled();
	});

	it("converts string entries in resources to identifier-only inputs", () => {
		const inputs = collectResourceInputs({
			resources: ["https://a", { identifier: "https://b", accessTokenTtl: 60 }],
		});
		expect(inputs).toEqual([
			{ identifier: "https://a" },
			{ identifier: "https://b", accessTokenTtl: 60 },
		]);
	});

	it("preserves configured resource order", () => {
		const inputs = collectResourceInputs({
			resources: [
				"https://first",
				{ identifier: "https://second", accessTokenTtl: 300 },
			],
		});
		expect(inputs).toEqual([
			{ identifier: "https://first" },
			{ identifier: "https://second", accessTokenTtl: 300 },
		]);
	});

	it("returns empty array when no resource config is provided", () => {
		expect(collectResourceInputs({})).toEqual([]);
	});
});

type ResourceTestOptions = Partial<OAuthOptions<Scope[]>>;

const bootWithResourcesOption = async (options: ResourceTestOptions = {}) => {
	const resolvedOpts = {
		loginPage: "/login",
		consentPage: "/consent",
		...options,
	} as OAuthOptions<Scope[]>;
	const instance = await getTestInstance({
		plugins: [jwt(), oauthProvider(resolvedOpts)],
	});
	return { ...instance, opts: resolvedOpts };
};

describe("combineResource", () => {
	const identifier = "https://api.example.com/test";
	const now = new Date(1000);
	const dbRow: OAuthResource = {
		id: "db-1",
		identifier,
		name: "DB Name",
		accessTokenTtl: 600,
		refreshTokenTtl: 1200,
		signingAlgorithm: "RS256",
		signingKeyId: "key-1",
		allowedScopes: ["read"],
		customClaims: { role: "admin" },
		dpopBoundAccessTokensRequired: false,
		disabled: false,
		policyVersion: 1,
		metadata: { env: "prod" },
		createdAt: now,
		updatedAt: now,
	};

	it("returns dbRow when configured is undefined", () => {
		expect(combineResource(dbRow, undefined, "insertOnly")).toBe(dbRow);
		expect(combineResource(dbRow, undefined, "merge")).toBe(dbRow);
		expect(combineResource(dbRow, undefined, "overwrite")).toBe(dbRow);
	});

	it("returns configured resource when dbRow is null", () => {
		const configured = {
			input: { identifier, name: "Config Name", accessTokenTtl: 300 },
			resource: {
				id: identifier,
				identifier,
				name: "Config Name",
				accessTokenTtl: 300,
				refreshTokenTtl: null,
				signingAlgorithm: null,
				signingKeyId: null,
				allowedScopes: null,
				customClaims: null,
				dpopBoundAccessTokensRequired: false,
				disabled: false,
				policyVersion: 1,
				metadata: null,
				createdAt: new Date(0),
				updatedAt: new Date(0),
			},
		};
		const result = combineResource(null, configured, "insertOnly");
		expect(result).toMatchObject({
			identifier,
			name: "Config Name",
			accessTokenTtl: 300,
		});
	});

	it("insertOnly returns dbRow unchanged when dbRow exists", () => {
		const configured = {
			input: { identifier, name: "New Name", accessTokenTtl: 100 },
			resource: {
				id: identifier,
				identifier,
				name: "New Name",
				accessTokenTtl: 100,
				disabled: false,
				policyVersion: 1,
				createdAt: new Date(0),
				updatedAt: new Date(0),
			},
		};
		const result = combineResource(dbRow, configured, "insertOnly");
		expect(result).toBe(dbRow);
		expect(result?.name).toBe("DB Name");
		expect(result?.accessTokenTtl).toBe(600);
	});

	it("merge overrides only fields explicitly defined on configured input", () => {
		const disabledDbRow: OAuthResource = { ...dbRow, disabled: true };
		const configured = {
			input: {
				identifier,
				accessTokenTtl: 100,
				customClaims: { extra: true },
				disabled: false,
			},
			resource: {
				id: identifier,
				identifier,
				name: identifier,
				accessTokenTtl: 100,
				customClaims: { extra: true },
				disabled: false,
				policyVersion: 1,
				createdAt: new Date(0),
				updatedAt: new Date(0),
			},
		};
		const result = combineResource(disabledDbRow, configured, "merge");
		expect(result).toMatchObject({
			id: "db-1",
			name: "DB Name",
			accessTokenTtl: 100,
			refreshTokenTtl: 1200,
			signingAlgorithm: "RS256",
			allowedScopes: ["read"],
			customClaims: { extra: true },
			disabled: false,
		});
	});

	it("overwrite replaces entire resource while preserving dbRow id, createdAt, and updatedAt", () => {
		const configured = {
			input: { identifier, accessTokenTtl: 100 },
			resource: {
				id: identifier,
				identifier,
				name: identifier,
				accessTokenTtl: 100,
				refreshTokenTtl: null,
				signingAlgorithm: null,
				signingKeyId: null,
				allowedScopes: null,
				customClaims: null,
				dpopBoundAccessTokensRequired: false,
				disabled: false,
				policyVersion: 1,
				metadata: null,
				createdAt: new Date(0),
				updatedAt: new Date(0),
			},
		};
		const result = combineResource(dbRow, configured, "overwrite");
		expect(result).toMatchObject({
			id: "db-1",
			createdAt: now,
			updatedAt: now,
			name: identifier,
			accessTokenTtl: 100,
			allowedScopes: null,
			customClaims: null,
		});
	});
});

describe("getResource and in-memory resolution", () => {
	let infoSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		infoSpy = vi.spyOn(logger, "info").mockImplementation(() => undefined);
	});

	afterEach(() => {
		infoSpy.mockRestore();
		invalidateResourceCache();
	});

	it("returns null when resource is neither in config nor in DB", async () => {
		const { auth, opts } = await bootWithResourcesOption({});
		const ctx = await auth.$context;
		const row = await getResource(
			{ context: ctx } as never,
			opts,
			"https://nope.example.com",
		);
		expect(row).toBeNull();
	});

	it("returns configured resource in memory when not in DB", async () => {
		const { auth, opts } = await bootWithResourcesOption({
			resources: [
				{
					identifier: "https://api.example.com/admin",
					name: "Admin API",
					accessTokenTtl: 300,
					allowedScopes: ["admin:read"],
					signingAlgorithm: "EdDSA",
				},
			],
		});
		const ctx = await auth.$context;
		const dbRow = await ctx.adapter.findOne({
			model: "oauthResource",
			where: [{ field: "identifier", value: "https://api.example.com/admin" }],
		});
		expect(dbRow).toBeNull();

		const res = await getResource(
			{ context: ctx } as never,
			opts,
			"https://api.example.com/admin",
		);
		expect(res).toMatchObject({
			identifier: "https://api.example.com/admin",
			name: "Admin API",
			accessTokenTtl: 300,
			allowedScopes: ["admin:read"],
			signingAlgorithm: "EdDSA",
		});

		const afterLookupDbRow = await ctx.adapter.findOne({
			model: "oauthResource",
			where: [{ field: "identifier", value: "https://api.example.com/admin" }],
		});
		expect(afterLookupDbRow).toBeNull();
	});

	it("logs the enforcePerClientResources resolution at init", async () => {
		await bootWithResourcesOption({
			resources: ["https://api.example.com"],
		});
		const allCalls = infoSpy.mock.calls
			.map((call: unknown[]) => String(call[0] ?? ""))
			.join("\n");
		expect(allCalls).toMatch(/enforcePerClientResources resolved to true/);
		expect(allCalls).toMatch(/default/);
	});

	it("caches when identifier is in cachedResources", async () => {
		const identifier = "https://api.example.com/cached";
		const cachedResources = new Set([identifier]);
		const { auth, opts } = await bootWithResourcesOption({
			resources: [identifier],
			cachedResources,
		});
		const ctx = await auth.$context;

		// Create row in DB first
		await ctx.adapter.create({
			model: "oauthResource",
			data: {
				identifier,
				name: "Original in DB",
				createdAt: new Date(),
				updatedAt: new Date(),
			} as never,
		});

		// First lookup populates the cache
		const first = await getResource(
			{ context: ctx } as never,
			opts,
			identifier,
		);
		expect(first?.name).toBe("Original in DB");

		// Mutate row in DB directly
		await ctx.adapter.update({
			model: "oauthResource",
			where: [{ field: "identifier", value: identifier }],
			update: { name: "Mutated in DB" },
		});

		// Cached lookup still returns the pre-mutation value
		const second = await getResource(
			{ context: ctx } as never,
			opts,
			identifier,
		);
		expect(second?.name).toBe("Original in DB");

		// After invalidation, the lookup reads the updated DB row
		invalidateResourceCache(identifier);
		const third = await getResource(
			{ context: ctx } as never,
			opts,
			identifier,
		);
		expect(third?.name).toBe("Mutated in DB");
	});

	it("falls back to the configured resource after an out-of-band delete (no tombstone suppression)", async () => {
		const identifier = "https://api.example.com/cached-tombstone";
		const cachedResources = new Set([identifier]);
		const { auth, opts } = await bootWithResourcesOption({
			resources: [identifier],
			cachedResources,
		});
		const ctx = await auth.$context;

		// Lazily persist the configured row.
		const seeded = await ensureResourceRow(
			{ context: ctx } as never,
			opts,
			identifier,
		);
		expect(seeded?.identifier).toBe(identifier);

		// First lookup populates the cache.
		const first = await getResource(
			{ context: ctx } as never,
			opts,
			identifier,
		);
		expect(first?.identifier).toBe(identifier);

		// Out-of-band delete bypasses `invalidateResourceCache` (external tooling).
		await ctx.adapter.delete({
			model: "oauthResource",
			where: [{ field: "identifier", value: identifier }],
		});

		// The DB view (what `listResourcesEndpoint` reads) is empty.
		const dbRow = await ctx.adapter.findOne({
			model: "oauthResource",
			where: [{ field: "identifier", value: identifier }],
		});
		expect(dbRow).toBeNull();

		// Without invalidation the opt-in cache still serves the stale row:
		// there is no tombstone tracking, so the delete is invisible here.
		const stale = await getResource(
			{ context: ctx } as never,
			opts,
			identifier,
		);
		expect(stale?.identifier).toBe(identifier);

		// Once invalidated, the read falls back to the in-memory configured
		// resource instead of staying null — and does not resurrect a DB row.
		invalidateResourceCache(identifier);
		const afterDelete = await getResource(
			{ context: ctx } as never,
			opts,
			identifier,
		);
		expect(afterDelete).not.toBeNull();
		expect(afterDelete).toMatchObject({
			identifier,
			name: identifier,
		});

		const again = await getResource(
			{ context: ctx } as never,
			opts,
			identifier,
		);
		expect(again).toMatchObject({
			identifier,
			name: identifier,
		});

		const resurrected = await ctx.adapter.findOne({
			model: "oauthResource",
			where: [{ field: "identifier", value: identifier }],
		});
		expect(resurrected).toBeNull();
	});
});

describe("getResourceCustomClaims", () => {
	it("resolves custom claims from in-memory configured resources", async () => {
		const { auth, opts } = await bootWithResourcesOption({
			resources: [
				{
					identifier: "https://api.example.com/claims-a",
					customClaims: { tenant: "123", role: "viewer" },
				},
				{
					identifier: "https://api.example.com/claims-b",
					customClaims: { role: "admin", plan: "pro" },
				},
			],
		});
		const ctx = await auth.$context;

		const claims = await getResourceCustomClaims(
			{ context: ctx } as never,
			opts,
			["https://api.example.com/claims-a", "https://api.example.com/claims-b"],
		);
		expect(claims).toEqual({
			tenant: "123",
			role: "admin",
			plan: "pro",
		});
	});
});

describe("getConfiguredResourcesMap validator priority", () => {
	let warnSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		warnSpy = vi.spyOn(logger, "warn").mockImplementation(() => undefined);
	});

	afterEach(() => {
		warnSpy.mockRestore();
	});

	it("honors custom identifierValidator and bypasses ResourceUriSchema", () => {
		const nonUriIdentifier = "custom-identifier-without-scheme";
		const opts: OAuthOptions<Scope[]> = {
			resources: [nonUriIdentifier],
			identifierValidator: (id: string) => id === nonUriIdentifier,
		} as never;

		const map = getConfiguredResourcesMap(opts);
		expect(map.has(nonUriIdentifier)).toBe(true);
		expect(map.get(nonUriIdentifier)?.resource.identifier).toBe(
			nonUriIdentifier,
		);
		expect(warnSpy).not.toHaveBeenCalled();
	});

	it("indexes resource in getConfiguredResourcesMap synchronously and defers identifierValidator", () => {
		const blocked = "https://blocked.example.com/api";
		const opts: OAuthOptions<Scope[]> = {
			resources: [blocked],
			identifierValidator: () => false,
		} as never;

		const map = getConfiguredResourcesMap(opts);
		expect(map.has(blocked)).toBe(true);
	});

	it("falls back to ResourceUriSchema when no custom identifierValidator is provided", () => {
		const invalidUri = "not a valid uri";
		const opts: OAuthOptions<Scope[]> = {
			resources: [invalidUri],
		} as never;

		const map = getConfiguredResourcesMap(opts);
		expect(map.has(invalidUri)).toBe(false);
		expect(warnSpy).toHaveBeenCalledWith(
			expect.stringContaining("absolute URI"),
		);
	});
});

describe("identifierValidator in getResource and ensureResourceRow", () => {
	it("rejects resource lookup and row seeding when synchronous validator returns false", async () => {
		const blocked = "https://blocked.example.com/api";
		const { auth, opts } = await bootWithResourcesOption({
			resources: [blocked],
			identifierValidator: () => false,
		});
		const ctx = await auth.$context;

		const res = await getResource({ context: ctx } as never, opts, blocked);
		expect(res).toBeNull();

		const seeded = await ensureResourceRow(
			{ context: ctx } as never,
			opts,
			blocked,
		);
		expect(seeded).toBeNull();
	});

	it("supports asynchronous identifierValidator in getResource and ensureResourceRow", async () => {
		const allowed = "https://allowed.example.com/api";
		const blocked = "https://blocked.example.com/api";
		const { auth, opts } = await bootWithResourcesOption({
			resources: [allowed, blocked],
			identifierValidator: async (id: string) => {
				await new Promise((r) => setTimeout(r, 5));
				return id === allowed;
			},
		});
		const ctx = await auth.$context;

		const resAllowed = await getResource(
			{ context: ctx } as never,
			opts,
			allowed,
		);
		expect(resAllowed).not.toBeNull();
		expect(resAllowed?.identifier).toBe(allowed);

		const resBlocked = await getResource(
			{ context: ctx } as never,
			opts,
			blocked,
		);
		expect(resBlocked).toBeNull();

		const seededBlocked = await ensureResourceRow(
			{ context: ctx } as never,
			opts,
			blocked,
		);
		expect(seededBlocked).toBeNull();

		const seededAllowed = await ensureResourceRow(
			{ context: ctx } as never,
			opts,
			allowed,
		);
		expect(seededAllowed).not.toBeNull();
		expect(seededAllowed?.identifier).toBe(allowed);
	});
});

describe("multi-instance resourceCache isolation", () => {
	afterEach(() => {
		invalidateResourceCache();
	});

	it("does not store negative cache (null) in resourceCache on DB miss", async () => {
		const identifier = "https://api.example.com/negative-cache-test";
		const cachedResources = new Set([identifier]);

		// Instance A has no DB row and no config
		const { auth: authA, opts: optsA } = await bootWithResourcesOption({
			cachedResources,
		});
		const ctxA = await authA.$context;

		// Instance A misses
		const resA = await getResource(
			{ context: ctxA } as never,
			optsA,
			identifier,
		);
		expect(resA).toBeNull();

		// Instance B creates the DB row
		const { auth: authB, opts: optsB } = await bootWithResourcesOption({
			cachedResources,
		});
		const ctxB = await authB.$context;

		await ctxB.adapter.create({
			model: "oauthResource",
			data: {
				identifier,
				name: "Created Later",
				createdAt: new Date(),
				updatedAt: new Date(),
			} as never,
		});

		// Instance B must see the DB row because null was not cached
		const resB = await getResource(
			{ context: ctxB } as never,
			optsB,
			identifier,
		);
		expect(resB).not.toBeNull();
		expect(resB?.name).toBe("Created Later");
	});

	it("stores DB rows only and avoids policy bleed across auth instances", async () => {
		const identifier = "https://api.example.com/shared";
		const cachedResources = new Set([identifier]);

		// Boot first instance with merge mode and specific TTL
		const { auth: authA, opts: optsA } = await bootWithResourcesOption({
			resources: [
				{
					identifier,
					name: "Instance A Name",
					accessTokenTtl: 111,
				},
			],
			resourceSeedMode: "merge",
			cachedResources,
		});
		const ctxA = await authA.$context;

		// Seed row in the DB with null accessTokenTtl and specific refreshTokenTtl
		await ctxA.adapter.create({
			model: "oauthResource",
			data: {
				identifier,
				name: "DB Base Name",
				accessTokenTtl: null,
				refreshTokenTtl: 1200,
				createdAt: new Date(),
				updatedAt: new Date(),
			} as never,
		});

		// Boot second instance with different configured policy on the same identifier
		const { auth: authB, opts: optsB } = await bootWithResourcesOption({
			resources: [
				{
					identifier,
					name: "Instance B Name",
					accessTokenTtl: 999,
				},
			],
			resourceSeedMode: "merge",
			cachedResources,
		});
		const ctxB = await authB.$context;

		// Instance A lookup populates resourceCache with the DB row
		const resA = await getResource(
			{ context: ctxA } as never,
			optsA,
			identifier,
		);
		expect(resA?.accessTokenTtl).toBe(111);
		expect(resA?.name).toBe("Instance A Name");
		expect(resA?.refreshTokenTtl).toBe(1200);

		// Instance B lookup hits the cached DB row and combines with Instance B's configuration
		const resB = await getResource(
			{ context: ctxB } as never,
			optsB,
			identifier,
		);
		expect(resB?.accessTokenTtl).toBe(999);
		expect(resB?.name).toBe("Instance B Name");
		expect(resB?.refreshTokenTtl).toBe(1200);
	});
});

describe("getResourceCustomClaims under a bounded findMany limit", () => {
	it("returns saved claims for every requested identifier", async () => {
		const idA = "https://api.example.com/claims-bound-a";
		const idB = "https://api.example.com/claims-bound-b";
		const resolvedOpts = {
			loginPage: "/login",
			consentPage: "/consent",
			resources: [
				{ identifier: idA, customClaims: { permA: "configured" } },
				{ identifier: idB, customClaims: { permB: "configured" } },
			],
		} as OAuthOptions<Scope[]>;
		const instance = await getTestInstance({
			plugins: [jwt(), oauthProvider(resolvedOpts)],
			advanced: { database: { defaultFindManyLimit: 1 } },
		});
		const ctx = await instance.auth.$context;
		for (const [identifier, perm] of [
			[idA, "permA"],
			[idB, "permB"],
		] as const) {
			await ensureResourceRow(
				{ context: ctx } as never,
				resolvedOpts,
				identifier,
			);
			await ctx.adapter.update({
				model: "oauthResource",
				where: [{ field: "identifier", value: identifier }],
				update: {
					customClaims: { [perm]: "saved" },
					updatedAt: new Date(),
				} as never,
			});
		}

		const claims = await getResourceCustomClaims(
			{ context: ctx } as never,
			resolvedOpts,
			[idA, idB],
		);
		expect(claims).toEqual({ permA: "saved", permB: "saved" });
	});
});

describe("ensureResourceRow per-adapter single-flight", () => {
	it("persists a row in each database when two instances ensure the same identifier", async () => {
		const identifier = "https://api.example.com/shared-ensure";
		const first = await bootWithResourcesOption({ resources: [identifier] });
		const second = await bootWithResourcesOption({ resources: [identifier] });
		const ctxA = await first.auth.$context;
		const ctxB = await second.auth.$context;

		const [rowA, rowB] = await Promise.all([
			ensureResourceRow({ context: ctxA } as never, first.opts, identifier),
			ensureResourceRow({ context: ctxB } as never, second.opts, identifier),
		]);
		expect(rowA?.identifier).toBe(identifier);
		expect(rowB?.identifier).toBe(identifier);

		const storedA = await ctxA.adapter.findOne({
			model: "oauthResource",
			where: [{ field: "identifier", value: identifier }],
		});
		const storedB = await ctxB.adapter.findOne({
			model: "oauthResource",
			where: [{ field: "identifier", value: identifier }],
		});
		expect(storedA).not.toBeNull();
		expect(storedB).not.toBeNull();
	});
});
