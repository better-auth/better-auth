import { logger } from "@better-auth/core/env";
import { jwt } from "better-auth/plugins/jwt";
import { getTestInstance } from "better-auth/test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { oauthProvider } from "./oauth";
import {
	collectResourceInputs,
	combineResource,
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
		const configured = {
			input: { identifier, accessTokenTtl: 100, customClaims: { extra: true } },
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
		const result = combineResource(dbRow, configured, "merge");
		expect(result).toMatchObject({
			id: "db-1",
			name: "DB Name",
			accessTokenTtl: 100,
			refreshTokenTtl: 1200,
			signingAlgorithm: "RS256",
			allowedScopes: ["read"],
			customClaims: { extra: true },
		});
	});

	it("overwrite replaces entire resource while preserving dbRow id and createdAt", () => {
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

	it("skips resource when custom identifierValidator returns false", () => {
		const blocked = "https://blocked.example.com/api";
		const opts: OAuthOptions<Scope[]> = {
			resources: [blocked],
			identifierValidator: () => false,
		} as never;

		const map = getConfiguredResourcesMap(opts);
		expect(map.has(blocked)).toBe(false);
		expect(warnSpy).toHaveBeenCalledWith(
			expect.stringContaining("custom validator returned false"),
		);
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

describe("multi-instance resourceCache isolation", () => {
	afterEach(() => {
		invalidateResourceCache();
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

		// Seed row in the DB with null TTL
		await ctxA.adapter.create({
			model: "oauthResource",
			data: {
				identifier,
				name: "DB Base Name",
				accessTokenTtl: null,
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

		// Instance B lookup hits the cached DB row and combines with Instance B's configuration
		const resB = await getResource(
			{ context: ctxB } as never,
			optsB,
			identifier,
		);
		expect(resB?.accessTokenTtl).toBe(999);
		expect(resB?.name).toBe("Instance B Name");
	});
});
