import type { BetterAuthOptions } from "@better-auth/core";
import type { SecondaryStorage } from "@better-auth/core/db";
import { getTestInstance } from "better-auth/test";
import { describe, expect, it, vi } from "vitest";
import { apiKey, defaultKeyHasher, migrateSecondaryStorageApiKeys } from ".";

async function createWriters() {
	const store = new Map<string, string>();
	let interleave = false;
	let refReads = 0;
	const bothRead = Promise.withResolvers<void>();
	const listWritten = Promise.withResolvers<void>();
	let cacheWrites = 0;
	const bothWrote = Promise.withResolvers<void>();
	async function interleaveCacheWrites(key: string) {
		if (
			interleave &&
			key.startsWith("api-key:") &&
			!key.startsWith("api-key:by-ref:")
		) {
			if (++cacheWrites === 2) bothWrote.resolve();
			await bothWrote.promise;
		}
	}

	const storage: SecondaryStorage = {
		async get(key) {
			const snapshot = store.get(key) ?? null;
			if (interleave && key.startsWith("api-key:by-ref:")) {
				if (++refReads === 2) bothRead.resolve();
				await bothRead.promise;
			}
			return snapshot;
		},
		async set(key, value) {
			await interleaveCacheWrites(key);
			store.set(key, value);
			if (interleave && key.startsWith("api-key:by-ref:")) {
				listWritten.resolve();
			}
		},
		async delete(key) {
			await interleaveCacheWrites(key);
			if (interleave && key.startsWith("api-key:by-ref:")) {
				await listWritten.promise;
			}
			store.delete(key);
		},
		getAndDelete(key) {
			const value = store.get(key) ?? null;
			store.delete(key);
			return value;
		},
		increment(key) {
			const value = Number(store.get(key) ?? 0) + 1;
			store.set(key, String(value));
			return value;
		},
	};

	const { apiKey } = await import("./index");
	const { auth: first, signInWithTestUser } = await getTestInstance({
		plugins: [apiKey({ storage: "secondary-storage", customStorage: storage })],
	});
	const { headers } = await signInWithTestUser();
	const options: BetterAuthOptions = first.options;
	// Reload the plugin so each writer has its own module-level state.
	vi.resetModules();
	const { apiKey: secondApiKey } = await import("./index");
	const { auth: second } = await getTestInstance(
		{
			database: options.database,
			plugins: [
				secondApiKey({ storage: "secondary-storage", customStorage: storage }),
			],
		},
		{ disableTestUser: true },
	);

	return {
		first,
		second,
		headers,
		interleaveReferenceWrites() {
			interleave = true;
		},
		list: async () => {
			interleave = false;
			return first.api.listApiKeys({ headers });
		},
	};
}

/** @see https://github.com/better-auth/better-auth/pull/10000 */
describe("listing API keys across instances", () => {
	it("lists both keys after concurrent creates", async () => {
		const { first, second, headers, interleaveReferenceWrites, list } =
			await createWriters();
		interleaveReferenceWrites();
		const [a, b] = await Promise.all([
			first.api.createApiKey({ headers, body: { name: "first" } }),
			second.api.createApiKey({ headers, body: { name: "second" } }),
		]);

		const result = await list();
		expect(result.total).toBe(2);
		expect(result.apiKeys.map((key) => key.id).sort()).toEqual(
			[a.id, b.id].sort(),
		);
	});

	it("lists the new key when a create races a delete", async () => {
		const { first, second, headers, interleaveReferenceWrites, list } =
			await createWriters();
		const old = await first.api.createApiKey({ headers, body: {} });
		interleaveReferenceWrites();
		const [deleted, created] = await Promise.all([
			first.api.deleteApiKey({ headers, body: { keyId: old.id } }),
			second.api.createApiKey({ headers, body: {} }),
		]);

		expect(deleted.success).toBe(true);
		const result = await list();
		expect(result.total).toBe(1);
		expect(result.apiKeys.map((key) => key.id)).toEqual([created.id]);
	});
});

/** @see https://github.com/better-auth/better-auth/issues/12874 */
it.each(["database", "secondary-storage"] as const)(
	"lists every page beyond the adapter default in %s mode",
	async (storage) => {
		const { auth, signInWithTestUser } = await getTestInstance({
			advanced: { database: { defaultFindManyLimit: 2 } },
			plugins: [apiKey({ storage })],
		});
		const { headers } = await signInWithTestUser();
		let lastId: string | undefined;
		for (const name of ["first", "second", "third"]) {
			const { id } = await auth.api.createApiKey({ headers, body: { name } });
			lastId = id;
		}

		const all = await auth.api.listApiKeys({ headers });
		expect(all.total).toBe(3);
		expect(all.apiKeys).toHaveLength(3);
		const page = await auth.api.listApiKeys({
			headers,
			query: { sortBy: "name", offset: 2, limit: 1 },
		});
		expect(page.total).toBe(3);
		expect(page.apiKeys.map(({ id }) => id)).toEqual([lastId]);
	},
);

/** @see https://github.com/better-auth/better-auth/issues/12874 */
it("paginates default keys with adapters that reject null configuration filters", async () => {
	const { auth, signInWithTestUser } = await getTestInstance({
		advanced: { database: { defaultFindManyLimit: 1 } },
		plugins: [apiKey([{ configId: "default" }, { configId: "other" }])],
	});
	const { headers } = await signInWithTestUser();
	await auth.api.createApiKey({ headers, body: { name: "A" } });
	await auth.api.createApiKey({
		headers,
		body: { name: "B", configId: "other" },
	});
	const thirdKey = await auth.api.createApiKey({
		headers,
		body: { name: "C" },
	});

	const { adapter } = await auth.$context;
	const originalAdapterId = adapter.id;
	adapter.id = "prisma";
	const count = adapter.count.bind(adapter);
	const countSpy = vi.spyOn(adapter, "count").mockImplementation((options) => {
		if (
			options.where?.some(
				({ field, value }) => field === "configId" && value === null,
			)
		) {
			throw new Error("configId is required");
		}
		return count(options);
	});
	try {
		const result = await auth.api.listApiKeys({
			headers,
			query: { configId: "default", sortBy: "name", offset: 1, limit: 1 },
		});

		expect(result.total).toBe(2);
		expect(result.apiKeys.map(({ id }) => id)).toEqual([thirdKey.id]);
	} finally {
		countSpy.mockRestore();
		adapter.id = originalAdapterId;
	}
});

/** @see https://github.com/better-auth/better-auth/issues/12874 */
it("includes the full result when a key is created between counting and reading", async () => {
	const { first, second, headers } = await createWriters();
	const old = await first.api.createApiKey({
		headers,
		body: { name: "second" },
	});
	const { adapter } = await first.$context;
	const count = adapter.count.bind(adapter);
	let createdId: string | undefined;
	vi.spyOn(adapter, "count").mockImplementationOnce(async (options) => {
		const total = await count(options);
		const key = await second.api.createApiKey({
			headers,
			body: { name: "first" },
		});
		createdId = key.id;
		return total;
	});

	const listed = await first.api.listApiKeys({
		headers,
		query: { sortBy: "name" },
	});
	expect(createdId).toBeDefined();
	expect(listed.apiKeys.map(({ id }) => id)).toEqual([createdId, old.id]);
});

/** @see https://github.com/better-auth/better-auth/pull/10000 */
it.each([undefined, "serial"] as const)(
	"imports legacy keys with generateId %s",
	async (generateId) => {
		const { auth, signInWithTestUser } = await getTestInstance({
			advanced: { database: { generateId } },
			plugins: [
				apiKey([
					{
						configId: "default",
						storage: "secondary-storage",
						enableMetadata: true,
					},
					{ configId: "database-backed" },
				]),
			],
		});
		const { headers, user } = await signInWithTestUser();
		const now = new Date().toISOString();
		const entries = new Map<string, unknown>([
			[`api-key:by-ref:${user.id}`, JSON.stringify(["listed"])],
		]);
		const credentials = new Map<string, string>();
		for (const id of [
			"listed",
			"missing-from-list",
			"expired",
			"stale-copy",
			"database-cache",
		]) {
			const key = `legacy-test-key-${id}`;
			const hash = await defaultKeyHasher(key);
			const record = {
				id,
				name: id,
				referenceId: user.id,
				configId: id === "database-cache" ? "database-backed" : "default",
				key: hash,
				createdAt: now,
				updatedAt: now,
				expiresAt: id === "expired" ? "2020-01-01T00:00:00Z" : null,
				enabled: true,
				remaining: 2,
				rateLimitEnabled: false,
				metadata: { since: "2025-06-01T00:00:00Z" },
				permissions: JSON.stringify({ files: ["read"] }),
			};
			entries.set(`api-key:by-id:${id}`, JSON.stringify(record));
			if (id !== "stale-copy") {
				entries.set(
					`api-key:${hash}`,
					id === "listed" ? JSON.stringify(record) : record,
				);
			}
			credentials.set(id, key);
		}

		expect(await auth.api.listApiKeys({ headers })).toMatchObject({ total: 0 });
		expect(await migrateSecondaryStorageApiKeys({ auth, entries })).toBe(2);
		expect(await migrateSecondaryStorageApiKeys({ auth, entries })).toBe(0);

		const result = await auth.api.listApiKeys({ headers });
		expect(result.total).toBe(2);
		expect(result.apiKeys.map(({ name }) => name).sort()).toEqual([
			"listed",
			"missing-from-list",
		]);
		for (const id of ["listed", "missing-from-list"]) {
			const key = credentials.get(id)!;
			const verified = await auth.api.verifyApiKey({
				body: { key, permissions: { files: ["read"] } },
			});
			expect(verified.valid).toBe(true);
			expect(verified.key?.id).toBe(
				result.apiKeys.find(({ name }) => name === id)?.id,
			);
			if (generateId !== "serial") expect(verified.key?.id).toBe(id);
			expect(verified.key).toMatchObject({
				name: id,
				remaining: 1,
				metadata: { since: "2025-06-01T00:00:00Z" },
			});
		}
	},
);
