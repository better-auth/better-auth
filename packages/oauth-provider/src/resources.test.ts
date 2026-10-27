/**
 * @see https://github.com/better-auth/better-auth/issues/11725
 */
import type { AuthContext } from "@better-auth/core";
import { logger } from "@better-auth/core/env";
import { jwt } from "better-auth/plugins/jwt";
import { getTestInstance } from "better-auth/test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { oauthProvider } from "./oauth";
import {
	collectResourceInputs,
	combineResource,
	ensureResourceRow,
	getResource,
	indexConfiguredResources,
	invalidateResourceCache,
	isResourceTombstoned,
	omitDeleted,
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

const readResourceRow = async (
	auth: Awaited<ReturnType<typeof bootWithResourcesOption>>["auth"],
	identifier: string,
) =>
	auth.$context.then((ctx) =>
		ctx.adapter.findOne<OAuthResource>({
			model: "oauthResource",
			where: [{ field: "identifier", value: identifier }],
		}),
	);

describe("in-memory resource resolution and read-time combine", () => {
	let infoSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		infoSpy = vi.spyOn(logger, "info").mockImplementation(() => undefined);
	});

	afterEach(() => {
		infoSpy.mockRestore();
		invalidateResourceCache();
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

	/**
	 * @see https://github.com/better-auth/better-auth/issues/11725
	 */
	it("returns synthetic policy for config-only resource without creating a database row", async () => {
		const identifier = "https://api.example.com/config-only";
		const { auth, opts } = await bootWithResourcesOption({
			resources: [identifier],
		});
		const ctx = (await auth.$context) as unknown as AuthContext;

		const res = await getResource({ context: ctx } as never, opts, identifier);
		expect(res).toMatchObject({
			identifier,
			name: identifier,
			disabled: false,
			policyVersion: 1,
			accessTokenTtl: null,
			signingAlgorithm: null,
			allowedScopes: null,
		});

		const dbRow = await readResourceRow(auth, identifier);
		expect(dbRow).toBeNull();
	});

	/**
	 * @see https://github.com/better-auth/better-auth/issues/11725
	 */
	it("ensureResourceRow creates a row once and is idempotent sequentially and concurrently", async () => {
		const identifier = "https://api.example.com/ensure-test";
		const { auth, opts } = await bootWithResourcesOption({
			resources: [
				{
					identifier,
					name: "Config Name",
					accessTokenTtl: 450,
				},
			],
		});
		const ctx = (await auth.$context) as unknown as AuthContext;

		// Sequential ensure
		const first = await ensureResourceRow(ctx, opts, identifier);
		expect(first).toMatchObject({
			identifier,
			name: "Config Name",
			accessTokenTtl: 450,
		});

		const second = await ensureResourceRow(ctx, opts, identifier);
		expect(second?.id).toBe(first?.id);

		// Concurrent ensure
		const concurrent = await Promise.all([
			ensureResourceRow(ctx, opts, identifier),
			ensureResourceRow(ctx, opts, identifier),
			ensureResourceRow(ctx, opts, identifier),
			ensureResourceRow(ctx, opts, identifier),
			ensureResourceRow(ctx, opts, identifier),
		]);
		for (const r of concurrent) {
			expect(r?.id).toBe(first?.id);
		}

		const rows = await ctx.adapter.findMany<OAuthResource>({
			model: "oauthResource",
			where: [{ field: "identifier", value: identifier }],
		});
		expect(rows).toHaveLength(1);
	});

	/**
	 * @see https://github.com/better-auth/better-auth/issues/11725
	 */
	it("ensureResourceRow strips __deleted from metadata of configured resources", async () => {
		const identifier = "https://api.example.com/ensure-strip-deleted";
		const { auth, opts } = await bootWithResourcesOption({
			resources: [
				{
					identifier,
					name: "Config With Deleted",
					metadata: { __deleted: true, custom: "kept" },
				},
			],
		});
		const ctx = (await auth.$context) as unknown as AuthContext;

		const ensured = await ensureResourceRow(ctx, opts, identifier);
		expect(ensured).not.toBeNull();
		expect(isResourceTombstoned(ensured)).toBe(false);
		expect(ensured?.metadata).toEqual({ custom: "kept" });

		const row = await readResourceRow(auth, identifier);
		expect(row).not.toBeNull();
		expect(isResourceTombstoned(row)).toBe(false);
		expect(row?.metadata).toEqual({ custom: "kept" });
	});

	/**
	 * @see https://github.com/better-auth/better-auth/issues/11725
	 */
	it("ensureResourceRow normalizes metadata with only __deleted: true to null", async () => {
		const identifier = "https://api.example.com/ensure-only-deleted";
		const { auth, opts } = await bootWithResourcesOption({
			resources: [
				{
					identifier,
					name: "Config Only Deleted",
					metadata: { __deleted: true },
				},
			],
		});
		const ctx = (await auth.$context) as unknown as AuthContext;

		const ensured = await ensureResourceRow(ctx, opts, identifier);
		expect(ensured).not.toBeNull();
		expect(isResourceTombstoned(ensured)).toBe(false);
		expect(ensured?.metadata).toBeNull();

		const row = await readResourceRow(auth, identifier);
		expect(row).not.toBeNull();
		expect(isResourceTombstoned(row)).toBe(false);
		expect(row?.metadata).toBeNull();
	});

	/**
	 * @see https://github.com/better-auth/better-auth/issues/11725
	 */
	it("ensureResourceRow on unknown identifier returns null and creates nothing", async () => {
		const { auth, opts } = await bootWithResourcesOption({
			resources: ["https://api.example.com/known"],
		});
		const ctx = (await auth.$context) as unknown as AuthContext;

		const ensured = await ensureResourceRow(
			ctx,
			opts,
			"https://api.example.com/unknown",
		);
		expect(ensured).toBeNull();

		const rows = await ctx.adapter.findMany<OAuthResource>({
			model: "oauthResource",
		});
		expect(rows).toHaveLength(0);
	});

	/**
	 * @see https://github.com/better-auth/better-auth/issues/11725
	 */
	it("combines per resourceSeedMode: insertOnly, merge, and overwrite", async () => {
		const identifier = "https://api.example.com/mode-test";

		// 1. insertOnly: row wins over config
		{
			const { auth, opts } = await bootWithResourcesOption({
				resources: [{ identifier, name: "Config Name", accessTokenTtl: 600 }],
				resourceSeedMode: "insertOnly",
			});
			const ctx = (await auth.$context) as unknown as AuthContext;
			await ensureResourceRow(ctx, opts, identifier);
			await ctx.adapter.update({
				model: "oauthResource",
				where: [{ field: "identifier", value: identifier }],
				update: { name: "Admin Row Name" },
			});

			const res = await getResource(
				{ context: ctx } as never,
				opts,
				identifier,
			);
			expect(res?.name).toBe("Admin Row Name");
			expect(res?.accessTokenTtl).toBe(600); // from row
		}

		// 2. merge: present config fields override row while other row fields persist
		{
			const { auth, opts } = await bootWithResourcesOption({
				resources: [{ identifier, accessTokenTtl: 120 }],
				resourceSeedMode: "merge",
			});
			const ctx = (await auth.$context) as unknown as AuthContext;
			await ctx.adapter.create({
				model: "oauthResource",
				data: {
					identifier,
					name: "Admin Persistent Name",
					accessTokenTtl: 999,
					allowedScopes: ["scope1", "scope2"],
					disabled: false,
					policyVersion: 1,
					createdAt: new Date(),
					updatedAt: new Date(),
				},
			});

			const res = await getResource(
				{ context: ctx } as never,
				opts,
				identifier,
			);
			expect(res?.name).toBe("Admin Persistent Name");
			expect(res?.accessTokenTtl).toBe(120); // config override
			expect(res?.allowedScopes).toEqual(["scope1", "scope2"]);

			const row = await readResourceRow(auth, identifier);
			expect(row?.accessTokenTtl).toBe(999); // DB row is NOT mutated on read
		}

		// 3. overwrite: config policy replaces row fields while preserving id/timestamps
		{
			const { auth, opts } = await bootWithResourcesOption({
				resources: [{ identifier, accessTokenTtl: 300 }],
				resourceSeedMode: "overwrite",
			});
			const ctx = (await auth.$context) as unknown as AuthContext;
			const created = await ctx.adapter.create<OAuthResource>({
				model: "oauthResource",
				data: {
					identifier,
					name: "Admin Name",
					accessTokenTtl: 999,
					allowedScopes: ["scope1"],
					disabled: false,
					policyVersion: 1,
					createdAt: new Date(1000),
					updatedAt: new Date(2000),
				},
			});

			const res = await getResource(
				{ context: ctx } as never,
				opts,
				identifier,
			);
			expect(res?.name).toBe(identifier); // default name from config
			expect(res?.accessTokenTtl).toBe(300); // config value
			expect(res?.allowedScopes).toBeNull(); // omitted falls back to default
			expect(res?.id).toBe(created?.id);
			expect(res?.createdAt).toEqual(new Date(1000));

			const row = await readResourceRow(auth, identifier);
			expect(row?.accessTokenTtl).toBe(999); // DB row is NOT mutated on read
		}
	});
});

describe("getResource + cache", () => {
	afterEach(() => {
		invalidateResourceCache();
	});

	it("returns config-only resource with ad-hoc options via lazy index", async () => {
		const { auth } = await bootWithResourcesOption({});
		const ctx = (await auth.$context) as unknown as AuthContext;
		const identifier = "https://api.example.com/ad-hoc";

		const row = await getResource(
			{ context: ctx } as never,
			{ resources: [identifier] } as never,
			identifier,
		);
		expect(row?.identifier).toBe(identifier);

		// Config-only entries are never cached in resourceCache
		const findOneSpy = vi.spyOn(ctx.adapter, "findOne");
		const cached = await getResource(
			{ context: ctx } as never,
			{
				resources: [identifier],
				cachedResources: new Set([identifier]),
			} as never,
			identifier,
		);
		expect(cached?.identifier).toBe(identifier);

		// Subsequent read queries the adapter again because config-only entries are not cached
		await getResource(
			{ context: ctx } as never,
			{
				resources: [identifier],
				cachedResources: new Set([identifier]),
			} as never,
			identifier,
		);
		expect(findOneSpy).toHaveBeenCalledTimes(2);
		findOneSpy.mockRestore();

		// Inserting a DB row directly proves no stale config-only entry was cached
		await ctx.adapter.create({
			model: "oauthResource",
			data: {
				identifier,
				name: "Direct DB Row",
				accessTokenTtl: null,
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
			} as never,
		});

		const afterDbInsert = await getResource(
			{ context: ctx } as never,
			{
				resources: [identifier],
				cachedResources: new Set([identifier]),
			} as never,
			identifier,
		);
		expect(afterDbInsert?.name).toBe("Direct DB Row");
	});

	it("handles duplicate identifiers in indexConfiguredResources per resourceSeedMode", () => {
		const identifier = "https://api.example.com/dup";

		// 0. default (resourceSeedMode omitted): fallback to insertOnly where first definition wins
		const defaultMap = indexConfiguredResources({
			resources: [
				{ identifier, name: "First Definition", accessTokenTtl: 300 },
				{ identifier, name: "Second Definition", accessTokenTtl: 600 },
			],
		} as never);
		const defaultEntry = defaultMap.get(identifier);
		expect(defaultEntry?.resource.name).toBe("First Definition");
		expect(defaultEntry?.input.accessTokenTtl).toBe(300);

		// 1. insertOnly (default): first definition wins, preserves earlier object config
		const insertOnlyMap = indexConfiguredResources({
			resources: [
				{ identifier, name: "First Definition", accessTokenTtl: 300 },
				identifier,
			],
			resourceSeedMode: "insertOnly",
		} as never);
		const insertOnlyEntry = insertOnlyMap.get(identifier);
		expect(insertOnlyEntry?.resource.name).toBe("First Definition");
		expect(insertOnlyEntry?.input.accessTokenTtl).toBe(300);

		// 2. merge: merges defined fields into existing entry
		const mergeMap = indexConfiguredResources({
			resources: [
				{ identifier, name: "Initial Name", accessTokenTtl: 300 },
				identifier,
				{ identifier, accessTokenTtl: 600 },
			],
			resourceSeedMode: "merge",
		} as never);
		const mergeEntry = mergeMap.get(identifier);
		expect(mergeEntry?.resource.name).toBe("Initial Name");
		expect(mergeEntry?.input.accessTokenTtl).toBe(600);

		// 3. overwrite: replaces with newer entry
		const overwriteMap = indexConfiguredResources({
			resources: [
				{ identifier, name: "First Definition", accessTokenTtl: 300 },
				{ identifier, name: "Second Definition", accessTokenTtl: 600 },
			],
			resourceSeedMode: "overwrite",
		} as never);
		const overwriteEntry = overwriteMap.get(identifier);
		expect(overwriteEntry?.resource.name).toBe("Second Definition");
		expect(overwriteEntry?.input.accessTokenTtl).toBe(600);
	});

	/**
	 * @see https://github.com/better-auth/better-auth/issues/11725
	 */
	it("caches stored rows only, combines after cache hit, and invalidates on ensureResourceRow", async () => {
		const identifier = "https://api.example.com/cached-ensure";
		const cachedResources = new Set([identifier]);
		const { auth, opts } = await bootWithResourcesOption({
			resources: [identifier],
			cachedResources,
		});
		const ctx = (await auth.$context) as unknown as AuthContext;

		// 1. Initial read is config-only (not cached)
		const first = await getResource(
			{ context: ctx } as never,
			opts,
			identifier,
		);
		expect(first?.identifier).toBe(identifier);

		// 2. ensureResourceRow inserts row and invalidates cache
		const createdRow = await ensureResourceRow(ctx, opts, identifier);
		expect(createdRow?.identifier).toBe(identifier);

		// 3. Read populates row into cache
		const second = await getResource(
			{ context: ctx } as never,
			opts,
			identifier,
		);
		expect(second?.name).toBe(identifier);

		// 4. Directly update the row in DB
		await ctx.adapter.update({
			model: "oauthResource",
			where: [{ field: "identifier", value: identifier }],
			update: { name: "Direct DB Mutated" },
		});

		// 5. Cache hit returns old row name
		const cachedRead = await getResource(
			{ context: ctx } as never,
			opts,
			identifier,
		);
		expect(cachedRead?.name).toBe(identifier);

		// 6. Invalidation causes next read to see fresh row
		invalidateResourceCache(identifier);
		const freshRead = await getResource(
			{ context: ctx } as never,
			opts,
			identifier,
		);
		expect(freshRead?.name).toBe("Direct DB Mutated");
	});
});

describe("isResourceTombstoned", () => {
	function makeResource(metadata?: unknown): OAuthResource {
		return {
			id: "1",
			identifier: "https://api.example.com",
			name: "res",
			disabled: false,
			policyVersion: 1,
			createdAt: new Date(),
			updatedAt: new Date(),
			metadata: metadata as Record<string, unknown> | null,
		};
	}

	it("returns false for null, undefined, or missing metadata", () => {
		expect(isResourceTombstoned(null)).toBe(false);
		expect(isResourceTombstoned(undefined)).toBe(false);
		expect(isResourceTombstoned(makeResource())).toBe(false);
		expect(isResourceTombstoned(makeResource(null))).toBe(false);
	});

	it("returns true for own-property __deleted: true", () => {
		expect(isResourceTombstoned(makeResource({ __deleted: true }))).toBe(true);
		expect(
			isResourceTombstoned(makeResource(JSON.stringify({ __deleted: true }))),
		).toBe(true);
	});

	it("returns false for non-boolean or false __deleted", () => {
		expect(isResourceTombstoned(makeResource({ __deleted: false }))).toBe(
			false,
		);
		expect(isResourceTombstoned(makeResource({ __deleted: 1 }))).toBe(false);
	});

	it("guards against prototype pollution where __deleted is on prototype chain", () => {
		const proto = { __deleted: true };
		const pollutedObj = Object.create(proto);

		expect(pollutedObj.__deleted).toBe(true);
		expect(isResourceTombstoned(makeResource(pollutedObj))).toBe(false);
	});
});

/**
 * @see https://github.com/better-auth/better-auth/issues/11725
 */
describe("omitDeleted", () => {
	it("returns null for falsy or invalid input", () => {
		expect(omitDeleted(null)).toBeNull();
		expect(omitDeleted(undefined)).toBeNull();
		expect(omitDeleted("")).toBeNull();
		expect(omitDeleted("not json")).toBeNull();
		expect(omitDeleted([])).toBeNull();
		expect(omitDeleted(123)).toBeNull();
	});

	it("strips __deleted and keeps remaining keys", () => {
		expect(omitDeleted({ __deleted: true, a: 1 })).toEqual({ a: 1 });
		expect(omitDeleted(JSON.stringify({ __deleted: true, a: 1 }))).toEqual({
			a: 1,
		});
	});

	it("returns null if only __deleted was present", () => {
		expect(omitDeleted({ __deleted: true })).toBeNull();
		expect(omitDeleted(JSON.stringify({ __deleted: true }))).toBeNull();
	});
});

/**
 * @see https://github.com/better-auth/better-auth/issues/11725
 */
describe("combineResource", () => {
	const baseRow: OAuthResource = {
		id: "row-1",
		identifier: "https://api.example.com",
		name: "DB Resource",
		disabled: false,
		policyVersion: 1,
		createdAt: new Date(1000),
		updatedAt: new Date(2000),
		metadata: { rowField: "present" },
	};

	it("sanitizes __deleted from metadata in merge mode so it is omitted and not tombstoned", () => {
		const entry = {
			input: {
				identifier: "https://api.example.com",
				metadata: { __deleted: true, custom: "kept" },
			},
			resource: {
				...baseRow,
				metadata: { custom: "kept" },
			},
			validation: null,
			invalid: false,
		};

		const combined = combineResource(baseRow, entry, "merge");
		expect(combined.metadata).toEqual({ custom: "kept" });
		expect(isResourceTombstoned(combined)).toBe(false);
	});

	it("normalizes metadata with only __deleted: true to null in merge mode", () => {
		const entry = {
			input: {
				identifier: "https://api.example.com",
				metadata: { __deleted: true },
			},
			resource: {
				...baseRow,
				metadata: null,
			},
			validation: null,
			invalid: false,
		};

		const combined = combineResource(baseRow, entry, "merge");
		expect(combined.metadata).toBeNull();
		expect(isResourceTombstoned(combined)).toBe(false);
	});

	it("sanitizes __deleted from metadata in overwrite mode", () => {
		const entry = {
			input: {
				identifier: "https://api.example.com",
				metadata: { __deleted: true, overwriteField: "val" },
			},
			resource: {
				...baseRow,
				name: "Overwrite Name",
				metadata: { __deleted: true, overwriteField: "val" },
			},
			validation: null,
			invalid: false,
		};

		const combined = combineResource(baseRow, entry, "overwrite");
		expect(combined.metadata).toEqual({ overwriteField: "val" });
		expect(isResourceTombstoned(combined)).toBe(false);
	});
});
